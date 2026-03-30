/**
 * WebWaka Civic — Shared RBAC Middleware for CIV-3 Elections & Campaigns
 * Blueprint Reference: Part 9.2 (Universal Architecture Standards)
 * Blueprint Reference: Part 9.3 (Platform Conventions — RBAC)
 *
 * Roles (Elections & Campaigns):
 *   admin            — TENANT_ADMIN; full create/update/delete/approve access
 *   campaign_manager — CAMPAIGN_MANAGER; manage elections, candidates, volunteers, materials
 *   candidate        — Read-own-profile; limited write access
 *   voter            — Cast vote only
 *   volunteer        — Accept/complete own task assignments
 *
 * Usage:
 *   app.post("/path", requireElectionRole(["admin", "campaign_manager"]), async (c) => { ... })
 */

import type { Context, MiddlewareHandler } from "hono";

// ─── Role Definition ──────────────────────────────────────────────────────────

export type ElectionRole = "admin" | "campaign_manager" | "candidate" | "voter" | "volunteer";

// ─── JWT Payload ──────────────────────────────────────────────────────────────

export interface ElectionJWTPayload {
  sub: string;
  tenantId: string;
  organizationId: string;
  role: ElectionRole;
  name: string;
  exp: number;
}

// ─── JWT Verification ─────────────────────────────────────────────────────────

/**
 * Verify a HS256 JWT and return the parsed payload, or null on failure.
 * Compatible with Cloudflare Workers (uses Web Crypto API).
 */
export async function verifyElectionJWT(
  token: string,
  secret: string
): Promise<ElectionJWTPayload | null> {
  try {
    const [headerB64, payloadB64, signatureB64] = token.split(".");
    if (!headerB64 || !payloadB64 || !signatureB64) return null;

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

    const payload = JSON.parse(atob(payloadB64)) as ElectionJWTPayload;
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;

    return payload;
  } catch {
    return null;
  }
}

// ─── Context Key ──────────────────────────────────────────────────────────────

export const ELECTION_JWT_KEY = "electionJwtPayload";

// ─── Auth Middleware ──────────────────────────────────────────────────────────

/**
 * Verify the Bearer JWT and store the payload in context.
 * Must be registered before any requireElectionRole middleware.
 * Skip public paths by not applying this middleware to them.
 */
export function electionAuthMiddleware(jwtSecretEnvKey = "JWT_SECRET"): MiddlewareHandler {
  return async (c, next) => {
    const authHeader = c.req.header("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return c.json({ success: false, error: "Unauthorized — missing token" }, 401);
    }

    const token = authHeader.slice(7);
    const secret = (c.env as Record<string, string>)[jwtSecretEnvKey];
    if (!secret) {
      return c.json({ success: false, error: "Server misconfiguration — JWT_SECRET not set" }, 500);
    }

    const payload = await verifyElectionJWT(token, secret);
    if (payload === null) {
      return c.json({ success: false, error: "Unauthorized — invalid or expired token" }, 401);
    }

    c.set(ELECTION_JWT_KEY as never, payload);
    return next();
  };
}

// ─── Role Guard ───────────────────────────────────────────────────────────────

/**
 * requireElectionRole(allowedRoles)
 *
 * Route-level middleware that enforces RBAC. Must be used after
 * electionAuthMiddleware (which sets the JWT payload in context).
 *
 * Example:
 *   app.post("/elections", requireElectionRole(["admin", "campaign_manager"]), handler)
 */
export function requireElectionRole(allowedRoles: ElectionRole[]): MiddlewareHandler {
  return async (c, next) => {
    const payload = c.get(ELECTION_JWT_KEY as never) as ElectionJWTPayload | undefined;
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

// ─── Shorthand Helpers ────────────────────────────────────────────────────────

/** Only TENANT_ADMIN may perform this action */
export const requireAdmin = requireElectionRole(["admin"]);

/** TENANT_ADMIN or CAMPAIGN_MANAGER may perform this action */
export const requireAdminOrManager = requireElectionRole(["admin", "campaign_manager"]);
