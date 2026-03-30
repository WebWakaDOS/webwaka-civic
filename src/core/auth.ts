/**
 * WebWaka Civic — Shared JWT Authentication Utilities
 * Blueprint Reference: Part 9.2 (Universal Architecture Standards)
 * Blueprint Reference: Part 9.3 (Platform Conventions — RBAC)
 *
 * Single source of truth for HS256 JWT verification across all Civic modules.
 * Eliminates duplication between church-ngo, political-party, and elections modules.
 *
 * Compatible with Cloudflare Workers Web Crypto API — no Node.js dependency.
 *
 * Usage:
 *   // Church/NGO module
 *   import { createCivicAuthMiddleware, CIVIC_JWT_KEY } from "../../../core/auth";
 *   app.use("/api/civic/*", createCivicAuthMiddleware<CivicJWTPayload>());
 *   const payload = c.get(CIVIC_JWT_KEY as never) as CivicJWTPayload;
 *
 *   // Political Party module
 *   app.use("/api/party/*", createCivicAuthMiddleware<PartyJWTPayload>());
 *
 *   // Elections module (health check exempt)
 *   app.use("*", async (c, next) => {
 *     if (c.req.path.endsWith("/health")) return next();
 *     return createCivicAuthMiddleware<ElectionJWTPayload>()(c, next);
 *   });
 */

import type { MiddlewareHandler } from "hono";
import { createLogger } from "./logger";

const logger = createLogger("core/auth");

// ─── Base JWT Payload ─────────────────────────────────────────────────────────

/**
 * Minimum fields present in every WebWaka JWT.
 * Module-specific payloads extend this with a typed `role` field.
 */
export interface BaseJWTPayload {
  /** Subject — user UUID */
  sub: string;
  /** Tenant identifier (strict isolation) */
  tenantId: string;
  /** Organization UUID within the tenant */
  organizationId: string;
  /** Role — typed by each module's specific payload interface */
  role: string;
  /** Display name */
  name: string;
  /** Expiry — Unix timestamp in seconds */
  exp: number;
  /** Issued-at — Unix timestamp in seconds (optional) */
  iat?: number;
}

// ─── Module-Specific Payload Types ────────────────────────────────────────────

/** CIV-1: Church & NGO JWT payload */
export interface CivicJWTPayload extends BaseJWTPayload {
  role: "admin" | "leader" | "member" | "viewer";
}

/** CIV-2: Political Party JWT payload */
export interface PartyJWTPayload extends BaseJWTPayload {
  role: "admin" | "organizer" | "member" | "viewer";
}

/** CIV-3: Elections & Campaigns JWT payload */
export interface ElectionJWTPayload extends BaseJWTPayload {
  role: "admin" | "campaign_manager" | "candidate" | "voter" | "volunteer";
}

// ─── Context Key ──────────────────────────────────────────────────────────────

/**
 * Hono context key under which the verified JWT payload is stored.
 * All modules must use this key — not "jwtPayload" (legacy).
 */
export const CIVIC_JWT_KEY = "civicJwtPayload";

// ─── Core Verification ────────────────────────────────────────────────────────

/**
 * verifyWebwakaJWT<T>
 *
 * Verify an HS256 JWT using the Web Crypto API and return the typed payload,
 * or null if the token is missing, malformed, has an invalid signature, or is expired.
 *
 * Generic T allows callers to receive a fully-typed payload:
 *   await verifyWebwakaJWT<CivicJWTPayload>(token, secret)
 *   await verifyWebwakaJWT<PartyJWTPayload>(token, secret)
 *   await verifyWebwakaJWT<ElectionJWTPayload>(token, secret)
 */
