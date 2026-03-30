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
  CivicBudget,
  CivicDepartment,
  CivicDonation,
  CivicEvent,
  CivicExpense,
  CivicExpenseStatus,
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

// ─── Departments ──────────────────────────────────────────────────────────────

export async function getDepartmentsByOrg(
  db: D1Database,
  tenantId: string,
  organizationId: string
): Promise<CivicDepartment[]> {
  const result = await db
    .prepare(
      `SELECT * FROM civic_departments
       WHERE tenantId = ? AND organizationId = ? AND deletedAt IS NULL
       ORDER BY name ASC`
    )
    .bind(tenantId, organizationId)
    .all<CivicDepartment>();
  return result.results;
}

export async function getDepartmentById(
  db: D1Database,
  id: string,
  tenantId: string
): Promise<CivicDepartment | null> {
  const result = await db
    .prepare(
      `SELECT * FROM civic_departments
       WHERE id = ? AND tenantId = ? AND deletedAt IS NULL`
    )
    .bind(id, tenantId)
    .first<CivicDepartment>();
  return result ?? null;
}

export async function createDepartment(
  db: D1Database,
  dept: CivicDepartment
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO civic_departments (
        id, tenantId, organizationId, name, description, leaderId, createdAt, updatedAt
      ) VALUES (?,?,?,?,?,?,?,?)`
    )
    .bind(
      dept.id, dept.tenantId, dept.organizationId, dept.name,
      dept.description ?? null, dept.leaderId ?? null,
      dept.createdAt, dept.updatedAt
    )
    .run();
}

export async function updateDepartment(
  db: D1Database,
  id: string,
  tenantId: string,
  updates: Partial<Pick<CivicDepartment, "name" | "description" | "leaderId">>
): Promise<void> {
  const now = Date.now();
  await db
    .prepare(
      `UPDATE civic_departments
       SET name = COALESCE(?, name),
           description = COALESCE(?, description),
           leaderId = COALESCE(?, leaderId),
           updatedAt = ?
       WHERE id = ? AND tenantId = ? AND deletedAt IS NULL`
    )
    .bind(
      updates.name ?? null,
      updates.description ?? null,
      updates.leaderId ?? null,
      now, id, tenantId
    )
    .run();
}

export async function softDeleteDepartment(
  db: D1Database,
  id: string,
  tenantId: string
): Promise<void> {
  const now = Date.now();
  await db
    .prepare(
      `UPDATE civic_departments SET deletedAt = ?, updatedAt = ?
       WHERE id = ? AND tenantId = ? AND deletedAt IS NULL`
    )
    .bind(now, now, id, tenantId)
    .run();
}

// ─── Members (continued) ──────────────────────────────────────────────────────

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

// ─── Expenses ─────────────────────────────────────────────────────────────────

export interface ExpenseFilters {
  departmentId?: string;
  status?: CivicExpenseStatus;
  category?: string;
  fromDate?: number;
  toDate?: number;
}

export async function getExpensesByOrg(
  db: D1Database,
  tenantId: string,
  organizationId: string,
  filters: ExpenseFilters = {},
  limit = 50,
  offset = 0
): Promise<CivicExpense[]> {
  let sql = `SELECT * FROM civic_expenses
             WHERE tenantId = ? AND organizationId = ? AND deletedAt IS NULL`;
  const params: unknown[] = [tenantId, organizationId];
  if (filters.departmentId) { sql += " AND departmentId = ?"; params.push(filters.departmentId); }
  if (filters.status) { sql += " AND status = ?"; params.push(filters.status); }
  if (filters.category) { sql += " AND category = ?"; params.push(filters.category); }
  if (filters.fromDate) { sql += " AND expenseDate >= ?"; params.push(filters.fromDate); }
  if (filters.toDate) { sql += " AND expenseDate <= ?"; params.push(filters.toDate); }
  sql += " ORDER BY expenseDate DESC LIMIT ? OFFSET ?";
  params.push(limit, offset);
  const result = await db.prepare(sql).bind(...params).all<CivicExpense>();
  return result.results;
}

export async function createExpense(
  db: D1Database,
  expense: CivicExpense
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO civic_expenses (
        id, tenantId, organizationId, departmentId, category, description,
        amountKobo, currency, expenseDate, receiptUrl, recordedBy, approvedBy,
        status, notes, createdAt, updatedAt
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
    )
    .bind(
      expense.id, expense.tenantId, expense.organizationId,
      expense.departmentId ?? null, expense.category, expense.description,
      expense.amountKobo, expense.currency, expense.expenseDate,
      expense.receiptUrl ?? null, expense.recordedBy, expense.approvedBy ?? null,
      expense.status, expense.notes ?? null, expense.createdAt, expense.updatedAt
    )
    .run();
}

export async function updateExpenseStatus(
  db: D1Database,
  id: string,
  tenantId: string,
  status: CivicExpenseStatus,
  approvedBy?: string
): Promise<void> {
  const now = Date.now();
  await db
    .prepare(
      `UPDATE civic_expenses
       SET status = ?, approvedBy = COALESCE(?, approvedBy), updatedAt = ?
       WHERE id = ? AND tenantId = ? AND deletedAt IS NULL`
    )
    .bind(status, approvedBy ?? null, now, id, tenantId)
    .run();
}

export async function softDeleteExpense(
  db: D1Database,
  id: string,
  tenantId: string
): Promise<void> {
  const now = Date.now();
  await db
    .prepare(
      `UPDATE civic_expenses SET deletedAt = ?, updatedAt = ?
       WHERE id = ? AND tenantId = ? AND deletedAt IS NULL`
    )
    .bind(now, now, id, tenantId)
    .run();
}

export async function getTotalExpensesKobo(
  db: D1Database,
  tenantId: string,
  organizationId: string,
  year?: number
): Promise<number> {
  let sql = `SELECT COALESCE(SUM(amountKobo), 0) as total FROM civic_expenses
             WHERE tenantId = ? AND organizationId = ? AND status = 'approved' AND deletedAt IS NULL`;
  const params: unknown[] = [tenantId, organizationId];
  if (year) {
    const start = new Date(year, 0, 1).getTime();
    const end = new Date(year + 1, 0, 1).getTime();
    sql += " AND expenseDate >= ? AND expenseDate < ?";
    params.push(start, end);
  }
  const result = await db.prepare(sql).bind(...params).first<{ total: number }>();
  return result?.total ?? 0;
}

// ─── Budgets ──────────────────────────────────────────────────────────────────

export async function getBudgetsByOrg(
  db: D1Database,
  tenantId: string,
  organizationId: string,
  year?: number
): Promise<CivicBudget[]> {
  let sql = `SELECT * FROM civic_budgets
             WHERE tenantId = ? AND organizationId = ?`;
  const params: unknown[] = [tenantId, organizationId];
  if (year) { sql += " AND year = ?"; params.push(year); }
  sql += " ORDER BY year DESC, month ASC, category ASC";
  const result = await db.prepare(sql).bind(...params).all<CivicBudget>();
  return result.results;
}

export async function createBudget(
  db: D1Database,
  budget: CivicBudget
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO civic_budgets (
        id, tenantId, organizationId, departmentId, year, month,
        category, amountKobo, currency, notes, createdAt, updatedAt
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`
    )
    .bind(
      budget.id, budget.tenantId, budget.organizationId,
      budget.departmentId ?? null, budget.year, budget.month ?? null,
      budget.category, budget.amountKobo, budget.currency,
      budget.notes ?? null, budget.createdAt, budget.updatedAt
    )
    .run();
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

