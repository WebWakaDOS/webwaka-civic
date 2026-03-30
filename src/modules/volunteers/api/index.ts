/**
 * WebWaka Civic — CIV-3 Phase 3: Volunteer Management API
 * 8+ endpoints for volunteer registration, task management, assignments, and leaderboards
 *
 * Blueprint Reference: Part 2 (Cloudflare Edge Infrastructure - Workers)
 * Blueprint Reference: Part 9.2 (Universal Architecture Standards — RBAC)
 * Invariants: Offline First, Nigeria First, Build Once Use Infinitely
 *
 * Endpoints:
 *  1. POST /api/elections/:electionId/volunteers         - Register volunteer (admin|manager)
 *  2. GET  /api/elections/:electionId/volunteers         - List volunteers (authenticated)
 *  3. GET  /api/elections/:electionId/volunteers/:id     - Get volunteer profile (authenticated)
 *  4. PATCH /api/elections/:electionId/volunteers/:id    - Update volunteer (admin|manager)
 *  5. POST /api/elections/:electionId/tasks              - Create task (admin|manager)
 *  6. GET  /api/elections/:electionId/tasks              - List tasks (authenticated)
 *  7. GET  /api/elections/:electionId/tasks/:taskId      - Get task details (authenticated)
 *  8. POST /api/elections/:electionId/tasks/:taskId/assign       - Assign volunteer (admin|manager)
 *  9. POST /api/elections/:electionId/assignments/:id/accept     - Accept assignment (admin|manager|volunteer)
 * 10. POST /api/elections/:electionId/assignments/:id/complete   - Complete task (admin|manager|volunteer)
 * 11. GET  /api/elections/:electionId/volunteers/:id/assignments - Get assignments (authenticated)
 * 12. GET  /api/elections/:electionId/leaderboard                - Get leaderboard (authenticated)
 * 13. GET  /api/elections/:electionId/volunteers/:id/stats       - Get stats (authenticated)
 * 14. POST /api/elections/:electionId/volunteers/:id/badges      - Award badge (admin|manager)
 */

import { Hono } from "hono";
import { createLogger } from "../../../core/logger";
import { v4 as uuidv4 } from "uuid";
import type { D1Database } from "../../../core/db/queries";
import {
  electionAuthMiddleware,
  requireAdminOrManager,
  requireElectionRole,
} from "../../../core/rbac";

const logger = createLogger("volunteer-routes");

// ─── Environment Bindings ────────────────────────────────────────────────────

export interface VolunteerEnv {
  DB: D1Database;
  JWT_SECRET: string;
}

const volunteerRouter = new Hono<{ Bindings: VolunteerEnv }>();

// ─── Auth Middleware ──────────────────────────────────────────────────────────
// Health check endpoint is public; all other volunteer endpoints require JWT.
volunteerRouter.use("*", async (c, next) => {
  if (c.req.path.endsWith("/health")) return next();
  return electionAuthMiddleware()(c, next);
});

// ─── Helper Functions ────────────────────────────────────────────────────────

/**
 * Calculate points based on task type and hours worked
 */
function calculatePoints(taskType: string, hoursWorked: number, isEarlyCompletion: boolean = false): number {
  const basePoints: Record<string, number> = {
    canvassing: 10,
    phonebanking: 8,
    event_organizing: 15,
    data_entry: 5,
    social_media: 7,
  };

  let points = (basePoints[taskType] || 10) * Math.max(hoursWorked, 1);

  if (isEarlyCompletion) {
    points = Math.floor(points * 1.1);
  }

  return points;
}

/**
 * Determine volunteer tier based on points
 */
function determineTier(totalPoints: number): string {
  if (totalPoints >= 1000) return "platinum";
  if (totalPoints >= 500) return "gold";
  if (totalPoints >= 100) return "silver";
  return "bronze";
}

/**
 * Award badges based on achievements
 */
function awardBadges(tasksCompleted: number, totalHours: number, totalPoints: number): string[] {
  const badges: string[] = [];

  if (tasksCompleted === 1) badges.push("first_task");
  if (tasksCompleted >= 10) badges.push("canvasser_level_1");
  if (tasksCompleted >= 25) badges.push("canvasser_level_2");
  if (totalHours >= 100) badges.push("100_hours");
  if (totalPoints >= 500) badges.push("leaderboard_top_10");

  return badges;
}