export async function verifyWebwakaJWT<T extends BaseJWTPayload = BaseJWTPayload>(
  token: string,
  secret: string
): Promise<T | null> {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;

    const [headerB64, payloadB64, signatureB64] = parts as [string, string, string];

    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"]
    );

    const data = encoder.encode(`${headerB64}.${payloadB64}`);
    const signature = Uint8Array.from(
      atob(signatureB64.replace(/-/g, "+").replace(/_/g, "/")),
      (ch) => ch.charCodeAt(0)
    );

    const valid = await crypto.subtle.verify("HMAC", key, signature, data);
    if (!valid) return null;

    const payload = JSON.parse(atob(payloadB64)) as T;
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;

    return payload;
  } catch (err) {
    logger.warn("JWT verification failed", { error: String(err) });
    return null;
  }
}

// ─── Auth Middleware Factory ──────────────────────────────────────────────────

/**
 * createCivicAuthMiddleware<T>
 *
 * Returns a Hono middleware that:
 *   1. Extracts the Bearer token from Authorization header
 *   2. Verifies the HS256 signature against JWT_SECRET (or custom env key)
 *   3. Checks token expiry
 *   4. Stores the typed payload in Hono context under CIVIC_JWT_KEY
 *
 * Returns 401 on missing / invalid / expired token.
 * Returns 500 if JWT_SECRET environment variable is not set.
 */
export function createCivicAuthMiddleware<T extends BaseJWTPayload = BaseJWTPayload>(
  jwtSecretEnvKey = "JWT_SECRET"
): MiddlewareHandler {
  return async (c, next) => {
    const authHeader = c.req.header("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return c.json({ success: false, error: "Unauthorized — missing token" }, 401);
    }

    const token = authHeader.slice(7);
    const secret = (c.env as Record<string, string>)[jwtSecretEnvKey];
    if (!secret) {
      logger.error("JWT_SECRET not configured", { path: c.req.path });
      return c.json({ success: false, error: "Server misconfiguration — JWT_SECRET not set" }, 500);
    }

    const payload = await verifyWebwakaJWT<T>(token, secret);
    if (payload === null) {
      return c.json({ success: false, error: "Unauthorized — invalid or expired token" }, 401);
    }

    c.set(CIVIC_JWT_KEY as never, payload);
    return next();
  };
}

// ─── Role Guard Factory ───────────────────────────────────────────────────────

/**
 * requireRole(allowedRoles)
 *
 * Route-level Hono middleware that enforces RBAC.
 * Must be used after createCivicAuthMiddleware (which populates CIVIC_JWT_KEY).
 *
 * Returns 401 if no payload is found (middleware not applied upstream).
 * Returns 403 if the authenticated user's role is not in allowedRoles.
 *
 * Usage:
 *   app.post("/organizations", requireRole(["admin"]), handler)
 *   app.post("/members", requireRole(["admin", "leader"]), handler)
 */
export function requireRole(allowedRoles: string[]): MiddlewareHandler {
  return async (c, next) => {
    const payload = c.get(CIVIC_JWT_KEY as never) as BaseJWTPayload | undefined;
    if (!payload) {
      return c.json({ success: false, error: "Unauthorized — authentication required" }, 401);
    }

    if (!allowedRoles.includes(payload.role)) {
      return c.json(
        {
          success: false,
          error: `Forbidden — required role: ${allowedRoles.join(" or ")}`,
        },
        403
      );
    }

    return next();
  };
}

// ─── Typed Role Guards (CIV-1) ────────────────────────────────────────────────

/** CIV-1 guard: admin only */
export const requireCivicAdmin = requireRole(["admin"]);

/** CIV-1 guard: admin or leader */
export const requireCivicAdminOrLeader = requireRole(["admin", "leader"]);

// ─── Typed Role Guards (CIV-2) ────────────────────────────────────────────────

/** CIV-2 guard: admin only */
export const requirePartyAdmin = requireRole(["admin"]);

/** CIV-2 guard: admin or organizer */
export const requirePartyAdminOrOrganizer = requireRole(["admin", "organizer"]);

// ─── Typed Role Guards (CIV-3) ────────────────────────────────────────────────

/** CIV-3 guard: admin only */
export const requireElectionAdmin = requireRole(["admin"]);

/** CIV-3 guard: admin or campaign_manager */
export const requireElectionAdminOrManager = requireRole(["admin", "campaign_manager"]);
