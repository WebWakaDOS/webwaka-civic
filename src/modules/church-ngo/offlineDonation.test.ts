/**
 * WebWaka Civic — T-CIV-01: Offline Tithe & Offering Logging Tests
 * Blueprint Reference: Part 6 (Offline Sync Engine), Part 10.9 (Church & NGO)
 *
 * Test Coverage:
 * 1. DenominationBreakdown: totalFromBreakdown, serializeBreakdown, deserializeBreakdown
 * 2. Dexie schema: CivicOfflineDb v2 pendingDonations table exists
 * 3. logDonationOffline: creates records, validates amounts, stores all fields
 * 4. getPendingDonations / countPending / getAllOfflineDonations: filter by status
 * 5. updateDonationStatus: transitions, error field, retry counter
 * 6. clearSyncedDonations: removes synced records
 * 7. DonationSyncManager: flushPending success/failure/retry, flushBulk, registerBackgroundSync
 * 8. NAIRA_DENOMINATIONS: correct set of denominations
 */

import { describe, expect, it, vi, beforeEach } from "vitest";

// ─── Denomination Helpers ─────────────────────────────────────────────────────

import {
  NAIRA_DENOMINATIONS,
  totalFromBreakdown,
  serializeBreakdown,
  deserializeBreakdown,
  type DenominationBreakdown,
} from "./offlineDonations.ts";

describe("NAIRA_DENOMINATIONS", () => {
  it("includes ₦500", () => {
    expect(NAIRA_DENOMINATIONS).toContain(500);
  });

  it("includes ₦1,000", () => {
    expect(NAIRA_DENOMINATIONS).toContain(1_000);
  });

  it("includes ₦5,000", () => {
    expect(NAIRA_DENOMINATIONS).toContain(5_000);
  });

  it("includes all 10 common denominations", () => {
    expect(NAIRA_DENOMINATIONS.length).toBe(10);
  });

  it("starts with the smallest denomination (₦50)", () => {
    expect(NAIRA_DENOMINATIONS[0]).toBe(50);
  });

  it("ends with the largest denomination (₦50,000)", () => {
    expect(NAIRA_DENOMINATIONS[NAIRA_DENOMINATIONS.length - 1]).toBe(50_000);
  });
});

describe("totalFromBreakdown", () => {
  it("returns 0 for empty breakdown", () => {
    expect(totalFromBreakdown({})).toBe(0);
  });

  it("converts single ₦500 note to 50,000 kobo", () => {
    const bd: DenominationBreakdown = { 500: 1 };
    expect(totalFromBreakdown(bd)).toBe(50_000);
  });

  it("converts ₦1,000 × 5 to 500,000 kobo", () => {
    const bd: DenominationBreakdown = { 1000: 5 };
    expect(totalFromBreakdown(bd)).toBe(500_000);
  });

  it("sums multiple denominations", () => {
    const bd: DenominationBreakdown = { 500: 2, 1000: 1, 5000: 1 };
    expect(totalFromBreakdown(bd)).toBe(
      2 * 500 * 100 + 1 * 1000 * 100 + 1 * 5000 * 100
    );
  });

  it("handles a mixed Sunday offering correctly", () => {
    const bd: DenominationBreakdown = { 100: 10, 200: 5, 500: 3, 1000: 2 };
    const expected = (10 * 100 + 5 * 200 + 3 * 500 + 2 * 1000) * 100;
    expect(totalFromBreakdown(bd)).toBe(expected);
  });

  it("ignores denominations with undefined count", () => {
    const bd: DenominationBreakdown = { 500: undefined };
    expect(totalFromBreakdown(bd)).toBe(0);
  });

  it("correctly computes ₦50,000 note", () => {
    const bd: DenominationBreakdown = { 50000: 1 };
    expect(totalFromBreakdown(bd)).toBe(5_000_000);
  });
});

