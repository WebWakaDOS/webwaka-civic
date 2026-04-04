/**
 * WebWaka Civic — CIV-3 Phase 2: Ballot Cryptography
 * HMAC-SHA256 ballot signing + SHA-256 verification hashing
 *
 * Invariants: Build Once Use Infinitely, Nigeria First
 *
 * All functions are synchronous and use Node.js `crypto` (works in both
 * Cloudflare Workers nodejs_compat mode and Vitest/Node.js test environment).
 *
 * Security guarantees:
 *  - signBallot   → HMAC-SHA256 over (voterId:electionId:candidateId:nonce)
 *  - verifyBallotSignature → constant-time comparison (no timing oracle)
 *  - hashBallot   → SHA-256 over (ballotId:voterId:electionId:candidateId)
 *  - generateNonce → cryptographically random 32-byte hex string
 */

import { createHmac, createHash, randomBytes, timingSafeEqual } from "crypto";

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Sign a ballot with HMAC-SHA256.
 *
 * @param voterId      The voter's unique identifier (NOT stored on ballot — anonymity)
 * @param electionId   The election being voted in
 * @param candidateId  The candidate being voted for
 * @param nonce        Random per-ballot nonce (prevents replay attacks)
 * @param secret       The signing secret (JWT_SECRET from env)
 * @returns            64-character lowercase hex HMAC-SHA256 digest
 */
export function signBallot(
  voterId: string,
  electionId: string,
  candidateId: string,
  nonce: string,
  secret: string
): string {
  const payload = `${voterId}:${electionId}:${candidateId}:${nonce}`;
  return createHmac("sha256", secret).update(payload).digest("hex");
}

/**
 * Verify a ballot signature using constant-time comparison.
 * Prevents timing-oracle attacks that could leak the secret.
 *
 * @returns true if the signature is valid, false otherwise
 */
export function verifyBallotSignature(
  signature: string,
  voterId: string,
  electionId: string,
  candidateId: string,
  nonce: string,
  secret: string
): boolean {
  const expected = signBallot(voterId, electionId, candidateId, nonce, secret);
  if (signature.length !== expected.length) return false;
  try {
    return timingSafeEqual(Buffer.from(signature, "hex"), Buffer.from(expected, "hex"));
  } catch {
    return false;
  }
}

/**
 * Produce a public verification hash citizens can use to confirm
 * their vote was recorded without revealing who they voted for.
 *
 * SHA-256 over (ballotId:voterId:electionId:candidateId)
 * @returns 64-character lowercase hex SHA-256 digest
 */
export function hashBallot(
  ballotId: string,
  voterId: string,
  electionId: string,
  candidateId: string
): string {
  return createHash("sha256")
    .update(`${ballotId}:${voterId}:${electionId}:${candidateId}`)
    .digest("hex");
}

/**
 * Generate a cryptographically random per-ballot nonce.
 * @returns 64-character lowercase hex string (32 random bytes)
 */
export function generateNonce(): string {
  return randomBytes(32).toString("hex");
}
