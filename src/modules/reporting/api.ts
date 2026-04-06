/**
 * WebWaka Civic — Citizen Reporting Portal API
 * Blueprint Reference: Phase 1 Citizen Engagement
 * Plan Reference: Section 5, Prompts 1 & 2
 *
 * Endpoints:
 *   POST   /api/reporting/reports               Submit a new report (any authenticated user)
 *   GET    /api/reporting/reports               List reports (admin: all; others: own)
 *   GET    /api/reporting/reports/stats         Aggregate stats by status/category (admin)
 *   GET    /api/reporting/reports/:id           Get a single report (owner or admin)
 *   PATCH  /api/reporting/reports/:id/status    Update lifecycle status (admin)
 *   PATCH  /api/reporting/reports/:id/assign    Assign department + priority (admin)
 *
 * Auth: JWT via createCivicAuthMiddleware (same secret as CIV-1)
 * Rate limit: 10 report submissions per IP per minute
 *
 * AI Triage (Phase 2):
 *   On POST, `triageReport()` classifies description → canonical category.
 *   Result persisted in aiCategory / aiConfidence / aiNotes / aiTriagedAt.
 *   Failure is non-blocking — report is stored with aiCategory = null.
 */

import { Hono } from "hono";
import { createLogger } from "../../core/logger";
import { checkRateLimit, getClientIp } from "../../core/rateLimit";
import {
  createCivicAuthMiddleware,
  CIVIC_JWT_KEY,
  type CivicJWTPayload,
} from "../../core/auth";
import {
  apiSuccess,
  apiError,
  apiPaginated,
  generateId,
  nowMs,
} from "../../core/response";
import type { AIEnv } from "../../core/ai-platform-client";
import { triageReport } from "../../core/ai-platform-client";
import type { D1Database } from "../../core/db/queries";
import type {
  CitizenReport,
  CreateReportBody,
  UpdateReportStatusBody,
  AssignReportBody,
  ReportStats,
  ReportStatus,
  ReportPriority,
} from "./types";
import {
  REPORT_STATUSES,
  REPORT_PRIORITIES,
} from "./types";

// ─── Environment ──────────────────────────────────────────────────────────────

export interface ReportingEnv extends AIEnv {
  DB: D1Database;
  JWT_SECRET: string;
}

// ─── App ──────────────────────────────────────────────────────────────────────

const app = new Hono<{ Bindings: ReportingEnv }>();
const logger = createLogger("citizen-reporting");

// ─── Auth Middleware ──────────────────────────────────────────────────────────

app.use("/api/reporting/*", createCivicAuthMiddleware<CivicJWTPayload>());

// ─── Health Check ─────────────────────────────────────────────────────────────

app.get("/health", (c) =>
  c.json({ status: "ok", service: "webwaka-civic-reporting", timestamp: new Date().toISOString() })
);

// ─── POST /api/reporting/reports ─────────────────────────────────────────────
// Submit a new citizen report.  AI triage runs automatically before storage.

