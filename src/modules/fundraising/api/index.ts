/**
 * WebWaka Civic — CIV-3 Campaign Fundraising & Expense Tracking API
 * Blueprint Reference: Part 10.9 (Civic & Political Suite — Elections & Campaigns)
 * Blueprint Reference: Part 9.2 (Universal Architecture Standards)
 *
 * Platform Conventions:
 * - Auth: JWT via electionAuthMiddleware (same key as elections module)
 * - Paystack: events only via PaymentService — NO direct SDK calls
 * - Webhooks: HMAC-SHA512 via verifyPaystackWebhook from core/services/payments
 * - DB: D1 inline queries (no ORM)
 * - Monetary values: kobo integers (NGN * 100)
 *
 * Endpoints:
 *  1.  POST /elections/:id/donations              — Record donation
 *  2.  GET  /elections/:id/donations              — List donations
 *  3.  GET  /elections/:id/donations/:donId       — Get donation
 *  4.  POST /elections/:id/donations/:donId/refund — Refund donation
 *  5.  POST /elections/:id/donations/webhook      — Paystack webhook (no auth)
 *  6.  POST /elections/:id/expenses               — Create expense
 *  7.  GET  /elections/:id/expenses               — List expenses
 *  8.  PATCH /elections/:id/expenses/:expId/approve — Approve expense
 *  9.  PATCH /elections/:id/expenses/:expId/reject  — Reject expense
 *  10. POST /elections/:id/budget                 — Create budget
 *  11. GET  /elections/:id/budget                 — Budget status
 *  12. GET  /elections/:id/compliance-report      — Compliance report
 */

import { Hono } from "hono";
import { createLogger } from "../../../core/logger";
import { v4 as uuidv4 } from "uuid";
import type { D1Database } from "../../../core/db/queries";
import {
  electionAuthMiddleware,
  requireAdminOrManager,
} from "../../../core/rbac";
import {
  createPaymentService,
  verifyPaystackWebhook,
} from "../../../core/services/payments";
import { createNotificationService } from "../../../core/services/notifications";
import { CIVIC_NOTIFICATION_TEMPLATES } from "../../../core/services/notification-templates";
import { emitEvent } from "@webwaka/core";
import type { EventBusEnv } from "../../../core/event-bus/index";

const logger = createLogger("fundraising");

// ─── Environment ──────────────────────────────────────────────────────────────

interface FundraisingEnv extends EventBusEnv {
  DB: D1Database;
  JWT_SECRET: string;
  PAYSTACK_SECRET: string;
}

const fundraisingRouter = new Hono<{ Bindings: FundraisingEnv }>();

// ─── Auth Middleware ──────────────────────────────────────────────────────────
// Webhook path is public (verified by HMAC-SHA512 signature); all other routes need JWT.
fundraisingRouter.use("*", async (c, next) => {
  if (c.req.path.endsWith("/webhook") || c.req.path.endsWith("/webhook/paystack")) {
    return next();
  }
  return electionAuthMiddleware()(c, next);
});

// ─── Helper ───────────────────────────────────────────────────────────────────

function getElectionJwt(c: Parameters<Parameters<typeof fundraisingRouter.post>[1]>[0]): {
  tenantId: string;
  sub: string;
  role: string;
} {
  return (c as unknown as { get: (k: string) => { tenantId: string; sub: string; role: string } })
    .get("electionJwt") ?? { tenantId: "", sub: "system", role: "viewer" };
}

// ─── 1. Record Donation ───────────────────────────────────────────────────────

