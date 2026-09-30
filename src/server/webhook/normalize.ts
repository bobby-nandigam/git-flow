/**
 * Event normalization + payload sanitization.
 *
 * The rule engine and UI should never touch the raw GitHub payload directly.
 * We normalize into a small, predictable shape and strip anything sensitive or
 * unbounded before persisting.
 */

export interface NormalizedEvent {
  githubEvent: string;
  action?: string;
  repositoryFullName?: string;
  repositoryOwner?: string;
  repositoryName?: string;
  githubRepoId?: number;
  senderLogin?: string;
  // Subject = issue or PR (whichever applies)
  number?: number;
  title?: string;
  body?: string;
  authorLogin?: string;
  labels: string[];
  merged?: boolean;
  // push-specific
  ref?: string;
  commitCount?: number;
  htmlUrl?: string;
}

interface RawUser {
  login?: string;
}
interface RawLabel {
  name?: string;
}
interface RawIssueOrPr {
  number?: number;
  title?: string;
  body?: string;
  html_url?: string;
  user?: RawUser;
  labels?: RawLabel[];
  merged?: boolean;
}

export function normalizeEvent(
  githubEvent: string,
  payload: Record<string, unknown>,
): NormalizedEvent {
  const repo = payload.repository as
    | { id?: number; name?: string; owner?: RawUser; full_name?: string }
    | undefined;
  const sender = payload.sender as RawUser | undefined;
  const action = payload.action as string | undefined;

  const base: NormalizedEvent = {
    githubEvent,
    action,
    repositoryFullName: repo?.full_name,
    repositoryOwner: repo?.owner?.login,
    repositoryName: repo?.name,
    githubRepoId: repo?.id,
    senderLogin: sender?.login,
    labels: [],
  };

  if (githubEvent === "issues") {
    const issue = payload.issue as RawIssueOrPr | undefined;
    return {
      ...base,
      number: issue?.number,
      title: issue?.title,
      body: issue?.body ?? undefined,
      authorLogin: issue?.user?.login,
      labels: (issue?.labels ?? []).map((l) => l.name ?? "").filter(Boolean),
      htmlUrl: issue?.html_url,
    };
  }

  if (githubEvent === "pull_request") {
    const pr = payload.pull_request as RawIssueOrPr | undefined;
    return {
      ...base,
      number: pr?.number,
      title: pr?.title,
      body: pr?.body ?? undefined,
      authorLogin: pr?.user?.login,
      labels: (pr?.labels ?? []).map((l) => l.name ?? "").filter(Boolean),
      merged: pr?.merged,
      htmlUrl: pr?.html_url,
    };
  }

  if (githubEvent === "push") {
    const commits = (payload.commits as unknown[] | undefined) ?? [];
    return {
      ...base,
      ref: payload.ref as string | undefined,
      commitCount: commits.length,
      authorLogin: (payload.pusher as { name?: string } | undefined)?.name,
      htmlUrl: (payload.compare as string | undefined) ?? undefined,
    };
  }

  return base;
}

/**
 * Produce a compact, sanitized payload safe to store & display.
 * We keep only bounded, non-sensitive fields — never tokens, installation
 * secrets, or huge diffs.
 */
export function sanitizePayload(
  githubEvent: string,
  normalized: NormalizedEvent,
): Record<string, unknown> {
  const clip = (s?: string, n = 2000) =>
    s == null ? undefined : s.length > n ? s.slice(0, n) + "…" : s;

  return {
    githubEvent,
    action: normalized.action,
    repository: normalized.repositoryFullName,
    sender: normalized.senderLogin,
    number: normalized.number,
    title: clip(normalized.title, 300),
    body: clip(normalized.body, 2000),
    author: normalized.authorLogin,
    labels: normalized.labels,
    merged: normalized.merged,
    ref: normalized.ref,
    commitCount: normalized.commitCount,
    htmlUrl: normalized.htmlUrl,
  };
}
