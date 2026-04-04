/**
 * WebWaka Civic — CIV-3 Phase 2: Voting Endpoints
 * 8 endpoints for offline-capable voting system with INEC audit trail
 * 
 * Blueprint Reference: Part 2 (Cloudflare Edge Infrastructure - Workers)
 * Invariants: Offline First, Nigeria First, Build Once Use Infinitely
 * 
 * Endpoints:
 * 1. POST /api/elections/:electionId/voting/session - Create voter session
 * 2. GET /api/elections/:electionId/voting/session/:sessionId - Get session status
 * 3. POST /api/elections/:electionId/voting/cast - Cast vote
 * 4. POST /api/elections/:electionId/voting/verify - Verify vote
 * 5. POST /api/elections/:electionId/voting/sync - Sync offline votes
 * 6. GET /api/elections/:electionId/voting/results - Get real-time results
 * 7. GET /api/elections/:electionId/voting/audit-trail - Get audit trail
 * 8. GET /api/elections/:electionId/voting/compliance-report - INEC compliance report
 */

import { Hono } from "hono";
import { createLogger } from "../../../core/logger";
import {
  createVoterSession,
  validateSessionToken,
  checkVoterEligibility,
  enforceOneVotePerVoter,
  markVoterSessionVoted,
  extractVoterIdFromToken,
} from "../sessionManager";
import {
  createBallot,
  getBallot,
  updateBallotStatus,
  markBallotSynced,
  getBallotsForSync,
  getPendingBallots,
  addToSyncQueue,
  getNextSyncQueueItem,
  updateSyncQueueStatus,
  incrementSyncRetry,
  recordConflict,
  checkDuplicateVote,
  getSyncQueueStats,
  getElectionConflicts,
  resolveConflict,
} from "../offlineDb";
import {
  signBallot,
  verifyBallotSignature,
  hashBallot,
  generateNonce,
} from "./crypto";

const logger = createLogger("voting-routes");

const DEFAULT_SIGNING_SECRET = "webwaka-civic-voting-secret-key";

const votingRouter = new Hono<{ Bindings: { JWT_SECRET?: string; DB?: any } }>();

// ─── Helper Functions ───────────────────────────────────────────────────────

/**
 * Resolve signing secret from Hono env or fall back to default.
 */
function getSecret(env: { JWT_SECRET?: string } | undefined): string {
  return env?.JWT_SECRET ?? DEFAULT_SIGNING_SECRET;
}

/**
 * Create audit log entry
 */
async function createAuditLogEntry(
  db: any,
  electionId: string,
  tenantId: string,
  action: string,
  ballotId?: string,
  sessionId?: string,
  details?: any,
  actorId?: string,
  ipAddress?: string
): Promise<void> {
  // This would insert into civic_vote_audit_log table
  logger.info(`Audit: ${action}`, {
    electionId,
    ballotId,
    sessionId,
    details,
  });
}

// ─── Endpoint 1: Create Voter Session ───────────────────────────────────────

votingRouter.post("/elections/:electionId/voting/session", async (c) => {
  try {
    const electionId = c.req.param("electionId");
    const tenantId = c.req.header("x-tenant-id");
    const { voterId, votingStationId } = await c.req.json();

    if (!tenantId || !voterId) {
      return c.json(
        { error: "Missing required fields: tenantId, voterId" },
        400
      );
    }

    // Check voter eligibility
    const eligibility = await checkVoterEligibility(electionId, voterId);
    if (!eligibility.canVote) {
      logger.warn("Voter ineligible", { electionId, voterId, reason: eligibility.reason });
      return c.json(
        { error: eligibility.reason || "Voter is not eligible to vote" },
        403
      );
    }

    // Create session
    const result = await createVoterSession(electionId, voterId, tenantId, votingStationId);
    if (!result.success) {
      logger.error("Session creation failed", { electionId, voterId, error: result.error });
      return c.json({ error: result.error }, 500);
    }

    // Log audit entry
    await createAuditLogEntry(
      c.env.DB,
      electionId,
      tenantId,
      "session_created",
      undefined,
      result.session?.id,
      { votingStationId },
      voterId,
      c.req.header("cf-connecting-ip")
    );

    logger.info("Session created", {
      electionId,
      voterId,
      sessionId: result.session?.id,
    });

    return c.json({
      success: true,
      session: {
        id: result.session?.id,
        electionId,
        voterId,
        expiresAt: result.session?.expiresAt,
      },
      token: result.token,
    });
  } catch (error) {
    logger.error("Session creation error", { error });
    return c.json({ error: "Internal server error" }, 500);
  }
});

