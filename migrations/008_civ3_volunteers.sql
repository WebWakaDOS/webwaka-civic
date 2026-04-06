-- WebWaka Civic — CIV-3 Phase 3: Volunteer Management System
-- Migration: 008_civ3_volunteers.sql
-- Purpose: Create volunteer management tables with offline sync support
-- Idempotent: Yes (all CREATE TABLE IF NOT EXISTS, ALTER TABLE with new columns)
-- Rollback: Not supported in D1 (manual cleanup required)

-- ─── Table 1: civc_volunteers ──────────────────────────────────────────────

-- NOTE: civc_volunteers was created in 006_civ3_elections.sql
-- Adding new columns for Phase 3 volunteer management system
ALTER TABLE civc_volunteers ADD COLUMN electionId TEXT;
ALTER TABLE civc_volunteers ADD COLUMN voterId TEXT;
ALTER TABLE civc_volunteers ADD COLUMN firstName TEXT;
ALTER TABLE civc_volunteers ADD COLUMN lastName TEXT;
ALTER TABLE civc_volunteers ADD COLUMN profileImage TEXT;
ALTER TABLE civc_volunteers ADD COLUMN bio TEXT;
ALTER TABLE civc_volunteers ADD COLUMN joinedAt INTEGER;
ALTER TABLE civc_volunteers ADD COLUMN lastActiveAt INTEGER;
ALTER TABLE civc_volunteers ADD COLUMN ndprConsent INTEGER NOT NULL DEFAULT 0;
ALTER TABLE civc_volunteers ADD COLUMN dataProcessingConsent INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_civc_volunteers_election_status 
  ON civc_volunteers(electionId, status);

CREATE INDEX IF NOT EXISTS idx_civc_volunteers_tenant 
  ON civc_volunteers(tenantId, id);

CREATE INDEX IF NOT EXISTS idx_civc_volunteers_voter 
  ON civc_volunteers(voterId);

-- ─── Table 2: civc_volunteer_tasks ────────────────────────────────────────
-- NOTE: civc_volunteer_tasks was created in 006_civ3_elections.sql (without priority/location/etc)
-- Adding missing columns needed by Phase 3

ALTER TABLE civc_volunteer_tasks ADD COLUMN campaignId TEXT;
ALTER TABLE civc_volunteer_tasks ADD COLUMN location TEXT;
ALTER TABLE civc_volunteer_tasks ADD COLUMN locationLat REAL;
ALTER TABLE civc_volunteer_tasks ADD COLUMN locationLng REAL;
ALTER TABLE civc_volunteer_tasks ADD COLUMN startTime INTEGER;
ALTER TABLE civc_volunteer_tasks ADD COLUMN endTime INTEGER;
ALTER TABLE civc_volunteer_tasks ADD COLUMN estimatedDuration INTEGER;
ALTER TABLE civc_volunteer_tasks ADD COLUMN priority TEXT NOT NULL DEFAULT 'medium';
ALTER TABLE civc_volunteer_tasks ADD COLUMN maxVolunteers INTEGER;
ALTER TABLE civc_volunteer_tasks ADD COLUMN currentVolunteers INTEGER DEFAULT 0;
ALTER TABLE civc_volunteer_tasks ADD COLUMN pointsReward INTEGER DEFAULT 10;
ALTER TABLE civc_volunteer_tasks ADD COLUMN badgeReward TEXT;
ALTER TABLE civc_volunteer_tasks ADD COLUMN materialsNeeded TEXT;

CREATE INDEX IF NOT EXISTS idx_civc_volunteer_tasks_election_status 
  ON civc_volunteer_tasks(electionId, status);

CREATE INDEX IF NOT EXISTS idx_civc_volunteer_tasks_type 
  ON civc_volunteer_tasks(taskType);

CREATE INDEX IF NOT EXISTS idx_civc_volunteer_tasks_priority 
  ON civc_volunteer_tasks(priority);

CREATE INDEX IF NOT EXISTS idx_civc_volunteer_tasks_tenant 
  ON civc_volunteer_tasks(tenantId, id);

-- ─── Table 3: civc_volunteer_assignments ──────────────────────────────────

