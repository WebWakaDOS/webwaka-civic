/**
 * WebWaka Civic — Political Party Management Hono API Router
 * Blueprint Reference: Part 10.9 (Civic & Political Suite — Political Party Management)
 * Part 9.2 (Universal Architecture Standards)
 * Part 9.3 (Platform Conventions)
 *
 * API Response Format: { success: true, data: ... } | { success: false, error: ... }
 * Authentication: Edge-based JWT validation
 * RBAC: admin | organizer | member | viewer
 * All monetary values: kobo integers (Blueprint Part 9.2)
 * Nigeria-First: INEC hierarchy, NDPR consent, NGN/kobo
 */
import { Hono } from "hono";
import { emitEvent } from "@webwaka/core";
import { createEventBus, PARTY_EVENTS, type EventBusEnv } from "../../../core/event-bus/index";
import { createLogger } from "../../../core/logger";
import { checkRateLimit, getClientIp } from "../../../core/rateLimit";
import {
  createCivicAuthMiddleware,
  CIVIC_JWT_KEY,
  type PartyJWTPayload,
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
import { CIVIC_NOTIFICATION_TEMPLATES } from "../../../core/services/notification-templates";
import {
  getPartyOrganizationByTenant,
  createPartyOrganization,
  updatePartyOrganization,
  getPartyStructuresByOrg,
  getPartyStructureById,
  createPartyStructure,
  updatePartyStructure,
  softDeletePartyStructure,
  getPartyMembersByOrg,
  getPartyMemberById,
  createPartyMember,
  updatePartyMember,
  softDeletePartyMember,
  getPartyMemberCount,
  getPartyDuesByMember,
  getPartyDuesByOrg,
  createPartyDues,
  softDeletePartyDues,
  getPartyDuesSummary,
  getPartyPositionsByStructure,
  createPartyPosition,
  updatePartyPosition,
  softDeletePartyPosition,
  getPartyMeetingsByOrg,
  createPartyMeeting,
  updatePartyMeeting,
  softDeletePartyMeeting,
  getPartyAnnouncementsByOrg,
  createPartyAnnouncement,
  getPartyIdCardByMember,
  createPartyIdCard,
  revokePartyIdCard,
  getPartyDashboardSummary,
  getPartyNominations,
  createPartyNomination,
  updatePartyNominationStatus,
  createCampaignAccount,
  getCampaignAccounts,
  getCampaignAccountById,
  addCampaignTransaction,
  getCampaignTransactions,
  getCampaignFinanceSummary,
  insertWebhookLog,
  webhookLogExists,
  type D1Database,
} from "../../../core/db/queries";
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
  NominationStatus,
  PartyCampaignAccount,
  PartyCampaignTransaction,
  CampaignPositionLevel,
} from "../../../core/db/schema";
import { PARTY_MIGRATION_SQL, ELECTORAL_ACT_LIMITS_KOBO } from "../../../core/db/schema";

const logger = createLogger("political-party-api");

// ─── Environment ──────────────────────────────────────────────────────────────

interface Env extends EventBusEnv {
  DB: D1Database;
  JWT_SECRET: string;
}

/**
 * Generate a party membership number in INEC-aligned format.
 * Format: {PARTY_ABBR}-{STATE_CODE}-{SEQUENCE}
 * Example: APC-LAG-0001234
 */
function generateMembershipNumber(abbreviation: string, state: string, sequence: number): string {
  const abbr = abbreviation.toUpperCase().slice(0, 4);
  const stateCode = state.toUpperCase().slice(0, 3);
  const seq = String(sequence).padStart(7, "0");
  return `${abbr}-${stateCode}-${seq}`;
}

/**
 * Generate a party ID card number.
 * Format: {PARTY_ABBR}-CARD-{YEAR}-{SEQUENCE}
 */
function generateCardNumber(abbreviation: string, sequence: number): string {
  const abbr = abbreviation.toUpperCase().slice(0, 4);
  const year = new Date().getFullYear();
  const seq = String(sequence).padStart(6, "0");
  return `${abbr}-CARD-${year}-${seq}`;
}

// ─── App ──────────────────────────────────────────────────────────────────────

const app = new Hono<{ Bindings: Env }>();

// ─── Paystack Webhook (no JWT — HMAC-SHA512 auth) ─────────────────────────────

app.post("/webhooks/paystack", async (c) => {
  const ip = getClientIp(c.req.raw);
  if (!checkRateLimit(`wh:civ2:${ip}`, 100, 60_000)) {
    return new Response(JSON.stringify({ error: "Too many requests" }), {
      status: 429,
      headers: { "Content-Type": "application/json" },
    });
  }

  const rawBody = await c.req.text();
  const signature = c.req.header("x-paystack-signature") ?? "";
  const logger = createLogger("party-webhook");

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

  const alreadyProcessed = await webhookLogExists(c.env.DB, "paystack", eventKey);
  if (alreadyProcessed) {
    logger.info("Paystack webhook duplicate — skipped", { event: body.event, reference: referenceId });
    return new Response(JSON.stringify({ received: true, duplicate: true }), {
      headers: { "Content-Type": "application/json" },
    });
  }

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

  await c.env.DB.prepare(
    `UPDATE party_dues SET paymentStatus = ?, updatedAt = ? WHERE id = ? AND deletedAt IS NULL`
  ).bind(newPaymentStatus, nowMs(), referenceId).run();

  await emitEvent(c.env, isSuccess ? "payment.verified" : "payment.failed", tenantId, {
    reference: referenceId,
    status: body.data.status,
    metadata: body.data.metadata,
  });

  logger.info("Party Paystack webhook processed", { event: body.event, reference: referenceId, paymentStatus: newPaymentStatus });
  return new Response(JSON.stringify({ received: true }), {
    headers: { "Content-Type": "application/json" },
  });
});

// ─── Auth Middleware ──────────────────────────────────────────────────────────

app.use("/api/party/*", createCivicAuthMiddleware<PartyJWTPayload>());

// ─── Health Check ─────────────────────────────────────────────────────────────

app.get("/api/party/health", (c) => {
  return apiSuccess({
    module: "political-party",
    version: "1.0.0",
    blueprint: "Part 10.9",
    timestamp: new Date().toISOString(),
  });
});

// ─── Migration Endpoint ───────────────────────────────────────────────────────

app.post("/api/party/migrate", async (c) => {
  const payload = c.get(CIVIC_JWT_KEY as never) as PartyJWTPayload | undefined;
  if (!payload || payload.role !== "admin") {
    return apiError("Forbidden — admin only", 403);
  }
  try {
    const statements = PARTY_MIGRATION_SQL
      .split(";")
      .map((s) => s.trim())
      .filter((s) => s.length > 0 && !s.startsWith("--"));
    for (const sql of statements) {
      await c.env.DB.prepare(sql).run();
    }
    logger.info("CIV-2 migration applied", { tenantId: payload.tenantId });
    return apiSuccess({ message: "Migration applied successfully", tables: 8 });
  } catch (err) {
    logger.error("Migration failed", { error: String(err) });
    return apiError(`Migration failed: ${String(err)}`, 500);
  }
});

// ─── ORGANIZATIONS ────────────────────────────────────────────────────────────

// GET /api/party/organizations/:id — get party org details
app.get("/api/party/organizations/:id", async (c) => {
  const payload = c.get(CIVIC_JWT_KEY as never) as PartyJWTPayload;
  const org = await getPartyOrganizationByTenant(c.env.DB, payload.tenantId);
  if (org === null) {
    return apiError("Organization not found", 404);
  }
  return apiSuccess(org);
});

// PATCH /api/party/organizations/:id — update org settings (admin only)
app.patch("/api/party/organizations/:id", async (c) => {
  const payload = c.get(CIVIC_JWT_KEY as never) as PartyJWTPayload;
  if (payload.role !== "admin") {
    return apiError("Forbidden — admin only", 403);
  }
  const id = c.req.param("id");
  const body = await c.req.json<Partial<PartyOrganization>>();
  await updatePartyOrganization(c.env.DB, id, payload.tenantId, body);
  const updated = await getPartyOrganizationByTenant(c.env.DB, payload.tenantId);
  logger.info("Party organization updated", { id, tenantId: payload.tenantId });
  return apiSuccess(updated);
});

