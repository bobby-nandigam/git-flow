import { describe, it, expect, vi, beforeEach } from "vitest";

// --- Mocks (hoisted so they exist before the mocked modules load) ------------
const m = vi.hoisted(() => ({
  actionCreate: vi.fn(),
  actionUpdate: vi.fn(),
  timelineCreate: vi.fn(),
  getIssueLabels: vi.fn(),
  addIssueLabels: vi.fn(),
}));

vi.mock("@/server/database/prisma", () => ({
  prisma: {
    actionExecution: { create: m.actionCreate, update: m.actionUpdate },
    timelineEntry: { create: m.timelineCreate },
  },
}));

vi.mock("@/server/github/client", () => ({
  getIssueLabels: m.getIssueLabels,
  addIssueLabels: m.addIssueLabels,
  createIssueComment: vi.fn(),
  GitHubError: class GitHubError extends Error {},
}));

import {
  runLabelAction,
  type ExecContext,
  type SharedState,
} from "@/server/automation/action-executor";

function ctx(): ExecContext {
  return {
    webhookEventId: "we1",
    executionId: "ex1",
    userId: "u1",
    repoOwner: "octo",
    repoName: "demo",
    repoFullName: "octo/demo",
    repositoryId: "repo1",
    issueNumber: 7,
    normalized: { githubEvent: "issues", labels: [] },
    eventLabel: "Issue opened",
    ruleName: "Bug automation",
    getToken: async () => "token",
  };
}

describe("GitHub label action idempotency", () => {
  beforeEach(() => {
    m.actionCreate.mockReset().mockResolvedValue({ id: "action-1" });
    m.actionUpdate.mockReset().mockResolvedValue({});
    m.timelineCreate.mockReset().mockResolvedValue({});
    m.getIssueLabels.mockReset();
    m.addIssueLabels.mockReset().mockResolvedValue(undefined);
  });

  it("adds the label when it is not already present", async () => {
    m.getIssueLabels.mockResolvedValueOnce([]);
    const state: SharedState = { ai: null, summaries: [] };
    await runLabelAction(ctx(), state, "bug");
    expect(m.addIssueLabels).toHaveBeenCalledTimes(1);
    expect(m.actionUpdate.mock.calls.at(-1)?.[0].data.status).toBe("SUCCESS");
  });

  it("does NOT add the label when it already exists (skips)", async () => {
    m.getIssueLabels.mockResolvedValueOnce(["Bug"]); // case-insensitive match
    const state: SharedState = { ai: null, summaries: [] };
    await runLabelAction(ctx(), state, "bug");
    expect(m.addIssueLabels).not.toHaveBeenCalled();
    expect(m.actionUpdate.mock.calls.at(-1)?.[0].data.status).toBe("SKIPPED");
  });

  it("skips when there is no issue/PR number (e.g. push events)", async () => {
    const c = ctx();
    c.issueNumber = undefined;
    const state: SharedState = { ai: null, summaries: [] };
    await runLabelAction(c, state, "bug");
    expect(m.getIssueLabels).not.toHaveBeenCalled();
    expect(m.addIssueLabels).not.toHaveBeenCalled();
  });
});
