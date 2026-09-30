/** Client-facing shapes returned by the API (BigInt serialized as string). */

export interface Stats {
  totalEvents: number;
  completedEvents: number;
  failedEvents: number;
  totalActions: number;
  successActions: number;
  successRate: number;
  repoCount: number;
  ruleCount: number;
  retryingJobs: number;
}

export interface EventListItem {
  id: string;
  githubEvent: string;
  action: string | null;
  repositoryFullName: string | null;
  senderLogin: string | null;
  title: string | null;
  status: string;
  attemptCount: number;
  receivedAt: string;
  processedAt: string | null;
  errorMessage: string | null;
  _count: { executions: number; actions: number };
  executions: { ruleName: string; status: string }[];
  actions: { type: string; status: string }[];
}

export interface EventsResponse {
  events: EventListItem[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

export interface RepositoryItem {
  id: string;
  owner: string;
  name: string;
  fullName: string;
  private: boolean;
  webhookStatus: string;
  events: string[];
  createdAt: string;
  _count: { webhookEvents: number; rules: number };
}

export interface AvailableRepo {
  githubRepoId: string;
  owner: string;
  name: string;
  fullName: string;
  private: boolean;
  connected: boolean;
}

export interface RuleItem {
  id: string;
  name: string;
  enabled: boolean;
  eventType: string;
  conditions: { field: string; operator: string; value: string }[];
  actions: { type: string; label?: string; template?: string }[];
  priority: number;
  repositoryId: string;
  repository: { fullName: string };
  _count: { executions: number };
  createdAt: string;
}

export interface SlackItem {
  id: string;
  repositoryId: string | null;
  enabled: boolean;
  createdAt: string;
  webhookUrl: string;
}

export interface EventDetail {
  id: string;
  githubEvent: string;
  action: string | null;
  githubDeliveryId: string;
  repositoryFullName: string | null;
  senderLogin: string | null;
  title: string | null;
  status: string;
  attemptCount: number;
  receivedAt: string;
  processedAt: string | null;
  errorMessage: string | null;
  payload: Record<string, unknown>;
  executions: {
    id: string;
    ruleName: string;
    status: string;
    durationMs: number | null;
    actions: {
      id: string;
      type: string;
      status: string;
      detail: Record<string, unknown> | null;
      result: Record<string, unknown> | null;
      error: string | null;
    }[];
    aiResult: {
      summary: string | null;
      category: string | null;
      priority: string | null;
      suggestedLabel: string | null;
      reason: string | null;
    } | null;
  }[];
  timeline: { id: string; kind: string; message: string; at: string }[];
}
