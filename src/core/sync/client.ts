/**
 * WebWaka Civic — CORE-1 Universal Offline Sync Engine (Client)
 * Blueprint Reference: Part 6 (Universal Offline Sync Engine)
 *
 * Modules must NOT implement their own sync logic.
 * All modules must use the platform sync engine.
 *
 * Architecture: IndexedDB (Dexie) → Mutation Queue → Sync API → Server reconciliation
 */

import Dexie, { type Table } from "dexie";

// ─── Mutation Queue Types ─────────────────────────────────────────────────────

export type MutationOperation = "CREATE" | "UPDATE" | "DELETE";

export type CivicEntityType =
  | "member"
  | "donation"
  | "pledge"
  | "event"
  | "attendance"
  | "grant"
  | "announcement";

export interface MutationQueueItem {
  id?: number;
  entityType: CivicEntityType;
  entityId: string;
  operation: MutationOperation;
  payload: Record<string, unknown>;
  tenantId: string;
  organizationId: string;
  createdAt: number;
  retryCount: number;
  lastError?: string;
  synced: boolean;
}

// ─── Offline Cache Types ──────────────────────────────────────────────────────

export interface CachedMember {
  id: string;
  tenantId: string;
  organizationId: string;
  firstName: string;
  lastName: string;
  phone?: string;
  memberStatus: string;
  discipleshipLevel: string;
  updatedAt: number;
}

export interface CachedDonation {
  id: string;
  tenantId: string;
  organizationId: string;
  memberId?: string;
  donationType: string;
  amountKobo: number;
  currency: string;
  donationDate: number;
  synced: boolean;
  updatedAt: number;
}

export interface CachedEvent {
  id: string;
  tenantId: string;
  organizationId: string;
  title: string;
  eventType: string;
  startTime: number;
  updatedAt: number;
}

// ─── Pending Donation Types (Usher PWA — T-CIV-01) ───────────────────────────

export type PendingDonationStatus = "pending" | "syncing" | "synced" | "failed";

export interface PendingDonation {
  id: string;
  tenantId: string;
  organizationId: string;
  donationType: "tithe" | "offering" | "special" | "seed";
  amountKobo: number;
  denominationBreakdown: string;
  memberId?: string;
  notes?: string;
  collectedBy: string;
  serviceRef: string;
  status: PendingDonationStatus;
  syncAttempts: number;
  lastSyncError?: string;
  collectedAt: number;
  createdAt: number;
  updatedAt: number;
}

// ─── Dexie Database ───────────────────────────────────────────────────────────

export class CivicOfflineDb extends Dexie {
  mutationQueue!: Table<MutationQueueItem, number>;
  members!: Table<CachedMember, string>;
  donations!: Table<CachedDonation, string>;
  events!: Table<CachedEvent, string>;
  pendingDonations!: Table<PendingDonation, string>;

  constructor() {
    super("webwaka-civic-offline");

    this.version(1).stores({
      mutationQueue:
        "++id, entityType, entityId, tenantId, organizationId, synced, createdAt",
      members: "id, tenantId, organizationId, memberStatus, updatedAt",
      donations: "id, tenantId, organizationId, memberId, donationType, donationDate, synced",
      events: "id, tenantId, organizationId, eventType, startTime",
    });

    this.version(2).stores({
      mutationQueue:
        "++id, entityType, entityId, tenantId, organizationId, synced, createdAt",
      members: "id, tenantId, organizationId, memberStatus, updatedAt",
      donations: "id, tenantId, organizationId, memberId, donationType, donationDate, synced",
      events: "id, tenantId, organizationId, eventType, startTime",
      pendingDonations:
        "id, tenantId, organizationId, status, donationType, collectedAt, [tenantId+status]",
    });
  }
}

// ─── Sync Engine ──────────────────────────────────────────────────────────────

export class CivicSyncEngine {
  private readonly db: CivicOfflineDb;
  private readonly syncUrl: string;
  private readonly tenantId: string;
  private readonly organizationId: string;
  private isSyncing = false;

  constructor(syncUrl: string, tenantId: string, organizationId: string) {
    this.db = new CivicOfflineDb();
    this.syncUrl = syncUrl;
    this.tenantId = tenantId;
    this.organizationId = organizationId;
  }

  /**
   * Enqueue a mutation for offline processing.
   * Called when the device is offline or as a write-through cache.
   */
  async enqueue(
    entityType: CivicEntityType,
    entityId: string,
    operation: MutationOperation,
    payload: Record<string, unknown>
  ): Promise<void> {
    await this.db.mutationQueue.add({
      entityType,
      entityId,
      operation,
      payload,
      tenantId: this.tenantId,
      organizationId: this.organizationId,
      createdAt: Date.now(),
      retryCount: 0,
      synced: false,
    });
  }

  /**
   * Process all pending mutations in the queue.
   * Called when the device comes back online or via background sync.
   */
  async processQueue(): Promise<{ processed: number; failed: number }> {
    if (this.isSyncing) {
      return { processed: 0, failed: 0 };
    }

    this.isSyncing = true;
    let processed = 0;
    let failed = 0;

    try {
      const pending = await this.db.mutationQueue
        .where("synced")
        .equals(0)
        .and((item) => item.retryCount < 5)
        .toArray();

      for (const item of pending) {
        try {
          const response = await fetch(`${this.syncUrl}/api/civic/sync`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              entityType: item.entityType,
              entityId: item.entityId,
              operation: item.operation,
              payload: item.payload,
              tenantId: item.tenantId,
              organizationId: item.organizationId,
            }),
          });

          if (response.ok) {
            await this.db.mutationQueue.update(item.id!, { synced: true });
            processed++;
          } else {
            await this.db.mutationQueue.update(item.id!, {
              retryCount: item.retryCount + 1,
              lastError: `HTTP ${response.status}`,
            });
            failed++;
          }
        } catch (err) {
          await this.db.mutationQueue.update(item.id!, {
            retryCount: item.retryCount + 1,
            lastError: String(err),
          });
          failed++;
        }
      }
    } finally {
      this.isSyncing = false;
    }

    return { processed, failed };
  }

  /**
   * Get the count of pending (unsynced) mutations.
   */
  async getPendingCount(): Promise<number> {
    return this.db.mutationQueue.where("synced").equals(0).count();
  }

  /**
   * Cache members for offline access.
   */
  async cacheMembers(members: CachedMember[]): Promise<void> {
    await this.db.members.bulkPut(members);
  }

  /**
   * Get cached members for offline display.
   */
  async getCachedMembers(organizationId: string): Promise<CachedMember[]> {
    return this.db.members.where("organizationId").equals(organizationId).toArray();
  }

  /**
   * Cache a donation locally (offline-first write).
   */
  async cacheDonation(donation: CachedDonation): Promise<void> {
    await this.db.donations.put(donation);
  }

  /**
   * Register a background sync handler (called from service worker).
   */
  static registerBackgroundSync(): void {
    if ("serviceWorker" in navigator && "SyncManager" in window) {
      navigator.serviceWorker.ready
        .then((registration) => {
          return (registration as ServiceWorkerRegistration & {
            sync: { register: (tag: string) => Promise<void> };
          }).sync.register("civic-sync");
        })
        .catch(() => {
          // Background sync not available — will sync on next page load
        });
    }
  }
}

export function createSyncEngine(
  syncUrl: string,
  tenantId: string,
  organizationId: string
): CivicSyncEngine {
  return new CivicSyncEngine(syncUrl, tenantId, organizationId);
}