// GET /api/party/organizations/:id/stats — dashboard statistics
app.get("/api/party/organizations/:id/stats", async (c) => {
  const payload = c.get(CIVIC_JWT_KEY as never) as PartyJWTPayload;
  const stats = await getPartyDashboardSummary(c.env.DB, payload.tenantId, payload.organizationId);
  return apiSuccess({
    ...stats,
    totalDuesCollectedNaira: koboToNaira(stats.totalDuesCollectedKobo),
    currentYearDuesNaira: koboToNaira(stats.currentYearDuesKobo),
  });
});

// POST /api/party/organizations — create party organization
app.post("/api/party/organizations", async (c) => {
  const payload = c.get(CIVIC_JWT_KEY as never) as PartyJWTPayload;
  if (payload.role !== "admin") {
    return apiError("Forbidden — admin only", 403);
  }
  const body = await c.req.json<Omit<PartyOrganization, "id" | "createdAt" | "updatedAt">>();
  if (!body.name || !body.abbreviation) {
    return apiError("name and abbreviation are required");
  }
  const org: PartyOrganization = {
    id: generateId(),
    tenantId: payload.tenantId,
    name: body.name,
    abbreviation: body.abbreviation,
    motto: body.motto,
    logoUrl: body.logoUrl,
    foundedYear: body.foundedYear,
    inecRegistrationNumber: body.inecRegistrationNumber,
    currency: body.currency ?? "NGN",
    timezone: body.timezone ?? "Africa/Lagos",
    annualDuesKobo: body.annualDuesKobo ?? 0,
    createdAt: nowMs(),
    updatedAt: nowMs(),
  };
  await createPartyOrganization(c.env.DB, org);
  logger.info("Party organization created", { id: org.id, name: org.name, tenantId: payload.tenantId });
  return apiSuccess(org);
});

// ─── STRUCTURES ───────────────────────────────────────────────────────────────

// GET /api/party/structures — list all structures (flat or by parent)
app.get("/api/party/structures", async (c) => {
  const payload = c.get(CIVIC_JWT_KEY as never) as PartyJWTPayload;
  const parentId = c.req.query("parentId");
  const structures = await getPartyStructuresByOrg(
    c.env.DB,
    payload.tenantId,
    payload.organizationId,
    parentId === "null" ? null : parentId
  );
  return apiSuccess(structures);
});

// GET /api/party/structures/:id — get structure with children
app.get("/api/party/structures/:id", async (c) => {
  const payload = c.get(CIVIC_JWT_KEY as never) as PartyJWTPayload;
  const id = c.req.param("id");
  const structure = await getPartyStructureById(c.env.DB, id, payload.tenantId);
  if (structure === null) {
    return apiError("Structure not found", 404);
  }
  const children = await getPartyStructuresByOrg(
    c.env.DB,
    payload.tenantId,
    payload.organizationId,
    id
  );
  return apiSuccess({ ...structure, children });
});

// POST /api/party/structures — create new structure node (admin)
app.post("/api/party/structures", async (c) => {
  const payload = c.get(CIVIC_JWT_KEY as never) as PartyJWTPayload;
  if (payload.role !== "admin") {
    return apiError("Forbidden — admin only", 403);
  }
  const body = await c.req.json<Omit<PartyStructure, "id" | "createdAt" | "updatedAt">>();
  if (!body.level || !body.name) {
    return apiError("level and name are required");
  }
  const validLevels = ["national", "state", "senatorial", "federal_constituency", "lga", "ward"];
  if (!validLevels.includes(body.level)) {
    return apiError(`level must be one of: ${validLevels.join(", ")}`);
  }
  const structure: PartyStructure = {
    id: generateId(),
    tenantId: payload.tenantId,
    organizationId: payload.organizationId,
    parentId: body.parentId,
    level: body.level,
    name: body.name,
    code: body.code,
    state: body.state,
    lga: body.lga,
    ward: body.ward,
    chairpersonId: body.chairpersonId,
    secretaryId: body.secretaryId,
    createdAt: nowMs(),
    updatedAt: nowMs(),
  };
  await createPartyStructure(c.env.DB, structure);
  const bus = createEventBus(c.env);
  await emitEvent(c.env, PARTY_EVENTS.STRUCTURE_CREATED, payload.tenantId, { organizationId: payload.organizationId, ...{
    structureId: structure.id,
    level: structure.level,
    parentId: structure.parentId ?? null,
  } });
  logger.info("Party structure created", { id: structure.id, level: structure.level, tenantId: payload.tenantId });
  return apiSuccess(structure);
});

// PATCH /api/party/structures/:id — update structure (admin)
app.patch("/api/party/structures/:id", async (c) => {
  const payload = c.get(CIVIC_JWT_KEY as never) as PartyJWTPayload;
  if (payload.role !== "admin") {
    return apiError("Forbidden — admin only", 403);
  }
  const id = c.req.param("id");
  const body = await c.req.json<Partial<PartyStructure>>();
  await updatePartyStructure(c.env.DB, id, payload.tenantId, body);
  const updated = await getPartyStructureById(c.env.DB, id, payload.tenantId);
  return apiSuccess(updated);
});

// DELETE /api/party/structures/:id — soft delete (admin)
app.delete("/api/party/structures/:id", async (c) => {
  const payload = c.get(CIVIC_JWT_KEY as never) as PartyJWTPayload;
  if (payload.role !== "admin") {
    return apiError("Forbidden — admin only", 403);
  }
  const id = c.req.param("id");
  await softDeletePartyStructure(c.env.DB, id, payload.tenantId);
  logger.info("Party structure soft-deleted", { id, tenantId: payload.tenantId });
  return apiSuccess({ deleted: true });
});

// ─── MEMBERS ──────────────────────────────────────────────────────────────────

// GET /api/party/members — paginated list, filter by structure/status
app.get("/api/party/members", async (c) => {
  const payload = c.get(CIVIC_JWT_KEY as never) as PartyJWTPayload;
  const structureId = c.req.query("structureId");
  const memberStatus = c.req.query("memberStatus");
  const role = c.req.query("role");
  const search = c.req.query("search");
  const page = parseInt(c.req.query("page") ?? "1", 10);
  const limit = Math.min(parseInt(c.req.query("limit") ?? "20", 10), 100);
  const result = await getPartyMembersByOrg(c.env.DB, payload.tenantId, payload.organizationId, {
    structureId, memberStatus, role, search, page, limit,
  });
  return apiSuccess({ ...result, page, limit });
});

// GET /api/party/members/:id — full member profile
app.get("/api/party/members/:id", async (c) => {
  const payload = c.get(CIVIC_JWT_KEY as never) as PartyJWTPayload;
  const id = c.req.param("id");
  const member = await getPartyMemberById(c.env.DB, id, payload.tenantId);
  if (member === null) {
    return apiError("Member not found", 404);
  }
  return apiSuccess(member);
});