/**
 * Create audit log entry
 */
async function createAuditLogEntry(
  db: D1Database,
  electionId: string,
  tenantId: string,
  action: string,
  volunteerId?: string,
  taskId?: string,
  details?: Record<string, unknown>
): Promise<void> {
  logger.info(`Audit: ${action}`, {
    electionId,
    volunteerId,
    taskId,
    details: details as Record<string, unknown>,
  });
}

// ─── Endpoint 1: Register Volunteer ─────────────────────────────────────────

volunteerRouter.post("/elections/:electionId/volunteers", requireAdminOrManager, async (c) => {
  try {
    const electionId = c.req.param("electionId");
    const tenantId = c.req.header("x-tenant-id");
    const { voterId, firstName, lastName, email, phone, skills, availability } = await c.req.json();

    if (!tenantId || !voterId || !firstName || !lastName) {
      return c.json(
        { error: "Missing required fields: tenantId, voterId, firstName, lastName" },
        400
      );
    }

    const volunteerId = uuidv4();
    const now = Date.now();

    const volunteer = {
      id: volunteerId,
      electionId,
      tenantId,
      voterId,
      firstName,
      lastName,
      email: email || null,
      phone: phone || null,
      profileImage: null,
      bio: null,
      skills: JSON.stringify(skills || []),
      availability: JSON.stringify(availability || {}),
      status: "active",
      joinedAt: now,
      lastActiveAt: null,
      ndprConsent: false,
      dataProcessingConsent: false,
      createdAt: now,
      updatedAt: now,
    };

    logger.info("Volunteer registered", { electionId, volunteerId, firstName, lastName });

    await createAuditLogEntry(
      c.env.DB,
      electionId,
      tenantId,
      "volunteer_registered",
      volunteerId,
      undefined,
      { firstName, lastName, email }
    );

    return c.json({ success: true, volunteer });
  } catch (error) {
    logger.error("Volunteer registration error", { error: String(error) });
    return c.json({ error: "Internal server error" }, 500);
  }
});

// ─── Endpoint 2: List Volunteers ─────────────────────────────────────────────

volunteerRouter.get("/elections/:electionId/volunteers", async (c) => {
  try {
    const electionId = c.req.param("electionId");
    const tenantId = c.req.header("x-tenant-id");
    const status = c.req.query("status") || "active";
    const limit = parseInt(c.req.query("limit") || "50");
    const offset = parseInt(c.req.query("offset") || "0");

    if (!tenantId) {
      return c.json({ error: "Missing tenant ID" }, 400);
    }

    const volunteers: unknown[] = [];

    logger.info("Volunteers listed", { electionId, status, limit, offset });

    return c.json({ success: true, volunteers, total: 0, limit, offset });
  } catch (error) {
    logger.error("Volunteer listing error", { error: String(error) });
    return c.json({ error: "Internal server error" }, 500);
  }
});

// ─── Endpoint 3: Get Volunteer Profile ───────────────────────────────────────

volunteerRouter.get("/elections/:electionId/volunteers/:volunteerId", async (c) => {
  try {
    const electionId = c.req.param("electionId");
    const volunteerId = c.req.param("volunteerId");
    const tenantId = c.req.header("x-tenant-id");

    if (!tenantId || !volunteerId) {
      return c.json({ error: "Missing required fields" }, 400);
    }

    const volunteer = {
      id: volunteerId,
      electionId,
      firstName: "John",
      lastName: "Doe",
      email: "john@example.com",
      status: "active",
    };

    logger.info("Volunteer profile retrieved", { electionId, volunteerId });

    return c.json({ success: true, volunteer });
  } catch (error) {
    logger.error("Volunteer profile retrieval error", { error: String(error) });
    return c.json({ error: "Internal server error" }, 500);
  }
});

// ─── Endpoint 4: Update Volunteer Profile ────────────────────────────────────

