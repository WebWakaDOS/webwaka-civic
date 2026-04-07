-- Migration 009a: Add missing columns to campaign tables upgraded from 006 schema
--
-- When a DB was bootstrapped with 006_civ3_elections.sql, civc_campaign_donations
-- and civc_campaign_expenses have a minimal schema. Migration 009 expects an
-- extended schema with more columns. This script adds all missing columns so
-- 009's CREATE INDEX and TRIGGER statements succeed.
--
-- Idempotent: Each statement run individually with || true in deploy.yml.
--             D1 has no ADD COLUMN IF NOT EXISTS, so failures are swallowed.
-- Run: DIRECTLY (not via wrangler migrations apply tracker).

-- ── civc_campaign_donations extra columns (006 → 009) ──────────────────────
ALTER TABLE civc_campaign_donations ADD COLUMN campaignId TEXT;
ALTER TABLE civc_campaign_donations ADD COLUMN amount INTEGER;
ALTER TABLE civc_campaign_donations ADD COLUMN anonymous BOOLEAN DEFAULT 0;
ALTER TABLE civc_campaign_donations ADD COLUMN dataProcessingConsent BOOLEAN DEFAULT 0;
ALTER TABLE civc_campaign_donations ADD COLUMN donorAddress TEXT;
ALTER TABLE civc_campaign_donations ADD COLUMN notes TEXT;
ALTER TABLE civc_campaign_donations ADD COLUMN paymentReference TEXT;
ALTER TABLE civc_campaign_donations ADD COLUMN refundAmount INTEGER;
ALTER TABLE civc_campaign_donations ADD COLUMN refundReason TEXT;
ALTER TABLE civc_campaign_donations ADD COLUMN refundedAt INTEGER;
ALTER TABLE civc_campaign_donations ADD COLUMN taxDeductible BOOLEAN DEFAULT 0;
ALTER TABLE civc_campaign_donations ADD COLUMN transactionId TEXT;

-- ── civc_campaign_expenses extra columns (006 → 009) ───────────────────────
ALTER TABLE civc_campaign_expenses ADD COLUMN campaignId TEXT;
ALTER TABLE civc_campaign_expenses ADD COLUMN amount INTEGER;
ALTER TABLE civc_campaign_expenses ADD COLUMN approvedAt INTEGER;
ALTER TABLE civc_campaign_expenses ADD COLUMN invoiceNumber TEXT;
ALTER TABLE civc_campaign_expenses ADD COLUMN invoiceUrl TEXT;
ALTER TABLE civc_campaign_expenses ADD COLUMN notes TEXT;
ALTER TABLE civc_campaign_expenses ADD COLUMN paidAt INTEGER;
ALTER TABLE civc_campaign_expenses ADD COLUMN paymentMethod TEXT;
ALTER TABLE civc_campaign_expenses ADD COLUMN paymentReference TEXT;
ALTER TABLE civc_campaign_expenses ADD COLUMN receiptUrl TEXT;
ALTER TABLE civc_campaign_expenses ADD COLUMN rejectionReason TEXT;
ALTER TABLE civc_campaign_expenses ADD COLUMN status TEXT DEFAULT 'pending';
ALTER TABLE civc_campaign_expenses ADD COLUMN vendor TEXT;
ALTER TABLE civc_campaign_expenses ADD COLUMN vendorEmail TEXT;
ALTER TABLE civc_campaign_expenses ADD COLUMN vendorPhone TEXT;