CREATE TABLE IF NOT EXISTS civc_volunteer_assignments (
  id TEXT PRIMARY KEY,
  electionId TEXT NOT NULL,
  tenantId TEXT NOT NULL,
  taskId TEXT NOT NULL,
  volunteerId TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'assigned',
  assignedAt INTEGER NOT NULL,
  acceptedAt INTEGER,
  startedAt INTEGER,
  completedAt INTEGER,
  cancelledAt INTEGER,
  noShowAt INTEGER,
  hoursWorked REAL,
  pointsEarned INTEGER DEFAULT 0,
  badgesEarned TEXT,
  feedback TEXT,
  rating INTEGER,
  offlineSync BOOLEAN DEFAULT 0,
  syncedAt INTEGER,
  deletedAt INTEGER,
  createdAt INTEGER NOT NULL,
  updatedAt INTEGER NOT NULL,
  
  UNIQUE(taskId, volunteerId),
  FOREIGN KEY(taskId) REFERENCES civc_volunteer_tasks(id),
  FOREIGN KEY(volunteerId) REFERENCES civc_volunteers(id)
);

CREATE INDEX IF NOT EXISTS idx_civc_volunteer_assignments_volunteer_status 
  ON civc_volunteer_assignments(volunteerId, status);

CREATE INDEX IF NOT EXISTS idx_civc_volunteer_assignments_task 
  ON civc_volunteer_assignments(taskId);

CREATE INDEX IF NOT EXISTS idx_civc_volunteer_assignments_election 
  ON civc_volunteer_assignments(electionId, status);

CREATE INDEX IF NOT EXISTS idx_civc_volunteer_assignments_tenant 
  ON civc_volunteer_assignments(tenantId, id);

CREATE INDEX IF NOT EXISTS idx_civc_volunteer_assignments_offline_sync 
  ON civc_volunteer_assignments(offlineSync, syncedAt);

-- ─── Table 4: civc_volunteer_leaderboards ─────────────────────────────────

CREATE TABLE IF NOT EXISTS civc_volunteer_leaderboards (
  id TEXT PRIMARY KEY,
  electionId TEXT NOT NULL,
  tenantId TEXT NOT NULL,
  volunteerId TEXT NOT NULL,
  rank INTEGER,
  totalPoints INTEGER DEFAULT 0,
  totalHours REAL DEFAULT 0,
  tasksCompleted INTEGER DEFAULT 0,
  badgesEarned TEXT,
  streakDays INTEGER DEFAULT 0,
  lastActivityAt INTEGER,
  tier TEXT DEFAULT 'bronze',
  achievements TEXT,
  offlineSync BOOLEAN DEFAULT 0,
  syncedAt INTEGER,
  deletedAt INTEGER,
  createdAt INTEGER NOT NULL,
  updatedAt INTEGER NOT NULL,
  
  UNIQUE(electionId, volunteerId),
  FOREIGN KEY(volunteerId) REFERENCES civc_volunteers(id)
);

CREATE INDEX IF NOT EXISTS idx_civc_volunteer_leaderboards_election_rank 
  ON civc_volunteer_leaderboards(electionId, rank);

CREATE INDEX IF NOT EXISTS idx_civc_volunteer_leaderboards_tier 
  ON civc_volunteer_leaderboards(tier);

CREATE INDEX IF NOT EXISTS idx_civc_volunteer_leaderboards_tenant 
  ON civc_volunteer_leaderboards(tenantId, id);

-- ─── Automatic Triggers ────────────────────────────────────────────────────

CREATE TRIGGER IF NOT EXISTS trg_volunteer_last_active_on_assignment_complete
AFTER UPDATE OF status ON civc_volunteer_assignments
WHEN NEW.status = 'completed'
BEGIN
  UPDATE civc_volunteers 
  SET lastActiveAt = NEW.completedAt, updatedAt = NEW.completedAt
  WHERE id = NEW.volunteerId;
END;

CREATE TRIGGER IF NOT EXISTS trg_task_volunteers_on_assignment_create
AFTER INSERT ON civc_volunteer_assignments
WHEN NEW.status IN ('assigned', 'accepted', 'in_progress')
BEGIN
  UPDATE civc_volunteer_tasks 
  SET currentVolunteers = currentVolunteers + 1, updatedAt = NEW.createdAt
  WHERE id = NEW.taskId;