app.post("/api/reporting/reports", async (c) => {
  const ip = getClientIp(c.req.raw);
  if (!checkRateLimit(`report-create:${ip}`, 10, 60_000)) {
    return apiError("Too many report submissions — please wait a moment", 429);
  }

  const payload = c.get(CIVIC_JWT_KEY as never) as CivicJWTPayload;
  const body = await c.req.json<CreateReportBody>().catch(() => null);

  if (!body) return apiError("Invalid JSON body", 400);
  if (!body.description || body.description.trim().length < 10) {
    return apiError("description must be at least 10 characters", 422);
  }
  if (body.description.trim().length > 2000) {
    return apiError("description must be at most 2000 characters", 422);
  }
  if (body.lat !== undefined && (body.lat < -90 || body.lat > 90)) {
    return apiError("lat must be between -90 and 90", 422);
  }
  if (body.lng !== undefined && (body.lng < -180 || body.lng > 180)) {
    return apiError("lng must be between -180 and 180", 422);
  }
  if (body.priority !== undefined && !REPORT_PRIORITIES.includes(body.priority)) {
    return apiError(`priority must be one of: ${REPORT_PRIORITIES.join(", ")}`, 422);
  }

  const log = logger.withTenant(payload.tenantId);
  log.info("Submitting citizen report", { userId: payload.sub });

  // ── AI Triage (non-blocking) ───────────────────────────────────────────────
  let aiCategory: string | undefined;
  let aiConfidence: number | undefined;
  let aiNotes: string | undefined;
  let aiTriagedAt: number | undefined;

  try {
    const triage = await triageReport(c.env, body.description.trim(), body.userCategory);
    if (!triage.isFallback) {
      aiCategory = triage.category;
      aiConfidence = triage.confidence;
      aiNotes = triage.notes;
      aiTriagedAt = nowMs();
      log.info("AI triage complete", { category: aiCategory, confidence: aiConfidence, provider: triage.provider });
    } else {
      log.info("AI triage fallback — report will require manual categorisation", { provider: triage.provider });
    }
  } catch (err) {
    log.warn("AI triage threw unexpectedly — continuing without triage", { error: String(err) });
  }

  // ── Persist ───────────────────────────────────────────────────────────────
  const id = generateId();
  const now = nowMs();

  const stmt = c.env.DB.prepare(`
    INSERT INTO civic_citizen_reports
      (id, tenantId, userId,
       description, userCategory, lat, lng, address, imageUrl,
       aiCategory, aiConfidence, aiNotes, aiTriagedAt,
       status, priority,
       createdAt, updatedAt)
    VALUES
      (?, ?, ?,
       ?, ?, ?, ?, ?, ?,
       ?, ?, ?, ?,
       'open', ?,
       ?, ?)
  `);

  await stmt
    .bind(
      id, payload.tenantId, payload.sub,
      body.description.trim(),
      body.userCategory ?? null,
      body.lat ?? null,
      body.lng ?? null,
      body.address ?? null,
      body.imageUrl ?? null,
      aiCategory ?? null,
      aiConfidence ?? null,
      aiNotes ?? null,
      aiTriagedAt ?? null,
      body.priority ?? "medium",
      now, now
    )
    .run();

  const report = await c.env.DB
    .prepare("SELECT * FROM civic_citizen_reports WHERE id = ?")
    .bind(id)
    .first<CitizenReport>();

  if (!report) return apiError("Failed to retrieve created report", 500);

  log.info("Citizen report created", { reportId: id, aiCategory });
  return apiSuccess(report);
});

// ─── GET /api/reporting/reports ──────────────────────────────────────────────
// List reports. Admins/leaders see all; members/viewers see only their own.

app.get("/api/reporting/reports", async (c) => {
  const payload = c.get(CIVIC_JWT_KEY as never) as CivicJWTPayload;
  const log = logger.withTenant(payload.tenantId);

  const page  = Math.max(1, Number(c.req.query("page")  ?? "1"));
  const limit = Math.min(100, Math.max(1, Number(c.req.query("limit") ?? "20")));
  const offset = (page - 1) * limit;

  const status   = c.req.query("status")   as ReportStatus | undefined;
  const category = c.req.query("category");
  const priority = c.req.query("priority") as ReportPriority | undefined;

  if (status   && !REPORT_STATUSES.includes(status))   return apiError(`Invalid status filter`, 422);
  if (priority && !REPORT_PRIORITIES.includes(priority)) return apiError(`Invalid priority filter`, 422);

  const isAdmin = payload.role === "admin" || payload.role === "leader";

  const conditions: string[] = [
    "tenantId = ?",
    "deletedAt IS NULL",
  ];
  const bindings: (string | number | null)[] = [payload.tenantId];

  if (!isAdmin) {
    conditions.push("userId = ?");
    bindings.push(payload.sub);
  }
  if (status) {
    conditions.push("status = ?");
    bindings.push(status);
  }
  if (category) {
    conditions.push("aiCategory = ?");
    bindings.push(category);
  }
  if (priority) {
    conditions.push("priority = ?");
    bindings.push(priority);
  }

  const where = `WHERE ${conditions.join(" AND ")}`;

  const [countRow, rows] = await Promise.all([
    c.env.DB
      .prepare(`SELECT COUNT(*) as cnt FROM civic_citizen_reports ${where}`)
      .bind(...bindings)
      .first<{ cnt: number }>(),
    c.env.DB
      .prepare(`SELECT * FROM civic_citizen_reports ${where} ORDER BY createdAt DESC LIMIT ? OFFSET ?`)
      .bind(...bindings, limit, offset)
      .all<CitizenReport>(),
  ]);

  const total = countRow?.cnt ?? 0;
  log.info("Listed citizen reports", { total, page, limit, isAdmin });
  return apiPaginated(rows.results ?? [], total, page, limit);
});

