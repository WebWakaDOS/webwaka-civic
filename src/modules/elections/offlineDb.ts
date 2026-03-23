/**
 * WebWaka Civic — CIV-3 Phase 2: Offline Voting Database
 * Dexie IndexedDB Schema for offline ballot capture and sync queue
 * 
 * Blueprint Reference: Part 6 (Universal Offline Sync Engine)
 * Invariants: Offline First, PWA First, Build Once Use Infinitely
 * 
 * This module provides:
 * 1. Client-side ballot storage (IndexedDB via Dexie)
 * 2. Sync queue for offline votes pending submission
 * 3. Session management for voter tracking
 * 4. Conflict detection for duplicate votes
 * 5. Background sync integration
 */

import Dexie, { Table } from "dexie";

// ─── Type Definitions ────────────────────────────────────────────────────────

export interface BallotRecord {
  id: string;
  electionId: string;
  voterId: string;
  candidateId: string;
  candidateName: string;
  encryptedVote: string;
  verificationHash?: string;
  castAt: number;
  submittedAt?: number;
  verifiedAt?: number;
  status: "draft" | "pending_sync" | "synced" | "verified" | "rejected";
  offlineOnly: boolean;
  syncAttempts: number;
  lastSyncError?: string;
  lastSyncAttempt?: number;
  createdAt: number;
  updatedAt: number;
}

export interface SessionRecord {
  id: string;
  electionId: string;
  voterId: string;
  sessionToken: string;
  hasVoted: boolean;
  voteId?: string;
  ballotId?: string;
  expiresAt: number;
  createdAt: number;
}

export interface SyncQueueRecord {
  id: string;
  ballotId: string;
  electionId: string;
  voterId: string;
  status: "pending" | "syncing" | "synced" | "failed";
  retryCount: number;
  maxRetries: number;
  lastError?: string;
  lastAttempt?: number;
  nextRetryAt?: number;
  createdAt: number;
  updatedAt: number;
}

export interface ElectionCacheRecord {
  id: string;
  name: string;
  electionType: string;
  position: string;
  status: string;
  nominationStartAt?: number;
  nominationEndAt?: number;
  votingStartAt?: number;
  votingEndAt?: number;
  cachedAt: number;
}

export interface CandidateCacheRecord {
  id: string;
  electionId: string;
  name: string;
  bio?: string;
  manifestoUrl?: string;
  photoUrl?: string;
  status: string;
  voteCount: number;
  cachedAt: number;
}

export interface VotingStationCacheRecord {
  id: string;
  electionId: string;
  name: string;
  location: string;
  latitude?: number;
  longitude?: number;
  capacity: number;
  cachedAt: number;
}

export interface ConflictRecord {
  id: string;
  electionId: string;
  voterId: string;
  ballot1Id: string;
  ballot2Id: string;
  conflictType: "duplicate_vote" | "concurrent_submission" | "sync_conflict";
  resolution: "local_wins" | "server_wins" | "manual_review" | "pending";
  details?: string;
  createdAt: number;
  resolvedAt?: number;
}

export interface SyncMetadataRecord {
  key: string; // e.g., "last_sync_timestamp", "pending_count"
  value: string;
  updatedAt: number;
}

// ─── Dexie Database Class ────────────────────────────────────────────────────

export class OfflineVotingDB extends Dexie {
  ballots!: Table<BallotRecord>;
  sessions!: Table<SessionRecord>;
  syncQueue!: Table<SyncQueueRecord>;
  elections!: Table<ElectionCacheRecord>;
  candidates!: Table<CandidateCacheRecord>;
  votingStations!: Table<VotingStationCacheRecord>;
  conflicts!: Table<ConflictRecord>;
  syncMetadata!: Table<SyncMetadataRecord>;

  constructor() {
    super("OfflineVotingDB");
    this.version(1).stores({
      ballots: "id, electionId, voterId, status, createdAt, [electionId+voterId]",
      sessions: "id, electionId, voterId, sessionToken, expiresAt, [electionId+voterId]",
      syncQueue: "id, ballotId, status, electionId, createdAt, [status+createdAt]",
      elections: "id, cachedAt",
      candidates: "id, electionId, cachedAt, [electionId+id]",
      votingStations: "id, electionId, cachedAt, [electionId+id]",
      conflicts: "id, electionId, voterId, createdAt, [electionId+voterId]",
      syncMetadata: "key, updatedAt",
    });
  }
}

// ─── Database Instance ───────────────────────────────────────────────────────

export const offlineDb = new OfflineVotingDB();

// ─── Ballot Management Functions ─────────────────────────────────────────────

