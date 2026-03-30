/**
 * WebWaka Civic — Church/NGO Hono API Router
 * Blueprint Reference: Part 10.9 (Civic & Political Suite — Church & NGO)
 * Part 9.2 (Universal Architecture Standards)
 * Part 9.3 (Platform Conventions)
 *
 * API Response Format: { success: true, data: ... } | { success: false, error: ... }
 * Authentication: Edge-based JWT validation
 * RBAC: admin | leader | member | viewer
 * All monetary values: kobo integers (Blueprint Part 9.2)
 */

import { Hono } from "hono";
import { emitEvent } from "@webwaka/core";
import { createEventBus, type EventBusEnv } from "../../../core/event-bus/index";
import { createLogger } from "../../../core/logger";
import {
  createDonation,
  createEvent,
  createGrant,
  createMember,
  createPledge,
  disburseGrant,
  getAnnouncementsByOrg,
  getAttendanceByEvent,
  getDashboardSummary,
  getDonationSummary,
  getDonationsByOrg,
  getEventsByOrg,
  getGrantsByOrg,
  getMemberById,
  getMemberCount,
  getMembersByOrg,
  getOrganizationByTenant,
  getPledgesByOrg,
  getTotalDonationsKobo,
  recordAttendance,
  recordPledgePayment,
  softDeleteMember,
  updateMember,
  updateOrganization,
  type D1Database,
} from "../../../core/db/queries";
import type {
  CivicAttendance,
  CivicDonation,
  CivicEvent,
  CivicGrant,
  CivicMember,
  CivicPledge,
} from "../../../core/db/schema";
import { MIGRATION_SQL } from "../../../core/db/schema";

// ─── Environment ──────────────────────────────────────────────────────────────

interface Env extends EventBusEnv {
  DB: D1Database;
  STORAGE: R2Bucket;
  JWT_SECRET: string;
}

// ─── JWT Payload ──────────────────────────────────────────────────────────────

interface JWTPayload {
  sub: string;
  tenantId: string;
  organizationId: string;
  role: "admin" | "leader" | "member" | "viewer";
  name: string;
  exp: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function generateId(): string {
  return crypto.randomUUID();
}

function now(): number {
  return Date.now();
}

function koboToNaira(kobo: number): string {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    minimumFractionDigits: 2,
  }).format(kobo / 100);
}

function apiSuccess<T>(data: T): Response {
  return new Response(JSON.stringify({ success: true, data }), {
    headers: { "Content-Type": "application/json" },
  });
}