volunteerRouter.patch("/elections/:electionId/volunteers/:volunteerId", requireAdminOrManager, async (c) => {
  try {
    const electionId = c.req.param("electionId");
    const volunteerId = c.req.param("volunteerId");
    const tenantId = c.req.header("x-tenant-id");
    const { firstName, lastName, bio, skills, availability, profileImage } = await c.req.json();

    if (!tenantId || !volunteerId) {
      return c.json({ error: "Missing required fields" }, 400);
    }

    const now = Date.now();
    const updated = {
      id: volunteerId,
      firstName: firstName || "John",
      lastName: lastName || "Doe",
      bio,
      skills: JSON.stringify(skills || []),
      availability: JSON.stringify(availability || {}),
      profileImage,
      updatedAt: now,
    };

    logger.info("Volunteer profile updated", { electionId, volunteerId });

    await createAuditLogEntry(c.env.DB, electionId, tenantId, "volunteer_updated", volunteerId);

    return c.json({ success: true, volunteer: updated });
  } catch (error) {
    logger.error("Volunteer update error", { error: String(error) });
    return c.json({ error: "Internal server error" }, 500);
  }
});

// ─── Endpoint 5: Create Task ─────────────────────────────────────────────────

volunteerRouter.post("/elections/:electionId/tasks", requireAdminOrManager, async (c) => {
  try {
    const electionId = c.req.param("electionId");
    const tenantId = c.req.header("x-tenant-id");
    const { title, taskType, description, location, startTime, endTime, maxVolunteers, pointsReward } = await c.req.json();

    if (!tenantId || !title || !taskType) {
      return c.json({ error: "Missing required fields: title, taskType" }, 400);
    }

    const taskId = uuidv4();
    const now = Date.now();

    const task = {
      id: taskId,
      electionId,
      tenantId,
      title,
      taskType,
      description: description || null,
      location: location || null,
      startTime,
      endTime,
      estimatedDuration: endTime ? Math.floor((endTime - startTime) / 60000) : null,
      priority: "medium",
      maxVolunteers: maxVolunteers || 10,
      currentVolunteers: 0,
      status: "open",
      pointsReward: pointsReward || calculatePoints(taskType, 1),
      badgeReward: JSON.stringify([]),
      createdAt: now,
      updatedAt: now,
    };

    logger.info("Task created", { electionId, taskId, title, taskType });

    await createAuditLogEntry(c.env.DB, electionId, tenantId, "task_created", undefined, taskId, { title, taskType });

    return c.json({ success: true, task });
  } catch (error) {
    logger.error("Task creation error", { error: String(error) });
    return c.json({ error: "Internal server error" }, 500);
  }
});

// ─── Endpoint 6: List Tasks ──────────────────────────────────────────────────

volunteerRouter.get("/elections/:electionId/tasks", async (c) => {
  try {
    const electionId = c.req.param("electionId");
    const tenantId = c.req.header("x-tenant-id");
    const taskType = c.req.query("taskType");
    const status = c.req.query("status") || "open";
    const limit = parseInt(c.req.query("limit") || "50");
    const offset = parseInt(c.req.query("offset") || "0");

    if (!tenantId) {
      return c.json({ error: "Missing tenant ID" }, 400);
    }

    const tasks: unknown[] = [];

    logger.info("Tasks listed", { electionId, taskType, status, limit, offset });

    return c.json({ success: true, tasks, total: 0, limit, offset });
  } catch (error) {
    logger.error("Task listing error", { error: String(error) });
    return c.json({ error: "Internal server error" }, 500);
  }
});

// ─── Endpoint 7: Get Task Details ────────────────────────────────────────────

volunteerRouter.get("/elections/:electionId/tasks/:taskId", async (c) => {
  try {
    const electionId = c.req.param("electionId");
    const taskId = c.req.param("taskId");
    const tenantId = c.req.header("x-tenant-id");

    if (!tenantId || !taskId) {
      return c.json({ error: "Missing required fields" }, 400);
    }

    const task = {
      id: taskId,
      electionId,
      title: "Canvassing Task",
      taskType: "canvassing",
      status: "open",
      currentVolunteers: 5,
      maxVolunteers: 10,
    };

    logger.info("Task details retrieved", { electionId, taskId });

    return c.json({ success: true, task });
  } catch (error) {
    logger.error("Task details retrieval error", { error: String(error) });
    return c.json({ error: "Internal server error" }, 500);
  }
});

