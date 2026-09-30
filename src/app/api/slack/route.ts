import { z } from "zod";
import { prisma } from "@/server/database/prisma";
import { requireUserId } from "@/server/auth/session";
import { ok, withErrors, ApiError } from "@/server/http";
import { encryptSecret, decryptSecret } from "@/server/security/crypto";
import { sendSlackNotification } from "@/server/slack/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** List Slack integrations. The webhook URL is NEVER returned — only a mask. */
export async function GET() {
  return withErrors(async () => {
    const userId = await requireUserId();
    const integrations = await prisma.slackIntegration.findMany({
      where: { userId },
      select: {
        id: true,
        repositoryId: true,
        enabled: true,
        createdAt: true,
        webhookUrlEnc: false,
      },
    });
    return ok(
      integrations.map((i) => ({ ...i, webhookUrl: "•••• configured" })),
    );
  });
}

const postSchema = z.object({
  webhookUrl: z
    .string()
    .url()
    .refine((u) => u.startsWith("https://hooks.slack.com/"), {
      message: "Must be a Slack Incoming Webhook URL (https://hooks.slack.com/…)",
    }),
  repositoryId: z.string().nullish(),
  enabled: z.boolean().default(true),
  sendTest: z.boolean().default(false),
});

/** Create/update a Slack integration (per-repo or account default). */
export async function POST(req: Request) {
  return withErrors(async () => {
    const userId = await requireUserId();
    const input = postSchema.parse(await req.json());

    if (input.repositoryId) {
      const repo = await prisma.repository.findUnique({
        where: { id: input.repositoryId },
        select: { userId: true },
      });
      if (!repo || repo.userId !== userId)
        throw new ApiError("Repository not found", 404);
    }

    const enc = encryptSecret(input.webhookUrl);
    const repositoryId = input.repositoryId ?? null;

    const existing = await prisma.slackIntegration.findFirst({
      where: { userId, repositoryId },
    });
    const saved = existing
      ? await prisma.slackIntegration.update({
          where: { id: existing.id },
          data: { webhookUrlEnc: enc, enabled: input.enabled },
        })
      : await prisma.slackIntegration.create({
          data: { userId, repositoryId, webhookUrlEnc: enc, enabled: input.enabled },
        });

    let testResult: { ok: boolean; error?: string } | undefined;
    if (input.sendTest) {
      try {
        await sendSlackNotification(decryptSecret(saved.webhookUrlEnc), {
          repositoryFullName: "GitFlow Automator",
          eventLabel: "Test notification",
          ruleName: "Slack connection test",
          actions: ["✓ Slack is configured correctly"],
        });
        testResult = { ok: true };
      } catch (err) {
        testResult = { ok: false, error: (err as Error).message };
      }
    }

    return ok({ id: saved.id, enabled: saved.enabled, testResult });
  });
}

/** Delete a Slack integration by id (ownership-checked). */
export async function DELETE(req: Request) {
  return withErrors(async () => {
    const userId = await requireUserId();
    const id = new URL(req.url).searchParams.get("id");
    if (!id) throw new ApiError("Missing id", 400);
    const existing = await prisma.slackIntegration.findUnique({ where: { id } });
    if (!existing || existing.userId !== userId)
      throw new ApiError("Integration not found", 404);
    await prisma.slackIntegration.delete({ where: { id } });
    return ok({ deleted: true });
  });
}