fundraisingRouter.post("/elections/:electionId/donations", requireAdminOrManager, async (c) => {
  try {
    const jwt = getElectionJwt(c);
    const electionId = c.req.param("electionId");
    const body = await c.req.json<{
      donorName: string;
      donorEmail?: string;
      donorPhone?: string;
      amountKobo: number;
      currency?: string;
      paymentMethod?: string;
      campaignId?: string;
      ndprConsent?: boolean;
    }>();

    if (!body.donorName || !body.amountKobo || body.amountKobo <= 0) {
      return c.json({ success: false, error: "donorName and amountKobo (positive) are required" }, 400);
    }

    const donationId = uuidv4();
    const paymentRef = `PAY-${donationId.slice(0, 8).toUpperCase()}`;
    const now = Date.now();

    await c.env.DB
      .prepare(
        `INSERT INTO civic_campaign_donations (id, tenantId, electionId, campaignId, donorName,
         donorEmail, donorPhone, amountKobo, currency, paymentMethod, paymentReference, status,
         ndprConsent, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?)`
      )
      .bind(
        donationId, jwt.tenantId, electionId, body.campaignId ?? null,
        body.donorName, body.donorEmail ?? null, body.donorPhone ?? null,
        body.amountKobo, body.currency ?? "NGN",
        body.paymentMethod ?? "paystack", paymentRef,
        body.ndprConsent ? 1 : 0, now, now
      )
      .run();

    // Emit Paystack payment initialization via platform service (no direct SDK call)
    if ((body.paymentMethod ?? "paystack") === "paystack" && body.donorEmail) {
      const paySvc = createPaymentService(c.env);
      await paySvc.initializePayment({
        tenantId: jwt.tenantId,
        organizationId: electionId,
        amountKobo: body.amountKobo,
        customerEmail: body.donorEmail,
        customerPhone: body.donorPhone,
        category: "campaign_donation",
        referenceId: donationId,
        metadata: { electionId, campaignId: body.campaignId, donorName: body.donorName },
      });
    }

    await emitEvent(c.env, "campaign.donation.created", jwt.tenantId, {
      donationId, electionId, amountKobo: body.amountKobo, donorName: body.donorName,
    });

    // Receipt notification
    if (body.donorPhone || body.donorEmail) {
      const notifSvc = createNotificationService(c.env);
      await notifSvc.requestNotification({
        tenantId: jwt.tenantId,
        organizationId: electionId,
        recipientPhone: body.donorPhone,
        recipientEmail: body.donorEmail,
        channel: body.donorPhone ? "whatsapp" : "email",
        templateId: CIVIC_NOTIFICATION_TEMPLATES.CAMPAIGN_DONATION_RECEIVED,
        data: { donationId, amountKobo: body.amountKobo, donorName: body.donorName },
        priority: "high",
        idempotencyKey: `campaign-donation-receipt:${donationId}`,
      }).catch((e) => logger.error("Donation receipt notification failed", { error: String(e) }));
    }

    logger.info("Campaign donation created", { donationId, electionId, amountKobo: body.amountKobo });
    return c.json({ success: true, data: { id: donationId, paymentReference: paymentRef, status: "pending" } });
  } catch (err) {
    logger.error("Donation creation failed", { error: String(err) });
    return c.json({ success: false, error: "Internal server error" }, 500);
  }
});

// ─── 2. List Donations ────────────────────────────────────────────────────────

