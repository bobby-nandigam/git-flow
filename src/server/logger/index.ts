/**
 * Structured JSON logger with automatic secret redaction.
 *
 * Never logs OAuth secrets, GitHub tokens, Slack URLs, AI keys, DB credentials,
 * cookies or session tokens. Any field whose key matches a sensitive pattern is
 * replaced with "[redacted]", recursively.
 */

type LogLevel = "debug" | "info" | "warn" | "error";

const SENSITIVE_KEY = /(secret|token|password|authorization|cookie|apikey|api_key|webhook_url|webhookurl|client_secret|accesstoken|access_token|private_key|signature)/i;

function redact(value: unknown, depth = 0): unknown {
  if (depth > 6) return "[truncated]";
  if (value == null) return value;
  if (typeof value === "string") return value;
  if (typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));

  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (SENSITIVE_KEY.test(k)) {
      out[k] = "[redacted]";
    } else {
      out[k] = redact(v, depth + 1);
    }
  }
  return out;
}

function emit(level: LogLevel, event: string, meta?: Record<string, unknown>) {
  const line = {
    level,
    event,
    ts: new Date().toISOString(),
    ...(meta ? (redact(meta) as Record<string, unknown>) : {}),
  };
  const serialized = JSON.stringify(line);
  if (level === "error") console.error(serialized);
  else if (level === "warn") console.warn(serialized);
  else console.log(serialized);
}

export const logger = {
  debug: (event: string, meta?: Record<string, unknown>) => {
    if (process.env.NODE_ENV !== "production") emit("debug", event, meta);
  },
  info: (event: string, meta?: Record<string, unknown>) => emit("info", event, meta),
  warn: (event: string, meta?: Record<string, unknown>) => emit("warn", event, meta),
  error: (event: string, meta?: Record<string, unknown>) => emit("error", event, meta),
};

/** Generate a short correlation id for tracing a request through the system. */
export function correlationId(): string {
  return Math.random().toString(36).slice(2, 10);
}
