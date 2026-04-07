-- Migration 010: Standardize tenant_id naming convention
-- 
-- Platform standard (Part 9.2): ALL tables MUST use snake_case tenant_id column.
-- Previous migrations 006-009 used camelCase tenantId in SQL column names.
-- This migration adds snake_case tenant_id columns as generated columns (aliases)
-- and adds canonical snake_case indexes for all civic tables.
--
-- NOTE: SQLite does not support renaming columns directly in older versions.
-- We use generated columns (AS expressions) to provide the canonical tenant_id
-- alias while keeping backward compatibility with existing tenantId references.
-- New code MUST use tenant_id; tenantId columns are deprecated.
--
-- Applied: 2026-04-01
-- Remediation: Issue #5 from Integration Audit Report 2026-04-01
-- Blueprint Reference: Part 9.2 (Multi-Tenancy — tenant_id on ALL tables)

-- ─── civc_elections ──────────────────────────────────────────────────────────
ALTER TABLE civc_elections ADD COLUMN tenant_id TEXT GENERATED ALWAYS AS (tenantId) VIRTUAL;
CREATE INDEX IF NOT EXISTS idx_civc_elections_tenant_id ON civc_elections(tenant_id);

-- ─── civc_candidates ─────────────────────────────────────────────────────────
ALTER TABLE civc_candidates ADD COLUMN tenant_id TEXT GENERATED ALWAYS AS (tenantId) VIRTUAL;
CREATE INDEX IF NOT EXISTS idx_civc_candidates_tenant_id ON civc_candidates(tenant_id);

-- ─── civc_votes ──────────────────────────────────────────────────────────────
ALTER TABLE civc_votes ADD COLUMN tenant_id TEXT GENERATED ALWAYS AS (tenantId) VIRTUAL;
CREATE INDEX IF NOT EXISTS idx_civc_votes_tenant_id ON civc_votes(tenant_id);

-- ─── civc_voting_stations ────────────────────────────────────────────────────
ALTER TABLE civc_voting_stations ADD COLUMN tenant_id TEXT GENERATED ALWAYS AS (tenantId) VIRTUAL;
CREATE INDEX IF NOT EXISTS idx_civc_voting_stations_tenant_id ON civc_voting_stations(tenant_id);

-- ─── civc_volunteers ─────────────────────────────────────────────────────────
ALTER TABLE civc_volunteers ADD COLUMN tenant_id TEXT GENERATED ALWAYS AS (tenantId) VIRTUAL;
CREATE INDEX IF NOT EXISTS idx_civc_volunteers_tenant_id ON civc_volunteers(tenant_id);

-- ─── civc_voter_sessions ─────────────────────────────────────────────────────
ALTER TABLE civc_voter_sessions ADD COLUMN tenant_id TEXT GENERATED ALWAYS AS (tenantId) VIRTUAL;
CREATE INDEX IF NOT EXISTS idx_civc_voter_sessions_tenant_id ON civc_voter_sessions(tenant_id);

-- ─── civc_ballots ────────────────────────────────────────────────────────────
ALTER TABLE civc_ballots ADD COLUMN tenant_id TEXT GENERATED ALWAYS AS (tenantId) VIRTUAL;
CREATE INDEX IF NOT EXISTS idx_civc_ballots_tenant_id ON civc_ballots(tenant_id);

-- ─── civc_vote_queue ─────────────────────────────────────────────────────────
ALTER TABLE civc_vote_queue ADD COLUMN tenant_id TEXT GENERATED ALWAYS AS (tenantId) VIRTUAL;
CREATE INDEX IF NOT EXISTS idx_civc_vote_queue_tenant_id ON civc_vote_queue(tenant_id);

-- ─── civc_vote_tallies ───────────────────────────────────────────────────────
ALTER TABLE civc_vote_tallies ADD COLUMN tenant_id TEXT GENERATED ALWAYS AS (tenantId) VIRTUAL;
CREATE INDEX IF NOT EXISTS idx_civc_vote_tallies_tenant_id ON civc_vote_tallies(tenant_id);

-- ─── civc_election_results ───────────────────────────────────────────────────
ALTER TABLE civc_election_results ADD COLUMN tenant_id TEXT GENERATED ALWAYS AS (tenantId) VIRTUAL;
CREATE INDEX IF NOT EXISTS idx_civc_election_results_tenant_id ON civc_election_results(tenant_id);