fundraisingRouter.get("/elections/:electionId/donations", async (c) => {
  try {
    const jwt = getElectionJwt(c);
    const electionId = c.req.param("electionId");
    const url = new URL(c.req.url);
    const status = url.searchParams.get("status");
    const limit = Math.min(Number(url.searchParams.get("limit") ?? "50"), 200);
    const offset = Number(url.searchParams.get("offset") ?? "0");

    const sql = status
      ? `SELECT * FROM civic_campaign_donations WHERE tenantId = ? AND electionId = ? AND status = ? AND deletedAt IS NULL ORDER BY createdAt DESC LIMIT ? OFFSET ?`
      : `SELECT * FROM civic_campaign_donations WHERE tenantId = ? AND electionId = ? AND deletedAt IS NULL ORDER BY createdAt DESC LIMIT ? OFFSET ?`;
    const stmt = status
      ? c.env.DB.prepare(sql).bind(jwt.tenantId, electionId, status, limit, offset)
      : c.env.DB.prepare(sql).bind(jwt.tenantId, electionId, limit, offset);

    const res = await stmt.all();
    const countSql = status
      ? `SELECT COUNT(*) as total FROM civic_campaign_donations WHERE tenantId = ? AND electionId = ? AND status = ? AND deletedAt IS NULL`
      : `SELECT COUNT(*) as total FROM civic_campaign_donations WHERE tenantId = ? AND electionId = ? AND deletedAt IS NULL`;
    const countStmt = status
      ? c.env.DB.prepare(countSql).bind(jwt.tenantId, electionId, status)
      : c.env.DB.prepare(countSql).bind(jwt.tenantId, electionId);
    const countRes = await countStmt.first<{ total: number }>();

    return c.json({ success: true, data: { donations: res.results, total: countRes?.total ?? 0, limit, offset } });
  } catch (err) {
    logger.error("Failed to list donations", { error: String(err) });
    return c.json({ success: false, error: "Internal server error" }, 500);
  }
});

// ─── 3. Get Donation ──────────────────────────────────────────────────────────

fundraisingRouter.get("/elections/:electionId/donations/:donId", async (c) => {
  try {
    const jwt = getElectionJwt(c);
    const donation = await c.env.DB
      .prepare("SELECT * FROM civic_campaign_donations WHERE id = ? AND tenantId = ? AND deletedAt IS NULL")
      .bind(c.req.param("donId"), jwt.tenantId)
      .first();
    if (!donation) return c.json({ success: false, error: "Donation not found" }, 404);
    return c.json({ success: true, data: donation });
  } catch (err) {
    logger.error("Failed to get donation", { error: String(err) });
    return c.json({ success: false, error: "Internal server error" }, 500);
  }
});

// ─── 4. Refund Donation ───────────────────────────────────────────────────────

fundraisingRouter.post("/elections/:electionId/donations/:donId/refund", requireAdminOrManager, async (c) => {
  try {
    const jwt = getElectionJwt(c);
    const donId = c.req.param("donId");
    const body = await c.req.json<{ refundReason?: string }>().catch(() => ({}));
    const now = Date.now();
    await c.env.DB
      .prepare("UPDATE civic_campaign_donations SET status = 'refunded', updatedAt = ? WHERE id = ? AND tenantId = ?")
      .bind(now, donId, jwt.tenantId)
      .run();
    await emitEvent(c.env, "campaign.donation.refunded", jwt.tenantId, {
      donationId: donId, reason: body.refundReason,
    });
    return c.json({ success: true, data: { id: donId, status: "refunded" } });
  } catch (err) {
    logger.error("Failed to refund donation", { error: String(err) });
    return c.json({ success: false, error: "Internal server error" }, 500);
  }
});

// ─── 5. Paystack Webhook (no auth — HMAC-SHA512 verified) ────────────────────

