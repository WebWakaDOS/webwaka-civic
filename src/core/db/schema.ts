/**
 * WebWaka Civic — Database Schema
 * Blueprint Reference: Part 9.2 (Universal Architecture Standards)
 * Part 10.9 (Civic & Political Suite — Church & NGO)
 *
 * Conventions enforced:
 * - tenantId on every table (multi-tenancy, Blueprint Part 9.2)
 * - deletedAt for soft deletes (Blueprint Part 9.2)
 * - Monetary values as integers in kobo (Blueprint Part 9.2)
 * - UUID v4 primary keys (generated at Edge)
 * - createdAt / updatedAt on every table
 */

// ─── Enums ────────────────────────────────────────────────────────────────────

export type OrgType = "church" | "mosque" | "synagogue" | "ngo" | "charity" | "foundation" | "other";

export type MemberStatus = "active" | "inactive" | "deceased" | "transferred";

export type DiscipleshipLevel =
  | "new_convert"
  | "growing"
  | "mature"
  | "leader"
  | "minister"
  | "not_applicable";

export type DonationType =
  | "tithe"
  | "offering"
  | "special"
  | "pledge_payment"
  | "grant_income"
  | "other";

export type PledgeStatus = "active" | "fulfilled" | "cancelled" | "overdue";

export type EventType =
  | "sunday_service"
  | "midweek_service"
  | "prayer_meeting"
  | "outreach"
  | "conference"
  | "youth_meeting"
  | "womens_meeting"
  | "mens_meeting"
  | "general_meeting"
  | "other";

export type GrantStatus = "draft" | "submitted" | "approved" | "rejected" | "disbursed" | "closed";

export type UserRole = "admin" | "leader" | "member" | "viewer";

export type Currency = "NGN" | "GHS" | "KES" | "ZAR" | "UGX" | "TZS" | "ETB" | "XOF";

// ─── Table Name Constants ────────────────────────────────────────────────────

export const TABLE_NAMES = {
  ORGANIZATIONS: "civic_organizations",
  DEPARTMENTS: "civic_departments",
  MEMBERS: "civic_members",
  DONATIONS: "civic_donations",
  PLEDGES: "civic_pledges",
  EVENTS: "civic_events",
  ATTENDANCE: "civic_attendance",
  GRANTS: "civic_grants",
  ANNOUNCEMENTS: "civic_announcements",
} as const;

export type TableName = typeof TABLE_NAMES[keyof typeof TABLE_NAMES];

// ─── D1 Migration SQL ─────────────────────────────────────────────────────────

