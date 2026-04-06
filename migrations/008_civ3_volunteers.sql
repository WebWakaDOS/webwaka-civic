-- WebWaka Civic — CIV-3 Phase 3: Volunteer Management System
-- Migration: 008_civ3_volunteers.sql
-- Purpose: Create volunteer management tables with offline sync support
-- Idempotent: Yes (all CREATE TABLE IF NOT EXISTS)
-- Rollback: Not supported in D1 (manual cleanup required)

-- ─── Table 1: civic_volunteers ──────────────────────────────────────────────

-- NOTE: civic_volunteers was created in 006_civ3_elections.sql
-- Adding new columns for Phase 3 volunteer management system
ALTER TABLE civic_volunteers ADD COLUMN electionId TEXT;
ALTER TABLE civic_volunteers ADD COLUMN voterId TEXT;
ALTER TABLE civic_volunteers ADD COLUMN firstName TEXT;
ALTER TABLE civic_volunteers ADD COLUMN lastName TEXT;
ALTER TABLE civic_volunteers ADD COLUMN profileImage TEXT;
ALTER TABLE civic_volunteers ADD COLUMN bio TEXT;
ALTER TABLE civic_volunteers ADD COLUMN joinedAt INTEGER;
ALTER TABLE civic_volunteers ADD COLUMN lastActiveAt INTEGER;
ALTER TABLE civic_volunteers ADD COLUMN ndprConsent INTEGER NOT NULL DEFAULT 0;
ALTER TABLE civic_volunteers ADD COLUMN dataProcessingConsent INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_civic_volunteers_election_status 
  ON civic_volunteers(electionId, status);

CREATE INDEX IF NOT EXISTS idx_civic_volunteers_tenant 
  ON civic_volunteers(tenantId, id);

CREATE INDEX IF NOT EXISTS idx_civic_volunteers_voter 
  ON civic_volunteers(voterId);

-- ─── Table 2: civic_volunteer_tasks ────────────────────────────────────────

CREATE TABLE IF NOT EXISTS civic_volunteer_tasks (
  id TEXT PRIMARY KEY,
  electionId TEXT NOT NULL,
  tenantId TEXT NOT NULL,
  campaignId TEXT,
  title TEXT NOT NULL,
  description TEXT,
  taskType TEXT NOT NULL, -- canvassing, phonebanking, event_organizing, data_entry, social_media
  location TEXT,
  locationLat REAL,
  locationLng REAL,
  startTime INTEGER NOT NULL,
  endTime INTEGER NOT NULL,
  estimatedDuration INTEGER, -- minutes
  priority TEXT NOT NULL DEFAULT 'medium', -- low, medium, high, urgent
  maxVolunteers INTEGER,
  currentVolunteers INTEGER DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'open', -- open, in_progress, completed, cancelled
  pointsReward INTEGER DEFAULT 10,
  badgeReward TEXT, -- JSON: ["canvasser_level_1", "team_player"]
  materialsNeeded TEXT, -- JSON: ["flyers", "clipboards"]
  deletedAt INTEGER,
  createdAt INTEGER NOT NULL,
  updatedAt INTEGER NOT NULL,
  
  FOREIGN KEY(electionId) REFERENCES civic_elections(id)
);

CREATE INDEX IF NOT EXISTS idx_civic_volunteer_tasks_election_status 
  ON civic_volunteer_tasks(electionId, status);

CREATE INDEX IF NOT EXISTS idx_civic_volunteer_tasks_type 
  ON civic_volunteer_tasks(taskType);

CREATE INDEX IF NOT EXISTS idx_civic_volunteer_tasks_priority 
  ON civic_volunteer_tasks(priority);

CREATE INDEX IF NOT EXISTS idx_civic_volunteer_tasks_tenant 
  ON civic_volunteer_tasks(tenantId, id);

-- ─── Table 3: civic_volunteer_assignments ──────────────────────────────────

