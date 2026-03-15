/**
 * WebWaka Civic — Database Query Helpers
 * Blueprint Reference: Part 9.3 (Zero Direct Database Clients — must use injected DB service)
 *
 * All queries use the injected D1 database binding.
 * No direct database client instantiation.
 * All queries enforce tenantId isolation (Blueprint Part 9.2).
 */

import type {
  CivicAnnouncement,
  CivicAttendance,
  CivicDonation,
  CivicEvent,
  CivicGrant,
  CivicMember,
  CivicOrganization,
  CivicPledge,
} from "./schema.ts";

// ─── D1 Database Interface ────────────────────────────────────────────────────

export interface D1Database {
  prepare(query: string): D1PreparedStatement;
  exec(query: string): Promise<D1ExecResult>;
  batch<T = unknown>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]>;
}

export interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = unknown>(colName?: string): Promise<T | null>;
  run(): Promise<D1Result>;
  all<T = unknown>(): Promise<D1Result<T>>;
}

export interface D1Result<T = unknown> {
  results: T[];
  success: boolean;
  meta: Record<string, unknown>;
}

export interface D1ExecResult {
  count: number;
  duration: number;
}

// ─── Organization Queries ─────────────────────────────────────────────────────

export async function getOrganizationByTenant(
  db: D1Database,
  tenantId: string
): Promise<CivicOrganization | null> {
  return db
    .prepare(
      "SELECT * FROM civic_organizations WHERE tenantId = ? AND deletedAt IS NULL LIMIT 1"
    )
    .bind(tenantId)
    .first<CivicOrganization>();
}

export async function updateOrganization(
  db: D1Database,
  id: string,
  tenantId: string,
  updates: Partial<CivicOrganization>
): Promise<void> {
  const now = Date.now();
  await db
    .prepare(
      `UPDATE civic_organizations SET
        name = COALESCE(?, name),
        description = COALESCE(?, description),
        address = COALESCE(?, address),
        city = COALESCE(?, city),
        state = COALESCE(?, state),
        phone = COALESCE(?, phone),
        email = COALESCE(?, email),
        website = COALESCE(?, website),
        updatedAt = ?
       WHERE id = ? AND tenantId = ? AND deletedAt IS NULL`
    )
    .bind(
      updates.name ?? null,
      updates.description ?? null,
      updates.address ?? null,
      updates.city ?? null,
      updates.state ?? null,
      updates.phone ?? null,
      updates.email ?? null,
      updates.website ?? null,
      now,
      id,
      tenantId
    )
    .run();
}

// ─── Member Queries ───────────────────────────────────────────────────────────

export interface MemberFilters {
  status?: string;
  departmentId?: string;
  discipleshipLevel?: string;
  search?: string;
  limit?: number;
  offset?: number;
}

export async function getMembersByOrg(
  db: D1Database,
  tenantId: string,
  organizationId: string,
  filters: MemberFilters = {}
): Promise<CivicMember[]> {
  const limit = filters.limit ?? 50;
  const offset = filters.offset ?? 0;

  let query = `SELECT * FROM civic_members
    WHERE tenantId = ? AND organizationId = ? AND deletedAt IS NULL`;
  const params: unknown[] = [tenantId, organizationId];

  if (filters.status !== undefined) {
    query += " AND memberStatus = ?";
    params.push(filters.status);
  }
  if (filters.departmentId !== undefined) {
    query += " AND departmentId = ?";
    params.push(filters.departmentId);
  }
  if (filters.discipleshipLevel !== undefined) {
    query += " AND discipleshipLevel = ?";
    params.push(filters.discipleshipLevel);
  }
  if (filters.search !== undefined) {
    query += " AND (firstName LIKE ? OR lastName LIKE ? OR phone LIKE ? OR email LIKE ?)";
    const searchTerm = `%${filters.search}%`;
    params.push(searchTerm, searchTerm, searchTerm, searchTerm);
  }

  query += " ORDER BY lastName ASC, firstName ASC LIMIT ? OFFSET ?";
  params.push(limit, offset);

  const result = await db.prepare(query).bind(...params).all<CivicMember>();
  return result.results;
}