export const MIGRATION_SQL = `
-- WebWaka Civic — D1 Migration
-- Blueprint Reference: Part 9.2, Part 10.9
-- Generated: 2026-03-15

-- 1. civic_organizations
CREATE TABLE IF NOT EXISTS civic_organizations (
  id TEXT PRIMARY KEY,
  tenantId TEXT NOT NULL,
  name TEXT NOT NULL,
  orgType TEXT NOT NULL DEFAULT 'church',
  description TEXT,
  logoUrl TEXT,
  address TEXT,
  city TEXT,
  state TEXT,
  country TEXT NOT NULL DEFAULT 'NG',
  phone TEXT,
  email TEXT,
  website TEXT,
  rcNumber TEXT,
  currency TEXT NOT NULL DEFAULT 'NGN',
  timezone TEXT NOT NULL DEFAULT 'Africa/Lagos',
  ndprConsentVersion TEXT,
  createdAt INTEGER NOT NULL,
  updatedAt INTEGER NOT NULL,
  deletedAt INTEGER
);
CREATE INDEX IF NOT EXISTS idx_civic_organizations_tenant ON civic_organizations(tenantId);

-- 2. civic_departments
CREATE TABLE IF NOT EXISTS civic_departments (
  id TEXT PRIMARY KEY,
  tenantId TEXT NOT NULL,
  organizationId TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  leaderId TEXT,
  createdAt INTEGER NOT NULL,
  updatedAt INTEGER NOT NULL,
  deletedAt INTEGER,
  FOREIGN KEY (organizationId) REFERENCES civic_organizations(id)
);
CREATE INDEX IF NOT EXISTS idx_civic_departments_tenant ON civic_departments(tenantId);
CREATE INDEX IF NOT EXISTS idx_civic_departments_org ON civic_departments(organizationId);

-- 3. civic_members
CREATE TABLE IF NOT EXISTS civic_members (
  id TEXT PRIMARY KEY,
  tenantId TEXT NOT NULL,
  organizationId TEXT NOT NULL,
  memberNumber TEXT,
  firstName TEXT NOT NULL,
  lastName TEXT NOT NULL,
  otherNames TEXT,
  email TEXT,
  phone TEXT,
  dateOfBirth INTEGER,
  gender TEXT,
  address TEXT,
  city TEXT,
  state TEXT,
  country TEXT NOT NULL DEFAULT 'NG',
  occupation TEXT,
  employer TEXT,
  maritalStatus TEXT,
  spouseName TEXT,
  numberOfChildren INTEGER NOT NULL DEFAULT 0,
  departmentId TEXT,
  memberStatus TEXT NOT NULL DEFAULT 'active',
  discipleshipLevel TEXT NOT NULL DEFAULT 'new_convert',
  joinedAt INTEGER,
  baptismDate INTEGER,
  ndprConsent INTEGER NOT NULL DEFAULT 0,
  ndprConsentDate INTEGER,
  photoUrl TEXT,
  notes TEXT,
  createdAt INTEGER NOT NULL,
  updatedAt INTEGER NOT NULL,
  deletedAt INTEGER,
  FOREIGN KEY (organizationId) REFERENCES civic_organizations(id),
  FOREIGN KEY (departmentId) REFERENCES civic_departments(id)
);
CREATE INDEX IF NOT EXISTS idx_civic_members_tenant ON civic_members(tenantId);
CREATE INDEX IF NOT EXISTS idx_civic_members_org ON civic_members(organizationId);
CREATE INDEX IF NOT EXISTS idx_civic_members_status ON civic_members(memberStatus);
CREATE INDEX IF NOT EXISTS idx_civic_members_dept ON civic_members(departmentId);

-- 4. civic_donations
CREATE TABLE IF NOT EXISTS civic_donations (
  id TEXT PRIMARY KEY,
  tenantId TEXT NOT NULL,
  organizationId TEXT NOT NULL,
  memberId TEXT,
  donationType TEXT NOT NULL DEFAULT 'offering',
  amountKobo INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'NGN',
  description TEXT,
  receiptNumber TEXT,
  paymentMethod TEXT NOT NULL DEFAULT 'cash',
  paymentReference TEXT,
  eventId TEXT,
  recordedBy TEXT NOT NULL,
  donationDate INTEGER NOT NULL,
  createdAt INTEGER NOT NULL,
  updatedAt INTEGER NOT NULL,
  deletedAt INTEGER,
  FOREIGN KEY (organizationId) REFERENCES civic_organizations(id),
  FOREIGN KEY (memberId) REFERENCES civic_members(id)
);
CREATE INDEX IF NOT EXISTS idx_civic_donations_tenant ON civic_donations(tenantId);
CREATE INDEX IF NOT EXISTS idx_civic_donations_org ON civic_donations(organizationId);
CREATE INDEX IF NOT EXISTS idx_civic_donations_member ON civic_donations(memberId);
CREATE INDEX IF NOT EXISTS idx_civic_donations_type ON civic_donations(donationType);
CREATE INDEX IF NOT EXISTS idx_civic_donations_date ON civic_donations(donationDate);

-- 5. civic_pledges
CREATE TABLE IF NOT EXISTS civic_pledges (
  id TEXT PRIMARY KEY,
  tenantId TEXT NOT NULL,
  organizationId TEXT NOT NULL,
  memberId TEXT NOT NULL,
  description TEXT NOT NULL,
  totalAmountKobo INTEGER NOT NULL,
  paidAmountKobo INTEGER NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'NGN',
  pledgeStatus TEXT NOT NULL DEFAULT 'active',
  pledgeDate INTEGER NOT NULL,
  dueDate INTEGER,
  fulfilledAt INTEGER,
  createdAt INTEGER NOT NULL,
  updatedAt INTEGER NOT NULL,
  deletedAt INTEGER,
  FOREIGN KEY (organizationId) REFERENCES civic_organizations(id),
  FOREIGN KEY (memberId) REFERENCES civic_members(id)
);
CREATE INDEX IF NOT EXISTS idx_civic_pledges_tenant ON civic_pledges(tenantId);
CREATE INDEX IF NOT EXISTS idx_civic_pledges_org ON civic_pledges(organizationId);
CREATE INDEX IF NOT EXISTS idx_civic_pledges_member ON civic_pledges(memberId);
CREATE INDEX IF NOT EXISTS idx_civic_pledges_status ON civic_pledges(pledgeStatus);

-- 6. civic_events
CREATE TABLE IF NOT EXISTS civic_events (
  id TEXT PRIMARY KEY,
  tenantId TEXT NOT NULL,
  organizationId TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  eventType TEXT NOT NULL DEFAULT 'sunday_service',
  venue TEXT,
  startTime INTEGER NOT NULL,
  endTime INTEGER,
  expectedAttendance INTEGER,
  actualAttendance INTEGER,
  offeringAmountKobo INTEGER NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'NGN',
  notes TEXT,
  createdBy TEXT NOT NULL,
  createdAt INTEGER NOT NULL,
  updatedAt INTEGER NOT NULL,
  deletedAt INTEGER,
  FOREIGN KEY (organizationId) REFERENCES civic_organizations(id)
);
CREATE INDEX IF NOT EXISTS idx_civic_events_tenant ON civic_events(tenantId);
CREATE INDEX IF NOT EXISTS idx_civic_events_org ON civic_events(organizationId);
CREATE INDEX IF NOT EXISTS idx_civic_events_start ON civic_events(startTime);

-- 7. civic_attendance
CREATE TABLE IF NOT EXISTS civic_attendance (
  id TEXT PRIMARY KEY,
  tenantId TEXT NOT NULL,
  organizationId TEXT NOT NULL,
  eventId TEXT NOT NULL,
  memberId TEXT,
  guestName TEXT,
  checkedInAt INTEGER NOT NULL,
  checkedInBy TEXT,
  createdAt INTEGER NOT NULL,
  updatedAt INTEGER NOT NULL,
  FOREIGN KEY (organizationId) REFERENCES civic_organizations(id),
  FOREIGN KEY (eventId) REFERENCES civic_events(id),
  FOREIGN KEY (memberId) REFERENCES civic_members(id)
);
CREATE INDEX IF NOT EXISTS idx_civic_attendance_tenant ON civic_attendance(tenantId);
CREATE INDEX IF NOT EXISTS idx_civic_attendance_event ON civic_attendance(eventId);
CREATE INDEX IF NOT EXISTS idx_civic_attendance_member ON civic_attendance(memberId);

-- 8. civic_grants
CREATE TABLE IF NOT EXISTS civic_grants (
  id TEXT PRIMARY KEY,
  tenantId TEXT NOT NULL,
  organizationId TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  grantorName TEXT NOT NULL,
  grantorContact TEXT,
  totalAmountKobo INTEGER NOT NULL,
  disbursedAmountKobo INTEGER NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'NGN',
  grantStatus TEXT NOT NULL DEFAULT 'draft',
  applicationDate INTEGER,
  approvalDate INTEGER,
  disbursementDate INTEGER,
  closureDate INTEGER,
  reportingRequirements TEXT,
  notes TEXT,
  createdBy TEXT NOT NULL,
  createdAt INTEGER NOT NULL,
  updatedAt INTEGER NOT NULL,
  deletedAt INTEGER,
  FOREIGN KEY (organizationId) REFERENCES civic_organizations(id)
);
CREATE INDEX IF NOT EXISTS idx_civic_grants_tenant ON civic_grants(tenantId);
CREATE INDEX IF NOT EXISTS idx_civic_grants_org ON civic_grants(organizationId);
CREATE INDEX IF NOT EXISTS idx_civic_grants_status ON civic_grants(grantStatus);

-- 9. civic_announcements
CREATE TABLE IF NOT EXISTS civic_announcements (
  id TEXT PRIMARY KEY,
  tenantId TEXT NOT NULL,
  organizationId TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  priority TEXT NOT NULL DEFAULT 'normal',
  publishedAt INTEGER,
  expiresAt INTEGER,
  createdBy TEXT NOT NULL,
  createdAt INTEGER NOT NULL,
  updatedAt INTEGER NOT NULL,
  deletedAt INTEGER,
  FOREIGN KEY (organizationId) REFERENCES civic_organizations(id)
);
CREATE INDEX IF NOT EXISTS idx_civic_announcements_tenant ON civic_announcements(tenantId);
CREATE INDEX IF NOT EXISTS idx_civic_announcements_org ON civic_announcements(organizationId);

-- 10. civic_expenses
CREATE TABLE IF NOT EXISTS civic_expenses (
  id TEXT PRIMARY KEY,
  tenantId TEXT NOT NULL,
  organizationId TEXT NOT NULL,
  departmentId TEXT,
  category TEXT NOT NULL,
  description TEXT NOT NULL,
  amountKobo INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'NGN',
  expenseDate INTEGER NOT NULL,
  receiptUrl TEXT,
  recordedBy TEXT NOT NULL,
  approvedBy TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  notes TEXT,
  createdAt INTEGER NOT NULL,
  updatedAt INTEGER NOT NULL,
  deletedAt INTEGER,
  FOREIGN KEY (organizationId) REFERENCES civic_organizations(id),
  FOREIGN KEY (departmentId) REFERENCES civic_departments(id)
);
CREATE INDEX IF NOT EXISTS idx_civic_expenses_tenant ON civic_expenses(tenantId);
CREATE INDEX IF NOT EXISTS idx_civic_expenses_org ON civic_expenses(organizationId);
CREATE INDEX IF NOT EXISTS idx_civic_expenses_status ON civic_expenses(status);
CREATE INDEX IF NOT EXISTS idx_civic_expenses_date ON civic_expenses(expenseDate);

-- 11. civic_budgets
CREATE TABLE IF NOT EXISTS civic_budgets (
  id TEXT PRIMARY KEY,
  tenantId TEXT NOT NULL,
  organizationId TEXT NOT NULL,
  departmentId TEXT,
  year INTEGER NOT NULL,
  month INTEGER,
  category TEXT NOT NULL,
  amountKobo INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'NGN',
  notes TEXT,
  createdAt INTEGER NOT NULL,
  updatedAt INTEGER NOT NULL,
  FOREIGN KEY (organizationId) REFERENCES civic_organizations(id),
  FOREIGN KEY (departmentId) REFERENCES civic_departments(id)
);
CREATE INDEX IF NOT EXISTS idx_civic_budgets_tenant ON civic_budgets(tenantId);
CREATE INDEX IF NOT EXISTS idx_civic_budgets_org ON civic_budgets(organizationId);
CREATE INDEX IF NOT EXISTS idx_civic_budgets_year ON civic_budgets(year);

-- E06: Multi-Fund / Project Accounting
CREATE TABLE IF NOT EXISTS civic_projects (
  id TEXT PRIMARY KEY,
  tenantId TEXT NOT NULL,
  organizationId TEXT NOT NULL,
  name TEXT NOT NULL,
  donorName TEXT,
  budgetKobo INTEGER NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'NGN',
  startDate INTEGER,
  endDate INTEGER,
  status TEXT NOT NULL DEFAULT 'draft',
  description TEXT,
  createdBy TEXT NOT NULL,
  createdAt INTEGER NOT NULL,
  updatedAt INTEGER NOT NULL,
  deletedAt INTEGER,
  FOREIGN KEY (organizationId) REFERENCES civic_organizations(id)
);
CREATE INDEX IF NOT EXISTS idx_civic_projects_tenant ON civic_projects(tenantId);
CREATE INDEX IF NOT EXISTS idx_civic_projects_org ON civic_projects(organizationId);

-- Add projectId column to donations and expenses (ALTER TABLE for existing DBs)
-- These are no-ops if columns already exist
-- Note: D1 ALTER TABLE ADD COLUMN is supported
ALTER TABLE civic_donations ADD COLUMN projectId TEXT REFERENCES civic_projects(id);
ALTER TABLE civic_expenses ADD COLUMN projectId TEXT REFERENCES civic_projects(id);

-- F06: Donor profile fields on members
ALTER TABLE civic_members ADD COLUMN isDonor INTEGER NOT NULL DEFAULT 0;
ALTER TABLE civic_members ADD COLUMN donorSince INTEGER;
ALTER TABLE civic_members ADD COLUMN donorNotes TEXT;

-- E08: NDPR Consent Audit Log
CREATE TABLE IF NOT EXISTS civic_ndpr_audit_log (
  id TEXT PRIMARY KEY,
  tenantId TEXT NOT NULL,
  memberId TEXT NOT NULL,
  action TEXT NOT NULL,
  consentVersion TEXT,
  requestType TEXT,
  notes TEXT,
  performedBy TEXT NOT NULL,
  createdAt INTEGER NOT NULL,
  FOREIGN KEY (memberId) REFERENCES civic_members(id)
);
CREATE INDEX IF NOT EXISTS idx_civic_ndpr_audit_tenant ON civic_ndpr_audit_log(tenantId);
CREATE INDEX IF NOT EXISTS idx_civic_ndpr_audit_member ON civic_ndpr_audit_log(memberId);

-- Phase 6: Payment status tracking on donations
-- paymentStatus: cash | pending | processing | success | failed
ALTER TABLE civic_donations ADD COLUMN paymentStatus TEXT NOT NULL DEFAULT 'cash';
ALTER TABLE party_dues ADD COLUMN paymentStatus TEXT NOT NULL DEFAULT 'cash';
ALTER TABLE civic_campaign_donations ADD COLUMN paymentStatus TEXT NOT NULL DEFAULT 'pending';

-- Phase 6: Paystack Webhook Idempotency Log (shared across all modules)
CREATE TABLE IF NOT EXISTS civic_webhook_log (
  id TEXT PRIMARY KEY,
  tenantId TEXT NOT NULL,
  provider TEXT NOT NULL DEFAULT 'paystack',
  event TEXT NOT NULL,
  reference TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'received',
  processedAt INTEGER NOT NULL,
  createdAt INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_civic_webhook_reference ON civic_webhook_log(provider, reference);
CREATE INDEX IF NOT EXISTS idx_civic_webhook_tenant ON civic_webhook_log(tenantId);
`;