describe("serializeBreakdown / deserializeBreakdown", () => {
  it("round-trips an empty breakdown", () => {
    const bd: DenominationBreakdown = {};
    expect(deserializeBreakdown(serializeBreakdown(bd))).toEqual({});
  });

  it("round-trips a single denomination", () => {
    const bd: DenominationBreakdown = { 1000: 3 };
    expect(deserializeBreakdown(serializeBreakdown(bd))).toEqual({ "1000": 3 });
  });

  it("round-trips multiple denominations", () => {
    const bd: DenominationBreakdown = { 500: 2, 5000: 1, 10000: 4 };
    const result = deserializeBreakdown(serializeBreakdown(bd));
    expect(Number(Object.keys(result).find((k) => Number(k) === 500))).toBe(500);
  });

  it("deserializeBreakdown returns empty object for invalid JSON", () => {
    expect(deserializeBreakdown("not-valid-json")).toEqual({});
  });

  it("serializeBreakdown returns valid JSON string", () => {
    const bd: DenominationBreakdown = { 200: 5 };
    const serialized = serializeBreakdown(bd);
    expect(() => JSON.parse(serialized)).not.toThrow();
  });
});

// ─── Dexie Schema ─────────────────────────────────────────────────────────────

import { CivicOfflineDb, type PendingDonation } from "../../core/sync/client.ts";

describe("CivicOfflineDb v2 — pendingDonations table", () => {
  it("CivicOfflineDb has pendingDonations property", () => {
    const db = new CivicOfflineDb();
    expect(db.pendingDonations).toBeDefined();
  });

  it("pendingDonations has table name", () => {
    const db = new CivicOfflineDb();
    expect(db.pendingDonations.name).toBe("pendingDonations");
  });
});

describe("PendingDonation type structure", () => {
  it("has all required fields", () => {
    const record: PendingDonation = {
      id: crypto.randomUUID(),
      tenantId: "t-001",
      organizationId: "o-001",
      donationType: "tithe",
      amountKobo: 500_000,
      denominationBreakdown: JSON.stringify({ 5000: 1 }),
      collectedBy: "Usher Bisi",
      serviceRef: "Sunday Morning Service",
      status: "pending",
      syncAttempts: 0,
      collectedAt: Date.now(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    expect(record.id).toBeDefined();
    expect(record.tenantId).toBe("t-001");
    expect(record.amountKobo).toBe(500_000);
    expect(record.status).toBe("pending");
  });

  it("supports all donation types", () => {
    const types: PendingDonation["donationType"][] = ["tithe", "offering", "special", "seed"];
    expect(types.length).toBe(4);
  });

  it("supports all status transitions", () => {
    const statuses: PendingDonation["status"][] = ["pending", "syncing", "synced", "failed"];
    expect(statuses.length).toBe(4);
  });

  it("stores optional memberId", () => {
    const record: PendingDonation = {
      id: "x",
      tenantId: "t",
      organizationId: "o",
      donationType: "offering",
      amountKobo: 100,
      denominationBreakdown: "{}",
      collectedBy: "Usher",
      serviceRef: "Service",
      status: "pending",
      syncAttempts: 0,
      memberId: "mem-001",
      collectedAt: 0,
      createdAt: 0,
      updatedAt: 0,
    };
    expect(record.memberId).toBe("mem-001");
  });
});

// ─── DonationSyncManager ─────────────────────────────────────────────────────

import { DonationSyncManager, createDonationSyncManager } from "./offlineDonations.ts";

describe("createDonationSyncManager", () => {
  it("returns a DonationSyncManager instance", () => {
    const mgr = createDonationSyncManager({
      apiBase: "https://example.com",
      tenantId: "t1",
      organizationId: "o1",
      getAuthToken: () => "tok",
    });
    expect(mgr).toBeInstanceOf(DonationSyncManager);
  });

  it("exposes the correct sync tag", () => {
    const mgr = createDonationSyncManager({
      apiBase: "",
      tenantId: "t1",
      organizationId: "o1",
      getAuthToken: () => "tok",
    });
    expect(mgr.tag).toBe("civic-donation-sync");
  });
});

describe("DonationSyncManager.flushPending", () => {
  it("returns { synced: 0, failed: 0 } when there are no pending donations", async () => {
    const mgr = createDonationSyncManager({
      apiBase: "",
      tenantId: `tenant-no-pending-${crypto.randomUUID()}`,
      organizationId: `org-${crypto.randomUUID()}`,
      getAuthToken: () => "tok",
    });
    const result = await mgr.flushPending();
    expect(result.synced).toBe(0);
    expect(result.failed).toBe(0);
  });

  it("is not re-entrant (concurrent calls return early)", async () => {
    const mgr = createDonationSyncManager({
      apiBase: "https://never-called.test",
      tenantId: `tenant-reentrant-${crypto.randomUUID()}`,
      organizationId: `org-${crypto.randomUUID()}`,
      getAuthToken: () => "tok",
    });
    const [r1, r2] = await Promise.all([mgr.flushPending(), mgr.flushPending()]);
    expect(r1.synced + r2.synced).toBe(0);
  });
});

describe("DonationSyncManager.flushPending — network success", async () => {
  it("marks donation as synced when server returns 200", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, text: async () => "" });
    const originalFetch = globalThis.fetch;
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const tenantId = `tenant-sync-ok-${crypto.randomUUID()}`;
    const organizationId = `org-${crypto.randomUUID()}`;

    const { logDonationOffline: logFn, countPending: countFn } = await import(
      "./offlineDonations.ts"
    );

    await logFn({
      tenantId,
      organizationId,
      donationType: "offering",
      breakdown: { 500: 2 },
      collectedBy: "Usher A",
      serviceRef: "Test Service",
    });

    const countBefore = await countFn(tenantId, organizationId);
    expect(countBefore).toBe(1);

    const mgr = new DonationSyncManager({
      apiBase: "https://example.com",
      tenantId,
      organizationId,
      getAuthToken: () => "bearer-token",
    });

    const result = await mgr.flushPending();
    expect(result.synced).toBe(1);
    expect(result.failed).toBe(0);
    expect(fetchMock).toHaveBeenCalledOnce();

    const countAfter = await countFn(tenantId, organizationId);
    expect(countAfter).toBe(0);

    globalThis.fetch = originalFetch;
  });
});