CREATE TABLE IF NOT EXISTS civic_volunteer_assignments (
  id TEXT PRIMARY KEY,
  electionId TEXT NOT NULL,
  tenantId TEXT NOT NULL,
  taskId TEXT NOT NULL,
  volunteerId TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'assigned', -- assigned, accepted, in_progress, completed, cancelled, no_show
  assignedAt INTEGER NOT NULL,
  acceptedAt INTEGER,
  startedAt INTEGER,
  completedAt INTEGER,
  cancelledAt INTEGER,
  noShowAt INTEGER,
  hoursWorked REAL,
  pointsEarned INTEGER DEFAULT 0,
  badgesEarned TEXT, -- JSON: ["canvasser_level_1"]
  feedback TEXT,
  rating INTEGER, -- 1-5 stars
  offlineSync BOOLEAN DEFAULT 0,
  syncedAt INTEGER,
  deletedAt INTEGER,
  createdAt INTEGER NOT NULL,
  updatedAt INTEGER NOT NULL,
  
  UNIQUE(taskId, volunteerId),
  FOREIGN KEY(taskId) REFERENCES civic_volunteer_tasks(id),
  FOREIGN KEY(volunteerId) REFERENCES civic_volunteers(id)
);

CREATE INDEX IF NOT EXISTS idx_civic_volunteer_assignments_volunteer_status 
  ON civic_volunteer_assignments(volunteerId, status);

CREATE INDEX IF NOT EXISTS idx_civic_volunteer_assignments_task 
  ON civic_volunteer_assignments(taskId);

CREATE INDEX IF NOT EXISTS idx_civic_volunteer_assignments_election 
  ON civic_volunteer_assignments(electionId, status);

CREATE INDEX IF NOT EXISTS idx_civic_volunteer_assignments_tenant 
  ON civic_volunteer_assignments(tenantId, id);

CREATE INDEX IF NOT EXISTS idx_civic_volunteer_assignments_offline_sync 
  ON civic_volunteer_assignments(offlineSync, syncedAt);

-- ─── Table 4: civic_volunteer_leaderboards ─────────────────────────────────

CREATE TABLE IF NOT EXISTS civic_volunteer_leaderboards (
  id TEXT PRIMARY KEY,
  electionId TEXT NOT NULL,
  tenantId TEXT NOT NULL,
  volunteerId TEXT NOT NULL,
  rank INTEGER,
  totalPoints INTEGER DEFAULT 0,
  totalHours REAL DEFAULT 0,
  tasksCompleted INTEGER DEFAULT 0,
  badgesEarned TEXT, -- JSON array of badge IDs
  streakDays INTEGER DEFAULT 0,
  lastActivityAt INTEGER,
  tier TEXT DEFAULT 'bronze', -- bronze, silver, gold, platinum
  achievements TEXT, -- JSON: ["first_task", "10_tasks", "100_hours"]
  offlineSync BOOLEAN DEFAULT 0,
  syncedAt INTEGER,
  deletedAt INTEGER,
  createdAt INTEGER NOT NULL,
  updatedAt INTEGER NOT NULL,
  
  UNIQUE(electionId, volunteerId),
  FOREIGN KEY(volunteerId) REFERENCES civic_volunteers(id)
);

CREATE INDEX IF NOT EXISTS idx_civic_volunteer_leaderboards_election_rank 
  ON civic_volunteer_leaderboards(electionId, rank);

CREATE INDEX IF NOT EXISTS idx_civic_volunteer_leaderboards_tier 
  ON civic_volunteer_leaderboards(tier);

CREATE INDEX IF NOT EXISTS idx_civic_volunteer_leaderboards_tenant 
  ON civic_volunteer_leaderboards(tenantId, id);

-- ─── Automatic Triggers ────────────────────────────────────────────────────

-- Trigger 1: Update volunteer lastActiveAt on assignment completion
CREATE TRIGGER IF NOT EXISTS trg_volunteer_last_active_on_assignment_complete
AFTER UPDATE OF status ON civic_volunteer_assignments
WHEN NEW.status = 'completed'
BEGIN
  UPDATE civic_volunteers 
  SET lastActiveAt = NEW.completedAt, updatedAt = NEW.completedAt
  WHERE id = NEW.volunteerId;
END;

-- Trigger 2: Update task currentVolunteers on assignment creation
CREATE TRIGGER IF NOT EXISTS trg_task_volunteers_on_assignment_create
AFTER INSERT ON civic_volunteer_assignments
WHEN NEW.status IN ('assigned', 'accepted', 'in_progress')
BEGIN
  UPDATE civic_volunteer_tasks 
  SET currentVolunteers = currentVolunteers + 1, updatedAt = NEW.createdAt
  WHERE id = NEW.taskId;
END;