// ─── TypeScript Interfaces ────────────────────────────────────────────────────

export interface CivicOrganization {
  id: string;
  tenantId: string;
  name: string;
  orgType: OrgType;
  description?: string;
  logoUrl?: string;
  address?: string;
  city?: string;
  state?: string;
  country: string;
  phone?: string;
  email?: string;
  website?: string;
  rcNumber?: string;
  currency: Currency;
  timezone: string;
  ndprConsentVersion?: string;
  createdAt: number;
  updatedAt: number;
  deletedAt?: number;
}

export interface CivicDepartment {
  id: string;
  tenantId: string;
  organizationId: string;
  name: string;
  description?: string;
  leaderId?: string;
  createdAt: number;
  updatedAt: number;
  deletedAt?: number;
}

export interface CivicMember {
  id: string;
  tenantId: string;
  organizationId: string;
  memberNumber?: string;
  firstName: string;
  lastName: string;
  otherNames?: string;
  email?: string;
  phone?: string;
  dateOfBirth?: number;
  gender?: string;
  address?: string;
  city?: string;
  state?: string;
  country: string;
  occupation?: string;
  employer?: string;
  maritalStatus?: string;
  spouseName?: string;
  numberOfChildren: number;
  departmentId?: string;
  memberStatus: MemberStatus;
  discipleshipLevel: DiscipleshipLevel;
  joinedAt?: number;
  baptismDate?: number;
  ndprConsent: number;
  ndprConsentDate?: number;
  photoUrl?: string;
  notes?: string;
  isDonor?: number;
  donorSince?: number;
  donorNotes?: string;
  createdAt: number;
  updatedAt: number;
  deletedAt?: number;
}

export type PaymentStatus = "cash" | "pending" | "processing" | "success" | "failed";

export interface CivicDonation {
  id: string;
  tenantId: string;
  organizationId: string;
  memberId?: string;
  donationType: DonationType;
  amountKobo: number;
  currency: Currency;
  description?: string;
  receiptNumber?: string;
  paymentMethod: string;
  paymentReference?: string;
  paymentStatus: PaymentStatus;
  eventId?: string;
  projectId?: string;
  recordedBy: string;
  donationDate: number;
  createdAt: number;
  updatedAt: number;
  deletedAt?: number;
}

export interface CivicWebhookLog {
  id: string;
  tenantId: string;
  provider: string;
  event: string;
  reference: string;
  status: string;
  processedAt: number;
  createdAt: number;
}

export interface CivicPledge {
  id: string;
  tenantId: string;
  organizationId: string;
  memberId: string;
  description: string;
  totalAmountKobo: number;
  paidAmountKobo: number;
  currency: Currency;
  pledgeStatus: PledgeStatus;
  pledgeDate: number;
  dueDate?: number;
  fulfilledAt?: number;
  createdAt: number;
  updatedAt: number;
  deletedAt?: number;
}

export interface CivicEvent {
  id: string;
  tenantId: string;
  organizationId: string;
  title: string;
  description?: string;
  eventType: EventType;
  venue?: string;
  startTime: number;
  endTime?: number;
  expectedAttendance?: number;
  actualAttendance?: number;
  offeringAmountKobo: number;
  currency: Currency;
  notes?: string;
  createdBy: string;
  createdAt: number;
  updatedAt: number;
  deletedAt?: number;
}

