import { NextResponse } from "next/server";
import { prisma } from "@/server/database/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Liveness + DB connectivity probe. Exposes no sensitive configuration. */
export async function GET() {
  let database = "disconnected";
  try {
    await prisma.$queryRawUnsafe("SELECT 1");
    database = "connected";
  } catch {
    database = "disconnected";
  }
  const status = database === "connected" ? "ok" : "degraded";
  return NextResponse.json(
    { status, database, time: new Date().toISOString() },
    { status: status === "ok" ? 200 : 503 },
  );
}
