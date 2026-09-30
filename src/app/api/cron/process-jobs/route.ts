import { NextResponse } from "next/server";
import { runWorker } from "@/server/queue/worker";
import { logger } from "@/server/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Job sweep. Driven by Vercel Cron (see vercel.json) and callable by an external
 * free scheduler (e.g. cron-job.org) as a fallback for sub-daily retries on the
 * Hobby plan. Protected by a bearer token so it can't be invoked publicly.
 *
 * Auth: either Vercel Cron's own header, or `Authorization: Bearer <WORKER_SECRET>`.
 */
async function handle(req: Request) {
  const auth = req.headers.get("authorization");
  const isVercelCron = req.headers.get("x-vercel-cron") === "1";
  const expected = `Bearer ${process.env.WORKER_SECRET ?? ""}`;

  if (!isVercelCron && (!process.env.WORKER_SECRET || auth !== expected)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const processed = await runWorker({ max: 25 });
  logger.info("cron_sweep", { processed });
  return NextResponse.json({ ok: true, processed });
}

export async function GET(req: Request) {
  return handle(req);
}
export async function POST(req: Request) {
  return handle(req);
}
