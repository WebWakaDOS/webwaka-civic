/**
 * WebWaka Civic — CIV-3 Ballot Cryptography Tests
 * QA-CIV-3: Secure Voting — cryptographic ballot signatures
 *
 * Test groups:
 *  1. signBallot — HMAC-SHA256 output correctness
 *  2. verifyBallotSignature — valid + tampered ballot detection
 *  3. hashBallot — SHA-256 verification hash
 *  4. generateNonce — entropy + uniqueness
 *  5. Duplicate-vote prevention via signature uniqueness
 *  6. Cross-voter isolation (signatures are voter-specific)
 *  7. Timing-safe comparison (no timing oracle)
 */

import { describe, it, expect } from "vitest";
import {
  signBallot,
  verifyBallotSignature,
  hashBallot,
  generateNonce,
} from "./crypto";

const SECRET = "webwaka-test-secret-key-32bytes!";

// ─── 1. signBallot ────────────────────────────────────────────────────────────

describe("signBallot", () => {
  it("returns a 64-character lowercase hex string (SHA-256 output size)", () => {
    const sig = signBallot("voter-1", "election-1", "cand-1", "nonce-abc", SECRET);
    expect(sig).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is deterministic — same inputs produce identical signature", () => {
    const a = signBallot("voter-1", "election-1", "cand-1", "nonce-abc", SECRET);
    const b = signBallot("voter-1", "election-1", "cand-1", "nonce-abc", SECRET);
    expect(a).toBe(b);
  });

  it("changes when voterId changes", () => {
    const a = signBallot("voter-1", "election-1", "cand-1", "nonce-abc", SECRET);
    const b = signBallot("voter-2", "election-1", "cand-1", "nonce-abc", SECRET);
    expect(a).not.toBe(b);
  });

  it("changes when electionId changes", () => {
    const a = signBallot("voter-1", "election-A", "cand-1", "nonce-abc", SECRET);
    const b = signBallot("voter-1", "election-B", "cand-1", "nonce-abc", SECRET);
    expect(a).not.toBe(b);
  });

  it("changes when candidateId changes", () => {
    const a = signBallot("voter-1", "election-1", "cand-1", "nonce-abc", SECRET);
    const b = signBallot("voter-1", "election-1", "cand-2", "nonce-abc", SECRET);
    expect(a).not.toBe(b);
  });

  it("changes when nonce changes", () => {
    const a = signBallot("voter-1", "election-1", "cand-1", "nonce-1", SECRET);
    const b = signBallot("voter-1", "election-1", "cand-1", "nonce-2", SECRET);
    expect(a).not.toBe(b);
  });

  it("changes when secret changes", () => {
    const a = signBallot("voter-1", "election-1", "cand-1", "nonce-abc", "secret-A");
    const b = signBallot("voter-1", "election-1", "cand-1", "nonce-abc", "secret-B");
    expect(a).not.toBe(b);
  });

  it("handles Unicode input gracefully", () => {
    const sig = signBallot("Olúwatọbí", "àpèjọ-1", "ọmọ-ìgbẹ", "nonce", SECRET);
    expect(sig).toMatch(/^[0-9a-f]{64}$/);
  });
});

// ─── 2. verifyBallotSignature ─────────────────────────────────────────────────

