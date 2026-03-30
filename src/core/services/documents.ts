/**
 * WebWaka Civic — Platform Document Service Client
 * CORE-DOCS: Emits document.generation.requested events consumed by the
 * platform PDF/document Worker. NO direct PDF SDK calls here.
 * Build Once Use Everywhere: this file is the single entrypoint for all
 * document generation requests across CIV-1, CIV-2, and CIV-3.
 */

import { emitEvent } from "@webwaka/core";
import type { EventBusEnv } from "../event-bus/index";

// ─── Types ────────────────────────────────────────────────────────────────────

export type DocumentTemplate =
  | "donation_receipt"
  | "pledge_statement"
  | "member_id_card"
  | "party_id_card"
  | "annual_report"
  | "campaign_finance_report"
  | "voter_certificate"
  | "event_ticket"
  | "grant_letter"
  | "dues_receipt";

export type DocumentDeliveryChannel =
  | "whatsapp"
  | "email"
  | "download_link"
  | "none";

export type DocumentFormat = "pdf" | "png" | "jpg";

export interface DocumentRequest {
  tenantId: string;
  organizationId: string;
  template: DocumentTemplate;
  data: Record<string, unknown>;
  format?: DocumentFormat;
  deliveryChannel?: DocumentDeliveryChannel;
  recipientPhone?: string;
  recipientEmail?: string;
  recipientName?: string;
  locale?: "en" | "yo" | "ig" | "ha";
  idempotencyKey?: string;
  callbackEventType?: string;
}

export interface DocumentResult {
  queued: boolean;
  idempotencyKey: string;
}

// ─── Service ──────────────────────────────────────────────────────────────────

/**
 * DocumentService — thin client that converts document generation requests
 * into platform events. The platform CORE-DOCS Worker generates PDFs/images
 * and delivers them via the configured channel.
 *
 * @example
 *   const svc = new DocumentService(c.env);
 *   await svc.requestDocument({
 *     tenantId: payload.tenantId,
 *     organizationId: payload.organizationId,
 *     template: "donation_receipt",
 *     data: {
 *       donorName: donor.name,
 *       amountKobo: donation.amountKobo,
 *       receiptNumber: donation.receiptNumber,
 *       date: donation.createdAt,
 *     },
 *     deliveryChannel: "whatsapp",
 *     recipientPhone: donor.phone,
 *   });
 */
export class DocumentService {
  constructor(private readonly env: EventBusEnv) {}

  async requestDocument(req: DocumentRequest): Promise<DocumentResult> {
    const key =
      req.idempotencyKey ??
      `doc:${req.tenantId}:${req.template}:${req.recipientPhone ?? req.recipientEmail ?? "anon"}:${Date.now()}`;

    await emitEvent(
      this.env,
      "document.generation.requested",
      req.tenantId,
      {
        organizationId: req.organizationId,
        template: req.template,
        data: req.data,
        format: req.format ?? "pdf",
        deliveryChannel: req.deliveryChannel ?? "none",
        recipientPhone: req.recipientPhone,
        recipientEmail: req.recipientEmail,
        recipientName: req.recipientName,
        locale: req.locale ?? "en",
        idempotencyKey: key,
        callbackEventType: req.callbackEventType,
      }
    );

    return { queued: true, idempotencyKey: key };
  }

  async requestDonationReceipt(opts: {
    tenantId: string;
    organizationId: string;
    donorName: string;
    donorPhone?: string;
    donorEmail?: string;
    amountKobo: number;
    receiptNumber: string;
    donationDate: number;
    organizationName: string;
    locale?: "en" | "yo" | "ig" | "ha";
  }): Promise<DocumentResult> {
    return this.requestDocument({
      tenantId: opts.tenantId,
      organizationId: opts.organizationId,
      template: "donation_receipt",
      data: {
        donorName: opts.donorName,
        amountKobo: opts.amountKobo,
        receiptNumber: opts.receiptNumber,
        donationDate: opts.donationDate,
        organizationName: opts.organizationName,
      },
      deliveryChannel: opts.donorPhone ? "whatsapp" : opts.donorEmail ? "email" : "none",
      recipientPhone: opts.donorPhone,
      recipientEmail: opts.donorEmail,
      recipientName: opts.donorName,
      locale: opts.locale,
    });
  }