function apiError(message: string, status = 400): Response {
  return new Response(JSON.stringify({ success: false, error: message }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// ─── Edge JWT Validation ──────────────────────────────────────────────────────

async function verifyJWT(token: string, secret: string): Promise<JWTPayload | null> {
  try {
    const [headerB64, payloadB64, signatureB64] = token.split(".");
    if (!headerB64 || !payloadB64 || !signatureB64) return null;

    const encoder = new TextEncoder();
    const keyData = encoder.encode(secret);
    const key = await crypto.subtle.importKey(
      "raw",
      keyData,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"]
    );

    const data = encoder.encode(`${headerB64}.${payloadB64}`);
    const signature = Uint8Array.from(
      atob(signatureB64.replace(/-/g, "+").replace(/_/g, "/")),
      (c) => c.charCodeAt(0)
    );

    const valid = await crypto.subtle.verify("HMAC", key, signature, data);
    if (!valid) return null;

    const payload = JSON.parse(atob(payloadB64)) as JWTPayload;
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;

    return payload;
  } catch {
    return null;
  }
}

// ─── App ──────────────────────────────────────────────────────────────────────

const app = new Hono<{ Bindings: Env }>();

// ─── Auth Middleware ──────────────────────────────────────────────────────────

app.use("/api/civic/*", async (c, next) => {
  const authHeader = c.req.header("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return apiError("Unauthorized — missing token", 401);
  }

  const token = authHeader.slice(7);
  const payload = await verifyJWT(token, c.env.JWT_SECRET);
  if (payload === null) {
    return apiError("Unauthorized — invalid or expired token", 401);
  }

  c.set("jwtPayload" as never, payload);
  return next();
});

// ─── Health Check ─────────────────────────────────────────────────────────────

app.get("/health", (c) => {
  return c.json({ status: "ok", service: "webwaka-civic", timestamp: new Date().toISOString() });
});

// ─── DB Migration ─────────────────────────────────────────────────────────────

app.post("/api/civic/migrate", async (c) => {
  const logger = createLogger("migrate");
  try {
    await c.env.DB.exec(MIGRATION_SQL);
    logger.info("Database migration completed");
    return apiSuccess({ message: "Migration completed" });
  } catch (err) {
    logger.error("Migration failed", { error: String(err) });
    return apiError("Migration failed", 500);
  }
});

// ─── Organization ─────────────────────────────────────────────────────────────

app.get("/api/civic/organization", async (c) => {
  const payload = c.get("jwtPayload" as never) as JWTPayload;
  const logger = createLogger("organization", payload.tenantId);

  try {
    const org = await getOrganizationByTenant(c.env.DB, payload.tenantId);
    if (!org) return apiError("Organization not found", 404);
    return apiSuccess(org);
  } catch (err) {
    logger.error("Failed to get organization", { error: String(err) });
    return apiError("Internal server error", 500);
  }
});

app.patch("/api/civic/organization", async (c) => {
  const payload = c.get("jwtPayload" as never) as JWTPayload;
  const logger = createLogger("organization", payload.tenantId);

  if (payload.role !== "admin") {
    return apiError("Forbidden — admin role required", 403);
  }

  try {
    const body = await c.req.json<Record<string, unknown>>();
    const org = await getOrganizationByTenant(c.env.DB, payload.tenantId);
    if (!org) return apiError("Organization not found", 404);

    await updateOrganization(c.env.DB, org.id, payload.tenantId, body);
    logger.info("Organization updated");
    return apiSuccess({ message: "Organization updated" });
  } catch (err) {
    logger.error("Failed to update organization", { error: String(err) });
    return apiError("Internal server error", 500);
  }
});

// ─── Dashboard ────────────────────────────────────────────────────────────────

app.get("/api/civic/dashboard", async (c) => {
  const payload = c.get("jwtPayload" as never) as JWTPayload;
  const logger = createLogger("dashboard", payload.tenantId);

  try {
    const summary = await getDashboardSummary(
      c.env.DB,
      payload.tenantId,
      payload.organizationId
    );

    return apiSuccess({
      ...summary,
      totalDonationsFormatted: koboToNaira(summary.totalDonationsKobo),
    });
  } catch (err) {
    logger.error("Failed to get dashboard summary", { error: String(err) });
    return apiError("Internal server error", 500);
  }
});

// ─── Members ──────────────────────────────────────────────────────────────────

app.get("/api/civic/members", async (c) => {
  const payload = c.get("jwtPayload" as never) as JWTPayload;
  const logger = createLogger("members", payload.tenantId);

  try {
    const url = new URL(c.req.url);
    const filters = {
      status: url.searchParams.get("status") ?? undefined,
      departmentId: url.searchParams.get("departmentId") ?? undefined,
      discipleshipLevel: url.searchParams.get("discipleshipLevel") ?? undefined,
      search: url.searchParams.get("search") ?? undefined,
      limit: url.searchParams.get("limit") ? Number(url.searchParams.get("limit")) : undefined,
      offset: url.searchParams.get("offset") ? Number(url.searchParams.get("offset")) : undefined,
    };

    const members = await getMembersByOrg(
      c.env.DB,
      payload.tenantId,
      payload.organizationId,
      filters
    );
    const total = await getMemberCount(c.env.DB, payload.tenantId, payload.organizationId);

    return apiSuccess({ members, total });
  } catch (err) {
    logger.error("Failed to list members", { error: String(err) });
    return apiError("Internal server error", 500);
  }
});

app.get("/api/civic/members/:id", async (c) => {
  const payload = c.get("jwtPayload" as never) as JWTPayload;
  const logger = createLogger("members", payload.tenantId);

  try {
    const member = await getMemberById(c.env.DB, c.req.param("id"), payload.tenantId);
    if (!member) return apiError("Member not found", 404);
    return apiSuccess(member);
  } catch (err) {
    logger.error("Failed to get member", { error: String(err) });
    return apiError("Internal server error", 500);
  }
});

app.post("/api/civic/members", async (c) => {
  const payload = c.get("jwtPayload" as never) as JWTPayload;
  const logger = createLogger("members", payload.tenantId);

  if (payload.role !== "admin" && payload.role !== "leader") {
    return apiError("Forbidden — admin or leader role required", 403);
  }

  try {
    const body = await c.req.json<Partial<CivicMember>>();

    if (!body.firstName || !body.lastName) {
      return apiError("firstName and lastName are required");
    }

    const member: CivicMember = {
      id: generateId(),
      tenantId: payload.tenantId,
      organizationId: payload.organizationId,
      memberNumber: body.memberNumber,
      firstName: body.firstName,
      lastName: body.lastName,
      otherNames: body.otherNames,
      email: body.email,
      phone: body.phone,
      dateOfBirth: body.dateOfBirth,
      gender: body.gender,
      address: body.address,
      city: body.city,
      state: body.state,
      country: body.country ?? "NG",
      occupation: body.occupation,
      employer: body.employer,
      maritalStatus: body.maritalStatus,
      spouseName: body.spouseName,
      numberOfChildren: body.numberOfChildren ?? 0,
      departmentId: body.departmentId,
      memberStatus: body.memberStatus ?? "active",
      discipleshipLevel: body.discipleshipLevel ?? "new_convert",
      joinedAt: body.joinedAt ?? now(),
      baptismDate: body.baptismDate,
      ndprConsent: body.ndprConsent ?? 0,
      ndprConsentDate: body.ndprConsentDate,
      photoUrl: body.photoUrl,
      notes: body.notes,
      createdAt: now(),
      updatedAt: now(),
    };

    await createMember(c.env.DB, member);

    const eventBus = createEventBus(c.env);
    await eventBus.publish("civic.member.registered", payload.tenantId, payload.organizationId, {
      memberId: member.id,
      memberName: `${member.firstName} ${member.lastName}`,
    });

    logger.info("Member registered", { memberId: member.id });
    return apiSuccess(member);
  } catch (err) {
    logger.error("Failed to create member", { error: String(err) });
    return apiError("Internal server error", 500);
  }
});

app.patch("/api/civic/members/:id", async (c) => {
  const payload = c.get("jwtPayload" as never) as JWTPayload;
  const logger = createLogger("members", payload.tenantId);

  if (payload.role !== "admin" && payload.role !== "leader") {
    return apiError("Forbidden — admin or leader role required", 403);
  }

  try {
    const body = await c.req.json<Partial<CivicMember>>();
    await updateMember(c.env.DB, c.req.param("id"), payload.tenantId, body);

    const eventBus = createEventBus(c.env);
    await emitEvent(c.env, "civic.member.updated", payload.tenantId, { organizationId: payload.organizationId, ...{
      memberId: c.req.param("id"),
    } });

    logger.info("Member updated", { memberId: c.req.param("id") });
    return apiSuccess({ message: "Member updated" });
  } catch (err) {
    logger.error("Failed to update member", { error: String(err) });
    return apiError("Internal server error", 500);
  }
});

app.delete("/api/civic/members/:id", async (c) => {
  const payload = c.get("jwtPayload" as never) as JWTPayload;
  const logger = createLogger("members", payload.tenantId);

  if (payload.role !== "admin") {
    return apiError("Forbidden — admin role required", 403);
  }

  try {
    await softDeleteMember(c.env.DB, c.req.param("id"), payload.tenantId);

    const eventBus = createEventBus(c.env);
    await emitEvent(c.env, "civic.member.deactivated", payload.tenantId, { organizationId: payload.organizationId, ...{
      memberId: c.req.param("id"),
    } });

    logger.info("Member soft-deleted", { memberId: c.req.param("id") });
    return apiSuccess({ message: "Member deactivated" });
  } catch (err) {
    logger.error("Failed to delete member", { error: String(err) });
    return apiError("Internal server error", 500);
  }
});

// ─── Donations ────────────────────────────────────────────────────────────────

app.get("/api/civic/donations", async (c) => {
  const payload = c.get("jwtPayload" as never) as JWTPayload;
  const logger = createLogger("donations", payload.tenantId);

  try {
    const url = new URL(c.req.url);
    const filters = {
      donationType: url.searchParams.get("donationType") ?? undefined,
      memberId: url.searchParams.get("memberId") ?? undefined,
      startDate: url.searchParams.get("startDate") ? Number(url.searchParams.get("startDate")) : undefined,
      endDate: url.searchParams.get("endDate") ? Number(url.searchParams.get("endDate")) : undefined,
      limit: url.searchParams.get("limit") ? Number(url.searchParams.get("limit")) : undefined,
      offset: url.searchParams.get("offset") ? Number(url.searchParams.get("offset")) : undefined,
    };

    const donations = await getDonationsByOrg(
      c.env.DB,
      payload.tenantId,
      payload.organizationId,
      filters
    );
    const totalKobo = await getTotalDonationsKobo(
      c.env.DB,
      payload.tenantId,
      payload.organizationId
    );

    return apiSuccess({
      donations,
      totalKobo,
      totalFormatted: koboToNaira(totalKobo),
    });
  } catch (err) {
    logger.error("Failed to list donations", { error: String(err) });
    return apiError("Internal server error", 500);
  }
});

app.get("/api/civic/donations/summary", async (c) => {
  const payload = c.get("jwtPayload" as never) as JWTPayload;
  const logger = createLogger("donations", payload.tenantId);

  try {
    const url = new URL(c.req.url);
    const startDate = url.searchParams.get("startDate")
      ? Number(url.searchParams.get("startDate"))
      : now() - 30 * 24 * 60 * 60 * 1000; // default: last 30 days
    const endDate = url.searchParams.get("endDate")
      ? Number(url.searchParams.get("endDate"))
      : now();

    const summary = await getDonationSummary(
      c.env.DB,
      payload.tenantId,
      payload.organizationId,
      startDate,
      endDate
    );

    return apiSuccess({ summary });
  } catch (err) {
    logger.error("Failed to get donation summary", { error: String(err) });
    return apiError("Internal server error", 500);
  }
});

app.post("/api/civic/donations", async (c) => {
  const payload = c.get("jwtPayload" as never) as JWTPayload;
  const logger = createLogger("donations", payload.tenantId);

  if (payload.role !== "admin" && payload.role !== "leader") {
    return apiError("Forbidden — admin or leader role required", 403);
  }

  try {
    const body = await c.req.json<Partial<CivicDonation>>();

    if (!body.amountKobo || body.amountKobo <= 0) {
      return apiError("amountKobo must be a positive integer");
    }
    if (!body.donationType) {
      return apiError("donationType is required");
    }

    const donation: CivicDonation = {
      id: generateId(),
      tenantId: payload.tenantId,
      organizationId: payload.organizationId,
      memberId: body.memberId,
      donationType: body.donationType,
      amountKobo: body.amountKobo,
      currency: body.currency ?? "NGN",
      description: body.description,
      receiptNumber: body.receiptNumber ?? `RCT-${Date.now()}`,
      paymentMethod: body.paymentMethod ?? "cash",
      paymentReference: body.paymentReference,
      eventId: body.eventId,
      recordedBy: payload.sub,
      donationDate: body.donationDate ?? now(),
      createdAt: now(),
      updatedAt: now(),
    };

    await createDonation(c.env.DB, donation);

    const eventBus = createEventBus(c.env);
    await emitEvent(c.env, "civic.donation.recorded", payload.tenantId, { organizationId: payload.organizationId, ...{
      donationId: donation.id,
      amountKobo: donation.amountKobo,
      donationType: donation.donationType,
      memberId: donation.memberId,
    } });

    logger.info("Donation recorded", { donationId: donation.id, amountKobo: donation.amountKobo });
    return apiSuccess(donation);
  } catch (err) {
    logger.error("Failed to record donation", { error: String(err) });
    return apiError("Internal server error", 500);
  }
});

// ─── Pledges ──────────────────────────────────────────────────────────────────

app.get("/api/civic/pledges", async (c) => {
  const payload = c.get("jwtPayload" as never) as JWTPayload;
  const logger = createLogger("pledges", payload.tenantId);

  try {
    const url = new URL(c.req.url);
    const status = url.searchParams.get("status") ?? undefined;
    const pledges = await getPledgesByOrg(
      c.env.DB,
      payload.tenantId,
      payload.organizationId,
      status
    );
    return apiSuccess({ pledges });
  } catch (err) {
    logger.error("Failed to list pledges", { error: String(err) });
    return apiError("Internal server error", 500);
  }
});

app.post("/api/civic/pledges", async (c) => {
  const payload = c.get("jwtPayload" as never) as JWTPayload;
  const logger = createLogger("pledges", payload.tenantId);

  if (payload.role !== "admin" && payload.role !== "leader") {
    return apiError("Forbidden — admin or leader role required", 403);
  }

  try {
    const body = await c.req.json<Partial<CivicPledge>>();

    if (!body.memberId) return apiError("memberId is required");
    if (!body.totalAmountKobo || body.totalAmountKobo <= 0) {
      return apiError("totalAmountKobo must be a positive integer");
    }
    if (!body.description) return apiError("description is required");

    const pledge: CivicPledge = {
      id: generateId(),
      tenantId: payload.tenantId,
      organizationId: payload.organizationId,
      memberId: body.memberId,
      description: body.description,
      totalAmountKobo: body.totalAmountKobo,
      paidAmountKobo: 0,
      currency: body.currency ?? "NGN",
      pledgeStatus: "active",
      pledgeDate: body.pledgeDate ?? now(),
      dueDate: body.dueDate,
      createdAt: now(),
      updatedAt: now(),
    };

    await createPledge(c.env.DB, pledge);

    const eventBus = createEventBus(c.env);
    await emitEvent(c.env, "civic.pledge.created", payload.tenantId, { organizationId: payload.organizationId, ...{
      pledgeId: pledge.id,
      memberId: pledge.memberId,
      totalAmountKobo: pledge.totalAmountKobo,
    } });

    logger.info("Pledge created", { pledgeId: pledge.id });
    return apiSuccess(pledge);
  } catch (err) {
    logger.error("Failed to create pledge", { error: String(err) });
    return apiError("Internal server error", 500);
  }
});

app.post("/api/civic/pledges/:id/payment", async (c) => {
  const payload = c.get("jwtPayload" as never) as JWTPayload;
  const logger = createLogger("pledges", payload.tenantId);

  if (payload.role !== "admin" && payload.role !== "leader") {
    return apiError("Forbidden — admin or leader role required", 403);
  }

  try {
    const body = await c.req.json<{ amountKobo: number }>();

    if (!body.amountKobo || body.amountKobo <= 0) {
      return apiError("amountKobo must be a positive integer");
    }

    const updatedPledge = await recordPledgePayment(
      c.env.DB,
      c.req.param("id"),
      payload.tenantId,
      body.amountKobo
    );

    if (!updatedPledge) return apiError("Pledge not found", 404);

    const eventBus = createEventBus(c.env);
    const eventType =
      updatedPledge.pledgeStatus === "fulfilled"
        ? "civic.pledge.fulfilled"
        : "civic.pledge.payment_recorded";

    await emitEvent(c.env, eventType, payload.tenantId, { organizationId: payload.organizationId, ...{
      pledgeId: updatedPledge.id,
      paymentKobo: body.amountKobo,
      paidAmountKobo: updatedPledge.paidAmountKobo,
      totalAmountKobo: updatedPledge.totalAmountKobo,
    } });

    logger.info("Pledge payment recorded", {
      pledgeId: c.req.param("id"),
      amountKobo: body.amountKobo,
    });
    return apiSuccess(updatedPledge);
  } catch (err) {
    logger.error("Failed to record pledge payment", { error: String(err) });
    return apiError("Internal server error", 500);
  }
});

// ─── Events ───────────────────────────────────────────────────────────────────

app.get("/api/civic/events", async (c) => {
  const payload = c.get("jwtPayload" as never) as JWTPayload;
  const logger = createLogger("events", payload.tenantId);

  try {
    const url = new URL(c.req.url);
    const limit = url.searchParams.get("limit") ? Number(url.searchParams.get("limit")) : 20;
    const offset = url.searchParams.get("offset") ? Number(url.searchParams.get("offset")) : 0;

    const events = await getEventsByOrg(
      c.env.DB,
      payload.tenantId,
      payload.organizationId,
      limit,
      offset
    );
    return apiSuccess({ events });
  } catch (err) {
    logger.error("Failed to list events", { error: String(err) });
    return apiError("Internal server error", 500);
  }
});

app.post("/api/civic/events", async (c) => {
  const payload = c.get("jwtPayload" as never) as JWTPayload;
  const logger = createLogger("events", payload.tenantId);

  if (payload.role !== "admin" && payload.role !== "leader") {
    return apiError("Forbidden — admin or leader role required", 403);
  }

  try {
    const body = await c.req.json<Partial<CivicEvent>>();

    if (!body.title) return apiError("title is required");
    if (!body.startTime) return apiError("startTime is required");

    const event: CivicEvent = {
      id: generateId(),
      tenantId: payload.tenantId,
      organizationId: payload.organizationId,
      title: body.title,
      description: body.description,
      eventType: body.eventType ?? "sunday_service",
      venue: body.venue,
      startTime: body.startTime,
      endTime: body.endTime,
      expectedAttendance: body.expectedAttendance,
      offeringAmountKobo: body.offeringAmountKobo ?? 0,
      currency: body.currency ?? "NGN",
      notes: body.notes,
      createdBy: payload.sub,
      createdAt: now(),
      updatedAt: now(),
    };

    await createEvent(c.env.DB, event);

    const eventBus = createEventBus(c.env);
    await emitEvent(c.env, "civic.event.created", payload.tenantId, { organizationId: payload.organizationId, ...{
      eventId: event.id,
      title: event.title,
      eventType: event.eventType,
      startTime: event.startTime,
    } });

    logger.info("Event created", { eventId: event.id });
    return apiSuccess(event);
  } catch (err) {
    logger.error("Failed to create event", { error: String(err) });
    return apiError("Internal server error", 500);
  }
});

app.post("/api/civic/events/:id/attendance", async (c) => {
  const payload = c.get("jwtPayload" as never) as JWTPayload;
  const logger = createLogger("attendance", payload.tenantId);

  if (payload.role !== "admin" && payload.role !== "leader") {
    return apiError("Forbidden — admin or leader role required", 403);
  }

  try {
    const body = await c.req.json<{ memberId?: string; guestName?: string }>();

    if (!body.memberId && !body.guestName) {
      return apiError("Either memberId or guestName is required");
    }

    const attendance: CivicAttendance = {
      id: generateId(),
      tenantId: payload.tenantId,
      organizationId: payload.organizationId,
      eventId: c.req.param("id"),
      memberId: body.memberId,
      guestName: body.guestName,
      checkedInAt: now(),
      checkedInBy: payload.sub,
      createdAt: now(),
      updatedAt: now(),
    };

    await recordAttendance(c.env.DB, attendance);

    const eventBus = createEventBus(c.env);
    await eventBus.publish(
      "civic.event.attendance_recorded",
      payload.tenantId,
      payload.organizationId,
      {
        eventId: c.req.param("id"),
        memberId: body.memberId,
        attendanceId: attendance.id,
      }
    );

    logger.info("Attendance recorded", { eventId: c.req.param("id"), attendanceId: attendance.id });
    return apiSuccess(attendance);
  } catch (err) {
    logger.error("Failed to record attendance", { error: String(err) });
    return apiError("Internal server error", 500);
  }
});

app.get("/api/civic/events/:id/attendance", async (c) => {
  const payload = c.get("jwtPayload" as never) as JWTPayload;
  const logger = createLogger("attendance", payload.tenantId);

  try {
    const attendance = await getAttendanceByEvent(
      c.env.DB,
      c.req.param("id"),
      payload.tenantId
    );
    return apiSuccess({ attendance, count: attendance.length });
  } catch (err) {
    logger.error("Failed to get attendance", { error: String(err) });
    return apiError("Internal server error", 500);
  }
});

// ─── Grants ───────────────────────────────────────────────────────────────────

app.get("/api/civic/grants", async (c) => {
  const payload = c.get("jwtPayload" as never) as JWTPayload;
  const logger = createLogger("grants", payload.tenantId);

  if (payload.role !== "admin") {
    return apiError("Forbidden — admin role required", 403);
  }

  try {
    const grants = await getGrantsByOrg(c.env.DB, payload.tenantId, payload.organizationId);
    return apiSuccess({ grants });
  } catch (err) {
    logger.error("Failed to list grants", { error: String(err) });
    return apiError("Internal server error", 500);
  }
});

app.post("/api/civic/grants", async (c) => {
  const payload = c.get("jwtPayload" as never) as JWTPayload;
  const logger = createLogger("grants", payload.tenantId);

  if (payload.role !== "admin") {
    return apiError("Forbidden — admin role required", 403);
  }

  try {
    const body = await c.req.json<Partial<CivicGrant>>();

    if (!body.title) return apiError("title is required");
    if (!body.grantorName) return apiError("grantorName is required");
    if (!body.totalAmountKobo || body.totalAmountKobo <= 0) {
      return apiError("totalAmountKobo must be a positive integer");
    }

    const grant: CivicGrant = {
      id: generateId(),
      tenantId: payload.tenantId,
      organizationId: payload.organizationId,
      title: body.title,
      description: body.description,
      grantorName: body.grantorName,
      grantorContact: body.grantorContact,
      totalAmountKobo: body.totalAmountKobo,
      disbursedAmountKobo: 0,
      currency: body.currency ?? "NGN",
      grantStatus: "draft",
      applicationDate: body.applicationDate,
      createdBy: payload.sub,
      createdAt: now(),
      updatedAt: now(),
    };

    await createGrant(c.env.DB, grant);
    logger.info("Grant created", { grantId: grant.id });
    return apiSuccess(grant);
  } catch (err) {
    logger.error("Failed to create grant", { error: String(err) });
    return apiError("Internal server error", 500);
  }
});

app.post("/api/civic/grants/:id/disburse", async (c) => {
  const payload = c.get("jwtPayload" as never) as JWTPayload;
  const logger = createLogger("grants", payload.tenantId);

  if (payload.role !== "admin") {
    return apiError("Forbidden — admin role required", 403);
  }

  try {
    const body = await c.req.json<{ amountKobo: number }>();

    if (!body.amountKobo || body.amountKobo <= 0) {
      return apiError("amountKobo must be a positive integer");
    }

    await disburseGrant(c.env.DB, c.req.param("id"), payload.tenantId, body.amountKobo);

    const eventBus = createEventBus(c.env);
    await emitEvent(c.env, "civic.grant.disbursed", payload.tenantId, { organizationId: payload.organizationId, ...{
      grantId: c.req.param("id"),
      amountKobo: body.amountKobo,
    } });

    logger.info("Grant disbursed", { grantId: c.req.param("id"), amountKobo: body.amountKobo });
    return apiSuccess({ message: "Grant disbursed" });
  } catch (err) {
    logger.error("Failed to disburse grant", { error: String(err) });
    return apiError("Internal server error", 500);
  }
});

// ─── Announcements ────────────────────────────────────────────────────────────

app.get("/api/civic/announcements", async (c) => {
  const payload = c.get("jwtPayload" as never) as JWTPayload;
  const logger = createLogger("announcements", payload.tenantId);

  try {
    const announcements = await getAnnouncementsByOrg(
      c.env.DB,
      payload.tenantId,
      payload.organizationId
    );
    return apiSuccess({ announcements });
  } catch (err) {
    logger.error("Failed to list announcements", { error: String(err) });
    return apiError("Internal server error", 500);
  }
});

// ─── CORE-1 Sync Endpoint ─────────────────────────────────────────────────────

app.post("/api/civic/sync", async (c) => {
  const payload = c.get("jwtPayload" as never) as JWTPayload;
  const logger = createLogger("sync", payload.tenantId);

  try {
    const body = await c.req.json<{
      entityType: string;
      entityId: string;
      operation: string;
      payload: Record<string, unknown>;
      tenantId: string;
      organizationId: string;
    }>();

    // Validate tenant isolation
    if (body.tenantId !== payload.tenantId) {
      return apiError("Forbidden — tenant mismatch", 403);
    }

    logger.info("Sync mutation received", {
      entityType: body.entityType,
      operation: body.operation,
      entityId: body.entityId,
    });

    // Route to appropriate handler based on entity type and operation
    // This is a simplified sync endpoint — full CRDT reconciliation
    // is handled by CORE-1 Universal Offline Sync Engine
    return apiSuccess({
      synced: true,
      entityId: body.entityId,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    logger.error("Sync failed", { error: String(err) });
    return apiError("Sync failed", 500);
  }
});

export default app;
