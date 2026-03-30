/**
 * WebWaka Civic — CIV-2 Political Party API Client
 * Blueprint Reference: Part 9.3 (Platform Conventions — API Response Format)
 * Part 10.9 (Civic & Political Suite — Political Party Management)
 *
 * Type-safe fetch wrapper for the Political Party Hono API.
 * All requests include Authorization: Bearer <token> header.
 * All responses follow { success: true, data: T } | { success: false, error: string }
 */

import type {
  PartyOrganization,
  PartyStructure,
  PartyMember,
  PartyDues,
  PartyPosition,
  PartyMeeting,
  PartyAnnouncement,
  PartyIdCard,
  PartyNomination,
  PartyCampaignAccount,
  PartyCampaignTransaction,
} from "../../core/db/schema.ts";

export type { PartyNomination, PartyCampaignAccount, PartyCampaignTransaction };

export interface PartyCampaignSummary {
  accountId: string;
  positionLevel: string;
  limitKobo: number;
  totalIncomeKobo: number;
  totalExpenditureKobo: number;
  balanceKobo: number;
  expenditurePercent: number;
  withinLimit: boolean;
  transactions: PartyCampaignTransaction[];
}

// ─── API Response Types ───────────────────────────────────────────────────────

export interface ApiSuccess<T> {
  success: true;
  data: T;
}

export interface ApiError {
  success: false;
  error: string;
}

export type ApiResponse<T> = ApiSuccess<T> | ApiError;

// ─── Request/Response Types ───────────────────────────────────────────────────

export interface PartyMembersResponse {
  members: PartyMember[];
  total: number;
  page: number;
  limit: number;
}

export interface PartyDuesSummaryResponse {
  totalCollectedKobo: number;
  paymentCount: number;
  year: number;
  totalCollectedNaira: string;
}

export interface PartyStatsResponse {
  totalMembers: number;
  activeMembers: number;
  totalDuesCollectedKobo: number;
  currentYearDuesKobo: number;
  totalStructures: number;
  upcomingMeetings: number;
  totalDuesCollectedNaira: string;
  currentYearDuesNaira: string;
}

export interface PartyStructureWithChildren extends PartyStructure {
  children: PartyStructure[];
}

export interface PartySyncPullResponse {
  since: number;
  serverTime: number;
  members: Partial<PartyMember>[];
  structures: Partial<PartyStructure>[];
  dues: Partial<PartyDues>[];
}

export interface PartySyncPushResponse {
  processed: number;
  results: Array<{ id: string; success: boolean; error?: string }>;
}

// ─── Member Filters ───────────────────────────────────────────────────────────

export interface PartyMemberFilters {
  structureId?: string;
  memberStatus?: string;
  role?: string;
  search?: string;
  page?: number;
  limit?: number;
}

// ─── API Client ───────────────────────────────────────────────────────────────

export class PartyApiClient {
  private readonly baseUrl: string;
  private readonly token: string;