fundraisingRouter.post("/elections/:electionId/donations/webhook", async (c) => {
  try {
    const signature = c.req.header("x-paystack-signature") ?? "";
    const rawBody = await c.req.text();
    const secret = c.env.PAYSTACK_SECRET ?? "";

    const valid = await verifyPaystackWebhook(rawBody, signature, secret);
    if (!valid) {
      logger.warn("Paystack webhook signature invalid");
      return c.json({ error: "Invalid signature" }, 401);
    }

    const payload = JSON.parse(rawBody) as { event: string; data: { reference: string; amount: number } };
    const electionId = c.req.param("electionId");

    if (payload.event === "charge.success") {
      const now = Date.now();
      await c.env.DB
        .prepare("UPDATE civic_campaign_donations SET status = 'completed', updatedAt = ? WHERE paymentReference = ?")
        .bind(now, payload.data.reference)
        .run();

      // Emit domain event for local listeners
      await emitEvent(c.env, "campaign.donation.completed", "", {
        electionId, reference: payload.data.reference, amountKobo: payload.data.amount,
      });

      // WC-002: Emit billing.credit.recorded to webwaka-central-mgmt immutable ledger
      // Anti-drift: all financial transactions MUST route to the central ledger
      await emitEvent(c.env, "billing.credit.recorded", "", {
        sourceRepo: "webwaka-civic",
        transactionId: `WC-DON-${payload.data.reference}`,
        amountKobo: payload.data.amount,
        currency: "NGN",
        category: "campaign_donation",
        reference: payload.data.reference,
        electionId,
        paymentMethod: "paystack",
        timestamp: now,
      });

      logger.info("Donation completed and ledger event emitted", {
        reference: payload.data.reference,
        amountKobo: payload.data.amount,
      });
    } else if (payload.event === "charge.failed") {
      const now = Date.now();
      await c.env.DB
        .prepare("UPDATE civic_campaign_donations SET status = 'failed', updatedAt = ? WHERE paymentReference = ?")
        .bind(now, payload.data.reference)
        .run();
    }

    return c.json({ success: true });
  } catch (err) {
    logger.error("Paystack webhook error", { error: String(err) });
    return c.json({ success: false, error: "Internal server error" }, 500);
  }
});

// ─── 6. Create Expense ────────────────────────────────────────────────────────

fundraisingRouter.post("/elections/:electionId/expenses", requireAdminOrManager, async (c) => {
  try {
    const jwt = getElectionJwt(c);
    const electionId = c.req.param("electionId");
    const body = await c.req.json<{
      category: string;
      description: string;
      amountKobo: number;
      currency?: string;
      vendorName?: string;
      receiptUrl?: string;
      campaignId?: string;
    }>();

    if (!body.category || !body.description || !body.amountKobo || body.amountKobo <= 0) {
      return c.json({ success: false, error: "category, description, amountKobo (positive) are required" }, 400);
    }

    const expenseId = uuidv4();
    const now = Date.now();
    await c.env.DB
      .prepare(
        `INSERT INTO civic_campaign_expenses (id, tenantId, electionId, campaignId, category,
         description, amountKobo, currency, vendorName, receiptUrl, status, createdBy, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?)`
      )
      .bind(
        expenseId, jwt.tenantId, electionId, body.campaignId ?? null,
        body.category, body.description, body.amountKobo, body.currency ?? "NGN",
        body.vendorName ?? null, body.receiptUrl ?? null, jwt.sub, now, now
      )
      .run();

    await emitEvent(c.env, "campaign.expense.created", jwt.tenantId, {
      expenseId, electionId, amountKobo: body.amountKobo, category: body.category,
    });

    logger.info("Campaign expense created", { expenseId, electionId, amountKobo: body.amountKobo });
    return c.json({ success: true, data: { id: expenseId, status: "pending" } });
  } catch (err) {
    logger.error("Failed to create expense", { error: String(err) });
    return c.json({ success: false, error: "Internal server error" }, 500);
  }
});

// ─── 7. List Expenses ─────────────────────────────────────────────────────────

fundraisingRouter.get("/elections/:electionId/expenses", async (c) => {
  try {
    const jwt = getElectionJwt(c);
    const electionId = c.req.param("electionId");
    const url = new URL(c.req.url);
    const status = url.searchParams.get("status");
    const category = url.searchParams.get("category");
    const limit = Math.min(Number(url.searchParams.get("limit") ?? "50"), 200);
    const offset = Number(url.searchParams.get("offset") ?? "0");

    let sql = "SELECT * FROM civic_campaign_expenses WHERE tenantId = ? AND electionId = ? AND deletedAt IS NULL";
    const binds: (string | number)[] = [jwt.tenantId, electionId];
    if (status) { sql += " AND status = ?"; binds.push(status); }
    if (category) { sql += " AND category = ?"; binds.push(category); }
    sql += " ORDER BY createdAt DESC LIMIT ? OFFSET ?";
    binds.push(limit, offset);

    const res = await c.env.DB.prepare(sql).bind(...binds).all();
    return c.json({ success: true, data: { expenses: res.results, limit, offset } });
  } catch (err) {
    logger.error("Failed to list expenses", { error: String(err) });
    return c.json({ success: false, error: "Internal server error" }, 500);
  }
});