// ═══════════════════════════════════════════════════════════════════════════════
// CIV-2: POLITICAL PARTY MANAGEMENT — Query Helpers
// Blueprint Reference: Part 9.3 (Zero Direct Database Clients)
// Part 10.9 (Civic & Political Suite — Political Party Management)
// ═══════════════════════════════════════════════════════════════════════════════

import type {
  PartyOrganization,
  PartyStructure,
  PartyMember,
  PartyDues,
  PartyPosition,
  PartyMeeting,
  PartyAnnouncement,
  PartyIdCard,
  PartyNomination,
  NominationStatus,
  PartyCampaignAccount,
  PartyCampaignTransaction,
  CampaignPositionLevel,
  CampaignTransactionType,
  ElectionResultCollation,
  CollationLevel,
  CollationStatus,
} from "./schema.ts";

// ─── Party Organization Queries ───────────────────────────────────────────────

export async function getPartyOrganizationByTenant(
  db: D1Database,
  tenantId: string
): Promise<PartyOrganization | null> {
  return db
    .prepare("SELECT * FROM party_organizations WHERE tenantId = ? AND deletedAt IS NULL LIMIT 1")
    .bind(tenantId)
    .first<PartyOrganization>();
}

export async function createPartyOrganization(
  db: D1Database,
  org: PartyOrganization
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO party_organizations
        (id, tenantId, name, abbreviation, motto, logoUrl, foundedYear,
         inecRegistrationNumber, currency, timezone, annualDuesKobo, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      org.id, org.tenantId, org.name, org.abbreviation,
      org.motto ?? null, org.logoUrl ?? null, org.foundedYear ?? null,
      org.inecRegistrationNumber ?? null, org.currency, org.timezone,
      org.annualDuesKobo, org.createdAt, org.updatedAt
    )
    .run();
}

export async function updatePartyOrganization(
  db: D1Database,
  id: string,
  tenantId: string,
  updates: Partial<PartyOrganization>
): Promise<void> {
  await db
    .prepare(
      `UPDATE party_organizations SET
        name = COALESCE(?, name),
        abbreviation = COALESCE(?, abbreviation),
        motto = COALESCE(?, motto),
        logoUrl = COALESCE(?, logoUrl),
        foundedYear = COALESCE(?, foundedYear),
        inecRegistrationNumber = COALESCE(?, inecRegistrationNumber),
        currency = COALESCE(?, currency),
        timezone = COALESCE(?, timezone),
        annualDuesKobo = COALESCE(?, annualDuesKobo),
        updatedAt = ?
       WHERE id = ? AND tenantId = ? AND deletedAt IS NULL`
    )
    .bind(
      updates.name ?? null, updates.abbreviation ?? null, updates.motto ?? null,
      updates.logoUrl ?? null, updates.foundedYear ?? null,
      updates.inecRegistrationNumber ?? null, updates.currency ?? null,
      updates.timezone ?? null, updates.annualDuesKobo ?? null,
      Date.now(), id, tenantId
    )
    .run();
}