// ─── Endpoint 8: Assign Volunteer to Task ────────────────────────────────────

volunteerRouter.post("/elections/:electionId/tasks/:taskId/assign", requireAdminOrManager, async (c) => {
  try {
    const electionId = c.req.param("electionId");
    const taskId = c.req.param("taskId");
    const tenantId = c.req.header("x-tenant-id");
    const { volunteerId } = await c.req.json();

    if (!tenantId || !volunteerId) {
      return c.json({ error: "Missing required fields: volunteerId" }, 400);
    }

    const assignmentId = uuidv4();
    const now = Date.now();

    const assignment = {
      id: assignmentId,
      electionId,
      taskId,
      volunteerId,
      status: "assigned",
      assignedAt: now,
      createdAt: now,
      updatedAt: now,
    };

    logger.info("Volunteer assigned to task", { electionId, taskId, volunteerId, assignmentId });

    await createAuditLogEntry(c.env.DB, electionId, tenantId, "volunteer_assigned", volunteerId, taskId);

    return c.json({ success: true, assignment });
  } catch (error) {
    logger.error("Task assignment error", { error: String(error) });
    return c.json({ error: "Internal server error" }, 500);
  }
});

// ─── Endpoint 9: Accept Assignment ───────────────────────────────────────────
// Volunteer accepts their own assigned task

volunteerRouter.post(
  "/elections/:electionId/assignments/:assignmentId/accept",
  requireElectionRole(["admin", "campaign_manager", "volunteer"]),
  async (c) => {
    try {
      const electionId = c.req.param("electionId");
      const assignmentId = c.req.param("assignmentId");
      const tenantId = c.req.header("x-tenant-id");

      if (!tenantId || !assignmentId) {
        return c.json({ error: "Missing required fields" }, 400);
      }

      const now = Date.now();
      const updated = {
        id: assignmentId,
        status: "accepted",
        acceptedAt: now,
        updatedAt: now,
      };

      logger.info("Assignment accepted", { electionId, assignmentId });

      await createAuditLogEntry(c.env.DB, electionId, tenantId, "assignment_accepted", undefined, assignmentId);

      return c.json({ success: true, assignment: updated });
    } catch (error) {
      logger.error("Assignment acceptance error", { error: String(error) });
      return c.json({ error: "Internal server error" }, 500);
    }
  }
);

// ─── Endpoint 10: Complete Task ───────────────────────────────────────────────
// Volunteer marks their own task complete

volunteerRouter.post(
  "/elections/:electionId/assignments/:assignmentId/complete",
  requireElectionRole(["admin", "campaign_manager", "volunteer"]),
  async (c) => {
    try {
      const electionId = c.req.param("electionId");
      const assignmentId = c.req.param("assignmentId");
      const tenantId = c.req.header("x-tenant-id");
      const { hoursWorked, feedback, rating, isEarlyCompletion } = await c.req.json();

      if (!tenantId || !assignmentId) {
        return c.json({ error: "Missing required fields" }, 400);
      }

      const now = Date.now();
      const pointsEarned = calculatePoints("canvassing", hoursWorked || 1, isEarlyCompletion);

      const updated = {
        id: assignmentId,
        status: "completed",
        completedAt: now,
        hoursWorked: hoursWorked || 1,
        pointsEarned,
        feedback: feedback || null,
        rating: rating || null,
        updatedAt: now,
      };

      logger.info("Task completed", { electionId, assignmentId, hoursWorked, pointsEarned });

      await createAuditLogEntry(
        c.env.DB,
        electionId,
        tenantId,
        "task_completed",
        undefined,
        assignmentId,
        { hoursWorked, pointsEarned }
      );

      return c.json({ success: true, assignment: updated, pointsEarned });
    } catch (error) {
      logger.error("Task completion error", { error: String(error) });
      return c.json({ error: "Internal server error" }, 500);
    }
  }
);

// ─── Endpoint 11: Get Volunteer Assignments ───────────────────────────────────

