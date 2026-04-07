-- WebWaka Civic — CIV-3 Elections & Campaigns Migration
-- Blueprint Reference: Part 10.9 (Civic & Political Suite — Elections & Campaigns)
-- Blueprint Reference: Part 9.2 (Universal Architecture Standards)
-- Generated: 2026-03-20
-- Idempotent: All CREATE TABLE statements use IF NOT EXISTS

-- ─── Table 1: civc_elections ───────────────────────────────────────────────────
-- Root entity for elections/campaigns
CREATE TABLE IF NOT EXISTS civc_elections (
  id TEXT PRIMARY KEY,
  tenantId TEXT NOT NULL,
  name TEXT NOT NULL,
  electionType TEXT NOT NULL DEFAULT 'primary',
  position TEXT NOT NULL,
  nominationStartAt INTEGER NOT NULL,
  nominationEndAt INTEGER NOT NULL,
  votingStartAt INTEGER NOT NULL,
  votingEndAt INTEGER NOT NULL,
  resultAnnouncementAt INTEGER,
  status TEXT NOT NULL DEFAULT 'draft',
  createdAt INTEGER NOT NULL,
  updatedAt INTEGER NOT NULL,
  deletedAt INTEGER
);
CREATE INDEX IF NOT EXISTS idx_civc_elections_tenantId ON civc_elections(tenantId);
CREATE INDEX IF NOT EXISTS idx_civc_elections_status ON civc_elections(status);

-- ─── Table 2: civc_candidates ──────────────────────────────────────────────────
-- Candidates nominated for election
CREATE TABLE IF NOT EXISTS civc_candidates (
  id TEXT PRIMARY KEY,
  tenantId TEXT NOT NULL,
  electionId TEXT NOT NULL,
  memberId TEXT NOT NULL,
  name TEXT NOT NULL,
  bio TEXT,
  manifestoUrl TEXT,
  photoUrl TEXT,
  nominatedBy TEXT NOT NULL,
  nominationDate INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'nominated',
  voteCount INTEGER NOT NULL DEFAULT 0,
  createdAt INTEGER NOT NULL,
  updatedAt INTEGER NOT NULL,
  deletedAt INTEGER,
  FOREIGN KEY (electionId) REFERENCES civc_elections(id),
  FOREIGN KEY (memberId) REFERENCES civc_members(id)
);
CREATE INDEX IF NOT EXISTS idx_civc_candidates_tenantId ON civc_candidates(tenantId);
CREATE INDEX IF NOT EXISTS idx_civc_candidates_electionId ON civc_candidates(electionId);
CREATE INDEX IF NOT EXISTS idx_civc_candidates_memberId ON civc_candidates(memberId);
CREATE INDEX IF NOT EXISTS idx_civc_candidates_status ON civc_candidates(status);

-- ─── Table 3: civc_votes ──────────────────────────────────────────────────────
-- Individual votes cast in elections
CREATE TABLE IF NOT EXISTS civc_votes (
  id TEXT PRIMARY KEY,
  tenantId TEXT NOT NULL,
  electionId TEXT NOT NULL,
  voterId TEXT NOT NULL,
  candidateId TEXT NOT NULL,
  votingStationId TEXT,
  encryptedVote TEXT NOT NULL,
  verificationHash TEXT,
  castAt INTEGER NOT NULL,
  createdAt INTEGER NOT NULL,
  updatedAt INTEGER NOT NULL,
  deletedAt INTEGER,
  FOREIGN KEY (electionId) REFERENCES civc_elections(id),
  FOREIGN KEY (voterId) REFERENCES civc_members(id),
  FOREIGN KEY (candidateId) REFERENCES civc_candidates(id)
);
CREATE INDEX IF NOT EXISTS idx_civc_votes_tenantId ON civc_votes(tenantId);
CREATE INDEX IF NOT EXISTS idx_civc_votes_electionId ON civc_votes(electionId);
CREATE INDEX IF NOT EXISTS idx_civc_votes_voterId ON civc_votes(voterId);
CREATE INDEX IF NOT EXISTS idx_civc_votes_candidateId ON civc_votes(candidateId);
CREATE UNIQUE INDEX IF NOT EXISTS idx_civc_votes_unique_voter_election ON civc_votes(electionId, voterId) WHERE deletedAt IS NULL;