// ─── GET /api/reporting/reports/stats ────────────────────────────────────────
// Aggregate counts by status, AI category, and priority (admin / leader only).

app.get("/api/reporting/reports/stats", async (c) => {
  const payload = c.get(CIVIC_JWT_KEY as never) as CivicJWTPayload;
  const log = logger.withTenant(payload.tenantId);

  if (payload.role !== "admin" && payload.role !== "leader") {
    return apiError("Only admins and leaders can view report statistics", 403);
  }

  const [statusRows, categoryRows, priorityRows, totalRow] = await Promise.all([
    c.env.DB
      .prepare(`SELECT status, COUNT(*) as cnt FROM civic_citizen_reports
                WHERE tenantId = ? AND deletedAt IS NULL GROUP BY status`)
      .bind(payload.tenantId)
      .all<{ status: string; cnt: number }>(),
    c.env.DB
      .prepare(`SELECT COALESCE(aiCategory,'Uncategorised') as cat, COUNT(*) as cnt
                FROM civic_citizen_reports WHERE tenantId = ? AND deletedAt IS NULL GROUP BY cat`)
      .bind(payload.tenantId)
      .all<{ cat: string; cnt: number }>(),
    c.env.DB
      .prepare(`SELECT priority, COUNT(*) as cnt FROM civic_citizen_reports
                WHERE tenantId = ? AND deletedAt IS NULL GROUP BY priority`)
      .bind(payload.tenantId)
      .all<{ priority: string; cnt: number }>(),
    c.env.DB
      .prepare(`SELECT COUNT(*) as cnt FROM civic_citizen_reports WHERE tenantId = ? AND deletedAt IS NULL`)
      .bind(payload.tenantId)
      .first<{ cnt: number }>(),
  ]);

  const byStatus  = Object.fromEntries((statusRows.results ?? []).map((r) => [r.status,   r.cnt])) as Record<ReportStatus, number>;
  const byCategory = Object.fromEntries((categoryRows.results ?? []).map((r) => [r.cat,   r.cnt]));
  const byPriority = Object.fromEntries((priorityRows.results ?? []).map((r) => [r.priority, r.cnt])) as Record<ReportPriority, number>;

  const stats: ReportStats = {
    total: totalRow?.cnt ?? 0,
    byStatus,
    byCategory,
    byPriority,
  };

  log.info("Report stats retrieved", { total: stats.total });
  return apiSuccess(stats);
});

// ─── GET /api/reporting/reports/:id ──────────────────────────────────────────
// Get a single report. Owner or admin.

app.get("/api/reporting/reports/:id", async (c) => {
  const payload = c.get(CIVIC_JWT_KEY as never) as CivicJWTPayload;
  const { id }  = c.req.param();

  const report = await c.env.DB
    .prepare("SELECT * FROM civic_citizen_reports WHERE id = ? AND tenantId = ? AND deletedAt IS NULL")
    .bind(id, payload.tenantId)
    .first<CitizenReport>();

  if (!report) return apiError("Report not found", 404);

  const isAdmin = payload.role === "admin" || payload.role === "leader";
  if (!isAdmin && report.userId !== payload.sub) {
    return apiError("You are not authorised to view this report", 403);
  }

  return apiSuccess(report);
});