  constructor(baseUrl: string, token: string) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.token = token;
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    params?: Record<string, string | number | undefined>
  ): Promise<ApiResponse<T>> {
    let url = `${this.baseUrl}${path}`;
    if (params) {
      const qs = Object.entries(params)
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
        .join("&");
      if (qs) url += `?${qs}`;
    }
    const fetchInit: RequestInit = {
      method,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.token}`,
      },
    };
    if (body !== undefined) {
      fetchInit.body = JSON.stringify(body);
    }
    const response = await fetch(url, fetchInit);
    const json = await response.json() as ApiResponse<T>;
    return json;
  }

  // ─── Organizations ──────────────────────────────────────────────────────────

  async getOrganization(id: string): Promise<ApiResponse<PartyOrganization>> {
    return this.request<PartyOrganization>("GET", `/api/party/organizations/${id}`);
  }

  async updateOrganization(id: string, updates: Partial<PartyOrganization>): Promise<ApiResponse<PartyOrganization>> {
    return this.request<PartyOrganization>("PATCH", `/api/party/organizations/${id}`, updates);
  }

  async getOrganizationStats(id: string): Promise<ApiResponse<PartyStatsResponse>> {
    return this.request<PartyStatsResponse>("GET", `/api/party/organizations/${id}/stats`);
  }

  async createOrganization(org: Omit<PartyOrganization, "id" | "createdAt" | "updatedAt">): Promise<ApiResponse<PartyOrganization>> {
    return this.request<PartyOrganization>("POST", "/api/party/organizations", org);
  }

  // ─── Structures ─────────────────────────────────────────────────────────────

  async getStructures(parentId?: string | null): Promise<ApiResponse<PartyStructure[]>> {
    const params: Record<string, string | undefined> = {};
    if (parentId === null) params.parentId = "null";
    else if (parentId !== undefined) params.parentId = parentId;
    return this.request<PartyStructure[]>("GET", "/api/party/structures", undefined, params);
  }

  async getStructure(id: string): Promise<ApiResponse<PartyStructureWithChildren>> {
    return this.request<PartyStructureWithChildren>("GET", `/api/party/structures/${id}`);
  }

  async createStructure(structure: Omit<PartyStructure, "id" | "createdAt" | "updatedAt">): Promise<ApiResponse<PartyStructure>> {
    return this.request<PartyStructure>("POST", "/api/party/structures", structure);
  }

  async updateStructure(id: string, updates: Partial<PartyStructure>): Promise<ApiResponse<PartyStructure>> {
    return this.request<PartyStructure>("PATCH", `/api/party/structures/${id}`, updates);
  }

  async deleteStructure(id: string): Promise<ApiResponse<{ deleted: boolean }>> {
    return this.request<{ deleted: boolean }>("DELETE", `/api/party/structures/${id}`);
  }

  // ─── Members ────────────────────────────────────────────────────────────────

  async getMembers(filters?: PartyMemberFilters): Promise<ApiResponse<PartyMembersResponse>> {
    return this.request<PartyMembersResponse>("GET", "/api/party/members", undefined, {
      structureId: filters?.structureId,
      memberStatus: filters?.memberStatus,
      role: filters?.role,
      search: filters?.search,
      page: filters?.page,
      limit: filters?.limit,
    });
  }

  async getMember(id: string): Promise<ApiResponse<PartyMember>> {
    return this.request<PartyMember>("GET", `/api/party/members/${id}`);
  }

  async createMember(member: Omit<PartyMember, "id" | "membershipNumber" | "createdAt" | "updatedAt">): Promise<ApiResponse<PartyMember>> {
    return this.request<PartyMember>("POST", "/api/party/members", member);
  }

  async updateMember(id: string, updates: Partial<PartyMember>): Promise<ApiResponse<PartyMember>> {
    return this.request<PartyMember>("PATCH", `/api/party/members/${id}`, updates);
  }

  async deleteMember(id: string): Promise<ApiResponse<{ deleted: boolean }>> {
    return this.request<{ deleted: boolean }>("DELETE", `/api/party/members/${id}`);
  }

  async getMemberDues(memberId: string): Promise<ApiResponse<PartyDues[]>> {
    return this.request<PartyDues[]>("GET", `/api/party/members/${memberId}/dues`);
  }

  async getMemberCard(memberId: string): Promise<ApiResponse<PartyIdCard>> {
    return this.request<PartyIdCard>("GET", `/api/party/members/${memberId}/card`);
  }

  // ─── Dues ───────────────────────────────────────────────────────────────────

  async getDues(year?: number): Promise<ApiResponse<PartyDues[]>> {
    return this.request<PartyDues[]>("GET", "/api/party/dues", undefined, { year });
  }

  async getDuesSummary(year?: number): Promise<ApiResponse<PartyDuesSummaryResponse>> {
    return this.request<PartyDuesSummaryResponse>("GET", "/api/party/dues/summary", undefined, { year });
  }

  async createDues(dues: Omit<PartyDues, "id" | "createdAt" | "updatedAt">): Promise<ApiResponse<PartyDues>> {
    return this.request<PartyDues>("POST", "/api/party/dues", dues);
  }

  async updateDues(id: string, updates: { notes?: string }): Promise<ApiResponse<{ updated: boolean }>> {
    return this.request<{ updated: boolean }>("PATCH", `/api/party/dues/${id}`, updates);
  }

  async deleteDues(id: string): Promise<ApiResponse<{ deleted: boolean }>> {
    return this.request<{ deleted: boolean }>("DELETE", `/api/party/dues/${id}`);
  }

  // ─── Positions ──────────────────────────────────────────────────────────────

  async getPositions(structureId: string): Promise<ApiResponse<PartyPosition[]>> {
    return this.request<PartyPosition[]>("GET", "/api/party/positions", undefined, { structureId });
  }

  async createPosition(position: Omit<PartyPosition, "id" | "createdAt" | "updatedAt">): Promise<ApiResponse<PartyPosition>> {
    return this.request<PartyPosition>("POST", "/api/party/positions", position);
  }

  async updatePosition(id: string, updates: Partial<PartyPosition>): Promise<ApiResponse<{ updated: boolean }>> {
    return this.request<{ updated: boolean }>("PATCH", `/api/party/positions/${id}`, updates);
  }

  async deletePosition(id: string): Promise<ApiResponse<{ deleted: boolean }>> {
    return this.request<{ deleted: boolean }>("DELETE", `/api/party/positions/${id}`);
  }

  // ─── Meetings ───────────────────────────────────────────────────────────────

  async getMeetings(structureId?: string): Promise<ApiResponse<PartyMeeting[]>> {
    return this.request<PartyMeeting[]>("GET", "/api/party/meetings", undefined, { structureId });
  }

  async createMeeting(meeting: Omit<PartyMeeting, "id" | "createdAt" | "updatedAt">): Promise<ApiResponse<PartyMeeting>> {
    return this.request<PartyMeeting>("POST", "/api/party/meetings", meeting);
  }

  async updateMeeting(id: string, updates: Partial<PartyMeeting>): Promise<ApiResponse<{ updated: boolean }>> {
    return this.request<{ updated: boolean }>("PATCH", `/api/party/meetings/${id}`, updates);
  }

  async deleteMeeting(id: string): Promise<ApiResponse<{ deleted: boolean }>> {
    return this.request<{ deleted: boolean }>("DELETE", `/api/party/meetings/${id}`);
  }

  // ─── Announcements ──────────────────────────────────────────────────────────

  async getAnnouncements(): Promise<ApiResponse<PartyAnnouncement[]>> {
    return this.request<PartyAnnouncement[]>("GET", "/api/party/announcements");
  }

  async createAnnouncement(announcement: Omit<PartyAnnouncement, "id" | "createdAt" | "updatedAt">): Promise<ApiResponse<PartyAnnouncement>> {
    return this.request<PartyAnnouncement>("POST", "/api/party/announcements", announcement);
  }

  // ─── ID Cards ───────────────────────────────────────────────────────────────

  async issueIdCard(memberId: string, expiresAt?: number, cardImageUrl?: string): Promise<ApiResponse<PartyIdCard>> {
    return this.request<PartyIdCard>("POST", "/api/party/id-cards", { memberId, expiresAt, cardImageUrl });
  }

  async revokeIdCard(id: string, reason: string): Promise<ApiResponse<{ revoked: boolean }>> {
    return this.request<{ revoked: boolean }>("PATCH", `/api/party/id-cards/${id}`, { reason });
  }

  // ─── Nominations ────────────────────────────────────────────────────────────

  async getNominations(status?: string): Promise<ApiResponse<{ nominations: PartyNomination[]; total: number }>> {
    return this.request("GET", "/api/party/nominations", undefined, status ? { status } : {});
  }

  async createNomination(data: {
    memberId: string;
    position: string;
    constituency?: string;
    statementOfIntent?: string;
  }): Promise<ApiResponse<PartyNomination>> {
    return this.request("POST", "/api/party/nominations", data);
  }

  async approveNomination(id: string, vettingNotes?: string): Promise<ApiResponse<{ success: boolean }>> {
    return this.request("PATCH", `/api/party/nominations/${id}/approve`, { vettingNotes });
  }

  async rejectNomination(id: string, vettingNotes: string): Promise<ApiResponse<{ success: boolean }>> {
    return this.request("PATCH", `/api/party/nominations/${id}/reject`, { vettingNotes });
  }

  async submitNomination(id: string): Promise<ApiResponse<{ success: boolean }>> {
    return this.request("PATCH", `/api/party/nominations/${id}/submit`, {});
  }

  // ─── Campaign Finance ────────────────────────────────────────────────────────

  async getCampaignAccounts(): Promise<ApiResponse<{ accounts: PartyCampaignAccount[] }>> {
    return this.request("GET", "/api/party/campaign-finance");
  }

  async createCampaignAccount(data: {
    memberId: string;
    position: string;
    positionLevel: string;
    constituency?: string;
  }): Promise<ApiResponse<PartyCampaignAccount>> {
    return this.request("POST", "/api/party/campaign-finance", data);
  }

  async getCampaignSummary(id: string): Promise<ApiResponse<PartyCampaignSummary>> {
    return this.request("GET", `/api/party/campaign-finance/${id}/summary`);
  }

  async addCampaignTransaction(id: string, data: {
    type: "income" | "expenditure";
    category: string;
    description: string;
    amountKobo: number;
    evidenceUrl?: string;
  }): Promise<ApiResponse<{ id: string }>> {
    return this.request("POST", `/api/party/campaign-finance/${id}/transactions`, data);
  }

  // ─── Sync ───────────────────────────────────────────────────────────────────

  async syncPull(since: number): Promise<ApiResponse<PartySyncPullResponse>> {
    return this.request<PartySyncPullResponse>("GET", "/api/party/sync/pull", undefined, { since });
  }

  async syncPush(mutations: Array<{
    id: string;
    entityType: "member" | "dues";
    operation: "create" | "update";
    data: Record<string, unknown>;
  }>): Promise<ApiResponse<PartySyncPushResponse>> {
    return this.request<PartySyncPushResponse>("POST", "/api/party/sync/push", { mutations });
  }

  // ─── Health ─────────────────────────────────────────────────────────────────

  async health(): Promise<ApiResponse<{ module: string; version: string; timestamp: string }>> {
    return this.request("GET", "/api/party/health");
  }

  async migrate(): Promise<ApiResponse<{ applied: number; message: string }>> {
    return this.request("POST", "/api/party/migrate", {});
  }

  async getHierarchyAnalytics(structureId?: string): Promise<ApiResponse<{
    node: { structureId: string; name: string; level: string; memberCount: number; activeMemberCount: number; duesCollectedKoboYTD: number; meetingCountLast90d: number } | null;
    children: Array<{ structureId: string; name: string; level: string; parentId: string | null; memberCount: number; activeMemberCount: number; duesCollectedKoboYTD: number; meetingCountLast90d: number }>;
  }>> {
    const qs = structureId ? `?structureId=${encodeURIComponent(structureId)}` : "";
    return this.request("GET", `/api/party/analytics/hierarchy${qs}`);
  }
}

/**
 * Create a new PartyApiClient instance.
 */
export function createPartyApiClient(baseUrl: string, token: string): PartyApiClient {
  return new PartyApiClient(baseUrl, token);
}