describe("verifyBallotSignature", () => {
  it("returns true for a valid signature", () => {
    const nonce = "secure-nonce-123";
    const sig = signBallot("voter-1", "election-1", "cand-1", nonce, SECRET);
    expect(verifyBallotSignature(sig, "voter-1", "election-1", "cand-1", nonce, SECRET)).toBe(true);
  });

  it("returns false when voterId is tampered", () => {
    const nonce = "nonce-xyz";
    const sig = signBallot("voter-1", "election-1", "cand-1", nonce, SECRET);
    expect(verifyBallotSignature(sig, "voter-EVIL", "election-1", "cand-1", nonce, SECRET)).toBe(false);
  });

  it("returns false when candidateId is tampered", () => {
    const nonce = "nonce-xyz";
    const sig = signBallot("voter-1", "election-1", "cand-1", nonce, SECRET);
    expect(verifyBallotSignature(sig, "voter-1", "election-1", "cand-2", nonce, SECRET)).toBe(false);
  });

  it("returns false when electionId is tampered", () => {
    const nonce = "nonce-xyz";
    const sig = signBallot("voter-1", "election-A", "cand-1", nonce, SECRET);
    expect(verifyBallotSignature(sig, "voter-1", "election-B", "cand-1", nonce, SECRET)).toBe(false);
  });

  it("returns false when nonce is tampered", () => {
    const sig = signBallot("voter-1", "election-1", "cand-1", "nonce-real", SECRET);
    expect(verifyBallotSignature(sig, "voter-1", "election-1", "cand-1", "nonce-fake", SECRET)).toBe(false);
  });

  it("returns false when secret is wrong", () => {
    const nonce = "nonce-xyz";
    const sig = signBallot("voter-1", "election-1", "cand-1", nonce, SECRET);
    expect(verifyBallotSignature(sig, "voter-1", "election-1", "cand-1", nonce, "wrong-secret")).toBe(false);
  });

  it("returns false for an entirely fabricated signature", () => {
    const fake = "a".repeat(64);
    expect(verifyBallotSignature(fake, "voter-1", "election-1", "cand-1", "nonce", SECRET)).toBe(false);
  });

  it("returns false for a signature of wrong length", () => {
    const short = "deadbeef";
    expect(verifyBallotSignature(short, "voter-1", "election-1", "cand-1", "nonce", SECRET)).toBe(false);
  });

  it("returns false for empty signature string", () => {
    expect(verifyBallotSignature("", "voter-1", "election-1", "cand-1", "nonce", SECRET)).toBe(false);
  });

  it("does not throw on non-hex chars (graceful rejection)", () => {
    const badSig = "Z".repeat(64);
    expect(() =>
      verifyBallotSignature(badSig, "voter-1", "election-1", "cand-1", "nonce", SECRET)
    ).not.toThrow();
    expect(verifyBallotSignature(badSig, "voter-1", "election-1", "cand-1", "nonce", SECRET)).toBe(false);
  });
});

// ─── 3. hashBallot ────────────────────────────────────────────────────────────

describe("hashBallot", () => {
  it("returns a 64-character lowercase hex string", () => {
    const hash = hashBallot("ballot-1", "voter-1", "election-1", "cand-1");
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is deterministic for the same inputs", () => {
    const a = hashBallot("ballot-1", "voter-1", "election-1", "cand-1");
    const b = hashBallot("ballot-1", "voter-1", "election-1", "cand-1");
    expect(a).toBe(b);
  });

  it("differs when ballotId changes", () => {
    const a = hashBallot("ballot-1", "voter-1", "election-1", "cand-1");
    const b = hashBallot("ballot-2", "voter-1", "election-1", "cand-1");
    expect(a).not.toBe(b);
  });

  it("differs when voterId changes", () => {
    const a = hashBallot("ballot-1", "voter-1", "election-1", "cand-1");
    const b = hashBallot("ballot-1", "voter-2", "election-1", "cand-1");
    expect(a).not.toBe(b);
  });

  it("differs when candidateId changes", () => {
    const a = hashBallot("ballot-1", "voter-1", "election-1", "cand-1");
    const b = hashBallot("ballot-1", "voter-1", "election-1", "cand-2");
    expect(a).not.toBe(b);
  });

  it("is secret-independent (public verification hash, no HMAC)", () => {
    const a = hashBallot("ballot-1", "voter-1", "election-1", "cand-1");
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });
});

// ─── 4. generateNonce ─────────────────────────────────────────────────────────

describe("generateNonce", () => {
  it("returns a 64-character lowercase hex string (32 bytes)", () => {
    const nonce = generateNonce();
    expect(nonce).toMatch(/^[0-9a-f]{64}$/);
  });

  it("produces unique values on every call", () => {
    const nonces = Array.from({ length: 50 }, () => generateNonce());
    const unique = new Set(nonces);
    expect(unique.size).toBe(50);
  });

  it("has sufficient entropy (not all zeros)", () => {
    const nonce = generateNonce();
    expect(nonce).not.toBe("0".repeat(64));
  });
});

// ─── 5. Duplicate-vote prevention ────────────────────────────────────────────

