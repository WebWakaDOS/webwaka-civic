/**
 * WebWaka Civic — T-CIV-01: Offline Tithe & Offering Logging
 * Blueprint Reference: Part 6 (Universal Offline Sync Engine)
 *
 * Invariants:
 * - Mobile/PWA/Offline First: all writes go to Dexie first
 * - Nigeria First: amounts stored as kobo integers
 * - Background sync on reconnect via CivicSyncEngine + SyncManager API
 *
 * Architecture: Dexie (pendingDonations) → DonationSyncManager → POST /api/civic/donations
 */

import { CivicOfflineDb, type PendingDonation, type PendingDonationStatus } from "../../core/sync/client";

// ─── Denomination Constants ───────────────────────────────────────────────────

export const NAIRA_DENOMINATIONS = [50, 100, 200, 500, 1_000, 2_000, 5_000, 10_000, 20_000, 50_000] as const;
export type NairaDenomination = (typeof NAIRA_DENOMINATIONS)[number];

export type DenominationBreakdown = Partial<Record<NairaDenomination, number>>;

export function totalFromBreakdown(breakdown: DenominationBreakdown): number {
  return Object.entries(breakdown).reduce(
    (sum, [denom, count]) => sum + Number(denom) * (count ?? 0) * 100,
    0
  );
}

export function serializeBreakdown(breakdown: DenominationBreakdown): string {
  return JSON.stringify(breakdown);
}

export function deserializeBreakdown(raw: string): DenominationBreakdown {
  try {
    return JSON.parse(raw) as DenominationBreakdown;
  } catch {
    return {};
  }
}

// ─── DB Helpers ───────────────────────────────────────────────────────────────

const db = new CivicOfflineDb();