-- ─── Table 4: civc_voting_stations ────────────────────────────────────────────
-- Physical or virtual voting locations
CREATE TABLE IF NOT EXISTS civc_voting_stations (
  id TEXT PRIMARY KEY,
  tenantId TEXT NOT NULL,
  electionId TEXT NOT NULL,
  name TEXT NOT NULL,
  location TEXT NOT NULL,
  latitude REAL,
  longitude REAL,
  capacity INTEGER NOT NULL,
  votesCount INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active',
  createdAt INTEGER NOT NULL,
  updatedAt INTEGER NOT NULL,
  deletedAt INTEGER,
  FOREIGN KEY (electionId) REFERENCES civc_elections(id)
);
CREATE INDEX IF NOT EXISTS idx_civc_voting_stations_tenantId ON civc_voting_stations(tenantId);
CREATE INDEX IF NOT EXISTS idx_civc_voting_stations_electionId ON civc_voting_stations(electionId);
CREATE INDEX IF NOT EXISTS idx_civc_voting_stations_status ON civc_voting_stations(status);

-- ─── Table 5: civc_volunteers ─────────────────────────────────────────────────
-- Volunteers for election campaigns
CREATE TABLE IF NOT EXISTS civc_volunteers (
  id TEXT PRIMARY KEY,
  tenantId TEXT NOT NULL,
  memberId TEXT NOT NULL,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT NOT NULL,
  skills TEXT,
  availability TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  hoursLogged INTEGER NOT NULL DEFAULT 0,
  tasksCompleted INTEGER NOT NULL DEFAULT 0,
  points INTEGER NOT NULL DEFAULT 0,
  createdAt INTEGER NOT NULL,
  updatedAt INTEGER NOT NULL,
  deletedAt INTEGER,
  FOREIGN KEY (memberId) REFERENCES civc_members(id)
);
CREATE INDEX IF NOT EXISTS idx_civc_volunteers_tenantId ON civc_volunteers(tenantId);
CREATE INDEX IF NOT EXISTS idx_civc_volunteers_memberId ON civc_volunteers(memberId);
CREATE INDEX IF NOT EXISTS idx_civc_volunteers_status ON civc_volunteers(status);
CREATE INDEX IF NOT EXISTS idx_civc_volunteers_points ON civc_volunteers(points DESC);

-- ─── Table 6: civc_volunteer_tasks ────────────────────────────────────────────
-- Tasks assigned to volunteers
CREATE TABLE IF NOT EXISTS civc_volunteer_tasks (
  id TEXT PRIMARY KEY,
  tenantId TEXT NOT NULL,
  electionId TEXT NOT NULL,
  volunteerId TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  taskType TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'assigned',
  dueDate INTEGER,
  hoursEstimated INTEGER,
  hoursLogged INTEGER NOT NULL DEFAULT 0,
  completedAt INTEGER,
  feedback TEXT,
  rating INTEGER,
  createdAt INTEGER NOT NULL,
  updatedAt INTEGER NOT NULL,
  deletedAt INTEGER,
  FOREIGN KEY (electionId) REFERENCES civc_elections(id),
  FOREIGN KEY (volunteerId) REFERENCES civc_volunteers(id)
);
CREATE INDEX IF NOT EXISTS idx_civc_volunteer_tasks_tenantId ON civc_volunteer_tasks(tenantId);
CREATE INDEX IF NOT EXISTS idx_civc_volunteer_tasks_electionId ON civc_volunteer_tasks(electionId);
CREATE INDEX IF NOT EXISTS idx_civc_volunteer_tasks_volunteerId ON civc_volunteer_tasks(volunteerId);
CREATE INDEX IF NOT EXISTS idx_civc_volunteer_tasks_status ON civc_volunteer_tasks(status);