// ─── PATCH /api/reporting/reports/:id/status ─────────────────────────────────
// Admin / leader updates the lifecycle status of a report.

app.patch("/api/reporting/reports/:id/status", async (c) => {
  const payload = c.get(CIVIC_JWT_KEY as never) as CivicJWTPayload;

  if (payload.role !== "admin" && payload.role !== "leader") {
    return apiError("Only admins and leaders can update report status", 403);
  }

  const { id } = c.req.param();
  const body   = await c.req.json<UpdateReportStatusBody>().catch(() => null);

  if (!body)                                       return apiError("Invalid JSON body", 400);
  if (!REPORT_STATUSES.includes(body.status))      return apiError(`status must be one of: ${REPORT_STATUSES.join(", ")}`, 422);

  const existing = await c.env.DB
    .prepare("SELECT id FROM civic_citizen_reports WHERE id = ? AND tenantId = ? AND deletedAt IS NULL")
    .bind(id, payload.tenantId)
    .first<{ id: string }>();
  if (!existing) return apiError("Report not found", 404);

  const now = nowMs();
  const isTerminal = body.status === "resolved" || body.status === "closed";

  await c.env.DB
    .prepare(`
      UPDATE civic_citizen_reports
      SET status = ?,
          resolutionNotes = COALESCE(?, resolutionNotes),
          resolvedAt = CASE WHEN ? THEN ? ELSE resolvedAt END,
          updatedAt = ?
      WHERE id = ? AND tenantId = ?
    `)
    .bind(
      body.status,
      body.resolutionNotes ?? null,
      isTerminal ? 1 : 0,
      now,
      now,
      id,
      payload.tenantId
    )
    .run();

  const updated = await c.env.DB
    .prepare("SELECT * FROM civic_citizen_reports WHERE id = ?")
    .bind(id)
    .first<CitizenReport>();

  logger.withTenant(payload.tenantId).info("Report status updated", { reportId: id, status: body.status });
  return apiSuccess(updated);
});

// ─── PATCH /api/reporting/reports/:id/assign ─────────────────────────────────
// Admin / leader assigns the report to a department and optionally raises priority.

app.patch("/api/reporting/reports/:id/assign", async (c) => {
  const payload = c.get(CIVIC_JWT_KEY as never) as CivicJWTPayload;

  if (payload.role !== "admin" && payload.role !== "leader") {
    return apiError("Only admins and leaders can assign reports", 403);
  }

  const { id } = c.req.param();
  const body   = await c.req.json<AssignReportBody>().catch(() => null);

  if (!body)                    return apiError("Invalid JSON body", 400);
  if (!body.assignedDepartment) return apiError("assignedDepartment is required", 422);
  if (body.priority !== undefined && !REPORT_PRIORITIES.includes(body.priority)) {
    return apiError(`priority must be one of: ${REPORT_PRIORITIES.join(", ")}`, 422);
  }

  const existing = await c.env.DB
    .prepare("SELECT id FROM civic_citizen_reports WHERE id = ? AND tenantId = ? AND deletedAt IS NULL")
    .bind(id, payload.tenantId)
    .first<{ id: string }>();
  if (!existing) return apiError("Report not found", 404);

  const now = nowMs();

  await c.env.DB
    .prepare(`
      UPDATE civic_citizen_reports
      SET assignedDepartment = ?,
          priority = COALESCE(?, priority),
          status = CASE WHEN status = 'open' THEN 'in_progress' ELSE status END,
          updatedAt = ?
      WHERE id = ? AND tenantId = ?
    `)
    .bind(
      body.assignedDepartment,
      body.priority ?? null,
      now,
      id,
      payload.tenantId
    )
    .run();

  const updated = await c.env.DB
    .prepare("SELECT * FROM civic_citizen_reports WHERE id = ?")
    .bind(id)
    .first<CitizenReport>();

  logger.withTenant(payload.tenantId).info("Report assigned", {
    reportId: id,
    department: body.assignedDepartment,
    priority: body.priority,
  });
  return apiSuccess(updated);
});

export default app;