// POST /api/party/members — register new member (NDPR consent required)
app.post("/api/party/members", async (c) => {
  const payload = c.get(CIVIC_JWT_KEY as never) as PartyJWTPayload;
  if (payload.role !== "admin" && payload.role !== "organizer") {
    return apiError("Forbidden — admin or organizer only", 403);
  }
  const body = await c.req.json<Omit<PartyMember, "id" | "membershipNumber" | "createdAt" | "updatedAt">>();
  if (!body.firstName || !body.lastName || !body.phone) {
    return apiError("firstName, lastName, and phone are required");
  }
  if (!body.ndprConsent) {
    return apiError("NDPR consent is required to register a member");
  }
  if (!body.structureId) {
    return apiError("structureId (ward assignment) is required");
  }
  // Get org for abbreviation and generate membership number
  const org = await getPartyOrganizationByTenant(c.env.DB, payload.tenantId);
  const memberCount = await getPartyMemberCount(c.env.DB, payload.tenantId, payload.organizationId);
  const membershipNumber = generateMembershipNumber(
    org?.abbreviation ?? "PARTY",
    body.state ?? "NG",
    memberCount + 1
  );
  const member: PartyMember = {
    id: generateId(),
    tenantId: payload.tenantId,
    organizationId: payload.organizationId,
    structureId: body.structureId,
    membershipNumber,
    firstName: body.firstName,
    lastName: body.lastName,
    middleName: body.middleName,
    dateOfBirth: body.dateOfBirth,
    gender: body.gender,
    phone: body.phone,
    email: body.email,
    address: body.address,
    state: body.state,
    lga: body.lga,
    ward: body.ward,
    voterCardNumber: body.voterCardNumber,
    photoUrl: body.photoUrl,
    memberStatus: "active",
    role: body.role ?? "ordinary",
    joinedDate: body.joinedDate ?? nowMs(),
    ndprConsent: true,
    ndprConsentDate: nowMs(),
    createdAt: nowMs(),
    updatedAt: nowMs(),
  };
  await createPartyMember(c.env.DB, member);
  const bus = createEventBus(c.env);
  await emitEvent(c.env, PARTY_EVENTS.MEMBER_REGISTERED, payload.tenantId, { organizationId: payload.organizationId, ...{
    memberId: member.id,
    structureId: member.structureId,
    membershipNumber: member.membershipNumber,
  } });

  // Phase 6: welcome notification + party ID card via CORE-COMMS / CORE-DOCS
  if (member.phone || member.email) {
    const notifSvc = createNotificationService(c.env);
    notifSvc.sendWelcome(c.env, {
      tenantId: payload.tenantId,
      organizationId: payload.organizationId,
      recipientPhone: member.phone,
      name: member.firstName,
      membershipNumber: member.membershipNumber ?? member.id,
    }).catch((e) => logger.error("Party member welcome notification failed", { error: String(e) }));
  }
  const docSvc = createDocumentService(c.env);
  docSvc.requestMemberIdCard({
    tenantId: payload.tenantId,
    organizationId: payload.organizationId,
    memberName: `${member.firstName} ${member.lastName}`,
    memberPhone: member.phone,
    membershipNumber: member.membershipNumber ?? member.id,
    photoUrl: member.photoUrl,
    organizationName: payload.organizationId,
    cardType: "party_id_card",
  }).catch((e) => logger.error("Party member ID card generation failed", { error: String(e) }));

  logger.info("Party member registered", { id: member.id, membershipNumber, tenantId: payload.tenantId });
  return apiSuccess(member);
});

// PATCH /api/party/members/:id — update member details
app.patch("/api/party/members/:id", async (c) => {
  const payload = c.get(CIVIC_JWT_KEY as never) as PartyJWTPayload;
  if (payload.role !== "admin" && payload.role !== "organizer") {
    return apiError("Forbidden — admin or organizer only", 403);
  }
  const id = c.req.param("id");
  const body = await c.req.json<Partial<PartyMember>>();
  // Publish suspension/expulsion events
  if (body.memberStatus === "suspended") {
    const bus = createEventBus(c.env);
    await emitEvent(c.env, PARTY_EVENTS.MEMBER_SUSPENDED, payload.tenantId, { organizationId: payload.organizationId, ...{
      memberId: id,
      reason: (body as Record<string, unknown>).reason ?? "Administrative action",
    } });
  } else if (body.memberStatus === "expelled") {
    const bus = createEventBus(c.env);
    await emitEvent(c.env, PARTY_EVENTS.MEMBER_EXPELLED, payload.tenantId, { organizationId: payload.organizationId, ...{
      memberId: id,
      reason: (body as Record<string, unknown>).reason ?? "Administrative action",
    } });
  }
  await updatePartyMember(c.env.DB, id, payload.tenantId, body);
  const updated = await getPartyMemberById(c.env.DB, id, payload.tenantId);
  return apiSuccess(updated);
});

// DELETE /api/party/members/:id — soft delete (expel/resign)
app.delete("/api/party/members/:id", async (c) => {
  const payload = c.get(CIVIC_JWT_KEY as never) as PartyJWTPayload;
  if (payload.role !== "admin") {
    return apiError("Forbidden — admin only", 403);
  }
  const id = c.req.param("id");
  await softDeletePartyMember(c.env.DB, id, payload.tenantId);
  logger.info("Party member soft-deleted", { id, tenantId: payload.tenantId });
  return apiSuccess({ deleted: true });
});

// GET /api/party/members/:id/dues — member dues history
app.get("/api/party/members/:id/dues", async (c) => {
  const payload = c.get(CIVIC_JWT_KEY as never) as PartyJWTPayload;
  const id = c.req.param("id");
  const dues = await getPartyDuesByMember(c.env.DB, id, payload.tenantId);
  return apiSuccess(dues);
});

// GET /api/party/members/:id/card — member ID card details
app.get("/api/party/members/:id/card", async (c) => {
  const payload = c.get(CIVIC_JWT_KEY as never) as PartyJWTPayload;
  const id = c.req.param("id");
  const card = await getPartyIdCardByMember(c.env.DB, id, payload.tenantId);
  if (card === null) {
    return apiError("No active ID card found for this member", 404);
  }
  return apiSuccess(card);
});

// ─── DUES ─────────────────────────────────────────────────────────────────────

// GET /api/party/dues — list dues records (filter by year/structure)
app.get("/api/party/dues", async (c) => {
  const payload = c.get(CIVIC_JWT_KEY as never) as PartyJWTPayload;
  const yearStr = c.req.query("year");
  const year = yearStr ? parseInt(yearStr, 10) : undefined;
  const dues = await getPartyDuesByOrg(c.env.DB, payload.tenantId, payload.organizationId, year);
  return apiSuccess(dues);
});

// GET /api/party/dues/summary — dues collection summary by year
app.get("/api/party/dues/summary", async (c) => {
  const payload = c.get(CIVIC_JWT_KEY as never) as PartyJWTPayload;
  const year = parseInt(c.req.query("year") ?? String(new Date().getFullYear()), 10);
  const summary = await getPartyDuesSummary(c.env.DB, payload.tenantId, payload.organizationId, year);
  return apiSuccess({
    ...summary,
    year,
    totalCollectedNaira: koboToNaira(summary.totalCollectedKobo),
  });
});