export interface CivicAttendance {
  id: string;
  tenantId: string;
  organizationId: string;
  eventId: string;
  memberId?: string;
  guestName?: string;
  checkedInAt: number;
  checkedInBy?: string;
  createdAt: number;
  updatedAt: number;
}

export interface CivicGrant {
  id: string;
  tenantId: string;
  organizationId: string;
  title: string;
  description?: string;
  grantorName: string;
  grantorContact?: string;
  totalAmountKobo: number;
  disbursedAmountKobo: number;
  currency: Currency;
  grantStatus: GrantStatus;
  applicationDate?: number;
  approvalDate?: number;
  disbursementDate?: number;
  closureDate?: number;
  reportingRequirements?: string;
  notes?: string;
  createdBy: string;
  createdAt: number;
  updatedAt: number;
  deletedAt?: number;
}

export interface CivicAnnouncement {
  id: string;
  tenantId: string;
  organizationId: string;
  title: string;
  content: string;
  priority: string;
  publishedAt?: number;
  expiresAt?: number;
  createdBy: string;
  createdAt: number;
  updatedAt: number;
  deletedAt?: number;
}

export type CivicExpenseStatus = "pending" | "approved" | "rejected";

export type CivicExpenseCategory =
  | "operations"
  | "personnel"
  | "utilities"
  | "outreach"
  | "welfare"
  | "maintenance"
  | "equipment"
  | "travel"
  | "other";

export interface CivicExpense {
  id: string;
  tenantId: string;
  organizationId: string;
  departmentId?: string;
  projectId?: string;
  category: CivicExpenseCategory | string;
  description: string;
  amountKobo: number;
  currency: string;
  expenseDate: number;
  receiptUrl?: string;
  recordedBy: string;
  approvedBy?: string;
  status: CivicExpenseStatus;
  notes?: string;
  createdAt: number;
  updatedAt: number;
  deletedAt?: number;
}

export interface CivicBudget {
  id: string;
  tenantId: string;
  organizationId: string;
  departmentId?: string;
  year: number;
  month?: number;
  category: CivicExpenseCategory | string;
  amountKobo: number;
  currency: string;
  notes?: string;
  createdAt: number;
  updatedAt: number;
}

export type CivicProjectStatus = "draft" | "active" | "closed";

export interface CivicProject {
  id: string;
  tenantId: string;
  organizationId: string;
  name: string;
  donorName?: string;
  budgetKobo: number;
  currency: string;
  startDate?: number;
  endDate?: number;
  status: CivicProjectStatus;
  description?: string;
  createdBy: string;
  createdAt: number;
  updatedAt: number;
  deletedAt?: number;
}

export type NdprAuditAction =
  | "consent_given"
  | "consent_withdrawn"
  | "data_requested"
  | "data_deleted"
  | "record_accessed";

export interface CivicNdprAuditLog {
  id: string;
  tenantId: string;
  memberId: string;
  action: NdprAuditAction;
  consentVersion?: string;
  requestType?: string;
  notes?: string;
  performedBy: string;
  createdAt: number;
}

// ═══════════════════════════════════════════════════════════════════════════════
// CIV-2: POLITICAL PARTY MANAGEMENT
// Blueprint Reference: Part 10.9 (Civic & Political Suite — Political Party Management)
// Part 9.2 (Universal Architecture Standards)
// ═══════════════════════════════════════════════════════════════════════════════

// ─── CIV-2 Enums ─────────────────────────────────────────────────────────────

/** Hierarchical levels in a Nigerian political party structure [Part 10.9] */
export type PartyStructureLevel =
  | "national"
  | "state"
  | "senatorial"
  | "federal_constituency"
  | "lga"
  | "ward";

/** Member status within the party */
export type PartyMemberStatus =
  | "active"
  | "suspended"
  | "expelled"
  | "deceased"
  | "resigned";

/** Role/position category of a party member */
export type PartyMemberRole =
  | "ordinary"
  | "delegate"
  | "executive"
  | "chairman"
  | "secretary"
  | "treasurer"
  | "youth_leader"
  | "women_leader";

/** Payment method for party dues */
export type PartyPaymentMethod =
  | "cash"
  | "bank_transfer"
  | "pos"
  | "mobile_money"
  | "online";

/** Type of party meeting */
export type PartyMeetingType =
  | "executive"
  | "ward"
  | "state"
  | "national"
  | "emergency"
  | "congress"
  | "convention";

/** Priority level for party announcements */
export type PartyAnnouncementPriority = "normal" | "urgent" | "critical";

// ─── CIV-2 Table Name Constants ───────────────────────────────────────────────

export const PARTY_TABLE_NAMES = {
  ORGANIZATIONS: "party_organizations",
  STRUCTURES: "party_structures",
  MEMBERS: "party_members",
  DUES: "party_dues",
  POSITIONS: "party_positions",
  MEETINGS: "party_meetings",
  ANNOUNCEMENTS: "party_announcements",
  ID_CARDS: "party_id_cards",
} as const;

export type PartyTableName = typeof PARTY_TABLE_NAMES[keyof typeof PARTY_TABLE_NAMES];

// ─── CIV-2 TypeScript Interfaces ─────────────────────────────────────────────

/** Top-level party entity (one per tenant) */
export interface PartyOrganization {
  id: string;
  tenantId: string;
  name: string;
  abbreviation: string;
  motto?: string;
  logoUrl?: string;
  foundedYear?: number;
  inecRegistrationNumber?: string;
  currency: Currency;
  timezone: string;
  annualDuesKobo: number;
  createdAt: number;
  updatedAt: number;
  deletedAt?: number;
}

/**
 * Hierarchical structural unit.
 * Levels: national -> state -> senatorial -> federal_constituency -> lga -> ward
 */
export interface PartyStructure {
  id: string;
  tenantId: string;
  organizationId: string;
  parentId?: string;
  level: PartyStructureLevel;
  name: string;
  code?: string;
  state?: string;
  lga?: string;
  ward?: string;
  chairpersonId?: string;
  secretaryId?: string;
  createdAt: number;
  updatedAt: number;
  deletedAt?: number;
}

/** Individual party member */
export interface PartyMember {
  id: string;
  tenantId: string;
  organizationId: string;
  structureId: string;
  membershipNumber: string;
  firstName: string;
  lastName: string;
  middleName?: string;
  dateOfBirth?: number;
  gender?: "male" | "female" | "other";
  phone: string;
  email?: string;
  address?: string;
  state?: string;
  lga?: string;
  ward?: string;
  voterCardNumber?: string;
  photoUrl?: string;
  memberStatus: PartyMemberStatus;
  role: PartyMemberRole;
  joinedDate: number;
  ndprConsent: boolean;
  ndprConsentDate?: number;
  createdAt: number;
  updatedAt: number;
  deletedAt?: number;
}

/** Annual dues payment record */
export interface PartyDues {
  id: string;
  tenantId: string;
  organizationId: string;
  memberId: string;
  year: number;
  amountKobo: number;
  paymentMethod: PartyPaymentMethod;
  paymentStatus: PaymentStatus;
  receiptNumber: string;
  paidAt: number;
  collectedBy?: string;
  notes?: string;
  createdAt: number;
  updatedAt: number;
  deletedAt?: number;
}

/** Elected or appointed position within the party */
export interface PartyPosition {
  id: string;
  tenantId: string;
  organizationId: string;
  structureId: string;
  title: string;
  holderId?: string;
  electedDate?: number;
  expiresDate?: number;
  isActive: boolean;
  createdAt: number;
  updatedAt: number;
  deletedAt?: number;
}

