/**
 * WebWaka Civic Suite — Unified Cloudflare Worker Entry Point
 * Blueprint Reference: Part 9.2 (Universal Architecture Standards)
 * Blueprint Reference: Part 10.9 (Civic & Political Suite)
 *
 * Security hardened 2026-03-29:
 *   - Environment-aware CORS (no wildcard/echo-all in staging/production)
 *   - Global civ3AuthMiddleware applied to /api/elections/*, /api/volunteers/*,
 *     /api/fundraising/* (CIV-3 modules were previously completely unprotected)
 *   - church-ngo and political-party retain their own per-route auth (unchanged)
 *
 * Module Routes:
 *   /api/church-ngo/**   -> CIV-1 Church & NGO Management
 *   /api/party/**        -> CIV-2 Political Party Management
 *   /api/elections/**    -> CIV-3 Elections & Campaigns
 *   /api/volunteers/**   -> CIV-3 Volunteer Management
 *   /api/fundraising/**  -> CIV-3 Fundraising & Expenses
 *   /health              -> Platform health check
 */
import { Hono } from "hono";
import { logger as honoLogger } from "hono/logger";
import type { Context, Next } from "hono";
import type { EventBusEnv } from "./core/event-bus/index";
import type { D1Database } from "./core/db/queries";

import churchNgoApp from "./modules/church-ngo/api/index";
import politicalPartyApp from "./modules/political-party/api/index";
import electionsApp from "./modules/elections/api/index";
import volunteersApp from "./modules/volunteers/api/index";
import fundraisingApp from "./modules/fundraising/api/index";

interface Env extends EventBusEnv {
  DB: D1Database;
  STORAGE: R2Bucket;
  JWT_SECRET: string;
  ENVIRONMENT: string;
  RATE_LIMIT_KV?: KVNamespace;
}

const app = new Hono<{ Bindings: Env }>();

// SECURITY: Environment-aware CORS
const ALLOWED_ORIGINS: Record<string, string[]> = {
  production: [
    "https://civic.webwaka.app",
    "https://elections.webwaka.app",
    "https://admin.webwaka.app",
  ],
  staging: [
    "http://localhost:3000",
    "http://localhost:5173",
    "https://civic-staging.webwaka.app",
  ],
};

app.use("*", async (c, next) => {
  const env = c.env.ENVIRONMENT || "development";
  const origin = c.req.header("Origin") || "";
  const allowed = ALLOWED_ORIGINS[env];
  const isAllowed = !allowed || allowed.includes(origin);
  if (c.req.method === "OPTIONS") {
    const headers: Record<string, string> = {
      "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Max-Age": "86400",
    };
    if (isAllowed && origin) headers["Access-Control-Allow-Origin"] = origin;
    else if (!allowed) headers["Access-Control-Allow-Origin"] = "*";
    return new Response(null, { status: 204, headers });
  }
  await next();
  if (origin) {
    if (isAllowed) {
      c.res.headers.set("Access-Control-Allow-Origin", origin);
      c.res.headers.set("Vary", "Origin");
    } else if (!allowed) {
      c.res.headers.set("Access-Control-Allow-Origin", "*");
    }
  }
});

app.use("*", honoLogger());

// SECURITY: JWT verification helper (Web Crypto API — Workers-compatible)
async function verifyJWT(token: string, secret: string): Promise<any | null> {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const [headerB64, payloadB64, sigB64] = parts;
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]
    );
    const sigBytes = Uint8Array.from(
      atob(sigB64.replace(/-/g, "+").replace(/_/g, "/")),
      (ch) => ch.charCodeAt(0)
    );
    const valid = await crypto.subtle.verify(
      "HMAC", key, sigBytes, enc.encode(`${headerB64}.${payloadB64}`)
    );
    if (!valid) return null;
    const payload = JSON.parse(atob(payloadB64.replace(/-/g, "+").replace(/_/g, "/")));
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

// SECURITY: CIV-3 auth middleware — protects Elections, Volunteers, Fundraising
// tenantId is ALWAYS sourced from JWT payload, never from request headers
async function civ3AuthMiddleware(
  c: Context<{ Bindings: Env }>,
  next: Next
): Promise<Response | void> {
  const authHeader = c.req.header("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return c.json({ success: false, error: "Unauthorized: missing or malformed Authorization header" }, 401);
  }
  const token = authHeader.slice(7).trim();
  if (!token) return c.json({ success: false, error: "Unauthorized: empty token" }, 401);
  const secret = c.env.JWT_SECRET;
  if (!secret) {
    console.error("FATAL: JWT_SECRET is not configured");
    return c.json({ success: false, error: "Auth service misconfigured" }, 503);
  }
  const payload = await verifyJWT(token, secret);
  if (!payload) {
    return c.json({ success: false, error: "Unauthorized: invalid or expired token" }, 401);
  }
  (c as any).set("user", {
    userId: payload.sub || payload.userId,
    email: payload.email,
    role: payload.role,
    tenantId: payload.tenantId,
    permissions: payload.permissions || [],
  });
  (c as any).set("tenantId", payload.tenantId);
  return next();
}

// Apply CIV-3 auth to all Elections, Volunteers, Fundraising routes
app.use("/api/elections/*", civ3AuthMiddleware);
app.use("/api/volunteers/*", civ3AuthMiddleware);
app.use("/api/fundraising/*", civ3AuthMiddleware);

app.get("/health", (c) => {
  return c.json({
    success: true,
    data: {
      status: "healthy",
      service: "webwaka-civic",
      version: "4.1.0",
      environment: c.env.ENVIRONMENT ?? "production",
      modules: ["church-ngo", "political-party", "elections", "volunteers", "fundraising"],
      security: "signed-JWT-auth-enabled",
      timestamp: new Date().toISOString(),
      uptime: "live",
    },
  });
});

app.route("/api/church-ngo", churchNgoApp);
app.route("/api/party", politicalPartyApp);
app.route("/api/elections", electionsApp);
app.route("/api/volunteers", volunteersApp);
app.route("/api/fundraising", fundraisingApp);

app.notFound((c) => {
  return c.json({
    success: false,
    error: "Route not found",
    availableRoutes: ["/health", "/api/church-ngo", "/api/party", "/api/elections", "/api/volunteers", "/api/fundraising"],
  }, 404);
});

app.onError((err, c) => {
  console.error("Unhandled error:", err);
  return c.json({ success: false, error: "Internal server error", message: err.message }, 500);
});

export default app;
