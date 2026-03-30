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
  createCivicAuthMiddleware,
  CIVIC_JWT_KEY,
  type CivicJWTPayload,
} from "../../../core/auth";
import {
  apiSuccess,
  apiError,
  koboToNaira,
  generateId,
  nowMs,
} from "../../../core/response";
import { createDocumentService } from "../../../core/services/documents";
import { createNotificationService } from "../../../core/services/notifications";
import {
  createPaymentService,
  verifyPaystackWebhook,
  type PaystackWebhookBody,
} from "../../../core/services/payments";
import {
  createBudget,
  createDepartment,
  createDonation,
  createEvent,
  createExpense,
  createGrant,
  createMember,
  createPledge,
  disburseGrant,
  getAnnouncementsByOrg,
  getAttendanceByEvent,
  getBudgetsByOrg,
  getDashboardSummary,
  getDepartmentById,
  getDepartmentsByOrg,
  getDonationSummary,
  getDonationsByOrg,
  getEventsByOrg,
  getExpensesByOrg,
  getGrantsByOrg,
  getMemberById,
  getMemberCount,
  getMembersByOrg,
  getOrganizationByTenant,
  getPledgesByOrg,
  getTotalDonationsKobo,
  getTotalExpensesKobo,
  recordAttendance,
  recordPledgePayment,
  softDeleteDepartment,
  softDeleteExpense,
  softDeleteMember,
  updateDepartment,
  updateExpenseStatus,
  updateMember,
  updateOrganization,
  insertWebhookLog,
  webhookLogExists,
  getWebhookLogs,
  type D1Database,
} from "../../../core/db/queries";
import type {
  CivicAttendance,
  CivicBudget,
  CivicDepartment,
  CivicDonation,
  CivicEvent,
  CivicExpense,
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
  PAYSTACK_SECRET: string;
}

// ─── App ──────────────────────────────────────────────────────────────────────

const app = new Hono<{ Bindings: Env }>();

// ─── Auth Middleware ──────────────────────────────────────────────────────────

app.use("/api/civic/*", createCivicAuthMiddleware<CivicJWTPayload>());

// ─── Health Check ─────────────────────────────────────────────────────────────

app.get("/health", (c) => {
  return c.json({ status: "ok", service: "webwaka-civic", timestamp: new Date().toISOString() });
});

// ─── Paystack Webhook ─────────────────────────────────────────────────────────
// POST /webhooks/paystack — outside /api/civic/* auth scope; Paystack calls this.
// HMAC-SHA512 signature verification replaces JWT auth for this endpoint.

