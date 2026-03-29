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
} from "../../../core/db/schema";
import { PARTY_MIGRATION_SQL } from "../../../core/db/schema";

const logger = createLogger("political-party-api");

// ─── Environment ──────────────────────────────────────────────────────────────

interface Env extends EventBusEnv {
  DB: D1Database;
  JWT_SECRET: string;
}

// ─── JWT Payload ──────────────────────────────────────────────────────────────

interface JWTPayload {
  sub: string;
  tenantId: string;
  organizationId: string;
  role: "admin" | "organizer" | "member" | "viewer";
  name: string;
  exp: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function generateId(): string {
  return crypto.randomUUID();
}

function nowMs(): number {
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

app.use("/api/party/*", async (c, next) => {
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
  const authHeader = c.req.header("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return apiError("Unauthorized", 401);
  }
  const payload = await verifyJWT(authHeader.slice(7), c.env.JWT_SECRET);
  if (payload === null || payload.role !== "admin") {
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
  const payload = c.get("jwtPayload" as never) as JWTPayload;
  const org = await getPartyOrganizationByTenant(c.env.DB, payload.tenantId);
  if (org === null) {
    return apiError("Organization not found", 404);
  }
  return apiSuccess(org);
});

// PATCH /api/party/organizations/:id — update org settings (admin only)
app.patch("/api/party/organizations/:id", async (c) => {
  const payload = c.get("jwtPayload" as never) as JWTPayload;
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
  const payload = c.get("jwtPayload" as never) as JWTPayload;
  const stats = await getPartyDashboardSummary(c.env.DB, payload.tenantId, payload.organizationId);
  return apiSuccess({
    ...stats,
    totalDuesCollectedNaira: koboToNaira(stats.totalDuesCollectedKobo),
    currentYearDuesNaira: koboToNaira(stats.currentYearDuesKobo),
  });
});

// POST /api/party/organizations — create party organization
app.post("/api/party/organizations", async (c) => {
  const payload = c.get("jwtPayload" as never) as JWTPayload;
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
  const payload = c.get("jwtPayload" as never) as JWTPayload;
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
  const payload = c.get("jwtPayload" as never) as JWTPayload;
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
  const payload = c.get("jwtPayload" as never) as JWTPayload;
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
  const payload = c.get("jwtPayload" as never) as JWTPayload;
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
  const payload = c.get("jwtPayload" as never) as JWTPayload;
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
  const payload = c.get("jwtPayload" as never) as JWTPayload;
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
  const payload = c.get("jwtPayload" as never) as JWTPayload;
  const id = c.req.param("id");
  const member = await getPartyMemberById(c.env.DB, id, payload.tenantId);
  if (member === null) {
    return apiError("Member not found", 404);
  }
  return apiSuccess(member);
});

// POST /api/party/members — register new member (NDPR consent required)
app.post("/api/party/members", async (c) => {
  const payload = c.get("jwtPayload" as never) as JWTPayload;
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
  logger.info("Party member registered", { id: member.id, membershipNumber, tenantId: payload.tenantId });
  return apiSuccess(member);
});

// PATCH /api/party/members/:id — update member details
app.patch("/api/party/members/:id", async (c) => {
  const payload = c.get("jwtPayload" as never) as JWTPayload;
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
  const payload = c.get("jwtPayload" as never) as JWTPayload;
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
  const payload = c.get("jwtPayload" as never) as JWTPayload;
  const id = c.req.param("id");
  const dues = await getPartyDuesByMember(c.env.DB, id, payload.tenantId);
  return apiSuccess(dues);
});

// GET /api/party/members/:id/card — member ID card details
app.get("/api/party/members/:id/card", async (c) => {
  const payload = c.get("jwtPayload" as never) as JWTPayload;
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
  const payload = c.get("jwtPayload" as never) as JWTPayload;
  const yearStr = c.req.query("year");
  const year = yearStr ? parseInt(yearStr, 10) : undefined;
  const dues = await getPartyDuesByOrg(c.env.DB, payload.tenantId, payload.organizationId, year);
  return apiSuccess(dues);
});

// GET /api/party/dues/summary — dues collection summary by year
app.get("/api/party/dues/summary", async (c) => {
  const payload = c.get("jwtPayload" as never) as JWTPayload;
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
  const payload = c.get("jwtPayload" as never) as JWTPayload;
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
  logger.info("Party dues recorded", { id: dues.id, memberId: dues.memberId, year: dues.year, tenantId: payload.tenantId });
  return apiSuccess(dues);
});

// PATCH /api/party/dues/:id — update dues record
app.patch("/api/party/dues/:id", async (c) => {
  const payload = c.get("jwtPayload" as never) as JWTPayload;
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
  const payload = c.get("jwtPayload" as never) as JWTPayload;
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
  const payload = c.get("jwtPayload" as never) as JWTPayload;
  const structureId = c.req.query("structureId");
  if (!structureId) {
    return apiError("structureId query parameter is required");
  }
  const positions = await getPartyPositionsByStructure(c.env.DB, structureId, payload.tenantId);
  return apiSuccess(positions);
});

// POST /api/party/positions — create/assign position
app.post("/api/party/positions", async (c) => {
  const payload = c.get("jwtPayload" as never) as JWTPayload;
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
  const payload = c.get("jwtPayload" as never) as JWTPayload;
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
  const payload = c.get("jwtPayload" as never) as JWTPayload;
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
  const payload = c.get("jwtPayload" as never) as JWTPayload;
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
  const payload = c.get("jwtPayload" as never) as JWTPayload;
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
  const payload = c.get("jwtPayload" as never) as JWTPayload;
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
  const payload = c.get("jwtPayload" as never) as JWTPayload;
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
  const payload = c.get("jwtPayload" as never) as JWTPayload;
  const announcements = await getPartyAnnouncementsByOrg(
    c.env.DB,
    payload.tenantId,
    payload.organizationId
  );
  return apiSuccess(announcements);
});

// POST /api/party/announcements — create announcement
app.post("/api/party/announcements", async (c) => {
  const payload = c.get("jwtPayload" as never) as JWTPayload;
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
  const payload = c.get("jwtPayload" as never) as JWTPayload;
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
  logger.info("Party ID card issued", { id: card.id, memberId: card.memberId, cardNumber, tenantId: payload.tenantId });
  return apiSuccess(card);
});

// PATCH /api/party/id-cards/:id — revoke ID card
app.patch("/api/party/id-cards/:id", async (c) => {
  const payload = c.get("jwtPayload" as never) as JWTPayload;
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
  const payload = c.get("jwtPayload" as never) as JWTPayload;
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
  const payload = c.get("jwtPayload" as never) as JWTPayload;
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

// ─── Export ───────────────────────────────────────────────────────────────────

export default app;
export { generateMembershipNumber, generateCardNumber, koboToNaira };
