import { describe, it, expect } from "vitest";
import { normalizeEvent, sanitizePayload } from "@/server/webhook/normalize";

describe("event normalization", () => {
  it("normalizes an issues payload", () => {
    const n = normalizeEvent("issues", {
      action: "opened",
      repository: { id: 1, name: "demo", full_name: "octo/demo", owner: { login: "octo" } },
      sender: { login: "octo" },
      issue: {
        number: 7,
        title: "Bug: crash",
        body: "details",
        user: { login: "reporter" },
        labels: [{ name: "bug" }, { name: "P1" }],
        html_url: "https://github.com/octo/demo/issues/7",
      },
    });
    expect(n.number).toBe(7);
    expect(n.title).toBe("Bug: crash");
    expect(n.authorLogin).toBe("reporter");
    expect(n.labels).toEqual(["bug", "P1"]);
    expect(n.repositoryFullName).toBe("octo/demo");
  });

  it("detects merged PRs", () => {
    const n = normalizeEvent("pull_request", {
      action: "closed",
      repository: { full_name: "octo/demo", owner: { login: "octo" } },
      pull_request: { number: 3, title: "Fix", merged: true, user: { login: "dev" }, labels: [] },
    });
    expect(n.merged).toBe(true);
  });

  it("summarizes push events", () => {
    const n = normalizeEvent("push", {
      repository: { full_name: "octo/demo", owner: { login: "octo" } },
      ref: "refs/heads/main",
      commits: [{}, {}, {}],
      pusher: { name: "dev" },
    });
    expect(n.commitCount).toBe(3);
    expect(n.ref).toBe("refs/heads/main");
  });

  it("sanitizes and clips long bodies", () => {
    const long = "x".repeat(5000);
    const n = normalizeEvent("issues", {
      action: "opened",
      repository: { full_name: "octo/demo", owner: { login: "octo" } },
      issue: { number: 1, title: "t", body: long, user: { login: "u" }, labels: [] },
    });
    const s = sanitizePayload("issues", n);
    expect((s.body as string).length).toBeLessThanOrEqual(2001);
    // sanitized payload must not carry raw nested GitHub objects
    expect(s).not.toHaveProperty("issue");
  });
});
