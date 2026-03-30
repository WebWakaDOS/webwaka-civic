/**
 * WebWaka Civic Suite — Unified Cloudflare Worker Entry Point
 * Blueprint Reference: Part 9.2 (Universal Architecture Standards)
 * Blueprint Reference: Part 10.9 (Civic & Political Suite)
 *
 * Invariant: Build Once Use Infinitely
 * All civic modules are mounted under a single Worker for zero cold-start overhead.
 *
 * Module Routes:
 *   /api/church-ngo/**   → CIV-1 Church & NGO Management
 *   /api/party/**        → CIV-2 Political Party Management
 *   /api/elections/**    → CIV-3 Elections & Campaigns
 *   /api/volunteers/**   → CIV-3 Volunteer Management
 *   /api/fundraising/**  → CIV-3 Fundraising & Expenses
 *   /health              → Platform health check
 */
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger as honoLogger } from "hono/logger";
import { jwtAuthMiddleware, secureCORS } from "@webwaka/core";
import type { EventBusEnv } from "./core/event-bus/index";
import type { D1Database } from "./core/db/queries";

// ─── Import module routers ─────────────────────────────────────────────────
import churchNgoApp from "./modules/church-ngo/api/index";
import politicalPartyApp from "./modules/political-party/api/index";
import electionsApp from "./modules/elections/api/index";
import volunteersApp from "./modules/volunteers/api/index";
import fundraisingApp from "./modules/fundraising/api/index";

// ─── Environment ──────────────────────────────────────────────────────────────
interface Env extends EventBusEnv {
  DB: D1Database;
  STORAGE: R2Bucket;
  JWT_SECRET: string;
  ENVIRONMENT: string;
}

// ─── Unified Router ───────────────────────────────────────────────────────────
const app = new Hono<{ Bindings: Env }>();

// CORS — allow all origins in staging, restrict in production
app.use("*", secureCORS());


// Global Auth Middleware — modules all apply their own per-route auth middleware.
// Exemptions for public-access and webhook paths here.
app.use("/api/*", jwtAuthMiddleware({
  publicRoutes: [
    { method: "GET",  path: "/api/public/*" },
    { method: "GET",  path: "/api/health" },
    { method: "POST", path: "/api/elections/*/migrate" },
    { method: "POST", path: "/api/party/*/migrate" },
    { method: "POST", path: "/api/civic/migrate" },
  ],
}));

// Request logging
app.use("*", honoLogger());

// ─── Health Check ─────────────────────────────────────────────────────────────
app.get("/health", (c) => {
  return c.json({
    success: true,
    data: {
      status: "healthy",
      service: "webwaka-civic",
      version: "4.0.0",
      environment: c.env.ENVIRONMENT ?? "production",
      modules: [
        "church-ngo",
        "political-party",
        "elections",
        "volunteers",
        "fundraising",
      ],
      timestamp: new Date().toISOString(),
      uptime: "live",
    },
  });
});

// ─── Module Mounts ────────────────────────────────────────────────────────────
// CIV-1: Church & NGO Management
app.route("/api/church-ngo", churchNgoApp);

// CIV-2: Political Party Management
app.route("/api/party", politicalPartyApp);

// CIV-3: Elections & Campaigns
app.route("/api/elections", electionsApp);

// CIV-3: Volunteer Management
app.route("/api/volunteers", volunteersApp);

// CIV-3: Fundraising & Expenses
app.route("/api/fundraising", fundraisingApp);

// ─── 404 Handler ─────────────────────────────────────────────────────────────
app.notFound((c) => {
  return c.json({
    success: false,
    error: "Route not found",
    availableRoutes: [
      "/health",
      "/api/church-ngo",
      "/api/party",
      "/api/elections",
      "/api/volunteers",
      "/api/fundraising",
    ],
  }, 404);
});

// ─── Error Handler ────────────────────────────────────────────────────────────
app.onError((err, c) => {
  console.error("Unhandled error:", err);
  return c.json({
    success: false,
    error: "Internal server error",
    message: err.message,
  }, 500);
});

export default app;
