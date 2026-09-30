import { logger } from "@/server/logger";

const GITHUB_API = "https://api.github.com";

export class GitHubError extends Error {
  status: number;
  retryable: boolean;
  constructor(message: string, status: number, retryable: boolean) {
    super(message);
    this.name = "GitHubError";
    this.status = status;
    this.retryable = retryable;
  }
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  token: string;
}

/**
 * Thin GitHub REST client. Classifies failures as retryable (5xx, secondary
 * rate limits, network) vs. permanent (4xx auth/validation) so the job queue can
 * make the right retry decision. Never logs the token.
 */
async function ghRequest<T>(path: string, opts: RequestOptions): Promise<T> {
  const url = path.startsWith("http") ? path : `${GITHUB_API}${path}`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: opts.method ?? "GET",
      headers: {
        Authorization: `Bearer ${opts.token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "GitFlow-Automator",
        ...(opts.body ? { "Content-Type": "application/json" } : {}),
      },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
  } catch (err) {
    // Network-level failure — retryable.
    throw new GitHubError(
      `GitHub network error: ${(err as Error).message}`,
      0,
      true,
    );
  }

  if (res.ok) {
    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
  }

  // Rate limiting: primary (403 + remaining 0) or secondary (429).
  const remaining = res.headers.get("x-ratelimit-remaining");
  const isRateLimited =
    res.status === 429 || (res.status === 403 && remaining === "0");
  const retryable = res.status >= 500 || isRateLimited;

  let detail = "";
  try {
    const j = (await res.json()) as { message?: string };
    detail = j.message ?? "";
  } catch {
    /* ignore */
  }

  logger.warn("github_api_error", {
    path,
    status: res.status,
    retryable,
    detail,
  });

  throw new GitHubError(
    `GitHub API ${res.status}: ${detail || res.statusText}`,
    res.status,
    retryable,
  );
}

// ---- Identity & repos -------------------------------------------------------

export interface GitHubUser {
  id: number;
  login: string;
  name: string | null;
  email: string | null;
  avatar_url: string;
}

export function getAuthenticatedUser(token: string): Promise<GitHubUser> {
  return ghRequest<GitHubUser>("/user", { token });
}

export interface GitHubRepo {
  id: number;
  name: string;
  full_name: string;
  private: boolean;
  owner: { login: string };
  permissions?: { admin: boolean; push: boolean; pull: boolean };
}

/** Repositories the user can administer (needed to manage webhooks). */
export async function listAdminRepos(token: string): Promise<GitHubRepo[]> {
  const repos: GitHubRepo[] = [];
  for (let page = 1; page <= 5; page++) {
    const batch = await ghRequest<GitHubRepo[]>(
      `/user/repos?per_page=100&page=${page}&sort=updated&affiliation=owner,collaborator,organization_member`,
      { token },
    );
    repos.push(...batch);
    if (batch.length < 100) break;
  }
  return repos.filter((r) => r.permissions?.admin);
}

export function getRepo(
  token: string,
  owner: string,
  repo: string,
): Promise<GitHubRepo> {
  return ghRequest<GitHubRepo>(`/repos/${owner}/${repo}`, { token });
}

// ---- Webhooks ---------------------------------------------------------------

export interface GitHubHook {
  id: number;
  active: boolean;
  events: string[];
  config: { url: string };
}

export function createRepoWebhook(
  token: string,
  owner: string,
  repo: string,
  config: { url: string; secret: string; events: string[] },
): Promise<GitHubHook> {
  return ghRequest<GitHubHook>(`/repos/${owner}/${repo}/hooks`, {
    token,
    method: "POST",
    body: {
      name: "web",
      active: true,
      events: config.events,
      config: {
        url: config.url,
        content_type: "json",
        secret: config.secret,
        insecure_ssl: "0",
      },
    },
  });
}

export async function deleteRepoWebhook(
  token: string,
  owner: string,
  repo: string,
  hookId: number,
): Promise<void> {
  await ghRequest<void>(`/repos/${owner}/${repo}/hooks/${hookId}`, {
    token,
    method: "DELETE",
  });
}

// ---- Issue / PR actions -----------------------------------------------------

interface GitHubLabelRef {
  name: string;
}

export async function getIssueLabels(
  token: string,
  owner: string,
  repo: string,
  issueNumber: number,
): Promise<string[]> {
  const labels = await ghRequest<GitHubLabelRef[]>(
    `/repos/${owner}/${repo}/issues/${issueNumber}/labels`,
    { token },
  );
  return labels.map((l) => l.name);
}

export async function addIssueLabels(
  token: string,
  owner: string,
  repo: string,
  issueNumber: number,
  labels: string[],
): Promise<void> {
  await ghRequest<GitHubLabelRef[]>(
    `/repos/${owner}/${repo}/issues/${issueNumber}/labels`,
    { token, method: "POST", body: { labels } },
  );
}

export async function createIssueComment(
  token: string,
  owner: string,
  repo: string,
  issueNumber: number,
  body: string,
): Promise<{ id: number; html_url: string }> {
  return ghRequest<{ id: number; html_url: string }>(
    `/repos/${owner}/${repo}/issues/${issueNumber}/comments`,
    { token, method: "POST", body: { body } },
  );
}
