/**
 * WebWaka Civic — RBAC Middleware for CIV-3 Elections & Campaigns
 * Blueprint Reference: Part 9.2 (Universal Architecture Standards)
 * Blueprint Reference: Part 9.3 (Platform Conventions — RBAC)
 *
 * This module provides Elections-specific role guards.
 * JWT verification is delegated to src/core/auth.ts (single source of truth).
 *
 * Roles (Elections & Campaigns):
 *   admin            — TENANT_ADMIN; full create/update/delete/approve access
 *   campaign_manager — CAMPAIGN_MANAGER; manage elections, candidates, volunteers, materials
 *   candidate        — Read-own-profile; limited write access
 *   voter            — Cast vote only
 *   volunteer        — Accept/complete own task assignments
 *
 * Usage:
 *   app.post("/path", requireElectionRole(["admin", "campaign_manager"]), handler)
 *   app.delete("/path", requireAdmin, handler)
 */

import type { MiddlewareHandler } from "hono";
import {
  verifyWebwakaJWT,
  CIVIC_JWT_KEY,
  type ElectionJWTPayload,
} from "./auth";

// ─── Re-exports for backward compatibility ────────────────────────────────────

export type { ElectionJWTPayload } from "./auth";

// ─── Role Definition ──────────────────────────────────────────────────────────

export type ElectionRole = "admin" | "campaign_manager" | "candidate" | "voter" | "volunteer";

// ─── Context Key ──────────────────────────────────────────────────────────────

/**
 * Hono context key for the Elections JWT payload.
 * Aliased to CIVIC_JWT_KEY (shared key) for platform consistency.
 * Kept as a distinct export for backward compatibility with elections/volunteers modules.
 */
export const ELECTION_JWT_KEY = CIVIC_JWT_KEY;

// ─── Auth Middleware ──────────────────────────────────────────────────────────

/**
 * electionAuthMiddleware
 *
 * Verify the Bearer JWT and store the ElectionJWTPayload in context.
 * Delegates signature verification to verifyWebwakaJWT from core/auth.
 *
 * Must be registered before any requireElectionRole middleware.
 * Skip public paths (health checks) by guarding at the call site:
 *
 *   app.use("*", async (c, next) => {
 *     if (c.req.path.endsWith("/health")) return next();
 *     return electionAuthMiddleware()(c, next);
 *   });
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

    const payload = await verifyWebwakaJWT<ElectionJWTPayload>(token, secret);
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
 * Route-level middleware enforcing Elections RBAC.
 * Must be used after electionAuthMiddleware (which sets the JWT payload).
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

// ─── verifyElectionJWT (backward compatibility) ───────────────────────────────

/**
 * @deprecated Use verifyWebwakaJWT<ElectionJWTPayload> from core/auth instead.
 * Kept for any external callers that import this directly.
 */
export async function verifyElectionJWT(
  token: string,
  secret: string
): Promise<ElectionJWTPayload | null> {
  return verifyWebwakaJWT<ElectionJWTPayload>(token, secret);
}
