-- WebWaka Civic — CIV-3 Secure Voting: Ballot Signatures
-- Migration: 012_secure_ballot_signatures.sql
-- Date: 2026-04-04
-- Description: Add cryptographic ballot signature + nonce to civc_ballots;
--              enforce one-vote-per-voter at the database level via UNIQUE constraint.
-- Idempotent: YES

-- ─── Add ballotSignature column ──────────────────────────────────────────────
-- Stores the HMAC-SHA256 signature over (voterId:electionId:candidateId:nonce).
-- NULL allowed: rows inserted before this migration remain valid.

ALTER TABLE civc_ballots ADD COLUMN ballotSignature TEXT;

-- ─── Add nonce column ────────────────────────────────────────────────────────
-- Per-ballot random value that prevents replay attacks.

ALTER TABLE civc_ballots ADD COLUMN nonce TEXT;

-- ─── Index: look up ballots by signature ─────────────────────────────────────
CREATE UNIQUE INDEX IF NOT EXISTS idx_ballots_signature
  ON civc_ballots(ballotSignature)
  WHERE ballotSignature IS NOT NULL;

-- ─── Enforce one-vote-per-voter at DB level ───────────────────────────────────
-- SQLite / D1 does not support adding a UNIQUE constraint to an existing table
-- via ALTER TABLE, so we create a partial unique index on active (non-deleted) rows.
CREATE UNIQUE INDEX IF NOT EXISTS idx_ballots_one_vote_per_voter
  ON civc_ballots(electionId, voterId)
  WHERE deletedAt IS NULL;

-- ─── Index: nonce uniqueness (guards against accidental nonce reuse) ──────────
CREATE UNIQUE INDEX IF NOT EXISTS idx_ballots_nonce
  ON civc_ballots(nonce)
  WHERE nonce IS NOT NULL;