// POST /api/party/dues — record dues payment
app.post("/api/party/dues", async (c) => {
  const payload = c.get(CIVIC_JWT_KEY as never) as PartyJWTPayload;
  if (payload.role !== "admin" && payload.role !== "organizer") {
    return apiError("Forbidden — admin or organizer only", 403);
  }
  const body = await c.req.json<Omit<PartyDues, "id" | "createdAt" | "updatedAt">>();
  if (!body.memberId || !body.year || !body.amountKobo || !body.paymentMethod) {
    return apiError("memberId, year, amountKobo, and paymentMethod are required");
  }
  if (body.amountKobo <= 0) {
    return apiError("amountKobo must be a positive integer");
  }
  const dues: PartyDues = {
    id: generateId(),
    tenantId: payload.tenantId,
    organizationId: payload.organizationId,
    memberId: body.memberId,
    year: body.year,
    amountKobo: body.amountKobo,
    paymentMethod: body.paymentMethod,
    paymentStatus: body.paymentMethod === "paystack" ? "pending" : "cash",
    receiptNumber: body.receiptNumber ?? `RCP-${generateId().slice(0, 8).toUpperCase()}`,
    paidAt: body.paidAt ?? nowMs(),
    collectedBy: body.collectedBy ?? payload.sub,
    notes: body.notes,
    createdAt: nowMs(),
    updatedAt: nowMs(),
  };
  await createPartyDues(c.env.DB, dues);
  const bus = createEventBus(c.env);
  await emitEvent(c.env, PARTY_EVENTS.DUES_PAID, payload.tenantId, { organizationId: payload.organizationId, ...{
    memberId: dues.memberId,
    year: dues.year,
    amountKobo: dues.amountKobo,
  } });

  // Phase 6: dues notification + receipt document
  const member = await getPartyMemberById(c.env.DB, dues.memberId, payload.tenantId).catch(() => null);
  if (member?.phone) {
    const notifSvc = createNotificationService(c.env);
    notifSvc.sendDuesReminder({
      tenantId: payload.tenantId,
      organizationId: payload.organizationId,
      recipientPhone: member.phone,
      name: member.firstName,
      year: dues.year,
      amountKobo: dues.amountKobo,
    }).catch((e) => logger.error("Dues confirmation notification failed", { error: String(e) }));

    const docSvc = createDocumentService(c.env);
    docSvc.requestDuesReceipt({
      tenantId: payload.tenantId,
      organizationId: payload.organizationId,
      memberName: `${member.firstName} ${member.lastName}`,
      memberPhone: member.phone,
      year: dues.year,
      amountKobo: dues.amountKobo,
      receiptNumber: dues.receiptNumber ?? dues.id,
      organizationName: payload.organizationId,
    }).catch((e) => logger.error("Dues receipt PDF generation failed", { error: String(e) }));
  }

  // Phase 6: initiate Paystack payment if paymentMethod is paystack
  if (dues.paymentMethod === "paystack" && member?.email) {
    const paySvc = createPaymentService(c.env);
    paySvc.initializePayment({
      tenantId: payload.tenantId,
      organizationId: payload.organizationId,
      amountKobo: dues.amountKobo,
      customerEmail: member.email,
      customerPhone: member.phone,
      customerName: `${member.firstName} ${member.lastName}`,
      category: "membership_dues",
      referenceId: dues.id,
      metadata: { memberId: dues.memberId, year: dues.year },
    }).catch((e) => logger.error("Dues Paystack init failed", { error: String(e) }));
  }

  logger.info("Party dues recorded", { id: dues.id, memberId: dues.memberId, year: dues.year, tenantId: payload.tenantId });
  return apiSuccess(dues);
});

// PATCH /api/party/dues/:id — update dues record
app.patch("/api/party/dues/:id", async (c) => {
  const payload = c.get(CIVIC_JWT_KEY as never) as PartyJWTPayload;
  if (payload.role !== "admin") {
    return apiError("Forbidden — admin only", 403);
  }
  const id = c.req.param("id");
  const body = await c.req.json<Partial<PartyDues>>();
  // Only allow updating notes
  await c.env.DB.prepare(
    "UPDATE party_dues SET notes = COALESCE(?, notes), updatedAt = ? WHERE id = ? AND tenantId = ? AND deletedAt IS NULL"
  ).bind(body.notes ?? null, nowMs(), id, payload.tenantId).run();
  return apiSuccess({ updated: true });
});

// DELETE /api/party/dues/:id — soft delete
app.delete("/api/party/dues/:id", async (c) => {
  const payload = c.get(CIVIC_JWT_KEY as never) as PartyJWTPayload;
  if (payload.role !== "admin") {
    return apiError("Forbidden — admin only", 403);
  }
  const id = c.req.param("id");
  await softDeletePartyDues(c.env.DB, id, payload.tenantId);
  return apiSuccess({ deleted: true });
});

// ─── POSITIONS ────────────────────────────────────────────────────────────────

// GET /api/party/positions — list positions by structure
app.get("/api/party/positions", async (c) => {
  const payload = c.get(CIVIC_JWT_KEY as never) as PartyJWTPayload;
  const structureId = c.req.query("structureId");
  if (!structureId) {
    return apiError("structureId query parameter is required");
  }
  const positions = await getPartyPositionsByStructure(c.env.DB, structureId, payload.tenantId);
  return apiSuccess(positions);
});

// POST /api/party/positions — create/assign position
app.post("/api/party/positions", async (c) => {
  const payload = c.get(CIVIC_JWT_KEY as never) as PartyJWTPayload;
  if (payload.role !== "admin") {
    return apiError("Forbidden — admin only", 403);
  }
  const body = await c.req.json<Omit<PartyPosition, "id" | "createdAt" | "updatedAt">>();
  if (!body.structureId || !body.title) {
    return apiError("structureId and title are required");
  }
  const position: PartyPosition = {
    id: generateId(),
    tenantId: payload.tenantId,
    organizationId: payload.organizationId,
    structureId: body.structureId,
    title: body.title,
    holderId: body.holderId,
    electedDate: body.electedDate,
    expiresDate: body.expiresDate,
    isActive: body.isActive ?? true,
    createdAt: nowMs(),
    updatedAt: nowMs(),
  };
  await createPartyPosition(c.env.DB, position);
  if (position.holderId) {
    const bus = createEventBus(c.env);
    await emitEvent(c.env, PARTY_EVENTS.POSITION_ASSIGNED, payload.tenantId, { organizationId: payload.organizationId, ...{
      positionId: position.id,
      memberId: position.holderId,
      title: position.title,
    } });
  }
  logger.info("Party position created", { id: position.id, title: position.title, tenantId: payload.tenantId });
  return apiSuccess(position);
});

// PATCH /api/party/positions/:id — update position holder
app.patch("/api/party/positions/:id", async (c) => {
  const payload = c.get(CIVIC_JWT_KEY as never) as PartyJWTPayload;
  if (payload.role !== "admin") {
    return apiError("Forbidden — admin only", 403);
  }
  const id = c.req.param("id");
  const body = await c.req.json<Partial<PartyPosition>>();
  await updatePartyPosition(c.env.DB, id, payload.tenantId, body);
  if (body.holderId) {
    const bus = createEventBus(c.env);
    await emitEvent(c.env, PARTY_EVENTS.POSITION_ASSIGNED, payload.tenantId, { organizationId: payload.organizationId, ...{
      positionId: id,
      memberId: body.holderId,
      title: body.title ?? "Position",
    } });
  }
  return apiSuccess({ updated: true });
});

// DELETE /api/party/positions/:id — soft delete
app.delete("/api/party/positions/:id", async (c) => {
  const payload = c.get(CIVIC_JWT_KEY as never) as PartyJWTPayload;
  if (payload.role !== "admin") {
    return apiError("Forbidden — admin only", 403);
  }
  const id = c.req.param("id");
  await softDeletePartyPosition(c.env.DB, id, payload.tenantId);
  return apiSuccess({ deleted: true });
});

// ─── MEETINGS ─────────────────────────────────────────────────────────────────

// GET /api/party/meetings — list meetings by structure
app.get("/api/party/meetings", async (c) => {
  const payload = c.get(CIVIC_JWT_KEY as never) as PartyJWTPayload;
  const structureId = c.req.query("structureId");
  const meetings = await getPartyMeetingsByOrg(
    c.env.DB,
    payload.tenantId,
    payload.organizationId,
    structureId
  );
  return apiSuccess(meetings);
});

// POST /api/party/meetings — create meeting
app.post("/api/party/meetings", async (c) => {
  const payload = c.get(CIVIC_JWT_KEY as never) as PartyJWTPayload;
  if (payload.role !== "admin" && payload.role !== "organizer") {
    return apiError("Forbidden — admin or organizer only", 403);
  }
  const body = await c.req.json<Omit<PartyMeeting, "id" | "createdAt" | "updatedAt">>();
  if (!body.structureId || !body.title || !body.meetingType || !body.scheduledAt) {
    return apiError("structureId, title, meetingType, and scheduledAt are required");
  }
  const meeting: PartyMeeting = {
    id: generateId(),
    tenantId: payload.tenantId,
    organizationId: payload.organizationId,
    structureId: body.structureId,
    title: body.title,
    meetingType: body.meetingType,
    venue: body.venue,
    scheduledAt: body.scheduledAt,
    minutesUrl: body.minutesUrl,
    attendeeCount: body.attendeeCount,
    createdAt: nowMs(),
    updatedAt: nowMs(),
  };
  await createPartyMeeting(c.env.DB, meeting);
  const bus = createEventBus(c.env);
  await emitEvent(c.env, PARTY_EVENTS.MEETING_SCHEDULED, payload.tenantId, { organizationId: payload.organizationId, ...{
    meetingId: meeting.id,
    structureId: meeting.structureId,
    scheduledAt: meeting.scheduledAt,
  } });
  logger.info("Party meeting scheduled", { id: meeting.id, title: meeting.title, tenantId: payload.tenantId });
  return apiSuccess(meeting);
});