export async function getMemberById(
  db: D1Database,
  id: string,
  tenantId: string
): Promise<CivicMember | null> {
  return db
    .prepare("SELECT * FROM civic_members WHERE id = ? AND tenantId = ? AND deletedAt IS NULL")
    .bind(id, tenantId)
    .first<CivicMember>();
}

export async function createMember(
  db: D1Database,
  member: CivicMember
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO civic_members (
        id, tenantId, organizationId, memberNumber, firstName, lastName, otherNames,
        email, phone, dateOfBirth, gender, address, city, state, country,
        occupation, employer, maritalStatus, spouseName, numberOfChildren,
        departmentId, memberStatus, discipleshipLevel, joinedAt, baptismDate,
        ndprConsent, ndprConsentDate, photoUrl, notes, createdAt, updatedAt
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
    )
    .bind(
      member.id, member.tenantId, member.organizationId, member.memberNumber ?? null,
      member.firstName, member.lastName, member.otherNames ?? null,
      member.email ?? null, member.phone ?? null, member.dateOfBirth ?? null,
      member.gender ?? null, member.address ?? null, member.city ?? null,
      member.state ?? null, member.country,
      member.occupation ?? null, member.employer ?? null,
      member.maritalStatus ?? null, member.spouseName ?? null, member.numberOfChildren,
      member.departmentId ?? null, member.memberStatus, member.discipleshipLevel,
      member.joinedAt ?? null, member.baptismDate ?? null,
      member.ndprConsent, member.ndprConsentDate ?? null,
      member.photoUrl ?? null, member.notes ?? null,
      member.createdAt, member.updatedAt
    )
    .run();
}

export async function updateMember(
  db: D1Database,
  id: string,
  tenantId: string,
  updates: Partial<CivicMember>
): Promise<void> {
  const now = Date.now();
  await db
    .prepare(
      `UPDATE civic_members SET
        firstName = COALESCE(?, firstName),
        lastName = COALESCE(?, lastName),
        email = COALESCE(?, email),
        phone = COALESCE(?, phone),
        address = COALESCE(?, address),
        memberStatus = COALESCE(?, memberStatus),
        discipleshipLevel = COALESCE(?, discipleshipLevel),
        departmentId = COALESCE(?, departmentId),
        notes = COALESCE(?, notes),
        updatedAt = ?
       WHERE id = ? AND tenantId = ? AND deletedAt IS NULL`
    )
    .bind(
      updates.firstName ?? null, updates.lastName ?? null,
      updates.email ?? null, updates.phone ?? null, updates.address ?? null,
      updates.memberStatus ?? null, updates.discipleshipLevel ?? null,
      updates.departmentId ?? null, updates.notes ?? null,
      now, id, tenantId
    )
    .run();
}

export async function softDeleteMember(
  db: D1Database,
  id: string,
  tenantId: string
): Promise<void> {
  const now = Date.now();
  await db
    .prepare("UPDATE civic_members SET deletedAt = ?, updatedAt = ? WHERE id = ? AND tenantId = ?")
    .bind(now, now, id, tenantId)
    .run();
}

export async function getMemberCount(
  db: D1Database,
  tenantId: string,
  organizationId: string
): Promise<number> {
  const result = await db
    .prepare(
      "SELECT COUNT(*) as count FROM civic_members WHERE tenantId = ? AND organizationId = ? AND deletedAt IS NULL AND memberStatus = 'active'"
    )
    .bind(tenantId, organizationId)
    .first<{ count: number }>();
  return result?.count ?? 0;
}

// ─── Donation Queries ─────────────────────────────────────────────────────────

export interface DonationFilters {
  donationType?: string;
  memberId?: string;
  startDate?: number;
  endDate?: number;
  limit?: number;
  offset?: number;
}

