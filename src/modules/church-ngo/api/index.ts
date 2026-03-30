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

  if (body.data.status === "success") {
    await c.env.DB.prepare(
      "UPDATE civic_donations SET paymentReference = ?, updatedAt = ? WHERE id = ? AND deletedAt IS NULL"
    ).bind(referenceId, nowMs(), referenceId).run();

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

  logger.info("Paystack webhook processed", { event: body.event, reference: referenceId, status: body.data.status });
  return new Response(JSON.stringify({ received: true }), {
    headers: { "Content-Type": "application/json" },
  });
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