-- Trigger 3: Update task currentVolunteers on assignment completion/cancellation
CREATE TRIGGER IF NOT EXISTS trg_task_volunteers_on_assignment_complete
AFTER UPDATE OF status ON civic_volunteer_assignments
WHEN NEW.status IN ('completed', 'cancelled', 'no_show')
BEGIN
  UPDATE civic_volunteer_tasks 
  SET currentVolunteers = CASE 
    WHEN currentVolunteers > 0 THEN currentVolunteers - 1 
    ELSE 0 
  END, updatedAt = NEW.updatedAt
  WHERE id = NEW.taskId;
END;

-- Trigger 4: Update leaderboard on assignment completion
CREATE TRIGGER IF NOT EXISTS trg_leaderboard_update_on_assignment_complete
AFTER UPDATE OF status ON civic_volunteer_assignments
WHEN NEW.status = 'completed'
BEGIN
  UPDATE civic_volunteer_leaderboards 
  SET 
    totalPoints = totalPoints + COALESCE(NEW.pointsEarned, 0),
    tasksCompleted = tasksCompleted + 1,
    totalHours = totalHours + COALESCE(NEW.hoursWorked, 0),
    lastActivityAt = NEW.completedAt,
    updatedAt = NEW.completedAt
  WHERE volunteerId = NEW.volunteerId;
END;

-- Trigger 5: Create leaderboard entry on volunteer registration
CREATE TRIGGER IF NOT EXISTS trg_leaderboard_create_on_volunteer_register
AFTER INSERT ON civic_volunteers
BEGIN
  INSERT INTO civic_volunteer_leaderboards (
    id, electionId, tenantId, volunteerId, rank, totalPoints, totalHours,
    tasksCompleted, badgesEarned, streakDays, lastActivityAt, tier,
    achievements, createdAt, updatedAt
  ) VALUES (
    'leaderboard_' || NEW.id,
    NEW.electionId,
    NEW.tenantId,
    NEW.id,
    NULL,
    0,
    0,
    0,
    '[]',
    0,
    NEW.joinedAt,
    'bronze',
    '[]',
    NEW.createdAt,
    NEW.updatedAt
  );
END;

-- ─── Views for Common Queries ──────────────────────────────────────────────

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
FROM civic_volunteers v
LEFT JOIN civic_volunteer_assignments a ON v.id = a.volunteerId AND a.deletedAt IS NULL
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
FROM civic_volunteer_leaderboards l
JOIN civic_volunteers v ON l.volunteerId = v.id
WHERE l.deletedAt IS NULL AND v.deletedAt IS NULL
;

CREATE VIEW IF NOT EXISTS vw_task_assignments AS
SELECT 
  t.id as taskId,
  t.title,
  t.taskType,
  t.status as taskStatus,
  COUNT(a.id) as assignmentCount,
  SUM(CASE WHEN a.status = 'completed' THEN 1 ELSE 0 END) as completedCount,
  SUM(CASE WHEN a.status IN ('assigned', 'accepted', 'in_progress') THEN 1 ELSE 0 END) as activeCount
FROM civic_volunteer_tasks t
LEFT JOIN civic_volunteer_assignments a ON t.id = a.taskId AND a.deletedAt IS NULL
WHERE t.deletedAt IS NULL
GROUP BY t.id;

CREATE VIEW IF NOT EXISTS vw_volunteer_activity_log AS
SELECT 
  a.id,
  a.volunteerId,
  v.firstName,
  v.lastName,
  a.taskId,
  t.title as taskTitle,
  a.status,
  a.acceptedAt,
  a.startedAt,
  a.completedAt,
  a.hoursWorked,
  a.pointsEarned,
  a.rating
FROM civic_volunteer_assignments a
JOIN civic_volunteers v ON a.volunteerId = v.id
JOIN civic_volunteer_tasks t ON a.taskId = t.id
WHERE a.deletedAt IS NULL
ORDER BY a.completedAt DESC;

-- ─── Seed Data (Optional) ──────────────────────────────────────────────────

-- Note: Seed data would be added via application logic, not SQL migration
-- This ensures proper ID generation and event publishing

-- ─── Migration Metadata ────────────────────────────────────────────────────

-- Migration applied at: 2026-03-20T13:10:00Z
-- Tables created: 4 (civic_volunteers, civic_volunteer_tasks, civic_volunteer_assignments, civic_volunteer_leaderboards)
-- Indexes created: 11
-- Triggers created: 5
-- Views created: 4
-- Total objects: 20
