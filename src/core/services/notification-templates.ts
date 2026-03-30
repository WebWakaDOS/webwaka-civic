/**
 * WebWaka Civic — Notification Template Registry
 * Blueprint Reference: Part 9.3 (Platform Conventions — CORE-COMMS)
 *
 * Central registry of all templateId values used across CIV-1, CIV-2, and CIV-3.
 * These IDs are resolved by the platform CORE-COMMS Worker into actual message
 * bodies for WhatsApp, SMS, Push, or Email delivery.
 *
 * Build Once Use Infinitely: add new templates here ONLY. Never hard-code
 * template strings in module code.
 */

// ─── CIV-1: Church & NGO Templates ───────────────────────────────────────────

export const CIV1_TEMPLATES = {
  /** New member welcome — data: { name, membershipNumber } */
  MEMBER_WELCOME: "member.welcome",

  /** Donation receipt — data: { receiptNumber, amountKobo, donationType } */
  DONATION_RECEIPT: "donation.receipt",

  /** Pledge confirmation — data: { pledgeId, totalAmountKobo } */
  PLEDGE_CONFIRMATION: "pledge.confirmation",

  /** Pledge fulfilled thank-you — data: { pledgeId, totalAmountKobo } */
  PLEDGE_FULFILLED: "pledge.fulfilled",

  /** Upcoming event reminder — data: { title, startTime, venue } */
  EVENT_UPCOMING: "event.upcoming",

  /** Grant disbursed — data: { grantId, amountKobo, recipientName } */
  GRANT_DISBURSED: "grant.disbursed",

  /** Dues reminder — data: { name, year, amountKobo } */
  DUES_REMINDER: "dues.reminder",
} as const;

// ─── CIV-2: Political Party Templates ────────────────────────────────────────

export const CIV2_TEMPLATES = {
  /** Nomination created — data: { nominationId, position, constituency } */
  NOMINATION_CREATED: "party.nomination.created",

  /** Nomination approved — data: { nominationId, position, vettedBy } */
  NOMINATION_APPROVED: "party.nomination.approved",

  /** Nomination rejected — data: { nominationId, position, vettingNotes } */
  NOMINATION_REJECTED: "party.nomination.rejected",

  /** Nomination submitted to INEC — data: { nominationId, position } */
  NOMINATION_SUBMITTED: "party.nomination.submitted",

  /** Campaign finance limit warning — data: { accountId, spentPercent, positionLevel } */
  CAMPAIGN_FINANCE_LIMIT_WARNING: "campaign.finance.limit_warning",

  /** Campaign finance limit exceeded — data: { accountId, positionLevel, limitKobo } */
  CAMPAIGN_FINANCE_LIMIT_EXCEEDED: "campaign.finance.limit_exceeded",

  /** ID card issued — data: { cardNumber, memberName } */
  ID_CARD_ISSUED: "party.id_card.issued",
} as const;

// ─── CIV-3: Elections & Campaigns Templates ───────────────────────────────────

export const CIV3_TEMPLATES = {
  /** Candidate nominated — data: { nominationId, position, electionRef } */
  CANDIDATE_NOMINATED: "candidate.nominated",

  /** Vote cast confirmation — data: { electionId, candidateName } */
  VOTE_CAST: "election.vote_cast",

  /** Results published — data: { electionId, electionName, publishedAt } */
  RESULT_PUBLISHED: "election.result.published",

  /** Volunteer registered — data: { volunteerId, electionId, name } */
  VOLUNTEER_REGISTERED: "election.volunteer.registered",

  /** Task assigned to volunteer — data: { taskId, taskTitle, dueAt } */
  VOLUNTEER_TASK_ASSIGNED: "election.volunteer.task_assigned",

  /** Donation received (campaign) — data: { donationId, amountKobo, donorName } */
  CAMPAIGN_DONATION_RECEIVED: "campaign.donation.received",

  /** Campaign expense approved — data: { expenseId, amountKobo, category } */
  CAMPAIGN_EXPENSE_APPROVED: "campaign.expense.approved",
} as const;

// ─── Unified Export ───────────────────────────────────────────────────────────

export const CIVIC_NOTIFICATION_TEMPLATES = {
  ...CIV1_TEMPLATES,
  ...CIV2_TEMPLATES,
  ...CIV3_TEMPLATES,
} as const;

export type CivicNotificationTemplateId =
  (typeof CIVIC_NOTIFICATION_TEMPLATES)[keyof typeof CIVIC_NOTIFICATION_TEMPLATES];
