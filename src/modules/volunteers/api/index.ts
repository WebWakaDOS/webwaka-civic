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

// ─── Endpoint 1: Register Volunteer ─────────────────────────────────────────

volunteerRouter.post("/elections/:electionId/volunteers", requireAdminOrManager, async (c) => {
  try {
    const electionId = c.req.param("electionId");
    const tenantId = c.req.header("x-tenant-id");
    const { voterId, firstName, lastName, email, phone, skills, availability, state, lga, ward } = await c.req.json();

    if (!tenantId || !voterId || !firstName || !lastName) {
      return c.json(
        { error: "Missing required fields: tenantId, voterId, firstName, lastName" },
        400
      );
    }

    const volunteerId = uuidv4();
    const now = Date.now();
    const name = `${firstName} ${lastName}`;
    const skillsJson = JSON.stringify(skills || []);

    await c.env.DB
      .prepare(
        `INSERT INTO civic_volunteers (id, tenantId, electionId, userId, name, phone, email,
         state, lga, ward, status, skills, points, tasksCompleted, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, 0, 0, ?, ?)`
      )
      .bind(
        volunteerId, tenantId, electionId, voterId, name,
        phone ?? null, email ?? null, state ?? null, lga ?? null, ward ?? null,
        skillsJson, now, now
      )
      .run();

    logger.info("Volunteer registered", { electionId, volunteerId, name });

    return c.json({
      success: true,
      volunteer: {
        id: volunteerId,
        electionId,
        tenantId,
        userId: voterId,
        name,
        email: email ?? null,
        phone: phone ?? null,
        state: state ?? null,
        lga: lga ?? null,
        ward: ward ?? null,
        status: "active",
        skills: skillsJson,
        availability: JSON.stringify(availability || {}),
        points: 0,
        tasksCompleted: 0,
        createdAt: now,
        updatedAt: now,
      },
    });
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
    const limit = Math.min(parseInt(c.req.query("limit") || "50"), 200);
    const offset = parseInt(c.req.query("offset") || "0");

    if (!tenantId) {
      return c.json({ error: "Missing tenant ID" }, 400);
    }

    const [rows, countRow] = await Promise.all([
      c.env.DB
        .prepare(
          `SELECT * FROM civic_volunteers
           WHERE tenantId = ? AND electionId = ? AND status = ? AND deletedAt IS NULL
           ORDER BY points DESC, createdAt ASC LIMIT ? OFFSET ?`
        )
        .bind(tenantId, electionId, status, limit, offset)
        .all(),
      c.env.DB
        .prepare(
          `SELECT COUNT(*) as total FROM civic_volunteers
           WHERE tenantId = ? AND electionId = ? AND status = ? AND deletedAt IS NULL`
        )
        .bind(tenantId, electionId, status)
        .first<{ total: number }>(),
    ]);

    logger.info("Volunteers listed", { electionId, status, limit, offset, total: countRow?.total ?? 0 });

    return c.json({ success: true, volunteers: rows.results, total: countRow?.total ?? 0, limit, offset });
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

    const volunteer = await c.env.DB
      .prepare(
        `SELECT * FROM civic_volunteers
         WHERE id = ? AND tenantId = ? AND electionId = ? AND deletedAt IS NULL`
      )
      .bind(volunteerId, tenantId, electionId)
      .first();

    if (!volunteer) {
      return c.json({ error: "Volunteer not found" }, 404);
    }

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
    const { firstName, lastName, email, phone, skills, state, lga, ward, status } = await c.req.json();

    if (!tenantId || !volunteerId) {
      return c.json({ error: "Missing required fields" }, 400);
    }

    const now = Date.now();
    const name = firstName && lastName ? `${firstName} ${lastName}` : undefined;

    await c.env.DB
      .prepare(
        `UPDATE civic_volunteers SET
         name = COALESCE(?, name),
         email = COALESCE(?, email),
         phone = COALESCE(?, phone),
         skills = COALESCE(?, skills),
         state = COALESCE(?, state),
         lga = COALESCE(?, lga),
         ward = COALESCE(?, ward),
         status = COALESCE(?, status),
         updatedAt = ?
         WHERE id = ? AND tenantId = ? AND electionId = ? AND deletedAt IS NULL`
      )
      .bind(
        name ?? null, email ?? null, phone ?? null,
        skills ? JSON.stringify(skills) : null,
        state ?? null, lga ?? null, ward ?? null, status ?? null,
        now, volunteerId, tenantId, electionId
      )
      .run();

    const updated = await c.env.DB
      .prepare(
        `SELECT * FROM civic_volunteers WHERE id = ? AND tenantId = ? AND deletedAt IS NULL`
      )
      .bind(volunteerId, tenantId)
      .first();

    if (!updated) return c.json({ error: "Volunteer not found" }, 404);

    logger.info("Volunteer profile updated", { electionId, volunteerId });

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
    const { title, taskType, description, dueAt, priority, maxVolunteers, pointsReward, createdBy } = await c.req.json();

    if (!tenantId || !title || !taskType) {
      return c.json({ error: "Missing required fields: title, taskType" }, 400);
    }

    const taskId = uuidv4();
    const now = Date.now();
    const resolvedCreatedBy = createdBy || "system";

    await c.env.DB
      .prepare(
        `INSERT INTO civic_volunteer_tasks
         (id, tenantId, electionId, title, description, taskType, status, priority,
          dueAt, pointsReward, createdBy, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, 'open', ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        taskId, tenantId, electionId, title,
        description ?? null, taskType,
        priority ?? "normal",
        dueAt ?? null,
        pointsReward ?? calculatePoints(taskType, 1),
        resolvedCreatedBy, now, now
      )
      .run();

    logger.info("Task created", { electionId, taskId, title, taskType });

    return c.json({
      success: true,
      task: {
        id: taskId,
        electionId,
        tenantId,
        title,
        taskType,
        description: description ?? null,
        status: "open",
        priority: priority ?? "normal",
        dueAt: dueAt ?? null,
        pointsReward: pointsReward ?? calculatePoints(taskType, 1),
        maxVolunteers: maxVolunteers ?? 10,
        createdBy: resolvedCreatedBy,
        createdAt: now,
        updatedAt: now,
      },
    });
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
    const limit = Math.min(parseInt(c.req.query("limit") || "50"), 200);
    const offset = parseInt(c.req.query("offset") || "0");

    if (!tenantId) {
      return c.json({ error: "Missing tenant ID" }, 400);
    }

    let sql = `SELECT * FROM civic_volunteer_tasks
               WHERE tenantId = ? AND electionId = ? AND status = ? AND deletedAt IS NULL`;
    const binds: (string | number)[] = [tenantId, electionId, status];

    if (taskType) {
      sql += " AND taskType = ?";
      binds.push(taskType);
    }

    sql += " ORDER BY createdAt DESC LIMIT ? OFFSET ?";
    binds.push(limit, offset);

    const [rows, countRow] = await Promise.all([
      c.env.DB.prepare(sql).bind(...binds).all(),
      c.env.DB
        .prepare(
          `SELECT COUNT(*) as total FROM civic_volunteer_tasks
           WHERE tenantId = ? AND electionId = ? AND status = ? AND deletedAt IS NULL${taskType ? " AND taskType = ?" : ""}`
        )
        .bind(...(taskType ? [tenantId, electionId, status, taskType] : [tenantId, electionId, status]))
        .first<{ total: number }>(),
    ]);

    logger.info("Tasks listed", { electionId, taskType, status, limit, offset });

    return c.json({ success: true, tasks: rows.results, total: countRow?.total ?? 0, limit, offset });
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

    const [task, assignmentCount] = await Promise.all([
      c.env.DB
        .prepare(
          `SELECT * FROM civic_volunteer_tasks
           WHERE id = ? AND tenantId = ? AND electionId = ? AND deletedAt IS NULL`
        )
        .bind(taskId, tenantId, electionId)
        .first(),
      c.env.DB
        .prepare(
          `SELECT COUNT(*) as count FROM civic_volunteer_assignments
           WHERE taskId = ? AND tenantId = ? AND status != 'cancelled'`
        )
        .bind(taskId, tenantId)
        .first<{ count: number }>(),
    ]);

    if (!task) {
      return c.json({ error: "Task not found" }, 404);
    }

    logger.info("Task details retrieved", { electionId, taskId });

    return c.json({ success: true, task: { ...task, currentVolunteers: assignmentCount?.count ?? 0 } });
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
    const { volunteerId, notes } = await c.req.json();

    if (!tenantId || !volunteerId) {
      return c.json({ error: "Missing required fields: volunteerId" }, 400);
    }

    // Verify volunteer exists
    const volunteer = await c.env.DB
      .prepare(`SELECT id FROM civic_volunteers WHERE id = ? AND tenantId = ? AND electionId = ? AND deletedAt IS NULL`)
      .bind(volunteerId, tenantId, electionId)
      .first();

    if (!volunteer) {
      return c.json({ error: "Volunteer not found" }, 404);
    }

    // Verify task exists
    const task = await c.env.DB
      .prepare(`SELECT id FROM civic_volunteer_tasks WHERE id = ? AND tenantId = ? AND electionId = ? AND deletedAt IS NULL`)
      .bind(taskId, tenantId, electionId)
      .first();

    if (!task) {
      return c.json({ error: "Task not found" }, 404);
    }

    const assignmentId = uuidv4();
    const now = Date.now();

    await c.env.DB
      .prepare(
        `INSERT INTO civic_volunteer_assignments
         (id, tenantId, electionId, taskId, volunteerId, status, notes, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, ?)`
      )
      .bind(assignmentId, tenantId, electionId, taskId, volunteerId, notes ?? null, now, now)
      .run();

    // Mark task as assigned
    await c.env.DB
      .prepare(`UPDATE civic_volunteer_tasks SET assignedTo = ?, status = 'assigned', updatedAt = ? WHERE id = ? AND tenantId = ?`)
      .bind(volunteerId, now, taskId, tenantId)
      .run();

    logger.info("Volunteer assigned to task", { electionId, taskId, volunteerId, assignmentId });

    return c.json({
      success: true,
      assignment: {
        id: assignmentId,
        electionId,
        taskId,
        volunteerId,
        status: "pending",
        notes: notes ?? null,
        createdAt: now,
        updatedAt: now,
      },
    });
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

      await c.env.DB
        .prepare(
          `UPDATE civic_volunteer_assignments
           SET status = 'accepted', acceptedAt = ?, updatedAt = ?
           WHERE id = ? AND tenantId = ? AND electionId = ?`
        )
        .bind(now, now, assignmentId, tenantId, electionId)
        .run();

      // Update task status to in_progress
      const assignment = await c.env.DB
        .prepare(`SELECT taskId FROM civic_volunteer_assignments WHERE id = ? AND tenantId = ?`)
        .bind(assignmentId, tenantId)
        .first<{ taskId: string }>();

      if (assignment?.taskId) {
        await c.env.DB
          .prepare(`UPDATE civic_volunteer_tasks SET status = 'in_progress', updatedAt = ? WHERE id = ? AND tenantId = ?`)
          .bind(now, assignment.taskId, tenantId)
          .run();
      }

      logger.info("Assignment accepted", { electionId, assignmentId });

      return c.json({
        success: true,
        assignment: {
          id: assignmentId,
          status: "accepted",
          acceptedAt: now,
          updatedAt: now,
        },
      });
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
      const hours = hoursWorked || 1;

      // Fetch assignment to get volunteerId and taskType
      const assignment = await c.env.DB
        .prepare(
          `SELECT va.*, vt.taskType
           FROM civic_volunteer_assignments va
           LEFT JOIN civic_volunteer_tasks vt ON vt.id = va.taskId
           WHERE va.id = ? AND va.tenantId = ? AND va.electionId = ?`
        )
        .bind(assignmentId, tenantId, electionId)
        .first<{ volunteerId: string; taskId: string; taskType: string }>();

      if (!assignment) {
        return c.json({ error: "Assignment not found" }, 404);
      }

      const pointsEarned = calculatePoints(assignment.taskType || "canvassing", hours, isEarlyCompletion);

      await c.env.DB
        .prepare(
          `UPDATE civic_volunteer_assignments
           SET status = 'completed', completedAt = ?, hoursWorked = ?, notes = COALESCE(?, notes), updatedAt = ?
           WHERE id = ? AND tenantId = ? AND electionId = ?`
        )
        .bind(now, hours, feedback ?? null, now, assignmentId, tenantId, electionId)
        .run();

      // Mark task as completed
      await c.env.DB
        .prepare(`UPDATE civic_volunteer_tasks SET status = 'completed', updatedAt = ? WHERE id = ? AND tenantId = ?`)
        .bind(now, assignment.taskId, tenantId)
        .run();

      // Update volunteer points and tasksCompleted
      await c.env.DB
        .prepare(
          `UPDATE civic_volunteers
           SET points = points + ?, tasksCompleted = tasksCompleted + 1, updatedAt = ?
           WHERE id = ? AND tenantId = ?`
        )
        .bind(pointsEarned, now, assignment.volunteerId, tenantId)
        .run();

      logger.info("Task completed", { electionId, assignmentId, hoursWorked: hours, pointsEarned });

      return c.json({
        success: true,
        assignment: {
          id: assignmentId,
          status: "completed",
          completedAt: now,
          hoursWorked: hours,
          pointsEarned,
          feedback: feedback ?? null,
          rating: rating ?? null,
          updatedAt: now,
        },
        pointsEarned,
      });
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
    const limit = Math.min(parseInt(c.req.query("limit") || "50"), 200);
    const offset = parseInt(c.req.query("offset") || "0");

    if (!tenantId || !volunteerId) {
      return c.json({ error: "Missing required fields" }, 400);
    }

    let sql = `SELECT va.*, vt.title as taskTitle, vt.taskType, vt.pointsReward
               FROM civic_volunteer_assignments va
               LEFT JOIN civic_volunteer_tasks vt ON vt.id = va.taskId
               WHERE va.tenantId = ? AND va.electionId = ? AND va.volunteerId = ?`;
    const binds: (string | number)[] = [tenantId, electionId, volunteerId];

    if (status) {
      sql += " AND va.status = ?";
      binds.push(status);
    }

    sql += " ORDER BY va.createdAt DESC LIMIT ? OFFSET ?";
    binds.push(limit, offset);

    const [rows, countRow] = await Promise.all([
      c.env.DB.prepare(sql).bind(...binds).all(),
      c.env.DB
        .prepare(
          `SELECT COUNT(*) as total FROM civic_volunteer_assignments
           WHERE tenantId = ? AND electionId = ? AND volunteerId = ?${status ? " AND status = ?" : ""}`
        )
        .bind(...(status ? [tenantId, electionId, volunteerId, status] : [tenantId, electionId, volunteerId]))
        .first<{ total: number }>(),
    ]);

    logger.info("Volunteer assignments retrieved", { electionId, volunteerId, status, limit, offset });

    return c.json({ success: true, assignments: rows.results, total: countRow?.total ?? 0, limit, offset });
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
    const limit = Math.min(parseInt(c.req.query("limit") || "100"), 200);
    const offset = parseInt(c.req.query("offset") || "0");

    if (!tenantId) {
      return c.json({ error: "Missing tenant ID" }, 400);
    }

    let sql = `SELECT id, name, email, phone, state, lga, ward, status, skills,
               points, tasksCompleted,
               CASE
                 WHEN points >= 1000 THEN 'platinum'
                 WHEN points >= 500 THEN 'gold'
                 WHEN points >= 100 THEN 'silver'
                 ELSE 'bronze'
               END as tier,
               ROW_NUMBER() OVER (ORDER BY points DESC, tasksCompleted DESC) as rank
               FROM civic_volunteers
               WHERE tenantId = ? AND electionId = ? AND status = 'active' AND deletedAt IS NULL`;
    const binds: (string | number)[] = [tenantId, electionId];

    if (tier) {
      const tierMap: Record<string, string> = {
        platinum: "points >= 1000",
        gold: "points >= 500 AND points < 1000",
        silver: "points >= 100 AND points < 500",
        bronze: "points < 100",
      };
      const tierCondition = tierMap[tier];
      if (tierCondition) {
        sql += ` AND (${tierCondition})`;
      }
    }

    sql += " ORDER BY points DESC, tasksCompleted DESC LIMIT ? OFFSET ?";
    binds.push(limit, offset);

    const [rows, countRow] = await Promise.all([
      c.env.DB.prepare(sql).bind(...binds).all(),
      c.env.DB
        .prepare(
          `SELECT COUNT(*) as total FROM civic_volunteers
           WHERE tenantId = ? AND electionId = ? AND status = 'active' AND deletedAt IS NULL`
        )
        .bind(tenantId, electionId)
        .first<{ total: number }>(),
    ]);

    logger.info("Leaderboard retrieved", { electionId, tier, limit, offset });

    return c.json({ success: true, leaderboard: rows.results, total: countRow?.total ?? 0, limit, offset });
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

    const [volunteer, hoursRow, rankRow, badges] = await Promise.all([
      c.env.DB
        .prepare(
          `SELECT id, name, points, tasksCompleted FROM civic_volunteers
           WHERE id = ? AND tenantId = ? AND electionId = ? AND deletedAt IS NULL`
        )
        .bind(volunteerId, tenantId, electionId)
        .first<{ id: string; name: string; points: number; tasksCompleted: number }>(),
      c.env.DB
        .prepare(
          `SELECT COALESCE(SUM(hoursWorked), 0) as totalHours
           FROM civic_volunteer_assignments
           WHERE volunteerId = ? AND tenantId = ? AND electionId = ? AND status = 'completed'`
        )
        .bind(volunteerId, tenantId, electionId)
        .first<{ totalHours: number }>(),
      c.env.DB
        .prepare(
          `SELECT COUNT(*) as rank FROM civic_volunteers
           WHERE tenantId = ? AND electionId = ? AND points > (
             SELECT COALESCE(points, 0) FROM civic_volunteers WHERE id = ? AND deletedAt IS NULL
           ) AND deletedAt IS NULL`
        )
        .bind(tenantId, electionId, volunteerId)
        .first<{ rank: number }>(),
      c.env.DB
        .prepare(
          `SELECT badgeType, awardedAt FROM civic_volunteer_badges
           WHERE volunteerId = ? AND tenantId = ? AND electionId = ?
           ORDER BY awardedAt DESC`
        )
        .bind(volunteerId, tenantId, electionId)
        .all<{ badgeType: string; awardedAt: number }>(),
    ]);

    if (!volunteer) {
      return c.json({ error: "Volunteer not found" }, 404);
    }

    const totalPoints = volunteer.points ?? 0;
    const tasksCompleted = volunteer.tasksCompleted ?? 0;
    const totalHours = hoursRow?.totalHours ?? 0;
    const rank = (rankRow?.rank ?? 0) + 1;

    const autoBadges = awardBadges(tasksCompleted, totalHours, totalPoints);
    const manualBadges = (badges.results ?? []).map((b) => b.badgeType);
    const allBadges = [...new Set([...autoBadges, ...manualBadges])];

    logger.info("Volunteer statistics retrieved", { electionId, volunteerId });

    return c.json({
      success: true,
      stats: {
        volunteerId,
        name: volunteer.name,
        totalPoints,
        totalHours,
        tasksCompleted,
        tier: determineTier(totalPoints),
        rank,
        badgesEarned: allBadges,
        recentBadges: badges.results ?? [],
        achievements: allBadges.map((b) => ({ badge: b, earnedAt: Date.now() })),
      },
    });
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
    const { badgeId, reason, awardedBy } = await c.req.json();

    if (!tenantId || !badgeId) {
      return c.json({ error: "Missing required fields: badgeId" }, 400);
    }

    const now = Date.now();
    const badgeRowId = uuidv4();
    const resolvedAwardedBy = awardedBy || "system";

    await c.env.DB
      .prepare(
        `INSERT INTO civic_volunteer_badges
         (id, tenantId, volunteerId, electionId, badgeType, awardedBy, awardedAt, createdAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(badgeRowId, tenantId, volunteerId, electionId, badgeId, resolvedAwardedBy, now, now)
      .run();

    logger.info("Badge awarded", { electionId, volunteerId, badgeId });

    return c.json({
      success: true,
      badge: {
        id: badgeRowId,
        volunteerId,
        badgeId,
        badgeType: badgeId,
        reason: reason ?? null,
        awardedBy: resolvedAwardedBy,
        awardedAt: now,
      },
    });
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
