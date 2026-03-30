/**
 * WebWaka Civic — CIV-3 Elections & Campaigns API
 * Blueprint Reference: Part 10.9 (Civic & Political Suite — Elections & Campaigns)
 * Blueprint Reference: Part 9.2 (Universal Architecture Standards)
 * 
 * 45 Hono endpoints across 8 resource groups:
 * 1. Elections Management (8 endpoints)
 * 2. Candidates Management (6 endpoints)
 * 3. Voting (8 endpoints)
 * 4. Volunteers (8 endpoints)
 * 5. Fundraising (8 endpoints)
 * 6. Campaign Materials (5 endpoints)
 * 7. Announcements (3 endpoints)
 * 8. Sync & Health (2 endpoints)
 */

import { Hono } from "hono";
import { v4 as uuidv4 } from "uuid";
import { createLogger } from "../../../core/logger";
const logger = createLogger("elections");
import { CIVIC_EVENTS } from "../../../core/event-bus/index";
import {
  electionAuthMiddleware,
  requireAdminOrManager,
  requireAdmin,
  requireElectionRole,
} from "../../../core/rbac";
import type {
  Election,
  Candidate,
  Vote,
  VotingStation,
  Volunteer,
  VolunteerTask,
  CampaignDonation,
  CampaignExpense,
  CampaignMaterial,
  CampaignAnnouncement,
  ElectionResult,
  VolunteerMessage,
  ElectionAuditLog,
  ElectionStatus,
  CandidateStatus,
  VotingStationStatus,
  VolunteerStatus,
  VolunteerTaskStatus,
  DonationStatus,
  MaterialStatus,
  ApprovalStatus,
  ElectionResultCollation,
  CollationLevel,
} from "../../../core/db/schema";
import {
  createResultCollation,
  getElectionCollations,
  certifyCollation,
  getPublicElectionResults,
  getPublicCollationBreakdown,
} from "../../../core/db/queries";
import type { D1Database } from "../../../core/db/queries";

export interface ElectionsEnv {
  DB: D1Database;
  JWT_SECRET: string;
  EVENT_BUS_URL?: string;
  EVENT_BUS_TOKEN?: string;
}

const app = new Hono<{ Bindings: ElectionsEnv }>();

// ─── Auth Middleware ──────────────────────────────────────────────────────────
// Health check is public; all other endpoints require a valid JWT.
app.use("*", async (c, next) => {
  if (c.req.path.endsWith("/health")) return next();
  return electionAuthMiddleware()(c, next);
});

// ─── Utility Functions ──────────────────────────────────────────────────────────

/**
 * Publish event to event bus
 */
