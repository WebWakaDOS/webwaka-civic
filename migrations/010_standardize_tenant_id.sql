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

-- ─── civic_elections ──────────────────────────────────────────────────────────
ALTER TABLE civic_elections ADD COLUMN tenant_id TEXT GENERATED ALWAYS AS (tenantId) VIRTUAL;
CREATE INDEX IF NOT EXISTS idx_civic_elections_tenant_id ON civic_elections(tenant_id);

-- ─── civic_candidates ─────────────────────────────────────────────────────────
ALTER TABLE civic_candidates ADD COLUMN tenant_id TEXT GENERATED ALWAYS AS (tenantId) VIRTUAL;
CREATE INDEX IF NOT EXISTS idx_civic_candidates_tenant_id ON civic_candidates(tenant_id);

-- ─── civic_votes ──────────────────────────────────────────────────────────────
ALTER TABLE civic_votes ADD COLUMN tenant_id TEXT GENERATED ALWAYS AS (tenantId) VIRTUAL;
CREATE INDEX IF NOT EXISTS idx_civic_votes_tenant_id ON civic_votes(tenant_id);

-- ─── civic_voting_stations ────────────────────────────────────────────────────
ALTER TABLE civic_voting_stations ADD COLUMN tenant_id TEXT GENERATED ALWAYS AS (tenantId) VIRTUAL;
CREATE INDEX IF NOT EXISTS idx_civic_voting_stations_tenant_id ON civic_voting_stations(tenant_id);

-- ─── civic_volunteers ─────────────────────────────────────────────────────────
ALTER TABLE civic_volunteers ADD COLUMN tenant_id TEXT GENERATED ALWAYS AS (tenantId) VIRTUAL;
CREATE INDEX IF NOT EXISTS idx_civic_volunteers_tenant_id ON civic_volunteers(tenant_id);

-- ─── civic_voter_sessions ─────────────────────────────────────────────────────
ALTER TABLE civic_voter_sessions ADD COLUMN tenant_id TEXT GENERATED ALWAYS AS (tenantId) VIRTUAL;
CREATE INDEX IF NOT EXISTS idx_civic_voter_sessions_tenant_id ON civic_voter_sessions(tenant_id);

-- ─── civic_ballots ────────────────────────────────────────────────────────────
ALTER TABLE civic_ballots ADD COLUMN tenant_id TEXT GENERATED ALWAYS AS (tenantId) VIRTUAL;
CREATE INDEX IF NOT EXISTS idx_civic_ballots_tenant_id ON civic_ballots(tenant_id);

-- ─── civic_vote_queue ─────────────────────────────────────────────────────────
ALTER TABLE civic_vote_queue ADD COLUMN tenant_id TEXT GENERATED ALWAYS AS (tenantId) VIRTUAL;
CREATE INDEX IF NOT EXISTS idx_civic_vote_queue_tenant_id ON civic_vote_queue(tenant_id);

-- ─── civic_vote_tallies ───────────────────────────────────────────────────────
ALTER TABLE civic_vote_tallies ADD COLUMN tenant_id TEXT GENERATED ALWAYS AS (tenantId) VIRTUAL;
CREATE INDEX IF NOT EXISTS idx_civic_vote_tallies_tenant_id ON civic_vote_tallies(tenant_id);

-- ─── civic_election_results ───────────────────────────────────────────────────
ALTER TABLE civic_election_results ADD COLUMN tenant_id TEXT GENERATED ALWAYS AS (tenantId) VIRTUAL;
CREATE INDEX IF NOT EXISTS idx_civic_election_results_tenant_id ON civic_election_results(tenant_id);

-- ─── civic_election_audit_logs ────────────────────────────────────────────────
ALTER TABLE civic_election_audit_logs ADD COLUMN tenant_id TEXT GENERATED ALWAYS AS (tenantId) VIRTUAL;
CREATE INDEX IF NOT EXISTS idx_civic_election_audit_logs_tenant_id ON civic_election_audit_logs(tenant_id);