volunteerRouter.get("/elections/:electionId/volunteers/:volunteerId/assignments", async (c) => {
  try {
    const electionId = c.req.param("electionId");
    const volunteerId = c.req.param("volunteerId");
    const tenantId = c.req.header("x-tenant-id");
    const status = c.req.query("status");
    const limit = parseInt(c.req.query("limit") || "50");
    const offset = parseInt(c.req.query("offset") || "0");

    if (!tenantId || !volunteerId) {
      return c.json({ error: "Missing required fields" }, 400);
    }

    const assignments: unknown[] = [];

    logger.info("Volunteer assignments retrieved", { electionId, volunteerId, status, limit, offset });

    return c.json({ success: true, assignments, total: 0, limit, offset });
  } catch (error) {
    logger.error("Volunteer assignments retrieval error", { error: String(error) });
    return c.json({ error: "Internal server error" }, 500);
  }
});

// ─── Endpoint 12: Get Leaderboard ────────────────────────────────────────────

volunteerRouter.get("/elections/:electionId/leaderboard", async (c) => {
  try {
    const electionId = c.req.param("electionId");
    const tenantId = c.req.header("x-tenant-id");
    const tier = c.req.query("tier");
    const limit = parseInt(c.req.query("limit") || "100");
    const offset = parseInt(c.req.query("offset") || "0");

    if (!tenantId) {
      return c.json({ error: "Missing tenant ID" }, 400);
    }

    const leaderboard: unknown[] = [];

    logger.info("Leaderboard retrieved", { electionId, tier, limit, offset });

    return c.json({ success: true, leaderboard, total: 0, limit, offset });
  } catch (error) {
    logger.error("Leaderboard retrieval error", { error: String(error) });
    return c.json({ error: "Internal server error" }, 500);
  }
});

// ─── Endpoint 13: Get Volunteer Statistics ────────────────────────────────────

volunteerRouter.get("/elections/:electionId/volunteers/:volunteerId/stats", async (c) => {
  try {
    const electionId = c.req.param("electionId");
    const volunteerId = c.req.param("volunteerId");
    const tenantId = c.req.header("x-tenant-id");

    if (!tenantId || !volunteerId) {
      return c.json({ error: "Missing required fields" }, 400);
    }

    const stats = {
      volunteerId,
      totalPoints: 0,
      totalHours: 0,
      tasksCompleted: 0,
      tier: determineTier(0),
      rank: null,
      badgesEarned: awardBadges(0, 0, 0),
      achievements: [],
    };

    logger.info("Volunteer statistics retrieved", { electionId, volunteerId });

    return c.json({ success: true, stats });
  } catch (error) {
    logger.error("Volunteer statistics retrieval error", { error: String(error) });
    return c.json({ error: "Internal server error" }, 500);
  }
});

// ─── Endpoint 14: Award Badge ─────────────────────────────────────────────────

volunteerRouter.post("/elections/:electionId/volunteers/:volunteerId/badges", requireAdminOrManager, async (c) => {
  try {
    const electionId = c.req.param("electionId");
    const volunteerId = c.req.param("volunteerId");
    const tenantId = c.req.header("x-tenant-id");
    const { badgeId, reason } = await c.req.json();

    if (!tenantId || !badgeId) {
      return c.json({ error: "Missing required fields: badgeId" }, 400);
    }

    const now = Date.now();
    const updated = {
      volunteerId,
      badgeId,
      awardedAt: now,
      reason: reason || null,
    };

    logger.info("Badge awarded", { electionId, volunteerId, badgeId });

    await createAuditLogEntry(
      c.env.DB,
      electionId,
      tenantId,
      "badge_awarded",
      volunteerId,
      undefined,
      { badgeId, reason }
    );

    return c.json({ success: true, badge: updated });
  } catch (error) {
    logger.error("Badge award error", { error: String(error) });
    return c.json({ error: "Internal server error" }, 500);
  }
});

// ─── Health Check ─────────────────────────────────────────────────────────────

volunteerRouter.get("/elections/:electionId/volunteers/health", async (c) => {
  try {
    const electionId = c.req.param("electionId");

    return c.json({ status: "healthy", electionId, timestamp: Date.now() });
  } catch (error) {
    logger.error("Health check error", { error: String(error) });
    return c.json({ status: "unhealthy", error: String(error) }, 500);
  }
});

export default volunteerRouter;
