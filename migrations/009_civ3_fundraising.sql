-- WebWaka Civic — CIV-3 Phase 4: Campaign Fundraising & Expense Tracking
-- Migration: 009_civ3_fundraising.sql
-- Purpose: Create fundraising, expense tracking, and budget management tables
-- Idempotent: Yes (all CREATE TABLE IF NOT EXISTS)
-- Rollback: Not supported in D1 (manual cleanup required)

-- ─── Table 1: civic_campaign_donations ──────────────────────────────────────

CREATE TABLE IF NOT EXISTS civic_campaign_donations (
  id TEXT PRIMARY KEY,
  electionId TEXT NOT NULL,
  campaignId TEXT,
  tenantId TEXT NOT NULL,
  donorId TEXT NOT NULL,
  donorName TEXT NOT NULL,
  donorEmail TEXT,
  donorPhone TEXT,
  donorAddress TEXT,
  amount INTEGER NOT NULL, -- kobo/cents
  currency TEXT NOT NULL DEFAULT 'NGN',
  paymentMethod TEXT NOT NULL, -- paystack, flutterwave, bank_transfer, cash
  paymentReference TEXT,
  transactionId TEXT,
  status TEXT NOT NULL DEFAULT 'pending', -- pending, completed, failed, refunded
  receiptUrl TEXT,
  ndprConsent BOOLEAN NOT NULL DEFAULT 0,
  dataProcessingConsent BOOLEAN NOT NULL DEFAULT 0,
  taxDeductible BOOLEAN DEFAULT 0,
  anonymous BOOLEAN DEFAULT 0,
  notes TEXT,
  refundedAt INTEGER,
  refundReason TEXT,
  refundAmount INTEGER,
  deletedAt INTEGER,
  createdAt INTEGER NOT NULL,
  updatedAt INTEGER NOT NULL,
  
  FOREIGN KEY(electionId) REFERENCES civic_elections(id)
);

CREATE INDEX IF NOT EXISTS idx_civic_donations_election_status 
  ON civic_campaign_donations(electionId, status);

CREATE INDEX IF NOT EXISTS idx_civic_donations_campaign 
  ON civic_campaign_donations(campaignId);

CREATE INDEX IF NOT EXISTS idx_civic_donations_donor_email 
  ON civic_campaign_donations(donorEmail);

CREATE INDEX IF NOT EXISTS idx_civic_donations_payment_ref 
  ON civic_campaign_donations(paymentReference);

CREATE INDEX IF NOT EXISTS idx_civic_donations_tenant 
  ON civic_campaign_donations(tenantId, id);

-- ─── Table 2: civic_campaign_expenses ───────────────────────────────────────

CREATE TABLE IF NOT EXISTS civic_campaign_expenses (
  id TEXT PRIMARY KEY,
  electionId TEXT NOT NULL,
  campaignId TEXT,
  tenantId TEXT NOT NULL,
  category TEXT NOT NULL, -- advertising, events, staff, materials, travel, other
  description TEXT NOT NULL,
  amount INTEGER NOT NULL, -- kobo/cents
  currency TEXT NOT NULL DEFAULT 'NGN',
  vendor TEXT,
  vendorEmail TEXT,
  vendorPhone TEXT,
  invoiceNumber TEXT,
  invoiceUrl TEXT,
  receiptUrl TEXT,
  status TEXT NOT NULL DEFAULT 'pending', -- pending, approved, rejected, paid
  approvedBy TEXT,
  approvedAt INTEGER,
  rejectionReason TEXT,
  paidAt INTEGER,
  paymentMethod TEXT, -- bank_transfer, cash, check
  paymentReference TEXT,
  notes TEXT,
  deletedAt INTEGER,
  createdAt INTEGER NOT NULL,
  updatedAt INTEGER NOT NULL,
  
  FOREIGN KEY(electionId) REFERENCES civic_elections(id)
);

CREATE INDEX IF NOT EXISTS idx_civic_expenses_election_status 
  ON civic_campaign_expenses(electionId, status);

CREATE INDEX IF NOT EXISTS idx_civic_expenses_campaign 
  ON civic_campaign_expenses(campaignId);

CREATE INDEX IF NOT EXISTS idx_civic_expenses_category 
  ON civic_campaign_expenses(category);

CREATE INDEX IF NOT EXISTS idx_civic_expenses_approval_status 
  ON civic_campaign_expenses(status, approvedAt);

CREATE INDEX IF NOT EXISTS idx_civic_expenses_tenant 
  ON civic_campaign_expenses(tenantId, id);