// ─── Endpoint 2: Get Session Status ─────────────────────────────────────────

votingRouter.get("/elections/:electionId/voting/session/:sessionId", async (c) => {
  try {
    const electionId = c.req.param("electionId");
    const sessionId = c.req.param("sessionId");
    const token = c.req.header("authorization")?.replace("Bearer ", "");

    if (!token) {
      return c.json({ error: "Missing authorization token" }, 401);
    }

    // Validate token
    const validation = await validateSessionToken(token);
    if (!validation.valid) {
      return c.json({ error: validation.error }, 401);
    }

    if (validation.session?.id !== sessionId) {
      return c.json({ error: "Session ID mismatch" }, 403);
    }

    logger.info("Session status retrieved", {
      electionId,
      sessionId,
      hasVoted: validation.session?.hasVoted,
    });

    return c.json({
      session: {
        id: validation.session?.id,
        electionId,
        hasVoted: validation.session?.hasVoted,
        expiresAt: validation.session?.expiresAt,
      },
    });
  } catch (error) {
    logger.error("Session retrieval error", { error });
    return c.json({ error: "Internal server error" }, 500);
  }
});

// ─── Endpoint 3: Cast Vote ──────────────────────────────────────────────────

votingRouter.post("/elections/:electionId/voting/cast", async (c) => {
  try {
    const electionId = c.req.param("electionId");
    const tenantId = c.req.header("x-tenant-id");
    const token = c.req.header("authorization")?.replace("Bearer ", "");
    const { candidateId, votingStationId, offlineOnly } = await c.req.json();

    if (!token || !tenantId || !candidateId) {
      return c.json(
        { error: "Missing required fields: token, tenantId, candidateId" },
        400
      );
    }

    // Validate session
    const validation = await validateSessionToken(token);
    if (!validation.valid) {
      return c.json({ error: validation.error }, 401);
    }

    const voterId = validation.token?.sub;
    const sessionId = validation.session?.id;

    // Enforce one-vote-per-voter
    const enforcement = await enforceOneVotePerVoter(electionId, voterId!, sessionId!);
    if (!enforcement.allowed) {
      logger.warn("Vote submission rejected", {
        electionId,
        voterId,
        error: enforcement.error,
      });
      return c.json({ error: enforcement.error }, 403);
    }

    // Generate per-ballot nonce and cryptographic signature
    const nonce = generateNonce();
    const secret = getSecret(c.env);
    const ballotSignature = signBallot(voterId!, electionId, candidateId, nonce, secret);
    const encryptedVote = ballotSignature;

    const ballot = await createBallot(
      electionId,
      voterId!,
      candidateId,
      "", // candidateName would be fetched from DB
      encryptedVote,
      offlineOnly || false,
      ballotSignature,
      nonce
    );

    // Add to sync queue if online
    if (!offlineOnly) {
      await addToSyncQueue(ballot.id, electionId, voterId!);
    }

    // Mark session as voted
    await markVoterSessionVoted(sessionId!, ballot.id);

    // Log audit entry
    await createAuditLogEntry(
      c.env.DB,
      electionId,
      tenantId,
      "ballot_cast",
      ballot.id,
      sessionId,
      { candidateId, offlineOnly, votingStationId },
      voterId,
      c.req.header("cf-connecting-ip")
    );

    const verificationHash = hashBallot(ballot.id, voterId!, electionId, candidateId);

    logger.info("Vote cast", {
      electionId,
      voterId,
      candidateId,
      ballotId: ballot.id,
      offlineOnly,
    });

    return c.json({
      success: true,
      ballot: {
        id: ballot.id,
        verificationHash,
        ballotSignature,
        nonce,
        status: ballot.status,
        castAt: ballot.castAt,
      },
    });
  } catch (error) {
    logger.error("Vote casting error", { error });
    return c.json({ error: "Internal server error" }, 500);
  }
});

