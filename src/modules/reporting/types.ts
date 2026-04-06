/**
 * WebWaka Civic — Citizen Reporting Portal Types
 * Blueprint Reference: Phase 1 Citizen Engagement
 *
 * All types used by the reporting API and DB layer.
 */

import type { ReportCategory } from "../../core/ai-platform-client";

// ─── Status / Priority Enums ──────────────────────────────────────────────────

export type ReportStatus = "open" | "in_progress" | "resolved" | "closed";

export type ReportPriority = "low" | "medium" | "high" | "urgent";

export const REPORT_STATUSES: ReportStatus[] = ["open", "in_progress", "resolved", "closed"];

export const REPORT_PRIORITIES: ReportPriority[] = ["low", "medium", "high", "urgent"];

// ─── DB Row ───────────────────────────────────────────────────────────────────

/**
 * Mirrors the `civic_citizen_reports` D1 table column-for-column.
 * All timestamps are Unix milliseconds.
 */
export interface CitizenReport {
  id: string;
  tenantId: string;
  userId: string;

  description: string;
  userCategory?: string;
  lat?: number;
  lng?: number;
  address?: string;
  imageUrl?: string;

  aiCategory?: ReportCategory;
  aiConfidence?: number;
  aiNotes?: string;
  aiTriagedAt?: number;

  status: ReportStatus;
  priority: ReportPriority;
  assignedDepartment?: string;
  resolvedAt?: number;
  resolutionNotes?: string;

  deletedAt?: number;
  createdAt: number;
  updatedAt: number;
}

// ─── API Request Bodies ───────────────────────────────────────────────────────

export interface CreateReportBody {
  description: string;
  userCategory?: string;
  lat?: number;
  lng?: number;
  address?: string;
  imageUrl?: string;
  priority?: ReportPriority;
}

export interface UpdateReportStatusBody {
  status: ReportStatus;
  resolutionNotes?: string;
}

export interface AssignReportBody {
  assignedDepartment: string;
  priority?: ReportPriority;
}

// ─── API Response ─────────────────────────────────────────────────────────────

export interface ReportStats {
  total: number;
  byStatus: Record<ReportStatus, number>;
  byCategory: Record<string, number>;
  byPriority: Record<ReportPriority, number>;
}