// ─── Party Structure Queries ──────────────────────────────────────────────────

export async function getPartyStructuresByOrg(
  db: D1Database,
  tenantId: string,
  organizationId: string,
  parentId?: string | null
): Promise<PartyStructure[]> {
  if (parentId === null) {
    const result = await db
      .prepare(
        "SELECT * FROM party_structures WHERE tenantId = ? AND organizationId = ? AND parentId IS NULL AND deletedAt IS NULL ORDER BY level, name"
      )
      .bind(tenantId, organizationId)
      .all<PartyStructure>();
    return result.results;
  }
  if (parentId !== undefined) {
    const result = await db
      .prepare(
        "SELECT * FROM party_structures WHERE tenantId = ? AND organizationId = ? AND parentId = ? AND deletedAt IS NULL ORDER BY name"
      )
      .bind(tenantId, organizationId, parentId)
      .all<PartyStructure>();
    return result.results;
  }
  const result = await db
    .prepare(
      "SELECT * FROM party_structures WHERE tenantId = ? AND organizationId = ? AND deletedAt IS NULL ORDER BY level, name"
    )
    .bind(tenantId, organizationId)
    .all<PartyStructure>();
  return result.results;
}

export async function getPartyStructureById(
  db: D1Database,
  id: string,
  tenantId: string
): Promise<PartyStructure | null> {
  return db
    .prepare("SELECT * FROM party_structures WHERE id = ? AND tenantId = ? AND deletedAt IS NULL")
    .bind(id, tenantId)
    .first<PartyStructure>();
}

export async function createPartyStructure(
  db: D1Database,
  structure: PartyStructure
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO party_structures
        (id, tenantId, organizationId, parentId, level, name, code, state, lga, ward,
         chairpersonId, secretaryId, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      structure.id, structure.tenantId, structure.organizationId,
      structure.parentId ?? null, structure.level, structure.name,
      structure.code ?? null, structure.state ?? null, structure.lga ?? null,
      structure.ward ?? null, structure.chairpersonId ?? null,
      structure.secretaryId ?? null, structure.createdAt, structure.updatedAt
    )
    .run();
}

export async function updatePartyStructure(
  db: D1Database,
  id: string,
  tenantId: string,
  updates: Partial<PartyStructure>
): Promise<void> {
  await db
    .prepare(
      `UPDATE party_structures SET
        name = COALESCE(?, name),
        code = COALESCE(?, code),
        state = COALESCE(?, state),
        lga = COALESCE(?, lga),
        ward = COALESCE(?, ward),
        chairpersonId = COALESCE(?, chairpersonId),
        secretaryId = COALESCE(?, secretaryId),
        updatedAt = ?
       WHERE id = ? AND tenantId = ? AND deletedAt IS NULL`
    )
    .bind(
      updates.name ?? null, updates.code ?? null, updates.state ?? null,
      updates.lga ?? null, updates.ward ?? null,
      updates.chairpersonId ?? null, updates.secretaryId ?? null,
      Date.now(), id, tenantId
    )
    .run();
}

export async function softDeletePartyStructure(
  db: D1Database,
  id: string,
  tenantId: string
): Promise<void> {
  await db
    .prepare("UPDATE party_structures SET deletedAt = ?, updatedAt = ? WHERE id = ? AND tenantId = ?")
    .bind(Date.now(), Date.now(), id, tenantId)
    .run();
}

// ─── Party Member Queries ─────────────────────────────────────────────────────

export interface PartyMemberFilters {
  structureId?: string;
  memberStatus?: string;
  role?: string;
  search?: string;
  page?: number;
  limit?: number;
}

export async function getPartyMembersByOrg(
  db: D1Database,
  tenantId: string,
  organizationId: string,
  filters: PartyMemberFilters = {}
): Promise<{ members: PartyMember[]; total: number }> {
  const { structureId, memberStatus, role, search, page = 1, limit = 20 } = filters;
  const offset = (page - 1) * limit;
  const conditions: string[] = [
    "tenantId = ?", "organizationId = ?", "deletedAt IS NULL",
  ];
  const params: unknown[] = [tenantId, organizationId];
  if (structureId) { conditions.push("structureId = ?"); params.push(structureId); }
  if (memberStatus) { conditions.push("memberStatus = ?"); params.push(memberStatus); }
  if (role) { conditions.push("role = ?"); params.push(role); }
  if (search) {
    conditions.push("(firstName LIKE ? OR lastName LIKE ? OR membershipNumber LIKE ? OR phone LIKE ?)");
    const s = `%${search}%`;
    params.push(s, s, s, s);
  }
  const where = conditions.join(" AND ");
  const [countResult, membersResult] = await db.batch<PartyMember | { count: number }>([
    db.prepare(`SELECT COUNT(*) as count FROM party_members WHERE ${where}`).bind(...params),
    db.prepare(`SELECT * FROM party_members WHERE ${where} ORDER BY lastName, firstName LIMIT ? OFFSET ?`).bind(...params, limit, offset),
  ]);
  const total = (countResult.results[0] as { count: number })?.count ?? 0;
  return { members: membersResult.results as PartyMember[], total };
}