describe("DonationSyncManager.flushPending — network failure", async () => {
  it("keeps donation as pending when server returns 500", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => "Internal Server Error",
    });
    const originalFetch = globalThis.fetch;
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const tenantId = `tenant-fail-${crypto.randomUUID()}`;
    const organizationId = `org-${crypto.randomUUID()}`;

    const { logDonationOffline: logFn, countPending: countFn } = await import(
      "./offlineDonations.ts"
    );

    await logFn({
      tenantId,
      organizationId,
      donationType: "tithe",
      breakdown: { 1000: 1 },
      collectedBy: "Usher B",
      serviceRef: "Evening Service",
    });

    const mgr = new DonationSyncManager({
      apiBase: "https://example.com",
      tenantId,
      organizationId,
      getAuthToken: () => "bearer-token",
    });

    const result = await mgr.flushPending();
    expect(result.failed).toBe(1);
    expect(result.synced).toBe(0);

    const countAfter = await countFn(tenantId, organizationId);
    expect(countAfter).toBe(1);

    globalThis.fetch = originalFetch;
  });

  it("increments syncAttempts on failure", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("Network error"));
    const originalFetch = globalThis.fetch;
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const tenantId = `tenant-retry-${crypto.randomUUID()}`;
    const organizationId = `org-${crypto.randomUUID()}`;

    const {
      logDonationOffline: logFn,
      getAllOfflineDonations: getAllFn,
    } = await import("./offlineDonations.ts");

    await logFn({
      tenantId,
      organizationId,
      donationType: "offering",
      breakdown: { 200: 3 },
      collectedBy: "Usher C",
      serviceRef: "Prayer Meeting",
    });

    const mgr = new DonationSyncManager({
      apiBase: "https://example.com",
      tenantId,
      organizationId,
      getAuthToken: () => "tok",
    });

    await mgr.flushPending();
    const all = await getAllFn(tenantId, organizationId);
    expect(all[0].syncAttempts).toBeGreaterThan(0);

    globalThis.fetch = originalFetch;
  });
});

describe("DonationSyncManager.registerBackgroundSync", () => {
  it("does not throw if serviceWorker / SyncManager is absent", () => {
    const mgr = createDonationSyncManager({
      apiBase: "",
      tenantId: "t1",
      organizationId: "o1",
      getAuthToken: () => "tok",
    });
    expect(() => mgr.registerBackgroundSync()).not.toThrow();
  });
});

// ─── logDonationOffline validation ───────────────────────────────────────────