/**
 * Create a new ballot record (offline ballot capture)
 */
export async function createBallot(
  electionId: string,
  voterId: string,
  candidateId: string,
  candidateName: string,
  encryptedVote: string,
  offlineOnly: boolean = true
): Promise<BallotRecord> {
  const ballot: BallotRecord = {
    id: crypto.randomUUID(),
    electionId,
    voterId,
    candidateId,
    candidateName,
    encryptedVote,
    castAt: Date.now(),
    status: offlineOnly ? "draft" : "pending_sync",
    offlineOnly,
    syncAttempts: 0,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  await offlineDb.ballots.add(ballot);
  return ballot;
}

/**
 * Get ballot by ID
 */
export async function getBallot(ballotId: string): Promise<BallotRecord | undefined> {
  return offlineDb.ballots.get(ballotId);
}

/**
 * Get all ballots for a voter in an election
 */
export async function getVoterBallots(
  electionId: string,
  voterId: string
): Promise<BallotRecord[]> {
  return offlineDb.ballots
    .where("[electionId+voterId]")
    .equals([electionId, voterId])
    .toArray();
}

/**
 * Update ballot status
 */
export async function updateBallotStatus(
  ballotId: string,
  status: BallotRecord["status"],
  updates?: Partial<BallotRecord>
): Promise<void> {
  await offlineDb.ballots.update(ballotId, {
    status,
    updatedAt: Date.now(),
    ...updates,
  });
}

/**
 * Mark ballot as synced
 */
export async function markBallotSynced(
  ballotId: string,
  verificationHash: string,
  submittedAt: number
): Promise<void> {
  await offlineDb.ballots.update(ballotId, {
    status: "synced",
    verificationHash,
    submittedAt,
    syncAttempts: 0,
    lastSyncError: undefined,
    updatedAt: Date.now(),
  });
}

/**
 * Get all pending ballots (not yet synced)
 */
export async function getPendingBallots(): Promise<BallotRecord[]> {
  return offlineDb.ballots
    .where("status")
    .anyOf(["draft", "pending_sync"])
    .toArray();
}

/**
 * Get all ballots for sync
 */
export async function getBallotsForSync(
  limit: number = 100
): Promise<BallotRecord[]> {
  return offlineDb.ballots
    .where("status")
    .equals("pending_sync")
    .limit(limit)
    .toArray();
}

/**
 * Delete ballot (soft delete by marking as rejected)
 */
export async function deleteBallot(ballotId: string): Promise<void> {
  await offlineDb.ballots.update(ballotId, {
    status: "rejected",
    updatedAt: Date.now(),
  });
}

// ─── Session Management Functions ────────────────────────────────────────────

/**
 * Create a new voter session
 */
export async function createSession(
  electionId: string,
  voterId: string,
  sessionToken: string,
  expiresAt: number
): Promise<SessionRecord> {
  const session: SessionRecord = {
    id: crypto.randomUUID(),
    electionId,
    voterId,
    sessionToken,
    hasVoted: false,
    expiresAt,
    createdAt: Date.now(),
  };

  await offlineDb.sessions.add(session);
  return session;
}

/**
 * Get session by token
 */
export async function getSessionByToken(
  sessionToken: string
): Promise<SessionRecord | undefined> {
  return offlineDb.sessions.where("sessionToken").equals(sessionToken).first();
}

/**
 * Get session by ID
 */
export async function getSession(sessionId: string): Promise<SessionRecord | undefined> {
  return offlineDb.sessions.get(sessionId);
}

/**
 * Get active session for voter in election
 */
export async function getActiveSession(
  electionId: string,
  voterId: string
): Promise<SessionRecord | undefined> {
  const sessions = await offlineDb.sessions
    .where("[electionId+voterId]")
    .equals([electionId, voterId])
    .toArray();

  // Return the most recent non-expired session
  return sessions
    .filter((s) => s.expiresAt > Date.now())
    .sort((a, b) => b.createdAt - a.createdAt)[0];
}

/**
 * Mark session as voted
 */
export async function markSessionVoted(
  sessionId: string,
  ballotId: string,
  voteId?: string
): Promise<void> {
  await offlineDb.sessions.update(sessionId, {
    hasVoted: true,
    ballotId,
    voteId,
  });
}

/**
 * Check if voter has already voted in election
 */
export async function hasVoterVoted(
  electionId: string,
  voterId: string
): Promise<boolean> {
  const session = await getActiveSession(electionId, voterId);
  return session ? session.hasVoted : false;
}

/**
 * Clean up expired sessions
 */
export async function cleanupExpiredSessions(): Promise<number> {
  const now = Date.now();
  const expiredSessions = await offlineDb.sessions
    .where("expiresAt")
    .below(now)
    .toArray();

  await offlineDb.sessions.bulkDelete(expiredSessions.map((s) => s.id));
  return expiredSessions.length;
}

// ─── Sync Queue Management Functions ─────────────────────────────────────────

/**
 * Add ballot to sync queue
 */
export async function addToSyncQueue(
  ballotId: string,
  electionId: string,
  voterId: string,
  maxRetries: number = 3
): Promise<SyncQueueRecord> {
  const queueItem: SyncQueueRecord = {
    id: crypto.randomUUID(),
    ballotId,
    electionId,
    voterId,
    status: "pending",
    retryCount: 0,
    maxRetries,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  await offlineDb.syncQueue.add(queueItem);
  return queueItem;
}

/**
 * Get next item from sync queue
 */
export async function getNextSyncQueueItem(): Promise<SyncQueueRecord | undefined> {
  const now = Date.now();
  return offlineDb.syncQueue
    .where("status")
    .equals("pending")
    .filter((item) => !item.nextRetryAt || item.nextRetryAt <= now)
    .first();
}

/**
 * Update sync queue item status
 */
export async function updateSyncQueueStatus(
  queueItemId: string,
  status: SyncQueueRecord["status"],
  error?: string
): Promise<void> {
  const updates: Partial<SyncQueueRecord> = {
    status,
    updatedAt: Date.now(),
  };

  if (error) {
    updates.lastError = error;
    updates.lastAttempt = Date.now();
  }

  await offlineDb.syncQueue.update(queueItemId, updates);
}

/**
 * Increment retry count with exponential backoff
 */
export async function incrementSyncRetry(
  queueItemId: string,
  error: string
): Promise<void> {
  const item = await offlineDb.syncQueue.get(queueItemId);
  if (!item) return;

  const newRetryCount = item.retryCount + 1;
  const backoffMs = Math.pow(2, newRetryCount) * 1000; // Exponential backoff
  const nextRetryAt = Date.now() + backoffMs;

  await offlineDb.syncQueue.update(queueItemId, {
    retryCount: newRetryCount,
    lastError: error,
    lastAttempt: Date.now(),
    nextRetryAt,
    status: newRetryCount >= item.maxRetries ? "failed" : "pending",
    updatedAt: Date.now(),
  });
}

/**
 * Get all pending sync items
 */
export async function getPendingSyncItems(): Promise<SyncQueueRecord[]> {
  return offlineDb.syncQueue.where("status").equals("pending").toArray();
}

/**
 * Get sync queue statistics
 */
export async function getSyncQueueStats(): Promise<{
  pending: number;
  syncing: number;
  synced: number;
  failed: number;
}> {
  const items = await offlineDb.syncQueue.toArray();
  return {
    pending: items.filter((i) => i.status === "pending").length,
    syncing: items.filter((i) => i.status === "syncing").length,
    synced: items.filter((i) => i.status === "synced").length,
    failed: items.filter((i) => i.status === "failed").length,
  };
}

// ─── Cache Management Functions ──────────────────────────────────────────────

/**
 * Cache election data
 */
export async function cacheElection(
  election: Omit<ElectionCacheRecord, "cachedAt">
): Promise<void> {
  await offlineDb.elections.put({
    ...election,
    cachedAt: Date.now(),
  });
}

/**
 * Get cached election
 */
export async function getCachedElection(
  electionId: string
): Promise<ElectionCacheRecord | undefined> {
  return offlineDb.elections.get(electionId);
}

/**
 * Cache candidates for election
 */
export async function cacheCandidates(
  candidates: Omit<CandidateCacheRecord, "cachedAt">[]
): Promise<void> {
  const withTimestamp = candidates.map((c) => ({
    ...c,
    cachedAt: Date.now(),
  }));
  await offlineDb.candidates.bulkPut(withTimestamp);
}

/**
 * Get cached candidates for election
 */
export async function getCachedCandidates(
  electionId: string
): Promise<CandidateCacheRecord[]> {
  return offlineDb.candidates
    .where("electionId")
    .equals(electionId)
    .toArray();
}

/**
 * Cache voting stations
 */
export async function cacheVotingStations(
  stations: Omit<VotingStationCacheRecord, "cachedAt">[]
): Promise<void> {
  const withTimestamp = stations.map((s) => ({
    ...s,
    cachedAt: Date.now(),
  }));
  await offlineDb.votingStations.bulkPut(withTimestamp);
}

/**
 * Get cached voting stations for election
 */
export async function getCachedVotingStations(
  electionId: string
): Promise<VotingStationCacheRecord[]> {
  return offlineDb.votingStations
    .where("electionId")
    .equals(electionId)
    .toArray();
}

// ─── Conflict Detection Functions ────────────────────────────────────────────

/**
 * Check for duplicate votes
 */
export async function checkDuplicateVote(
  electionId: string,
  voterId: string
): Promise<BallotRecord | undefined> {
  const ballots = await getVoterBallots(electionId, voterId);
  return ballots.find((b) => b.status !== "rejected");
}

/**
 * Record conflict
 */
export async function recordConflict(
  electionId: string,
  voterId: string,
  ballot1Id: string,
  ballot2Id: string,
  conflictType: ConflictRecord["conflictType"]
): Promise<ConflictRecord> {
  const conflict: ConflictRecord = {
    id: crypto.randomUUID(),
    electionId,
    voterId,
    ballot1Id,
    ballot2Id,
    conflictType,
    resolution: "pending",
    createdAt: Date.now(),
  };

  await offlineDb.conflicts.add(conflict);
  return conflict;
}

/**
 * Get conflicts for election
 */
export async function getElectionConflicts(
  electionId: string
): Promise<ConflictRecord[]> {
  return offlineDb.conflicts
    .where("electionId")
    .equals(electionId)
    .toArray();
}

/**
 * Resolve conflict
 */
export async function resolveConflict(
  conflictId: string,
  resolution: ConflictRecord["resolution"],
  resolvedBy?: string
): Promise<void> {
  await offlineDb.conflicts.update(conflictId, {
    resolution,
    resolvedAt: Date.now(),
    ...(resolvedBy && { details: `Resolved by: ${resolvedBy}` }),
  });
}

// ─── Sync Metadata Functions ─────────────────────────────────────────────────

/**
 * Get sync metadata
 */
export async function getSyncMetadata(key: string): Promise<string | undefined> {
  const record = await offlineDb.syncMetadata.get(key);
  return record?.value;
}

/**
 * Set sync metadata
 */
export async function setSyncMetadata(key: string, value: string): Promise<void> {
  await offlineDb.syncMetadata.put({
    key,
    value,
    updatedAt: Date.now(),
  });
}

/**
 * Get last sync timestamp
 */
export async function getLastSyncTimestamp(): Promise<number> {
  const value = await getSyncMetadata("last_sync_timestamp");
  return value ? parseInt(value, 10) : 0;
}

/**
 * Update last sync timestamp
 */
export async function updateLastSyncTimestamp(): Promise<void> {
  await setSyncMetadata("last_sync_timestamp", Date.now().toString());
}

// ─── Database Maintenance Functions ──────────────────────────────────────────

/**
 * Clear all offline data (for testing or logout)
 */
export async function clearAllOfflineData(): Promise<void> {
  await offlineDb.ballots.clear();
  await offlineDb.sessions.clear();
  await offlineDb.syncQueue.clear();
  await offlineDb.elections.clear();
  await offlineDb.candidates.clear();
  await offlineDb.votingStations.clear();
  await offlineDb.conflicts.clear();
  await offlineDb.syncMetadata.clear();
}

/**
 * Get database statistics
 */
export async function getDbStats(): Promise<{
  ballots: number;
  sessions: number;
  syncQueue: number;
  elections: number;
  candidates: number;
  votingStations: number;
  conflicts: number;
}> {
  return {
    ballots: await offlineDb.ballots.count(),
    sessions: await offlineDb.sessions.count(),
    syncQueue: await offlineDb.syncQueue.count(),
    elections: await offlineDb.elections.count(),
    candidates: await offlineDb.candidates.count(),
    votingStations: await offlineDb.votingStations.count(),
    conflicts: await offlineDb.conflicts.count(),
  };
}

/**
 * Export all data for backup
 */
export async function exportAllData(): Promise<{
  ballots: BallotRecord[];
  sessions: SessionRecord[];
  syncQueue: SyncQueueRecord[];
  elections: ElectionCacheRecord[];
  candidates: CandidateCacheRecord[];
  votingStations: VotingStationCacheRecord[];
  conflicts: ConflictRecord[];
}> {
  return {
    ballots: await offlineDb.ballots.toArray(),
    sessions: await offlineDb.sessions.toArray(),
    syncQueue: await offlineDb.syncQueue.toArray(),
    elections: await offlineDb.elections.toArray(),
    candidates: await offlineDb.candidates.toArray(),
    votingStations: await offlineDb.votingStations.toArray(),
    conflicts: await offlineDb.conflicts.toArray(),
  };
}

export default offlineDb;