-- ─── Table 7: civc_campaign_donations ─────────────────────────────────────────
-- Donations to election campaigns (kobo integers)
CREATE TABLE IF NOT EXISTS civc_campaign_donations (
  id TEXT PRIMARY KEY,
  tenantId TEXT NOT NULL,
  electionId TEXT NOT NULL,
  donorId TEXT,
  amountKobo INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'NGN',
  paymentMethod TEXT NOT NULL,
  paymentRef TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  donorName TEXT NOT NULL,
  donorEmail TEXT,
  donorPhone TEXT,
  receiptUrl TEXT,
  ndprConsent BOOLEAN NOT NULL DEFAULT false,
  createdAt INTEGER NOT NULL,
  updatedAt INTEGER NOT NULL,
  deletedAt INTEGER,
  FOREIGN KEY (electionId) REFERENCES civc_elections(id),
  FOREIGN KEY (donorId) REFERENCES civc_members(id)
);
CREATE INDEX IF NOT EXISTS idx_civc_campaign_donations_tenantId ON civc_campaign_donations(tenantId);
CREATE INDEX IF NOT EXISTS idx_civc_campaign_donations_electionId ON civc_campaign_donations(electionId);
CREATE INDEX IF NOT EXISTS idx_civc_campaign_donations_donorId ON civc_campaign_donations(donorId);
CREATE INDEX IF NOT EXISTS idx_civc_campaign_donations_status ON civc_campaign_donations(status);

-- ─── Table 8: civc_campaign_expenses ───────────────────────────────────────────
-- Campaign expenses (kobo integers)
CREATE TABLE IF NOT EXISTS civc_campaign_expenses (
  id TEXT PRIMARY KEY,
  tenantId TEXT NOT NULL,
  electionId TEXT NOT NULL,
  category TEXT NOT NULL,
  description TEXT NOT NULL,
  amountKobo INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'NGN',
  expenseDate INTEGER NOT NULL,
  receipt TEXT,
  approvedBy TEXT,
  approvalStatus TEXT NOT NULL DEFAULT 'pending',
  createdAt INTEGER NOT NULL,
  updatedAt INTEGER NOT NULL,
  deletedAt INTEGER,
  FOREIGN KEY (electionId) REFERENCES civc_elections(id)
);
CREATE INDEX IF NOT EXISTS idx_civc_campaign_expenses_tenantId ON civc_campaign_expenses(tenantId);
CREATE INDEX IF NOT EXISTS idx_civc_campaign_expenses_electionId ON civc_campaign_expenses(electionId);
CREATE INDEX IF NOT EXISTS idx_civc_campaign_expenses_approvalStatus ON civc_campaign_expenses(approvalStatus);

-- ─── Table 9: civc_campaign_materials ──────────────────────────────────────────
-- Campaign materials (posters, videos, documents, etc.)
CREATE TABLE IF NOT EXISTS civc_campaign_materials (
  id TEXT PRIMARY KEY,
  tenantId TEXT NOT NULL,
  electionId TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  materialType TEXT NOT NULL,
  contentUrl TEXT NOT NULL,
  thumbnailUrl TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  approvedBy TEXT,
  publishedAt INTEGER,
  viewCount INTEGER NOT NULL DEFAULT 0,
  shareCount INTEGER NOT NULL DEFAULT 0,
  createdAt INTEGER NOT NULL,
  updatedAt INTEGER NOT NULL,
  deletedAt INTEGER,
  FOREIGN KEY (electionId) REFERENCES civc_elections(id)
);
CREATE INDEX IF NOT EXISTS idx_civc_campaign_materials_tenantId ON civc_campaign_materials(tenantId);
CREATE INDEX IF NOT EXISTS idx_civc_campaign_materials_electionId ON civc_campaign_materials(electionId);
CREATE INDEX IF NOT EXISTS idx_civc_campaign_materials_status ON civc_campaign_materials(status);