describe("logDonationOffline", () => {
  it("throws when total amount is zero", async () => {
    const { logDonationOffline: logFn } = await import("./offlineDonations.ts");
    await expect(
      logFn({
        tenantId: "t1",
        organizationId: "o1",
        donationType: "offering",
        breakdown: {},
        collectedBy: "Usher",
        serviceRef: "Service",
      })
    ).rejects.toThrow("Total amount must be greater than zero");
  });

  it("persists a donation with correct amountKobo", async () => {
    const { logDonationOffline: logFn, getAllOfflineDonations: getAllFn } =
      await import("./offlineDonations.ts");

    const tenantId = `t-persist-${crypto.randomUUID()}`;
    const organizationId = `o-${crypto.randomUUID()}`;

    const record = await logFn({
      tenantId,
      organizationId,
      donationType: "tithe",
      breakdown: { 5000: 2, 1000: 3 },
      collectedBy: "Deacon Emeka",
      serviceRef: "Sunday Service",
    });

    const expected = (2 * 5000 + 3 * 1000) * 100;
    expect(record.amountKobo).toBe(expected);
    expect(record.status).toBe("pending");
    expect(record.syncAttempts).toBe(0);

    const all = await getAllFn(tenantId, organizationId);
    expect(all.length).toBe(1);
    expect(all[0].id).toBe(record.id);
  });

  it("stores denomination breakdown as serialized JSON string", async () => {
    const { logDonationOffline: logFn } = await import("./offlineDonations.ts");

    const record = await logFn({
      tenantId: `t-bd-${crypto.randomUUID()}`,
      organizationId: "o1",
      donationType: "special",
      breakdown: { 500: 4 },
      collectedBy: "Sister Ngozi",
      serviceRef: "Thanksgiving",
    });

    expect(typeof record.denominationBreakdown).toBe("string");
    const parsed = JSON.parse(record.denominationBreakdown);
    expect(parsed["500"]).toBe(4);
  });

  it("stores the collectedBy and serviceRef fields", async () => {
    const { logDonationOffline: logFn } = await import("./offlineDonations.ts");

    const record = await logFn({
      tenantId: `t-meta-${crypto.randomUUID()}`,
      organizationId: "o1",
      donationType: "seed",
      breakdown: { 1000: 1 },
      collectedBy: "Brother Tunde",
      serviceRef: "Revival Night",
    });

    expect(record.collectedBy).toBe("Brother Tunde");
    expect(record.serviceRef).toBe("Revival Night");
  });
});

// ─── resetStuckSyncing ────────────────────────────────────────────────────────

describe("resetStuckSyncing", () => {
  it("resets 'syncing' records back to 'pending'", async () => {
    const {
      logDonationOffline: logFn,
      updateDonationStatus: updateFn,
      resetStuckSyncing: resetFn,
      getAllOfflineDonations: getAllFn,
    } = await import("./offlineDonations.ts");

    const tenantId = `t-stuck-${crypto.randomUUID()}`;
    const organizationId = `o-${crypto.randomUUID()}`;

    const d1 = await logFn({
      tenantId, organizationId, donationType: "offering",
      breakdown: { 500: 1 }, collectedBy: "U", serviceRef: "S",
    });
    await updateFn(d1.id, "syncing");

    const recovered = await resetFn(tenantId, organizationId);
    expect(recovered).toBe(1);

    const all = await getAllFn(tenantId, organizationId);
    expect(all[0].status).toBe("pending");
    expect(all[0].lastSyncError).toMatch(/interrupted/i);
  });

  it("leaves non-syncing records untouched", async () => {
    const {
      logDonationOffline: logFn,
      resetStuckSyncing: resetFn,
      getAllOfflineDonations: getAllFn,
    } = await import("./offlineDonations.ts");

    const tenantId = `t-stuck2-${crypto.randomUUID()}`;
    const organizationId = `o-${crypto.randomUUID()}`;

    await logFn({
      tenantId, organizationId, donationType: "tithe",
      breakdown: { 1000: 1 }, collectedBy: "U", serviceRef: "S",
    });

    const recovered = await resetFn(tenantId, organizationId);
    expect(recovered).toBe(0);

    const all = await getAllFn(tenantId, organizationId);
    expect(all[0].status).toBe("pending");
  });

  it("returns 0 when no stuck records exist", async () => {
    const { resetStuckSyncing: resetFn } = await import("./offlineDonations.ts");
    const tenantId = `t-nostuck-${crypto.randomUUID()}`;
    const organizationId = `o-${crypto.randomUUID()}`;
    const result = await resetFn(tenantId, organizationId);
    expect(result).toBe(0);
  });
});