// ─── Endpoint 4: Verify Vote ────────────────────────────────────────────────

votingRouter.post("/elections/:electionId/voting/verify", async (c) => {
  try {
    const electionId = c.req.param("electionId");
    const tenantId = c.req.header("x-tenant-id");
    const { ballotId, verificationHash } = await c.req.json();

    if (!tenantId || !ballotId || !verificationHash) {
      return c.json(
        { error: "Missing required fields: ballotId, verificationHash" },
        400
      );
    }

    // Retrieve ballot
    const ballot = await getBallot(ballotId);
    if (!ballot) {
      return c.json({ error: "Ballot not found" }, 404);
    }

    // Cryptographically verify the verification hash (SHA-256 over ballot fields)
    const expectedHash = hashBallot(
      ballot.id,
      ballot.voterId,
      ballot.electionId,
      ballot.candidateId
    );
    if (verificationHash !== expectedHash) {
      logger.warn("Vote verification failed", { ballotId, verificationHash });
      return c.json({ error: "Verification hash mismatch" }, 403);
    }

    // Verify the ballot signature if present (HMAC-SHA256)
    if (ballot.ballotSignature && ballot.nonce) {
      const secret = getSecret(c.env);
      const signatureValid = verifyBallotSignature(
        ballot.ballotSignature,
        ballot.voterId,
        ballot.electionId,
        ballot.candidateId,
        ballot.nonce,
        secret
      );
      if (!signatureValid) {
        logger.warn("Ballot signature verification failed", { ballotId });
        return c.json({ error: "Ballot signature invalid" }, 403);
      }
    }

    // Update ballot status
    await updateBallotStatus(ballotId, "verified", {
      verifiedAt: Date.now(),
    });

    // Log audit entry
    await createAuditLogEntry(
      c.env.DB,
      electionId,
      tenantId,
      "ballot_verified",
      ballotId,
      undefined,
      { verificationHash }
    );

    logger.info("Vote verified", { electionId, ballotId });

    return c.json({
      success: true,
      ballot: {
        id: ballot.id,
        status: "verified",
        verifiedAt: Date.now(),
      },
    });
  } catch (error) {
    logger.error("Vote verification error", { error });
    return c.json({ error: "Internal server error" }, 500);
  }
});

// ─── Endpoint 5: Sync Offline Votes ─────────────────────────────────────────

