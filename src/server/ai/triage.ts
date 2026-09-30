import { z } from "zod";
import { env } from "@/lib/env";
import { logger } from "@/server/logger";

/**
 * AI triage service. Optional by design: if unconfigured or failing, the caller
 * marks the AI action FAILED/SKIPPED and continues — the event is never lost.
 *
 * Supports Google Gemini and Groq, both free-tier, no credit card. Output is
 * strictly validated with Zod before use — we never trust the model blindly.
 */

export const triageResultSchema = z.object({
  summary: z.string().max(1000),
  category: z.enum(["bug", "feature", "question", "documentation", "other"]),
  priority: z.enum(["low", "medium", "high", "critical"]),
  suggestedLabel: z.string().max(50),
  reason: z.string().max(500),
});

export type TriageResult = z.infer<typeof triageResultSchema>;

export class AiError extends Error {
  retryable: boolean;
  constructor(message: string, retryable: boolean) {
    super(message);
    this.name = "AiError";
    this.retryable = retryable;
  }
}

interface TriageInput {
  kind: "issue" | "pull_request";
  title: string;
  body: string;
  repository: string;
}

const SYSTEM_PROMPT = `You are a GitHub triage assistant. Given an issue or pull request, respond with ONLY a JSON object matching this exact schema (no markdown, no prose):
{
  "summary": "one or two sentence plain-language summary",
  "category": "bug" | "feature" | "question" | "documentation" | "other",
  "priority": "low" | "medium" | "high" | "critical",
  "suggestedLabel": "a short single-word label",
  "reason": "brief justification for the category and priority"
}`;

function buildUserPrompt(input: TriageInput): string {
  return `Repository: ${input.repository}
Type: ${input.kind}
Title: ${input.title}
Body:
${(input.body || "(no description provided)").slice(0, 4000)}`;
}

/** Extract the first JSON object from a possibly-noisy model response. */
function extractJson(text: string): unknown {
  const trimmed = text.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "");
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start === -1 || end === -1) {
    throw new AiError("AI response contained no JSON object", false);
  }
  return JSON.parse(trimmed.slice(start, end + 1));
}

async function callGemini(input: TriageInput): Promise<unknown> {
  const model = env.GEMINI_MODEL;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${env.GEMINI_API_KEY}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: [{ role: "user", parts: [{ text: buildUserPrompt(input) }] }],
      generationConfig: {
        temperature: 0.2,
        responseMimeType: "application/json",
      },
    }),
  });
  if (!res.ok) {
    const retryable = res.status === 429 || res.status >= 500;
    throw new AiError(`Gemini API ${res.status}`, retryable);
  }
  const json = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  const text = json.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  return extractJson(text);
}

async function callGroq(input: TriageInput): Promise<unknown> {
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model: env.GROQ_MODEL,
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: buildUserPrompt(input) },
      ],
    }),
  });
  if (!res.ok) {
    const retryable = res.status === 429 || res.status >= 500;
    throw new AiError(`Groq API ${res.status}`, retryable);
  }
  const json = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const text = json.choices?.[0]?.message?.content ?? "";
  return extractJson(text);
}

export function isAiEnabled(): boolean {
  return env.isAiConfigured;
}

export async function runTriage(input: TriageInput): Promise<TriageResult> {
  if (!env.isAiConfigured) {
    throw new AiError("AI provider not configured", false);
  }

  const raw =
    env.AI_PROVIDER === "groq" ? await callGroq(input) : await callGemini(input);

  const parsed = triageResultSchema.safeParse(raw);
  if (!parsed.success) {
    // Model returned malformed structure — do NOT use it.
    logger.warn("ai_invalid_output", { issues: parsed.error.issues.length });
    throw new AiError("AI returned output that failed schema validation", false);
  }
  return parsed.data;
}