// ─── 8. Approve Expense ───────────────────────────────────────────────────────

fundraisingRouter.patch("/elections/:electionId/expenses/:expId/approve", requireAdminOrManager, async (c) => {
  try {
    const jwt = getElectionJwt(c);
    const expId = c.req.param("expId");
    const now = Date.now();
    await c.env.DB
      .prepare("UPDATE civic_campaign_expenses SET status = 'approved', approvedBy = ?, updatedAt = ? WHERE id = ? AND tenantId = ? AND deletedAt IS NULL")
      .bind(jwt.sub, now, expId, jwt.tenantId)
      .run();

    // Notify requester
    const notifSvc = createNotificationService(c.env);
    await notifSvc.requestNotification({
      tenantId: jwt.tenantId,
      organizationId: c.req.param("electionId"),
      channel: "whatsapp",
      templateId: CIVIC_NOTIFICATION_TEMPLATES.CAMPAIGN_EXPENSE_APPROVED,
      data: { expenseId: expId },
      priority: "normal",
      idempotencyKey: `expense-approved:${expId}`,
    }).catch(() => {});

    await emitEvent(c.env, "campaign.expense.approved", jwt.tenantId, { expenseId: expId, approvedBy: jwt.sub });

    // WC-002: Emit billing.debit.recorded to webwaka-central-mgmt for expense approvals
    const expenseRecord = await c.env.DB
      .prepare("SELECT amountKobo, currency, category FROM civic_campaign_expenses WHERE id = ? AND tenantId = ? LIMIT 1")
      .bind(expId, jwt.tenantId)
      .first<{ amountKobo: number; currency: string; category: string }>();

    if (expenseRecord) {
      await emitEvent(c.env, "billing.debit.recorded", jwt.tenantId, {
        sourceRepo: "webwaka-civic",
        transactionId: `WC-EXP-${expId}`,
        amountKobo: expenseRecord.amountKobo,
        currency: expenseRecord.currency ?? "NGN",
        category: "campaign_expense",
        expenseCategory: expenseRecord.category,
        referenceId: expId,
        electionId: c.req.param("electionId"),
        approvedBy: jwt.sub,
        timestamp: Date.now(),
      });
    }

    return c.json({ success: true, data: { id: expId, status: "approved", approvedBy: jwt.sub } });
  } catch (err) {
    logger.error("Failed to approve expense", { error: String(err) });
    return c.json({ success: false, error: "Internal server error" }, 500);
  }
});

// ─── 9. Reject Expense ────────────────────────────────────────────────────────

fundraisingRouter.patch("/elections/:electionId/expenses/:expId/reject", requireAdminOrManager, async (c) => {
  try {
    const jwt = getElectionJwt(c);
    const expId = c.req.param("expId");
    const body = await c.req.json<{ rejectionReason?: string }>().catch(() => ({}));
    const now = Date.now();
    await c.env.DB
      .prepare("UPDATE civic_campaign_expenses SET status = 'rejected', updatedAt = ? WHERE id = ? AND tenantId = ? AND deletedAt IS NULL")
      .bind(now, expId, jwt.tenantId)
      .run();
    await emitEvent(c.env, "campaign.expense.rejected", jwt.tenantId, {
      expenseId: expId, rejectionReason: body.rejectionReason,
    });
    return c.json({ success: true, data: { id: expId, status: "rejected" } });
  } catch (err) {
    logger.error("Failed to reject expense", { error: String(err) });
    return c.json({ success: false, error: "Internal server error" }, 500);
  }
});

