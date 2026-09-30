import { Prisma } from "@prisma/client";
import { prisma } from "@/server/database/prisma";

/** Append a human-readable entry to an event's execution timeline. */
export async function addTimeline(
  webhookEventId: string,
  kind: string,
  message: string,
  meta?: Record<string, unknown>,
): Promise<void> {
  await prisma.timelineEntry.create({
    data: {
      webhookEventId,
      kind,
      message,
      meta: (meta ?? undefined) as Prisma.InputJsonValue | undefined,
    },
  });
}