export async function getPartyMemberById(
  db: D1Database,
  id: string,
  tenantId: string
): Promise<PartyMember | null> {
  return db
    .prepare("SELECT * FROM party_members WHERE id = ? AND tenantId = ? AND deletedAt IS NULL")
    .bind(id, tenantId)
    .first<PartyMember>();
}

export async function createPartyMember(
  db: D1Database,
  member: PartyMember
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO party_members
        (id, tenantId, organizationId, structureId, membershipNumber, firstName, lastName,
         middleName, dateOfBirth, gender, phone, email, address, state, lga, ward,
         voterCardNumber, photoUrl, memberStatus, role, joinedDate,
         ndprConsent, ndprConsentDate, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      member.id, member.tenantId, member.organizationId, member.structureId,
      member.membershipNumber, member.firstName, member.lastName,
      member.middleName ?? null, member.dateOfBirth ?? null, member.gender ?? null,
      member.phone, member.email ?? null, member.address ?? null,
      member.state ?? null, member.lga ?? null, member.ward ?? null,
      member.voterCardNumber ?? null, member.photoUrl ?? null,
      member.memberStatus, member.role, member.joinedDate,
      member.ndprConsent ? 1 : 0, member.ndprConsentDate ?? null,
      member.createdAt, member.updatedAt
    )
    .run();
}

export async function updatePartyMember(
  db: D1Database,
  id: string,
  tenantId: string,
  updates: Partial<PartyMember>
): Promise<void> {
  await db
    .prepare(
      `UPDATE party_members SET
        firstName = COALESCE(?, firstName),
        lastName = COALESCE(?, lastName),
        middleName = COALESCE(?, middleName),
        phone = COALESCE(?, phone),
        email = COALESCE(?, email),
        address = COALESCE(?, address),
        state = COALESCE(?, state),
        lga = COALESCE(?, lga),
        ward = COALESCE(?, ward),
        voterCardNumber = COALESCE(?, voterCardNumber),
        photoUrl = COALESCE(?, photoUrl),
        memberStatus = COALESCE(?, memberStatus),
        role = COALESCE(?, role),
        structureId = COALESCE(?, structureId),
        updatedAt = ?
       WHERE id = ? AND tenantId = ? AND deletedAt IS NULL`
    )
    .bind(
      updates.firstName ?? null, updates.lastName ?? null, updates.middleName ?? null,
      updates.phone ?? null, updates.email ?? null, updates.address ?? null,
      updates.state ?? null, updates.lga ?? null, updates.ward ?? null,
      updates.voterCardNumber ?? null, updates.photoUrl ?? null,
      updates.memberStatus ?? null, updates.role ?? null, updates.structureId ?? null,
      Date.now(), id, tenantId
    )
    .run();
}

export async function softDeletePartyMember(
  db: D1Database,
  id: string,
  tenantId: string
): Promise<void> {
  await db
    .prepare("UPDATE party_members SET deletedAt = ?, updatedAt = ? WHERE id = ? AND tenantId = ?")
    .bind(Date.now(), Date.now(), id, tenantId)
    .run();
}

export async function getPartyMemberCount(
  db: D1Database,
  tenantId: string,
  organizationId: string
): Promise<number> {
  const result = await db
    .prepare("SELECT COUNT(*) as count FROM party_members WHERE tenantId = ? AND organizationId = ? AND deletedAt IS NULL AND memberStatus = 'active'")
    .bind(tenantId, organizationId)
    .first<{ count: number }>();
  return result?.count ?? 0;
}

// ─── Party Dues Queries ───────────────────────────────────────────────────────

export async function getPartyDuesByMember(
  db: D1Database,
  memberId: string,
  tenantId: string
): Promise<PartyDues[]> {
  const result = await db
    .prepare("SELECT * FROM party_dues WHERE memberId = ? AND tenantId = ? AND deletedAt IS NULL ORDER BY year DESC")
    .bind(memberId, tenantId)
    .all<PartyDues>();
  return result.results;
}

export async function getPartyDuesByOrg(
  db: D1Database,
  tenantId: string,
  organizationId: string,
  year?: number
): Promise<PartyDues[]> {
  if (year !== undefined) {
    const result = await db
      .prepare("SELECT * FROM party_dues WHERE tenantId = ? AND organizationId = ? AND year = ? AND deletedAt IS NULL ORDER BY paidAt DESC")
      .bind(tenantId, organizationId, year)
      .all<PartyDues>();
    return result.results;
  }
  const result = await db
    .prepare("SELECT * FROM party_dues WHERE tenantId = ? AND organizationId = ? AND deletedAt IS NULL ORDER BY year DESC, paidAt DESC")
    .bind(tenantId, organizationId)
    .all<PartyDues>();
  return result.results;
}

export async function createPartyDues(
  db: D1Database,
  dues: PartyDues
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO party_dues
        (id, tenantId, organizationId, memberId, year, amountKobo, paymentMethod,
         receiptNumber, paidAt, collectedBy, notes, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      dues.id, dues.tenantId, dues.organizationId, dues.memberId,
      dues.year, dues.amountKobo, dues.paymentMethod, dues.receiptNumber,
      dues.paidAt, dues.collectedBy ?? null, dues.notes ?? null,
      dues.createdAt, dues.updatedAt
    )
    .run();
}

