/**
 * WebWaka Civic — CORE-2 Platform Event Bus Integration
 * Blueprint Reference: Part 5 (Platform Event Bus), Part 9.2 (Event-Driven Architecture)
 *
 * All financial transactions and critical state changes must publish events
 * via the event bus. This module provides the integration layer.
 *
 * Schema: Unified WebWakaEvent<T> from @webwaka/core/events
 * Ref: EVENT_BUS_SCHEMA.md — event, tenantId, payload, timestamp (number)
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
  | "announcement.posted"
  // ─── Platform Service Events (CORE-COMMS, CORE-PAYMENTS, CORE-DOCS) ──────────
  // These are published by Civic modules; the platform services consume and act on them.
  // Build Once Use Everywhere: no Paystack/WhatsApp/PDF SDKs in this repo.
  | "notification.requested"
  | "payment.initialize.requested"
  | "payment.webhook.received"
  | "payment.verified"
  | "payment.failed"
  | "document.generation.requested"
  | "document.generation.completed";

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

/**
 * Unified WebWaka Platform Event Bus Schema.
 *
 * Strictly conforms to the governance-mandated WebWakaEvent<T> shape:
 *   event (string), tenantId (string), payload (T), timestamp (number)
 *
 * Legacy fields (organizationId, version) are moved into the payload.
 *
 * Reference: EVENT_BUS_SCHEMA.md in webwaka-platform-docs
 */
export interface WebWakaEvent<T = Record<string, unknown>> {
  /** The event type in dot-notation (e.g., 'civic.member.created') */
  event: string;
  /** The ID of the tenant emitting the event */
  tenantId: string;
  /** The event-specific payload (includes organizationId and any domain fields) */
  payload: T;
  /** UTC Unix timestamp in milliseconds */
  timestamp: number;
}

/**
 * @deprecated Use WebWakaEvent<T> instead for governance compliance.
 * Kept for backward compatibility only.
 */
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

export type EventHandler = (event: WebWakaEvent) => void | Promise<void>;

export class EventBus {
  private readonly env: EventBusEnv;
  private readonly handlers: Map<string, EventHandler[]> = new Map();
  private readonly fetchFn: typeof fetch;

  constructor(env: EventBusEnv, fetchFn?: typeof fetch) {
    this.env = env;
    this.fetchFn = fetchFn ?? fetch;
  }

  /**
   * Publish an event to the CORE-2 Platform Event Bus.
   * Uses the unified WebWakaEvent<T> schema (governance-mandated).
   *
   * Legacy `organizationId` parameter is mapped into the payload object
   * to preserve domain context while conforming to the standard schema.
   *
   * Falls back to local handlers if the event bus URL is not configured.
   */
  async publish(
    eventType: CivicEventType,
    tenantId: string,
    organizationId: string,
    payload: Record<string, unknown>
  ): Promise<boolean> {
    const event: WebWakaEvent = {
      event: eventType,
      tenantId,
      payload: { ...payload, organizationId },
      timestamp: Date.now(),
    };

    // Invoke local handlers first (for testing and local processing)
    await this.invokeLocalHandlers(event);

    // Publish to remote event bus if configured
    if (this.env.EVENT_BUS_URL !== undefined && this.env.EVENT_BUS_TOKEN !== undefined) {
      return this.publishRemote(event);
    } else {
      logger.warn("Event bus URL not configured — event published locally only", { event: eventType, tenantId });
      return false;
    }
  }

  private async invokeLocalHandlers(event: WebWakaEvent): Promise<void> {
    const handlers = this.handlers.get(event.event) ?? [];
    for (const handler of handlers) {
      try {
        await handler(event);
      } catch (err) {
        logger.error("Local event handler failed", {
          event: event.event,
          error: String(err),
        });
      }
    }
  }

  private async publishRemote(event: WebWakaEvent): Promise<boolean> {
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
          event: event.event,
        });
        return false;
      } else {
        logger.info("Event published to CORE-2 bus", {
          event: event.event,
          tenantId: event.tenantId,
        });
        return true;
      }
    } catch (err) {
      logger.error("Event bus network error", {
        event: event.event,
        error: String(err),
      });
      return false;
    }
  }

  /**
   * Register a local event handler (used in tests and local processing).
   */
  on(eventType: string, handler: EventHandler): void {
    const existing = this.handlers.get(eventType) ?? [];
    this.handlers.set(eventType, [...existing, handler]);
  }

  /**
   * Remove all handlers for a given event type (used in tests).
   */
  off(eventType: string): void {
    this.handlers.delete(eventType);
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