/** Party meeting at any structural level */
export interface PartyMeeting {
  id: string;
  tenantId: string;
  organizationId: string;
  structureId: string;
  title: string;
  meetingType: PartyMeetingType;
  venue?: string;
  scheduledAt: number;
  minutesUrl?: string;
  attendeeCount?: number;
  createdAt: number;
  updatedAt: number;
  deletedAt?: number;
}

/** Official party announcement */
export interface PartyAnnouncement {
  id: string;
  tenantId: string;
  organizationId: string;
  structureId?: string;
  title: string;
  content: string;
  priority: PartyAnnouncementPriority;
  publishedAt?: number;
  expiresAt?: number;
  createdBy: string;
  createdAt: number;
  updatedAt: number;
  deletedAt?: number;
}

/** Digital membership ID card record */
export interface PartyIdCard {
  id: string;
  tenantId: string;
  organizationId: string;
  memberId: string;
  cardNumber: string;
  issuedAt: number;
  expiresAt?: number;
  cardImageUrl?: string;
  isActive: boolean;
  revokedAt?: number;
  revokedReason?: string;
  createdAt: number;
  updatedAt: number;
  deletedAt?: number;
}

// ─── CIV-2 Phase 2 Interfaces ────────────────────────────────────────────────

export type NominationStatus = "pending" | "approved" | "rejected" | "submitted";

export interface PartyNomination {
  id: string;
  tenantId: string;
  organizationId: string;
  memberId: string;
  position: string;
  constituency: string;
  electionRef?: string;
  status: NominationStatus;
  nominatorId: string;
  vettedBy?: string;
  vettingNotes?: string;
  nominatedAt: number;
  createdAt: number;
  updatedAt: number;
  deletedAt?: number;
}

export type CampaignPositionLevel =
  | "presidential"
  | "governorship"
  | "senate"
  | "house_of_representatives"
  | "state_assembly"
  | "lga_chairmanship"
  | "councillor";

export type CampaignTransactionType = "income" | "expenditure";

/** Nigerian Electoral Act 2022 spending limits in kobo */
export const ELECTORAL_ACT_LIMITS_KOBO: Record<CampaignPositionLevel, number> = {
  presidential: 500_000_000_00,
  governorship: 100_000_000_00,
  senate: 10_000_000_00,
  house_of_representatives: 7_000_000_00,
  state_assembly: 3_000_000_00,
  lga_chairmanship: 3_000_000_00,
  councillor: 3_000_000_00,
};

export interface PartyCampaignAccount {
  id: string;
  tenantId: string;
  organizationId: string;
  electionRef?: string;
  candidateId?: string;
  positionLevel: CampaignPositionLevel;
  limitKobo: number;
  createdAt: number;
  updatedAt: number;
  deletedAt?: number;
}

export interface PartyCampaignTransaction {
  id: string;
  tenantId: string;
  organizationId: string;
  accountId: string;
  transactionType: CampaignTransactionType;
  category: string;
  description: string;
  amountKobo: number;
  currency: string;
  transactionDate: number;
  evidenceUrl?: string;
  recordedBy: string;
  createdAt: number;
  updatedAt: number;
  deletedAt?: number;
}

// ─── CIV-2 D1 Migration SQL ───────────────────────────────────────────────────

