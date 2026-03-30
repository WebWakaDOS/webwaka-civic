/**
 * WebWaka Civic — CIV-3 Elections API Client
 * Blueprint Reference: Part 9.3 (Platform Conventions — API Response Format)
 *
 * Type-safe fetch wrapper for the Elections, Volunteers, and Fundraising APIs.
 * Reads JWT from sessionStorage key "webwaka_election_token".
 * All responses follow { success: true, data: T } | { success: false, error: string }
 */

export interface ApiSuccess<T> { success: true; data: T }
export interface ApiError    { success: false; error: string }
export type ApiResponse<T>   = ApiSuccess<T> | ApiError;

// ─── Domain Types ─────────────────────────────────────────────────────────────

export interface Election {
  id: string;
  tenantId: string;
  name: string;
  description?: string;
  type: string;
  status: "upcoming" | "nomination" | "voting" | "collation" | "closed";
  startDate: number;
  endDate: number;
  candidateCount?: number;
  voterCount?: number;
  state?: string;
  lga?: string;
  createdAt: number;
}

export interface Candidate {
  id: string;
  electionId: string;
  name: string;
  position: string;
  party?: string;
  status: "pending" | "approved" | "rejected";
  votes?: number;
}

export interface ResultCollation {
  id: string;
  electionId: string;
  candidateId: string;
  candidateName: string;
  level: string;
  votes: number;
  percentage?: number;
  certified: boolean;
}

export interface Volunteer {
  id: string;
  electionId: string;
  name: string;
  phone?: string;
  email?: string;
  state?: string;
  lga?: string;
  ward?: string;
  status: "active" | "inactive";
  points: number;
  tasksCompleted: number;
}

export interface VolunteerTask {
  id: string;
  electionId: string;
  title: string;
  description?: string;
  taskType: string;
  status: "open" | "assigned" | "completed";
  priority: "low" | "normal" | "high";
  dueAt?: number;
  pointsReward: number;
  assignedTo?: string;
}

export interface Donation {
  id: string;
  electionId: string;
  donorName: string;
  amountKobo: number;
  currency: string;
  status: "pending" | "completed" | "failed" | "refunded";
  paymentReference?: string;
  createdAt: number;
}

export interface Expense {
  id: string;
  electionId: string;
  category: string;
  description: string;
  amountKobo: number;
  vendorName?: string;
  status: "pending" | "approved" | "rejected";
  createdBy: string;
  createdAt: number;
}

export interface BudgetStatus {
  electionId: string;
  totalBudgetKobo: number;
  totalRaisedKobo: number;
  totalSpentKobo: number;
  remainingBudgetKobo: number;
  spentPercent: number;
  fundraisingPercent: number;
  budgets: unknown[];
}

export interface PublicResults {
  electionId: string;
  electionName: string;
  status: string;
  results: Array<{
    candidateId: string;
    candidateName: string;
    party?: string;
    totalVotes: number;
    percentage: number;
  }>;
  totalVotes: number;
  publishedAt?: number;
}

// ─── HTTP helpers ─────────────────────────────────────────────────────────────

function getToken(): string | null {
  return sessionStorage.getItem("webwaka_election_token");
}

async function electionFetch<T>(
  path: string,
  options: RequestInit = {}
): Promise<ApiResponse<T>> {
  const token = getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers as Record<string, string> | undefined),
  };
  try {
    const res = await fetch(path, { ...options, headers });
    const json = await res.json();
    return json as ApiResponse<T>;
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

// ─── Elections ────────────────────────────────────────────────────────────────

export const electionsApi = {
  list: (tenantId: string) =>
    electionFetch<{ elections: Election[]; total: number }>(`/api/elections?tenantId=${tenantId}`),

  get: (id: string) =>
    electionFetch<Election>(`/api/elections/${id}`),

  create: (body: Partial<Election>) =>
    electionFetch<Election>("/api/elections", { method: "POST", body: JSON.stringify(body) }),

  candidates: (electionId: string) =>
    electionFetch<{ candidates: Candidate[] }>(`/api/elections/${electionId}/candidates`),

  migrate: (electionId: string) =>
    electionFetch<{ message: string }>(`/api/elections/${electionId}/migrate`, { method: "POST" }),
};

// ─── Results ─────────────────────────────────────────────────────────────────

export const resultsApi = {
  collate: (electionId: string, body: unknown) =>
    electionFetch<ResultCollation>(`/api/elections/results/collate`, {
      method: "POST",
      body: JSON.stringify({ electionId, ...body as object }),
    }),

  getCollation: (electionId: string, level?: string) =>
    electionFetch<{ collations: ResultCollation[] }>(
      `/api/elections/${electionId}/results/collation${level ? `?level=${level}` : ""}`
    ),

  publicResults: (electionId: string) =>
    electionFetch<PublicResults>(`/api/public/elections/${electionId}/results`),

  publicBreakdown: (electionId: string, level = "ward") =>
    electionFetch<{ breakdown: unknown[] }>(
      `/api/public/elections/${electionId}/results/breakdown?level=${level}`
    ),
};

// ─── Volunteers ───────────────────────────────────────────────────────────────

export const volunteersApi = {
  list: (electionId: string) =>
    electionFetch<{ volunteers: Volunteer[]; total: number }>(
      `/api/volunteers/elections/${electionId}`
    ),

  register: (electionId: string, body: Partial<Volunteer>) =>
    electionFetch<Volunteer>(`/api/volunteers/elections/${electionId}`, {
      method: "POST",
      body: JSON.stringify(body),
    }),

  tasks: (electionId: string) =>
    electionFetch<{ tasks: VolunteerTask[] }>(
      `/api/volunteers/elections/${electionId}/tasks`
    ),

  createTask: (electionId: string, body: Partial<VolunteerTask>) =>
    electionFetch<VolunteerTask>(`/api/volunteers/elections/${electionId}/tasks`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
};

// ─── Fundraising ──────────────────────────────────────────────────────────────

export const fundraisingApi = {
  donations: (electionId: string, status?: string) =>
    electionFetch<{ donations: Donation[]; total: number }>(
      `/api/fundraising/elections/${electionId}/donations${status ? `?status=${status}` : ""}`
    ),

  createDonation: (electionId: string, body: Partial<Donation>) =>
    electionFetch<{ id: string; paymentReference: string }>(
      `/api/fundraising/elections/${electionId}/donations`,
      { method: "POST", body: JSON.stringify(body) }
    ),

  expenses: (electionId: string) =>
    electionFetch<{ expenses: Expense[] }>(
      `/api/fundraising/elections/${electionId}/expenses`
    ),

  createExpense: (electionId: string, body: Partial<Expense>) =>
    electionFetch<{ id: string }>(`/api/fundraising/elections/${electionId}/expenses`, {
      method: "POST",
      body: JSON.stringify(body),
    }),

  approveExpense: (electionId: string, expenseId: string) =>
    electionFetch<{ id: string; status: string }>(
      `/api/fundraising/elections/${electionId}/expenses/${expenseId}/approve`,
      { method: "PATCH", body: JSON.stringify({}) }
    ),

  budgetStatus: (electionId: string) =>
    electionFetch<BudgetStatus>(`/api/fundraising/elections/${electionId}/budget`),

  complianceReport: (electionId: string) =>
    electionFetch<unknown>(`/api/fundraising/elections/${electionId}/compliance-report`),
};