async function publishEvent(
  env: ElectionsEnv,
  eventType: string,
  tenantId: string,
  electionId: string,
  payload: Record<string, unknown>
): Promise<void> {
  try {
    if (env.EVENT_BUS_URL && env.EVENT_BUS_TOKEN) {
      await fetch(env.EVENT_BUS_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${env.EVENT_BUS_TOKEN}`,
        },
        body: JSON.stringify({
          type: eventType,
          tenantId,
          electionId,
          payload,
          timestamp: new Date().toISOString(),
          version: "1.0",
        }),
      });
    }
  } catch (error) {
    logger.error("Failed to publish event", { eventType, tenantId, electionId, error: String(error) });
  }
}

/**
 * Log audit event
 */
async function logAuditEvent(
  db: D1Database,
  tenantId: string,
  electionId: string,
  actionType: string,
  actorId: string | undefined,
  details: Record<string, unknown>
): Promise<void> {
  try {
    const auditLog: ElectionAuditLog = {
      id: uuidv4(),
      tenantId,
      electionId,
      actionType,
      actorId,
      actorRole: "admin",
      details: JSON.stringify(details),
      createdAt: Date.now(),
    };
    await db.prepare(
      `INSERT INTO civic_election_audit_logs (id, tenantId, electionId, actionType, actorId, actorRole, details, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      auditLog.id,
      auditLog.tenantId,
      auditLog.electionId,
      auditLog.actionType,
      auditLog.actorId,
      auditLog.actorRole,
      auditLog.details,
      auditLog.createdAt
    ).run();
  } catch (error) {
    logger.error("Failed to log audit event", { actionType, error: String(error) });
  }
}

// ─── GROUP 1: Elections Management (8 endpoints) ─────────────────────────────────

/**
 * POST /api/elections
 * Create a new election
 */
app.post("/", requireAdminOrManager, async (c) => {
  try {
    const { tenantId, name, electionType, position, nominationStartAt, nominationEndAt, votingStartAt, votingEndAt } = await c.req.json();
    
    if (!tenantId || !name || !position) {
      return c.json({ success: false, error: "Missing required fields" }, 400);
    }

    const election: Election = {
      id: uuidv4(),
      tenantId,
      name,
      electionType: electionType || "primary",
      position,
      nominationStartAt,
      nominationEndAt,
      votingStartAt,
      votingEndAt,
      status: "draft",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    await c.env.DB.prepare(
      `INSERT INTO civic_elections (id, tenantId, name, electionType, position, nominationStartAt, nominationEndAt, votingStartAt, votingEndAt, status, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      election.id,
      election.tenantId,
      election.name,
      election.electionType,
      election.position,
      election.nominationStartAt,
      election.nominationEndAt,
      election.votingStartAt,
      election.votingEndAt,
      election.status,
      election.createdAt,
      election.updatedAt
    ).run();

    await publishEvent(c.env, CIVIC_EVENTS.ELECTION_CREATED, tenantId, election.id, { name, position });
    await logAuditEvent(c.env.DB, tenantId, election.id, "election_created", undefined, { name, position });

    logger.info("Election created", { tenantId, electionId: election.id, name });
    return c.json({ success: true, data: election }, 201);
  } catch (error) {
    logger.error("Failed to create election", { error: String(error) });
    return c.json({ success: false, error: "Failed to create election" }, 500);
  }
});

/**
 * GET /api/elections
 * List all elections for a tenant
 */
app.get("/", async (c) => {
  try {
    const tenantId = c.req.query("tenantId");
    if (!tenantId) {
      return c.json({ success: false, error: "tenantId required" }, 400);
    }

    const result = await c.env.DB.prepare(
      `SELECT * FROM civic_elections WHERE tenantId = ? AND deletedAt IS NULL ORDER BY createdAt DESC`
    ).bind(tenantId).all();

    return c.json({ success: true, data: result.results || [] });
  } catch (error) {
    logger.error("Failed to list elections", { error: String(error) });
    return c.json({ success: false, error: "Failed to list elections" }, 500);
  }
});

/**
 * GET /api/elections/:id
 * Get election details
 */
app.get("/:id", async (c) => {
  try {
    const { id } = c.req.param();
    const tenantId = c.req.query("tenantId");
    if (!tenantId) {
      return c.json({ success: false, error: "tenantId required" }, 400);
    }

    const result = await c.env.DB.prepare(
      `SELECT * FROM civic_elections WHERE id = ? AND tenantId = ? AND deletedAt IS NULL`
    ).bind(id, tenantId).first();

    if (!result) {
      return c.json({ success: false, error: "Election not found" }, 404);
    }

    return c.json({ success: true, data: result });
  } catch (error) {
    logger.error("Failed to get election", { error: String(error) });
    return c.json({ success: false, error: "Failed to get election" }, 500);
  }
});

/**
 * PATCH /api/elections/:id
 * Update election
 */
app.patch("/:id", requireAdminOrManager, async (c) => {
  try {
    const { id } = c.req.param();
    const tenantId = c.req.query("tenantId");
    if (!tenantId) {
      return c.json({ success: false, error: "tenantId required" }, 400);
    }

    const updates = await c.req.json();
    const updatedAt = Date.now();

    const result = await c.env.DB.prepare(
      `UPDATE civic_elections SET name = COALESCE(?, name), status = COALESCE(?, status), updatedAt = ? 
       WHERE id = ? AND tenantId = ? AND deletedAt IS NULL`
    ).bind(
      updates.name,
      updates.status,
      updatedAt,
      id,
      tenantId
    ).run();

    if (!result.success) {
      return c.json({ success: false, error: "Election not found" }, 404);
    }

    await logAuditEvent(c.env.DB, tenantId, id, "election_updated", undefined, updates);
    logger.info("Election updated", { tenantId, electionId: id });
    return c.json({ success: true, data: { id, ...updates, updatedAt } });
  } catch (error) {
    logger.error("Failed to update election", { error: String(error) });
    return c.json({ success: false, error: "Failed to update election" }, 500);
  }
});

/**
 * POST /api/elections/:id/start-nomination
 * Start nomination period
 */
app.post("/:id/start-nomination", requireAdminOrManager, async (c) => {
  try {
    const { id } = c.req.param();
    const tenantId = c.req.query("tenantId");
    if (!tenantId) {
      return c.json({ success: false, error: "tenantId required" }, 400);
    }

    const updatedAt = Date.now();
    await c.env.DB.prepare(
      `UPDATE civic_elections SET status = 'nomination', updatedAt = ? WHERE id = ? AND tenantId = ? AND deletedAt IS NULL`
    ).bind(updatedAt, id, tenantId).run();

    await publishEvent(c.env, CIVIC_EVENTS.ELECTION_NOMINATION_STARTED, tenantId, id, {});
    await logAuditEvent(c.env.DB, tenantId, id, "nomination_started", undefined, {});

    logger.info("Nomination started", { tenantId, electionId: id });
    return c.json({ success: true, data: { id, status: "nomination", updatedAt } });
  } catch (error) {
    logger.error("Failed to start nomination", { error: String(error) });
    return c.json({ success: false, error: "Failed to start nomination" }, 500);
  }
});

/**
 * POST /api/elections/:id/start-voting
 * Start voting period
 */
app.post("/:id/start-voting", requireAdminOrManager, async (c) => {
  try {
    const { id } = c.req.param();
    const tenantId = c.req.query("tenantId");
    if (!tenantId) {
      return c.json({ success: false, error: "tenantId required" }, 400);
    }

    const updatedAt = Date.now();
    await c.env.DB.prepare(
      `UPDATE civic_elections SET status = 'voting', updatedAt = ? WHERE id = ? AND tenantId = ? AND deletedAt IS NULL`
    ).bind(updatedAt, id, tenantId).run();

    await publishEvent(c.env, CIVIC_EVENTS.ELECTION_VOTING_STARTED, tenantId, id, {});
    await logAuditEvent(c.env.DB, tenantId, id, "voting_started", undefined, {});

    logger.info("Voting started", { tenantId, electionId: id });
    return c.json({ success: true, data: { id, status: "voting", updatedAt } });
  } catch (error) {
    logger.error("Failed to start voting", { error: String(error) });
    return c.json({ success: false, error: "Failed to start voting" }, 500);
  }
});

/**
 * POST /api/elections/:id/announce-results
 * Announce results
 */
app.post("/:id/announce-results", requireAdminOrManager, async (c) => {
  try {
    const { id } = c.req.param();
    const tenantId = c.req.query("tenantId");
    if (!tenantId) {
      return c.json({ success: false, error: "tenantId required" }, 400);
    }

    const updatedAt = Date.now();
    await c.env.DB.prepare(
      `UPDATE civic_elections SET status = 'results', resultAnnouncementAt = ?, updatedAt = ? WHERE id = ? AND tenantId = ? AND deletedAt IS NULL`
    ).bind(updatedAt, updatedAt, id, tenantId).run();

    await publishEvent(c.env, CIVIC_EVENTS.ELECTION_RESULTS_ANNOUNCED, tenantId, id, {});
    await logAuditEvent(c.env.DB, tenantId, id, "results_announced", undefined, {});

    logger.info("Results announced", { tenantId, electionId: id });
    return c.json({ success: true, data: { id, status: "results", updatedAt } });
  } catch (error) {
    logger.error("Failed to announce results", { error: String(error) });
    return c.json({ success: false, error: "Failed to announce results" }, 500);
  }
});

/**
 * DELETE /api/elections/:id
 * Soft delete election
 */
app.delete("/:id", requireAdmin, async (c) => {
  try {
    const { id } = c.req.param();
    const tenantId = c.req.query("tenantId");
    if (!tenantId) {
      return c.json({ success: false, error: "tenantId required" }, 400);
    }

    const deletedAt = Date.now();
    await c.env.DB.prepare(
      `UPDATE civic_elections SET deletedAt = ? WHERE id = ? AND tenantId = ? AND deletedAt IS NULL`
    ).bind(deletedAt, id, tenantId).run();

    await logAuditEvent(c.env.DB, tenantId, id, "election_deleted", undefined, {});
    logger.info("Election deleted", { tenantId, electionId: id });
    return c.json({ success: true, data: { id, deletedAt } });
  } catch (error) {
    logger.error("Failed to delete election", { error: String(error) });
    return c.json({ success: false, error: "Failed to delete election" }, 500);
  }
});

// ─── GROUP 2: Candidates Management (6 endpoints) ────────────────────────────────

/**
 * POST /api/elections/:electionId/candidates
 * Nominate candidate
 */
app.post("/:electionId/candidates", requireAdminOrManager, async (c) => {
  try {
    const { electionId } = c.req.param();
    const tenantId = c.req.query("tenantId");
    if (!tenantId) {
      return c.json({ success: false, error: "tenantId required" }, 400);
    }

    const { memberId, name, bio, manifestoUrl, photoUrl, nominatedBy } = await c.req.json();
    if (!memberId || !name || !nominatedBy) {
      return c.json({ success: false, error: "Missing required fields" }, 400);
    }

    const candidate: Candidate = {
      id: uuidv4(),
      tenantId,
      electionId,
      memberId,
      name,
      bio,
      manifestoUrl,
      photoUrl,
      nominatedBy,
      nominationDate: Date.now(),
      status: "nominated",
      voteCount: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    await c.env.DB.prepare(
      `INSERT INTO civic_candidates (id, tenantId, electionId, memberId, name, bio, manifestoUrl, photoUrl, nominatedBy, nominationDate, status, voteCount, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      candidate.id,
      candidate.tenantId,
      candidate.electionId,
      candidate.memberId,
      candidate.name,
      candidate.bio,
      candidate.manifestoUrl,
      candidate.photoUrl,
      candidate.nominatedBy,
      candidate.nominationDate,
      candidate.status,
      candidate.voteCount,
      candidate.createdAt,
      candidate.updatedAt
    ).run();

    await publishEvent(c.env, CIVIC_EVENTS.CANDIDATE_NOMINATED, tenantId, electionId, { candidateId: candidate.id, name });
    await logAuditEvent(c.env.DB, tenantId, electionId, "candidate_nominated", undefined, { candidateId: candidate.id, name });

    logger.info("Candidate nominated", { tenantId, electionId, candidateId: candidate.id, name });
    return c.json({ success: true, data: candidate }, 201);
  } catch (error) {
    logger.error("Failed to nominate candidate", { error: String(error) });
    return c.json({ success: false, error: "Failed to nominate candidate" }, 500);
  }
});

/**
 * GET /api/elections/:electionId/candidates
 * List candidates
 */
app.get("/:electionId/candidates", async (c) => {
  try {
    const { electionId } = c.req.param();
    const tenantId = c.req.query("tenantId");
    if (!tenantId) {
      return c.json({ success: false, error: "tenantId required" }, 400);
    }

    const result = await c.env.DB.prepare(
      `SELECT * FROM civic_candidates WHERE electionId = ? AND tenantId = ? AND deletedAt IS NULL ORDER BY createdAt DESC`
    ).bind(electionId, tenantId).all();

    return c.json({ success: true, data: result.results || [] });
  } catch (error) {
    logger.error("Failed to list candidates", { error: String(error) });
    return c.json({ success: false, error: "Failed to list candidates" }, 500);
  }
});

/**
 * GET /api/elections/:electionId/candidates/:id
 * Get candidate details
 */
app.get("/:electionId/candidates/:id", async (c) => {
  try {
    const { electionId, id } = c.req.param();
    const tenantId = c.req.query("tenantId");
    if (!tenantId) {
      return c.json({ success: false, error: "tenantId required" }, 400);
    }

    const result = await c.env.DB.prepare(
      `SELECT * FROM civic_candidates WHERE id = ? AND electionId = ? AND tenantId = ? AND deletedAt IS NULL`
    ).bind(id, electionId, tenantId).first();

    if (!result) {
      return c.json({ success: false, error: "Candidate not found" }, 404);
    }

    return c.json({ success: true, data: result });
  } catch (error) {
    logger.error("Failed to get candidate", { error: String(error) });
    return c.json({ success: false, error: "Failed to get candidate" }, 500);
  }
});

/**
 * PATCH /api/elections/:electionId/candidates/:id
 * Update candidate
 */
app.patch("/:electionId/candidates/:id", requireAdminOrManager, async (c) => {
  try {
    const { electionId, id } = c.req.param();
    const tenantId = c.req.query("tenantId");
    if (!tenantId) {
      return c.json({ success: false, error: "tenantId required" }, 400);
    }

    const updates = await c.req.json();
    const updatedAt = Date.now();

    await c.env.DB.prepare(
      `UPDATE civic_candidates SET name = COALESCE(?, name), bio = COALESCE(?, bio), manifestoUrl = COALESCE(?, manifestoUrl), photoUrl = COALESCE(?, photoUrl), updatedAt = ? 
       WHERE id = ? AND electionId = ? AND tenantId = ? AND deletedAt IS NULL`
    ).bind(
      updates.name,
      updates.bio,
      updates.manifestoUrl,
      updates.photoUrl,
      updatedAt,
      id,
      electionId,
      tenantId
    ).run();

    logger.info("Candidate updated", { tenantId, electionId, candidateId: id });
    return c.json({ success: true, data: { id, ...updates, updatedAt } });
  } catch (error) {
    logger.error("Failed to update candidate", { error: String(error) });
    return c.json({ success: false, error: "Failed to update candidate" }, 500);
  }
});

/**
 * POST /api/elections/:electionId/candidates/:id/approve
 * Approve candidate
 */
app.post("/:electionId/candidates/:id/approve", requireAdmin, async (c) => {
  try {
    const { electionId, id } = c.req.param();
    const tenantId = c.req.query("tenantId");
    if (!tenantId) {
      return c.json({ success: false, error: "tenantId required" }, 400);
    }

    const updatedAt = Date.now();
    await c.env.DB.prepare(
      `UPDATE civic_candidates SET status = 'approved', updatedAt = ? WHERE id = ? AND electionId = ? AND tenantId = ? AND deletedAt IS NULL`
    ).bind(updatedAt, id, electionId, tenantId).run();

    await publishEvent(c.env, CIVIC_EVENTS.CANDIDATE_APPROVED, tenantId, electionId, { candidateId: id });
    await logAuditEvent(c.env.DB, tenantId, electionId, "candidate_approved", undefined, { candidateId: id });

    logger.info("Candidate approved", { tenantId, electionId, candidateId: id });
    return c.json({ success: true, data: { id, status: "approved", updatedAt } });
  } catch (error) {
    logger.error("Failed to approve candidate", { error: String(error) });
    return c.json({ success: false, error: "Failed to approve candidate" }, 500);
  }
});

/**
 * DELETE /api/elections/:electionId/candidates/:id
 * Reject/withdraw candidate
 */
app.delete("/:electionId/candidates/:id", requireAdminOrManager, async (c) => {
  try {
    const { electionId, id } = c.req.param();
    const tenantId = c.req.query("tenantId");
    if (!tenantId) {
      return c.json({ success: false, error: "tenantId required" }, 400);
    }

    const { reason } = await c.req.json();
    const updatedAt = Date.now();

    await c.env.DB.prepare(
      `UPDATE civic_candidates SET status = 'rejected', updatedAt = ?, deletedAt = ? WHERE id = ? AND electionId = ? AND tenantId = ? AND deletedAt IS NULL`
    ).bind(updatedAt, updatedAt, id, electionId, tenantId).run();

    await publishEvent(c.env, CIVIC_EVENTS.CANDIDATE_REJECTED, tenantId, electionId, { candidateId: id, reason });
    await logAuditEvent(c.env.DB, tenantId, electionId, "candidate_rejected", undefined, { candidateId: id, reason });

    logger.info("Candidate rejected", { tenantId, electionId, candidateId: id });
    return c.json({ success: true, data: { id, status: "rejected", updatedAt } });
  } catch (error) {
    logger.error("Failed to reject candidate", { error: String(error) });
    return c.json({ success: false, error: "Failed to reject candidate" }, 500);
  }
});

// ─── GROUP 3: Voting (8 endpoints) ──────────────────────────────────────────────

/**
 * POST /api/elections/:electionId/voting-stations
 * Create voting station
 */
app.post("/:electionId/voting-stations", requireAdminOrManager, async (c) => {
  try {
    const { electionId } = c.req.param();
    const tenantId = c.req.query("tenantId");
    if (!tenantId) {
      return c.json({ success: false, error: "tenantId required" }, 400);
    }

    const { name, location, latitude, longitude, capacity } = await c.req.json();
    if (!name || !location || !capacity) {
      return c.json({ success: false, error: "Missing required fields" }, 400);
    }

    const station: VotingStation = {
      id: uuidv4(),
      tenantId,
      electionId,
      name,
      location,
      latitude,
      longitude,
      capacity,
      votesCount: 0,
      status: "active",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    await c.env.DB.prepare(
      `INSERT INTO civic_voting_stations (id, tenantId, electionId, name, location, latitude, longitude, capacity, votesCount, status, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      station.id,
      station.tenantId,
      station.electionId,
      station.name,
      station.location,
      station.latitude,
      station.longitude,
      station.capacity,
      station.votesCount,
      station.status,
      station.createdAt,
      station.updatedAt
    ).run();

    logger.info("Voting station created", { tenantId, electionId, stationId: station.id, name });
    return c.json({ success: true, data: station }, 201);
  } catch (error) {
    logger.error("Failed to create voting station", { error: String(error) });
    return c.json({ success: false, error: "Failed to create voting station" }, 500);
  }
});

/**
 * GET /api/elections/:electionId/voting-stations
 * List voting stations
 */
app.get("/:electionId/voting-stations", async (c) => {
  try {
    const { electionId } = c.req.param();
    const tenantId = c.req.query("tenantId");
    if (!tenantId) {
      return c.json({ success: false, error: "tenantId required" }, 400);
    }

    const result = await c.env.DB.prepare(
      `SELECT * FROM civic_voting_stations WHERE electionId = ? AND tenantId = ? AND deletedAt IS NULL ORDER BY name`
    ).bind(electionId, tenantId).all();

    return c.json({ success: true, data: result.results || [] });
  } catch (error) {
    logger.error("Failed to list voting stations", { error: String(error) });
    return c.json({ success: false, error: "Failed to list voting stations" }, 500);
  }
});

/**
 * POST /api/elections/:electionId/cast-vote
 * Cast vote (with offline support)
 */
app.post("/:electionId/cast-vote", requireElectionRole(["admin", "campaign_manager", "voter"]), async (c) => {
  try {
    const { electionId } = c.req.param();
    const tenantId = c.req.query("tenantId");
    if (!tenantId) {
      return c.json({ success: false, error: "tenantId required" }, 400);
    }

    const { voterId, candidateId, votingStationId, encryptedVote } = await c.req.json();
    if (!voterId || !candidateId || !encryptedVote) {
      return c.json({ success: false, error: "Missing required fields" }, 400);
    }

    // Check if voter has already voted
    const existingVote = await c.env.DB.prepare(
      `SELECT id FROM civic_votes WHERE electionId = ? AND voterId = ? AND deletedAt IS NULL LIMIT 1`
    ).bind(electionId, voterId).first();

    if (existingVote) {
      return c.json({ success: false, error: "Voter has already voted" }, 409);
    }

    const vote: Vote = {
      id: uuidv4(),
      tenantId,
      electionId,
      voterId,
      candidateId,
      votingStationId,
      encryptedVote,
      verificationHash: undefined,
      castAt: Date.now(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    await c.env.DB.prepare(
      `INSERT INTO civic_votes (id, tenantId, electionId, voterId, candidateId, votingStationId, encryptedVote, castAt, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      vote.id,
      vote.tenantId,
      vote.electionId,
      vote.voterId,
      vote.candidateId,
      vote.votingStationId,
      vote.encryptedVote,
      vote.castAt,
      vote.createdAt,
      vote.updatedAt
    ).run();

    // Increment candidate vote count
    await c.env.DB.prepare(
      `UPDATE civic_candidates SET voteCount = voteCount + 1 WHERE id = ? AND electionId = ? AND tenantId = ?`
    ).bind(candidateId, electionId, tenantId).run();

    // Increment voting station vote count
    if (votingStationId) {
      await c.env.DB.prepare(
        `UPDATE civic_voting_stations SET votesCount = votesCount + 1 WHERE id = ? AND electionId = ? AND tenantId = ?`
      ).bind(votingStationId, electionId, tenantId).run();
    }

    await publishEvent(c.env, CIVIC_EVENTS.VOTE_CAST, tenantId, electionId, { voteId: vote.id, voterId });
    await logAuditEvent(c.env.DB, tenantId, electionId, "vote_cast", voterId, { voteId: vote.id });

    logger.info("Vote cast", { tenantId, electionId, voteId: vote.id, voterId });
    return c.json({ success: true, data: vote }, 201);
  } catch (error) {
    logger.error("Failed to cast vote", { error: String(error) });
    return c.json({ success: false, error: "Failed to cast vote" }, 500);
  }
});

/**
 * GET /api/elections/:electionId/vote-status
 * Check if voter has voted
 */
app.get("/:electionId/vote-status", async (c) => {
  try {
    const { electionId } = c.req.param();
    const tenantId = c.req.query("tenantId");
    const voterId = c.req.query("voterId");
    if (!tenantId || !voterId) {
      return c.json({ success: false, error: "tenantId and voterId required" }, 400);
    }

    const result = await c.env.DB.prepare(
      `SELECT id, castAt FROM civic_votes WHERE electionId = ? AND voterId = ? AND tenantId = ? AND deletedAt IS NULL LIMIT 1`
    ).bind(electionId, voterId, tenantId).first();

    return c.json({ success: true, data: { hasVoted: !!result, voteId: result?.id } });
  } catch (error) {
    logger.error("Failed to check vote status", { error: String(error) });
    return c.json({ success: false, error: "Failed to check vote status" }, 500);
  }
});

/**
 * POST /api/elections/:electionId/verify-vote
 * Verify vote (optional receipt)
 */
app.post("/:electionId/verify-vote", async (c) => {
  try {
    const { electionId } = c.req.param();
    const tenantId = c.req.query("tenantId");
    if (!tenantId) {
      return c.json({ success: false, error: "tenantId required" }, 400);
    }

    const { voteId } = await c.req.json();
    if (!voteId) {
      return c.json({ success: false, error: "voteId required" }, 400);
    }

    const vote = await c.env.DB.prepare(
      `SELECT * FROM civic_votes WHERE id = ? AND electionId = ? AND tenantId = ? AND deletedAt IS NULL`
    ).bind(voteId, electionId, tenantId).first();

    if (!vote) {
      return c.json({ success: false, error: "Vote not found" }, 404);
    }

    // Generate verification hash
    const verificationHash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(voteId));
    const hashHex = Array.from(new Uint8Array(verificationHash)).map(b => b.toString(16).padStart(2, "0")).join("");

    await c.env.DB.prepare(
      `UPDATE civic_votes SET verificationHash = ? WHERE id = ? AND electionId = ? AND tenantId = ?`
    ).bind(hashHex, voteId, electionId, tenantId).run();

    await publishEvent(c.env, CIVIC_EVENTS.VOTE_VERIFIED, tenantId, electionId, { voteId });
    logger.info("Vote verified", { tenantId, electionId, voteId });

    return c.json({ success: true, data: { voteId, verificationHash: hashHex } });
  } catch (error) {
    logger.error("Failed to verify vote", { error: String(error) });
    return c.json({ success: false, error: "Failed to verify vote" }, 500);
  }
});

/**
 * GET /api/elections/:electionId/votes/count
 * Get vote count (admin only)
 */
app.get("/:electionId/votes/count", requireAdminOrManager, async (c) => {
  try {
    const { electionId } = c.req.param();
    const tenantId = c.req.query("tenantId");
    if (!tenantId) {
      return c.json({ success: false, error: "tenantId required" }, 400);
    }

    const result = await c.env.DB.prepare(
      `SELECT COUNT(*) as totalVotes FROM civic_votes WHERE electionId = ? AND tenantId = ? AND deletedAt IS NULL`
    ).bind(electionId, tenantId).first();

    return c.json({ success: true, data: { totalVotes: result?.totalVotes || 0 } });
  } catch (error) {
    logger.error("Failed to get vote count", { error: String(error) });
    return c.json({ success: false, error: "Failed to get vote count" }, 500);
  }
});

/**
 * POST /api/elections/:electionId/sync-votes
 * Sync votes from offline voting station
 */
app.post("/:electionId/sync-votes", requireAdminOrManager, async (c) => {
  try {
    const { electionId } = c.req.param();
    const tenantId = c.req.query("tenantId");
    if (!tenantId) {
      return c.json({ success: false, error: "tenantId required" }, 400);
    }

    const { votes } = await c.req.json();
    if (!Array.isArray(votes)) {
      return c.json({ success: false, error: "votes must be an array" }, 400);
    }

    let syncedCount = 0;
    for (const voteData of votes) {
      try {
        const vote: Vote = {
          id: voteData.id || uuidv4(),
          tenantId,
          electionId,
          voterId: voteData.voterId,
          candidateId: voteData.candidateId,
          votingStationId: voteData.votingStationId,
          encryptedVote: voteData.encryptedVote,
          castAt: voteData.castAt || Date.now(),
          createdAt: voteData.createdAt || Date.now(),
          updatedAt: Date.now(),
        };

        // Check for duplicates
        const existing = await c.env.DB.prepare(
          `SELECT id FROM civic_votes WHERE electionId = ? AND voterId = ? AND deletedAt IS NULL LIMIT 1`
        ).bind(electionId, vote.voterId).first();

        if (!existing) {
          await c.env.DB.prepare(
            `INSERT INTO civic_votes (id, tenantId, electionId, voterId, candidateId, votingStationId, encryptedVote, castAt, createdAt, updatedAt)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
          ).bind(
            vote.id,
            vote.tenantId,
            vote.electionId,
            vote.voterId,
            vote.candidateId,
            vote.votingStationId,
            vote.encryptedVote,
            vote.castAt,
            vote.createdAt,
            vote.updatedAt
          ).run();

          // Increment candidate vote count
          await c.env.DB.prepare(
            `UPDATE civic_candidates SET voteCount = voteCount + 1 WHERE id = ? AND electionId = ? AND tenantId = ?`
          ).bind(vote.candidateId, electionId, tenantId).run();

          syncedCount++;
        }
      } catch (error) {
        logger.error("Failed to sync individual vote", { error: String(error) });
      }
    }

    logger.info("Votes synced", { tenantId, electionId, syncedCount });
    return c.json({ success: true, data: { syncedCount, totalVotes: votes.length } });
  } catch (error) {
    logger.error("Failed to sync votes", { error: String(error) });
    return c.json({ success: false, error: "Failed to sync votes" }, 500);
  }
});

/**
 * GET /api/elections/:electionId/results
 * Get election results
 */
app.get("/:electionId/results", async (c) => {
  try {
    const { electionId } = c.req.param();
    const tenantId = c.req.query("tenantId");
    if (!tenantId) {
      return c.json({ success: false, error: "tenantId required" }, 400);
    }

    const candidates = await c.env.DB.prepare(
      `SELECT id, name, voteCount FROM civic_candidates WHERE electionId = ? AND tenantId = ? AND deletedAt IS NULL ORDER BY voteCount DESC`
    ).bind(electionId, tenantId).all();

    const totalVotes = await c.env.DB.prepare(
      `SELECT COUNT(*) as total FROM civic_votes WHERE electionId = ? AND tenantId = ? AND deletedAt IS NULL`
    ).bind(electionId, tenantId).first();

    const total = totalVotes?.total || 0;
    const results = (candidates.results || []).map((candidate: any, index: number) => ({
      candidateId: candidate.id,
      name: candidate.name,
      votes: candidate.voteCount,
      percentage: total > 0 ? ((candidate.voteCount / total) * 100).toFixed(2) : 0,
      rank: index + 1,
    }));

    return c.json({ success: true, data: { results, totalVotes: total } });
  } catch (error) {
    logger.error("Failed to get results", { error: String(error) });
    return c.json({ success: false, error: "Failed to get results" }, 500);
  }
});

// ─── GROUP 4: Volunteers (8 endpoints) ──────────────────────────────────────────

/**
 * POST /api/elections/:electionId/volunteers
 * Register volunteer
 */
app.post("/:electionId/volunteers", requireAdminOrManager, async (c) => {
  try {
    const { electionId } = c.req.param();
    const tenantId = c.req.query("tenantId");
    if (!tenantId) {
      return c.json({ success: false, error: "tenantId required" }, 400);
    }

    const { memberId, name, phone, email, skills, availability } = await c.req.json();
    if (!memberId || !name || !phone || !email) {
      return c.json({ success: false, error: "Missing required fields" }, 400);
    }

    const volunteer: Volunteer = {
      id: uuidv4(),
      tenantId,
      memberId,
      name,
      phone,
      email,
      skills: skills ? JSON.stringify(skills) : undefined,
      availability: availability ? JSON.stringify(availability) : undefined,
      status: "active",
      hoursLogged: 0,
      tasksCompleted: 0,
      points: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    await c.env.DB.prepare(
      `INSERT INTO civic_volunteers (id, tenantId, memberId, name, phone, email, skills, availability, status, hoursLogged, tasksCompleted, points, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      volunteer.id,
      volunteer.tenantId,
      volunteer.memberId,
      volunteer.name,
      volunteer.phone,
      volunteer.email,
      volunteer.skills,
      volunteer.availability,
      volunteer.status,
      volunteer.hoursLogged,
      volunteer.tasksCompleted,
      volunteer.points,
      volunteer.createdAt,
      volunteer.updatedAt
    ).run();

    await publishEvent(c.env, CIVIC_EVENTS.VOLUNTEER_REGISTERED, tenantId, electionId, { volunteerId: volunteer.id, name });
    await logAuditEvent(c.env.DB, tenantId, electionId, "volunteer_registered", undefined, { volunteerId: volunteer.id, name });

    logger.info("Volunteer registered", { tenantId, electionId, volunteerId: volunteer.id, name });
    return c.json({ success: true, data: volunteer }, 201);
  } catch (error) {
    logger.error("Failed to register volunteer", { error: String(error) });
    return c.json({ success: false, error: "Failed to register volunteer" }, 500);
  }
});

/**
 * GET /api/elections/:electionId/volunteers
 * List volunteers
 */
app.get("/:electionId/volunteers", async (c) => {
  try {
    const { electionId } = c.req.param();
    const tenantId = c.req.query("tenantId");
    if (!tenantId) {
      return c.json({ success: false, error: "tenantId required" }, 400);
    }

    const result = await c.env.DB.prepare(
      `SELECT * FROM civic_volunteers WHERE tenantId = ? AND deletedAt IS NULL ORDER BY points DESC`
    ).bind(tenantId).all();

    return c.json({ success: true, data: result.results || [] });
  } catch (error) {
    logger.error("Failed to list volunteers", { error: String(error) });
    return c.json({ success: false, error: "Failed to list volunteers" }, 500);
  }
});

/**
 * GET /api/elections/:electionId/volunteers/:id
 * Get volunteer profile
 */
app.get("/:electionId/volunteers/:id", async (c) => {
  try {
    const { id } = c.req.param();
    const tenantId = c.req.query("tenantId");
    if (!tenantId) {
      return c.json({ success: false, error: "tenantId required" }, 400);
    }

    const result = await c.env.DB.prepare(
      `SELECT * FROM civic_volunteers WHERE id = ? AND tenantId = ? AND deletedAt IS NULL`
    ).bind(id, tenantId).first();

    if (!result) {
      return c.json({ success: false, error: "Volunteer not found" }, 404);
    }

    return c.json({ success: true, data: result });
  } catch (error) {
    logger.error("Failed to get volunteer", { error: String(error) });
    return c.json({ success: false, error: "Failed to get volunteer" }, 500);
  }
});

/**
 * PATCH /api/elections/:electionId/volunteers/:id
 * Update volunteer
 */
app.patch("/:electionId/volunteers/:id", requireAdminOrManager, async (c) => {
  try {
    const { id } = c.req.param();
    const tenantId = c.req.query("tenantId");
    if (!tenantId) {
      return c.json({ success: false, error: "tenantId required" }, 400);
    }

    const updates = await c.req.json();
    const updatedAt = Date.now();

    await c.env.DB.prepare(
      `UPDATE civic_volunteers SET status = COALESCE(?, status), hoursLogged = COALESCE(?, hoursLogged), points = COALESCE(?, points), updatedAt = ? 
       WHERE id = ? AND tenantId = ? AND deletedAt IS NULL`
    ).bind(
      updates.status,
      updates.hoursLogged,
      updates.points,
      updatedAt,
      id,
      tenantId
    ).run();

    logger.info("Volunteer updated", { tenantId, volunteerId: id });
    return c.json({ success: true, data: { id, ...updates, updatedAt } });
  } catch (error) {
    logger.error("Failed to update volunteer", { error: String(error) });
    return c.json({ success: false, error: "Failed to update volunteer" }, 500);
  }
});

/**
 * POST /api/elections/:electionId/volunteers/:id/tasks
 * Assign task to volunteer
 */
app.post("/:electionId/volunteers/:id/tasks", requireAdminOrManager, async (c) => {
  try {
    const { electionId, id: volunteerId } = c.req.param();
    const tenantId = c.req.query("tenantId");
    if (!tenantId) {
      return c.json({ success: false, error: "tenantId required" }, 400);
    }

    const { title, description, taskType, dueDate, hoursEstimated } = await c.req.json();
    if (!title || !taskType) {
      return c.json({ success: false, error: "Missing required fields" }, 400);
    }

    const task: VolunteerTask = {
      id: uuidv4(),
      tenantId,
      electionId,
      volunteerId,
      title,
      description,
      taskType,
      status: "assigned",
      dueDate,
      hoursEstimated,
      hoursLogged: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    await c.env.DB.prepare(
      `INSERT INTO civic_volunteer_tasks (id, tenantId, electionId, volunteerId, title, description, taskType, status, dueDate, hoursEstimated, hoursLogged, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      task.id,
      task.tenantId,
      task.electionId,
      task.volunteerId,
      task.title,
      task.description,
      task.taskType,
      task.status,
      task.dueDate,
      task.hoursEstimated,
      task.hoursLogged,
      task.createdAt,
      task.updatedAt
    ).run();

    await publishEvent(c.env, CIVIC_EVENTS.VOLUNTEER_TASK_ASSIGNED, tenantId, electionId, { taskId: task.id, volunteerId, title });
    await logAuditEvent(c.env.DB, tenantId, electionId, "task_assigned", undefined, { taskId: task.id, volunteerId, title });

    logger.info("Task assigned", { tenantId, electionId, taskId: task.id, volunteerId, title });
    return c.json({ success: true, data: task }, 201);
  } catch (error) {
    logger.error("Failed to assign task", { error: String(error) });
    return c.json({ success: false, error: "Failed to assign task" }, 500);
  }
});

/**
 * GET /api/elections/:electionId/volunteers/:id/tasks
 * Get volunteer tasks
 */
app.get("/:electionId/volunteers/:id/tasks", async (c) => {
  try {
    const { electionId, id: volunteerId } = c.req.param();
    const tenantId = c.req.query("tenantId");
    if (!tenantId) {
      return c.json({ success: false, error: "tenantId required" }, 400);
    }

    const result = await c.env.DB.prepare(
      `SELECT * FROM civic_volunteer_tasks WHERE electionId = ? AND volunteerId = ? AND tenantId = ? AND deletedAt IS NULL ORDER BY createdAt DESC`
    ).bind(electionId, volunteerId, tenantId).all();

    return c.json({ success: true, data: result.results || [] });
  } catch (error) {
    logger.error("Failed to get volunteer tasks", { error: String(error) });
    return c.json({ success: false, error: "Failed to get volunteer tasks" }, 500);
  }
});

/**
 * PATCH /api/elections/:electionId/volunteers/:id/tasks/:taskId
 * Update task status
 */
app.patch("/:electionId/volunteers/:id/tasks/:taskId", requireElectionRole(["admin", "campaign_manager", "volunteer"]), async (c) => {
  try {
    const { electionId, id: volunteerId, taskId } = c.req.param();
    const tenantId = c.req.query("tenantId");
    if (!tenantId) {
      return c.json({ success: false, error: "tenantId required" }, 400);
    }

    const { status, hoursLogged, feedback, rating } = await c.req.json();
    const updatedAt = Date.now();

    let completedAt = undefined;
    if (status === "completed") {
      completedAt = Date.now();
    }

    await c.env.DB.prepare(
      `UPDATE civic_volunteer_tasks SET status = COALESCE(?, status), hoursLogged = COALESCE(?, hoursLogged), feedback = COALESCE(?, feedback), rating = COALESCE(?, rating), completedAt = COALESCE(?, completedAt), updatedAt = ? 
       WHERE id = ? AND volunteerId = ? AND electionId = ? AND tenantId = ? AND deletedAt IS NULL`
    ).bind(
      status,
      hoursLogged,
      feedback,
      rating,
      completedAt,
      updatedAt,
      taskId,
      volunteerId,
      electionId,
      tenantId
    ).run();

    if (status === "completed") {
      await publishEvent(c.env, CIVIC_EVENTS.VOLUNTEER_TASK_COMPLETED, tenantId, electionId, { taskId, volunteerId });
      await logAuditEvent(c.env.DB, tenantId, electionId, "task_completed", volunteerId, { taskId });
    }

    logger.info("Task updated", { tenantId, electionId, taskId, volunteerId, status });
    return c.json({ success: true, data: { taskId, status, updatedAt } });
  } catch (error) {
    logger.error("Failed to update task", { error: String(error) });
    return c.json({ success: false, error: "Failed to update task" }, 500);
  }
});

// ─── GROUP 5: Fundraising (8 endpoints) ─────────────────────────────────────────

/**
 * POST /api/elections/:electionId/donations
 * Record donation
 */
app.post("/:electionId/donations", requireAdminOrManager, async (c) => {
  try {
    const { electionId } = c.req.param();
    const tenantId = c.req.query("tenantId");
    if (!tenantId) {
      return c.json({ success: false, error: "tenantId required" }, 400);
    }

    const { donorId, amountKobo, currency, paymentMethod, paymentRef, donorName, donorEmail, donorPhone, ndprConsent } = await c.req.json();
    if (!amountKobo || !paymentMethod || !donorName) {
      return c.json({ success: false, error: "Missing required fields" }, 400);
    }

    const donation: CampaignDonation = {
      id: uuidv4(),
      tenantId,
      electionId,
      donorId,
      amountKobo,
      currency: currency || "NGN",
      paymentMethod,
      paymentRef,
      status: "completed",
      donorName,
      donorEmail,
      donorPhone,
      ndprConsent: ndprConsent || false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    await c.env.DB.prepare(
      `INSERT INTO civic_campaign_donations (id, tenantId, electionId, donorId, amountKobo, currency, paymentMethod, paymentRef, status, donorName, donorEmail, donorPhone, ndprConsent, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      donation.id,
      donation.tenantId,
      donation.electionId,
      donation.donorId,
      donation.amountKobo,
      donation.currency,
      donation.paymentMethod,
      donation.paymentRef,
      donation.status,
      donation.donorName,
      donation.donorEmail,
      donation.donorPhone,
      donation.ndprConsent ? 1 : 0,
      donation.createdAt,
      donation.updatedAt
    ).run();

    await publishEvent(c.env, CIVIC_EVENTS.DONATION_RECEIVED_CAMPAIGN, tenantId, electionId, { donationId: donation.id, amountKobo });
    await logAuditEvent(c.env.DB, tenantId, electionId, "donation_received", undefined, { donationId: donation.id, amountKobo });

    logger.info("Donation recorded", { tenantId, electionId, donationId: donation.id, amountKobo });
    return c.json({ success: true, data: donation }, 201);
  } catch (error) {
    logger.error("Failed to record donation", { error: String(error) });
    return c.json({ success: false, error: "Failed to record donation" }, 500);
  }
});

/**
 * GET /api/elections/:electionId/donations
 * List donations
 */
app.get("/:electionId/donations", async (c) => {
  try {
    const { electionId } = c.req.param();
    const tenantId = c.req.query("tenantId");
    if (!tenantId) {
      return c.json({ success: false, error: "tenantId required" }, 400);
    }

    const result = await c.env.DB.prepare(
      `SELECT * FROM civic_campaign_donations WHERE electionId = ? AND tenantId = ? AND deletedAt IS NULL ORDER BY createdAt DESC`
    ).bind(electionId, tenantId).all();

    return c.json({ success: true, data: result.results || [] });
  } catch (error) {
    logger.error("Failed to list donations", { error: String(error) });
    return c.json({ success: false, error: "Failed to list donations" }, 500);
  }
});

/**
 * GET /api/elections/:electionId/donations/summary
 * Donation summary
 */
app.get("/:electionId/donations/summary", async (c) => {
  try {
    const { electionId } = c.req.param();
    const tenantId = c.req.query("tenantId");
    if (!tenantId) {
      return c.json({ success: false, error: "tenantId required" }, 400);
    }

    const result = await c.env.DB.prepare(
      `SELECT 
        COUNT(*) as totalDonations,
        SUM(amountKobo) as totalAmountKobo,
        AVG(amountKobo) as avgAmountKobo,
        MAX(amountKobo) as maxAmountKobo
       FROM civic_campaign_donations WHERE electionId = ? AND tenantId = ? AND status = 'completed' AND deletedAt IS NULL`
    ).bind(electionId, tenantId).first();

    return c.json({ success: true, data: result });
  } catch (error) {
    logger.error("Failed to get donation summary", { error: String(error) });
    return c.json({ success: false, error: "Failed to get donation summary" }, 500);
  }
});

/**
 * POST /api/elections/:electionId/expenses
 * Record expense
 */
app.post("/:electionId/expenses", requireAdminOrManager, async (c) => {
  try {
    const { electionId } = c.req.param();
    const tenantId = c.req.query("tenantId");
    if (!tenantId) {
      return c.json({ success: false, error: "tenantId required" }, 400);
    }

    const { category, description, amountKobo, currency, expenseDate, receipt } = await c.req.json();
    if (!category || !description || !amountKobo) {
      return c.json({ success: false, error: "Missing required fields" }, 400);
    }

    const expense: CampaignExpense = {
      id: uuidv4(),
      tenantId,
      electionId,
      category,
      description,
      amountKobo,
      currency: currency || "NGN",
      expenseDate: expenseDate || Date.now(),
      receipt,
      approvalStatus: "pending",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    await c.env.DB.prepare(
      `INSERT INTO civic_campaign_expenses (id, tenantId, electionId, category, description, amountKobo, currency, expenseDate, receipt, approvalStatus, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      expense.id,
      expense.tenantId,
      expense.electionId,
      expense.category,
      expense.description,
      expense.amountKobo,
      expense.currency,
      expense.expenseDate,
      expense.receipt,
      expense.approvalStatus,
      expense.createdAt,
      expense.updatedAt
    ).run();

    await publishEvent(c.env, CIVIC_EVENTS.EXPENSE_RECORDED, tenantId, electionId, { expenseId: expense.id, amountKobo });
    await logAuditEvent(c.env.DB, tenantId, electionId, "expense_recorded", undefined, { expenseId: expense.id, amountKobo });

    logger.info("Expense recorded", { tenantId, electionId, expenseId: expense.id, amountKobo });
    return c.json({ success: true, data: expense }, 201);
  } catch (error) {
    logger.error("Failed to record expense", { error: String(error) });
    return c.json({ success: false, error: "Failed to record expense" }, 500);
  }
});

/**
 * GET /api/elections/:electionId/expenses
 * List expenses
 */
app.get("/:electionId/expenses", async (c) => {
  try {
    const { electionId } = c.req.param();
    const tenantId = c.req.query("tenantId");
    if (!tenantId) {
      return c.json({ success: false, error: "tenantId required" }, 400);
    }

    const result = await c.env.DB.prepare(
      `SELECT * FROM civic_campaign_expenses WHERE electionId = ? AND tenantId = ? AND deletedAt IS NULL ORDER BY expenseDate DESC`
    ).bind(electionId, tenantId).all();

    return c.json({ success: true, data: result.results || [] });
  } catch (error) {
    logger.error("Failed to list expenses", { error: String(error) });
    return c.json({ success: false, error: "Failed to list expenses" }, 500);
  }
});

/**
 * GET /api/elections/:electionId/expenses/summary
 * Expense summary
 */
app.get("/:electionId/expenses/summary", async (c) => {
  try {
    const { electionId } = c.req.param();
    const tenantId = c.req.query("tenantId");
    if (!tenantId) {
      return c.json({ success: false, error: "tenantId required" }, 400);
    }

    const result = await c.env.DB.prepare(
      `SELECT 
        COUNT(*) as totalExpenses,
        SUM(amountKobo) as totalAmountKobo,
        SUM(CASE WHEN approvalStatus = 'approved' THEN amountKobo ELSE 0 END) as approvedAmountKobo,
        SUM(CASE WHEN approvalStatus = 'pending' THEN amountKobo ELSE 0 END) as pendingAmountKobo
       FROM civic_campaign_expenses WHERE electionId = ? AND tenantId = ? AND deletedAt IS NULL`
    ).bind(electionId, tenantId).first();

    return c.json({ success: true, data: result });
  } catch (error) {
    logger.error("Failed to get expense summary", { error: String(error) });
    return c.json({ success: false, error: "Failed to get expense summary" }, 500);
  }
});

/**
 * PATCH /api/elections/:electionId/expenses/:id/approve
 * Approve expense
 */
app.patch("/:electionId/expenses/:id/approve", requireAdmin, async (c) => {
  try {
    const { electionId, id } = c.req.param();
    const tenantId = c.req.query("tenantId");
    if (!tenantId) {
      return c.json({ success: false, error: "tenantId required" }, 400);
    }

    const { approvedBy } = await c.req.json();
    const updatedAt = Date.now();

    await c.env.DB.prepare(
      `UPDATE civic_campaign_expenses SET approvalStatus = 'approved', approvedBy = ?, updatedAt = ? 
       WHERE id = ? AND electionId = ? AND tenantId = ? AND deletedAt IS NULL`
    ).bind(approvedBy, updatedAt, id, electionId, tenantId).run();

    await publishEvent(c.env, CIVIC_EVENTS.EXPENSE_APPROVED, tenantId, electionId, { expenseId: id });
    await logAuditEvent(c.env.DB, tenantId, electionId, "expense_approved", approvedBy, { expenseId: id });

    logger.info("Expense approved", { tenantId, electionId, expenseId: id });
    return c.json({ success: true, data: { id, approvalStatus: "approved", updatedAt } });
  } catch (error) {
    logger.error("Failed to approve expense", { error: String(error) });
    return c.json({ success: false, error: "Failed to approve expense" }, 500);
  }
});

/**
 * GET /api/elections/:electionId/financial-report
 * INEC-compliant financial report
 */
app.get("/:electionId/financial-report", async (c) => {
  try {
    const { electionId } = c.req.param();
    const tenantId = c.req.query("tenantId");
    if (!tenantId) {
      return c.json({ success: false, error: "tenantId required" }, 400);
    }

    const donations = await c.env.DB.prepare(
      `SELECT SUM(amountKobo) as totalDonations FROM civic_campaign_donations WHERE electionId = ? AND tenantId = ? AND status = 'completed' AND deletedAt IS NULL`
    ).bind(electionId, tenantId).first();

    const expenses = await c.env.DB.prepare(
      `SELECT SUM(amountKobo) as totalExpenses FROM civic_campaign_expenses WHERE electionId = ? AND tenantId = ? AND approvalStatus = 'approved' AND deletedAt IS NULL`
    ).bind(electionId, tenantId).first();

    const totalDonations = donations?.totalDonations || 0;
    const totalExpenses = expenses?.totalExpenses || 0;
    const balance = totalDonations - totalExpenses;

    return c.json({ success: true, data: { totalDonations, totalExpenses, balance, reportDate: new Date().toISOString() } });
  } catch (error) {
    logger.error("Failed to generate financial report", { error: String(error) });
    return c.json({ success: false, error: "Failed to generate financial report" }, 500);
  }
});

// ─── GROUP 6: Campaign Materials (5 endpoints) ──────────────────────────────────

/**
 * POST /api/elections/:electionId/materials
 * Upload material
 */
app.post("/:electionId/materials", requireAdminOrManager, async (c) => {
  try {
    const { electionId } = c.req.param();
    const tenantId = c.req.query("tenantId");
    if (!tenantId) {
      return c.json({ success: false, error: "tenantId required" }, 400);
    }

    const { title, description, materialType, contentUrl, thumbnailUrl } = await c.req.json();
    if (!title || !materialType || !contentUrl) {
      return c.json({ success: false, error: "Missing required fields" }, 400);
    }

    const material: CampaignMaterial = {
      id: uuidv4(),
      tenantId,
      electionId,
      title,
      description,
      materialType,
      contentUrl,
      thumbnailUrl,
      status: "draft",
      viewCount: 0,
      shareCount: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    await c.env.DB.prepare(
      `INSERT INTO civic_campaign_materials (id, tenantId, electionId, title, description, materialType, contentUrl, thumbnailUrl, status, viewCount, shareCount, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      material.id,
      material.tenantId,
      material.electionId,
      material.title,
      material.description,
      material.materialType,
      material.contentUrl,
      material.thumbnailUrl,
      material.status,
      material.viewCount,
      material.shareCount,
      material.createdAt,
      material.updatedAt
    ).run();

    logger.info("Material uploaded", { tenantId, electionId, materialId: material.id, title });
    return c.json({ success: true, data: material }, 201);
  } catch (error) {
    logger.error("Failed to upload material", { error: String(error) });
    return c.json({ success: false, error: "Failed to upload material" }, 500);
  }
});

/**
 * GET /api/elections/:electionId/materials
 * List materials
 */
app.get("/:electionId/materials", async (c) => {
  try {
    const { electionId } = c.req.param();
    const tenantId = c.req.query("tenantId");
    if (!tenantId) {
      return c.json({ success: false, error: "tenantId required" }, 400);
    }

    const result = await c.env.DB.prepare(
      `SELECT * FROM civic_campaign_materials WHERE electionId = ? AND tenantId = ? AND deletedAt IS NULL ORDER BY createdAt DESC`
    ).bind(electionId, tenantId).all();

    return c.json({ success: true, data: result.results || [] });
  } catch (error) {
    logger.error("Failed to list materials", { error: String(error) });
    return c.json({ success: false, error: "Failed to list materials" }, 500);
  }
});

/**
 * PATCH /api/elections/:electionId/materials/:id
 * Update material
 */
app.patch("/:electionId/materials/:id", requireAdminOrManager, async (c) => {
  try {
    const { electionId, id } = c.req.param();
    const tenantId = c.req.query("tenantId");
    if (!tenantId) {
      return c.json({ success: false, error: "tenantId required" }, 400);
    }

    const updates = await c.req.json();
    const updatedAt = Date.now();

    await c.env.DB.prepare(
      `UPDATE civic_campaign_materials SET title = COALESCE(?, title), description = COALESCE(?, description), updatedAt = ? 
       WHERE id = ? AND electionId = ? AND tenantId = ? AND deletedAt IS NULL`
    ).bind(
      updates.title,
      updates.description,
      updatedAt,
      id,
      electionId,
      tenantId
    ).run();

    logger.info("Material updated", { tenantId, electionId, materialId: id });
    return c.json({ success: true, data: { id, ...updates, updatedAt } });
  } catch (error) {
    logger.error("Failed to update material", { error: String(error) });
    return c.json({ success: false, error: "Failed to update material" }, 500);
  }
});

/**
 * POST /api/elections/:electionId/materials/:id/publish
 * Publish material
 */
app.post("/:electionId/materials/:id/publish", requireAdminOrManager, async (c) => {
  try {
    const { electionId, id } = c.req.param();
    const tenantId = c.req.query("tenantId");
    if (!tenantId) {
      return c.json({ success: false, error: "tenantId required" }, 400);
    }

    const { approvedBy } = await c.req.json();
    const updatedAt = Date.now();

    await c.env.DB.prepare(
      `UPDATE civic_campaign_materials SET status = 'published', approvedBy = ?, publishedAt = ?, updatedAt = ? 
       WHERE id = ? AND electionId = ? AND tenantId = ? AND deletedAt IS NULL`
    ).bind(approvedBy, updatedAt, updatedAt, id, electionId, tenantId).run();

    await publishEvent(c.env, CIVIC_EVENTS.MATERIAL_PUBLISHED, tenantId, electionId, { materialId: id });
    await logAuditEvent(c.env.DB, tenantId, electionId, "material_published", approvedBy, { materialId: id });

    logger.info("Material published", { tenantId, electionId, materialId: id });
    return c.json({ success: true, data: { id, status: "published", updatedAt } });
  } catch (error) {
    logger.error("Failed to publish material", { error: String(error) });
    return c.json({ success: false, error: "Failed to publish material" }, 500);
  }
});

/**
 * DELETE /api/elections/:electionId/materials/:id
 * Archive material
 */
app.delete("/:electionId/materials/:id", requireAdminOrManager, async (c) => {
  try {
    const { electionId, id } = c.req.param();
    const tenantId = c.req.query("tenantId");
    if (!tenantId) {
      return c.json({ success: false, error: "tenantId required" }, 400);
    }

    const deletedAt = Date.now();
    await c.env.DB.prepare(
      `UPDATE civic_campaign_materials SET deletedAt = ? WHERE id = ? AND electionId = ? AND tenantId = ? AND deletedAt IS NULL`
    ).bind(deletedAt, id, electionId, tenantId).run();

    logger.info("Material archived", { tenantId, electionId, materialId: id });
    return c.json({ success: true, data: { id, deletedAt } });
  } catch (error) {
    logger.error("Failed to archive material", { error: String(error) });
    return c.json({ success: false, error: "Failed to archive material" }, 500);
  }
});

// ─── GROUP 7: Announcements (3 endpoints) ────────────────────────────────────────

/**
 * POST /api/elections/:electionId/announcements
 * Create announcement
 */
app.post("/:electionId/announcements", requireAdminOrManager, async (c) => {
  try {
    const { electionId } = c.req.param();
    const tenantId = c.req.query("tenantId");
    if (!tenantId) {
      return c.json({ success: false, error: "tenantId required" }, 400);
    }

    const { title, content, announcementType, priority, targetAudience } = await c.req.json();
    if (!title || !content || !announcementType) {
      return c.json({ success: false, error: "Missing required fields" }, 400);
    }

    const announcement: CampaignAnnouncement = {
      id: uuidv4(),
      tenantId,
      electionId,
      title,
      content,
      announcementType,
      priority: priority || "normal",
      targetAudience: targetAudience || "all",
      publishedAt: Date.now(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    await c.env.DB.prepare(
      `INSERT INTO civic_campaign_announcements (id, tenantId, electionId, title, content, announcementType, priority, targetAudience, publishedAt, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      announcement.id,
      announcement.tenantId,
      announcement.electionId,
      announcement.title,
      announcement.content,
      announcement.announcementType,
      announcement.priority,
      announcement.targetAudience,
      announcement.publishedAt,
      announcement.createdAt,
      announcement.updatedAt
    ).run();

    await publishEvent(c.env, CIVIC_EVENTS.ANNOUNCEMENT_POSTED, tenantId, electionId, { announcementId: announcement.id, title });
    await logAuditEvent(c.env.DB, tenantId, electionId, "announcement_posted", undefined, { announcementId: announcement.id, title });

    logger.info("Announcement posted", { tenantId, electionId, announcementId: announcement.id, title });
    return c.json({ success: true, data: announcement }, 201);
  } catch (error) {
    logger.error("Failed to create announcement", { error: String(error) });
    return c.json({ success: false, error: "Failed to create announcement" }, 500);
  }
});

/**
 * GET /api/elections/:electionId/announcements
 * List announcements
 */
app.get("/:electionId/announcements", async (c) => {
  try {
    const { electionId } = c.req.param();
    const tenantId = c.req.query("tenantId");
    if (!tenantId) {
      return c.json({ success: false, error: "tenantId required" }, 400);
    }

    const result = await c.env.DB.prepare(
      `SELECT * FROM civic_campaign_announcements WHERE electionId = ? AND tenantId = ? AND deletedAt IS NULL ORDER BY publishedAt DESC`
    ).bind(electionId, tenantId).all();

    return c.json({ success: true, data: result.results || [] });
  } catch (error) {
    logger.error("Failed to list announcements", { error: String(error) });
    return c.json({ success: false, error: "Failed to list announcements" }, 500);
  }
});

/**
 * DELETE /api/elections/:electionId/announcements/:id
 * Delete announcement
 */
app.delete("/:electionId/announcements/:id", requireAdminOrManager, async (c) => {
  try {
    const { electionId, id } = c.req.param();
    const tenantId = c.req.query("tenantId");
    if (!tenantId) {
      return c.json({ success: false, error: "tenantId required" }, 400);
    }

    const deletedAt = Date.now();
    await c.env.DB.prepare(
      `UPDATE civic_campaign_announcements SET deletedAt = ? WHERE id = ? AND electionId = ? AND tenantId = ? AND deletedAt IS NULL`
    ).bind(deletedAt, id, electionId, tenantId).run();

    logger.info("Announcement deleted", { tenantId, electionId, announcementId: id });
    return c.json({ success: true, data: { id, deletedAt } });
  } catch (error) {
    logger.error("Failed to delete announcement", { error: String(error) });
    return c.json({ success: false, error: "Failed to delete announcement" }, 500);
  }
});

// ─── GROUP 8: Sync & Health (2 endpoints) ────────────────────────────────────────

/**
 * POST /api/elections/sync/pull
 * Pull election data for offline
 */
app.post("/sync/pull", async (c) => {
  try {
    const tenantId = c.req.query("tenantId");
    if (!tenantId) {
      return c.json({ success: false, error: "tenantId required" }, 400);
    }

    const { electionId, lastSyncAt } = await c.req.json();

    const elections = await c.env.DB.prepare(
      `SELECT * FROM civic_elections WHERE tenantId = ? AND deletedAt IS NULL`
    ).bind(tenantId).all();

    const candidates = await c.env.DB.prepare(
      `SELECT * FROM civic_candidates WHERE tenantId = ? AND deletedAt IS NULL`
    ).bind(tenantId).all();

    const votingStations = await c.env.DB.prepare(
      `SELECT * FROM civic_voting_stations WHERE tenantId = ? AND deletedAt IS NULL`
    ).bind(tenantId).all();

    return c.json({
      success: true,
      data: {
        elections: elections.results || [],
        candidates: candidates.results || [],
        votingStations: votingStations.results || [],
        syncedAt: Date.now(),
      },
    });
  } catch (error) {
    logger.error("Failed to pull sync data", { error: String(error) });
    return c.json({ success: false, error: "Failed to pull sync data" }, 500);
  }
});

// ─── T006: EL02 — Multi-Level Result Collation ────────────────────────────────

app.post("/api/elections/results/collate", electionAuthMiddleware, requireAdminOrManager, async (c) => {
  try {
    const env = c.env as ElectionsEnv;
    const jwtPayload = (c as unknown as { get: (k: string) => { tenantId: string; sub: string } }).get("electionJwt");
    const tenantId: string = jwtPayload?.tenantId ?? "";
    const actorId: string = jwtPayload?.sub ?? "";

    const body = await c.req.json<Partial<ElectionResultCollation>>();
    if (!body.electionId) return c.json({ success: false, error: "electionId is required" }, 400);
    if (!body.candidateId) return c.json({ success: false, error: "candidateId is required" }, 400);
    if (!body.level) return c.json({ success: false, error: "level is required" }, 400);

    const now = Date.now();
    const row: ElectionResultCollation = {
      id: uuidv4(),
      tenantId,
      electionId: body.electionId,
      candidateId: body.candidateId,
      level: body.level as CollationLevel,
      pollingUnit: body.pollingUnit,
      ward: body.ward,
      lga: body.lga,
      state: body.state,
      votesCount: body.votesCount ?? 0,
      spoiltVotes: body.spoiltVotes,
      accreditedVoters: body.accreditedVoters,
      collatedBy: actorId,
      collatedAt: now,
      status: "draft",
      createdAt: now,
      updatedAt: now,
    };
    await createResultCollation(env.DB, row);
    return c.json({ success: true, data: row });
  } catch (err) {
    logger.error("Failed to collate result", { error: String(err) });
    return c.json({ success: false, error: "Internal server error" }, 500);
  }
});

app.get("/api/elections/:id/results/collation", electionAuthMiddleware, async (c) => {
  try {
    const env = c.env as ElectionsEnv;
    const jwtPayload = (c as unknown as { get: (k: string) => { tenantId: string } }).get("electionJwt");
    const tenantId: string = jwtPayload?.tenantId ?? "";
    const electionId = c.req.param("id");
    const level = new URL(c.req.url).searchParams.get("level") as CollationLevel | undefined;
    const collations = await getElectionCollations(env.DB, electionId, tenantId, level);

    // Aggregate totals per candidate
    const byCandidate: Record<string, number> = {};
    for (const col of collations) {
      byCandidate[col.candidateId] = (byCandidate[col.candidateId] ?? 0) + col.votesCount;
    }
    const grandTotal = Object.values(byCandidate).reduce((s, v) => s + v, 0);
    const aggregate = Object.entries(byCandidate).map(([candidateId, votes]) => ({
      candidateId,
      votes,
      percentage: grandTotal > 0 ? Math.round((votes / grandTotal) * 10000) / 100 : 0,
    })).sort((a, b) => b.votes - a.votes);

    return c.json({ success: true, data: { collations, aggregate } });
  } catch (err) {
    logger.error("Failed to get collation", { error: String(err) });
    return c.json({ success: false, error: "Internal server error" }, 500);
  }
});

app.patch("/api/elections/results/:id/certify", electionAuthMiddleware, requireAdmin, async (c) => {
  try {
    const env = c.env as ElectionsEnv;
    const jwtPayload = (c as unknown as { get: (k: string) => { tenantId: string; sub: string } }).get("electionJwt");
    const tenantId: string = jwtPayload?.tenantId ?? "";
    const actorId: string = jwtPayload?.sub ?? "";

    const certified = await certifyCollation(env.DB, c.req.param("id"), tenantId, actorId);
    if (!certified) return c.json({ success: false, error: "Collation not found" }, 404);
    return c.json({ success: true, data: certified });
  } catch (err) {
    logger.error("Failed to certify collation", { error: String(err) });
    return c.json({ success: false, error: "Internal server error" }, 500);
  }
});

// ─── T007: EL03 — Public Result Portal (IReV-style, no auth required) ────────

app.get("/api/public/elections/:id/results", async (c) => {
  try {
    const env = c.env as ElectionsEnv;
    const electionId = c.req.param("id");
    const results = await getPublicElectionResults(env.DB, electionId);
    return c.json({ success: true, data: { electionId, results, publishedAt: new Date().toISOString() } });
  } catch (err) {
    logger.error("Public results failed", { error: String(err) });
    return c.json({ success: false, error: "Internal server error" }, 500);
  }
});

app.get("/api/public/elections/:id/results/breakdown", async (c) => {
  try {
    const env = c.env as ElectionsEnv;
    const electionId = c.req.param("id");
    const level = new URL(c.req.url).searchParams.get("level") as CollationLevel | undefined;

    // Get certified collations (public — no tenant filter)
    const collations = await getPublicCollationBreakdown(env.DB, electionId, level);

    const byCandidate: Record<string, { [loc: string]: number }> = {};
    for (const col of collations) {
      if (!byCandidate[col.candidateId]) byCandidate[col.candidateId] = {};
      const location = col.ward ?? col.lga ?? col.state ?? col.pollingUnit ?? "national";
      byCandidate[col.candidateId][location] = (byCandidate[col.candidateId][location] ?? 0) + col.votesCount;
    }

    return c.json({ success: true, data: { electionId, level: level ?? "all", breakdown: byCandidate } });
  } catch (err) {
    logger.error("Public breakdown failed", { error: String(err) });
    return c.json({ success: false, error: "Internal server error" }, 500);
  }
});

// ─── T009: EL12 — Election Post-Analytics ────────────────────────────────────

app.get("/api/elections/:id/analytics", electionAuthMiddleware, async (c) => {
  try {
    const env = c.env as ElectionsEnv;
    const db = env.DB;
    const electionId = c.req.param("id");
    const jwtPayload = (c as unknown as { get: (k: string) => { tenantId: string } }).get("electionJwt");
    const tenantId: string = jwtPayload?.tenantId ?? "";

    const [electionRow, candidateRows, voteCountRow, stationRows] = await Promise.all([
      db.prepare(`SELECT id, name, status, votingStartAt, votingEndAt FROM civic_elections WHERE id = ? AND tenantId = ? AND deletedAt IS NULL`)
        .bind(electionId, tenantId).first<{ id: string; name: string; status: string; votingStartAt: number; votingEndAt: number }>(),
      db.prepare(`SELECT id, name, voteCount FROM civic_candidates WHERE electionId = ? AND tenantId = ? AND status = 'approved' AND deletedAt IS NULL ORDER BY voteCount DESC`)
        .bind(electionId, tenantId).all<{ id: string; name: string; voteCount: number }>(),
      db.prepare(`SELECT COUNT(DISTINCT voterId) as cast FROM civic_votes WHERE electionId = ? AND tenantId = ? AND deletedAt IS NULL`)
        .bind(electionId, tenantId).first<{ cast: number }>(),
      db.prepare(`SELECT id, name, capacity, votesCount FROM civic_voting_stations WHERE electionId = ? AND tenantId = ? AND deletedAt IS NULL ORDER BY votesCount DESC`)
        .bind(electionId, tenantId).all<{ id: string; name: string; capacity: number; votesCount: number }>(),
    ]);

    if (!electionRow) return c.json({ success: false, error: "Election not found" }, 404);

    const candidates = candidateRows.results ?? [];
    const stations = stationRows.results ?? [];
    const totalVotesCast = voteCountRow?.cast ?? 0;
    const eligibleVoters = stations.reduce((sum, s) => sum + (s.capacity ?? 0), 0);
    const turnoutPercent = eligibleVoters > 0 ? Math.round((totalVotesCast / eligibleVoters) * 10000) / 100 : 0;

    const totalVotes = candidates.reduce((s, c) => s + (c.voteCount ?? 0), 0);
    const results = candidates.map((c, idx) => ({
      candidateId: c.id,
      name: c.name,
      voteCount: c.voteCount ?? 0,
      votePercent: totalVotes > 0 ? Math.round(((c.voteCount ?? 0) / totalVotes) * 10000) / 100 : 0,
      rank: idx + 1,
    }));

    const winner = results[0] ?? null;
    const runnerUp = results[1] ?? null;
    const winMargin = winner && runnerUp ? {
      winnerId: winner.candidateId,
      runnerUpId: runnerUp.candidateId,
      marginVotes: winner.voteCount - runnerUp.voteCount,
      marginPercent: Math.round((winner.votePercent - runnerUp.votePercent) * 100) / 100,
    } : null;

    const geographic = stations.map((s) => ({
      stationId: s.id,
      stationName: s.name,
      votesCast: s.votesCount ?? 0,
    }));

    return c.json({ success: true, data: {
      electionId,
      title: electionRow.name,
      status: electionRow.status,
      turnout: { eligibleVoters, votesCast: totalVotesCast, turnoutPercent },
      results,
      winMargin,
      geographic,
    }});
  } catch (err) {
    logger.error("Election analytics failed", { error: String(err) });
    return c.json({ success: false, error: "Internal server error" }, 500);
  }
});

// ─── T009: CE10 — Public Election Comparison (no auth) ───────────────────────

app.get("/api/public/elections/compare", async (c) => {
  try {
    const env = c.env as ElectionsEnv;
    const db = env.DB;
    const idsParam = new URL(c.req.url).searchParams.get("ids") ?? "";
    const ids = idsParam.split(",").map((s) => s.trim()).filter(Boolean).slice(0, 2);

    if (ids.length < 2) {
      return c.json({ success: false, error: "Provide exactly 2 election IDs via ?ids=id1,id2" }, 400);
    }

    const [electionRows, candidateA, candidateB] = await Promise.all([
      Promise.all(ids.map((id) =>
        db.prepare(`SELECT id, name, votingStartAt FROM civic_elections WHERE id = ? AND deletedAt IS NULL`)
          .bind(id).first<{ id: string; name: string; votingStartAt: number }>()
      )),
      db.prepare(`SELECT id, name, voteCount FROM civic_candidates WHERE electionId = ? AND status = 'approved' AND deletedAt IS NULL ORDER BY voteCount DESC`)
        .bind(ids[0]).all<{ id: string; name: string; voteCount: number }>(),
      db.prepare(`SELECT id, name, voteCount FROM civic_candidates WHERE electionId = ? AND status = 'approved' AND deletedAt IS NULL ORDER BY voteCount DESC`)
        .bind(ids[1]).all<{ id: string; name: string; voteCount: number }>(),
    ]);

    const [eA, eB] = electionRows;
    if (!eA || !eB) return c.json({ success: false, error: "One or both elections not found" }, 404);

    const candA = candidateA.results ?? [];
    const candB = candidateB.results ?? [];

    // Build candidate comparison — match by name
    const nameSet = new Set([...candA.map((c) => c.name), ...candB.map((c) => c.name)]);
    const totalA = candA.reduce((s, c) => s + (c.voteCount ?? 0), 0);
    const totalB = candB.reduce((s, c) => s + (c.voteCount ?? 0), 0);

    const candidateComparison = Array.from(nameSet).map((name) => {
      const a = candA.find((c) => c.name === name);
      const b = candB.find((c) => c.name === name);
      const pctA = totalA > 0 && a ? ((a.voteCount ?? 0) / totalA) * 100 : 0;
      const pctB = totalB > 0 && b ? ((b.voteCount ?? 0) / totalB) * 100 : 0;
      return {
        name,
        votes: { [ids[0]]: a?.voteCount ?? 0, [ids[1]]: b?.voteCount ?? 0 },
        pct: { [ids[0]]: Math.round(pctA * 100) / 100, [ids[1]]: Math.round(pctB * 100) / 100 },
        swingPercent: Math.round((pctB - pctA) * 100) / 100,
      };
    });

    return c.json({ success: true, data: {
      elections: [
        { id: eA.id, title: eA.name, date: eA.votingStartAt },
        { id: eB.id, title: eB.name, date: eB.votingStartAt },
      ],
      candidateComparison,
      totalVotes: { [ids[0]]: totalA, [ids[1]]: totalB },
    }});
  } catch (err) {
    logger.error("Election comparison failed", { error: String(err) });
    return c.json({ success: false, error: "Internal server error" }, 500);
  }
});

/**
 * GET /api/elections/health
 * Health check
 */
app.get("/health", async (c) => {
  try {
    const result = await c.env.DB.prepare("SELECT 1").first();
    return c.json({
      success: true,
      status: "ok",
      timestamp: new Date().toISOString(),
      database: result ? "connected" : "disconnected",
    });
  } catch (error) {
    logger.error("Health check failed", { error: String(error) });
    return c.json({ success: false, status: "error", error: String(error) }, 500);
  }
});

export default app;
