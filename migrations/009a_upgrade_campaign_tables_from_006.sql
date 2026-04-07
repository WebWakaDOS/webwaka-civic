-- Migration 009a: Add missing columns to campaign tables upgraded from 006 schema
-- 
-- When a DB was created with 006_civ3_elections.sql, civc_campaign_donations and
-- civc_campaign_expenses have a minimal schema. Migration 009 expects an extended schema.
-- This migration adds the missing columns so 009's indexes and triggers work correctly.
--
-- Idempotent: YES — ALTER TABLE ADD COLUMN fails silently if column already exists (via || true)
-- This file is run DIRECTLY (not via migration tracker) in the deploy workflow bootstrap step.

-- ── civc_campaign_donations ─────────────────────────────────────────────────
ALTER TABLE civc_campaign_donations ADD COLUMN campaignId TEXT;
ALTER TABLE civc_campaign_donations ADD COLUMN donorAddress TEXT;
ALTER TABLE civc_campaign_donations ADD COLUMN amount INTEGER;
ALTER TABLE civc_campaign_donations ADD COLUMN paymentReference TEXT;
ALTER TABLE civc_campaign_donations ADD COLUMN transactionId TEXT;
ALTER TABLE civc_campaign_donations ADD COLUMN dataProcessingConsent BOOLEAN DEFAULT 0;
ALTER TABLE civc_campaign_donations ADD COLUMN taxDeductible BOOLEAN DEFAULT 0;
ALTER TABLE civc_campaign_donations ADD COLUMN anonymous BOOLEAN DEFAULT 0;
ALTER TABLE civc_campaign_donations ADD COLUMN notes TEXT;
ALTER TABLE civc_campaign_donations ADD COLUMN refundedAt INTEGER;
ALTER TABLE civc_campaign_donations ADD COLUMN refundReason TEXT;
ALTER TABLE civc_campaign_donations ADD COLUMN refundAmount INTEGER;

-- ── civc_campaign_expenses ──────────────────────────────────────────────────
ALTER TABLE civc_campaign_expenses ADD COLUMN campaignId TEXT;
ALTER TABLE civc_campaign_expenses ADD COLUMN vendor TEXT;
ALTER TABLE civc_campaign_expenses ADD COLUMN vendorEmail TEXT;
ALTER TABLE civc_campaign_expenses ADD COLUMN vendorPhone TEXT;
ALTER TABLE civc_campaign_expenses ADD COLUMN invoiceNumber TEXT;
ALTER TABLE civc_campaign_expenses ADD COLUMN invoiceUrl TEXT;
ALTER TABLE civc_campaign_expenses ADD COLUMN receiptUrl TEXT;
ALTER TABLE civc_campaign_expenses ADD COLUMN amount INTEGER;
ALTER TABLE civc_campaign_expenses ADD COLUMN approvedAt INTEGER;
ALTER TABLE civc_campaign_expenses ADD COLUMN rejectionReason TEXT;
ALTER TABLE civc_campaign_expenses ADD COLUMN paidAt INTEGER;
ALTER TABLE civc_campaign_expenses ADD COLUMN paymentMethod TEXT;
ALTER TABLE civc_campaign_expenses ADD COLUMN paymentReference TEXT;
ALTER TABLE civc_campaign_expenses ADD COLUMN notes TEXT;