// PATCH /api/party/meetings/:id — update meeting
app.patch("/api/party/meetings/:id", async (c) => {
  const payload = c.get(CIVIC_JWT_KEY as never) as PartyJWTPayload;
  if (payload.role !== "admin" && payload.role !== "organizer") {
    return apiError("Forbidden — admin or organizer only", 403);
  }
  const id = c.req.param("id");
  const body = await c.req.json<Partial<PartyMeeting>>();
  await updatePartyMeeting(c.env.DB, id, payload.tenantId, body);
  return apiSuccess({ updated: true });
});

// DELETE /api/party/meetings/:id — soft delete
app.delete("/api/party/meetings/:id", async (c) => {
  const payload = c.get(CIVIC_JWT_KEY as never) as PartyJWTPayload;
  if (payload.role !== "admin") {
    return apiError("Forbidden — admin only", 403);
  }
  const id = c.req.param("id");
  await softDeletePartyMeeting(c.env.DB, id, payload.tenantId);
  return apiSuccess({ deleted: true });
});

// ─── ANNOUNCEMENTS ────────────────────────────────────────────────────────────

// GET /api/party/announcements — list announcements
app.get("/api/party/announcements", async (c) => {
  const payload = c.get(CIVIC_JWT_KEY as never) as PartyJWTPayload;
  const announcements = await getPartyAnnouncementsByOrg(
    c.env.DB,
    payload.tenantId,
    payload.organizationId
  );
  return apiSuccess(announcements);
});

// POST /api/party/announcements — create announcement
app.post("/api/party/announcements", async (c) => {
  const payload = c.get(CIVIC_JWT_KEY as never) as PartyJWTPayload;
  if (payload.role !== "admin" && payload.role !== "organizer") {
    return apiError("Forbidden — admin or organizer only", 403);
  }
  const body = await c.req.json<Omit<PartyAnnouncement, "id" | "createdAt" | "updatedAt">>();
  if (!body.title || !body.content) {
    return apiError("title and content are required");
  }
  const announcement: PartyAnnouncement = {
    id: generateId(),
    tenantId: payload.tenantId,
    organizationId: payload.organizationId,
    structureId: body.structureId,
    title: body.title,
    content: body.content,
    priority: body.priority ?? "normal",
    publishedAt: body.publishedAt ?? nowMs(),
    expiresAt: body.expiresAt,
    createdBy: payload.sub,
    createdAt: nowMs(),
    updatedAt: nowMs(),
  };
  await createPartyAnnouncement(c.env.DB, announcement);
  const bus = createEventBus(c.env);
  await emitEvent(c.env, PARTY_EVENTS.ANNOUNCEMENT_PUBLISHED, payload.tenantId, { organizationId: payload.organizationId, ...{
    announcementId: announcement.id,
    priority: announcement.priority,
  } });
  logger.info("Party announcement published", { id: announcement.id, priority: announcement.priority, tenantId: payload.tenantId });
  return apiSuccess(announcement);
});

// ─── ID CARDS ─────────────────────────────────────────────────────────────────

// POST /api/party/id-cards — issue new ID card for member
app.post("/api/party/id-cards", async (c) => {
  const payload = c.get(CIVIC_JWT_KEY as never) as PartyJWTPayload;
  if (payload.role !== "admin" && payload.role !== "organizer") {
    return apiError("Forbidden — admin or organizer only", 403);
  }
  const body = await c.req.json<{ memberId: string; expiresAt?: number; cardImageUrl?: string }>();
  if (!body.memberId) {
    return apiError("memberId is required");
  }
  // Check member exists
  const member = await getPartyMemberById(c.env.DB, body.memberId, payload.tenantId);
  if (member === null) {
    return apiError("Member not found", 404);
  }
  // Get org for card number generation
  const org = await getPartyOrganizationByTenant(c.env.DB, payload.tenantId);
  const memberCount = await getPartyMemberCount(c.env.DB, payload.tenantId, payload.organizationId);
  const cardNumber = generateCardNumber(org?.abbreviation ?? "PARTY", memberCount);
  const card: PartyIdCard = {
    id: generateId(),
    tenantId: payload.tenantId,
    organizationId: payload.organizationId,
    memberId: body.memberId,
    cardNumber,
    issuedAt: nowMs(),
    expiresAt: body.expiresAt,
    cardImageUrl: body.cardImageUrl,
    isActive: true,
    createdAt: nowMs(),
    updatedAt: nowMs(),
  };
  await createPartyIdCard(c.env.DB, card);
  const bus = createEventBus(c.env);
  await emitEvent(c.env, PARTY_EVENTS.ID_CARD_ISSUED, payload.tenantId, { organizationId: payload.organizationId, ...{
    memberId: card.memberId,
    cardNumber: card.cardNumber,
  } });
  const docSvc = createDocumentService(c.env);
  await docSvc.requestMemberIdCard({
    tenantId: payload.tenantId,
    organizationId: payload.organizationId,
    memberName: `${member.firstName} ${member.lastName}`,
    memberPhone: member.phone ?? undefined,
    membershipNumber: card.cardNumber,
    organizationName: org?.name ?? "Party",
    expiresAt: card.expiresAt,
    cardType: "party_id_card",
  });
  logger.info("Party ID card issued", { id: card.id, memberId: card.memberId, cardNumber, tenantId: payload.tenantId });
  return apiSuccess(card);
});

// GET /api/party/id-cards/:id/regenerate — re-request card document generation
app.post("/api/party/id-cards/:id/regenerate", async (c) => {
  const payload = c.get(CIVIC_JWT_KEY as never) as PartyJWTPayload;
  if (payload.role !== "admin" && payload.role !== "organizer") {
    return apiError("Forbidden — admin or organizer only", 403);
  }
  const id = c.req.param("id");
  const card = await c.env.DB.prepare(
    "SELECT * FROM party_id_cards WHERE id = ? AND tenantId = ? AND deletedAt IS NULL"
  ).bind(id, payload.tenantId).first<{ id: string; memberId: string; cardNumber: string; isActive: number; expiresAt?: number }>();
  if (!card) {
    return apiError("ID card not found", 404);
  }
  if (!card.isActive) {
    return apiError("Cannot regenerate a revoked ID card", 409);
  }
  const member = await getPartyMemberById(c.env.DB, card.memberId, payload.tenantId);
  if (!member) {
    return apiError("Member not found", 404);
  }
  const org = await getPartyOrganizationByTenant(c.env.DB, payload.tenantId);
  const docSvc = createDocumentService(c.env);
  await docSvc.requestMemberIdCard({
    tenantId: payload.tenantId,
    organizationId: payload.organizationId,
    memberName: `${member.firstName} ${member.lastName}`,
    memberPhone: member.phone ?? undefined,
    membershipNumber: card.cardNumber,
    organizationName: org?.name ?? "Party",
    expiresAt: card.expiresAt,
    cardType: "party_id_card",
  });
  logger.info("Party ID card regeneration requested", { cardId: id, memberId: card.memberId, tenantId: payload.tenantId });
  return apiSuccess({ queued: true, cardId: id, cardNumber: card.cardNumber });
});