END;

CREATE TRIGGER IF NOT EXISTS trg_task_volunteers_on_assignment_complete
AFTER UPDATE OF status ON civc_volunteer_assignments
WHEN NEW.status IN ('completed', 'cancelled', 'no_show')
BEGIN
  UPDATE civc_volunteer_tasks 
  SET currentVolunteers = CASE 
    WHEN currentVolunteers > 0 THEN currentVolunteers - 1 
    ELSE 0 
  END, updatedAt = NEW.updatedAt
  WHERE id = NEW.taskId;
END;

CREATE TRIGGER IF NOT EXISTS trg_leaderboard_update_on_assignment_complete
AFTER UPDATE OF status ON civc_volunteer_assignments
WHEN NEW.status = 'completed'
BEGIN
  UPDATE civc_volunteer_leaderboards 
  SET 
    totalPoints = totalPoints + COALESCE(NEW.pointsEarned, 0),
    tasksCompleted = tasksCompleted + 1,
    totalHours = totalHours + COALESCE(NEW.hoursWorked, 0),
    lastActivityAt = NEW.completedAt,
    updatedAt = NEW.completedAt
  WHERE volunteerId = NEW.volunteerId;
END;

CREATE TRIGGER IF NOT EXISTS trg_leaderboard_create_on_volunteer_register
AFTER INSERT ON civc_volunteers
BEGIN
  INSERT INTO civc_volunteer_leaderboards (
    id, electionId, tenantId, volunteerId, rank, totalPoints, totalHours,
    tasksCompleted, badgesEarned, streakDays, lastActivityAt, tier,
    achievements, createdAt, updatedAt
  ) VALUES (
    'leaderboard_' || NEW.id,
    NEW.electionId,
    NEW.tenantId,
    NEW.id,
    NULL, 0, 0, 0, '[]', 0,
    NEW.joinedAt,
    'bronze', '[]',
    NEW.createdAt,
    NEW.updatedAt
  );
END;

-- ─── Views ─────────────────────────────────────────────────────────────────

CREATE VIEW IF NOT EXISTS vw_volunteer_stats AS
SELECT 
  v.id,
  v.electionId,
  v.firstName,
  v.lastName,
  COUNT(DISTINCT a.id) as tasksCompleted,
  SUM(CASE WHEN a.status = 'completed' THEN a.hoursWorked ELSE 0 END) as totalHours,
  SUM(CASE WHEN a.status = 'completed' THEN a.pointsEarned ELSE 0 END) as totalPoints,
  COUNT(DISTINCT CASE WHEN a.status = 'completed' THEN a.id END) as completedCount,
  MAX(a.completedAt) as lastActivityAt
FROM civc_volunteers v
LEFT JOIN civc_volunteer_assignments a ON v.id = a.volunteerId AND a.deletedAt IS NULL
WHERE v.deletedAt IS NULL
GROUP BY v.id;

CREATE VIEW IF NOT EXISTS vw_leaderboard_current AS
SELECT 
  l.rank,
  l.volunteerId,
  v.firstName,
  v.lastName,
  v.profileImage,
  l.totalPoints,
  l.totalHours,
  l.tasksCompleted,
  l.tier,
  l.streakDays,
  l.badgesEarned,
  l.achievements
FROM civc_volunteer_leaderboards l
JOIN civc_volunteers v ON l.volunteerId = v.id
WHERE l.deletedAt IS NULL AND v.deletedAt IS NULL;

CREATE VIEW IF NOT EXISTS vw_task_assignments AS
SELECT 
  t.id as taskId,
  t.title,
  t.taskType,
  t.status as taskStatus,
  COUNT(a.id) as assignmentCount,
  SUM(CASE WHEN a.status = 'completed' THEN 1 ELSE 0 END) as completedCount,
  SUM(CASE WHEN a.status IN ('assigned', 'accepted', 'in_progress') THEN 1 ELSE 0 END) as activeCount
FROM civc_volunteer_tasks t
LEFT JOIN civc_volunteer_assignments a ON t.id = a.taskId AND a.deletedAt IS NULL
WHERE t.deletedAt IS NULL
GROUP BY t.id;