-- ─── Table 3: civic_campaign_budget ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS civic_campaign_budget (
  id TEXT PRIMARY KEY,
  electionId TEXT NOT NULL,
  campaignId TEXT,
  tenantId TEXT NOT NULL,
  totalBudget INTEGER NOT NULL, -- kobo/cents
  currency TEXT NOT NULL DEFAULT 'NGN',
  allocatedBudget INTEGER DEFAULT 0,
  spentBudget INTEGER DEFAULT 0,
  raisedFunds INTEGER DEFAULT 0,
  category TEXT, -- overall, advertising, events, staff, materials, travel
  startDate INTEGER,
  endDate INTEGER,
  status TEXT NOT NULL DEFAULT 'active', -- active, closed, archived
  notes TEXT,
  deletedAt INTEGER,
  createdAt INTEGER NOT NULL,
  updatedAt INTEGER NOT NULL,
  
  FOREIGN KEY(electionId) REFERENCES civic_elections(id),
  UNIQUE(campaignId, category)
);

CREATE INDEX IF NOT EXISTS idx_civic_budget_election 
  ON civic_campaign_budget(electionId);

CREATE INDEX IF NOT EXISTS idx_civic_budget_campaign 
  ON civic_campaign_budget(campaignId);

CREATE INDEX IF NOT EXISTS idx_civic_budget_status 
  ON civic_campaign_budget(status);

CREATE INDEX IF NOT EXISTS idx_civic_budget_tenant 
  ON civic_campaign_budget(tenantId, id);

-- ─── Automatic Triggers ────────────────────────────────────────────────────

-- Trigger 1: Update budget on donation completion
CREATE TRIGGER IF NOT EXISTS trg_budget_update_on_donation_complete
AFTER UPDATE OF status ON civic_campaign_donations
WHEN NEW.status = 'completed'
BEGIN
  UPDATE civic_campaign_budget 
  SET raisedFunds = raisedFunds + NEW.amount, updatedAt = NEW.updatedAt
  WHERE campaignId = NEW.campaignId AND category = 'overall';
END;

-- Trigger 2: Update budget on donation refund
CREATE TRIGGER IF NOT EXISTS trg_budget_update_on_donation_refund
AFTER UPDATE OF status ON civic_campaign_donations
WHEN NEW.status = 'refunded'
BEGIN
  UPDATE civic_campaign_budget 
  SET raisedFunds = CASE 
    WHEN raisedFunds >= COALESCE(NEW.refundAmount, NEW.amount) 
    THEN raisedFunds - COALESCE(NEW.refundAmount, NEW.amount)
    ELSE 0 
  END, updatedAt = NEW.updatedAt
  WHERE campaignId = NEW.campaignId AND category = 'overall';
END;

-- Trigger 3: Update budget on expense approval
CREATE TRIGGER IF NOT EXISTS trg_budget_update_on_expense_approve
AFTER UPDATE OF status ON civic_campaign_expenses
WHEN NEW.status = 'approved'
BEGIN
  UPDATE civic_campaign_budget 
  SET spentBudget = spentBudget + NEW.amount, updatedAt = NEW.updatedAt
  WHERE campaignId = NEW.campaignId AND (category = NEW.category OR category = 'overall');
END;

-- Trigger 4: Update budget on expense rejection
CREATE TRIGGER IF NOT EXISTS trg_budget_update_on_expense_reject
AFTER UPDATE OF status ON civic_campaign_expenses
WHEN NEW.status = 'rejected' AND OLD.status = 'approved'
BEGIN
  UPDATE civic_campaign_budget 
  SET spentBudget = CASE 
    WHEN spentBudget >= NEW.amount THEN spentBudget - NEW.amount 
    ELSE 0 
  END, updatedAt = NEW.updatedAt
  WHERE campaignId = NEW.campaignId AND (category = NEW.category OR category = 'overall');
END;

-- Trigger 5: Create audit log on donation
CREATE TRIGGER IF NOT EXISTS trg_donation_audit_log
AFTER INSERT ON civic_campaign_donations
BEGIN
  INSERT INTO civic_election_audit_logs (
    id, electionId, tenantId, action, entityType, entityId, details, createdAt
  ) VALUES (
    'audit_' || NEW.id,
    NEW.electionId,
    NEW.tenantId,
    'donation_created',
    'donation',
    NEW.id,
    json_object('donor', NEW.donorName, 'amount', NEW.amount, 'currency', NEW.currency),
    NEW.createdAt
  );
END;