-- ─── Table 10: civc_campaign_announcements ────────────────────────────────────
-- Campaign announcements and updates
CREATE TABLE IF NOT EXISTS civc_campaign_announcements (
  id TEXT PRIMARY KEY,
  tenantId TEXT NOT NULL,
  electionId TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  announcementType TEXT NOT NULL,
  priority TEXT NOT NULL DEFAULT 'normal',
  targetAudience TEXT NOT NULL,
  publishedAt INTEGER NOT NULL,
  createdAt INTEGER NOT NULL,
  updatedAt INTEGER NOT NULL,
  deletedAt INTEGER,
  FOREIGN KEY (electionId) REFERENCES civc_elections(id)
);
CREATE INDEX IF NOT EXISTS idx_civc_campaign_announcements_tenantId ON civc_campaign_announcements(tenantId);
CREATE INDEX IF NOT EXISTS idx_civc_campaign_announcements_electionId ON civc_campaign_announcements(electionId);
CREATE INDEX IF NOT EXISTS idx_civc_campaign_announcements_priority ON civc_campaign_announcements(priority);

-- ─── Table 11: civc_election_results ───────────────────────────────────────────
-- Final election results
CREATE TABLE IF NOT EXISTS civc_election_results (
  id TEXT PRIMARY KEY,
  tenantId TEXT NOT NULL,
  electionId TEXT NOT NULL,
  candidateId TEXT NOT NULL,
  totalVotes INTEGER NOT NULL,
  percentage REAL NOT NULL,
  rank INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'final',
  announcedAt INTEGER,
  createdAt INTEGER NOT NULL,
  updatedAt INTEGER NOT NULL,
  deletedAt INTEGER,
  FOREIGN KEY (electionId) REFERENCES civc_elections(id),
  FOREIGN KEY (candidateId) REFERENCES civc_candidates(id)
);
CREATE INDEX IF NOT EXISTS idx_civc_election_results_tenantId ON civc_election_results(tenantId);
CREATE INDEX IF NOT EXISTS idx_civc_election_results_electionId ON civc_election_results(electionId);
CREATE INDEX IF NOT EXISTS idx_civc_election_results_candidateId ON civc_election_results(candidateId);

-- ─── Table 12: civc_volunteer_messages ─────────────────────────────────────────
-- In-app messaging for volunteers
CREATE TABLE IF NOT EXISTS civc_volunteer_messages (
  id TEXT PRIMARY KEY,
  tenantId TEXT NOT NULL,
  electionId TEXT NOT NULL,
  senderId TEXT NOT NULL,
  recipientId TEXT NOT NULL,
  content TEXT NOT NULL,
  messageType TEXT NOT NULL DEFAULT 'text',
  readAt INTEGER,
  createdAt INTEGER NOT NULL,
  updatedAt INTEGER NOT NULL,
  deletedAt INTEGER,
  FOREIGN KEY (electionId) REFERENCES civc_elections(id),
  FOREIGN KEY (senderId) REFERENCES civc_members(id),
  FOREIGN KEY (recipientId) REFERENCES civc_members(id)
);
CREATE INDEX IF NOT EXISTS idx_civc_volunteer_messages_tenantId ON civc_volunteer_messages(tenantId);
CREATE INDEX IF NOT EXISTS idx_civc_volunteer_messages_electionId ON civc_volunteer_messages(electionId);
CREATE INDEX IF NOT EXISTS idx_civc_volunteer_messages_recipientId ON civc_volunteer_messages(recipientId);
CREATE INDEX IF NOT EXISTS idx_civc_volunteer_messages_readAt ON civc_volunteer_messages(readAt);

-- ─── Table 13: civc_election_audit_logs ────────────────────────────────────────
-- Audit trail for all election activities
CREATE TABLE IF NOT EXISTS civc_election_audit_logs (
  id TEXT PRIMARY KEY,
  tenantId TEXT NOT NULL,
  electionId TEXT NOT NULL,
  actionType TEXT NOT NULL,
  actorId TEXT,
  actorRole TEXT,
  details TEXT,
  ipAddress TEXT,
  createdAt INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_civc_election_audit_logs_tenantId ON civc_election_audit_logs(tenantId);
CREATE INDEX IF NOT EXISTS idx_civc_election_audit_logs_electionId ON civc_election_audit_logs(electionId);
CREATE INDEX IF NOT EXISTS idx_civc_election_audit_logs_actionType ON civc_election_audit_logs(actionType);
CREATE INDEX IF NOT EXISTS idx_civc_election_audit_logs_createdAt ON civc_election_audit_logs(createdAt DESC);
