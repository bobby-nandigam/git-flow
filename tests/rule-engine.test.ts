import { describe, it, expect } from "vitest";
import {
  ruleMatches,
  evaluateCondition,
  type EvaluableRule,
} from "@/server/automation/rule-engine";
import type { NormalizedEvent } from "@/server/webhook/normalize";

function event(partial: Partial<NormalizedEvent>): NormalizedEvent {
  return {
    githubEvent: "issues",
    action: "opened",
    labels: [],
    ...partial,
  };
}

describe("condition evaluation", () => {
  it("title contains (case-insensitive)", () => {
    const e = event({ title: "Bug: Login crashes" });
    expect(
      evaluateCondition({ field: "title", operator: "contains", value: "bug" }, e),
    ).toBe(true);
  });

  it("title does not contain -> no match when present", () => {
    const e = event({ title: "Bug report" });
    expect(
      evaluateCondition({ field: "title", operator: "not_contains", value: "bug" }, e),
    ).toBe(false);
  });

  it("author equals", () => {
    const e = event({ authorLogin: "octocat" });
    expect(
      evaluateCondition({ field: "author", operator: "equals", value: "octocat" }, e),
    ).toBe(true);
    expect(
      evaluateCondition({ field: "author", operator: "equals", value: "other" }, e),
    ).toBe(false);
  });

  it("has_label / not_has_label", () => {
    const e = event({ labels: ["bug", "P1"] });
    expect(
      evaluateCondition({ field: "label", operator: "has_label", value: "bug" }, e),
    ).toBe(true);
    expect(
      evaluateCondition({ field: "label", operator: "not_has_label", value: "wontfix" }, e),
    ).toBe(true);
  });

  it("fails closed on invalid condition input", () => {
    const e = event({ title: "anything" });
    expect(
      evaluateCondition(
        // @ts-expect-error deliberately invalid operator
        { field: "title", operator: "??", value: "x" },
        e,
      ),
    ).toBe(false);
  });
});

describe("ruleMatches", () => {
  const rule = (over: Partial<EvaluableRule> = {}): EvaluableRule => ({
    id: "r1",
    name: "Bug automation",
    enabled: true,
    eventType: "ISSUE_OPENED",
    conditions: [{ field: "title", operator: "contains", value: "bug" }],
    ...over,
  });

  it("matches when event type + all conditions pass", () => {
    const e = event({ title: "Bug: payment fails" });
    expect(ruleMatches(rule(), e, "ISSUE_OPENED")).toBe(true);
  });

  it("does not match when title lacks the keyword", () => {
    const e = event({ title: "Feature request" });
    expect(ruleMatches(rule(), e, "ISSUE_OPENED")).toBe(false);
  });

  it("does not match a different event type", () => {
    const e = event({ title: "Bug here" });
    expect(ruleMatches(rule(), e, "PR_OPENED")).toBe(false);
  });

  it("does not match when disabled", () => {
    const e = event({ title: "Bug here" });
    expect(ruleMatches(rule({ enabled: false }), e, "ISSUE_OPENED")).toBe(false);
  });

  it("matches on event type alone when there are no conditions", () => {
    const e = event({ title: "anything" });
    expect(ruleMatches(rule({ conditions: [] }), e, "ISSUE_OPENED")).toBe(true);
  });

  it("requires ALL conditions (AND semantics)", () => {
    const r = rule({
      conditions: [
        { field: "title", operator: "contains", value: "bug" },
        { field: "author", operator: "equals", value: "octocat" },
      ],
    });
    expect(ruleMatches(r, event({ title: "bug", authorLogin: "octocat" }), "ISSUE_OPENED")).toBe(true);
    expect(ruleMatches(r, event({ title: "bug", authorLogin: "someone" }), "ISSUE_OPENED")).toBe(false);
  });
});