export async function getDonationsByOrg(
  db: D1Database,
  tenantId: string,
  organizationId: string,
  filters: DonationFilters = {}
): Promise<CivicDonation[]> {
  const limit = filters.limit ?? 50;
  const offset = filters.offset ?? 0;

  let query = `SELECT * FROM civic_donations
    WHERE tenantId = ? AND organizationId = ? AND deletedAt IS NULL`;
  const params: unknown[] = [tenantId, organizationId];

  if (filters.donationType !== undefined) {
    query += " AND donationType = ?";
    params.push(filters.donationType);
  }
  if (filters.memberId !== undefined) {
    query += " AND memberId = ?";
    params.push(filters.memberId);
  }
  if (filters.startDate !== undefined) {
    query += " AND donationDate >= ?";
    params.push(filters.startDate);
  }
  if (filters.endDate !== undefined) {
    query += " AND donationDate <= ?";
    params.push(filters.endDate);
  }

  query += " ORDER BY donationDate DESC LIMIT ? OFFSET ?";
  params.push(limit, offset);

  const result = await db.prepare(query).bind(...params).all<CivicDonation>();
  return result.results;
}

export async function createDonation(
  db: D1Database,
  donation: CivicDonation
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO civic_donations (
        id, tenantId, organizationId, memberId, donationType, amountKobo, currency,
        description, receiptNumber, paymentMethod, paymentReference, eventId,
        recordedBy, donationDate, createdAt, updatedAt
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
    )
    .bind(
      donation.id, donation.tenantId, donation.organizationId, donation.memberId ?? null,
      donation.donationType, donation.amountKobo, donation.currency,
      donation.description ?? null, donation.receiptNumber ?? null,
      donation.paymentMethod, donation.paymentReference ?? null,
      donation.eventId ?? null, donation.recordedBy, donation.donationDate,
      donation.createdAt, donation.updatedAt
    )
    .run();
}

export async function getDonationSummary(
  db: D1Database,
  tenantId: string,
  organizationId: string,
  startDate: number,
  endDate: number
): Promise<{ donationType: string; totalKobo: number; count: number }[]> {
  const result = await db
    .prepare(
      `SELECT donationType, SUM(amountKobo) as totalKobo, COUNT(*) as count
       FROM civic_donations
       WHERE tenantId = ? AND organizationId = ? AND deletedAt IS NULL
         AND donationDate >= ? AND donationDate <= ?
       GROUP BY donationType`
    )
    .bind(tenantId, organizationId, startDate, endDate)
    .all<{ donationType: string; totalKobo: number; count: number }>();
  return result.results;
}

export async function getTotalDonationsKobo(
  db: D1Database,
  tenantId: string,
  organizationId: string
): Promise<number> {
  const result = await db
    .prepare(
      "SELECT SUM(amountKobo) as total FROM civic_donations WHERE tenantId = ? AND organizationId = ? AND deletedAt IS NULL"
    )
    .bind(tenantId, organizationId)
    .first<{ total: number | null }>();
  return result?.total ?? 0;
}

// ─── Pledge Queries ───────────────────────────────────────────────────────────

export async function getPledgesByOrg(
  db: D1Database,
  tenantId: string,
  organizationId: string,
  status?: string
): Promise<CivicPledge[]> {
  let query = `SELECT * FROM civic_pledges
    WHERE tenantId = ? AND organizationId = ? AND deletedAt IS NULL`;
  const params: unknown[] = [tenantId, organizationId];

  if (status !== undefined) {
    query += " AND pledgeStatus = ?";
    params.push(status);
  }

  query += " ORDER BY pledgeDate DESC";
  const result = await db.prepare(query).bind(...params).all<CivicPledge>();
  return result.results;
}