-- ─── civc_election_audit_logs ────────────────────────────────────────────────
ALTER TABLE civc_election_audit_logs ADD COLUMN tenant_id TEXT GENERATED ALWAYS AS (tenantId) VIRTUAL;
CREATE INDEX IF NOT EXISTS idx_civc_election_audit_logs_tenant_id ON civc_election_audit_logs(tenant_id);

-- ─── civc_voting_statistics ──────────────────────────────────────────────────
ALTER TABLE civc_voting_statistics ADD COLUMN tenant_id TEXT GENERATED ALWAYS AS (tenantId) VIRTUAL;
CREATE INDEX IF NOT EXISTS idx_civc_voting_statistics_tenant_id ON civc_voting_statistics(tenant_id);

-- ─── civc_volunteer_tasks ────────────────────────────────────────────────────
ALTER TABLE civc_volunteer_tasks ADD COLUMN tenant_id TEXT GENERATED ALWAYS AS (tenantId) VIRTUAL;
CREATE INDEX IF NOT EXISTS idx_civc_volunteer_tasks_tenant_id ON civc_volunteer_tasks(tenant_id);

-- ─── civc_volunteer_assignments ──────────────────────────────────────────────
ALTER TABLE civc_volunteer_assignments ADD COLUMN tenant_id TEXT GENERATED ALWAYS AS (tenantId) VIRTUAL;
CREATE INDEX IF NOT EXISTS idx_civc_volunteer_assignments_tenant_id ON civc_volunteer_assignments(tenant_id);

-- ─── civc_volunteer_messages ─────────────────────────────────────────────────
ALTER TABLE civc_volunteer_messages ADD COLUMN tenant_id TEXT GENERATED ALWAYS AS (tenantId) VIRTUAL;
CREATE INDEX IF NOT EXISTS idx_civc_volunteer_messages_tenant_id ON civc_volunteer_messages(tenant_id);

-- ─── civc_volunteer_leaderboards ─────────────────────────────────────────────
ALTER TABLE civc_volunteer_leaderboards ADD COLUMN tenant_id TEXT GENERATED ALWAYS AS (tenantId) VIRTUAL;
CREATE INDEX IF NOT EXISTS idx_civc_volunteer_leaderboards_tenant_id ON civc_volunteer_leaderboards(tenant_id);

-- ─── civc_campaign_donations ─────────────────────────────────────────────────
ALTER TABLE civc_campaign_donations ADD COLUMN tenant_id TEXT GENERATED ALWAYS AS (tenantId) VIRTUAL;
CREATE INDEX IF NOT EXISTS idx_civc_campaign_donations_tenant_id ON civc_campaign_donations(tenant_id);

-- ─── civc_campaign_expenses ──────────────────────────────────────────────────
ALTER TABLE civc_campaign_expenses ADD COLUMN tenant_id TEXT GENERATED ALWAYS AS (tenantId) VIRTUAL;
CREATE INDEX IF NOT EXISTS idx_civc_campaign_expenses_tenant_id ON civc_campaign_expenses(tenant_id);

-- ─── civc_campaign_budget ────────────────────────────────────────────────────
ALTER TABLE civc_campaign_budget ADD COLUMN tenant_id TEXT GENERATED ALWAYS AS (tenantId) VIRTUAL;
CREATE INDEX IF NOT EXISTS idx_civc_campaign_budget_tenant_id ON civc_campaign_budget(tenant_id);

-- ─── civc_campaign_announcements ─────────────────────────────────────────────
ALTER TABLE civc_campaign_announcements ADD COLUMN tenant_id TEXT GENERATED ALWAYS AS (tenantId) VIRTUAL;
CREATE INDEX IF NOT EXISTS idx_civc_campaign_announcements_tenant_id ON civc_campaign_announcements(tenant_id);

-- ─── civc_campaign_materials ─────────────────────────────────────────────────
ALTER TABLE civc_campaign_materials ADD COLUMN tenant_id TEXT GENERATED ALWAYS AS (tenantId) VIRTUAL;
CREATE INDEX IF NOT EXISTS idx_civc_campaign_materials_tenant_id ON civc_campaign_materials(tenant_id);
