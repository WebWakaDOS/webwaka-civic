/**
 * WebWaka Civic — CORE-2 Platform Event Bus Integration
 * Blueprint Reference: Part 5 (Platform Event Bus), Part 9.2 (Event-Driven Architecture)
 *
 * All financial transactions and critical state changes must publish events
 * via the event bus. This module provides the integration layer.
 */

import { createLogger } from "../logger";

const logger = createLogger("event-bus");

// ─── Event Types ──────────────────────────────────────────────────────────────

export type CivicEventType =
  | "civic.member.registered"
  | "civic.member.updated"
  | "civic.member.deactivated"
  | "civic.donation.recorded"
  | "civic.donation.deleted"
  | "civic.pledge.created"
  | "civic.pledge.payment_recorded"
  | "civic.pledge.fulfilled"
  | "civic.event.created"
  | "civic.event.attendance_recorded"
  | "civic.grant.disbursed"
  | "civic.member.created"
  | "civic.donation.received"
  | "civic.grant.approved"
  // CIV-2: Political Party Events [Part 10.9]
  | "party.member.registered"
  | "party.member.suspended"
  | "party.member.expelled"
  | "party.dues.paid"
  | "party.dues.overdue"
  | "party.position.assigned"
  | "party.meeting.scheduled"
  | "party.id_card.issued"
  | "party.id_card.revoked"
  | "party.structure.created"
  | "party.announcement.published"
  // CIV-3: Elections & Campaigns Events [Part 10.9]
  | "election.created"
  | "election.nomination_started"
  | "election.voting_started"
  | "election.results_announced"
  | "election.closed"
  | "candidate.nominated"
  | "candidate.approved"
  | "candidate.rejected"
  | "vote.cast"
  | "vote.verified"
  | "volunteer.registered"
  | "volunteer.task_assigned"
  | "volunteer.task_completed"
  | "donation.received"
  | "donation.refunded"
  | "expense.recorded"
  | "expense.approved"
  | "material.published"
  | "announcement.posted";

/**
 * CIVIC_EVENTS — named constants for all event types.
 * Use these instead of raw strings to avoid typos.
 */
export const CIVIC_EVENTS = {
  MEMBER_CREATED: "civic.member.created" as CivicEventType,
  MEMBER_REGISTERED: "civic.member.registered" as CivicEventType,
  MEMBER_UPDATED: "civic.member.updated" as CivicEventType,
  MEMBER_DEACTIVATED: "civic.member.deactivated" as CivicEventType,
  DONATION_RECEIVED: "civic.donation.received" as CivicEventType,
  DONATION_RECORDED: "civic.donation.recorded" as CivicEventType,
  DONATION_DELETED: "civic.donation.deleted" as CivicEventType,
  PLEDGE_CREATED: "civic.pledge.created" as CivicEventType,
  PLEDGE_PAYMENT_RECORDED: "civic.pledge.payment_recorded" as CivicEventType,
  PLEDGE_FULFILLED: "civic.pledge.fulfilled" as CivicEventType,
  EVENT_CREATED: "civic.event.created" as CivicEventType,
  EVENT_ATTENDANCE_RECORDED: "civic.event.attendance_recorded" as CivicEventType,
  GRANT_APPROVED: "civic.grant.approved" as CivicEventType,
  GRANT_DISBURSED: "civic.grant.disbursed" as CivicEventType,
  // CIV-3: Elections & Campaigns Events
  ELECTION_CREATED: "election.created" as CivicEventType,
  ELECTION_NOMINATION_STARTED: "election.nomination_started" as CivicEventType,
  ELECTION_VOTING_STARTED: "election.voting_started" as CivicEventType,
  ELECTION_RESULTS_ANNOUNCED: "election.results_announced" as CivicEventType,
  ELECTION_CLOSED: "election.closed" as CivicEventType,
  CANDIDATE_NOMINATED: "candidate.nominated" as CivicEventType,
  CANDIDATE_APPROVED: "candidate.approved" as CivicEventType,
  CANDIDATE_REJECTED: "candidate.rejected" as CivicEventType,
  VOTE_CAST: "vote.cast" as CivicEventType,
  VOTE_VERIFIED: "vote.verified" as CivicEventType,
  VOLUNTEER_REGISTERED: "volunteer.registered" as CivicEventType,
  VOLUNTEER_TASK_ASSIGNED: "volunteer.task_assigned" as CivicEventType,
  VOLUNTEER_TASK_COMPLETED: "volunteer.task_completed" as CivicEventType,
  DONATION_RECEIVED_CAMPAIGN: "donation.received" as CivicEventType,
  DONATION_REFUNDED: "donation.refunded" as CivicEventType,
  EXPENSE_RECORDED: "expense.recorded" as CivicEventType,
  EXPENSE_APPROVED: "expense.approved" as CivicEventType,
  MATERIAL_PUBLISHED: "material.published" as CivicEventType,
  ANNOUNCEMENT_POSTED: "announcement.posted" as CivicEventType,
} as const;