export async function createPledge(
  db: D1Database,
  pledge: CivicPledge
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO civic_pledges (
        id, tenantId, organizationId, memberId, description,
        totalAmountKobo, paidAmountKobo, currency, pledgeStatus,
        pledgeDate, dueDate, createdAt, updatedAt
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`
    )
    .bind(
      pledge.id, pledge.tenantId, pledge.organizationId, pledge.memberId,
      pledge.description, pledge.totalAmountKobo, pledge.paidAmountKobo,
      pledge.currency, pledge.pledgeStatus, pledge.pledgeDate,
      pledge.dueDate ?? null, pledge.createdAt, pledge.updatedAt
    )
    .run();
}

export async function recordPledgePayment(
  db: D1Database,
  pledgeId: string,
  tenantId: string,
  paymentKobo: number
): Promise<CivicPledge | null> {
  const now = Date.now();
  const pledge = await db
    .prepare("SELECT * FROM civic_pledges WHERE id = ? AND tenantId = ? AND deletedAt IS NULL")
    .bind(pledgeId, tenantId)
    .first<CivicPledge>();

  if (pledge === null) return null;

  const newPaidAmount = pledge.paidAmountKobo + paymentKobo;
  const isFulfilled = newPaidAmount >= pledge.totalAmountKobo;
  const newStatus = isFulfilled ? "fulfilled" : pledge.pledgeStatus;

  await db
    .prepare(
      `UPDATE civic_pledges SET
        paidAmountKobo = ?, pledgeStatus = ?,
        fulfilledAt = ?, updatedAt = ?
       WHERE id = ? AND tenantId = ?`
    )
    .bind(
      newPaidAmount, newStatus,
      isFulfilled ? now : null, now,
      pledgeId, tenantId
    )
    .run();

  return { ...pledge, paidAmountKobo: newPaidAmount, pledgeStatus: newStatus };
}

// ─── Event Queries ────────────────────────────────────────────────────────────

export async function getEventsByOrg(
  db: D1Database,
  tenantId: string,
  organizationId: string,
  limit = 20,
  offset = 0
): Promise<CivicEvent[]> {
  const result = await db
    .prepare(
      `SELECT * FROM civic_events
       WHERE tenantId = ? AND organizationId = ? AND deletedAt IS NULL
       ORDER BY startTime DESC LIMIT ? OFFSET ?`
    )
    .bind(tenantId, organizationId, limit, offset)
    .all<CivicEvent>();
  return result.results;
}

export async function createEvent(
  db: D1Database,
  event: CivicEvent
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO civic_events (
        id, tenantId, organizationId, title, description, eventType,
        venue, startTime, endTime, expectedAttendance, offeringAmountKobo,
        currency, notes, createdBy, createdAt, updatedAt
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
    )
    .bind(
      event.id, event.tenantId, event.organizationId, event.title,
      event.description ?? null, event.eventType, event.venue ?? null,
      event.startTime, event.endTime ?? null, event.expectedAttendance ?? null,
      event.offeringAmountKobo, event.currency, event.notes ?? null,
      event.createdBy, event.createdAt, event.updatedAt
    )
    .run();
}

export async function recordAttendance(
  db: D1Database,
  attendance: CivicAttendance
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO civic_attendance (
        id, tenantId, organizationId, eventId, memberId, guestName,
        checkedInAt, checkedInBy, createdAt, updatedAt
      ) VALUES (?,?,?,?,?,?,?,?,?,?)`
    )
    .bind(
      attendance.id, attendance.tenantId, attendance.organizationId,
      attendance.eventId, attendance.memberId ?? null, attendance.guestName ?? null,
      attendance.checkedInAt, attendance.checkedInBy ?? null,
      attendance.createdAt, attendance.updatedAt
    )
    .run();
}

export async function getAttendanceByEvent(
  db: D1Database,
  eventId: string,
  tenantId: string
): Promise<CivicAttendance[]> {
  const result = await db
    .prepare(
      "SELECT * FROM civic_attendance WHERE eventId = ? AND tenantId = ? ORDER BY checkedInAt ASC"
    )
    .bind(eventId, tenantId)
    .all<CivicAttendance>();
  return result.results;
}

// ─── Grant Queries ────────────────────────────────────────────────────────────

export async function getGrantsByOrg(
  db: D1Database,
  tenantId: string,
  organizationId: string
): Promise<CivicGrant[]> {
  const result = await db
    .prepare(
      `SELECT * FROM civic_grants
       WHERE tenantId = ? AND organizationId = ? AND deletedAt IS NULL
       ORDER BY createdAt DESC`
    )
    .bind(tenantId, organizationId)
    .all<CivicGrant>();
  return result.results;
}

