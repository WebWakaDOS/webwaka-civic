/**
 * WebWaka Civic — Platform Notification Service Client
 * CORE-COMMS: Emits notification.requested events consumed by the platform
 * delivery layer (WhatsApp/SMS/Push/Email). NO direct SDK calls here.
 * Build Once Use Everywhere: this file is the single entrypoint for all
 * notification requests across CIV-1, CIV-2, and CIV-3.
 */

import { emitEvent } from "@webwaka/core";
import type { EventBusEnv } from "../event-bus/index";

// ─── Types ────────────────────────────────────────────────────────────────────

export type NotificationChannel = "whatsapp" | "sms" | "push" | "email";

export type NotificationPriority = "critical" | "high" | "normal" | "low";

export interface NotificationRequest {
  tenantId: string;
  organizationId: string;
  recipientUserId?: string;
  recipientPhone?: string;
  recipientEmail?: string;
  channel: NotificationChannel;
  templateId: string;
  data: Record<string, unknown>;
  priority?: NotificationPriority;
  idempotencyKey?: string;
  locale?: "en" | "yo" | "ig" | "ha";
}

export interface NotificationResult {
  queued: boolean;
  idempotencyKey: string;
}

// ─── Service ──────────────────────────────────────────────────────────────────

export class NotificationService {
  constructor(private readonly env: EventBusEnv) {}

  async requestNotification(req: NotificationRequest): Promise<NotificationResult> {
    const key =
      req.idempotencyKey ??
      `notif:${req.tenantId}:${req.templateId}:${req.recipientPhone ?? req.recipientEmail ?? req.recipientUserId ?? "anon"}:${Date.now()}`;

    const payload: Record<string, unknown> = {
      organizationId: req.organizationId,
      channel: req.channel,
      templateId: req.templateId,
      data: req.data,
      priority: req.priority ?? "normal",
      idempotencyKey: key,
      locale: req.locale ?? "en",
    };
    // Only set optional fields when they have actual values (exactOptionalPropertyTypes safe)
    if (req.recipientUserId !== undefined) payload["recipientUserId"] = req.recipientUserId;
    if (req.recipientPhone !== undefined) payload["recipientPhone"] = req.recipientPhone;
    if (req.recipientEmail !== undefined) payload["recipientEmail"] = req.recipientEmail;

    await emitEvent(this.env, "notification.requested", req.tenantId, payload);

    return { queued: true, idempotencyKey: key };
  }

  async sendWelcome(
    _env: EventBusEnv,
    opts: {
      tenantId: string;
      organizationId: string;
      recipientPhone?: string;
      recipientEmail?: string;
      name: string;
      membershipNumber: string;
      locale?: "en" | "yo" | "ig" | "ha";
    }
  ): Promise<NotificationResult> {
    const req: NotificationRequest = {
      tenantId: opts.tenantId,
      organizationId: opts.organizationId,
      channel: opts.recipientPhone ? "whatsapp" : "email",
      templateId: "member.welcome",
      data: { name: opts.name, membershipNumber: opts.membershipNumber },
      priority: "high",
    };
    if (opts.recipientPhone !== undefined) req.recipientPhone = opts.recipientPhone;
    if (opts.recipientEmail !== undefined) req.recipientEmail = opts.recipientEmail;
    if (opts.locale !== undefined) req.locale = opts.locale;
    return this.requestNotification(req);
  }

  async sendDuesReminder(opts: {
    tenantId: string;
    organizationId: string;
    recipientPhone?: string;
    name: string;
    year: number;
    amountKobo: number;
    locale?: "en" | "yo" | "ig" | "ha";
  }): Promise<NotificationResult> {
    const req: NotificationRequest = {
      tenantId: opts.tenantId,
      organizationId: opts.organizationId,
      channel: "sms",
      templateId: "dues.reminder",
      data: { name: opts.name, year: opts.year, amountKobo: opts.amountKobo },
      priority: "normal",
    };
    if (opts.recipientPhone !== undefined) req.recipientPhone = opts.recipientPhone;
    if (opts.locale !== undefined) req.locale = opts.locale;
    return this.requestNotification(req);
  }
}

export function createNotificationService(env: EventBusEnv): NotificationService {
  return new NotificationService(env);
}