export interface CivicEvent {
  type: CivicEventType;
  tenantId: string;
  organizationId: string;
  payload: Record<string, unknown>;
  timestamp: string;
  version: "1.0";
}

// ─── Environment ──────────────────────────────────────────────────────────────

export interface EventBusEnv {
  EVENT_BUS_URL: string | undefined;
  EVENT_BUS_TOKEN: string | undefined;
}

// ─── Event Bus Client ─────────────────────────────────────────────────────────

export type EventHandler = (event: CivicEvent) => void | Promise<void>;

export class EventBus {
  private readonly env: EventBusEnv;
  private readonly handlers: Map<CivicEventType, EventHandler[]> = new Map();
  private readonly fetchFn: typeof fetch;

  constructor(env: EventBusEnv, fetchFn?: typeof fetch) {
    this.env = env;
    this.fetchFn = fetchFn ?? fetch;
  }

  /**
   * Publish an event to the CORE-2 Platform Event Bus.
   * Falls back to local handlers if the event bus URL is not configured.
   */
  async publish(
    type: CivicEventType,
    tenantId: string,
    organizationId: string,
    payload: Record<string, unknown>
  ): Promise<boolean> {
    const event: CivicEvent = {
      type,
      tenantId,
      organizationId,
      payload,
      timestamp: new Date().toISOString(),
      version: "1.0",
    };

    // Invoke local handlers first (for testing and local processing)
    await this.invokeLocalHandlers(event);

    // Publish to remote event bus if configured
    if (this.env.EVENT_BUS_URL !== undefined && this.env.EVENT_BUS_TOKEN !== undefined) {
      return this.publishRemote(event);
    } else {
      logger.warn("Event bus URL not configured — event published locally only", { type, tenantId });
      return false;
    }
  }

  private async invokeLocalHandlers(event: CivicEvent): Promise<void> {
    const handlers = this.handlers.get(event.type) ?? [];
    for (const handler of handlers) {
      try {
        await handler(event);
      } catch (err) {
        logger.error("Local event handler failed", {
          type: event.type,
          error: String(err),
        });
      }
    }
  }

  private async publishRemote(event: CivicEvent): Promise<boolean> {
    if (this.env.EVENT_BUS_URL === undefined || this.env.EVENT_BUS_TOKEN === undefined) {
      return false;
    }

    try {
      const response = await this.fetchFn(this.env.EVENT_BUS_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.env.EVENT_BUS_TOKEN}`,
        },
        body: JSON.stringify(event),
      });

      if (!response.ok) {
        logger.error("Event bus publish failed", {
          status: response.status,
          type: event.type,
        });
        return false;
      } else {
        logger.info("Event published to CORE-2 bus", {
          type: event.type,
          tenantId: event.tenantId,
        });
        return true;
      }
    } catch (err) {
      logger.error("Event bus network error", {
        type: event.type,
        error: String(err),
      });
      return false;
    }
  }

  /**
   * Register a local event handler (used in tests and local processing).
   */
  on(type: CivicEventType, handler: EventHandler): void {
    const existing = this.handlers.get(type) ?? [];
    this.handlers.set(type, [...existing, handler]);
  }

  /**
   * Remove all handlers for a given event type (used in tests).
   */
  off(type: CivicEventType): void {
    this.handlers.delete(type);
  }
}

export function createEventBus(env: EventBusEnv, fetchFn?: typeof fetch): EventBus {
  return new EventBus(env, fetchFn);
}

// ─── CIV-2: Political Party Event Constants ───────────────────────────────────

/**
 * PARTY_EVENTS — named constants for all CIV-2 Political Party event types.
 * Blueprint Reference: Part 5 (Platform Event Bus), Part 10.9
 */
export const PARTY_EVENTS = {
  MEMBER_REGISTERED: "party.member.registered" as CivicEventType,
  MEMBER_SUSPENDED: "party.member.suspended" as CivicEventType,
  MEMBER_EXPELLED: "party.member.expelled" as CivicEventType,
  DUES_PAID: "party.dues.paid" as CivicEventType,
  DUES_OVERDUE: "party.dues.overdue" as CivicEventType,
  POSITION_ASSIGNED: "party.position.assigned" as CivicEventType,
  MEETING_SCHEDULED: "party.meeting.scheduled" as CivicEventType,
  ID_CARD_ISSUED: "party.id_card.issued" as CivicEventType,
  ID_CARD_REVOKED: "party.id_card.revoked" as CivicEventType,
  STRUCTURE_CREATED: "party.structure.created" as CivicEventType,
  ANNOUNCEMENT_PUBLISHED: "party.announcement.published" as CivicEventType,
} as const;

export type PartyEventType = typeof PARTY_EVENTS[keyof typeof PARTY_EVENTS];