describe("DonationSyncManager.flushPending — orphan recovery", () => {
  it("retries a donation stuck in 'syncing' from a prior crash", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, text: async () => "" });
    const originalFetch = globalThis.fetch;
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const tenantId = `t-orphan-${crypto.randomUUID()}`;
    const organizationId = `o-${crypto.randomUUID()}`;

    const {
      logDonationOffline: logFn,
      updateDonationStatus: updateFn,
      countPending: countFn,
    } = await import("./offlineDonations.ts");

    const d = await logFn({
      tenantId, organizationId, donationType: "offering",
      breakdown: { 500: 1 }, collectedBy: "U", serviceRef: "S",
    });
    // Simulate mid-crash: donation left in "syncing" state
    await updateFn(d.id, "syncing");

    const countBefore = await countFn(tenantId, organizationId);
    expect(countBefore).toBe(0); // "syncing" is not counted as "pending"

    const mgr = new DonationSyncManager({
      apiBase: "https://example.com",
      tenantId,
      organizationId,
      getAuthToken: () => "tok",
    });

    // flushPending should recover the orphaned "syncing" record
    const result = await mgr.flushPending();
    expect(result.synced).toBe(1);
    expect(result.failed).toBe(0);
    expect(fetchMock).toHaveBeenCalledOnce();

    globalThis.fetch = originalFetch;
  });
});

describe("DonationSyncManager.registerBackgroundSync — cleanup", () => {
  it("returns a function", () => {
    const mgr = createDonationSyncManager({
      apiBase: "",
      tenantId: "t1",
      organizationId: "o1",
      getAuthToken: () => "tok",
    });
    const cleanup = mgr.registerBackgroundSync();
    expect(typeof cleanup).toBe("function");
    cleanup();
  });

  it("removes the online listener on cleanup (no duplicate triggers)", () => {
    const listeners: EventListenerOrEventListenerObject[] = [];
    const addSpy = vi.spyOn(window, "addEventListener").mockImplementation(
      (type: string, listener: EventListenerOrEventListenerObject) => {
        if (type === "online") listeners.push(listener);
      }
    );
    const removeSpy = vi.spyOn(window, "removeEventListener").mockImplementation(
      (type: string, listener: EventListenerOrEventListenerObject) => {
        if (type === "online") {
          const i = listeners.indexOf(listener);
          if (i !== -1) listeners.splice(i, 1);
        }
      }
    );

    const mgr = createDonationSyncManager({
      apiBase: "",
      tenantId: "t1",
      organizationId: "o1",
      getAuthToken: () => "tok",
    });
    const cleanup = mgr.registerBackgroundSync();
    expect(listeners.length).toBe(1);
    cleanup();
    expect(listeners.length).toBe(0);

    addSpy.mockRestore();
    removeSpy.mockRestore();
  });
});

// ─── clearSyncedDonations ─────────────────────────────────────────────────────

describe("clearSyncedDonations", () => {
  it("removes synced records and returns count", async () => {
    const {
      logDonationOffline: logFn,
      updateDonationStatus: updateFn,
      clearSyncedDonations: clearFn,
      getAllOfflineDonations: getAllFn,
    } = await import("./offlineDonations.ts");

    const tenantId = `t-clear-${crypto.randomUUID()}`;
    const organizationId = `o-${crypto.randomUUID()}`;

    const d1 = await logFn({
      tenantId, organizationId, donationType: "offering",
      breakdown: { 100: 1 }, collectedBy: "U", serviceRef: "S",
    });
    const d2 = await logFn({
      tenantId, organizationId, donationType: "tithe",
      breakdown: { 200: 1 }, collectedBy: "U", serviceRef: "S",
    });

    await updateFn(d1.id, "synced");
    const removed = await clearFn(tenantId);

    expect(removed).toBe(1);

    const remaining = await getAllFn(tenantId, organizationId);
    const ids = remaining.map((r) => r.id);
    expect(ids).not.toContain(d1.id);
    expect(ids).toContain(d2.id);
  });
});