export const PARTY_MIGRATION_SQL = `
-- WebWaka Civic -- CIV-2 Political Party D1 Migration
-- Blueprint Reference: Part 9.2, Part 10.9
-- Generated: 2026-03-15

-- 1. party_organizations
CREATE TABLE IF NOT EXISTS party_organizations (
  id TEXT PRIMARY KEY,
  tenantId TEXT NOT NULL,
  name TEXT NOT NULL,
  abbreviation TEXT NOT NULL,
  motto TEXT,
  logoUrl TEXT,
  foundedYear INTEGER,
  inecRegistrationNumber TEXT,
  currency TEXT NOT NULL DEFAULT 'NGN',
  timezone TEXT NOT NULL DEFAULT 'Africa/Lagos',
  annualDuesKobo INTEGER NOT NULL DEFAULT 0,
  createdAt INTEGER NOT NULL,
  updatedAt INTEGER NOT NULL,
  deletedAt INTEGER
);
CREATE INDEX IF NOT EXISTS idx_party_orgs_tenant ON party_organizations(tenantId);

-- 2. party_structures
CREATE TABLE IF NOT EXISTS party_structures (
  id TEXT PRIMARY KEY,
  tenantId TEXT NOT NULL,
  organizationId TEXT NOT NULL,
  parentId TEXT,
  level TEXT NOT NULL CHECK(level IN ('national','state','senatorial','federal_constituency','lga','ward')),
  name TEXT NOT NULL,
  code TEXT,
  state TEXT,
  lga TEXT,
  ward TEXT,
  chairpersonId TEXT,
  secretaryId TEXT,
  createdAt INTEGER NOT NULL,
  updatedAt INTEGER NOT NULL,
  deletedAt INTEGER
);
CREATE INDEX IF NOT EXISTS idx_party_structs_tenant ON party_structures(tenantId, organizationId);
CREATE INDEX IF NOT EXISTS idx_party_structs_parent ON party_structures(parentId);

-- 3. party_members
CREATE TABLE IF NOT EXISTS party_members (
  id TEXT PRIMARY KEY,
  tenantId TEXT NOT NULL,
  organizationId TEXT NOT NULL,
  structureId TEXT NOT NULL,
  membershipNumber TEXT NOT NULL,
  firstName TEXT NOT NULL,
  lastName TEXT NOT NULL,
  middleName TEXT,
  dateOfBirth INTEGER,
  gender TEXT CHECK(gender IN ('male','female','other')),
  phone TEXT NOT NULL,
  email TEXT,
  address TEXT,
  state TEXT,
  lga TEXT,
  ward TEXT,
  voterCardNumber TEXT,
  photoUrl TEXT,
  memberStatus TEXT NOT NULL DEFAULT 'active' CHECK(memberStatus IN ('active','suspended','expelled','deceased','resigned')),
  role TEXT NOT NULL DEFAULT 'ordinary' CHECK(role IN ('ordinary','delegate','executive','chairman','secretary','treasurer','youth_leader','women_leader')),
  joinedDate INTEGER NOT NULL,
  ndprConsent INTEGER NOT NULL DEFAULT 0,
  ndprConsentDate INTEGER,
  createdAt INTEGER NOT NULL,
  updatedAt INTEGER NOT NULL,
  deletedAt INTEGER
);
CREATE INDEX IF NOT EXISTS idx_party_members_tenant ON party_members(tenantId, organizationId);
CREATE INDEX IF NOT EXISTS idx_party_members_structure ON party_members(structureId);
CREATE INDEX IF NOT EXISTS idx_party_members_status ON party_members(memberStatus);
CREATE UNIQUE INDEX IF NOT EXISTS idx_party_members_number ON party_members(tenantId, membershipNumber) WHERE deletedAt IS NULL;

-- 4. party_dues
CREATE TABLE IF NOT EXISTS party_dues (
  id TEXT PRIMARY KEY,
  tenantId TEXT NOT NULL,
  organizationId TEXT NOT NULL,
  memberId TEXT NOT NULL,
  year INTEGER NOT NULL,
  amountKobo INTEGER NOT NULL,
  paymentMethod TEXT NOT NULL CHECK(paymentMethod IN ('cash','bank_transfer','pos','mobile_money','online')),
  paymentStatus TEXT NOT NULL DEFAULT 'cash',
  receiptNumber TEXT NOT NULL,
  paidAt INTEGER NOT NULL,
  collectedBy TEXT,
  notes TEXT,
  createdAt INTEGER NOT NULL,
  updatedAt INTEGER NOT NULL,
  deletedAt INTEGER
);
CREATE INDEX IF NOT EXISTS idx_party_dues_tenant ON party_dues(tenantId, organizationId);
CREATE INDEX IF NOT EXISTS idx_party_dues_member ON party_dues(memberId, year);

-- 5. party_positions
CREATE TABLE IF NOT EXISTS party_positions (
  id TEXT PRIMARY KEY,
  tenantId TEXT NOT NULL,
  organizationId TEXT NOT NULL,
  structureId TEXT NOT NULL,
  title TEXT NOT NULL,
  holderId TEXT,
  electedDate INTEGER,
  expiresDate INTEGER,
  isActive INTEGER NOT NULL DEFAULT 1,
  createdAt INTEGER NOT NULL,
  updatedAt INTEGER NOT NULL,
  deletedAt INTEGER
);
CREATE INDEX IF NOT EXISTS idx_party_positions_tenant ON party_positions(tenantId, organizationId);
CREATE INDEX IF NOT EXISTS idx_party_positions_structure ON party_positions(structureId);

-- 6. party_meetings
CREATE TABLE IF NOT EXISTS party_meetings (
  id TEXT PRIMARY KEY,
  tenantId TEXT NOT NULL,
  organizationId TEXT NOT NULL,
  structureId TEXT NOT NULL,
  title TEXT NOT NULL,
  meetingType TEXT NOT NULL CHECK(meetingType IN ('executive','ward','state','national','emergency','congress','convention')),
  venue TEXT,
  scheduledAt INTEGER NOT NULL,
  minutesUrl TEXT,
  attendeeCount INTEGER,
  createdAt INTEGER NOT NULL,
  updatedAt INTEGER NOT NULL,
  deletedAt INTEGER
);
CREATE INDEX IF NOT EXISTS idx_party_meetings_tenant ON party_meetings(tenantId, organizationId);
CREATE INDEX IF NOT EXISTS idx_party_meetings_scheduled ON party_meetings(scheduledAt);

-- 7. party_announcements
CREATE TABLE IF NOT EXISTS party_announcements (
  id TEXT PRIMARY KEY,
  tenantId TEXT NOT NULL,
  organizationId TEXT NOT NULL,
  structureId TEXT,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  priority TEXT NOT NULL DEFAULT 'normal' CHECK(priority IN ('normal','urgent','critical')),
  publishedAt INTEGER,
  expiresAt INTEGER,
  createdBy TEXT NOT NULL,
  createdAt INTEGER NOT NULL,
  updatedAt INTEGER NOT NULL,
  deletedAt INTEGER
);
CREATE INDEX IF NOT EXISTS idx_party_announcements_tenant ON party_announcements(tenantId, organizationId);

-- 8. party_id_cards
CREATE TABLE IF NOT EXISTS party_id_cards (
  id TEXT PRIMARY KEY,
  tenantId TEXT NOT NULL,
  organizationId TEXT NOT NULL,
  memberId TEXT NOT NULL,
  cardNumber TEXT NOT NULL,
  issuedAt INTEGER NOT NULL,
  expiresAt INTEGER,
  cardImageUrl TEXT,
  isActive INTEGER NOT NULL DEFAULT 1,
  revokedAt INTEGER,
  revokedReason TEXT,
  createdAt INTEGER NOT NULL,
  updatedAt INTEGER NOT NULL,
  deletedAt INTEGER
);
CREATE INDEX IF NOT EXISTS idx_party_cards_tenant ON party_id_cards(tenantId, organizationId);
CREATE INDEX IF NOT EXISTS idx_party_cards_member ON party_id_cards(memberId);
CREATE UNIQUE INDEX IF NOT EXISTS idx_party_cards_number ON party_id_cards(tenantId, cardNumber) WHERE deletedAt IS NULL;

-- 9. party_nominations (P05 — Candidate Vetting & Nomination Workflow)
CREATE TABLE IF NOT EXISTS party_nominations (
  id TEXT PRIMARY KEY,
  tenantId TEXT NOT NULL,
  organizationId TEXT NOT NULL,
  memberId TEXT NOT NULL,
  position TEXT NOT NULL,
  constituency TEXT NOT NULL,
  electionRef TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  nominatorId TEXT NOT NULL,
  vettedBy TEXT,
  vettingNotes TEXT,
  nominatedAt INTEGER NOT NULL,
  createdAt INTEGER NOT NULL,
  updatedAt INTEGER NOT NULL,
  deletedAt INTEGER,
  FOREIGN KEY (memberId) REFERENCES party_members(id)
);
CREATE INDEX IF NOT EXISTS idx_party_nominations_tenant ON party_nominations(tenantId, organizationId);
CREATE INDEX IF NOT EXISTS idx_party_nominations_member ON party_nominations(memberId);
CREATE INDEX IF NOT EXISTS idx_party_nominations_status ON party_nominations(status);

-- 10. party_campaign_accounts (P06 — Campaign Finance Tracker)
CREATE TABLE IF NOT EXISTS party_campaign_accounts (
  id TEXT PRIMARY KEY,
  tenantId TEXT NOT NULL,
  organizationId TEXT NOT NULL,
  electionRef TEXT,
  candidateId TEXT,
  positionLevel TEXT NOT NULL,
  limitKobo INTEGER NOT NULL,
  createdAt INTEGER NOT NULL,
  updatedAt INTEGER NOT NULL,
  deletedAt INTEGER
);
CREATE INDEX IF NOT EXISTS idx_party_campaign_accounts_tenant ON party_campaign_accounts(tenantId, organizationId);

-- 11. party_campaign_transactions (P06)
CREATE TABLE IF NOT EXISTS party_campaign_transactions (
  id TEXT PRIMARY KEY,
  tenantId TEXT NOT NULL,
  organizationId TEXT NOT NULL,
  accountId TEXT NOT NULL,
  transactionType TEXT NOT NULL,
  category TEXT NOT NULL,
  description TEXT NOT NULL,
  amountKobo INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'NGN',
  transactionDate INTEGER NOT NULL,
  evidenceUrl TEXT,
  recordedBy TEXT NOT NULL,
  createdAt INTEGER NOT NULL,
  updatedAt INTEGER NOT NULL,
  deletedAt INTEGER,
  FOREIGN KEY (accountId) REFERENCES party_campaign_accounts(id)
);
CREATE INDEX IF NOT EXISTS idx_party_campaign_tx_tenant ON party_campaign_transactions(tenantId, organizationId);
CREATE INDEX IF NOT EXISTS idx_party_campaign_tx_account ON party_campaign_transactions(accountId);
CREATE INDEX IF NOT EXISTS idx_party_campaign_tx_type ON party_campaign_transactions(transactionType);
`;


// ─── CIV-3 Elections & Campaigns Types ──────────────────────────────────────────

export type ElectionType = "primary" | "general" | "special";

export type ElectionStatus = "draft" | "nomination" | "voting" | "results" | "closed";

export type CandidateStatus = "nominated" | "approved" | "rejected" | "withdrawn";

