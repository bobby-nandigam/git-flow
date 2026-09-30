/**
 * Centralised, validated access to environment variables.
 *
 * We deliberately do NOT throw at module-import time for optional integration
 * secrets (Slack / AI) so the core webhook + automation flow keeps working even
 * when those are unconfigured. Required secrets are validated lazily where used,
 * with clear error messages.
 */

function required(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === "") {
    throw new Error(
      `Missing required environment variable: ${name}. See .env.example.`,
    );
  }
  return value;
}

function optional(name: string, fallback = ""): string {
  return process.env[name]?.trim() || fallback;
}

export const env = {
  // Required at runtime for the DB + auth to work at all.
  get DATABASE_URL() {
    return required("DATABASE_URL");
  },
  get AUTH_SECRET() {
    return required("AUTH_SECRET");
  },
  get GITHUB_CLIENT_ID() {
    return required("GITHUB_CLIENT_ID");
  },
  get GITHUB_CLIENT_SECRET() {
    return required("GITHUB_CLIENT_SECRET");
  },
  get GITHUB_WEBHOOK_SECRET() {
    return required("GITHUB_WEBHOOK_SECRET");
  },
  get WORKER_SECRET() {
    return required("WORKER_SECRET");
  },

  // Optional integrations.
  AI_PROVIDER: optional("AI_PROVIDER", "none") as "gemini" | "groq" | "none",
  GEMINI_API_KEY: optional("GEMINI_API_KEY"),
  GEMINI_MODEL: optional("GEMINI_MODEL", "gemini-1.5-flash"),
  GROQ_API_KEY: optional("GROQ_API_KEY"),
  GROQ_MODEL: optional("GROQ_MODEL", "llama-3.3-70b-versatile"),
  SLACK_WEBHOOK_URL: optional("SLACK_WEBHOOK_URL"),

  APP_PUBLIC_URL: optional("APP_PUBLIC_URL", optional("AUTH_URL", "http://localhost:3000")),

  get isAiConfigured(): boolean {
    if (this.AI_PROVIDER === "gemini") return Boolean(this.GEMINI_API_KEY);
    if (this.AI_PROVIDER === "groq") return Boolean(this.GROQ_API_KEY);
    return false;
  },
};