export async function logDonationOffline(params: {
  tenantId: string;
  organizationId: string;
  donationType: PendingDonation["donationType"];
  breakdown: DenominationBreakdown;
  collectedBy: string;
  serviceRef: string;
  memberId?: string;
  notes?: string;
}): Promise<PendingDonation> {
  const amountKobo = totalFromBreakdown(params.breakdown);
  if (amountKobo <= 0) throw new Error("Total amount must be greater than zero");

  const record: PendingDonation = {
    id: crypto.randomUUID(),
    tenantId: params.tenantId,
    organizationId: params.organizationId,
    donationType: params.donationType,
    amountKobo,
    denominationBreakdown: serializeBreakdown(params.breakdown),
    collectedBy: params.collectedBy,
    serviceRef: params.serviceRef,
    memberId: params.memberId,
    notes: params.notes,
    status: "pending",
    syncAttempts: 0,
    collectedAt: Date.now(),
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  await db.pendingDonations.add(record);
  return record;
}

export async function getPendingDonations(
  tenantId: string,
  organizationId: string
): Promise<PendingDonation[]> {
  return db.pendingDonations
    .where("[tenantId+status]")
    .equals([tenantId, "pending"])
    .filter((d) => d.organizationId === organizationId)
    .toArray();
}

export async function getAllOfflineDonations(
  tenantId: string,
  organizationId: string
): Promise<PendingDonation[]> {
  return db.pendingDonations
    .where("tenantId")
    .equals(tenantId)
    .filter((d) => d.organizationId === organizationId)
    .sortBy("collectedAt");
}

export async function countPending(tenantId: string, organizationId: string): Promise<number> {
  return db.pendingDonations
    .where("[tenantId+status]")
    .equals([tenantId, "pending"])
    .filter((d) => d.organizationId === organizationId)
    .count();
}

export async function updateDonationStatus(
  id: string,
  status: PendingDonationStatus,
  opts?: { error?: string; incrementAttempts?: boolean }
): Promise<void> {
  const updates: Partial<PendingDonation> = {
    status,
    updatedAt: Date.now(),
  };
  if (opts?.error) updates.lastSyncError = opts.error;
  if (opts?.incrementAttempts) {
    const record = await db.pendingDonations.get(id);
    if (record) updates.syncAttempts = record.syncAttempts + 1;
  }
  await db.pendingDonations.update(id, updates);
}

export async function clearSyncedDonations(tenantId: string): Promise<number> {
  const synced = await db.pendingDonations
    .where("[tenantId+status]")
    .equals([tenantId, "synced"])
    .toArray();
  await db.pendingDonations.bulkDelete(synced.map((d) => d.id));
  return synced.length;
}

// ─── Donation Sync Manager ────────────────────────────────────────────────────

const SYNC_TAG = "civic-donation-sync";
const MAX_RETRIES = 5;

export class DonationSyncManager {
  private readonly apiBase: string;
  private readonly tenantId: string;
  private readonly organizationId: string;
  private readonly getAuthToken: () => string;
  private isFlushing = false;

  constructor(opts: {
    apiBase: string;
    tenantId: string;
    organizationId: string;
    getAuthToken: () => string;
  }) {
    this.apiBase = opts.apiBase;
    this.tenantId = opts.tenantId;
    this.organizationId = opts.organizationId;
    this.getAuthToken = opts.getAuthToken;
  }

  /**
   * Register a Background Sync tag so the service worker can trigger
   * flushPending() automatically when connectivity is restored.
   */
  registerBackgroundSync(): void {
    if ("serviceWorker" in navigator && "SyncManager" in window) {
      navigator.serviceWorker.ready
        .then((reg) =>
          (reg as ServiceWorkerRegistration & {
            sync: { register: (tag: string) => Promise<void> };
          }).sync.register(SYNC_TAG)
        )
        .catch(() => {
          // Background Sync API unavailable — fallback: listen for online event
        });
    }

    window.addEventListener("online", () => {
      this.flushPending().catch(() => {});
    });
  }

  /**
   * Flush all pending donations to the server in a bulk POST.
   * Idempotent — safe to call multiple times.
   */
  async flushPending(): Promise<{ synced: number; failed: number }> {
    if (this.isFlushing) return { synced: 0, failed: 0 };
    this.isFlushing = true;

    let synced = 0;
    let failed = 0;

    try {
      const pending = await getPendingDonations(this.tenantId, this.organizationId);
      if (pending.length === 0) return { synced: 0, failed: 0 };

      for (const donation of pending) {
        if (donation.syncAttempts >= MAX_RETRIES) {
          await updateDonationStatus(donation.id, "failed", {
            error: `Max retries (${MAX_RETRIES}) exceeded`,
          });
          failed++;
          continue;
        }

        await updateDonationStatus(donation.id, "syncing", {
          incrementAttempts: true,
        });

        try {
          const body = {
            donationType: donation.donationType,
            amountKobo: donation.amountKobo,
            paymentMethod: "cash",
            donationDate: donation.collectedAt,
            memberId: donation.memberId ?? null,
            notes: [
              `Collected by: ${donation.collectedBy}`,
              `Service: ${donation.serviceRef}`,
              `Denominations: ${donation.denominationBreakdown}`,
              donation.notes ?? "",
            ]
              .filter(Boolean)
              .join(" | "),
            offlineId: donation.id,
          };

          const res = await fetch(`${this.apiBase}/api/civic/donations`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${this.getAuthToken()}`,
            },
            body: JSON.stringify(body),
          });

          if (res.ok) {
            await updateDonationStatus(donation.id, "synced");
            synced++;
          } else {
            const errText = await res.text().catch(() => `HTTP ${res.status}`);
            await updateDonationStatus(donation.id, "pending", {
              error: errText,
            });
            failed++;
          }
        } catch (err) {
          await updateDonationStatus(donation.id, "pending", {
            error: String(err),
          });
          failed++;
        }
      }
    } finally {
      this.isFlushing = false;
    }

    return { synced, failed };
  }

  /**
   * Bulk-flush a specific array of donation IDs.
   */
  async flushBulk(ids: string[]): Promise<{ synced: number; failed: number }> {
    const all = await getAllOfflineDonations(this.tenantId, this.organizationId);
    const targets = all.filter((d) => ids.includes(d.id) && d.status !== "synced");

    if (targets.length === 0) return { synced: 0, failed: 0 };

    let synced = 0;
    let failed = 0;

    const payloads = targets.map((donation) => ({
      donationType: donation.donationType,
      amountKobo: donation.amountKobo,
      paymentMethod: "cash",
      donationDate: donation.collectedAt,
      memberId: donation.memberId ?? null,
      notes: [
        `Collected by: ${donation.collectedBy}`,
        `Service: ${donation.serviceRef}`,
        `Denominations: ${donation.denominationBreakdown}`,
        donation.notes ?? "",
      ]
        .filter(Boolean)
        .join(" | "),
      offlineId: donation.id,
    }));

    try {
      const res = await fetch(`${this.apiBase}/api/civic/donations/bulk-sync`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.getAuthToken()}`,
        },
        body: JSON.stringify({ donations: payloads }),
      });

      if (res.ok) {
        await Promise.all(targets.map((d) => updateDonationStatus(d.id, "synced")));
        synced = targets.length;
      } else {
        await Promise.all(
          targets.map((d) =>
            updateDonationStatus(d.id, "pending", { error: `HTTP ${res.status}` })
          )
        );
        failed = targets.length;
      }
    } catch (err) {
      await Promise.all(
        targets.map((d) =>
          updateDonationStatus(d.id, "pending", { error: String(err) })
        )
      );
      failed = targets.length;
    }

    return { synced, failed };
  }

  get tag(): string {
    return SYNC_TAG;
  }
}

export function createDonationSyncManager(opts: {
  apiBase: string;
  tenantId: string;
  organizationId: string;
  getAuthToken: () => string;
}): DonationSyncManager {
  return new DonationSyncManager(opts);
}