app.post("/webhooks/paystack", async (c) => {
  const rawBody = await c.req.text();
  const signature = c.req.header("x-paystack-signature") ?? "";

  const valid = await verifyPaystackWebhook(rawBody, signature, c.env.PAYSTACK_SECRET ?? "");
  if (!valid) {
    logger.warn("Paystack webhook signature invalid");
    return new Response(JSON.stringify({ error: "Invalid signature" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  let body: PaystackWebhookBody;
  try {
    body = JSON.parse(rawBody) as PaystackWebhookBody;
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const referenceId = body.data.reference;
  const tenantId = (body.data.metadata?.tenantId as string) ?? "platform";
  const eventKey = `${body.event}:${referenceId}`;

  // Idempotency — skip if we already processed this reference
  const alreadyProcessed = await webhookLogExists(c.env.DB, "paystack", eventKey);
  if (alreadyProcessed) {
    logger.info("Paystack webhook duplicate — skipped", { event: body.event, reference: referenceId });
    return new Response(JSON.stringify({ received: true, duplicate: true }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  // Log the incoming event first (idempotency guard)
  await insertWebhookLog(c.env.DB, {
    id: generateId(),
    tenantId,
    provider: "paystack",
    event: body.event,
    reference: eventKey,
    status: "received",
    processedAt: nowMs(),
    createdAt: nowMs(),
  });

  const isSuccess = body.data.status === "success";
  const newPaymentStatus = isSuccess ? "success" : "failed";

  // Update civic_donations by matching the referenceId to the donation id
  await c.env.DB.prepare(
    `UPDATE civic_donations
     SET paymentStatus = ?, paymentReference = ?, updatedAt = ?
     WHERE id = ? AND deletedAt IS NULL`
  ).bind(newPaymentStatus, referenceId, nowMs(), referenceId).run();

  if (isSuccess) {
    await emitEvent(c.env, "payment.verified", tenantId, {
      reference: referenceId,
      amountKobo: body.data.amount,
      paidAt: body.data.paid_at,
      channel: body.data.channel,
      metadata: body.data.metadata,
    });
  } else {
    await emitEvent(c.env, "payment.failed", tenantId, {
      reference: referenceId,
      status: body.data.status,
      metadata: body.data.metadata,
    });
  }

  logger.info("Paystack webhook processed", { event: body.event, reference: referenceId, status: body.data.status, paymentStatus: newPaymentStatus });
  return new Response(JSON.stringify({ received: true }), {
    headers: { "Content-Type": "application/json" },
  });
});

// GET /api/civic/webhook-log — admin-only paginated webhook event log
app.get("/api/civic/webhook-log", async (c) => {
  const payload = c.get("civicJwt" as never) as { role?: string; tenantId: string };
  if (payload.role !== "admin") {
    return c.json({ success: false, error: "Forbidden — admin role required" }, 403);
  }
  const url = new URL(c.req.url);
  const limit = Math.min(Number(url.searchParams.get("limit") ?? "50"), 200);
  const page  = Math.max(Number(url.searchParams.get("page") ?? "1"), 1);
  const offset = (page - 1) * limit;
  const logs = await getWebhookLogs(c.env.DB, payload.tenantId, limit, offset);
  return c.json({ success: true, data: { logs, page, limit } });
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
  const payload = c.get(CIVIC_JWT_KEY as never) as CivicJWTPayload;
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
  const payload = c.get(CIVIC_JWT_KEY as never) as CivicJWTPayload;
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
  const payload = c.get(CIVIC_JWT_KEY as never) as CivicJWTPayload;
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

// ─── Departments ──────────────────────────────────────────────────────────────

app.get("/api/civic/departments", async (c) => {
  const payload = c.get(CIVIC_JWT_KEY as never) as CivicJWTPayload;
  const departments = await getDepartmentsByOrg(
    c.env.DB,
    payload.tenantId,
    payload.organizationId
  );
  return apiSuccess(departments);
});

app.post("/api/civic/departments", async (c) => {
  const payload = c.get(CIVIC_JWT_KEY as never) as CivicJWTPayload;
  if (payload.role !== "admin" && payload.role !== "leader") {
    return apiError("Forbidden — admin or leader only", 403);
  }
  const body = await c.req.json<Omit<CivicDepartment, "id" | "tenantId" | "organizationId" | "createdAt" | "updatedAt">>();
  if (!body.name) {
    return apiError("name is required");
  }
  const dept: CivicDepartment = {
    id: generateId(),
    tenantId: payload.tenantId,
    organizationId: payload.organizationId,
    name: body.name,
    description: body.description,
    leaderId: body.leaderId,
    createdAt: nowMs(),
    updatedAt: nowMs(),
  };
  await createDepartment(c.env.DB, dept);
  await emitEvent(c.env, "civic.member.created", payload.tenantId, {
    organizationId: payload.organizationId,
    entityType: "department",
    departmentId: dept.id,
    name: dept.name,
  });
  logger.info("Civic department created", { id: dept.id, name: dept.name, tenantId: payload.tenantId });
  return apiSuccess(dept);
});

app.patch("/api/civic/departments/:id", async (c) => {
  const payload = c.get(CIVIC_JWT_KEY as never) as CivicJWTPayload;
  if (payload.role !== "admin" && payload.role !== "leader") {
    return apiError("Forbidden — admin or leader only", 403);
  }
  const id = c.req.param("id");
  const existing = await getDepartmentById(c.env.DB, id, payload.tenantId);
  if (!existing) {
    return apiError("Department not found", 404);
  }
  const body = await c.req.json<Partial<Pick<CivicDepartment, "name" | "description" | "leaderId">>>();
  await updateDepartment(c.env.DB, id, payload.tenantId, body);
  return apiSuccess({ updated: true });
});

app.delete("/api/civic/departments/:id", async (c) => {
  const payload = c.get(CIVIC_JWT_KEY as never) as CivicJWTPayload;
  if (payload.role !== "admin") {
    return apiError("Forbidden — admin only", 403);
  }
  const id = c.req.param("id");
  const existing = await getDepartmentById(c.env.DB, id, payload.tenantId);
  if (!existing) {
    return apiError("Department not found", 404);
  }
  await softDeleteDepartment(c.env.DB, id, payload.tenantId);
  return apiSuccess({ deleted: true });
});

// ─── Members ──────────────────────────────────────────────────────────────────

app.get("/api/civic/members", async (c) => {
  const payload = c.get(CIVIC_JWT_KEY as never) as CivicJWTPayload;
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
  const payload = c.get(CIVIC_JWT_KEY as never) as CivicJWTPayload;
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
  const payload = c.get(CIVIC_JWT_KEY as never) as CivicJWTPayload;
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
      joinedAt: body.joinedAt ?? nowMs(),
      baptismDate: body.baptismDate,
      ndprConsent: body.ndprConsent ?? 0,
      ndprConsentDate: body.ndprConsentDate,
      photoUrl: body.photoUrl,
      notes: body.notes,
      createdAt: nowMs(),
      updatedAt: nowMs(),
    };

    await createMember(c.env.DB, member);

    const eventBus = createEventBus(c.env);
    await eventBus.publish("civic.member.registered", payload.tenantId, payload.organizationId, {
      memberId: member.id,
      memberName: `${member.firstName} ${member.lastName}`,
    });

    // T001: E03 — send welcome notification via platform CORE-COMMS
    if (member.phone || member.email) {
      const notifSvc = createNotificationService(c.env);
      await notifSvc.sendWelcome(c.env, {
        tenantId: payload.tenantId,
        organizationId: payload.organizationId,
        recipientPhone: member.phone,
        recipientEmail: member.email,
        name: member.firstName,
        membershipNumber: member.id,
      }).catch((e) => logger.error("Welcome notification failed", { error: String(e) }));
    }

    // Phase 6: generate member ID card document via CORE-DOCS
    const docSvc = createDocumentService(c.env);
    docSvc.requestMemberIdCard({
      tenantId: payload.tenantId,
      organizationId: payload.organizationId,
      memberName: `${member.firstName} ${member.lastName}`,
      memberPhone: member.phone,
      membershipNumber: member.id,
      photoUrl: member.photoUrl,
      organizationName: payload.organizationId,
      cardType: "member_id_card",
    }).catch((e) => logger.error("Member ID card generation failed", { error: String(e) }));

    logger.info("Member registered", { memberId: member.id });
    return apiSuccess(member);
  } catch (err) {
    logger.error("Failed to create member", { error: String(err) });
    return apiError("Internal server error", 500);
  }
});

app.patch("/api/civic/members/:id", async (c) => {
  const payload = c.get(CIVIC_JWT_KEY as never) as CivicJWTPayload;
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
  const payload = c.get(CIVIC_JWT_KEY as never) as CivicJWTPayload;
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
  const payload = c.get(CIVIC_JWT_KEY as never) as CivicJWTPayload;
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
  const payload = c.get(CIVIC_JWT_KEY as never) as CivicJWTPayload;
  const logger = createLogger("donations", payload.tenantId);

  try {
    const url = new URL(c.req.url);
    const startDate = url.searchParams.get("startDate")
      ? Number(url.searchParams.get("startDate"))
      : nowMs() - 30 * 24 * 60 * 60 * 1000; // default: last 30 days
    const endDate = url.searchParams.get("endDate")
      ? Number(url.searchParams.get("endDate"))
      : nowMs();

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
  const payload = c.get(CIVIC_JWT_KEY as never) as CivicJWTPayload;
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
      donationDate: body.donationDate ?? nowMs(),
      createdAt: nowMs(),
      updatedAt: nowMs(),
    };

    await createDonation(c.env.DB, donation);

    const eventBus = createEventBus(c.env);
    await emitEvent(c.env, "civic.donation.recorded", payload.tenantId, { organizationId: payload.organizationId, ...{
      donationId: donation.id,
      amountKobo: donation.amountKobo,
      donationType: donation.donationType,
      memberId: donation.memberId,
    } });

    // T001: E03 — donation receipt notification
    if (body.customerPhone || body.customerEmail) {
      const notifSvc = createNotificationService(c.env);
      await notifSvc.requestNotification({
        tenantId: payload.tenantId,
        organizationId: payload.organizationId,
        recipientPhone: body.customerPhone as string | undefined,
        recipientEmail: body.customerEmail as string | undefined,
        channel: body.customerPhone ? "whatsapp" : "email",
        templateId: "donation.receipt",
        data: {
          receiptNumber: donation.receiptNumber,
          amountKobo: donation.amountKobo,
          donationType: donation.donationType,
        },
        priority: "high",
        idempotencyKey: `donation-receipt:${donation.id}`,
      }).catch((e) => logger.error("Donation receipt notification failed", { error: String(e) }));

      // Phase 6: generate donation receipt PDF via CORE-DOCS
      const docSvc = createDocumentService(c.env);
      docSvc.requestDonationReceipt({
        tenantId: payload.tenantId,
        organizationId: payload.organizationId,
        donorName: (body.customerName as string | undefined) ?? "Donor",
        donorPhone: body.customerPhone as string | undefined,
        donorEmail: body.customerEmail as string | undefined,
        amountKobo: donation.amountKobo,
        receiptNumber: donation.receiptNumber ?? donation.id,
        donationDate: donation.donationDate,
        organizationName: payload.organizationId,
      }).catch((e) => logger.error("Donation receipt PDF generation failed", { error: String(e) }));
    }

    if (donation.paymentMethod === "paystack" && body.customerEmail) {
      const paySvc = createPaymentService(c.env);
      await paySvc.initializePayment({
        tenantId: payload.tenantId,
        organizationId: payload.organizationId,
        amountKobo: donation.amountKobo,
        customerEmail: body.customerEmail as string,
        customerPhone: body.customerPhone as string | undefined,
        category: "donation",
        referenceId: donation.id,
        metadata: {
          donationType: donation.donationType,
          memberId: donation.memberId,
          receiptNumber: donation.receiptNumber,
        },
      });
    }

    logger.info("Donation recorded", { donationId: donation.id, amountKobo: donation.amountKobo });
    return apiSuccess(donation);
  } catch (err) {
    logger.error("Failed to record donation", { error: String(err) });
    return apiError("Internal server error", 500);
  }
});

// ─── Pledges ──────────────────────────────────────────────────────────────────

app.get("/api/civic/pledges", async (c) => {
  const payload = c.get(CIVIC_JWT_KEY as never) as CivicJWTPayload;
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
  const payload = c.get(CIVIC_JWT_KEY as never) as CivicJWTPayload;
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
      pledgeDate: body.pledgeDate ?? nowMs(),
      dueDate: body.dueDate,
      createdAt: nowMs(),
      updatedAt: nowMs(),
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
  const payload = c.get(CIVIC_JWT_KEY as never) as CivicJWTPayload;
  const logger = createLogger("pledges", payload.tenantId);

  if (payload.role !== "admin" && payload.role !== "leader") {
    return apiError("Forbidden — admin or leader role required", 403);
  }

  try {
    const body = await c.req.json<{ amountKobo: number; customerEmail?: string; via?: "cash" | "paystack" }>();

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

    // T001: E03 — thank-you notification on pledge fulfillment
    if (updatedPledge.pledgeStatus === "fulfilled") {
      const notifSvc = createNotificationService(c.env);
      await notifSvc.requestNotification({
        tenantId: payload.tenantId,
        organizationId: payload.organizationId,
        channel: "whatsapp",
        templateId: "pledge.fulfilled",
        data: {
          pledgeId: updatedPledge.id,
          totalAmountKobo: updatedPledge.totalAmountKobo,
        },
        priority: "normal",
        idempotencyKey: `pledge-fulfilled:${updatedPledge.id}`,
      }).catch((e) => logger.error("Pledge fulfilled notification failed", { error: String(e) }));
    }

    if (body.via === "paystack" && body.customerEmail) {
      const paySvc = createPaymentService(c.env);
      await paySvc.initializePayment({
        tenantId: payload.tenantId,
        organizationId: payload.organizationId,
        amountKobo: body.amountKobo,
        customerEmail: body.customerEmail,
        category: "pledge_payment",
        referenceId: `pledge-${updatedPledge.id}-${nowMs()}`,
        metadata: { pledgeId: updatedPledge.id },
      });
    }

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
  const payload = c.get(CIVIC_JWT_KEY as never) as CivicJWTPayload;
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
  const payload = c.get(CIVIC_JWT_KEY as never) as CivicJWTPayload;
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
      createdAt: nowMs(),
      updatedAt: nowMs(),
    };

    await createEvent(c.env.DB, event);

    const eventBus = createEventBus(c.env);
    await emitEvent(c.env, "civic.event.created", payload.tenantId, { organizationId: payload.organizationId, ...{
      eventId: event.id,
      title: event.title,
      eventType: event.eventType,
      startTime: event.startTime,
    } });

    // T001: E03 — broadcast upcoming event notification to org members
    const notifSvc = createNotificationService(c.env);
    await notifSvc.requestNotification({
      tenantId: payload.tenantId,
      organizationId: payload.organizationId,
      channel: "whatsapp",
      templateId: "event.upcoming",
      data: { title: event.title, startTime: event.startTime, venue: event.venue ?? "" },
      priority: "normal",
      idempotencyKey: `event-upcoming:${event.id}`,
    }).catch((e) => logger.error("Event notification failed", { error: String(e) }));

    logger.info("Event created", { eventId: event.id });
    return apiSuccess(event);
  } catch (err) {
    logger.error("Failed to create event", { error: String(err) });
    return apiError("Internal server error", 500);
  }
});

app.post("/api/civic/events/:id/attendance", async (c) => {
  const payload = c.get(CIVIC_JWT_KEY as never) as CivicJWTPayload;
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
      checkedInAt: nowMs(),
      checkedInBy: payload.sub,
      createdAt: nowMs(),
      updatedAt: nowMs(),
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
  const payload = c.get(CIVIC_JWT_KEY as never) as CivicJWTPayload;
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
  const payload = c.get(CIVIC_JWT_KEY as never) as CivicJWTPayload;
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
  const payload = c.get(CIVIC_JWT_KEY as never) as CivicJWTPayload;
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
      createdAt: nowMs(),
      updatedAt: nowMs(),
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
  const payload = c.get(CIVIC_JWT_KEY as never) as CivicJWTPayload;
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

// ─── Expenses ─────────────────────────────────────────────────────────────────

app.get("/api/civic/expenses", async (c) => {
  const payload = c.get(CIVIC_JWT_KEY as never) as CivicJWTPayload;
  const q = c.req.query;
  const expenses = await getExpensesByOrg(
    c.env.DB,
    payload.tenantId,
    payload.organizationId,
    {
      departmentId: q("departmentId") ?? undefined,
      status: (q("status") as CivicExpenseStatus) ?? undefined,
      category: q("category") ?? undefined,
      fromDate: q("fromDate") ? parseInt(q("fromDate")!, 10) : undefined,
      toDate: q("toDate") ? parseInt(q("toDate")!, 10) : undefined,
    },
    q("limit") ? parseInt(q("limit")!, 10) : 50,
    q("offset") ? parseInt(q("offset")!, 10) : 0
  );
  return apiSuccess(expenses);
});

app.post("/api/civic/expenses", async (c) => {
  const payload = c.get(CIVIC_JWT_KEY as never) as CivicJWTPayload;
  const body = await c.req.json<Omit<CivicExpense, "id" | "tenantId" | "organizationId" | "createdAt" | "updatedAt">>();
  if (!body.category || !body.description || !body.amountKobo || !body.expenseDate) {
    return apiError("category, description, amountKobo, and expenseDate are required");
  }
  if (body.amountKobo <= 0) {
    return apiError("amountKobo must be a positive integer");
  }
  const expense: CivicExpense = {
    id: generateId(),
    tenantId: payload.tenantId,
    organizationId: payload.organizationId,
    departmentId: body.departmentId,
    category: body.category,
    description: body.description,
    amountKobo: body.amountKobo,
    currency: body.currency ?? "NGN",
    expenseDate: body.expenseDate,
    receiptUrl: body.receiptUrl,
    recordedBy: payload.sub,
    status: "pending",
    notes: body.notes,
    createdAt: nowMs(),
    updatedAt: nowMs(),
  };
  await createExpense(c.env.DB, expense);
  await emitEvent(c.env, "expense.recorded", payload.tenantId, {
    organizationId: payload.organizationId,
    expenseId: expense.id,
    amountKobo: expense.amountKobo,
    category: expense.category,
  });
  logger.info("Expense recorded", { id: expense.id, amountKobo: expense.amountKobo, tenantId: payload.tenantId });
  return apiSuccess(expense);
});

app.patch("/api/civic/expenses/:id/status", async (c) => {
  const payload = c.get(CIVIC_JWT_KEY as never) as CivicJWTPayload;
  if (payload.role !== "admin" && payload.role !== "leader") {
    return apiError("Forbidden — admin or leader only", 403);
  }
  const id = c.req.param("id");
  const body = await c.req.json<{ status: "approved" | "rejected" }>();
  if (!body.status || !["approved", "rejected"].includes(body.status)) {
    return apiError("status must be 'approved' or 'rejected'");
  }
  await updateExpenseStatus(c.env.DB, id, payload.tenantId, body.status, payload.sub);
  await emitEvent(c.env, "expense.approved", payload.tenantId, {
    organizationId: payload.organizationId,
    expenseId: id,
    status: body.status,
    approvedBy: payload.sub,
  });
  return apiSuccess({ updated: true });
});

app.delete("/api/civic/expenses/:id", async (c) => {
  const payload = c.get(CIVIC_JWT_KEY as never) as CivicJWTPayload;
  if (payload.role !== "admin") {
    return apiError("Forbidden — admin only", 403);
  }
  const id = c.req.param("id");
  await softDeleteExpense(c.env.DB, id, payload.tenantId);
  return apiSuccess({ deleted: true });
});

app.get("/api/civic/expenses/summary", async (c) => {
  const payload = c.get(CIVIC_JWT_KEY as never) as CivicJWTPayload;
  const year = c.req.query("year") ? parseInt(c.req.query("year")!, 10) : new Date().getFullYear();
  const totalKobo = await getTotalExpensesKobo(c.env.DB, payload.tenantId, payload.organizationId, year);
  return apiSuccess({
    year,
    totalApprovedKobo: totalKobo,
    totalApprovedFormatted: koboToNaira(totalKobo),
  });
});

// ─── Budgets ──────────────────────────────────────────────────────────────────

app.get("/api/civic/budgets", async (c) => {
  const payload = c.get(CIVIC_JWT_KEY as never) as CivicJWTPayload;
  const year = c.req.query("year") ? parseInt(c.req.query("year")!, 10) : undefined;
  const budgets = await getBudgetsByOrg(c.env.DB, payload.tenantId, payload.organizationId, year);
  return apiSuccess(budgets);
});

app.post("/api/civic/budgets", async (c) => {
  const payload = c.get(CIVIC_JWT_KEY as never) as CivicJWTPayload;
  if (payload.role !== "admin" && payload.role !== "leader") {
    return apiError("Forbidden — admin or leader only", 403);
  }
  const body = await c.req.json<Omit<CivicBudget, "id" | "tenantId" | "organizationId" | "createdAt" | "updatedAt">>();
  if (!body.year || !body.category || !body.amountKobo) {
    return apiError("year, category, and amountKobo are required");
  }
  if (body.amountKobo <= 0) {
    return apiError("amountKobo must be a positive integer");
  }
  const budget: CivicBudget = {
    id: generateId(),
    tenantId: payload.tenantId,
    organizationId: payload.organizationId,
    departmentId: body.departmentId,
    year: body.year,
    month: body.month,
    category: body.category,
    amountKobo: body.amountKobo,
    currency: body.currency ?? "NGN",
    notes: body.notes,
    createdAt: nowMs(),
    updatedAt: nowMs(),
  };
  await createBudget(c.env.DB, budget);
  logger.info("Budget entry created", { id: budget.id, year: budget.year, category: budget.category, tenantId: payload.tenantId });
  return apiSuccess(budget);
});

// ─── Announcements ────────────────────────────────────────────────────────────

app.get("/api/civic/announcements", async (c) => {
  const payload = c.get(CIVIC_JWT_KEY as never) as CivicJWTPayload;
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

// ─── T002: E13 — Bulk Member Import (CSV / JSON) ──────────────────────────────

app.post("/api/civic/members/import", async (c) => {
  const payload = c.get(CIVIC_JWT_KEY as never) as CivicJWTPayload;
  const logger = createLogger("member-import", payload.tenantId);

  if (payload.role !== "admin") {
    return apiError("Forbidden — admin role required", 403);
  }

  try {
    const contentType = c.req.header("content-type") ?? "";
    let rows: Partial<CivicMember>[] = [];

    if (contentType.includes("text/csv")) {
      const text = await c.req.text();
      const lines = text.split("\n").filter((l) => l.trim());
      if (lines.length < 2) return apiError("CSV must have header + at least 1 row");
      const headers = lines[0].split(",").map((h) => h.trim());
      rows = lines.slice(1).map((line) => {
        const vals = line.split(",").map((v) => v.trim());
        const obj: Record<string, string> = {};
        headers.forEach((h, i) => { obj[h] = vals[i] ?? ""; });
        return obj as Partial<CivicMember>;
      });
    } else {
      const body = await c.req.json<{ rows: Partial<CivicMember>[] }>();
      rows = body.rows ?? [];
    }

    if (rows.length === 0) return apiError("No rows provided");
    if (rows.length > 200) return apiError("Maximum 200 rows per import");

    const notifSvc = createNotificationService(c.env);
    const eventBus = createEventBus(c.env);

    let imported = 0;
    let failed = 0;
    const errors: { row: number; reason: string }[] = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (!row.firstName || !row.lastName || !row.phone) {
        errors.push({ row: i + 1, reason: "firstName, lastName, phone are required" });
        failed++;
        continue;
      }
      try {
        const member: CivicMember = {
          id: generateId(),
          tenantId: payload.tenantId,
          organizationId: payload.organizationId,
          firstName: row.firstName,
          lastName: row.lastName,
          otherNames: row.otherNames,
          email: row.email,
          phone: row.phone,
          dateOfBirth: row.dateOfBirth,
          gender: row.gender ?? "prefer_not_to_say",
          address: row.address,
          city: row.city,
          state: row.state,
          country: row.country ?? "NG",
          occupation: row.occupation,
          memberStatus: row.memberStatus ?? "active",
          discipleshipLevel: row.discipleshipLevel ?? "new_convert",
          joinedAt: row.joinedAt ?? nowMs(),
          ndprConsent: row.ndprConsent ?? 0,
          createdAt: nowMs(),
          updatedAt: nowMs(),
        };
        await createMember(c.env.DB, member);
        await eventBus.publish("civic.member.registered", payload.tenantId, payload.organizationId, {
          memberId: member.id,
          memberName: `${member.firstName} ${member.lastName}`,
        });
        if (member.phone || member.email) {
          await notifSvc.sendWelcome(c.env, {
            tenantId: payload.tenantId,
            organizationId: payload.organizationId,
            recipientPhone: member.phone,
            recipientEmail: member.email,
            name: member.firstName,
            membershipNumber: member.id,
          }).catch(() => {});
        }
        imported++;
      } catch (rowErr) {
        errors.push({ row: i + 1, reason: String(rowErr) });
        failed++;
      }
    }

    logger.info("Bulk import complete", { imported, failed, tenantId: payload.tenantId });
    return apiSuccess({ imported, failed, errors });
  } catch (err) {
    logger.error("Bulk import failed", { error: String(err) });
    return apiError("Internal server error", 500);
  }
});

// ─── T005-T008: Phase 5 — Analytics, Projects, Donors & NDPR ─────────────────

// E07 — Donation Analytics
app.get("/api/civic/analytics/donations", async (c) => {
  const payload = c.get(CIVIC_JWT_KEY as never) as CivicJWTPayload;
  const logger = createLogger("analytics-donations", payload.tenantId);
  try {
    const env = c.env as { DB: D1Database };
    const db = env.DB;
    const { tenantId, organizationId } = payload;
    const nowMs2 = Date.now();
    const thisYearStart = new Date(new Date().getFullYear(), 0, 1).getTime();
    const lastYearStart = new Date(new Date().getFullYear() - 1, 0, 1).getTime();
    const lastYearEnd = thisYearStart - 1;

    // Monthly trend: last 12 calendar months
    const months: Array<{ month: string; totalKobo: number; count: number }> = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(nowMs2);
      d.setMonth(d.getMonth() - i);
      const start = new Date(d.getFullYear(), d.getMonth(), 1).getTime();
      const end = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999).getTime();
      const row = await db.prepare(
        `SELECT COALESCE(SUM(amountKobo),0) as total, COUNT(*) as cnt FROM civic_donations
         WHERE tenantId = ? AND organizationId = ? AND deletedAt IS NULL
         AND donationDate >= ? AND donationDate <= ?`
      ).bind(tenantId, organizationId, start, end).first<{ total: number; cnt: number }>();
      months.push({
        month: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
        totalKobo: row?.total ?? 0,
        count: row?.cnt ?? 0,
      });
    }

    // Department breakdown
    const deptRows = await db.prepare(
      `SELECT d.id, d.name, COALESCE(SUM(don.amountKobo),0) as total
       FROM civic_departments d
       LEFT JOIN civic_members m ON m.departmentId = d.id AND m.tenantId = ?
       LEFT JOIN civic_donations don ON don.memberId = m.id AND don.tenantId = ? AND don.deletedAt IS NULL
       WHERE d.tenantId = ? AND d.organizationId = ? AND d.deletedAt IS NULL
       GROUP BY d.id, d.name ORDER BY total DESC LIMIT 20`
    ).bind(tenantId, tenantId, tenantId, organizationId).all<{ id: string; name: string; total: number }>();

    // YoY
    const [thisYearKobo, lastYearKobo] = await Promise.all([
      db.prepare(`SELECT COALESCE(SUM(amountKobo),0) as t FROM civic_donations WHERE tenantId=? AND organizationId=? AND deletedAt IS NULL AND donationDate>=?`)
        .bind(tenantId, organizationId, thisYearStart).first<{ t: number }>(),
      db.prepare(`SELECT COALESCE(SUM(amountKobo),0) as t FROM civic_donations WHERE tenantId=? AND organizationId=? AND deletedAt IS NULL AND donationDate>=? AND donationDate<=?`)
        .bind(tenantId, organizationId, lastYearStart, lastYearEnd).first<{ t: number }>(),
    ]);
    const tyKobo = thisYearKobo?.t ?? 0;
    const lyKobo = lastYearKobo?.t ?? 0;
    const percentChange = lyKobo > 0 ? Math.round(((tyKobo - lyKobo) / lyKobo) * 10000) / 100 : null;

    // Top-givers tiers (major ≥ 500k/yr, regular ≥ 50k/yr, lapsed < 50k or nothing this year)
    const tierRows = await db.prepare(
      `SELECT memberId, SUM(amountKobo) as total FROM civic_donations
       WHERE tenantId=? AND organizationId=? AND deletedAt IS NULL AND donationDate>=?
       GROUP BY memberId`
    ).bind(tenantId, organizationId, thisYearStart).all<{ memberId: string | null; total: number }>();
    const tierList = tierRows.results ?? [];
    const major = tierList.filter((r) => (r.total ?? 0) >= 500_000).length;
    const regular = tierList.filter((r) => (r.total ?? 0) >= 50_000 && (r.total ?? 0) < 500_000).length;
    const lapsed = tierList.filter((r) => (r.total ?? 0) < 50_000).length;

    return apiSuccess({
      monthlyTrend: months,
      departmentBreakdown: (deptRows.results ?? []).map((d) => ({
        departmentId: d.id,
        name: d.name,
        totalKobo: d.total,
      })),
      topGiversTiers: { major, regular, lapsed },
      yoyComparison: { thisYearKobo: tyKobo, lastYearKobo: lyKobo, percentChange },
    });
  } catch (err) {
    logger.error("Donation analytics failed", { error: String(err) });
    return apiError("Internal server error", 500);
  }
});

// F07 — Pledge Analytics
app.get("/api/civic/analytics/pledges", async (c) => {
  const payload = c.get(CIVIC_JWT_KEY as never) as CivicJWTPayload;
  const logger = createLogger("analytics-pledges", payload.tenantId);
  try {
    const env = c.env as { DB: D1Database };
    const db = env.DB;
    const { tenantId, organizationId } = payload;
    const nowMs3 = Date.now();
    const d30 = nowMs3 - 30 * 24 * 60 * 60 * 1000;
    const d60 = nowMs3 - 60 * 24 * 60 * 60 * 1000;
    const d90 = nowMs3 - 90 * 24 * 60 * 60 * 1000;

    const [summary, activePledges] = await Promise.all([
      db.prepare(
        `SELECT COALESCE(SUM(totalAmountKobo),0) as pledged, COALESCE(SUM(paidAmountKobo),0) as paid
         FROM civic_pledges WHERE tenantId=? AND organizationId=? AND deletedAt IS NULL`
      ).bind(tenantId, organizationId).first<{ pledged: number; paid: number }>(),
      db.prepare(
        `SELECT id, memberId, totalAmountKobo, paidAmountKobo, dueDate FROM civic_pledges
         WHERE tenantId=? AND organizationId=? AND deletedAt IS NULL AND pledgeStatus != 'fulfilled'
         ORDER BY (totalAmountKobo - paidAmountKobo) DESC LIMIT 100`
      ).bind(tenantId, organizationId).all<{ id: string; memberId: string; totalAmountKobo: number; paidAmountKobo: number; dueDate: number | null }>(),
    ]);

    const pledged = summary?.pledged ?? 0;
    const paid = summary?.paid ?? 0;
    const fulfillmentPercent = pledged > 0 ? Math.round((paid / pledged) * 10000) / 100 : 0;

    const pledgeList = activePledges.results ?? [];
    const overdue = pledgeList.filter((p) => p.dueDate && p.dueDate < nowMs3);
    const aging = {
      bucket30d: { count: overdue.filter((p) => p.dueDate! >= d30).length, kobo: overdue.filter((p) => p.dueDate! >= d30).reduce((s, p) => s + (p.totalAmountKobo - p.paidAmountKobo), 0) },
      bucket60d: { count: overdue.filter((p) => p.dueDate! >= d60 && p.dueDate! < d30).length, kobo: overdue.filter((p) => p.dueDate! >= d60 && p.dueDate! < d30).reduce((s, p) => s + (p.totalAmountKobo - p.paidAmountKobo), 0) },
      bucket90dPlus: { count: overdue.filter((p) => p.dueDate! < d60).length, kobo: overdue.filter((p) => p.dueDate! < d60).reduce((s, p) => s + (p.totalAmountKobo - p.paidAmountKobo), 0) },
    };
    const topUnfulfilled = pledgeList.slice(0, 5).map((p) => ({
      pledgeId: p.id,
      memberId: p.memberId,
      totalAmountKobo: p.totalAmountKobo,
      paidAmountKobo: p.paidAmountKobo,
      remainingKobo: p.totalAmountKobo - p.paidAmountKobo,
      dueDate: p.dueDate,
    }));

    return apiSuccess({ totalPledgedKobo: pledged, totalPaidKobo: paid, fulfillmentPercent, aging, topUnfulfilled });
  } catch (err) {
    logger.error("Pledge analytics failed", { error: String(err) });
    return apiError("Internal server error", 500);
  }
});

// E06 — Projects
app.get("/api/civic/projects", async (c) => {
  const payload = c.get(CIVIC_JWT_KEY as never) as CivicJWTPayload;
  try {
    const db = (c.env as { DB: D1Database }).DB;
    const rows = await db.prepare(
      `SELECT * FROM civic_projects WHERE tenantId=? AND organizationId=? AND deletedAt IS NULL ORDER BY createdAt DESC`
    ).bind(payload.tenantId, payload.organizationId).all();
    return apiSuccess({ projects: rows.results ?? [] });
  } catch (err) {
    return apiError("Internal server error", 500);
  }
});

app.post("/api/civic/projects", async (c) => {
  const payload = c.get(CIVIC_JWT_KEY as never) as CivicJWTPayload;
  const logger = createLogger("projects", payload.tenantId);
  try {
    const db = (c.env as { DB: D1Database }).DB;
    const body = await c.req.json<{
      name: string; donorName?: string; budgetKobo?: number;
      startDate?: number; endDate?: number; description?: string; status?: string;
    }>();
    if (!body.name) return apiError("name is required", 400);
    const id = generateId("prj");
    const now2 = nowMs();
    await db.prepare(
      `INSERT INTO civic_projects (id, tenantId, organizationId, name, donorName, budgetKobo, currency, startDate, endDate, status, description, createdBy, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, 'NGN', ?, ?, ?, ?, ?, ?, ?)`
    ).bind(id, payload.tenantId, payload.organizationId, body.name, body.donorName ?? null,
      body.budgetKobo ?? 0, body.startDate ?? null, body.endDate ?? null,
      body.status ?? "draft", body.description ?? null, payload.userId, now2, now2).run();
    logger.info("Project created", { projectId: id, name: body.name });
    return apiSuccess({ projectId: id }, 201);
  } catch (err) {
    logger.error("Create project failed", { error: String(err) });
    return apiError("Internal server error", 500);
  }
});

app.get("/api/civic/projects/:id/summary", async (c) => {
  const payload = c.get(CIVIC_JWT_KEY as never) as CivicJWTPayload;
  try {
    const db = (c.env as { DB: D1Database }).DB;
    const projectId = c.req.param("id");
    const [project, donated, expenses] = await Promise.all([
      db.prepare(`SELECT * FROM civic_projects WHERE id=? AND tenantId=? AND deletedAt IS NULL`)
        .bind(projectId, payload.tenantId).first<{ id: string; name: string; budgetKobo: number; donorName: string | null }>(),
      db.prepare(`SELECT COALESCE(SUM(amountKobo),0) as total, COUNT(*) as cnt FROM civic_donations WHERE projectId=? AND tenantId=? AND deletedAt IS NULL`)
        .bind(projectId, payload.tenantId).first<{ total: number; cnt: number }>(),
      db.prepare(`SELECT COALESCE(SUM(amountKobo),0) as total, COUNT(*) as cnt FROM civic_expenses WHERE projectId=? AND tenantId=? AND deletedAt IS NULL`)
        .bind(projectId, payload.tenantId).first<{ total: number; cnt: number }>(),
    ]);
    if (!project) return apiError("Project not found", 404);
    const donatedKobo = donated?.total ?? 0;
    const expensesKobo = expenses?.total ?? 0;
    return apiSuccess({
      projectId, name: project.name, donorName: project.donorName,
      budgetKobo: project.budgetKobo, totalDonatedKobo: donatedKobo,
      totalExpensesKobo: expensesKobo, balance: donatedKobo - expensesKobo,
      donationCount: donated?.cnt ?? 0, expenseCount: expenses?.cnt ?? 0,
    });
  } catch (err) {
    return apiError("Internal server error", 500);
  }
});

// F06 — Donor CRM
app.get("/api/civic/donors", async (c) => {
  const payload = c.get(CIVIC_JWT_KEY as never) as CivicJWTPayload;
  try {
    const db = (c.env as { DB: D1Database }).DB;
    const yearStart2 = new Date(new Date().getFullYear(), 0, 1).getTime();
    const rows = await db.prepare(
      `SELECT m.id, m.firstName, m.lastName, m.phone, m.email, m.isDonor, m.donorSince, m.donorNotes,
       COALESCE(SUM(d.amountKobo),0) as totalGivenKobo,
       MAX(d.donationDate) as lastGiftDate, COUNT(d.id) as giftCount,
       COALESCE(SUM(CASE WHEN d.donationDate >= ? THEN d.amountKobo ELSE 0 END),0) as ytdKobo
       FROM civic_members m
       LEFT JOIN civic_donations d ON d.memberId=m.id AND d.tenantId=m.tenantId AND d.deletedAt IS NULL
       WHERE m.tenantId=? AND m.organizationId=? AND m.deletedAt IS NULL AND m.isDonor=1
       GROUP BY m.id ORDER BY totalGivenKobo DESC`
    ).bind(yearStart2, payload.tenantId, payload.organizationId).all<{
      id: string; firstName: string; lastName: string; phone: string | null; email: string | null;
      isDonor: number; donorSince: number | null; donorNotes: string | null;
      totalGivenKobo: number; lastGiftDate: number | null; giftCount: number; ytdKobo: number;
    }>();
    const donors = (rows.results ?? []).map((r) => ({
      ...r,
      donorTier: r.totalGivenKobo >= 500_000 ? "major" : r.totalGivenKobo >= 50_000 ? "regular" : "lapsed",
    }));
    return apiSuccess({ donors });
  } catch (err) {
    return apiError("Internal server error", 500);
  }
});

app.patch("/api/civic/members/:id/donor-profile", async (c) => {
  const payload = c.get(CIVIC_JWT_KEY as never) as CivicJWTPayload;
  try {
    const db = (c.env as { DB: D1Database }).DB;
    const memberId = c.req.param("id");
    const body = await c.req.json<{ isDonor?: boolean; donorNotes?: string; donorSince?: number }>();
    const now3 = nowMs();
    await db.prepare(
      `UPDATE civic_members SET isDonor=?, donorNotes=?, donorSince=?, updatedAt=?
       WHERE id=? AND tenantId=? AND deletedAt IS NULL`
    ).bind(body.isDonor ? 1 : 0, body.donorNotes ?? null, body.donorSince ?? null, now3, memberId, payload.tenantId).run();
    return apiSuccess({ updated: true });
  } catch (err) {
    return apiError("Internal server error", 500);
  }
});

// E08 — NDPR Compliance
app.post("/api/civic/members/:id/consent-withdraw", async (c) => {
  const payload = c.get(CIVIC_JWT_KEY as never) as CivicJWTPayload;
  const logger = createLogger("ndpr", payload.tenantId);
  try {
    const db = (c.env as { DB: D1Database }).DB;
    const memberId = c.req.param("id");
    const body = await c.req.json<{ consentVersion?: string; notes?: string }>().catch(() => ({}));
    const now4 = nowMs();
    const auditId = generateId("ndpr");
    await db.prepare(
      `UPDATE civic_members SET ndprConsent=0, ndprConsentDate=?, updatedAt=? WHERE id=? AND tenantId=? AND deletedAt IS NULL`
    ).bind(now4, now4, memberId, payload.tenantId).run();
    await db.prepare(
      `INSERT INTO civic_ndpr_audit_log (id, tenantId, memberId, action, consentVersion, notes, performedBy, createdAt)
       VALUES (?, ?, ?, 'consent_withdrawn', ?, ?, ?, ?)`
    ).bind(auditId, payload.tenantId, memberId, (body as { consentVersion?: string }).consentVersion ?? null,
      (body as { notes?: string }).notes ?? null, payload.userId, now4).run();
    logger.info("Consent withdrawn", { memberId, auditId });
    return apiSuccess({ withdrawn: true, auditId });
  } catch (err) {
    logger.error("Consent withdrawal failed", { error: String(err) });
    return apiError("Internal server error", 500);
  }
});

app.get("/api/civic/ndpr/audit-log", async (c) => {
  const payload = c.get(CIVIC_JWT_KEY as never) as CivicJWTPayload;
  try {
    const db = (c.env as { DB: D1Database }).DB;
    const rows = await db.prepare(
      `SELECT * FROM civic_ndpr_audit_log WHERE tenantId=? ORDER BY createdAt DESC LIMIT 200`
    ).bind(payload.tenantId).all();
    return apiSuccess({ entries: rows.results ?? [] });
  } catch (err) {
    return apiError("Internal server error", 500);
  }
});

app.post("/api/civic/members/:id/data-erasure-request", async (c) => {
  const payload = c.get(CIVIC_JWT_KEY as never) as CivicJWTPayload;
  const logger = createLogger("ndpr-erasure", payload.tenantId);
  try {
    const db = (c.env as { DB: D1Database }).DB;
    const memberId = c.req.param("id");
    const now5 = nowMs();
    const auditId = generateId("ndpr");
    // Soft-delete the member record and withdraw consent
    await db.prepare(
      `UPDATE civic_members SET deletedAt=?, ndprConsent=0, ndprConsentDate=?, updatedAt=? WHERE id=? AND tenantId=? AND deletedAt IS NULL`
    ).bind(now5, now5, now5, memberId, payload.tenantId).run();
    await db.prepare(
      `INSERT INTO civic_ndpr_audit_log (id, tenantId, memberId, action, requestType, notes, performedBy, createdAt)
       VALUES (?, ?, ?, 'data_deleted', 'erasure_request', 'Member data soft-deleted per NDPR Art.17', ?, ?)`
    ).bind(auditId, payload.tenantId, memberId, payload.userId, now5).run();
    logger.info("Data erasure completed", { memberId, auditId });
    return apiSuccess({ erased: true, auditId });
  } catch (err) {
    logger.error("Data erasure failed", { error: String(err) });
    return apiError("Internal server error", 500);
  }
});

// ─── CORE-1 Sync Endpoint ─────────────────────────────────────────────────────

app.post("/api/civic/sync", async (c) => {
  const payload = c.get(CIVIC_JWT_KEY as never) as CivicJWTPayload;
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