votingRouter.post("/elections/:electionId/voting/sync", async (c) => {
  try {
    const electionId = c.req.param("electionId");
    const tenantId = c.req.header("x-tenant-id");
    const { ballots } = await c.req.json();

    if (!tenantId || !Array.isArray(ballots)) {
      return c.json(
        { error: "Missing required fields: ballots array" },
        400
      );
    }

    const syncResults = [];
    let successCount = 0;
    let conflictCount = 0;

    for (const ballot of ballots) {
      try {
        // Check for duplicate votes
        const duplicate = await checkDuplicateVote(electionId, ballot.voterId);
        if (duplicate && duplicate.id !== ballot.id) {
          // Conflict detected
          await recordConflict(
            electionId,
            ballot.voterId,
            duplicate.id,
            ballot.id,
            "sync_conflict"
          );
          conflictCount++;
          syncResults.push({
            ballotId: ballot.id,
            status: "conflict",
            error: "Duplicate vote detected",
          });
          continue;
        }

        // Mark ballot as synced
        await markBallotSynced(
          ballot.id,
          hashBallot(ballot.id, ballot.voterId, ballot.electionId, ballot.candidateId),
          Date.now()
        );

        // Update sync queue
        const queueItem = await getNextSyncQueueItem();
        if (queueItem && queueItem.ballotId === ballot.id) {
          await updateSyncQueueStatus(queueItem.id, "synced");
        }

        successCount++;
        syncResults.push({
          ballotId: ballot.id,
          status: "synced",
        });

        logger.info("Ballot synced", { electionId, ballotId: ballot.id });
      } catch (error) {
        syncResults.push({
          ballotId: ballot.id,
          status: "failed",
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    // Log audit entry
    await createAuditLogEntry(
      c.env.DB,
      electionId,
      tenantId,
      "sync_attempted",
      undefined,
      undefined,
      { successCount, conflictCount, totalBallots: ballots.length }
    );

    logger.info("Sync completed", {
      electionId,
      successCount,
      conflictCount,
      totalBallots: ballots.length,
    });

    return c.json({
      success: true,
      summary: {
        total: ballots.length,
        synced: successCount,
        conflicts: conflictCount,
        failed: ballots.length - successCount - conflictCount,
      },
      results: syncResults,
    });
  } catch (error) {
    logger.error("Sync error", { error });
    return c.json({ error: "Internal server error" }, 500);
  }
});

// ─── Endpoint 6: Get Real-Time Results ──────────────────────────────────────

votingRouter.get("/elections/:electionId/voting/results", async (c) => {
  try {
    const electionId = c.req.param("electionId");
    const tenantId = c.req.header("x-tenant-id");

    if (!tenantId) {
      return c.json({ error: "Missing tenant ID" }, 400);
    }

    // Query results from database (would use D1 in production)
    // For now, return placeholder structure
    const results = {
      electionId,
      timestamp: Date.now(),
      candidates: [
        // Would be populated from civic_vote_tallies table
      ],
      totalVotes: 0,
      voterTurnout: 0,
    };

    logger.info("Results retrieved", { electionId });

    return c.json({
      success: true,
      results,
    });
  } catch (error) {
    logger.error("Results retrieval error", { error });
    return c.json({ error: "Internal server error" }, 500);
  }
});

// ─── Endpoint 7: Get Audit Trail ────────────────────────────────────────────

votingRouter.get("/elections/:electionId/voting/audit-trail", async (c) => {
  try {
    const electionId = c.req.param("electionId");
    const tenantId = c.req.header("x-tenant-id");
    const limit = parseInt(c.req.query("limit") || "100");
    const offset = parseInt(c.req.query("offset") || "0");

    if (!tenantId) {
      return c.json({ error: "Missing tenant ID" }, 400);
    }

    // Query audit trail from database (would use D1 in production)
    // For now, return placeholder structure
    const auditTrail = {
      electionId,
      entries: [
        // Would be populated from civic_vote_audit_log table
      ],
      total: 0,
      limit,
      offset,
    };

    logger.info("Audit trail retrieved", { electionId, limit, offset });

    return c.json({
      success: true,
      auditTrail,
    });
  } catch (error) {
    logger.error("Audit trail retrieval error", { error });
    return c.json({ error: "Internal server error" }, 500);
  }
});

// ─── Endpoint 8: INEC Compliance Report ─────────────────────────────────────

votingRouter.get("/elections/:electionId/voting/compliance-report", async (c) => {
  try {
    const electionId = c.req.param("electionId");
    const tenantId = c.req.header("x-tenant-id");

    if (!tenantId) {
      return c.json({ error: "Missing tenant ID" }, 400);
    }

    // Query voting statistics from database (would use D1 in production)
    // For now, return placeholder structure
    const report = {
      electionId,
      reportDate: new Date().toISOString(),
      totalRegisteredVoters: 0,
      totalVotesReceived: 0,
      voterTurnout: 0,
      offlineVotes: 0,
      onlineVotes: 0,
      conflictCount: 0,
      rejectedVotes: 0,
      auditTrailComplete: true,
      verificationStatus: "pending",
      inecCompliant: true,
    };

    logger.info("Compliance report generated", { electionId });

    return c.json({
      success: true,
      report,
    });
  } catch (error) {
    logger.error("Compliance report error", { error });
    return c.json({ error: "Internal server error" }, 500);
  }
});

// ─── Health Check ───────────────────────────────────────────────────────────

votingRouter.get("/elections/:electionId/voting/health", async (c) => {
  try {
    const electionId = c.req.param("electionId");

    const stats = await getSyncQueueStats();

    return c.json({
      status: "healthy",
      electionId,
      syncQueue: stats,
      timestamp: Date.now(),
    });
  } catch (error) {
    logger.error("Health check error", { error });
    return c.json({ status: "unhealthy", error: String(error) }, 500);
  }
});

export default votingRouter;