export async function softDeletePartyDues(
  db: D1Database,
  id: string,
  tenantId: string
): Promise<void> {
  await db
    .prepare("UPDATE party_dues SET deletedAt = ?, updatedAt = ? WHERE id = ? AND tenantId = ?")
    .bind(Date.now(), Date.now(), id, tenantId)
    .run();
}

export async function getPartyDuesSummary(
  db: D1Database,
  tenantId: string,
  organizationId: string,
  year: number
): Promise<{ totalCollectedKobo: number; paymentCount: number }> {
  const result = await db
    .prepare(
      "SELECT SUM(amountKobo) as totalCollectedKobo, COUNT(*) as paymentCount FROM party_dues WHERE tenantId = ? AND organizationId = ? AND year = ? AND deletedAt IS NULL"
    )
    .bind(tenantId, organizationId, year)
    .first<{ totalCollectedKobo: number | null; paymentCount: number }>();
  return {
    totalCollectedKobo: result?.totalCollectedKobo ?? 0,
    paymentCount: result?.paymentCount ?? 0,
  };
}

// ─── Party Position Queries ───────────────────────────────────────────────────

export async function getPartyPositionsByStructure(
  db: D1Database,
  structureId: string,
  tenantId: string
): Promise<PartyPosition[]> {
  const result = await db
    .prepare("SELECT * FROM party_positions WHERE structureId = ? AND tenantId = ? AND deletedAt IS NULL ORDER BY title")
    .bind(structureId, tenantId)
    .all<PartyPosition>();
  return result.results;
}

export async function createPartyPosition(
  db: D1Database,
  position: PartyPosition
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO party_positions
        (id, tenantId, organizationId, structureId, title, holderId, electedDate,
         expiresDate, isActive, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      position.id, position.tenantId, position.organizationId, position.structureId,
      position.title, position.holderId ?? null, position.electedDate ?? null,
      position.expiresDate ?? null, position.isActive ? 1 : 0,
      position.createdAt, position.updatedAt
    )
    .run();
}

export async function updatePartyPosition(
  db: D1Database,
  id: string,
  tenantId: string,
  updates: Partial<PartyPosition>
): Promise<void> {
  await db
    .prepare(
      `UPDATE party_positions SET
        title = COALESCE(?, title),
        holderId = COALESCE(?, holderId),
        electedDate = COALESCE(?, electedDate),
        expiresDate = COALESCE(?, expiresDate),
        isActive = COALESCE(?, isActive),
        updatedAt = ?
       WHERE id = ? AND tenantId = ? AND deletedAt IS NULL`
    )
    .bind(
      updates.title ?? null, updates.holderId ?? null,
      updates.electedDate ?? null, updates.expiresDate ?? null,
      updates.isActive !== undefined ? (updates.isActive ? 1 : 0) : null,
      Date.now(), id, tenantId
    )
    .run();
}

export async function softDeletePartyPosition(
  db: D1Database,
  id: string,
  tenantId: string
): Promise<void> {
  await db
    .prepare("UPDATE party_positions SET deletedAt = ?, updatedAt = ? WHERE id = ? AND tenantId = ?")
    .bind(Date.now(), Date.now(), id, tenantId)
    .run();
}

// ─── Party Meeting Queries ────────────────────────────────────────────────────

export async function getPartyMeetingsByOrg(
  db: D1Database,
  tenantId: string,
  organizationId: string,
  structureId?: string
): Promise<PartyMeeting[]> {
  if (structureId) {
    const result = await db
      .prepare("SELECT * FROM party_meetings WHERE tenantId = ? AND organizationId = ? AND structureId = ? AND deletedAt IS NULL ORDER BY scheduledAt DESC")
      .bind(tenantId, organizationId, structureId)
      .all<PartyMeeting>();
    return result.results;
  }
  const result = await db
    .prepare("SELECT * FROM party_meetings WHERE tenantId = ? AND organizationId = ? AND deletedAt IS NULL ORDER BY scheduledAt DESC")
    .bind(tenantId, organizationId)
    .all<PartyMeeting>();
  return result.results;
}

export async function createPartyMeeting(
  db: D1Database,
  meeting: PartyMeeting
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO party_meetings
        (id, tenantId, organizationId, structureId, title, meetingType, venue,
         scheduledAt, minutesUrl, attendeeCount, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      meeting.id, meeting.tenantId, meeting.organizationId, meeting.structureId,
      meeting.title, meeting.meetingType, meeting.venue ?? null,
      meeting.scheduledAt, meeting.minutesUrl ?? null, meeting.attendeeCount ?? null,
      meeting.createdAt, meeting.updatedAt
    )
    .run();
}