-- ─── civic_voting_statistics ──────────────────────────────────────────────────
ALTER TABLE civic_voting_statistics ADD COLUMN tenant_id TEXT GENERATED ALWAYS AS (tenantId) VIRTUAL;
CREATE INDEX IF NOT EXISTS idx_civic_voting_statistics_tenant_id ON civic_voting_statistics(tenant_id);

-- ─── civic_volunteer_tasks ────────────────────────────────────────────────────
ALTER TABLE civic_volunteer_tasks ADD COLUMN tenant_id TEXT GENERATED ALWAYS AS (tenantId) VIRTUAL;
CREATE INDEX IF NOT EXISTS idx_civic_volunteer_tasks_tenant_id ON civic_volunteer_tasks(tenant_id);

-- ─── civic_volunteer_assignments ──────────────────────────────────────────────
ALTER TABLE civic_volunteer_assignments ADD COLUMN tenant_id TEXT GENERATED ALWAYS AS (tenantId) VIRTUAL;
CREATE INDEX IF NOT EXISTS idx_civic_volunteer_assignments_tenant_id ON civic_volunteer_assignments(tenant_id);

-- ─── civic_volunteer_messages ─────────────────────────────────────────────────
ALTER TABLE civic_volunteer_messages ADD COLUMN tenant_id TEXT GENERATED ALWAYS AS (tenantId) VIRTUAL;
CREATE INDEX IF NOT EXISTS idx_civic_volunteer_messages_tenant_id ON civic_volunteer_messages(tenant_id);

-- ─── civic_volunteer_leaderboards ─────────────────────────────────────────────
ALTER TABLE civic_volunteer_leaderboards ADD COLUMN tenant_id TEXT GENERATED ALWAYS AS (tenantId) VIRTUAL;
CREATE INDEX IF NOT EXISTS idx_civic_volunteer_leaderboards_tenant_id ON civic_volunteer_leaderboards(tenant_id);

-- ─── civic_campaign_donations ─────────────────────────────────────────────────
ALTER TABLE civic_campaign_donations ADD COLUMN tenant_id TEXT GENERATED ALWAYS AS (tenantId) VIRTUAL;
CREATE INDEX IF NOT EXISTS idx_civic_campaign_donations_tenant_id ON civic_campaign_donations(tenant_id);

-- ─── civic_campaign_expenses ──────────────────────────────────────────────────
ALTER TABLE civic_campaign_expenses ADD COLUMN tenant_id TEXT GENERATED ALWAYS AS (tenantId) VIRTUAL;
CREATE INDEX IF NOT EXISTS idx_civic_campaign_expenses_tenant_id ON civic_campaign_expenses(tenant_id);

-- ─── civic_campaign_budget ────────────────────────────────────────────────────
ALTER TABLE civic_campaign_budget ADD COLUMN tenant_id TEXT GENERATED ALWAYS AS (tenantId) VIRTUAL;
CREATE INDEX IF NOT EXISTS idx_civic_campaign_budget_tenant_id ON civic_campaign_budget(tenant_id);

-- ─── civic_campaign_announcements ─────────────────────────────────────────────
ALTER TABLE civic_campaign_announcements ADD COLUMN tenant_id TEXT GENERATED ALWAYS AS (tenantId) VIRTUAL;
CREATE INDEX IF NOT EXISTS idx_civic_campaign_announcements_tenant_id ON civic_campaign_announcements(tenant_id);

-- ─── civic_campaign_materials ─────────────────────────────────────────────────
ALTER TABLE civic_campaign_materials ADD COLUMN tenant_id TEXT GENERATED ALWAYS AS (tenantId) VIRTUAL;
CREATE INDEX IF NOT EXISTS idx_civic_campaign_materials_tenant_id ON civic_campaign_materials(tenant_id);