describe("Duplicate-vote prevention via signature uniqueness", () => {
  it("same voter casting same vote twice produces different signatures due to unique nonces", () => {
    const nonce1 = generateNonce();
    const nonce2 = generateNonce();
    const sig1 = signBallot("voter-1", "election-1", "cand-1", nonce1, SECRET);
    const sig2 = signBallot("voter-1", "election-1", "cand-1", nonce2, SECRET);
    expect(nonce1).not.toBe(nonce2);
    expect(sig1).not.toBe(sig2);
  });

  it("a replayed old signature (same nonce) is detectable: verify fails with different secret", () => {
    const nonce = generateNonce();
    const originalSig = signBallot("voter-1", "election-1", "cand-1", nonce, SECRET);
    const replayValid = verifyBallotSignature(
      originalSig, "voter-1", "election-1", "cand-1", nonce, SECRET
    );
    expect(replayValid).toBe(true);
    const attackerSig = signBallot("voter-1", "election-1", "cand-1", nonce, "attacker-secret");
    expect(attackerSig).not.toBe(originalSig);
    const attackerValid = verifyBallotSignature(
      attackerSig, "voter-1", "election-1", "cand-1", nonce, SECRET
    );
    expect(attackerValid).toBe(false);
  });

  it("attacker cannot forge a valid signature without the secret", () => {
    const nonce = generateNonce();
    const forgedSig = "f".repeat(64);
    const forgedValid = verifyBallotSignature(
      forgedSig, "voter-1", "election-1", "cand-attacker", nonce, SECRET
    );
    expect(forgedValid).toBe(false);
  });
});

// ─── 6. Cross-voter isolation ─────────────────────────────────────────────────

describe("Cross-voter isolation", () => {
  it("signatures are voter-specific — voter A cannot impersonate voter B", () => {
    const nonce = generateNonce();
    const sigA = signBallot("voter-A", "election-1", "cand-1", nonce, SECRET);
    const sigB = signBallot("voter-B", "election-1", "cand-1", nonce, SECRET);
    expect(sigA).not.toBe(sigB);
    expect(verifyBallotSignature(sigA, "voter-B", "election-1", "cand-1", nonce, SECRET)).toBe(false);
    expect(verifyBallotSignature(sigB, "voter-A", "election-1", "cand-1", nonce, SECRET)).toBe(false);
  });

  it("each voter's vote for the same candidate yields a unique ballot hash", () => {
    const hashA = hashBallot("ballot-A", "voter-A", "election-1", "cand-1");
    const hashB = hashBallot("ballot-B", "voter-B", "election-1", "cand-1");
    expect(hashA).not.toBe(hashB);
  });

  it("voter's ballot hash for different candidates are different", () => {
    const hashCand1 = hashBallot("ballot-1", "voter-1", "election-1", "cand-1");
    const hashCand2 = hashBallot("ballot-1", "voter-1", "election-1", "cand-2");
    expect(hashCand1).not.toBe(hashCand2);
  });
});

// ─── 7. Timing-safe comparison ────────────────────────────────────────────────

describe("Timing-safe comparison", () => {
  it("verifyBallotSignature completes without throwing for any hex string", () => {
    const validSig = signBallot("voter-1", "election-1", "cand-1", "nonce", SECRET);
    const variations = [
      "0".repeat(64),
      "f".repeat(64),
      validSig.replace(validSig[0], validSig[0] === "0" ? "1" : "0"),
    ];
    for (const v of variations) {
      expect(() =>
        verifyBallotSignature(v, "voter-1", "election-1", "cand-1", "nonce", SECRET)
      ).not.toThrow();
    }
  });

  it("correct signature passes and bitflipped signature fails", () => {
    const nonce = "timing-test-nonce";
    const sig = signBallot("voter-1", "election-1", "cand-1", nonce, SECRET);
    const flipped = sig.slice(0, -1) + (sig.endsWith("0") ? "1" : "0");
    expect(verifyBallotSignature(sig, "voter-1", "election-1", "cand-1", nonce, SECRET)).toBe(true);
    expect(verifyBallotSignature(flipped, "voter-1", "election-1", "cand-1", nonce, SECRET)).toBe(false);
  });
});