export async function updatePartyMeeting(
  db: D1Database,
  id: string,
  tenantId: string,
  updates: Partial<PartyMeeting>
): Promise<void> {
  await db
    .prepare(
      `UPDATE party_meetings SET
        title = COALESCE(?, title),
        meetingType = COALESCE(?, meetingType),
        venue = COALESCE(?, venue),
        scheduledAt = COALESCE(?, scheduledAt),
        minutesUrl = COALESCE(?, minutesUrl),
        attendeeCount = COALESCE(?, attendeeCount),
        updatedAt = ?
       WHERE id = ? AND tenantId = ? AND deletedAt IS NULL`
    )
    .bind(
      updates.title ?? null, updates.meetingType ?? null, updates.venue ?? null,
      updates.scheduledAt ?? null, updates.minutesUrl ?? null,
      updates.attendeeCount ?? null, Date.now(), id, tenantId
    )
    .run();
}

export async function softDeletePartyMeeting(
  db: D1Database,
  id: string,
  tenantId: string
): Promise<void> {
  await db
    .prepare("UPDATE party_meetings SET deletedAt = ?, updatedAt = ? WHERE id = ? AND tenantId = ?")
    .bind(Date.now(), Date.now(), id, tenantId)
    .run();
}

// ─── Party Announcement Queries ───────────────────────────────────────────────

export async function getPartyAnnouncementsByOrg(
  db: D1Database,
  tenantId: string,
  organizationId: string
): Promise<PartyAnnouncement[]> {
  const result = await db
    .prepare("SELECT * FROM party_announcements WHERE tenantId = ? AND organizationId = ? AND deletedAt IS NULL ORDER BY createdAt DESC")
    .bind(tenantId, organizationId)
    .all<PartyAnnouncement>();
  return result.results;
}

export async function createPartyAnnouncement(
  db: D1Database,
  announcement: PartyAnnouncement
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO party_announcements
        (id, tenantId, organizationId, structureId, title, content, priority,
         publishedAt, expiresAt, createdBy, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      announcement.id, announcement.tenantId, announcement.organizationId,
      announcement.structureId ?? null, announcement.title, announcement.content,
      announcement.priority, announcement.publishedAt ?? null,
      announcement.expiresAt ?? null, announcement.createdBy,
      announcement.createdAt, announcement.updatedAt
    )
    .run();
}

// ─── Party ID Card Queries ────────────────────────────────────────────────────

export async function getPartyIdCardByMember(
  db: D1Database,
  memberId: string,
  tenantId: string
): Promise<PartyIdCard | null> {
  return db
    .prepare("SELECT * FROM party_id_cards WHERE memberId = ? AND tenantId = ? AND isActive = 1 AND deletedAt IS NULL LIMIT 1")
    .bind(memberId, tenantId)
    .first<PartyIdCard>();
}

export async function createPartyIdCard(
  db: D1Database,
  card: PartyIdCard
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO party_id_cards
        (id, tenantId, organizationId, memberId, cardNumber, issuedAt, expiresAt,
         cardImageUrl, isActive, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      card.id, card.tenantId, card.organizationId, card.memberId,
      card.cardNumber, card.issuedAt, card.expiresAt ?? null,
      card.cardImageUrl ?? null, card.isActive ? 1 : 0,
      card.createdAt, card.updatedAt
    )
    .run();
}

export async function revokePartyIdCard(
  db: D1Database,
  id: string,
  tenantId: string,
  reason: string
): Promise<void> {
  const now = Date.now();
  await db
    .prepare(
      "UPDATE party_id_cards SET isActive = 0, revokedAt = ?, revokedReason = ?, updatedAt = ? WHERE id = ? AND tenantId = ?"
    )
    .bind(now, reason, now, id, tenantId)
    .run();
}

// ─── Party Dashboard Summary ──────────────────────────────────────────────────

export async function getPartyDashboardSummary(
  db: D1Database,
  tenantId: string,
  organizationId: string
): Promise<{
  totalMembers: number;
  activeMembers: number;
  totalDuesCollectedKobo: number;
  currentYearDuesKobo: number;
  totalStructures: number;
  upcomingMeetings: number;
}> {
  const currentYear = new Date().getFullYear();
  const now = Date.now();
  const batchResults = await db.batch([
    db.prepare("SELECT COUNT(*) as count FROM party_members WHERE tenantId = ? AND organizationId = ? AND deletedAt IS NULL").bind(tenantId, organizationId),
    db.prepare("SELECT COUNT(*) as count FROM party_members WHERE tenantId = ? AND organizationId = ? AND memberStatus = 'active' AND deletedAt IS NULL").bind(tenantId, organizationId),
    db.prepare("SELECT SUM(amountKobo) as total FROM party_dues WHERE tenantId = ? AND organizationId = ? AND deletedAt IS NULL").bind(tenantId, organizationId),
    db.prepare("SELECT SUM(amountKobo) as total FROM party_dues WHERE tenantId = ? AND organizationId = ? AND year = ? AND deletedAt IS NULL").bind(tenantId, organizationId, currentYear),
    db.prepare("SELECT COUNT(*) as count FROM party_structures WHERE tenantId = ? AND organizationId = ? AND deletedAt IS NULL").bind(tenantId, organizationId),
    db.prepare("SELECT COUNT(*) as count FROM party_meetings WHERE tenantId = ? AND organizationId = ? AND scheduledAt > ? AND deletedAt IS NULL").bind(tenantId, organizationId, now),
  ]);
  return {
    totalMembers: (batchResults[0]?.results[0] as { count: number })?.count ?? 0,
    activeMembers: (batchResults[1]?.results[0] as { count: number })?.count ?? 0,
    totalDuesCollectedKobo: (batchResults[2]?.results[0] as { total: number | null })?.total ?? 0,
    currentYearDuesKobo: (batchResults[3]?.results[0] as { total: number | null })?.total ?? 0,
    totalStructures: (batchResults[4]?.results[0] as { count: number })?.count ?? 0,
    upcomingMeetings: (batchResults[5]?.results[0] as { count: number })?.count ?? 0,
  };
}

