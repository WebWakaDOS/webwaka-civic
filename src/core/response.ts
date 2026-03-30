/**
 * WebWaka Civic — Shared HTTP Response Helpers
 * Blueprint Reference: Part 9.2 (Universal Architecture Standards)
 * Blueprint Reference: Part 9.3 (Platform Conventions — API responses)
 *
 * Single source of truth for:
 *   - apiSuccess / apiError response shapes
 *   - Pagination envelope
 *   - Nigerian monetary formatting (kobo ↔ Naira)
 *   - UUID generation (crypto.randomUUID — Cloudflare Workers compatible)
 *
 * All API responses must follow the shape:
 *   { success: true, data: T }      — 200 OK
 *   { success: false, error: string } — 4xx / 5xx
 *
 * Usage:
 *   import { apiSuccess, apiError, koboToNaira, generateId } from "../../../core/response";
 */

// ─── Success Response ─────────────────────────────────────────────────────────

/**
 * Return a 200 JSON response with the standard success envelope.
 *
 *   { success: true, data: T }
 */
export function apiSuccess<T>(data: T): Response {
  return new Response(JSON.stringify({ success: true, data }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

// ─── Error Response ───────────────────────────────────────────────────────────

/**
 * Return an error JSON response with the standard failure envelope.
 *
 *   { success: false, error: string }
 *
 * @param message  Human-readable error message
 * @param status   HTTP status code (default: 400)
 */
export function apiError(message: string, status = 400): Response {
  return new Response(JSON.stringify({ success: false, error: message }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// ─── Paginated Response ───────────────────────────────────────────────────────

export interface PaginationMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasMore: boolean;
}

/**
 * Return a paginated 200 JSON response.
 *
 *   { success: true, data: T[], pagination: PaginationMeta }
 */
export function apiPaginated<T>(
  items: T[],
  total: number,
  page: number,
  limit: number
): Response {
  const pagination: PaginationMeta = {
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
    hasMore: page * limit < total,
  };

  return new Response(
    JSON.stringify({ success: true, data: items, pagination }),
    {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }
  );
}

// ─── Formatting Utilities ─────────────────────────────────────────────────────

/**
 * Convert kobo (integer) to a human-readable Nigerian Naira string.
 *
 * All monetary values in the platform are stored as kobo integers (Blueprint Part 9.2).
 *
 *   koboToNaira(100000)  →  "₦1,000.00"
 *   koboToNaira(0)       →  "₦0.00"
 */
export function koboToNaira(kobo: number): string {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    minimumFractionDigits: 2,
  }).format(kobo / 100);
}

/**
 * Convert a Naira float/integer to kobo integer.
 * Use when accepting user input in Naira before storing.
 *
 *   nairaToKobo(1000)    →  100000
 *   nairaToKobo(1000.50) →  100050
 */
export function nairaToKobo(naira: number): number {
  return Math.round(naira * 100);
}

// ─── ID Generation ────────────────────────────────────────────────────────────

/**
 * Generate a UUID v4 using the Cloudflare Workers Web Crypto API.
 * This is the only approved ID generation method — do NOT use Math.random()
 * or external libraries.
 */
export function generateId(): string {
  return crypto.randomUUID();
}

/**
 * Return the current Unix timestamp in milliseconds.
 * Standardized helper to prevent inconsistent Date.now() / new Date() usage.
 */
export function nowMs(): number {
  return Date.now();
}

/**
 * Return the current Unix timestamp in seconds (for JWT exp comparisons).
 */
export function nowSec(): number {
  return Math.floor(Date.now() / 1000);
}
