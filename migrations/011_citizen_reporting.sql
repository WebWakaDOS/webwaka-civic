-- WebWaka Civic — Citizen Reporting Portal
-- Migration: 011_citizen_reporting.sql
-- Purpose: Create citizen_reports table with AI triage columns
-- Phase 1: Citizen Engagement (Plan section 4)
-- Idempotent: Yes (all CREATE TABLE/INDEX IF NOT EXISTS)
-- Rollback: Not supported in D1 (manual cleanup required)

-- ─── Table: citizen_reports ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS citizen_reports (
  id           TEXT    PRIMARY KEY,
  tenantId     TEXT    NOT NULL,
  userId       TEXT    NOT NULL,              -- JWT sub of the reporting citizen

  -- What the citizen says --
  description  TEXT    NOT NULL,
  userCategory TEXT,                          -- optional user-supplied hint
  lat          REAL,                          -- geotagged latitude  (-90 … 90)
  lng          REAL,                          -- geotagged longitude (-180 … 180)
  address      TEXT,                          -- human-readable reverse-geocoded address
  imageUrl     TEXT,                          -- uploaded photo URL (R2 / CDN)

  -- AI triage (Phase 2: AI Issue Triage) --
  aiCategory       TEXT,                      -- AI-determined canonical category
  aiConfidence     REAL,                      -- 0.0 – 1.0 confidence score
  aiNotes          TEXT,                      -- AI reasoning / one-line summary
  aiTriagedAt      INTEGER,                   -- Unix ms when AI ran

  -- Lifecycle --
  status             TEXT    NOT NULL DEFAULT 'open',   -- open | in_progress | resolved | closed
  priority           TEXT    NOT NULL DEFAULT 'medium', -- low | medium | high | urgent
  assignedDepartment TEXT,                    -- department/agency responsible
  resolvedAt         INTEGER,                 -- Unix ms when status → resolved/closed
  resolutionNotes    TEXT,

  -- Audit --
  deletedAt  INTEGER,
  createdAt  INTEGER NOT NULL,
  updatedAt  INTEGER NOT NULL
);

-- ─── Indexes ─────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_citizen_reports_tenant_status
  ON citizen_reports (tenantId, status);

CREATE INDEX IF NOT EXISTS idx_citizen_reports_tenant_user
  ON citizen_reports (tenantId, userId);

CREATE INDEX IF NOT EXISTS idx_citizen_reports_ai_category
  ON citizen_reports (tenantId, aiCategory);

CREATE INDEX IF NOT EXISTS idx_citizen_reports_priority
  ON citizen_reports (tenantId, priority, status);

CREATE INDEX IF NOT EXISTS idx_citizen_reports_created
  ON citizen_reports (tenantId, createdAt DESC);

CREATE INDEX IF NOT EXISTS idx_citizen_reports_department
  ON citizen_reports (tenantId, assignedDepartment, status);

-- ─── Migration Metadata ───────────────────────────────────────────────────────
-- Applied at: 2026-04-04T00:00:00Z
-- Tables  created: 1 (citizen_reports)
-- Indexes created: 6