export async function createGrant(
  db: D1Database,
  grant: CivicGrant
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO civic_grants (
        id, tenantId, organizationId, title, description, grantorName,
        grantorContact, totalAmountKobo, disbursedAmountKobo, currency,
        grantStatus, applicationDate, createdBy, createdAt, updatedAt
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
    )
    .bind(
      grant.id, grant.tenantId, grant.organizationId, grant.title,
      grant.description ?? null, grant.grantorName, grant.grantorContact ?? null,
      grant.totalAmountKobo, grant.disbursedAmountKobo, grant.currency,
      grant.grantStatus, grant.applicationDate ?? null,
      grant.createdBy, grant.createdAt, grant.updatedAt
    )
    .run();
}

export async function disburseGrant(
  db: D1Database,
  grantId: string,
  tenantId: string,
  amountKobo: number
): Promise<void> {
  const now = Date.now();
  await db
    .prepare(
      `UPDATE civic_grants SET
        disbursedAmountKobo = disbursedAmountKobo + ?,
        grantStatus = 'disbursed',
        disbursementDate = ?,
        updatedAt = ?
       WHERE id = ? AND tenantId = ? AND deletedAt IS NULL`
    )
    .bind(amountKobo, now, now, grantId, tenantId)
    .run();
}

// ─── Announcement Queries ─────────────────────────────────────────────────────

export async function getAnnouncementsByOrg(
  db: D1Database,
  tenantId: string,
  organizationId: string
): Promise<CivicAnnouncement[]> {
  const now = Date.now();
  const result = await db
    .prepare(
      `SELECT * FROM civic_announcements
       WHERE tenantId = ? AND organizationId = ? AND deletedAt IS NULL
         AND (publishedAt IS NULL OR publishedAt <= ?)
         AND (expiresAt IS NULL OR expiresAt > ?)
       ORDER BY createdAt DESC LIMIT 20`
    )
    .bind(tenantId, organizationId, now, now)
    .all<CivicAnnouncement>();
  return result.results;
}

// ─── Dashboard Summary ────────────────────────────────────────────────────────

export interface DashboardSummary {
  totalMembers: number;
  totalDonationsKobo: number;
  activePledgesCount: number;
  upcomingEventsCount: number;
}

export async function getDashboardSummary(
  db: D1Database,
  tenantId: string,
  organizationId: string
): Promise<DashboardSummary> {
  const now = Date.now();

  const batchResults = await db.batch<
    { count: number } | { total: number | null }
  >([
    db.prepare(
      "SELECT COUNT(*) as count FROM civic_members WHERE tenantId = ? AND organizationId = ? AND deletedAt IS NULL AND memberStatus = 'active'"
    ).bind(tenantId, organizationId),
    db.prepare(
      "SELECT SUM(amountKobo) as total FROM civic_donations WHERE tenantId = ? AND organizationId = ? AND deletedAt IS NULL"
    ).bind(tenantId, organizationId),
    db.prepare(
      "SELECT COUNT(*) as count FROM civic_pledges WHERE tenantId = ? AND organizationId = ? AND deletedAt IS NULL AND pledgeStatus = 'active'"
    ).bind(tenantId, organizationId),
    db.prepare(
      "SELECT COUNT(*) as count FROM civic_events WHERE tenantId = ? AND organizationId = ? AND deletedAt IS NULL AND startTime > ?"
    ).bind(tenantId, organizationId, now),
  ]);

  const members = batchResults[0]?.results[0] as { count: number } | undefined;
  const donations = batchResults[1]?.results[0] as { total: number | null } | undefined;
  const pledges = batchResults[2]?.results[0] as { count: number } | undefined;
  const events = batchResults[3]?.results[0] as { count: number } | undefined;

  return {
    totalMembers: members?.count ?? 0,
    totalDonationsKobo: donations?.total ?? 0,
    activePledgesCount: pledges?.count ?? 0,
    upcomingEventsCount: events?.count ?? 0,
  };
}
