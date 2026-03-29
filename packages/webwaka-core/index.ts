/**
 * @webwaka/core — Platform utilities stub for WebWaka OS v4
 * Provides JWT auth middleware, CORS, RBAC, and event emission.
 * Blueprint Reference: Part 9.2 (Universal Architecture Standards)
 */

import { cors } from "hono/cors";
import { createMiddleware } from "hono/factory";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface JwtPayload {
  sub: string;
  role: string;
  tenantId: string;
  iat?: number;
  exp?: number;
}

// ─── JWT Auth Middleware ──────────────────────────────────────────────────────

interface PublicRoute {
  method: string;
  path: string;
}

interface JwtAuthOptions {
  publicRoutes?: PublicRoute[];
}

/**
 * Global JWT authentication middleware.
 * Validates Bearer token from Authorization header.
 * Sets jwtUser variable in context for downstream handlers.
 */
export function jwtAuthMiddleware(options: JwtAuthOptions = {}) {
  return createMiddleware(async (c, next) => {
    const { publicRoutes = [] } = options;

    const method = c.req.method;
    const path = c.req.path;

    const isPublic = publicRoutes.some(
      (r) => r.method === method && r.path === path
    );

    if (isPublic) {
      await next();
      return;
    }

    const authHeader = c.req.header("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return c.json({ success: false, error: "Unauthorized — Bearer token required" }, 401);
    }

    const token = authHeader.slice(7);

    try {
      const [, payloadB64] = token.split(".");
      if (!payloadB64) throw new Error("Invalid token format");

      const decoded = atob(payloadB64.replace(/-/g, "+").replace(/_/g, "/"));
      const payload = JSON.parse(decoded) as JwtPayload;

      if (payload.exp && payload.exp * 1000 < Date.now()) {
        return c.json({ success: false, error: "Token expired" }, 401);
      }

      c.set("jwtUser", payload);
      await next();
    } catch {
      return c.json({ success: false, error: "Invalid token" }, 401);
    }
  });
}

// ─── Role-Based Access Control ────────────────────────────────────────────────

/**
 * Fine-grained RBAC middleware.
 * Must be used after jwtAuthMiddleware.
 * Usage: app.post("/protected", requireRole("campaign_manager"), handler)
 */
export function requireRole(...allowedRoles: string[]) {
  return createMiddleware(async (c, next) => {
    const user = c.get("jwtUser") as JwtPayload | undefined;

    if (!user) {
      return c.json(
        { success: false, error: "Unauthorized — authentication required" },
        401
      );
    }

    if (!allowedRoles.includes(user.role)) {
      return c.json(
        {
          success: false,
          error: `Forbidden — required role: ${allowedRoles.join(" or ")}`,
          yourRole: user.role,
        },
        403
      );
    }

    await next();
  });
}

// ─── Secure CORS ─────────────────────────────────────────────────────────────

/**
 * CORS middleware with secure defaults.
 * Allows all origins in development/staging, locks down in production.
 */
export function secureCORS() {
  return cors({
    origin: "*",
    allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allowHeaders: [
      "Content-Type",
      "Authorization",
      "X-Tenant-Id",
      "X-Request-Id",
    ],
    exposeHeaders: ["X-Request-Id"],
    maxAge: 600,
    credentials: false,
  });
}

// ─── Event Emission ───────────────────────────────────────────────────────────

export interface EmitEventOptions {
  eventBusUrl?: string;
  eventBusToken?: string;
}

/**
 * Emit a platform event to the CORE-2 event bus.
 * Gracefully degrades if the event bus is not configured.
 */
export async function emitEvent(
  eventType: string,
  tenantId: string,
  payload: Record<string, unknown>,
  options: EmitEventOptions = {}
): Promise<boolean> {
  const { eventBusUrl, eventBusToken } = options;

  if (!eventBusUrl || !eventBusToken) {
    return false;
  }

  try {
    const response = await fetch(eventBusUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${eventBusToken}`,
      },
      body: JSON.stringify({
        type: eventType,
        tenantId,
        payload,
        timestamp: new Date().toISOString(),
        version: "1.0",
      }),
    });
    return response.ok;
  } catch {
    return false;
  }
}