export type VotingStationStatus = "active" | "closed" | "offline";

export type VolunteerStatus = "active" | "inactive" | "suspended";

export type VolunteerTaskType = "canvassing" | "event" | "logistics" | "social_media" | "other";

export type VolunteerTaskStatus = "assigned" | "in_progress" | "completed" | "cancelled";

export type PaymentMethod = "paystack" | "flutterwave" | "bank_transfer" | "cash";

export type DonationStatus = "pending" | "completed" | "failed" | "refunded";

export type ExpenseCategory = "advertising" | "events" | "materials" | "logistics" | "staff" | "other";

export type ApprovalStatus = "pending" | "approved" | "rejected";

export type MaterialType = "poster" | "video" | "document" | "social_media" | "other";

export type MaterialStatus = "draft" | "pending_review" | "approved" | "published" | "archived";

export type AnnouncementType = "update" | "alert" | "schedule_change" | "result" | "other";

export type AnnouncementPriority = "normal" | "urgent" | "critical";

export type TargetAudience = "all" | "members" | "volunteers" | "donors";

export type ResultStatus = "preliminary" | "final";

export type MessageType = "text" | "task_update" | "system";

export type AuditActionType = 
  | "election_created"
  | "election_updated"
  | "nomination_started"
  | "voting_started"
  | "vote_cast"
  | "result_announced"
  | "volunteer_registered"
  | "task_assigned"
  | "donation_received"
  | "material_published"
  | "announcement_posted";

// ─── CIV-3 Table Name Constants ─────────────────────────────────────────────────

export const CIV3_TABLE_NAMES = {
  ELECTIONS: "civic_elections",
  CANDIDATES: "civic_candidates",
  VOTES: "civic_votes",
  VOTING_STATIONS: "civic_voting_stations",
  VOLUNTEERS: "civic_volunteers",
  VOLUNTEER_TASKS: "civic_volunteer_tasks",
  CAMPAIGN_DONATIONS: "civic_campaign_donations",
  CAMPAIGN_EXPENSES: "civic_campaign_expenses",
  CAMPAIGN_MATERIALS: "civic_campaign_materials",
  CAMPAIGN_ANNOUNCEMENTS: "civic_campaign_announcements",
  ELECTION_RESULTS: "civic_election_results",
  VOLUNTEER_MESSAGES: "civic_volunteer_messages",
  ELECTION_AUDIT_LOGS: "civic_election_audit_logs",
} as const;

// ─── CIV-3 TypeScript Interfaces ────────────────────────────────────────────────

export interface Election {
  id: string;
  tenantId: string;
  name: string;
  electionType: ElectionType;
  position: string;
  nominationStartAt: number;
  nominationEndAt: number;
  votingStartAt: number;
  votingEndAt: number;
  resultAnnouncementAt?: number;
  status: ElectionStatus;
  createdAt: number;
  updatedAt: number;
  deletedAt?: number;
}

export interface Candidate {
  id: string;
  tenantId: string;
  electionId: string;
  memberId: string;
  name: string;
  bio?: string;
  manifestoUrl?: string;
  photoUrl?: string;
  nominatedBy: string;
  nominationDate: number;
  status: CandidateStatus;
  voteCount: number;
  createdAt: number;
  updatedAt: number;
  deletedAt?: number;
}

export interface Vote {
  id: string;
  tenantId: string;
  electionId: string;
  voterId: string;
  candidateId: string;
  votingStationId?: string;
  encryptedVote: string;
  verificationHash?: string;
  castAt: number;
  createdAt: number;
  updatedAt: number;
  deletedAt?: number;
}

export interface VotingStation {
  id: string;
  tenantId: string;
  electionId: string;
  name: string;
  location: string;
  latitude?: number;
  longitude?: number;
  capacity: number;
  votesCount: number;
  status: VotingStationStatus;
  createdAt: number;
  updatedAt: number;
  deletedAt?: number;
}

export interface Volunteer {
  id: string;
  tenantId: string;
  memberId: string;
  name: string;
  phone: string;
  email: string;
  skills?: string;
  availability?: string;
  status: VolunteerStatus;
  hoursLogged: number;
  tasksCompleted: number;
  points: number;
  createdAt: number;
  updatedAt: number;
  deletedAt?: number;
}

export interface VolunteerTask {
  id: string;
  tenantId: string;
  electionId: string;
  volunteerId: string;
  title: string;
  description?: string;
  taskType: VolunteerTaskType;
  status: VolunteerTaskStatus;
  dueDate?: number;
  hoursEstimated?: number;
  hoursLogged: number;
  completedAt?: number;
  feedback?: string;
  rating?: number;
  createdAt: number;
  updatedAt: number;
  deletedAt?: number;
}

export interface CampaignDonation {
  id: string;
  tenantId: string;
  electionId: string;
  donorId?: string;
  amountKobo: number;
  currency: string;
  paymentMethod: PaymentMethod;
  paymentRef?: string;
  paymentStatus: PaymentStatus;
  status: DonationStatus;
  donorName: string;
  donorEmail?: string;
  donorPhone?: string;
  receiptUrl?: string;
  ndprConsent: boolean;
  createdAt: number;
  updatedAt: number;
  deletedAt?: number;
}

export interface CampaignExpense {
  id: string;
  tenantId: string;
  electionId: string;
  category: ExpenseCategory;
  description: string;
  amountKobo: number;
  currency: string;
  expenseDate: number;
  receipt?: string;
  approvedBy?: string;
  approvalStatus: ApprovalStatus;
  createdAt: number;
  updatedAt: number;
  deletedAt?: number;
}

export interface CampaignMaterial {
  id: string;
  tenantId: string;
  electionId: string;
  title: string;
  description?: string;
  materialType: MaterialType;
  contentUrl: string;
  thumbnailUrl?: string;
  status: MaterialStatus;
  approvedBy?: string;
  publishedAt?: number;
  viewCount: number;
  shareCount: number;
  createdAt: number;
  updatedAt: number;
  deletedAt?: number;
}

export interface CampaignAnnouncement {
  id: string;
  tenantId: string;
  electionId: string;
  title: string;
  content: string;
  announcementType: AnnouncementType;
  priority: AnnouncementPriority;
  targetAudience: TargetAudience;
  publishedAt: number;
  createdAt: number;
  updatedAt: number;
  deletedAt?: number;
}

export interface ElectionResult {
  id: string;
  tenantId: string;
  electionId: string;
  candidateId: string;
  totalVotes: number;
  percentage: number;
  rank: number;
  status: ResultStatus;
  announcedAt?: number;
  createdAt: number;
  updatedAt: number;
  deletedAt?: number;
}

export interface VolunteerMessage {
  id: string;
  tenantId: string;
  electionId: string;
  senderId: string;
  recipientId: string;
  content: string;
  messageType: MessageType;
  readAt?: number;
  createdAt: number;
  updatedAt: number;
  deletedAt?: number;
}

export interface ElectionAuditLog {
  id: string;
  tenantId: string;
  electionId: string;
  actionType: AuditActionType;
  actorId?: string;
  actorRole?: string;
  details?: string;
  ipAddress?: string;
  createdAt: number;
}

// ─── CIV-3 Phase 2 Interfaces ────────────────────────────────────────────────

export type CollationLevel = "polling_unit" | "ward" | "lga" | "state" | "senatorial" | "federal_constituency" | "national";

