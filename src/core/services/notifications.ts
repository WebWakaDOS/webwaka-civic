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

/**
 * NotificationService — thin client that converts notification requests
 * into platform events. The platform CORE-COMMS Worker handles actual delivery.
 *
 * @example
 *   const svc = new NotificationService(c.env);
 *   await svc.requestNotification({
 *     tenantId: payload.tenantId,
 *     organizationId: payload.organizationId,
 *     recipientPhone: member.phone,
 *     channel: "whatsapp",
 *     templateId: "member.welcome",
 *     data: { name: member.firstName },
 *   });
 */
export class NotificationService {
  constructor(private readonly env: EventBusEnv) {}

  async requestNotification(
    req: NotificationRequest
  ): Promise<NotificationResult> {
    const key =
      req.idempotencyKey ??
      `notif:${req.tenantId}:${req.templateId}:${req.recipientPhone ?? req.recipientEmail ?? req.recipientUserId ?? "anon"}:${Date.now()}`;

    await emitEvent(
      this.env,
      "notification.requested",
      req.tenantId,
      {
        organizationId: req.organizationId,
        recipientUserId: req.recipientUserId,
        recipientPhone: req.recipientPhone,
        recipientEmail: req.recipientEmail,
        channel: req.channel,
        templateId: req.templateId,
        data: req.data,
        priority: req.priority ?? "normal",
        idempotencyKey: key,
        locale: req.locale ?? "en",
      }
    );

    return { queued: true, idempotencyKey: key };
  }

  async sendWelcome(
    env: EventBusEnv,
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
    return this.requestNotification({
      tenantId: opts.tenantId,
      organizationId: opts.organizationId,
      recipientPhone: opts.recipientPhone,
      recipientEmail: opts.recipientEmail,
      channel: opts.recipientPhone ? "whatsapp" : "email",
      templateId: "member.welcome",
      data: {
        name: opts.name,
        membershipNumber: opts.membershipNumber,
      },
      priority: "high",
      locale: opts.locale,
    });
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
    return this.requestNotification({
      tenantId: opts.tenantId,
      organizationId: opts.organizationId,
      recipientPhone: opts.recipientPhone,
      channel: "sms",
      templateId: "dues.reminder",
      data: {
        name: opts.name,
        year: opts.year,
        amountKobo: opts.amountKobo,
      },
      priority: "normal",
      locale: opts.locale,
    });
  }
}

export function createNotificationService(env: EventBusEnv): NotificationService {
  return new NotificationService(env);
}
