import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { UnauthorizedError } from "@/server/auth/session";
import { logger, correlationId } from "@/server/logger";

/** Deep-convert BigInt -> string so responses are JSON-serializable. */
function serialize<T>(data: T): T {
  return JSON.parse(
    JSON.stringify(data, (_k, v) => (typeof v === "bigint" ? v.toString() : v)),
  );
}

export function json<T>(data: T, init?: ResponseInit) {
  return NextResponse.json(serialize(data), init);
}

export function ok<T>(data: T) {
  return NextResponse.json({ ok: true, data: serialize(data) });
}

/**
 * Wrap an API handler with uniform error handling. Never leaks stack traces;
 * returns a safe message plus a correlation id the user can quote to support.
 */
export function withErrors(
  handler: () => Promise<Response>,
): Promise<Response> {
  return handler().catch((err) => {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json(
        { ok: false, error: "Unauthorized" },
        { status: 401 },
      );
    }
    if (err instanceof ZodError) {
      return NextResponse.json(
        {
          ok: false,
          error: "Validation failed",
          details: err.issues.map((i) => ({
            path: i.path.join("."),
            message: i.message,
          })),
        },
        { status: 400 },
      );
    }
    if (err instanceof ApiError) {
      return NextResponse.json(
        { ok: false, error: err.message },
        { status: err.status },
      );
    }
    const cid = correlationId();
    logger.error("api_unhandled", { cid, message: (err as Error).message });
    return NextResponse.json(
      {
        ok: false,
        error: "Something went wrong while processing this request.",
        executionId: cid,
      },
      { status: 500 },
    );
  });
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}
