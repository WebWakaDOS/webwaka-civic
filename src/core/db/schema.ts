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
  createdAt: number;
  updatedAt: number;
  deletedAt?: number;
}

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
  eventId?: string;
  recordedBy: string;
  donationDate: number;
  createdAt: number;
  updatedAt: number;
  deletedAt?: number;
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