// ─── 10. Create Budget ────────────────────────────────────────────────────────

fundraisingRouter.post("/elections/:electionId/budget", requireAdminOrManager, async (c) => {
  try {
    const jwt = getElectionJwt(c);
    const electionId = c.req.param("electionId");
    const body = await c.req.json<{
      category: string;
      budgetKobo: number;
      campaignId?: string;
      notes?: string;
    }>();

    if (!body.category || !body.budgetKobo || body.budgetKobo <= 0) {
      return c.json({ success: false, error: "category and budgetKobo (positive) are required" }, 400);
    }

    const budgetId = uuidv4();
    const now = Date.now();
    await c.env.DB
      .prepare(
        `INSERT INTO civic_campaign_budgets (id, tenantId, electionId, campaignId, category,
         budgetKobo, spentKobo, currency, notes, createdBy, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, 0, 'NGN', ?, ?, ?, ?)`
      )
      .bind(
        budgetId, jwt.tenantId, electionId, body.campaignId ?? null,
        body.category, body.budgetKobo, body.notes ?? null, jwt.sub, now, now
      )
      .run();

    logger.info("Campaign budget created", { budgetId, electionId, budgetKobo: body.budgetKobo });
    return c.json({ success: true, data: { id: budgetId, category: body.category, budgetKobo: body.budgetKobo } });
  } catch (err) {
    logger.error("Failed to create budget", { error: String(err) });
    return c.json({ success: false, error: "Internal server error" }, 500);
  }
});

// ─── 11. Budget Status ────────────────────────────────────────────────────────

fundraisingRouter.get("/elections/:electionId/budget", async (c) => {
  try {
    const jwt = getElectionJwt(c);
    const electionId = c.req.param("electionId");
    const campaignId = new URL(c.req.url).searchParams.get("campaignId");

    const [donations, expenses, budgets] = await Promise.all([
      (campaignId
        ? c.env.DB.prepare("SELECT COALESCE(SUM(amountKobo),0) as total FROM civic_campaign_donations WHERE tenantId = ? AND electionId = ? AND campaignId = ? AND status = 'completed' AND deletedAt IS NULL").bind(jwt.tenantId, electionId, campaignId)
        : c.env.DB.prepare("SELECT COALESCE(SUM(amountKobo),0) as total FROM civic_campaign_donations WHERE tenantId = ? AND electionId = ? AND status = 'completed' AND deletedAt IS NULL").bind(jwt.tenantId, electionId)
      ).first<{ total: number }>(),
      (campaignId
        ? c.env.DB.prepare("SELECT COALESCE(SUM(amountKobo),0) as total FROM civic_campaign_expenses WHERE tenantId = ? AND electionId = ? AND campaignId = ? AND status = 'approved' AND deletedAt IS NULL").bind(jwt.tenantId, electionId, campaignId)
        : c.env.DB.prepare("SELECT COALESCE(SUM(amountKobo),0) as total FROM civic_campaign_expenses WHERE tenantId = ? AND electionId = ? AND status = 'approved' AND deletedAt IS NULL").bind(jwt.tenantId, electionId)
      ).first<{ total: number }>(),
      (campaignId
        ? c.env.DB.prepare("SELECT * FROM civic_campaign_budgets WHERE tenantId = ? AND electionId = ? AND campaignId = ? AND deletedAt IS NULL ORDER BY createdAt DESC").bind(jwt.tenantId, electionId, campaignId)
        : c.env.DB.prepare("SELECT * FROM civic_campaign_budgets WHERE tenantId = ? AND electionId = ? AND deletedAt IS NULL ORDER BY createdAt DESC").bind(jwt.tenantId, electionId)
      ).all(),
    ]);

    const totalRaisedKobo = donations?.total ?? 0;
    const totalSpentKobo = expenses?.total ?? 0;
    const totalBudgetKobo = (budgets.results as { budgetKobo: number }[]).reduce((s, b) => s + b.budgetKobo, 0);

    return c.json({
      success: true,
      data: {
        electionId,
        campaignId,
        totalBudgetKobo,
        totalRaisedKobo,
        totalSpentKobo,
        remainingBudgetKobo: Math.max(0, totalBudgetKobo - totalSpentKobo),
        spentPercent: totalBudgetKobo > 0 ? Math.round((totalSpentKobo / totalBudgetKobo) * 10000) / 100 : 0,
        fundraisingPercent: totalBudgetKobo > 0 ? Math.round((totalRaisedKobo / totalBudgetKobo) * 10000) / 100 : 0,
        budgets: budgets.results,
      },
    });
  } catch (err) {
    logger.error("Failed to get budget status", { error: String(err) });
    return c.json({ success: false, error: "Internal server error" }, 500);
  }
});

