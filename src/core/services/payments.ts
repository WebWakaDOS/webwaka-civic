/**
 * WebWaka Civic — Platform Payment Service Client
 * CORE-PAYMENTS: Emits payment events consumed by the platform Paystack Worker.
 * NO direct Paystack SDK or API calls here.
 * Build Once Use Everywhere: this file is the single entrypoint for all
 * payment initiation across CIV-1, CIV-2, and CIV-3.
 *
 * All monetary values are in kobo (Nigerian convention: 1 NGN = 100 kobo).
 */

import { emitEvent } from "@webwaka/core";
import type { EventBusEnv } from "../event-bus/index";

// ─── Types ────────────────────────────────────────────────────────────────────

export type PaymentProvider = "paystack";

export type PaymentCurrency = "NGN";

export type PaymentStatus =
  | "pending"
  | "processing"
  | "success"
  | "failed"
  | "refunded";

export type PaymentCategory =
  | "donation"
  | "pledge_payment"
  | "membership_dues"
  | "event_registration"
  | "campaign_contribution"
  | "other";

export interface PaymentInitRequest {
  tenantId: string;
  organizationId: string;
  amountKobo: number;
  currency?: PaymentCurrency;
  customerEmail: string;
  customerPhone?: string;
  customerName?: string;
  category: PaymentCategory;
  referenceId: string;
  callbackUrl?: string;
  metadata?: Record<string, unknown>;
  idempotencyKey?: string;
}

export interface PaymentInitResult {
  queued: boolean;
  referenceId: string;
  idempotencyKey: string;
}

export interface PaystackWebhookBody {
  event: string;
  data: {
    reference: string;
    amount: number;
    currency: string;
    status: string;
    customer?: {
      email?: string;
      phone?: string;
    };
    metadata?: Record<string, unknown>;
    paid_at?: string;
    channel?: string;
  };
}

export interface PaymentWebhookVerifyResult {
  valid: boolean;
  body?: PaystackWebhookBody;
}

export type PaymentWebhookHandler = (
  env: EventBusEnv & { PAYSTACK_SECRET: string },
  request: Request
) => Promise<Response>;

// ─── HMAC Signature Verification ─────────────────────────────────────────────

/**
 * verifyPaystackWebhook — validates the x-paystack-signature header using
 * HMAC-SHA512 against PAYSTACK_SECRET. Web Crypto compatible (Cloudflare Workers).
 */
export async function verifyPaystackWebhook(
  body: string,
  signature: string,
  secret: string
): Promise<boolean> {
  try {
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(secret),
      { name: "HMAC", hash: "SHA-512" },
      false,
      ["sign"]
    );
    const mac = await crypto.subtle.sign("HMAC", key, encoder.encode(body));
    const hex = Array.from(new Uint8Array(mac))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    return hex === signature;
  } catch {
    return false;
  }
}

// ─── Service ──────────────────────────────────────────────────────────────────

/**
 * PaymentService — thin client that converts payment requests into platform
 * events. The platform CORE-PAYMENTS Worker calls Paystack and returns results
 * via webhook events.
 *
 * @example
 *   const svc = new PaymentService(c.env);
 *   await svc.initializePayment({
 *     tenantId: payload.tenantId,
 *     organizationId: payload.organizationId,
 *     amountKobo: donation.amountKobo,
 *     customerEmail: donor.email,
 *     category: "donation",
 *     referenceId: donation.id,
 *   });
 */
export class PaymentService {
  constructor(private readonly env: EventBusEnv) {}

  async initializePayment(
    req: PaymentInitRequest
  ): Promise<PaymentInitResult> {
    const key =
      req.idempotencyKey ??
      `pay:${req.tenantId}:${req.referenceId}:${req.amountKobo}`;

    await emitEvent(
      this.env,
      "payment.initialize.requested",
      req.tenantId,
      {
        organizationId: req.organizationId,
        amountKobo: req.amountKobo,
        currency: req.currency ?? "NGN",
        customerEmail: req.customerEmail,
        customerPhone: req.customerPhone,
        customerName: req.customerName,
        category: req.category,
        referenceId: req.referenceId,
        callbackUrl: req.callbackUrl,
        metadata: req.metadata,
        idempotencyKey: key,
        provider: "paystack",
      }
    );

    return { queued: true, referenceId: req.referenceId, idempotencyKey: key };
  }

  async handleWebhook(
    body: string,
    signature: string,
    secret: string,
    tenantId: string
  ): Promise<PaymentWebhookVerifyResult> {
    const valid = await verifyPaystackWebhook(body, signature, secret);
    if (!valid) return { valid: false };

    let parsed: PaystackWebhookBody;
    try {
      parsed = JSON.parse(body) as PaystackWebhookBody;
    } catch {
      return { valid: false };
    }

    const eventType = parsed.data.status === "success"
      ? "payment.verified"
      : "payment.failed";

    await emitEvent(this.env, eventType, tenantId, {
      webhookEvent: parsed.event,
      reference: parsed.data.reference,
      amountKobo: parsed.data.amount,
      currency: parsed.data.currency,
      status: parsed.data.status,
      customerEmail: parsed.data.customer?.email,
      paidAt: parsed.data.paid_at,
      channel: parsed.data.channel,
      metadata: parsed.data.metadata,
    });

    return { valid: true, body: parsed };
  }
}

export function createPaymentService(env: EventBusEnv): PaymentService {
  return new PaymentService(env);
}

/**
 * createPaystackWebhookHandler — returns a Worker-compatible webhook handler
 * for the /api/webhooks/paystack endpoint.
 * Verifies HMAC signature, resolves tenantId via callback, emits payment events
 * once, returns 200 immediately.
 */
export function createPaystackWebhookHandler(
  getTenantId: (body: PaystackWebhookBody) => string
): PaymentWebhookHandler {
  return async (
    env: EventBusEnv & { PAYSTACK_SECRET: string },
    request: Request
  ): Promise<Response> => {
    const rawBody = await request.text();
    const signature = request.headers.get("x-paystack-signature") ?? "";

    const valid = await verifyPaystackWebhook(rawBody, signature, env.PAYSTACK_SECRET);
    if (!valid) {
      return new Response(JSON.stringify({ error: "Invalid signature" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    let parsed: PaystackWebhookBody;
    try {
      parsed = JSON.parse(rawBody) as PaystackWebhookBody;
    } catch {
      return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const tenantId = getTenantId(parsed);
    const svc = new PaymentService(env);
    await svc.handleWebhook(rawBody, signature, env.PAYSTACK_SECRET, tenantId);

    return new Response(JSON.stringify({ received: true }), {
      headers: { "Content-Type": "application/json" },
    });
  };
}
