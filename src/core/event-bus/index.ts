/**
 * WebWaka Civic — Platform Event Bus
 * Blueprint Reference: Part 5 (Platform Event Bus), Part 9.2
 *
 * Standardized to CF Queues producer pattern (matches commerce & professional).
 *   Server-side: publishEvent(c.env.CIVIC_EVENTS, event)
 *   Dev / tests:  falls back to in-memory eventBus
 *
 * DO NOT use HTTP callbacks or raw EVENT_BUS_URL/EVENT_BUS_TOKEN.
 */

import { createLogger } from "../logger";

const logger = createLogger("event-bus");

// ─── Event Types ──────────────────────────────────────────────────────────────

export type CivicEventType =
  | "civic.member.created"
  | "civic.member.registered"
  | "civic.member.updated"
  | "civic.member.deactivated"
  | "civic.donation.received"
  | "civic.donation.recorded"
  | "civic.donation.deleted"
  | "civic.pledge.created"
  | "civic.pledge.payment_recorded"
  | "civic.pledge.fulfilled"
  | "civic.event.created"
  | "civic.event.attendance_recorded"
  | "civic.grant.approved"
  | "civic.grant.disbursed"
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
  | "notification.requested"
  | "payment.initialize.requested"
  | "payment.webhook.received"
  | "payment.verified"
  | "payment.failed"
  | "document.generation.requested"
  | "document.generation.completed";

export const CIVIC_EVENTS = {
  MEMBER_CREATED: "civic.member.created" as CivicEventType,
  MEMBER_REGISTERED: "civic.member.registered" as CivicEventType,
  MEMBER_UPDATED: "civic.member.updated" as CivicEventType,
  MEMBER_DEACTIVATED: "civic.member.deactivated" as CivicEventType,
  DONATION_RECEIVED: "civic.donation.received" as CivicEventType,
  DONATION_RECORDED: "civic.donation.recorded" as CivicEventType,
  GRANT_APPROVED: "civic.grant.approved" as CivicEventType,
  GRANT_DISBURSED: "civic.grant.disbursed" as CivicEventType,
  ELECTION_CREATED: "election.created" as CivicEventType,
  VOTE_CAST: "vote.cast" as CivicEventType,
  VOLUNTEER_REGISTERED: "volunteer.registered" as CivicEventType,
} as const;

// ─── Canonical Event Schema ───────────────────────────────────────────────────

export interface WebWakaEvent<T = Record<string, unknown>> {
  id: string;
  tenantId: string;
  type: string;
  sourceModule: string;
  timestamp: number;
  payload: T;
}

// ─── CF Queue interface ───────────────────────────────────────────────────────

export interface EventQueue {
  send(message: WebWakaEvent): Promise<void>;
}

// ─── CF Queues Producer ───────────────────────────────────────────────────────

export async function publishEvent(
  queue: EventQueue | null | undefined,
  event: WebWakaEvent,
): Promise<void> {
  if (queue) {
    await queue.send(event);
  } else {
    logger.warn("CIVIC_EVENTS queue not bound — falling back to in-memory bus", { type: event.type });
    await eventBus.publish(event);
  }
}

// ─── CF Queues Consumer Dispatcher ───────────────────────────────────────────

export type EventHandler = (event: WebWakaEvent) => Promise<void>;
const consumerHandlers = new Map<string, EventHandler[]>();

export function registerHandler(eventType: string, handler: EventHandler): void {
  if (!consumerHandlers.has(eventType)) consumerHandlers.set(eventType, []);
  consumerHandlers.get(eventType)!.push(handler);
}

export function clearHandlers(): void { consumerHandlers.clear(); }

export async function dispatchEvent(event: WebWakaEvent): Promise<void> {
  const handlers = consumerHandlers.get(event.type) ?? [];
  await Promise.allSettled(handlers.map(h => h(event)));
}

// ─── In-Memory Bus (dev / tests) ─────────────────────────────────────────────

export class EventBusRegistry {
  private handlers: Map<string, EventHandler[]> = new Map();
  subscribe(eventType: string, handler: EventHandler): void {
    if (!this.handlers.has(eventType)) this.handlers.set(eventType, []);
    this.handlers.get(eventType)!.push(handler);
  }
  async publish(event: WebWakaEvent): Promise<void> {
    const handlers = this.handlers.get(event.type) ?? [];
    await Promise.allSettled(handlers.map(h => h(event)));
  }
}

export const eventBus = new EventBusRegistry();

// ─── Event factory helpers ────────────────────────────────────────────────────

function generateEventId(): string {
  return `evt_civ_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

export function createCivicEvent<T = Record<string, unknown>>(
  tenantId: string,
  type: CivicEventType,
  payload: T,
): WebWakaEvent<T> {
  return { id: generateEventId(), tenantId, type, sourceModule: "civic", timestamp: Date.now(), payload };
}

/** @deprecated Legacy compatibility — EventBus class used in old code. Use publishEvent() instead. */
export class EventBus {
  constructor(private readonly queue?: EventQueue | null) {}
  async publish(eventType: CivicEventType, tenantId: string, organizationId: string, payload: Record<string, unknown>): Promise<boolean> {
    const event = createCivicEvent(tenantId, eventType, { ...payload, organizationId });
    await publishEvent(this.queue ?? null, event);
    return true;
  }
  subscribe(eventType: string, handler: EventHandler): void {
    eventBus.subscribe(eventType, handler);
  }
}