  async requestMemberIdCard(opts: {
    tenantId: string;
    organizationId: string;
    memberName: string;
    memberPhone?: string;
    membershipNumber: string;
    photoUrl?: string;
    organizationName: string;
    expiresAt?: number;
    locale?: "en" | "yo" | "ig" | "ha";
    cardType?: "member_id_card" | "party_id_card";
  }): Promise<DocumentResult> {
    return this.requestDocument({
      tenantId: opts.tenantId,
      organizationId: opts.organizationId,
      template: opts.cardType ?? "member_id_card",
      data: {
        memberName: opts.memberName,
        membershipNumber: opts.membershipNumber,
        photoUrl: opts.photoUrl,
        organizationName: opts.organizationName,
        expiresAt: opts.expiresAt,
      },
      format: "png",
      deliveryChannel: opts.memberPhone ? "whatsapp" : "none",
      recipientPhone: opts.memberPhone,
      recipientName: opts.memberName,
      locale: opts.locale,
    });
  }

  async requestDuesReceipt(opts: {
    tenantId: string;
    organizationId: string;
    memberName: string;
    memberPhone?: string;
    year: number;
    amountKobo: number;
    receiptNumber: string;
    organizationName: string;
    locale?: "en" | "yo" | "ig" | "ha";
  }): Promise<DocumentResult> {
    return this.requestDocument({
      tenantId: opts.tenantId,
      organizationId: opts.organizationId,
      template: "dues_receipt",
      data: {
        memberName: opts.memberName,
        year: opts.year,
        amountKobo: opts.amountKobo,
        receiptNumber: opts.receiptNumber,
        organizationName: opts.organizationName,
      },
      deliveryChannel: opts.memberPhone ? "whatsapp" : "none",
      recipientPhone: opts.memberPhone,
      recipientName: opts.memberName,
      locale: opts.locale,
    });
  }

  async requestVoterCertificate(opts: {
    tenantId: string;
    organizationId: string;
    voterName: string;
    voterPhone?: string;
    electionName: string;
    votedAt: number;
    verificationCode: string;
    locale?: "en" | "yo" | "ig" | "ha";
  }): Promise<DocumentResult> {
    return this.requestDocument({
      tenantId: opts.tenantId,
      organizationId: opts.organizationId,
      template: "voter_certificate",
      data: {
        voterName: opts.voterName,
        electionName: opts.electionName,
        votedAt: opts.votedAt,
        verificationCode: opts.verificationCode,
      },
      format: "pdf",
      deliveryChannel: opts.voterPhone ? "whatsapp" : "none",
      recipientPhone: opts.voterPhone,
      recipientName: opts.voterName,
      locale: opts.locale,
    });
  }

  async requestGrantLetter(opts: {
    tenantId: string;
    organizationId: string;
    recipientName: string;
    recipientEmail?: string;
    grantTitle: string;
    amountKobo: number;
    issueDate: number;
    organizationName: string;
    locale?: "en" | "yo" | "ig" | "ha";
  }): Promise<DocumentResult> {
    return this.requestDocument({
      tenantId: opts.tenantId,
      organizationId: opts.organizationId,
      template: "grant_letter",
      data: {
        recipientName: opts.recipientName,
        grantTitle: opts.grantTitle,
        amountKobo: opts.amountKobo,
        issueDate: opts.issueDate,
        organizationName: opts.organizationName,
      },
      deliveryChannel: opts.recipientEmail ? "email" : "none",
      recipientEmail: opts.recipientEmail,
      recipientName: opts.recipientName,
      locale: opts.locale,
    });
  }
}

export function createDocumentService(env: EventBusEnv): DocumentService {
  return new DocumentService(env);
}