export type CollationStatus = "draft" | "submitted" | "certified";

/** EL02 — Multi-Level Result Collation [Phase 2] */
export interface ElectionResultCollation {
  id: string;
  tenantId: string;
  electionId: string;
  candidateId: string;
  level: CollationLevel;
  pollingUnit?: string;
  ward?: string;
  lga?: string;
  state?: string;
  votesCount: number;
  spoiltVotes?: number;
  accreditedVoters?: number;
  collatedBy: string;
  collatedAt: number;
  status: CollationStatus;
  certifiedBy?: string;
  certifiedAt?: number;
  createdAt: number;
  updatedAt: number;
}

// ─── CIV-3 D1 Migration SQL ───────────────────────────────────────────────────

export const ELECTION_MIGRATION_SQL = `
-- WebWaka Civic -- CIV-3 Elections D1 Migration
-- Phase 2 + Phase 3: Volunteers, Campaign Finance, Result Collation

-- civic_volunteers
CREATE TABLE IF NOT EXISTS civic_volunteers (
  id TEXT PRIMARY KEY,
  tenantId TEXT NOT NULL,
  electionId TEXT NOT NULL,
  userId TEXT NOT NULL,
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  state TEXT,
  lga TEXT,
  ward TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  skills TEXT,
  points INTEGER NOT NULL DEFAULT 0,
  tasksCompleted INTEGER NOT NULL DEFAULT 0,
  createdAt INTEGER NOT NULL,
  updatedAt INTEGER NOT NULL,
  deletedAt INTEGER
);
CREATE INDEX IF NOT EXISTS idx_volunteers_tenant ON civic_volunteers(tenantId, electionId);
CREATE INDEX IF NOT EXISTS idx_volunteers_user ON civic_volunteers(userId);

-- civic_volunteer_tasks
CREATE TABLE IF NOT EXISTS civic_volunteer_tasks (
  id TEXT PRIMARY KEY,
  tenantId TEXT NOT NULL,
  electionId TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  taskType TEXT NOT NULL DEFAULT 'general',
  assignedTo TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  priority TEXT NOT NULL DEFAULT 'normal',
  dueAt INTEGER,
  pointsReward INTEGER NOT NULL DEFAULT 10,
  createdBy TEXT NOT NULL,
  createdAt INTEGER NOT NULL,
  updatedAt INTEGER NOT NULL,
  deletedAt INTEGER
);
CREATE INDEX IF NOT EXISTS idx_volunteer_tasks_tenant ON civic_volunteer_tasks(tenantId, electionId);
CREATE INDEX IF NOT EXISTS idx_volunteer_tasks_assigned ON civic_volunteer_tasks(assignedTo);

-- civic_volunteer_assignments
CREATE TABLE IF NOT EXISTS civic_volunteer_assignments (
  id TEXT PRIMARY KEY,
  tenantId TEXT NOT NULL,
  electionId TEXT NOT NULL,
  taskId TEXT NOT NULL,
  volunteerId TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  acceptedAt INTEGER,
  completedAt INTEGER,
  hoursWorked REAL,
  notes TEXT,
  createdAt INTEGER NOT NULL,
  updatedAt INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_assignments_tenant ON civic_volunteer_assignments(tenantId, electionId);
CREATE INDEX IF NOT EXISTS idx_assignments_volunteer ON civic_volunteer_assignments(volunteerId);

-- civic_volunteer_badges
CREATE TABLE IF NOT EXISTS civic_volunteer_badges (
  id TEXT PRIMARY KEY,
  tenantId TEXT NOT NULL,
  volunteerId TEXT NOT NULL,
  electionId TEXT NOT NULL,
  badgeType TEXT NOT NULL,
  awardedBy TEXT NOT NULL,
  awardedAt INTEGER NOT NULL,
  createdAt INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_badges_volunteer ON civic_volunteer_badges(volunteerId);

-- civic_campaign_donations
CREATE TABLE IF NOT EXISTS civic_campaign_donations (
  id TEXT PRIMARY KEY,
  tenantId TEXT NOT NULL,
  electionId TEXT NOT NULL,
  campaignId TEXT,
  donorName TEXT NOT NULL,
  donorEmail TEXT,
  donorPhone TEXT,
  amountKobo INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'NGN',
  paymentMethod TEXT NOT NULL DEFAULT 'paystack',
  paymentReference TEXT,
  paymentStatus TEXT NOT NULL DEFAULT 'pending',
  status TEXT NOT NULL DEFAULT 'pending',
  ndprConsent INTEGER NOT NULL DEFAULT 0,
  receiptUrl TEXT,
  createdAt INTEGER NOT NULL,
  updatedAt INTEGER NOT NULL,
  deletedAt INTEGER
);
CREATE INDEX IF NOT EXISTS idx_campaign_donations_tenant ON civic_campaign_donations(tenantId, electionId);
CREATE INDEX IF NOT EXISTS idx_campaign_donations_status ON civic_campaign_donations(status);

-- civic_campaign_expenses
CREATE TABLE IF NOT EXISTS civic_campaign_expenses (
  id TEXT PRIMARY KEY,
  tenantId TEXT NOT NULL,
  electionId TEXT NOT NULL,
  campaignId TEXT,
  category TEXT NOT NULL,
  description TEXT NOT NULL,
  amountKobo INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'NGN',
  vendorName TEXT,
  receiptUrl TEXT,
  approvedBy TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  createdBy TEXT NOT NULL,
  createdAt INTEGER NOT NULL,
  updatedAt INTEGER NOT NULL,
  deletedAt INTEGER
);
CREATE INDEX IF NOT EXISTS idx_campaign_expenses_tenant ON civic_campaign_expenses(tenantId, electionId);

-- civic_campaign_budgets
CREATE TABLE IF NOT EXISTS civic_campaign_budgets (
  id TEXT PRIMARY KEY,
  tenantId TEXT NOT NULL,
  electionId TEXT NOT NULL,
  campaignId TEXT,
  category TEXT NOT NULL,
  budgetKobo INTEGER NOT NULL,
  spentKobo INTEGER NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'NGN',
  notes TEXT,
  createdBy TEXT NOT NULL,
  createdAt INTEGER NOT NULL,
  updatedAt INTEGER NOT NULL,
  deletedAt INTEGER
);
CREATE INDEX IF NOT EXISTS idx_campaign_budgets_tenant ON civic_campaign_budgets(tenantId, electionId);

-- election_result_collations
CREATE TABLE IF NOT EXISTS election_result_collations (
  id TEXT PRIMARY KEY,
  tenantId TEXT NOT NULL,
  electionId TEXT NOT NULL,
  candidateId TEXT NOT NULL,
  level TEXT NOT NULL,
  pollingUnit TEXT,
  ward TEXT,
  lga TEXT,
  state TEXT,
  votesCount INTEGER NOT NULL DEFAULT 0,
  spoiltVotes INTEGER,
  accreditedVoters INTEGER,
  collatedBy TEXT NOT NULL,
  collatedAt INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  certifiedBy TEXT,
  certifiedAt INTEGER,
  createdAt INTEGER NOT NULL,
  updatedAt INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_collations_tenant ON election_result_collations(tenantId, electionId);
CREATE INDEX IF NOT EXISTS idx_collations_candidate ON election_result_collations(candidateId);
CREATE INDEX IF NOT EXISTS idx_collations_level ON election_result_collations(level, status);
`;