// ─── Party Nominations (T004 / P05) ──────────────────────────────────────────

export async function getPartyNominations(
  db: D1Database,
  tenantId: string,
  organizationId: string,
  status?: NominationStatus
): Promise<PartyNomination[]> {
  const sql = status
    ? "SELECT * FROM party_nominations WHERE tenantId = ? AND organizationId = ? AND status = ? AND deletedAt IS NULL ORDER BY nominatedAt DESC"
    : "SELECT * FROM party_nominations WHERE tenantId = ? AND organizationId = ? AND deletedAt IS NULL ORDER BY nominatedAt DESC";
  const stmt = status
    ? db.prepare(sql).bind(tenantId, organizationId, status)
    : db.prepare(sql).bind(tenantId, organizationId);
  const res = await stmt.all<PartyNomination>();
  return res.results ?? [];
}

export async function createPartyNomination(
  db: D1Database,
  nom: PartyNomination
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO party_nominations (id, tenantId, organizationId, memberId, position, constituency,
       electionRef, status, nominatorId, nominatedAt, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      nom.id, nom.tenantId, nom.organizationId, nom.memberId, nom.position,
      nom.constituency, nom.electionRef ?? null, nom.status, nom.nominatorId,
      nom.nominatedAt, nom.createdAt, nom.updatedAt
    )
    .run();
}

export async function updatePartyNominationStatus(
  db: D1Database,
  id: string,
  tenantId: string,
  status: NominationStatus,
  actorId: string,
  notes?: string
): Promise<PartyNomination | null> {
  const now = Date.now();
  await db
    .prepare(
      `UPDATE party_nominations SET status = ?, vettedBy = ?, vettingNotes = COALESCE(?, vettingNotes), updatedAt = ?
       WHERE id = ? AND tenantId = ? AND deletedAt IS NULL`
    )
    .bind(status, actorId, notes ?? null, now, id, tenantId)
    .run();
  const res = await db
    .prepare("SELECT * FROM party_nominations WHERE id = ? AND tenantId = ?")
    .bind(id, tenantId)
    .first<PartyNomination>();
  return res ?? null;
}

// ─── Campaign Finance (T005 / P06) ───────────────────────────────────────────

export async function createCampaignAccount(
  db: D1Database,
  account: PartyCampaignAccount
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO party_campaign_accounts (id, tenantId, organizationId, electionRef, candidateId,
       positionLevel, limitKobo, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      account.id, account.tenantId, account.organizationId,
      account.electionRef ?? null, account.candidateId ?? null,
      account.positionLevel, account.limitKobo, account.createdAt, account.updatedAt
    )
    .run();
}

export async function getCampaignAccounts(
  db: D1Database,
  tenantId: string,
  organizationId: string
): Promise<PartyCampaignAccount[]> {
  const res = await db
    .prepare(
      "SELECT * FROM party_campaign_accounts WHERE tenantId = ? AND organizationId = ? AND deletedAt IS NULL ORDER BY createdAt DESC"
    )
    .bind(tenantId, organizationId)
    .all<PartyCampaignAccount>();
  return res.results ?? [];
}

export async function getCampaignAccountById(
  db: D1Database,
  id: string,
  tenantId: string
): Promise<PartyCampaignAccount | null> {
  return (
    (await db
      .prepare("SELECT * FROM party_campaign_accounts WHERE id = ? AND tenantId = ? AND deletedAt IS NULL")
      .bind(id, tenantId)
      .first<PartyCampaignAccount>()) ?? null
  );
}

export async function addCampaignTransaction(
  db: D1Database,
  tx: PartyCampaignTransaction
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO party_campaign_transactions (id, tenantId, organizationId, accountId, transactionType,
       category, description, amountKobo, currency, transactionDate, evidenceUrl, recordedBy, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      tx.id, tx.tenantId, tx.organizationId, tx.accountId, tx.transactionType,
      tx.category, tx.description, tx.amountKobo, tx.currency, tx.transactionDate,
      tx.evidenceUrl ?? null, tx.recordedBy, tx.createdAt, tx.updatedAt
    )
    .run();
}

export async function getCampaignTransactions(
  db: D1Database,
  accountId: string,
  tenantId: string,
  transactionType?: CampaignTransactionType
): Promise<PartyCampaignTransaction[]> {
  const sql = transactionType
    ? "SELECT * FROM party_campaign_transactions WHERE accountId = ? AND tenantId = ? AND transactionType = ? AND deletedAt IS NULL ORDER BY transactionDate DESC"
    : "SELECT * FROM party_campaign_transactions WHERE accountId = ? AND tenantId = ? AND deletedAt IS NULL ORDER BY transactionDate DESC";
  const stmt = transactionType
    ? db.prepare(sql).bind(accountId, tenantId, transactionType)
    : db.prepare(sql).bind(accountId, tenantId);
  const res = await stmt.all<PartyCampaignTransaction>();
  return res.results ?? [];
}

