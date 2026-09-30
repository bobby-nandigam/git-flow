import { logger } from "@/server/logger";

export class SlackError extends Error {
  retryable: boolean;
  status: number;
  constructor(message: string, status: number, retryable: boolean) {
    super(message);
    this.name = "SlackError";
    this.status = status;
    this.retryable = retryable;
  }
}

export interface SlackBlock {
  repositoryFullName: string;
  eventLabel: string; // e.g. "Issue opened"
  title?: string;
  author?: string;
  ruleName: string;
  actions: string[]; // e.g. ["✓ Added bug label", "✓ AI triage completed"]
  priority?: string;
  url?: string;
}

/**
 * Post a formatted notification to a Slack Incoming Webhook.
 * The webhook URL is a secret — it is never logged here or anywhere.
 */
export async function sendSlackNotification(
  webhookUrl: string,
  data: SlackBlock,
): Promise<void> {
  const lines = [
    `*GitHub Automation Alert*`,
    `*Repository:* ${data.repositoryFullName}`,
    `*Event:* ${data.eventLabel}`,
  ];
  if (data.title) lines.push(`*Title:* ${data.title}`);
  if (data.author) lines.push(`*Author:* ${data.author}`);
  lines.push(`*Rule:* ${data.ruleName}`);
  if (data.actions.length) lines.push(`*Actions:*\n${data.actions.join("\n")}`);
  if (data.priority) lines.push(`*Priority:* ${data.priority}`);

  const body = {
    text: lines.join("\n"),
    blocks: [
      {
        type: "section",
        text: { type: "mrkdwn", text: lines.join("\n") },
      },
      ...(data.url
        ? [
            {
              type: "actions",
              elements: [
                {
                  type: "button",
                  text: { type: "plain_text", text: "View on GitHub" },
                  url: data.url,
                },
              ],
            },
          ]
        : []),
    ],
  };

  let res: Response;
  try {
    res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch (err) {
    throw new SlackError(
      `Slack network error: ${(err as Error).message}`,
      0,
      true,
    );
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    // 429 and 5xx are retryable; 4xx (e.g. invalid/expired webhook) are not.
    const retryable = res.status === 429 || res.status >= 500;
    logger.warn("slack_error", { status: res.status, retryable });
    throw new SlackError(
      `Slack responded ${res.status}: ${text.slice(0, 120)}`,
      res.status,
      retryable,
    );
  }
}