// PATCH /api/party/id-cards/:id — revoke ID card
app.patch("/api/party/id-cards/:id", async (c) => {
  const payload = c.get(CIVIC_JWT_KEY as never) as PartyJWTPayload;
  if (payload.role !== "admin") {
    return apiError("Forbidden — admin only", 403);
  }
  const id = c.req.param("id");
  const body = await c.req.json<{ reason: string }>();
  if (!body.reason) {
    return apiError("reason is required for revocation");
  }
  await revokePartyIdCard(c.env.DB, id, payload.tenantId, body.reason);
  const bus = createEventBus(c.env);
  await emitEvent(c.env, PARTY_EVENTS.ID_CARD_REVOKED, payload.tenantId, { organizationId: payload.organizationId, ...{
    cardId: id,
    reason: body.reason,
  } });
  logger.info("Party ID card revoked", { id, reason: body.reason, tenantId: payload.tenantId });
  return apiSuccess({ revoked: true });
});

// ─── SYNC ─────────────────────────────────────────────────────────────────────

// GET /api/party/sync/pull — CORE-1 pull endpoint (delta sync)
app.get("/api/party/sync/pull", async (c) => {
  const payload = c.get(CIVIC_JWT_KEY as never) as PartyJWTPayload;
  const sinceStr = c.req.query("since");
  const since = sinceStr ? parseInt(sinceStr, 10) : 0;
  const [members, structures, dues] = await Promise.all([
    c.env.DB.prepare(
      "SELECT id, tenantId, organizationId, structureId, membershipNumber, firstName, lastName, memberStatus, role, updatedAt FROM party_members WHERE tenantId = ? AND organizationId = ? AND updatedAt > ? AND deletedAt IS NULL ORDER BY updatedAt ASC LIMIT 200"
    ).bind(payload.tenantId, payload.organizationId, since).all<Partial<PartyMember>>(),
    c.env.DB.prepare(
      "SELECT id, tenantId, organizationId, parentId, level, name, code, updatedAt FROM party_structures WHERE tenantId = ? AND organizationId = ? AND updatedAt > ? AND deletedAt IS NULL ORDER BY updatedAt ASC LIMIT 100"
    ).bind(payload.tenantId, payload.organizationId, since).all<Partial<PartyStructure>>(),
    c.env.DB.prepare(
      "SELECT id, memberId, year, amountKobo, paymentMethod, paidAt, updatedAt FROM party_dues WHERE tenantId = ? AND organizationId = ? AND updatedAt > ? AND deletedAt IS NULL ORDER BY updatedAt ASC LIMIT 200"
    ).bind(payload.tenantId, payload.organizationId, since).all<Partial<PartyDues>>(),
  ]);
  return apiSuccess({
    since,
    serverTime: nowMs(),
    members: members.results,
    structures: structures.results,
    dues: dues.results,
  });
});

// POST /api/party/sync/push — CORE-1 push endpoint (mutation queue)
app.post("/api/party/sync/push", async (c) => {
  const payload = c.get(CIVIC_JWT_KEY as never) as PartyJWTPayload;
  const body = await c.req.json<{
    mutations: Array<{
      id: string;
      entityType: "member" | "dues";
      operation: "create" | "update";
      data: Record<string, unknown>;
    }>;
  }>();
  const results: Array<{ id: string; success: boolean; error?: string }> = [];
  for (const mutation of body.mutations ?? []) {
    try {
      if (mutation.entityType === "member" && mutation.operation === "create") {
        const m = mutation.data as Omit<PartyMember, "id" | "createdAt" | "updatedAt">;
        const member: PartyMember = {
          id: mutation.id,
          tenantId: payload.tenantId,
          organizationId: payload.organizationId,
          structureId: m.structureId ?? "",
          membershipNumber: m.membershipNumber ?? mutation.id.slice(0, 12),
          firstName: m.firstName ?? "",
          lastName: m.lastName ?? "",
          phone: m.phone ?? "",
          memberStatus: m.memberStatus ?? "active",
          role: m.role ?? "ordinary",
          joinedDate: m.joinedDate ?? nowMs(),
          ndprConsent: m.ndprConsent ?? false,
          createdAt: nowMs(),
          updatedAt: nowMs(),
        };
        await createPartyMember(c.env.DB, member);
      } else if (mutation.entityType === "dues" && mutation.operation === "create") {
        const d = mutation.data as Omit<PartyDues, "id" | "createdAt" | "updatedAt">;
        const dues: PartyDues = {
          id: mutation.id,
          tenantId: payload.tenantId,
          organizationId: payload.organizationId,
          memberId: d.memberId ?? "",
          year: d.year ?? new Date().getFullYear(),
          amountKobo: d.amountKobo ?? 0,
          paymentMethod: d.paymentMethod ?? "cash",
          paymentStatus: d.paymentStatus ?? "cash",
          receiptNumber: d.receiptNumber ?? `RCP-${mutation.id.slice(0, 8).toUpperCase()}`,
          paidAt: d.paidAt ?? nowMs(),
          createdAt: nowMs(),
          updatedAt: nowMs(),
        };
        await createPartyDues(c.env.DB, dues);
      }
      results.push({ id: mutation.id, success: true });
    } catch (err) {
      results.push({ id: mutation.id, success: false, error: String(err) });
    }
  }
  return apiSuccess({ processed: results.length, results });
});

// ─── T003: P03 — INEC Membership Register Export ─────────────────────────────