-- Trigger 6: Create audit log on expense
CREATE TRIGGER IF NOT EXISTS trg_expense_audit_log
AFTER INSERT ON civic_campaign_expenses
BEGIN
  INSERT INTO civic_election_audit_logs (
    id, electionId, tenantId, action, entityType, entityId, details, createdAt
  ) VALUES (
    'audit_' || NEW.id,
    NEW.electionId,
    NEW.tenantId,
    'expense_created',
    'expense',
    NEW.id,
    json_object('category', NEW.category, 'amount', NEW.amount, 'vendor', NEW.vendor),
    NEW.createdAt
  );
END;

-- ─── Views for Common Queries ──────────────────────────────────────────────

CREATE VIEW IF NOT EXISTS vw_fundraising_summary AS
SELECT 
  b.id,
  b.campaignId,
  b.electionId,
  COUNT(DISTINCT d.id) as totalDonors,
  SUM(CASE WHEN d.status = 'completed' THEN d.amount ELSE 0 END) as totalRaised,
  COUNT(DISTINCT CASE WHEN d.status = 'completed' THEN d.id END) as completedDonations,
  AVG(CASE WHEN d.status = 'completed' THEN d.amount ELSE NULL END) as avgDonation,
  COUNT(DISTINCT CASE WHEN d.status = 'pending' THEN d.id END) as pendingDonations
FROM civic_campaign_budget b
LEFT JOIN civic_campaign_donations d ON b.campaignId = d.campaignId AND d.deletedAt IS NULL
WHERE b.deletedAt IS NULL
GROUP BY b.id;

CREATE VIEW IF NOT EXISTS vw_expense_summary AS
SELECT 
  b.id,
  b.campaignId,
  b.electionId,
  SUM(CASE WHEN e.status IN ('approved', 'paid') THEN e.amount ELSE 0 END) as totalApproved,
  SUM(CASE WHEN e.status = 'paid' THEN e.amount ELSE 0 END) as totalPaid,
  COUNT(DISTINCT CASE WHEN e.status = 'pending' THEN e.id END) as pendingCount,
  COUNT(DISTINCT CASE WHEN e.status = 'approved' THEN e.id END) as approvedCount
FROM civic_campaign_budget b
LEFT JOIN civic_campaign_expenses e ON b.campaignId = e.campaignId AND e.deletedAt IS NULL
WHERE b.deletedAt IS NULL
GROUP BY b.id;

CREATE VIEW IF NOT EXISTS vw_budget_status AS
SELECT 
  b.id,
  b.campaignId,
  b.electionId,
  b.totalBudget,
  COALESCE(f.totalRaised, 0) as raisedFunds,
  COALESCE(e.totalApproved, 0) as spentBudget,
  (b.totalBudget - COALESCE(e.totalApproved, 0)) as remainingBudget,
  CASE 
    WHEN b.totalBudget > 0 
    THEN ROUND(100.0 * COALESCE(e.totalApproved, 0) / b.totalBudget, 2)
    ELSE 0
  END as spendPercentage,
  CASE 
    WHEN b.totalBudget > 0 
    THEN ROUND(100.0 * COALESCE(f.totalRaised, 0) / b.totalBudget, 2)
    ELSE 0
  END as fundraisingPercentage
FROM civic_campaign_budget b
LEFT JOIN vw_fundraising_summary f ON b.campaignId = f.campaignId
LEFT JOIN vw_expense_summary e ON b.campaignId = e.campaignId;

CREATE VIEW IF NOT EXISTS vw_donor_list AS
SELECT 
  d.id,
  d.donorName,
  d.donorEmail,
  d.amount,
  d.currency,
  d.status,
  d.createdAt,
  d.anonymous,
  d.ndprConsent,
  d.taxDeductible
FROM civic_campaign_donations d
WHERE d.deletedAt IS NULL AND d.status = 'completed'
ORDER BY d.createdAt DESC;

CREATE VIEW IF NOT EXISTS vw_expense_approval_queue AS
SELECT 
  e.id,
  e.category,
  e.description,
  e.amount,
  e.vendor,
  e.status,
  e.createdAt,
  e.approvedBy,
  e.approvedAt
FROM civic_campaign_expenses e
WHERE e.deletedAt IS NULL AND e.status IN ('pending', 'approved')
ORDER BY CASE WHEN e.status = 'pending' THEN 0 ELSE 1 END, e.createdAt DESC;

-- ─── Migration Metadata ────────────────────────────────────────────────────

-- Migration applied at: 2026-03-20T13:20:00Z
-- Tables created: 3 (civic_campaign_donations, civic_campaign_expenses, civic_campaign_budget)
-- Indexes created: 14
-- Triggers created: 6
-- Views created: 5
-- Total objects: 25