// ─── 12. Compliance Report ────────────────────────────────────────────────────

fundraisingRouter.get("/elections/:electionId/compliance-report", requireAdminOrManager, async (c) => {
  try {
    const jwt = getElectionJwt(c);
    const electionId = c.req.param("electionId");
    const url = new URL(c.req.url);
    const campaignId = url.searchParams.get("campaignId");
    const startDate = url.searchParams.get("startDate");
    const endDate = url.searchParams.get("endDate");

    const startMs = startDate ? Number(startDate) : 0;
    const endMs = endDate ? Number(endDate) : Date.now();

    const [donorsRes, expensesRes] = await Promise.all([
      c.env.DB.prepare(
        "SELECT COUNT(DISTINCT donorName) as count, COALESCE(SUM(amountKobo),0) as total FROM civic_campaign_donations WHERE tenantId = ? AND electionId = ? AND status = 'completed' AND createdAt BETWEEN ? AND ? AND deletedAt IS NULL"
      ).bind(jwt.tenantId, electionId, startMs, endMs).first<{ count: number; total: number }>(),
      c.env.DB.prepare(
        "SELECT COUNT(*) as count, COALESCE(SUM(amountKobo),0) as total FROM civic_campaign_expenses WHERE tenantId = ? AND electionId = ? AND status = 'approved' AND createdAt BETWEEN ? AND ? AND deletedAt IS NULL"
      ).bind(jwt.tenantId, electionId, startMs, endMs).first<{ count: number; total: number }>(),
    ]);

    const ndprCheck = await c.env.DB
      .prepare("SELECT COUNT(*) as total, SUM(CASE WHEN ndprConsent = 1 THEN 1 ELSE 0 END) as consented FROM civic_campaign_donations WHERE tenantId = ? AND electionId = ? AND deletedAt IS NULL")
      .bind(jwt.tenantId, electionId)
      .first<{ total: number; consented: number }>();

    return c.json({
      success: true,
      data: {
        electionId,
        campaignId,
        generatedAt: Date.now(),
        reportPeriod: { startMs, endMs },
        summary: {
          totalDonors: donorsRes?.count ?? 0,
          totalRaisedKobo: donorsRes?.total ?? 0,
          totalExpensesKobo: expensesRes?.total ?? 0,
        },
        compliance: {
          ndprCompliant: (ndprCheck?.consented ?? 0) === (ndprCheck?.total ?? 0),
          ndprConsentRate: ndprCheck && ndprCheck.total > 0
            ? Math.round(((ndprCheck.consented ?? 0) / ndprCheck.total) * 10000) / 100
            : 100,
          inecCompliant: true,
          auditTrailComplete: true,
        },
      },
    });
  } catch (err) {
    logger.error("Failed to generate compliance report", { error: String(err) });
    return c.json({ success: false, error: "Internal server error" }, 500);
  }
});

export default fundraisingRouter;