app.get("/api/party/members/export", async (c) => {
  const payload = c.get(CIVIC_JWT_KEY as never) as PartyJWTPayload;
  if (payload.role !== "admin") {
    return apiError("Forbidden — admin role required", 403);
  }

  try {
    const format = new URL(c.req.url).searchParams.get("format") ?? "csv";
    const members = await getPartyMembersByOrg(c.env.DB, payload.tenantId, payload.organizationId);

    if (format === "json") {
      return apiSuccess({ members });
    }

    // CSV export
    const headers = ["membershipNumber", "firstName", "lastName", "phone", "state", "lga", "ward", "structureId", "memberStatus"];
    const rows = members.map((m) =>
      [
        m.membershipNumber,
        m.firstName,
        m.lastName,
        m.phone ?? "",
        m.state ?? "",
        m.lga ?? "",
        m.ward ?? "",
        m.structureId ?? "",
        m.memberStatus,
      ].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")
    );
    const csv = [headers.join(","), ...rows].join("\n");
    const now = new Date().toISOString().slice(0, 10);
    return new Response(csv, {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="inec-register-${payload.organizationId}-${now}.csv"`,
      },
    });
  } catch (err) {
    logger.error("INEC export failed", { error: String(err) });
    return apiError("Internal server error", 500);
  }
});

// ─── T004: P05 — Candidate Vetting & Nomination Workflow ──────────────────────

app.get("/api/party/nominations", async (c) => {
  const payload = c.get(CIVIC_JWT_KEY as never) as PartyJWTPayload;
  try {
    const status = new URL(c.req.url).searchParams.get("status") as NominationStatus | undefined;
    const nominations = await getPartyNominations(c.env.DB, payload.tenantId, payload.organizationId, status);
    return apiSuccess({ nominations });
  } catch (err) {
    logger.error("Failed to list nominations", { error: String(err) });
    return apiError("Internal server error", 500);
  }
});

app.post("/api/party/nominations", async (c) => {
  const payload = c.get(CIVIC_JWT_KEY as never) as PartyJWTPayload;
  if (payload.role !== "admin" && payload.role !== "officer") {
    return apiError("Forbidden — admin or officer role required", 403);
  }

  try {
    const body = await c.req.json<Partial<PartyNomination>>();
    if (!body.memberId) return apiError("memberId is required");
    if (!body.position) return apiError("position is required");
    if (!body.constituency) return apiError("constituency is required");

    const nom: PartyNomination = {
      id: generateId(),
      tenantId: payload.tenantId,
      organizationId: payload.organizationId,
      memberId: body.memberId,
      position: body.position,
      constituency: body.constituency,
      electionRef: body.electionRef,
      status: "pending",
      nominatorId: payload.sub,
      nominatedAt: nowMs(),
      createdAt: nowMs(),
      updatedAt: nowMs(),
    };
    await createPartyNomination(c.env.DB, nom);
    await emitEvent(c.env, "party.nomination.created", payload.tenantId, {
      nominationId: nom.id,
      memberId: nom.memberId,
      position: nom.position,
      organizationId: payload.organizationId,
    });
    return apiSuccess(nom);
  } catch (err) {
    logger.error("Failed to create nomination", { error: String(err) });
    return apiError("Internal server error", 500);
  }
});

app.patch("/api/party/nominations/:id/approve", async (c) => {
  const payload = c.get(CIVIC_JWT_KEY as never) as PartyJWTPayload;
  if (payload.role !== "admin") return apiError("Forbidden — admin role required", 403);
  try {
    const body = await c.req.json<{ notes?: string }>().catch(() => ({}));
    const nom = await updatePartyNominationStatus(c.env.DB, c.req.param("id"), payload.tenantId, "approved", payload.sub, body.notes);
    if (!nom) return apiError("Nomination not found", 404);
    // Emit bridge event → CIV-3 candidate nomination
    await emitEvent(c.env, "candidate.nominated", payload.tenantId, {
      nominationId: nom.id,
      memberId: nom.memberId,
      position: nom.position,
      constituency: nom.constituency,
      electionRef: nom.electionRef,
      organizationId: payload.organizationId,
    });
    // Phase 6: notify nominee of approval
    const nomMember = await getPartyMemberById(c.env.DB, nom.memberId, payload.tenantId).catch(() => null);
    if (nomMember?.phone) {
      const notifSvc = createNotificationService(c.env);
      notifSvc.requestNotification({
        tenantId: payload.tenantId,
        organizationId: payload.organizationId,
        recipientPhone: nomMember.phone,
        channel: "whatsapp",
        templateId: CIVIC_NOTIFICATION_TEMPLATES.NOMINATION_APPROVED,
        data: { position: nom.position, nomineeId: nom.id, nominationId: nom.id },
        priority: "high",
        idempotencyKey: `nomination-approved:${nom.id}`,
      }).catch((e) => logger.error("Nomination approval notification failed", { error: String(e) }));
    }
    return apiSuccess(nom);
  } catch (err) {
    logger.error("Failed to approve nomination", { error: String(err) });
    return apiError("Internal server error", 500);
  }
});

app.patch("/api/party/nominations/:id/reject", async (c) => {
  const payload = c.get(CIVIC_JWT_KEY as never) as PartyJWTPayload;
  if (payload.role !== "admin") return apiError("Forbidden — admin role required", 403);
  try {
    const body = await c.req.json<{ notes?: string }>().catch(() => ({}));
    const nom = await updatePartyNominationStatus(c.env.DB, c.req.param("id"), payload.tenantId, "rejected", payload.sub, body.notes);
    if (!nom) return apiError("Nomination not found", 404);
    await emitEvent(c.env, "party.nomination.rejected", payload.tenantId, { nominationId: nom.id, organizationId: payload.organizationId });
    // Phase 6: notify nominee of rejection
    const rejMember = await getPartyMemberById(c.env.DB, nom.memberId, payload.tenantId).catch(() => null);
    if (rejMember?.phone) {
      const notifSvc = createNotificationService(c.env);
      notifSvc.requestNotification({
        tenantId: payload.tenantId,
        organizationId: payload.organizationId,
        recipientPhone: rejMember.phone,
        channel: "whatsapp",
        templateId: CIVIC_NOTIFICATION_TEMPLATES.NOMINATION_REJECTED,
        data: { position: nom.position, notes: body.notes ?? "" },
        priority: "normal",
        idempotencyKey: `nomination-rejected:${nom.id}`,
      }).catch((e) => logger.error("Nomination rejection notification failed", { error: String(e) }));
    }
    return apiSuccess(nom);
  } catch (err) {
    logger.error("Failed to reject nomination", { error: String(err) });
    return apiError("Internal server error", 500);
  }
});

app.patch("/api/party/nominations/:id/submit", async (c) => {
  const payload = c.get(CIVIC_JWT_KEY as never) as PartyJWTPayload;
  if (payload.role !== "admin") return apiError("Forbidden — admin role required", 403);
  try {
    const nom = await updatePartyNominationStatus(c.env.DB, c.req.param("id"), payload.tenantId, "submitted", payload.sub);
    if (!nom) return apiError("Nomination not found", 404);
    await emitEvent(c.env, "party.nomination.submitted", payload.tenantId, { nominationId: nom.id, organizationId: payload.organizationId });
    return apiSuccess(nom);
  } catch (err) {
    logger.error("Failed to submit nomination", { error: String(err) });
    return apiError("Internal server error", 500);
  }
});

// ─── T005: P06 — Campaign Finance Tracker (Electoral Act 2022) ────────────────

app.get("/api/party/campaign-finance", async (c) => {
  const payload = c.get(CIVIC_JWT_KEY as never) as PartyJWTPayload;
  try {
    const accounts = await getCampaignAccounts(c.env.DB, payload.tenantId, payload.organizationId);
    return apiSuccess({ accounts });
  } catch (err) {
    logger.error("Failed to list campaign accounts", { error: String(err) });
    return apiError("Internal server error", 500);
  }
});

app.post("/api/party/campaign-finance", async (c) => {
  const payload = c.get(CIVIC_JWT_KEY as never) as PartyJWTPayload;
  if (payload.role !== "admin") return apiError("Forbidden — admin role required", 403);
  try {
    const body = await c.req.json<Partial<PartyCampaignAccount>>();
    if (!body.positionLevel) return apiError("positionLevel is required");
    const level = body.positionLevel as CampaignPositionLevel;
    const limitKobo = body.limitKobo ?? ELECTORAL_ACT_LIMITS_KOBO[level];
    const account: PartyCampaignAccount = {
      id: generateId(),
      tenantId: payload.tenantId,
      organizationId: payload.organizationId,
      electionRef: body.electionRef,
      candidateId: body.candidateId,
      positionLevel: level,
      limitKobo,
      createdAt: nowMs(),
      updatedAt: nowMs(),
    };
    await createCampaignAccount(c.env.DB, account);
    await emitEvent(c.env, "party.campaign_account.created", payload.tenantId, {
      accountId: account.id,
      positionLevel: level,
      limitKobo,
      organizationId: payload.organizationId,
    });
    return apiSuccess(account);
  } catch (err) {
    logger.error("Failed to create campaign account", { error: String(err) });
    return apiError("Internal server error", 500);
  }
});

app.post("/api/party/campaign-finance/:id/transactions", async (c) => {
  const payload = c.get(CIVIC_JWT_KEY as never) as PartyJWTPayload;
  if (payload.role !== "admin" && payload.role !== "officer") {
    return apiError("Forbidden — admin or officer role required", 403);
  }
  try {
    const accountId = c.req.param("id");
    const account = await getCampaignAccountById(c.env.DB, accountId, payload.tenantId);
    if (!account) return apiError("Campaign account not found", 404);

    const body = await c.req.json<Partial<PartyCampaignTransaction>>();
    if (!body.transactionType || !["income", "expenditure"].includes(body.transactionType)) {
      return apiError("transactionType must be 'income' or 'expenditure'");
    }
    if (!body.amountKobo || body.amountKobo <= 0) return apiError("amountKobo must be positive");
    if (!body.category) return apiError("category is required");
    if (!body.description) return apiError("description is required");

    const tx: PartyCampaignTransaction = {
      id: generateId(),
      tenantId: payload.tenantId,
      organizationId: payload.organizationId,
      accountId,
      transactionType: body.transactionType,
      category: body.category,
      description: body.description,
      amountKobo: body.amountKobo,
      currency: body.currency ?? "NGN",
      transactionDate: body.transactionDate ?? nowMs(),
      evidenceUrl: body.evidenceUrl,
      recordedBy: payload.sub,
      createdAt: nowMs(),
      updatedAt: nowMs(),
    };
    await addCampaignTransaction(c.env.DB, tx);

    // Check Electoral Act limit warning (>80%)
    const summary = await getCampaignFinanceSummary(c.env.DB, accountId, payload.tenantId);
    const spentPercent = account.limitKobo > 0
      ? (summary.totalExpenditureKobo / account.limitKobo) * 100
      : 0;
    const limitWarning = spentPercent >= 80
      ? { warning: `Electoral Act 2022: ${spentPercent.toFixed(1)}% of spending limit reached`, spentPercent }
      : null;

    await emitEvent(c.env, "party.campaign_transaction.recorded", payload.tenantId, {
      transactionId: tx.id,
      accountId,
      amountKobo: tx.amountKobo,
      transactionType: tx.transactionType,
      limitWarning: limitWarning !== null,
      organizationId: payload.organizationId,
    });

    return apiSuccess({ transaction: tx, ...(limitWarning ?? {}) });
  } catch (err) {
    logger.error("Failed to record campaign transaction", { error: String(err) });
    return apiError("Internal server error", 500);
  }
});

app.get("/api/party/campaign-finance/:id/summary", async (c) => {
  const payload = c.get(CIVIC_JWT_KEY as never) as PartyJWTPayload;
  try {
    const accountId = c.req.param("id");
    const account = await getCampaignAccountById(c.env.DB, accountId, payload.tenantId);
    if (!account) return apiError("Campaign account not found", 404);

    const txType = new URL(c.req.url).searchParams.get("type") as "income" | "expenditure" | undefined;
    const [summary, transactions] = await Promise.all([
      getCampaignFinanceSummary(c.env.DB, accountId, payload.tenantId),
      getCampaignTransactions(c.env.DB, accountId, payload.tenantId, txType),
    ]);

    const limitKobo = account.limitKobo;
    const spentPercent = limitKobo > 0 ? (summary.totalExpenditureKobo / limitKobo) * 100 : 0;
    const withinLimit = summary.totalExpenditureKobo <= limitKobo;

    return apiSuccess({
      account,
      summary: {
        ...summary,
        limitKobo,
        remainingKobo: Math.max(0, limitKobo - summary.totalExpenditureKobo),
        spentPercent: Math.round(spentPercent * 100) / 100,
        withinElectoralActLimit: withinLimit,
        warning: spentPercent >= 80 && withinLimit ? `${spentPercent.toFixed(1)}% of Electoral Act limit used` : null,
      },
      transactions,
    });
  } catch (err) {
    logger.error("Failed to get campaign summary", { error: String(err) });
    return apiError("Internal server error", 500);
  }
});

// ─── T008: P09 — Hierarchy Analytics ─────────────────────────────────────────

app.get("/api/party/analytics/hierarchy", async (c) => {
  const payload = c.get(PARTY_JWT_KEY as never) as PartyJWTPayload;
  const logger = createLogger("party-analytics", payload.tenantId);

  try {
    const env = c.env as PartyEnv;
    const db = env.DB as D1Database;
    const structureId = new URL(c.req.url).searchParams.get("structureId");
    const nowMs = Date.now();
    const ninetyDaysAgo = nowMs - 90 * 24 * 60 * 60 * 1000;
    const yearStart = new Date(new Date().getFullYear(), 0, 1).getTime();

    // Fetch the target structure(s): if structureId given, that node + children; else top-level
    let structures: Array<{ id: string; name: string; level: string; parentId: string | null }>;

    if (structureId) {
      const nodeRes = await db.prepare(
        `SELECT id, name, level, parentId FROM party_structures
         WHERE (id = ? OR parentId = ?) AND tenantId = ? AND deletedAt IS NULL`
      ).bind(structureId, structureId, payload.tenantId).all();
      structures = (nodeRes.results ?? []) as typeof structures;
    } else {
      const rootRes = await db.prepare(
        `SELECT id, name, level, parentId FROM party_structures
         WHERE tenantId = ? AND deletedAt IS NULL AND (parentId IS NULL OR parentId = '')
         LIMIT 50`
      ).bind(payload.tenantId).all();
      structures = (rootRes.results ?? []) as typeof structures;
    }

    if (!structures.length) {
      return apiSuccess({ node: null, children: [] });
    }

    // Gather analytics for each structure node
    const enriched = await Promise.all(structures.map(async (s) => {
      const [memberCount, activeMemberCount, duesKobo, meetingCount] = await Promise.all([
        db.prepare(
          `SELECT COUNT(*) as cnt FROM party_members WHERE structureId = ? AND tenantId = ? AND deletedAt IS NULL`
        ).bind(s.id, payload.tenantId).first<{ cnt: number }>(),
        db.prepare(
          `SELECT COUNT(*) as cnt FROM party_members WHERE structureId = ? AND tenantId = ? AND status = 'active' AND deletedAt IS NULL`
        ).bind(s.id, payload.tenantId).first<{ cnt: number }>(),
        db.prepare(
          `SELECT COALESCE(SUM(pd.amountKobo), 0) as total FROM party_dues pd
           INNER JOIN party_members pm ON pd.memberId = pm.id
           WHERE pm.structureId = ? AND pm.tenantId = ? AND pd.paidAt >= ? AND pd.deletedAt IS NULL`
        ).bind(s.id, payload.tenantId, yearStart).first<{ total: number }>(),
        db.prepare(
          `SELECT COUNT(*) as cnt FROM party_meetings WHERE structureId = ? AND tenantId = ? AND scheduledAt >= ? AND deletedAt IS NULL`
        ).bind(s.id, payload.tenantId, ninetyDaysAgo).first<{ cnt: number }>(),
      ]);

      return {
        structureId: s.id,
        name: s.name,
        level: s.level,
        parentId: s.parentId ?? null,
        memberCount: memberCount?.cnt ?? 0,
        activeMemberCount: activeMemberCount?.cnt ?? 0,
        duesCollectedKoboYTD: duesKobo?.total ?? 0,
        meetingCountLast90d: meetingCount?.cnt ?? 0,
      };
    }));

    // Separate root node from children (when structureId given, first result is the node itself)
    if (structureId) {
      const node = enriched.find((s) => s.structureId === structureId) ?? null;
      const children = enriched.filter((s) => s.structureId !== structureId);
      return apiSuccess({ node, children });
    }

    return apiSuccess({ node: null, children: enriched });
  } catch (err) {
    logger.error("Hierarchy analytics failed", { error: String(err) });
    return apiError("Internal server error", 500);
  }
});

// ─── Party Activity Log ────────────────────────────────────────────────────────

/**
 * GET /api/party/activity-log?page=&limit=
 * Admin: recent party activity — member joins, dues payments, nominations.
 * Returns a unified time-sorted list of events from existing tables.
 */
app.get("/api/party/activity-log", async (c) => {
  const { tenantId } = (c as unknown as { get: (k: string) => { tenantId: string } }).get("partyJwt") as { tenantId: string };
  const limit = Math.min(Number(c.req.query("limit") ?? 40), 100);
  const offset = (Math.max(Number(c.req.query("page") ?? 1), 1) - 1) * limit;

  try {
    const sql = `
      SELECT 'member_join' AS type, id, tenantId, fullName AS subject, createdAt, 'new_member' AS detail FROM civic_party_members
        WHERE tenantId = ? AND deletedAt IS NULL
      UNION ALL
      SELECT 'dues_paid' AS type, id, tenantId, receiptNumber AS subject, paidAt AS createdAt, paymentMethod AS detail FROM party_dues
        WHERE tenantId = ? AND deletedAt IS NULL
      UNION ALL
      SELECT 'nomination' AS type, id, tenantId, position AS subject, createdAt, status AS detail FROM party_nominations
        WHERE tenantId = ? AND deletedAt IS NULL
      ORDER BY createdAt DESC
      LIMIT ? OFFSET ?
    `;
    const rows = await c.env.DB.prepare(sql).bind(tenantId, tenantId, tenantId, limit, offset).all<{ type: string; id: string; tenantId: string; subject: string; createdAt: number; detail: string }>();

    return apiSuccess({ events: rows.results ?? [] });
  } catch (err) {
    logger.error("Activity log fetch failed", { error: String(err) });
    return apiError("Internal server error", 500);
  }
});

// ─── Export ───────────────────────────────────────────────────────────────────

export default app;
export { generateMembershipNumber, generateCardNumber, koboToNaira };