export async function getCampaignFinanceSummary(
  db: D1Database,
  accountId: string,
  tenantId: string
): Promise<{ totalIncomeKobo: number; totalExpenditureKobo: number; transactionCount: number }> {
  const res = await db.batch([
    db.prepare("SELECT COALESCE(SUM(amountKobo),0) as total FROM party_campaign_transactions WHERE accountId = ? AND tenantId = ? AND transactionType = 'income' AND deletedAt IS NULL").bind(accountId, tenantId),
    db.prepare("SELECT COALESCE(SUM(amountKobo),0) as total FROM party_campaign_transactions WHERE accountId = ? AND tenantId = ? AND transactionType = 'expenditure' AND deletedAt IS NULL").bind(accountId, tenantId),
    db.prepare("SELECT COUNT(*) as count FROM party_campaign_transactions WHERE accountId = ? AND tenantId = ? AND deletedAt IS NULL").bind(accountId, tenantId),
  ]);
  return {
    totalIncomeKobo: (res[0]?.results[0] as { total: number })?.total ?? 0,
    totalExpenditureKobo: (res[1]?.results[0] as { total: number })?.total ?? 0,
    transactionCount: (res[2]?.results[0] as { count: number })?.count ?? 0,
  };
}

// ─── Election Result Collations (T006 / EL02) ────────────────────────────────

export async function createResultCollation(
  db: D1Database,
  row: ElectionResultCollation
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO election_result_collations (id, tenantId, electionId, candidateId, level,
       pollingUnit, ward, lga, state, votesCount, spoiltVotes, accreditedVoters,
       collatedBy, collatedAt, status, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      row.id, row.tenantId, row.electionId, row.candidateId, row.level,
      row.pollingUnit ?? null, row.ward ?? null, row.lga ?? null, row.state ?? null,
      row.votesCount, row.spoiltVotes ?? null, row.accreditedVoters ?? null,
      row.collatedBy, row.collatedAt, row.status, row.createdAt, row.updatedAt
    )
    .run();
}

export async function getElectionCollations(
  db: D1Database,
  electionId: string,
  tenantId: string,
  level?: CollationLevel
): Promise<ElectionResultCollation[]> {
  const sql = level
    ? "SELECT * FROM election_result_collations WHERE electionId = ? AND tenantId = ? AND level = ? ORDER BY collatedAt DESC"
    : "SELECT * FROM election_result_collations WHERE electionId = ? AND tenantId = ? ORDER BY collatedAt DESC";
  const stmt = level
    ? db.prepare(sql).bind(electionId, tenantId, level)
    : db.prepare(sql).bind(electionId, tenantId);
  const res = await stmt.all<ElectionResultCollation>();
  return res.results ?? [];
}

export async function certifyCollation(
  db: D1Database,
  id: string,
  tenantId: string,
  certifiedBy: string
): Promise<ElectionResultCollation | null> {
  const now = Date.now();
  await db
    .prepare(
      "UPDATE election_result_collations SET status = 'certified', certifiedBy = ?, certifiedAt = ?, updatedAt = ? WHERE id = ? AND tenantId = ?"
    )
    .bind(certifiedBy, now, now, id, tenantId)
    .run();
  return (
    (await db
      .prepare("SELECT * FROM election_result_collations WHERE id = ? AND tenantId = ?")
      .bind(id, tenantId)
      .first<ElectionResultCollation>()) ?? null
  );
}

export async function getPublicElectionResults(
  db: D1Database,
  electionId: string
): Promise<{ candidateId: string; totalVotes: number; percentage: number }[]> {
  const res = await db
    .prepare(
      `SELECT candidateId, SUM(votesCount) as totalVotes FROM election_result_collations
       WHERE electionId = ? AND status = 'certified' GROUP BY candidateId ORDER BY totalVotes DESC`
    )
    .bind(electionId)
    .all<{ candidateId: string; totalVotes: number }>();
  const rows = res.results ?? [];
  const grandTotal = rows.reduce((s, r) => s + r.totalVotes, 0);
  return rows.map((r) => ({
    candidateId: r.candidateId,
    totalVotes: r.totalVotes,
    percentage: grandTotal > 0 ? Math.round((r.totalVotes / grandTotal) * 10000) / 100 : 0,
  }));
}

export async function getPublicCollationBreakdown(
  db: D1Database,
  electionId: string,
  level?: CollationLevel
): Promise<ElectionResultCollation[]> {
  const sql = level
    ? "SELECT * FROM election_result_collations WHERE electionId = ? AND level = ? AND status = 'certified' ORDER BY collatedAt DESC"
    : "SELECT * FROM election_result_collations WHERE electionId = ? AND status = 'certified' ORDER BY collatedAt DESC";
  const stmt = level
    ? db.prepare(sql).bind(electionId, level)
    : db.prepare(sql).bind(electionId);
  const res = await stmt.all<ElectionResultCollation>();
  return res.results ?? [];
}
