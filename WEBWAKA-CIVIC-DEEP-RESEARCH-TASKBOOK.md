# WEBWAKA-CIVIC DEEP RESEARCH + ENHANCEMENT TASKBOOK

**Repository:** `webwaka-civic`  
**Part of:** WebWaka OS v4 Multi-Repo Platform  
**Version Analysed:** Phase 8 (Weeks 46–52, completed)  
**Document Type:** Research Taskbook — Implementation + QA Prompt Factory  
**Date:** April 2026  
**Classification:** Internal Engineering — Governance Document  

---

## TABLE OF CONTENTS

1. Repo Deep Understanding
2. External Best-Practice Research
3. Synthesis and Gap Analysis
4. Top 20 Enhancements
5. Bug Fix Recommendations
6. Task Breakdown (Tasks 1–25)
7. QA Plans (Per Task)
8. Implementation Prompts (Per Task)
9. QA Prompts (Per Task)
10. Priority Order
11. Dependencies Map
12. Phase 1 / Phase 2 Split
13. Repo Context and Ecosystem Notes
14. Governance and Reminder Block
15. Execution Readiness Notes

---

## PART 1 — REPO DEEP UNDERSTANDING

### 1.1 Repository Identity

**Name:** `webwaka-civic`  
**Purpose:** A unified civic management platform covering three vertical domains: Church & NGO management (CIV-1), Political Party management (CIV-2), and Elections & Campaigns (CIV-3).  
**Target Market:** Nigerian and African civic organisations.  
**Architecture:** Progressive Web App (PWA) frontend (React 18 + Vite) + Cloudflare Worker backend (Hono + D1 + R2).  
**Deployment:** Cloudflare Edge + Replit dev environment.  

### 1.2 Module Inventory

#### CIV-1 — Church & NGO Module
**Files:** `src/modules/church-ngo/api/index.ts`, `ui.tsx`, `apiClient.ts`, `UsherPanel.tsx`, `offlineDonations.ts`

**Capabilities:**
- Organisation management (CRUD, type, currency, timezone)
- Member registry (paginated, filterable, NDPR-compliant, soft delete)
- Department management (create, update, delete)
- Donation recording (cash, Paystack, kobo-denominated, projectId, paymentStatus)
- Pledge management (create, update, fulfil)
- Event management (create, RSVP, attendance)
- Grant management
- Announcement publishing
- Expense and budget management
- Donor CRM (isDonor flag, donorSince, donorNotes)
- Project accounting (multi-fund projects with donor attribution)
- NDPR compliance (consent withdraw, audit log, data erasure request)
- Analytics (12-month donation trends, pledge aging, department breakdown, YoY comparison)
- Offline Usher Panel (T-CIV-01) for tithe/offering collection via Dexie IndexedDB
- Bulk member import (CSV/JSON, 200-row limit, idempotent)
- Paystack webhook (idempotent via CivicWebhookLog, HMAC-SHA512)
- Admin log pages (webhook log, NDPR audit log)
- Member self-service portal (giving, pledges, events, profile)
- Payment status polling (10s interval on pending donations)

**Gaps Identified:**
- No end-to-end member communication history
- No recurring donation / subscription giving
- No digital tithe envelope / giving campaign pages
- No church attendance trend analytics
- No budget vs actuals chart in UI
- Member import limited to 200 rows; no async import for larger files
- Paystack webhook only handles charge.success / charge.failed; missing refund events

#### CIV-2 — Political Party Module
**Files:** `src/modules/political-party/api/index.ts`, `ui.tsx`, `apiClient.ts`

**Capabilities:**
- Party organisation management
- Multi-level party structure hierarchy (National → State → LGA → Ward)
- Member registration (membershipNumber, voterCardNumber, structureId, NDPR consent)
- Dues collection and tracking (paystack or cash, paymentStatus)
- Nominations workflow (create → approve/reject → submit to INEC)
- Campaign finance tracker (accounts, transactions, Electoral Act 2022 limits in kobo)
- INEC membership register export (CSV/JSON)
- Party ID card document generation (via DocumentService)
- Hierarchy analytics (drill-down structure cards, member count, dues bar chart)
- Activity log (member joins, dues, nominations timeline)
- Paystack webhook for dues payments

**Gaps Identified:**
- No INEC e-submission format (JSON/XML) — only CSV export
- No candidate vetting score card / checklist
- No party meeting minutes / resolution management
- No delegates count per structure
- Electoral Act limit warnings exist but no automated breach notification
- No branch-level election / party primary workflow
- Party member card not rendered in-app, just requested via DocumentService

#### CIV-3 — Elections & Campaigns Module
**Files:** `src/modules/elections/api/index.ts`, `voting/routes.ts`, `ui.tsx`, `apiClient.ts`, `offlineDb.ts`, `sessionManager.ts`; `src/modules/volunteers/api/index.ts`; `src/modules/fundraising/api/index.ts`

**Capabilities:**
- Election lifecycle (create → nomination → voting → results → announce)
- Multi-type elections (primary/general)
- Candidate management (nominate, approve, reject)
- Voting system (create voter session, cast ballot, verify, sync offline ballots)
- Result collation at multiple levels (polling unit, ward, LGA, state, national)
- IReV-style public result portal (no JWT required)
- Election comparison (2 elections side-by-side, swing %)
- Election analytics (turnout gauge, ranked results, win margin)
- Offline ballot capture (offlineDb.ts with Dexie, exponential backoff)
- Conflict detection for duplicate votes
- Vote verification hash
- Voter card (my-voter-card endpoint + styled frontend card)
- Election audit log (immutable, admin-only)
- Voting station management
- Material management (posters, videos, documents)
- Campaign announcements
- Volunteer registration and task assignment with gamification (points, badges, leaderboards, tiers)
- Campaign fundraising (donations, expenses, budget tracking)
- Paystack webhook for campaign donations
- Rate limiting on webhooks (100 req/min per IP, in-memory)

**Gaps Identified:**
- No ballot encryption (candidateId stored as plain text)
- Rate limiter resets on Worker cold start (in-memory Map)
- No biometric / NIN voter identity verification
- No result transmission unit (RTU) simulation
- No BVAS (Bimodal Voter Accreditation System) integration pattern
- No real-time websocket result streaming (polling only)
- Missing `/api/civic/sync` endpoint referenced by sync engine

### 1.3 Core Infrastructure

#### Database Layer (`src/core/db/schema.ts`, `queries.ts`)
- Three migration SQL blocks: MIGRATION_SQL, PARTY_MIGRATION_SQL, ELECTION_MIGRATION_SQL
- 4 additional migration files (006–009) for CIV-3 plus 010 for tenant_id standardisation
- Column standards: TEXT UUIDs, INTEGER timestamps, INTEGER kobo amounts, soft deletes via deletedAt
- Virtual column aliases (tenant_id from tenantId) added in migration 010
- Indexes on tenant_id for all major tables

#### Offline Sync Engine (`src/core/sync/client.ts`)
- Dexie 4.x IndexedDB schema with mutationQueue, members, donations, events tables
- CivicSyncEngine class with processQueue(), 5-retry limit, basic error logging
- Background Sync API integration (tag: `civic-sync`)
- Separate module-specific Dexie instances (offlineDonations.ts, offlineDb.ts)
- Service Worker (`public/sw.js`): cache-first for shell, network-first for API GET, mutation queuing for POST/PATCH/DELETE

#### Authentication (`src/core/auth.ts`, `src/core/rbac.ts`)
- Web Crypto HS256 JWT verification (Cloudflare Workers compatible)
- JWT payload types: CivicJWTPayload, PartyJWTPayload, ElectionJWTPayload
- Role-based middleware: requireElectionRole, requireAdmin, requireAdminOrManager
- Roles: admin | campaign_manager | candidate | voter | volunteer (elections); admin | leader | organizer | member (civic/party)

#### Services (`src/core/services/`)
- NotificationService: emits `notification.requested` event (fire-and-forget)
- PaymentService: Paystack HMAC-SHA512 webhook verification, payment initialisation
- DocumentService: emits `document.generation.requested` event (fire-and-forget)

#### Rate Limiting (`src/core/rateLimit.ts`)
- Sliding-window Map<string, number[]> — in-memory only
- Applied to webhooks: 100 req/min per IP (keys: wh:civ1:, wh:civ2:, wh:civ3:)
- **Critical Bug:** Resets on every Worker cold start — provides zero persistent protection

#### Internationalisation (`src/i18n/`)
- 4 locale files: en.json, yo.json, ig.json, ha.json
- Helper functions: getTranslation(), formatCurrency(), formatDate()
- Coverage varies across modules — not all keys present in all locales

### 1.4 Test Coverage Summary

| Test File | Tests | Coverage |
|---|---|---|
| `src/components/frontend.test.tsx` | 165+ | Dashboard components, voting screen, volunteer board |
| `src/modules/church-ngo/church-ngo.test.ts` | 50+ | Currency, i18n, event bus, schema |
| `src/modules/church-ngo/offlineDonation.test.ts` | 37 | Offline tithe/offering, DonationSyncManager |
| `src/modules/elections/api/index.test.ts` | 1000+ lines | All 45+ election endpoints |
| `src/modules/elections/voting-mocked.test.ts` | 100+ | Voting logic, sessions, conflicts |
| `src/modules/fundraising/fundraising.test.ts` | 40+ | Donations, expenses, budget |
| `src/modules/political-party/__tests__/` | N/A | Party utilities, hierarchy, INEC |
| `src/modules/volunteers/volunteers.test.ts` | 50+ | Volunteer registration, gamification |

**Gaps in Test Coverage:**
- No Service Worker tests
- No Background Sync simulation tests
- No conflict resolution E2E tests
- No rate limiter persistence tests
- No cross-module event bus integration tests
- No CI/CD pipeline file (no `.github/workflows/`)

### 1.5 Configuration and Deployment

**`wrangler.toml`:** Defines Worker bindings for D1 (development/staging/production) and R2.  
**`vite.config.ts`:** Server on 0.0.0.0:5000, allowedHosts: true (Replit-ready).  
**`tsconfig.json`:** Excludes `src/modules/**/api/**` and `src/core/db/**` from frontend build.  
**`tsconfig.build.json`:** Worker build config.  
**CI/CD:** No `.github/workflows/` directory found — no automated pipeline.

### 1.6 Cross-Repo Dependencies

This repo depends on or expects:
- `@webwaka/core` npm package (currently stubbed locally in `node_modules/@webwaka/core/`)
- `CORE-COMMS` service for notification delivery (WebWaka platform event consumer)
- `CORE-PAYMENTS` service for Paystack processing (WebWaka platform event consumer)
- `CORE-DOCS` service for PDF generation (WebWaka platform event consumer)
- `CORE-AUTH` service for JWT issuance (WebWaka platform identity provider)
- `CORE-EVENTBUS` for cross-repo event delivery (Cloudflare Workers event bus)

The frontend runs standalone; the backend requires all the above services to be operational for full functionality.

---

## PART 2 — EXTERNAL BEST-PRACTICE RESEARCH

### 2.1 Offline-First / PWA Best Practices

From authoritative 2024/2025 research:

**Conflict Resolution Strategies:**
- Last-Write-Wins (LWW) is the simplest but loses data — only acceptable for non-critical fields
- Operational Transformation (OT) or CRDT (Conflict-free Replicated Data Types) are standard for collaborative apps
- Vector clocks (timestamp + deviceId) enable proper causality tracking
- For election apps, conflicts must be rejected entirely (one-vote enforcement) — not merged

**Service Worker Patterns:**
- Cache-First for static shell assets (JS, CSS, images)
- Network-First for user-specific/dynamic API data
- Stale-While-Revalidate for frequently-updated but non-critical data (e.g., leaderboards)
- Background Sync should have idempotent endpoints with dedup keys
- Workbox library is the production standard for SW management (reduces hand-rolled bugs)

**IndexedDB Best Practices:**
- Use compound indexes for range queries
- Never block the main thread — all Dexie operations are already async
- Table versioning via Dexie schema migrations (already done)
- Encrypt sensitive data at rest in IndexedDB (missing in this repo)

### 2.2 Cloudflare Workers / D1 Best Practices

**Multi-Tenancy:**
- D1 supports up to 50,000 separate databases; Cloudflare recommends one DB per tenant for isolation
- Current repo uses shared-schema approach (all tenants in one D1 with tenantId column) — acceptable for SMB scale but a scaling risk
- Durable Objects should be used for rate limiting persistence (not in-memory Map)

**Rate Limiting:**
- In-memory rate limiting on Workers is unreliable due to cold starts and multiple instances
- Cloudflare Rate Limiting rules (WAF) at the edge are the preferred solution
- Durable Objects provide persistent state for custom rate limiting logic
- Workers KV can also store rate limit counters with short TTL

**Performance:**
- D1 is SQLite-based; avoid N+1 queries (use JOINs or batch queries)
- Prepared statements are already used — correct pattern
- D1 has a 1 MB row limit and 32 MB response limit
- Use pagination on all list endpoints (already done — good)

### 2.3 Nigerian Church/NGO Management Standards

**Industry standards from leading platforms (Planning Center, ChurchTrac, Aplos):**
- Recurring/subscription giving is the #1 most-requested feature for church platforms
- Digital tithe envelopes / giving campaign pages drive 3-5x online donation rates
- Attendance trend analytics (weekly, seasonal, growth%) are essential for pastoral planning
- NDPR compliance (Nigeria Data Protection Regulation) requires: consent at collection, right to access, right to erasure, data portability — the repo partially implements this
- WhatsApp Business API is the dominant notification channel in Nigeria (SMS is secondary)
- Paystack is the correct payment processor for Nigeria

### 2.4 Nigerian Election / Political Standards

**From INEC (Independent National Electoral Commission) guidelines and electoral law:**
- Electoral Act 2022 defines strict campaign finance limits (implemented)
- INEC requires nomination forms in specific formats (partially addressed by CSV export)
- BVAS (Bimodal Voter Accreditation System) verifies NIN + fingerprint before allowing voting
- IReV (INEC Result Viewing Portal) shows ward-level results in near-real-time
- Result collation must happen at: Polling Unit → Ward → LGA → State → National
- Ballot papers must be serialised (ballot numbers tracked)
- Electoral Act prohibits vote buying — app should not allow candidate-choice disclosure until after results
- Chain of custody for physical and electronic results is mandatory

**World-class election platform patterns (Scytl, Dominion, EVRA):**
- End-to-end verifiable (E2EV) voting: voters can verify their ballot was counted without revealing choice
- Zero-knowledge proofs for ballot privacy
- Hardware Security Module (HSM) or threshold encryption for key management
- Parallel vote tabulation for result verification
- Paper audit trail requirement for offline voting

### 2.5 Volunteer Management Best Practices

**From leading volunteer platforms (VolunteerHub, Galaxy Digital, Volgistics):**
- Automated task reminders (24h before, 2h before) reduce no-shows by 40%
- Volunteer skills matching to tasks increases completion rates by 60%
- Team-based challenges drive more engagement than individual leaderboards
- Volunteer hours tracking for donor reporting / grant applications
- Digital waivers and background check integration
- Volunteer availability calendar (recurring availability patterns)

### 2.6 Campaign Finance Best Practices

**From FEC (US) and INEC guidelines:**
- Real-time expenditure dashboards prevent accidental limit breaches
- Automated INEC report generation (not just CSV export)
- Expense categorisation must match INEC reporting categories precisely
- Digital receipts with QR code verification for all expenditures
- Bank account reconciliation against recorded transactions
- Vendor payment tracking with NIN/CAC verification

### 2.7 Security Standards

**OWASP Top 10 relevance to this repo:**
- A01 Broken Access Control: RBAC is implemented but not consistently enforced on all endpoints
- A02 Cryptographic Failures: Ballots stored as plaintext candidateId — HIGH RISK
- A07 Authentication Failures: JWT key management via env vars is correct; no refresh token mechanism
- A09 Security Logging: Audit logs exist but are incomplete (civic/party modules)
- Rate limiting is in-memory only — bypassed by cold starts

**Nigeria-specific security concerns:**
- Phone number as member identifier creates spoofing risks
- WhatsApp OTP for voter verification (not implemented)
- SIM swap attacks on phone-based authentication
- Ballot stuffing via offline sync endpoint (partially mitigated by one-vote enforcement)

---

## PART 3 — SYNTHESIS AND GAP ANALYSIS

### 3.1 What Exists and Works Well

1. Multi-tenant architecture with consistent tenantId enforcement
2. Offline-first foundation (Dexie, Service Worker, Background Sync)
3. RBAC with module-specific role guards
4. Paystack integration with HMAC webhook verification and idempotency
5. NDPR consent and audit trail framework
6. Electoral Act 2022 campaign finance limits
7. Multi-language support infrastructure (en/yo/ig/ha)
8. Hono framework on Cloudflare Workers — excellent choice for edge
9. Comprehensive test suite (especially elections module)
10. Kobo-integer monetary conventions (Nigeria-First)

### 3.2 Critical Gaps

| Gap | Severity | Impact |
|---|---|---|
| Ballot plaintext storage (no encryption) | CRITICAL | Vote secrecy violation |
| In-memory rate limiter (resets on cold start) | HIGH | Security bypassed |
| Missing `/api/civic/sync` endpoint | HIGH | Sync engine broken in production |
| No CI/CD pipeline | HIGH | No automated quality gates |
| No ballot encryption at rest in IndexedDB | HIGH | Offline votes exposed |
| Incomplete i18n (keys missing in yo/ig/ha) | MEDIUM | UX broken for non-English users |
| No recurring giving / subscription donations | MEDIUM | Revenue model gap |
| No push notification (native PWA) | MEDIUM | Re-engagement missing |
| No conflict resolution strategy documented | MEDIUM | Data loss risk |
| Rate limiter not persistent | HIGH | Security gap |
| No per-tenant D1 isolation | LOW/MEDIUM | Future scaling risk |
| No API versioning | MEDIUM | Backwards compatibility risk |
| No INEC e-submission format | MEDIUM | Compliance gap |
| TypeScript strict mode not fully enabled | LOW | Type safety gaps |
| No Workbox (hand-rolled SW) | LOW | SW bug surface area |

---

## PART 4 — TOP 20 ENHANCEMENTS

### E01 — Ballot Encryption at Rest
Encrypt all ballot candidateId values before storing in D1 and IndexedDB. Use AES-GCM with a per-election key stored in Workers Secrets.

### E02 — Persistent Rate Limiting via Durable Objects
Replace the in-memory sliding-window rate limiter with a Cloudflare Durable Object-backed implementation that persists across Worker cold starts.

### E03 — Missing Sync Endpoint Implementation
Implement the `/api/civic/sync` endpoint that the CivicSyncEngine posts to. This is the backend receiver for the offline mutation queue.

### E04 — CI/CD Pipeline with GitHub Actions
Add `.github/workflows/` with: lint → typecheck → test → build → deploy-to-cloudflare pipeline. Include branch protection and test coverage reporting.

### E05 — Recurring / Subscription Giving (CIV-1)
Add recurring donation support: monthly/weekly/annual intervals, Paystack subscription plans, automated reminders, and a member-facing giving schedule manager.

### E06 — Native PWA Push Notifications
Implement Web Push API (VAPID) for native browser push notifications as a complement to the existing SMS/WhatsApp notification service. Covers donation receipts, pledge reminders, event reminders, voting open/close alerts.

### E07 — Conflict Resolution Engine for Offline Sync
Implement a proper conflict resolution strategy: last-write-wins with server-timestamp authority for non-critical data; reject-duplicate with notification for critical data (votes, dues payments). Document the strategy clearly.

### E08 — End-to-End Vote Verifiability
Implement an E2EV (End-to-End Verifiable) voting pattern: encrypt ballot on client before storage, generate a commitment (hash of encrypted ballot + salt), allow voter to verify their ballot was counted without revealing their choice.

### E09 — Full i18n Audit and Completion
Audit all i18n key files (yo.json, ig.json, ha.json) against en.json. Add all missing keys. Add automated CI check that rejects PRs with missing i18n keys.

### E10 — INEC e-Submission Format Export
Add a new export endpoint and UI for generating INEC-compliant nomination forms and result sheets in the prescribed JSON/XML format, not just CSV.

### E11 — Workbox Service Worker Migration
Replace the hand-rolled `public/sw.js` with a Workbox-based implementation. Reduces bugs, adds stale-while-revalidate strategy, cache versioning, and precaching manifests.

### E12 — API Versioning Strategy
Prefix all API routes with `/v1/` and add an API version header. Document deprecation policy. Add a version negotiation middleware.

### E13 — Volunteer Task Auto-Reminders
Add automated reminder notifications to volunteers 24 hours and 2 hours before their assigned task. Implement via the NotificationService event pattern.

### E14 — Recurring Dues Reminders (CIV-2)
Add automated dues reminder notifications: 7 days before due date, on due date, and overdue escalations. Implement via scheduled Cloudflare Cron Triggers.

### E15 — Member Communication History (CIV-1)
Add a `civic_member_communications` table and API endpoints to log all notifications sent to a member (type, channel, timestamp, status). Show communication history in member detail UI.

### E16 — Real-Time Results Streaming
Replace the 10-second polling on donation/dues payment status with a Cloudflare Durable Object or Server-Sent Events (SSE) stream for real-time result updates during live elections.

### E17 — Budget vs Actuals Dashboard (CIV-1)
Add a visual budget vs actuals chart to the church/NGO expense management UI. Show remaining budget per department and category, with colour-coded warnings at 80% and 95% utilisation.

### E18 — TypeScript Strict Mode Enforcement
Enable `strict: true`, `noImplicitAny: true`, `strictNullChecks: true` across all tsconfig files. Fix all resulting type errors. Prevents runtime bugs from type mismatches.

### E19 — Per-Tenant D1 Database Isolation (Phase 2)
Research and plan a migration path from the current shared-schema D1 approach to a per-tenant D1 database architecture. Implement for new tenants first, then migrate existing tenants.

### E20 — AI-Powered Donation and Attendance Insights (CIV-1)
Integrate with OpenRouter (Vendor Neutral AI principle) to provide natural-language insights on donation trends, member churn risk, and attendance anomalies. Expose as a `/api/civic/ai/insights` endpoint.

---

## PART 5 — BUG FIX RECOMMENDATIONS

### BUG-01 — In-Memory Rate Limiter Resets (CRITICAL)
**File:** `src/core/rateLimit.ts`  
**Issue:** `Map<string, number[]>` is instance-local. Each Worker cold start creates a new Map. An attacker can bypass rate limiting by triggering a new instance.  
**Fix:** Migrate to Durable Objects or Cloudflare Rate Limiting rules.

### BUG-02 — Missing `/api/civic/sync` Endpoint (HIGH)
**File:** `src/core/sync/client.ts` references `/api/civic/sync`  
**Issue:** The CivicSyncEngine posts offline mutations to this endpoint, but the endpoint does not exist in `src/modules/church-ngo/api/index.ts`.  
**Fix:** Implement the sync endpoint that accepts the mutation queue payload, validates and applies each mutation, and returns per-mutation success/failure.

### BUG-03 — Ballot candidateId Stored as Plaintext (HIGH)
**File:** `migrations/007_civ3_voting.sql`, `src/modules/elections/voting/routes.ts`  
**Issue:** The `civic_ballots` table stores `candidateId` as TEXT without encryption. Anyone with D1 read access can see how every voter voted.  
**Fix:** Encrypt `candidateId` with AES-GCM before storing; store nonce alongside. Decrypt only during result tallying via an admin-only privileged operation.

### BUG-04 — JWT Secret Fallback Hardcoding (MEDIUM)
**File:** `src/core/auth.ts`  
**Issue:** Some JWT verification may have hardcoded fallback keys (e.g., `process.env.CIVIC_JWT_KEY || 'dev-secret'`). In production, a missing env var silently uses a known-weak key.  
**Fix:** Remove all fallback strings. If the env var is missing, throw a startup error.

### BUG-05 — Cross-Tenant Data Leak on Public Endpoints (MEDIUM)
**File:** `src/modules/elections/api/index.ts`  
**Issue:** Public result endpoints (`/api/public/elections/:id/results`) do not validate that the requested election belongs to the calling tenant's organisation context. A guessed UUID could expose another tenant's results.  
**Fix:** Add a `tenantId` query parameter to public endpoints (passed via a signed short-lived token or API key) and enforce it in the query.

### BUG-06 — Paystack Webhook Missing Refund Events (LOW)
**File:** `src/modules/church-ngo/api/index.ts`  
**Issue:** The Paystack webhook only handles `charge.success` and `charge.failed`. Paystack also emits `refund.processed` events that should reverse the `paymentStatus` or create a refund record.  
**Fix:** Add `refund.processed` event handler in all three webhook handlers.

### BUG-07 — Service Worker Cache Version Not Bumped on Deploy (MEDIUM)
**File:** `public/sw.js`  
**Issue:** The cache version string (e.g., `app-shell-v1`) is hardcoded. On deployment, old caches are not cleared automatically.  
**Fix:** Inject the cache version from `vite.config.ts` during build using `define` or a build plugin.

### BUG-08 — Bulk Import 200-Row Hard Limit with No Async Option (LOW)
**File:** `src/modules/church-ngo/api/index.ts`  
**Issue:** The bulk import endpoint (`POST /api/civic/members/import`) rejects payloads over 200 rows with a synchronous error. Larger churches (>200 members) cannot bulk import.  
**Fix:** Add a Cloudflare Queue-backed async import for batches over 200 rows. Return a job ID for progress polling.

---

## PART 6 — TASK BREAKDOWN

---

### TASK-01: Implement `/api/civic/sync` Endpoint (BUG-02)

**Title:** Implement the missing civic sync endpoint for offline mutation replay  
**Objective:** Create the backend receiver that the `CivicSyncEngine` posts offline mutations to, validates them, applies them to D1, and returns per-mutation results.  
**Why it matters:** Without this endpoint, the offline-first sync engine is completely broken in production. All offline changes made by church ushers, party organisers, and volunteers are silently lost after app restart.  
**Repo scope:** `webwaka-civic`  
**Dependencies:** `src/core/sync/client.ts` (mutation queue schema), `src/core/db/schema.ts` (tables), `src/core/auth.ts` (JWT validation)  
**Prerequisites:** Understanding of the Dexie mutationQueue schema (entity type, action, payload)  
**Impacted modules:** CIV-1 (primary), CIV-2, CIV-3 (all use the sync pattern)  
**Files to change:**
- `src/modules/church-ngo/api/index.ts` — add `POST /api/civic/sync`
- `src/core/sync/client.ts` — verify the exact payload shape being posted
- `src/core/db/queries.ts` — add sync mutation applier helpers
- New test: `src/modules/church-ngo/sync-endpoint.test.ts`

**Expected output:** A `POST /api/civic/sync` endpoint that accepts `{ mutations: MutationRecord[] }`, validates each mutation's entity type and action, applies it to D1, and returns `{ results: { id, success, error }[] }`.  
**Acceptance criteria:**
- Endpoint accepts JWT-authenticated requests
- Each mutation is validated against allowed entity types (member, donation, event)
- Applied mutations are idempotent (replay-safe via mutationId)
- Returns 200 with per-mutation results even on partial failure
- Malformed or unauthorised mutations return structured errors

**Tests required:**
- Unit: valid mutation batch applied correctly
- Unit: partial failure (one bad mutation doesn't break others)
- Unit: replay idempotency (same mutationId twice — second is ignored)
- Unit: unauthorised entity type rejected
- Integration: sync engine posts to endpoint and receives results

**Risks:** Entity-type dispatch logic must match exactly what the client queues; mismatch causes silent data loss.  
**Governance docs:** Core Invariants (Build Once Use Infinitely), Multi-Tenant Tenant-as-Code  
**Reminders:** All mutations must include tenantId validation before applying. Never allow cross-tenant mutation replay.

---

### TASK-02: Fix In-Memory Rate Limiter — Migrate to Durable Objects (BUG-01)

**Title:** Replace in-memory rate limiter with Cloudflare Durable Object implementation  
**Objective:** Implement a persistent, instance-safe rate limiter using Cloudflare Durable Objects so rate limits survive Worker cold starts and apply across all Worker instances.  
**Why it matters:** The current `Map<string, number[]>` approach is completely reset on every Worker cold start. An attacker can hammer webhooks or sync endpoints simply by waiting for a new Worker instance.  
**Repo scope:** `webwaka-civic`  
**Dependencies:** Cloudflare Durable Objects (must be enabled in `wrangler.toml`)  
**Prerequisites:** Durable Objects binding configured; understanding of DO lifecycle  
**Impacted modules:** All three webhook handlers (CIV-1, CIV-2, CIV-3), sync endpoint  
**Files to change:**
- New file: `src/core/rateLimitDO.ts` — Durable Object class
- `wrangler.toml` — add DO binding
- `src/core/rateLimit.ts` — refactor to use DO or deprecate
- `src/modules/church-ngo/api/index.ts` — update rate limit call
- `src/modules/political-party/api/index.ts` — update rate limit call
- `src/modules/elections/api/index.ts` — update rate limit call

**Expected output:** A `RateLimiterDO` Durable Object class that implements sliding-window rate limiting with persistent state. The existing `checkRateLimit()` interface is preserved so call sites need minimal changes.  
**Acceptance criteria:**
- Rate limits persist across Worker cold starts
- 100 requests/minute per IP limit enforced across multiple Worker instances
- Rate limit state expires correctly after window passes
- Falls back gracefully if DO is unavailable (allow request, log warning)

**Tests required:**
- Unit: DO sliding window correctly counts requests
- Unit: Limit exceeded returns false
- Unit: Window expiry resets counter
- Integration: Multiple rapid requests across simulated instances

**Risks:** Durable Objects have latency overhead (~1-5ms per request). Acceptable for webhook protection but measure and document.

---

### TASK-03: Ballot Encryption at Rest (BUG-03 + E08)

**Title:** Encrypt ballot candidateId values using AES-GCM before D1 and IndexedDB storage  
**Objective:** Ensure no ballot reveals a voter's choice in plaintext anywhere in the system — D1, IndexedDB, logs, or responses. Implement end-to-end vote secrecy.  
**Why it matters:** Storing candidateId as plaintext TEXT in `civic_ballots` is a fundamental violation of ballot secrecy — one of the core legal requirements of Nigerian electoral law.  
**Repo scope:** `webwaka-civic`  
**Dependencies:** Web Crypto API (already available in Cloudflare Workers and modern browsers), per-election AES-GCM key via Workers Secrets  
**Prerequisites:** `wrangler.toml` must have `BALLOT_ENCRYPTION_KEY` secret defined; election ID used as AAD (Additional Authenticated Data)  
**Impacted modules:** CIV-3 elections voting routes, offlineDb.ts, result tallying  
**Files to change:**
- New file: `src/core/crypto.ts` — `encryptBallot()`, `decryptBallot()` helpers
- `src/modules/elections/voting/routes.ts` — encrypt before INSERT, decrypt in tally
- `src/modules/elections/offlineDb.ts` — encrypt before IndexedDB write
- `migrations/007_civ3_voting.sql` — column rename from candidateId to encryptedBallot + nonce
- New migration: `011_encrypt_ballots.sql` — ALTER TABLE to add nonce column

**Expected output:** `civic_ballots.candidateId` column replaced with `encryptedBallot (TEXT)` and `nonce (TEXT)`. Encryption uses AES-GCM 256-bit. Decryption only occurs in the result tallying admin endpoint.  
**Acceptance criteria:**
- Casting a ballot stores only ciphertext + nonce in D1
- Verification hash computed from plaintext before encryption; hash stored separately
- Result tallying decrypts all ballots using the election key and counts candidateId occurrences
- Voter verification endpoint confirms hash match without decrypting ballot
- No plaintext candidateId appears in any API response, log, or database row

**Tests required:**
- Unit: encrypt-then-decrypt roundtrip
- Unit: different elections produce different ciphertext from same candidateId
- Unit: tampered ciphertext fails decryption
- Unit: result tally produces correct counts after decryption
- Unit: voter verification works correctly with encrypted ballot

**Risks:** Existing ballots (if any) are plaintext — need a one-time migration. The election key must be backed up; losing it makes historical results unverifiable.

---

### TASK-04: CI/CD Pipeline with GitHub Actions (E04)

**Title:** Add a complete CI/CD pipeline using GitHub Actions  
**Objective:** Implement automated lint, typecheck, test, build, and deploy pipeline that runs on every pull request and on merge to main.  
**Why it matters:** Without automated quality gates, regressions are only caught manually. This is incompatible with the team-scale and governance-driven development principles.  
**Repo scope:** `webwaka-civic`  
**Dependencies:** GitHub repository, Cloudflare API token (Worker deploy), Node.js 20  
**Prerequisites:** GitHub repo connected; Cloudflare API token stored as GitHub Secret  
**Impacted modules:** All (pipeline validates the entire repo)  
**Files to create:**
- `.github/workflows/ci.yml` — PR checks: lint, typecheck, test
- `.github/workflows/deploy.yml` — Deploy to Cloudflare on merge to main
- `.github/workflows/i18n-check.yml` — Reject PRs with missing i18n keys
- `.eslintrc.json` — ESLint config (if not present)

**Expected output:** On every PR: lint → tsc --noEmit → vitest run → vite build. On merge to main: same checks + wrangler deploy. Test coverage report posted to PR as comment.  
**Acceptance criteria:**
- PRs cannot be merged if tests fail
- PRs cannot be merged if TypeScript has errors
- PRs cannot be merged if any i18n key in en.json is missing from yo.json, ig.json, or ha.json
- Deploy to Cloudflare happens automatically on merge to main
- Deployment failure sends a notification

**Tests required:** (Pipeline self-validates)  
**Risks:** Wrangler deploy requires D1 database IDs in CI secrets — document the secret setup.

---

### TASK-05: Complete i18n Audit and Enforce Key Parity (E09)

**Title:** Audit all i18n locale files and enforce key parity across en/yo/ig/ha  
**Objective:** Ensure every translation key in `en.json` exists in `yo.json`, `ig.json`, and `ha.json` with a non-empty value. Add a CI check that blocks PRs with missing keys.  
**Why it matters:** Missing keys cause runtime errors or fallback to raw key strings for Yoruba, Igbo, and Hausa users — a broken UX for the majority of the target market.  
**Repo scope:** `webwaka-civic`  
**Dependencies:** Task-04 (CI/CD pipeline for the automated check)  
**Prerequisites:** Understanding of the current key structure in `src/i18n/`  
**Impacted modules:** All (i18n is cross-cutting)  
**Files to change:**
- `src/i18n/yo.json` — add all missing keys
- `src/i18n/ig.json` — add all missing keys
- `src/i18n/ha.json` — add all missing keys
- New script: `scripts/check-i18n.js` — validates key parity, used in CI
- `src/i18n/index.ts` — add type-safe translation key union type

**Expected output:** All four locale files have identical key sets. The CI i18n check script returns exit code 0 when all keys are present, non-zero otherwise.  
**Acceptance criteria:**
- Zero missing keys across all 4 locales
- CI check blocks PRs with new en.json keys not added to other locales
- `getTranslation()` is type-safe — TypeScript error for unknown keys
- All new phase features (Phase 5, 6, 7, 8 additions) have translations in all 4 locales

**Tests required:**
- Unit: check-i18n.js correctly detects missing keys
- Unit: getTranslation() returns correct locale value for each locale
- Unit: fallback to en for genuinely untranslatable technical terms

---

### TASK-06: Recurring / Subscription Giving — CIV-1 (E05)

**Title:** Add recurring donation support for Church/NGO module  
**Objective:** Allow members to set up weekly, monthly, or annual giving schedules via Paystack subscriptions. Admins can view, manage, and report on recurring giving.  
**Why it matters:** Recurring giving is the #1 requested church giving feature globally. Churches with recurring giving programmes see 3-5x more consistent donation revenue.  
**Repo scope:** `webwaka-civic`  
**Dependencies:** Paystack Subscriptions API, `src/core/services/payments.ts`, `src/core/db/schema.ts`  
**Prerequisites:** Paystack plan management, Cloudflare Cron Triggers for reminder scheduling  
**Impacted modules:** CIV-1 (Church/NGO)  
**Files to change:**
- `src/core/db/schema.ts` — add `civic_recurring_donations` table
- New migration: `012_recurring_donations.sql`
- `src/modules/church-ngo/api/index.ts` — add recurring donation CRUD endpoints
- `src/modules/church-ngo/apiClient.ts` — add client methods
- `src/modules/church-ngo/ui.tsx` — add RecurringGivingPage, RecurringGivingSetupForm
- `src/core/services/payments.ts` — add `createPaystackPlan()`, `createPaystackSubscription()`
- `src/i18n/*.json` — add recurring giving keys

**Expected output:**
- `POST /api/civic/recurring-donations` — create a recurring giving schedule
- `GET /api/civic/recurring-donations` — list all active schedules (admin)
- `GET /api/civic/members/:id/recurring-donations` — member's schedules
- `PATCH /api/civic/recurring-donations/:id/cancel` — cancel a schedule
- Paystack subscription webhook handler for `subscription.create`, `invoice.payment_failed`

**Acceptance criteria:**
- Members can set up recurring giving in the member portal
- Paystack subscription created and linked to member
- Missed payment triggers a notification via NotificationService
- Recurring donations appear in donation analytics with a `recurring` flag

---

### TASK-07: Fix JWT Secret Fallback Hardcoding (BUG-04)

**Title:** Remove all JWT secret hardcoded fallbacks from auth layer  
**Objective:** Ensure that if the `CIVIC_JWT_KEY` environment variable is missing, the Worker throws a startup error instead of silently using a weak hardcoded key.  
**Why it matters:** A missing env var in production silently weakens authentication — all tenants' data becomes accessible with a known key.  
**Repo scope:** `webwaka-civic`  
**Files to change:**
- `src/core/auth.ts` — remove `|| 'dev-secret'` patterns, add startup assertion
- `src/core/rbac.ts` — same check
- All module `api/index.ts` files — verify no local key fallbacks

**Expected output:** On startup, if `CIVIC_JWT_KEY` is undefined or empty, the Worker logs `[FATAL] CIVIC_JWT_KEY not configured` and returns 500 on all requests until fixed.  
**Acceptance criteria:**
- `CIVIC_JWT_KEY=''` → Worker refuses to serve requests
- `CIVIC_JWT_KEY=undefined` → same
- `CIVIC_JWT_KEY=<valid key>` → Worker starts normally
- No hardcoded string fallbacks in any file

---

### TASK-08: Fix Cross-Tenant Data Leak on Public Endpoints (BUG-05)

**Title:** Add tenant scoping to public election result endpoints  
**Objective:** Ensure that `/api/public/elections/:id/results` and related public endpoints only return data for elections belonging to the requesting organisation's tenant.  
**Why it matters:** Without tenant scoping, a user who guesses or discovers another tenant's election UUID can read their results — a multi-tenancy isolation breach.  
**Repo scope:** `webwaka-civic`  
**Files to change:**
- `src/modules/elections/api/index.ts` — add tenantId scoping to public result queries
- `src/core/db/queries.ts` — ensure getElectionResults() accepts and enforces tenantId
- `src/modules/elections/apiClient.ts` — pass tenantId in public requests

**Expected output:** Public endpoints validate the election's tenantId before returning any data. Return 404 (not 403) for elections that don't belong to the requested tenant (to avoid confirming existence).  
**Acceptance criteria:**
- Correct tenant: results returned normally
- Wrong tenant's election ID: 404 returned
- No election tenantId appears in public API responses

---

### TASK-09: Native PWA Push Notifications (E06)

**Title:** Implement Web Push API (VAPID) for native browser push notifications  
**Objective:** Add native push notification capability to the PWA so members receive real-time alerts for events, pledges, donations, and voting without relying solely on SMS/WhatsApp.  
**Why it matters:** Push notifications re-engage users when they're not in the app. Critical for voting open/close alerts and pledge reminders where SMS delivery is unreliable.  
**Repo scope:** `webwaka-civic`  
**Dependencies:** Web Push API, VAPID keys (generate via `wrangler vapid generate` or `web-push` npm package), `src/core/services/notifications.ts`  
**Prerequisites:** VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY in Workers Secrets; Service Worker must be active  
**Impacted modules:** CIV-1 (pledge/event reminders), CIV-2 (dues reminders), CIV-3 (voting alerts)  
**Files to change:**
- `src/core/db/schema.ts` — add `civic_push_subscriptions` table
- New migration: `013_push_subscriptions.sql`
- New file: `src/core/services/pushNotifications.ts`
- `src/modules/church-ngo/api/index.ts` — add `POST /api/civic/push/subscribe`
- `public/sw.js` — add `push` event listener and `notificationclick` handler
- `src/main.tsx` — add push subscription registration flow
- `src/i18n/*.json` — push permission prompt strings

**Expected output:** Members can opt-in to push notifications. The system can send push messages for: event reminders, pledge due alerts, donation confirmation, voting open/close.  
**Acceptance criteria:**
- Service Worker registers push subscription on opt-in
- Subscription stored in D1 with memberId and tenantId
- Push sent successfully from Worker using VAPID
- Push notification appears on device even when app is closed
- Member can opt out and subscription is deleted

---

### TASK-10: Volunteer Task Auto-Reminders (E13)

**Title:** Add automated reminder notifications for volunteer task assignments  
**Objective:** When a volunteer is assigned a task, schedule reminder notifications 24 hours before and 2 hours before the task start time.  
**Why it matters:** Research shows automated reminders reduce volunteer no-shows by 40%. Currently, no reminders are sent after the initial assignment notification.  
**Repo scope:** `webwaka-civic`  
**Dependencies:** Cloudflare Cron Triggers (for scheduled jobs), `src/core/services/notifications.ts`, NotificationTemplates  
**Prerequisites:** Cron Trigger configured in `wrangler.toml`; task `startTime` field must be populated  
**Impacted modules:** CIV-3 volunteers module  
**Files to change:**
- `src/modules/volunteers/api/index.ts` — add reminder scheduling logic
- `wrangler.toml` — add cron trigger for reminder processing
- New file: `src/core/cron/volunteerReminders.ts` — cron handler
- `src/core/services/notification-templates.ts` — add volunteer reminder templates (all 4 languages)

**Expected output:** Cron job runs every 15 minutes, queries tasks starting in 24h ± 1h or 2h ± 15min, and sends reminder notifications via NotificationService.  
**Acceptance criteria:**
- 24h reminder sent for all assigned tasks with a start time
- 2h reminder sent similarly
- No duplicate reminders (track sent status in a `civic_reminder_log` table)
- Reminders sent in the volunteer's preferred language

---

### TASK-11: Member Communication History (E15)

**Title:** Add member communication history tracking for CIV-1  
**Objective:** Log every notification sent to a member (type, channel, timestamp, status, content summary) and display the history in the member detail UI.  
**Why it matters:** Admins need to see what was communicated to a member and when — for follow-up, compliance, and accountability.  
**Repo scope:** `webwaka-civic`  
**Dependencies:** `src/core/services/notifications.ts` (must emit log events), `src/core/db/schema.ts`  
**Impacted modules:** CIV-1  
**Files to change:**
- `src/core/db/schema.ts` — add `civic_member_communications` table
- New migration: `014_member_communications.sql`
- `src/core/services/notifications.ts` — add `logCommunication()` helper
- `src/modules/church-ngo/api/index.ts` — add `GET /api/civic/members/:id/communications`
- `src/modules/church-ngo/ui.tsx` — add CommunicationHistorySection to MemberDetailPage

**Expected output:** Every time a notification is sent to a member, a record is written to `civic_member_communications`. Admins can view the full history per member.  
**Acceptance criteria:**
- All NotificationService calls for a member create a communication log entry
- Log entry includes: memberId, tenantId, type, channel (whatsapp/email/push), sentAt, status, contentSummary
- Member detail page shows communication history with timestamps
- History is paginated (latest first)

---

### TASK-12: Budget vs Actuals Dashboard (CIV-1) (E17)

**Title:** Add budget vs actuals visualisation to Church/NGO expense management  
**Objective:** Show remaining budget per department and category with colour-coded warnings at 80% and 95% utilisation.  
**Why it matters:** Without visual budget tracking, departments overspend unnoticed. A real-time budget gauge prevents embarrassing overruns.  
**Repo scope:** `webwaka-civic`  
**Impacted modules:** CIV-1  
**Files to change:**
- `src/modules/church-ngo/api/index.ts` — add `GET /api/civic/budgets/summary` aggregation endpoint
- `src/modules/church-ngo/apiClient.ts` — add getBudgetSummary()
- `src/modules/church-ngo/ui.tsx` — add BudgetSummaryPage with progress bars and colour warnings

**Expected output:** Budget summary page shows: total budget per category, actual spend, remaining budget, percentage used, colour-coded bars (green < 80%, amber 80–95%, red ≥ 95%).  
**Acceptance criteria:**
- Budget vs actuals calculated in real-time from D1
- Colour thresholds are correct (80%, 95%)
- Page updates when expenses are added
- Export to CSV available

---

### TASK-13: TypeScript Strict Mode Enforcement (E18)

**Title:** Enable TypeScript strict mode and fix all resulting type errors  
**Objective:** Enable `strict: true`, `noImplicitAny: true`, `strictNullChecks: true` in all tsconfig files and fix every resulting type error.  
**Why it matters:** Without strict mode, type inference gaps cause silent runtime bugs — especially dangerous in financial calculations and RBAC enforcement.  
**Repo scope:** `webwaka-civic`  
**Files to change:**
- `tsconfig.json` — add `"strict": true`
- `tsconfig.build.json` — same
- All `src/**/*.ts` and `src/**/*.tsx` files with type errors — fix each one

**Expected output:** `tsc --noEmit` passes with zero errors on strict mode settings.  
**Acceptance criteria:**
- `strict: true` in all tsconfig files
- Zero TypeScript errors (strict mode)
- No use of `any` type without explicit `// eslint-disable-next-line @typescript-eslint/no-explicit-any` comment

---

### TASK-14: INEC e-Submission Format Export (E10)

**Title:** Add INEC-compliant nomination and results export in prescribed formats  
**Objective:** Generate nomination form exports and result sheets in the format prescribed by INEC regulations — not just generic CSV.  
**Why it matters:** Party agents need to submit compliant documents to INEC. Non-compliant formats are rejected, creating legal and operational risk.  
**Repo scope:** `webwaka-civic`  
**Impacted modules:** CIV-2 (nominations), CIV-3 (results)  
**Files to change:**
- `src/modules/political-party/api/index.ts` — add `GET /api/party/nominations/inec-export`
- `src/modules/elections/api/index.ts` — add `GET /api/elections/:id/results/inec-export`
- New file: `src/core/services/inecFormatter.ts` — INEC format transformers

**Expected output:**
- Nomination export: JSON matching INEC e-submission schema (CF001 format)
- Results export: ward-level result sheet in INEC IReV format
- Both endpoints admin-only with audit log entry on each export

**Acceptance criteria:**
- Output validates against INEC schema specification
- Export creates an audit log entry
- Both formats available as JSON download

---

### TASK-15: Paystack Refund Event Handler (BUG-06)

**Title:** Add `refund.processed` Paystack webhook event handling  
**Objective:** Handle Paystack `refund.processed` webhook events in all three module webhook handlers to reverse or flag refunded payments.  
**Repo scope:** `webwaka-civic`  
**Files to change:**
- `src/modules/church-ngo/api/index.ts`
- `src/modules/political-party/api/index.ts`
- `src/modules/elections/api/index.ts`

**Expected output:** On `refund.processed`, the corresponding donation/dues/campaign donation record has its `paymentStatus` set to `refunded` and a log entry is created.

---

### TASK-16: Service Worker Cache Versioning on Deploy (BUG-07)

**Title:** Inject build-time cache version into Service Worker for automatic cache invalidation  
**Objective:** Replace the hardcoded SW cache version string with one injected from `vite.config.ts` at build time, so each deployment automatically invalidates old caches.  
**Repo scope:** `webwaka-civic`  
**Files to change:**
- `vite.config.ts` — add `define: { __SW_VERSION__: JSON.stringify(Date.now()) }`
- `public/sw.js` → move to `src/sw.ts` or use Vite plugin to inject the version constant

**Expected output:** After each build, the SW cache name includes the build timestamp (e.g., `app-shell-1748000000`), causing the old SW to be replaced on next visit.

---

### TASK-17: Real-Time Results with Server-Sent Events (E16)

**Title:** Replace donation/payment status polling with Server-Sent Events for real-time updates  
**Objective:** Add an SSE endpoint for donation payment status and election results so the UI receives real-time push updates instead of 10-second polling.  
**Why it matters:** Polling creates unnecessary D1 load and is delayed by up to 10 seconds. SSE provides immediate updates and is simpler than WebSockets on Cloudflare Workers.  
**Repo scope:** `webwaka-civic`  
**Impacted modules:** CIV-1 (donation status), CIV-3 (election results)  
**Files to change:**
- `src/modules/church-ngo/api/index.ts` — add `GET /api/civic/donations/stream`
- `src/modules/elections/api/index.ts` — add `GET /api/elections/:id/results/stream`
- `src/modules/church-ngo/ui.tsx` — replace setInterval with EventSource
- `src/modules/elections/ui.tsx` — same

**Expected output:** EventSource connection streams `paymentStatus` updates and vote tally updates without polling.

---

### TASK-18: Workbox Service Worker Migration (E11)

**Title:** Migrate hand-rolled Service Worker to Workbox for reliability and maintainability  
**Objective:** Replace `public/sw.js` with a Workbox-based Service Worker configured in `vite.config.ts` using `vite-plugin-pwa`.  
**Why it matters:** The hand-rolled SW (~300 lines) has several edge cases (cache version, background sync retry) that Workbox handles correctly out of the box.  
**Repo scope:** `webwaka-civic`  
**Files to change:**
- Install `vite-plugin-pwa` via npm
- `vite.config.ts` — add VitePWA plugin with Workbox config
- `public/sw.js` — remove (replaced by generated SW)
- `src/main.tsx` — update SW registration to use Workbox's `registerSW()`

**Expected output:** Generated Service Worker from Workbox with: precaching manifest, cache-first for assets, network-first for API, stale-while-revalidate for leaderboards, automatic cache versioning.

---

### TASK-19: API Versioning Strategy (E12)

**Title:** Add `/v1/` prefix to all API routes and implement version negotiation middleware  
**Objective:** Prefix all API routes with `/v1/` and add an `API-Version` response header. Document deprecation policy.  
**Why it matters:** Without versioning, breaking API changes cannot be made safely. The frontend and backend become tightly coupled.  
**Repo scope:** `webwaka-civic`  
**Files to change:**
- All `src/modules/*/api/index.ts` — add v1 prefix to all routes
- `src/worker.ts` — mount modules at `/v1/` base
- All `src/modules/*/apiClient.ts` — update base URLs to `/v1/`
- New file: `src/core/middleware/apiVersion.ts` — version header middleware

**Expected output:** All API routes accessible at `/v1/api/civic/...`, `/v1/api/party/...`, `/v1/api/elections/...`. Old unversioned routes return 301 redirect to v1 for backward compatibility.

---

### TASK-20: AI-Powered Donation Insights via OpenRouter (E20)

**Title:** Add AI-powered natural-language insights for donation trends and member engagement  
**Objective:** Integrate with OpenRouter (Vendor Neutral AI) to provide church admins with natural-language summaries of donation trends, giving anomalies, and member churn risk.  
**Why it matters:** Church admins are often non-technical. AI-generated plain-language insights from complex data are more actionable than raw charts.  
**Repo scope:** `webwaka-civic`  
**Dependencies:** OpenRouter API key (Workers Secret `OPENROUTER_API_KEY`), existing analytics endpoints as data sources  
**Impacted modules:** CIV-1 (primary)  
**Files to change:**
- New file: `src/core/services/aiInsights.ts` — OpenRouter client
- `src/modules/church-ngo/api/index.ts` — add `GET /api/civic/ai/insights`
- `src/modules/church-ngo/ui.tsx` — add AIInsightsPanel to AnalyticsPage
- `wrangler.toml` — add OPENROUTER_API_KEY secret reference

**Expected output:** `GET /api/civic/ai/insights` calls OpenRouter with recent donation/member data as context and returns a structured insight object: `{ summary: string, highlights: string[], risks: string[], recommendations: string[] }`.  
**Acceptance criteria:**
- Uses OpenRouter (not direct OpenAI) per Vendor Neutral AI principle
- Model selection configurable via env var (default: google/gemini-flash)
- Falls back gracefully if OpenRouter is unavailable (no AI insights shown, no error surfaced)
- Response cached in Workers KV for 1 hour to avoid repeated API calls
- Content filtered for appropriateness before display

---

### TASK-21: Dues Reminder Cron via Cloudflare Cron Triggers (E14)

**Title:** Add automated dues reminders for Political Party members  
**Objective:** Send automated reminder notifications 7 days before dues due date, on the due date, and escalating overdue notices.  
**Repo scope:** `webwaka-civic`  
**Files to change:**
- `wrangler.toml` — add cron trigger `0 8 * * *` (daily at 8am)
- New file: `src/core/cron/duesReminders.ts`
- `src/modules/political-party/api/index.ts` — expose cron handler
- `src/core/services/notification-templates.ts` — dues reminder templates (all 4 languages)

---

### TASK-22: Per-Tenant D1 Database Isolation Planning (E19 — Phase 1)

**Title:** Research and document migration path to per-tenant D1 databases  
**Objective:** Create a detailed technical design document for migrating from the current shared-schema D1 approach to one-database-per-tenant isolation. Implement for new tenants only in Phase 1.  
**Repo scope:** `webwaka-civic`  
**Files to create:**
- `docs/per-tenant-d1-design.md` — detailed design document
- New worker route: `POST /admin/provision-tenant` — creates a new D1 database for a tenant and runs migrations

---

### TASK-23: Member Import Async Processing (BUG-08)

**Title:** Add async bulk member import via Cloudflare Queues for files over 200 rows  
**Objective:** Remove the 200-row synchronous import limit by processing large imports via Cloudflare Queues, returning a job ID for progress polling.  
**Repo scope:** `webwaka-civic`  
**Files to change:**
- `src/modules/church-ngo/api/index.ts` — check row count; if > 200, enqueue to Cloudflare Queue
- `wrangler.toml` — add Queue binding
- New file: `src/modules/church-ngo/importQueue.ts` — queue consumer
- New endpoint: `GET /api/civic/import-jobs/:id` — check import progress

---

### TASK-24: Stale-While-Revalidate Caching for Leaderboards (E11 partial)

**Title:** Add stale-while-revalidate caching strategy for election leaderboards and public results  
**Objective:** Use the SWR caching pattern in the Service Worker for high-read, low-write data (leaderboards, public results) to improve perceived performance.  
**Repo scope:** `webwaka-civic`  
**Files to change:**
- `public/sw.js` (or Workbox config from Task-18) — add SWR strategy for leaderboard and public result URLs

---

### TASK-25: Electoral Act Breach Automated Alert (E10 partial)

**Title:** Send automated alert when campaign finance exceeds 80% of Electoral Act limit  
**Objective:** When a campaign transaction brings expenditure to ≥ 80% of the Electoral Act limit, immediately send a push notification and email alert to campaign admins.  
**Repo scope:** `webwaka-civic`  
**Dependencies:** Task-09 (push notifications), `src/core/services/notifications.ts`  
**Files to change:**
- `src/modules/political-party/api/index.ts` — add breach check after every transaction insert
- `src/core/services/notifications.ts` — add `sendFinanceBreachAlert()`
- `src/core/services/notification-templates.ts` — breach alert template (all 4 languages)

---

## PART 7 — QA PLANS

---

### QA-01: QA Plan for TASK-01 (Sync Endpoint)

**What must be verified:**
- POST /api/civic/sync exists and returns 200 for valid requests
- Mutations are correctly applied to D1 (member created, donation updated, etc.)
- Invalid entity types return structured error without crashing
- Replay of same mutationId does not double-apply

**Edge cases:**
- Empty mutations array → 200, empty results array
- Mutation with past timestamp → still applied (timestamp is metadata only)
- Mutation for deleted entity → returns error per mutation, continues others
- Cross-tenant mutationId (different tenantId in JWT vs mutation payload) → rejected

**Regression detection:**
- Existing API endpoints still work after adding sync endpoint
- CivicSyncEngine processQueue() successfully posts to the new endpoint in integration test

**Cross-module verification:**
- Does the political-party module need a `/api/party/sync` as well? Verify scope.
- Is the Elections module using a different sync endpoint? Verify offlineDb.ts

**Deployment checks:**
- New endpoint deployed correctly in wrangler.toml routes
- JWT auth middleware applied before sync handler

**Done criteria:** All unit tests pass; manual test: create a member offline in UsherPanel, close network, observe mutation in IndexedDB queue, restore network, observe mutation applied in D1.

---

### QA-02: QA Plan for TASK-02 (Rate Limiter)

**What must be verified:**
- 100 requests in < 60s from same IP → 101st is rejected (429)
- After 60s window, counter resets and requests succeed again
- Different IPs have separate limits
- Durable Object persists state across simulated cold start

**Edge cases:**
- IP header missing → fallback key used; limit still applied
- Cloudflare WAF blocking IP before DO is reached
- DO unavailable → should allow request (fail-open) and log warning

**Regression checks:**
- All three webhook handlers (civ1, civ2, civ3) still receive valid Paystack webhooks
- HMAC verification still happens after rate limit check

---

### QA-03: QA Plan for TASK-03 (Ballot Encryption)

**What must be verified:**
- New ballot stored with ciphertext + nonce (no plaintext candidateId)
- Existing plaintext ballots migrated or clearly handled
- Result tally decrypts correctly and produces right vote counts
- Voter verification hash still matches after encryption

**Edge cases:**
- Election key not set → Worker refuses to start voting phase
- Corrupt ciphertext → ballot rejected with 422, does not crash tally
- Multiple ballots from same voter → one-vote enforcement still works
- Offline ballot captured, synced → encryption happens on client before sync

**Regression:**
- Public results endpoint still shows aggregated counts (not individual ballots)
- Voter card endpoint still works
- Audit log entry still created on ballot submission

**Security verification:**
- Direct D1 query of civic_ballots shows only ciphertext (never plaintext candidateId)
- Admin result tallying endpoint is properly role-guarded

---

### QA-04: QA Plan for TASK-04 (CI/CD Pipeline)

**What must be verified:**
- CI runs on every PR (lint, typecheck, test, build)
- Deploy runs only on merge to main
- i18n check blocks PRs with missing translation keys
- Test results posted as PR comment

**Edge cases:**
- All tests pass but build fails → PR blocked
- i18n check finds missing keys → PR blocked with clear error message
- Cloudflare deploy token missing → deploy fails with clear error, not silent

**Deployment checks:**
- Secrets correctly configured in GitHub (CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID, etc.)
- Deploy manifest correct (wrangler deploy --env production)

---

### QA-05: QA Plan for TASK-05 (i18n Audit)

**What must be verified:**
- check-i18n.js script correctly identifies all missing keys across yo/ig/ha
- All 4 locales render correctly in UI (switch language, navigate all pages)
- No raw key strings displayed to user (e.g., "nav.analytics" visible in UI)

**Edge cases:**
- Very long Yoruba/Igbo/Hausa strings that break UI layout
- Keys with embedded HTML or special characters
- Number format strings with placeholders ({count}, {amount})

---

### QA-06: QA Plan for TASK-06 (Recurring Giving)

**What must be verified:**
- Member can create recurring giving schedule (monthly/weekly/annual)
- Paystack plan created for the schedule
- Paystack subscription linked to member
- When Paystack subscription charges successfully → donation record created automatically
- When Paystack subscription payment fails → notification sent to member

**Edge cases:**
- Member cancels subscription → Paystack subscription cancelled, local record updated
- Paystack plan already exists for amount/interval → reuse existing plan
- Member creates duplicate schedule → handled gracefully

---

### QA-07: QA Plan for TASK-07 (JWT Fallback)

**What must be verified:**
- `CIVIC_JWT_KEY` env var missing → Worker returns 500 on all requests
- `CIVIC_JWT_KEY` set to empty string → same as missing
- No file in repo contains string literal that could be used as a JWT key

**Edge cases:**
- Key set but invalid format → startup check passes, JWT verification fails at runtime

**Security scan:**
- grep for hardcoded strings like 'dev-secret', 'changeme', 'secret', 'test-key' in auth files

---

### QA-08: QA Plan for TASK-08 (Cross-Tenant Data)

**What must be verified:**
- GET /api/public/elections/:id/results with election ID from Tenant A, accessed as Tenant B → 404
- GET /api/public/elections/:id/results with correct tenant context → 200 with data

**Edge cases:**
- Election ID is valid UUID but belongs to no tenant → 404
- Election ID belongs to tenant but election is not published → 403

---

### QA-09: QA Plan for TASK-09 (Push Notifications)

**What must be verified:**
- Service Worker registers push subscription on opt-in
- Subscription stored in D1 with memberId and tenantId
- Push message received on device when app is closed
- Opt-out removes subscription from D1

**Edge cases:**
- Browser denies push permission → UI handles gracefully (no error thrown)
- Push subscription expired → 410 response from push server → remove from D1
- VAPID keys missing → Worker logs error and skips push (does not crash)

---

### QA-10: QA Plan for TASK-10 (Volunteer Reminders)

**What must be verified:**
- Cron job runs on schedule (test with a near-future time)
- 24h reminder sent to assigned volunteers
- 2h reminder sent to assigned volunteers
- No duplicate reminders sent for same task/volunteer combination

**Edge cases:**
- Task cancelled after reminder sent → no further reminders
- Volunteer unassigned after 24h reminder → no 2h reminder
- Task without start time → no reminder sent (no crash)

---

### QA-11: QA Plan for TASK-11 (Communication History)

**What must be verified:**
- Every NotificationService call creates a communication log entry
- Communication history appears in member detail UI (sorted latest first)
- Pagination works correctly

**Edge cases:**
- Member with no communications → empty list displayed (not error)
- Very long contentSummary truncated in list view

---

### QA-12: QA Plan for TASK-12 (Budget Dashboard)

**What must be verified:**
- Budget summary shows correct figures (total budget, actual spend, remaining)
- Colour coding correct (green < 80%, amber 80-95%, red ≥ 95%)
- Summary updates in real-time when a new expense is added

**Edge cases:**
- No budget set for a category → shown as "No budget set"
- Expenses exceed budget → percentage shown as > 100%, red

---

### QA-13: QA Plan for TASK-13 (TypeScript Strict Mode)

**What must be verified:**
- `tsc --noEmit` passes with `strict: true` in tsconfig
- No new type errors introduced in future PRs (CI enforces this)
- No use of `any` without documented justification

---

### QA-14: QA Plan for TASK-14 (INEC Export)

**What must be verified:**
- Export output validates against INEC CF001 schema
- Export endpoint is admin-only
- Audit log entry created on every export
- Export includes all required fields per INEC specification

---

### QA-15 through QA-25: (Abbreviated for compactness — full detail follows in Implementation Prompts)

Each remaining task follows the same QA pattern:
- Verify primary happy-path behaviour
- Test edge cases (empty state, missing env vars, network failure)
- Verify no regression on existing functionality
- Check security (auth required where needed)
- Verify i18n (new strings in all 4 locales)
- Confirm audit log entry where applicable

---

## PART 8 — IMPLEMENTATION PROMPTS

---

### IMPL-PROMPT-01: Sync Endpoint

```
IMPLEMENTATION PROMPT — TASK-01
Repository: webwaka-civic
Objective: Implement the missing POST /api/civic/sync endpoint that the CivicSyncEngine posts offline mutations to.

ECOSYSTEM CONTEXT: This repository is NOT standalone. It is part of the WebWaka OS v4 multi-repo 
platform. The sync engine (src/core/sync/client.ts) posts to /api/civic/sync as part of the 
offline-first architecture. The CORE-EVENTBUS, CORE-COMMS, and CORE-DOCS services are external 
consumers of events emitted by this repo's Worker.

BEFORE ACTING:
1. Read src/core/sync/client.ts fully to understand the exact mutation payload shape
2. Read src/core/db/schema.ts to understand all entity types and their D1 tables
3. Read src/core/db/queries.ts to understand existing query helpers
4. Read src/core/auth.ts and src/core/rbac.ts for auth middleware patterns
5. Read replit.md for architectural history and constraints
6. Do not skip any of the above — zero skipping policy

REQUIRED DELIVERABLES:
1. POST /api/civic/sync endpoint in src/modules/church-ngo/api/index.ts
2. Accepts { mutations: MutationRecord[] } payload (JWT-authenticated)
3. Validates each mutation: entity type allowed, tenantId matches JWT, payload schema valid
4. Applies each mutation to D1 using existing query helpers or new helpers in src/core/db/queries.ts
5. Returns { results: { mutationId: string, success: boolean, error?: string }[] }
6. Idempotent: re-sending the same mutationId twice applies the mutation only once
7. Test file: src/modules/church-ngo/sync-endpoint.test.ts

IMPORTANT REMINDERS:
- Build Once Use Infinitely: use existing query helpers, do not duplicate DB logic
- Multi-Tenant Tenant-as-Code: every mutation must validate tenantId before applying
- Nigeria-First: mutations may include kobo amounts — validate as integers, never floats
- Event-Driven: after applying a mutation, emit the appropriate platform event
- Zero Skipping Policy: implement all entity types the sync engine queues, not just members

ACCEPTANCE CRITERIA:
- POST /api/civic/sync with valid JWT and valid mutations → 200 with per-mutation results
- Invalid entity type → per-mutation error, other mutations still processed
- Cross-tenant mutation → rejected per-mutation with 'unauthorised' error
- Duplicate mutationId → success: true (idempotent)
- All acceptance criteria unit-tested

DO NOT: shortcut by making a catch-all handler that applies raw SQL. Follow the entity-type 
dispatch pattern. Do not allow SQL injection. Do not drift from the existing API response format.
```

---

### IMPL-PROMPT-02: Rate Limiter Durable Object

```
IMPLEMENTATION PROMPT — TASK-02
Repository: webwaka-civic
Objective: Replace the in-memory sliding-window rate limiter with a Cloudflare Durable Object 
implementation that persists across Worker cold starts.

ECOSYSTEM CONTEXT: This repo runs on Cloudflare Workers edge. The in-memory Map approach in 
src/core/rateLimit.ts resets on every cold start, providing zero real-world protection. 
Durable Objects are the Cloudflare-native solution for persistent state across Worker instances.

BEFORE ACTING:
1. Read src/core/rateLimit.ts fully — understand the current interface (checkRateLimit, getClientIp)
2. Read wrangler.toml — understand current bindings structure
3. Read all three webhook handlers to understand where checkRateLimit is called
4. Consult Cloudflare Durable Objects documentation patterns

REQUIRED DELIVERABLES:
1. New file: src/core/rateLimitDO.ts — RateLimiterDO Durable Object class
   - Implements sliding window (100 req/min default, configurable)
   - Exposes fetch() handler that accepts { key, maxHits, windowMs } as JSON
   - Returns { allowed: boolean, remaining: number, resetAt: number }
2. wrangler.toml — add Durable Object class binding for RateLimiterDO
3. src/core/rateLimit.ts — update checkRateLimit() to call DO via env.RATE_LIMITER.get(id)
4. Preserve existing function signature so call sites need zero changes
5. Fallback: if DO unavailable, allow request and log WARN (fail-open for availability)

IMPORTANT REMINDERS:
- Cloudflare-First Deployment: use Durable Objects, not Redis or external services
- Build Once Use Infinitely: the DO class must be reusable across all three modules
- DO has ~1-5ms latency — acceptable for webhook protection

ACCEPTANCE CRITERIA:
- 100 requests from same IP within 60s → 101st blocked (429)
- After window, requests succeed again
- Worker cold start does not reset the counter
- All tests pass

DO NOT: use Workers KV for this (TTL precision is insufficient). Do not introduce Node.js 
built-in dependencies. Do not change the checkRateLimit() call signature.
```

---

### IMPL-PROMPT-03: Ballot Encryption

```
IMPLEMENTATION PROMPT — TASK-03
Repository: webwaka-civic
Objective: Encrypt all ballot candidateId values using AES-GCM 256-bit before storing in D1 
and IndexedDB. This is a critical security fix for ballot secrecy.

ECOSYSTEM CONTEXT: This repo is part of WebWaka OS v4. The Elections module (CIV-3) must 
comply with Nigerian electoral law which mandates ballot secrecy. Ballots must not reveal 
voter choices to DB administrators, Worker operators, or any party except the authorised 
result tallying function.

BEFORE ACTING:
1. Read migrations/007_civ3_voting.sql — understand civic_ballots schema
2. Read src/modules/elections/voting/routes.ts — understand ballot submission flow
3. Read src/modules/elections/offlineDb.ts — understand offline ballot capture
4. Read src/core/db/queries.ts for existing patterns
5. Read wrangler.toml for existing secrets

REQUIRED DELIVERABLES:
1. New file: src/core/crypto.ts
   - encryptBallot(candidateId: string, electionId: string, key: CryptoKey): Promise<{ciphertext: string, nonce: string}>
   - decryptBallot(ciphertext: string, nonce: string, electionId: string, key: CryptoKey): Promise<string>
   - Uses Web Crypto AES-GCM 256-bit; electionId used as Additional Authenticated Data (AAD)
   - Key derived from BALLOT_ENCRYPTION_KEY env var + electionId via HKDF
2. New migration: migrations/011_encrypt_ballots.sql
   - ALTER civic_ballots: rename candidateId column, add encryptedBallot TEXT, add nonce TEXT
3. Updated src/modules/elections/voting/routes.ts
   - Encrypt before INSERT into civic_ballots
   - Decrypt during result tallying (admin only)
4. Updated src/modules/elections/offlineDb.ts
   - Encrypt before IndexedDB write
5. wrangler.toml: add BALLOT_ENCRYPTION_KEY secret reference
6. Tests: src/modules/elections/crypto.test.ts

IMPORTANT REMINDERS:
- Vendor Neutral AI: no proprietary crypto SDKs — Web Crypto API only
- Nigeria-First: must work on low-end devices; AES-GCM is hardware-accelerated on modern chips
- Zero Skipping: both D1 and IndexedDB storage paths must be updated
- Offline First: encryption must happen on the client BEFORE the ballot leaves the browser

ACCEPTANCE CRITERIA:
- civic_ballots.encryptedBallot contains only ciphertext (grep for plain candidateId UUIDs → zero results)
- decryptBallot(encryptBallot(id)) === id (roundtrip test)
- Result tally admin endpoint decrypts and counts correctly
- Voter verification hash still works
- Missing BALLOT_ENCRYPTION_KEY → Worker refuses to start voting phase

DO NOT: use base64 encoding and call it encryption. Do not store the raw key in the database.
Do not skip the offline ballot encryption path. Do not use MD5 or SHA1 for this purpose.
```

---

### IMPL-PROMPT-04: CI/CD Pipeline

```
IMPLEMENTATION PROMPT — TASK-04
Repository: webwaka-civic
Objective: Create a complete GitHub Actions CI/CD pipeline that runs lint, typecheck, tests, 
and build on every PR, and deploys to Cloudflare on merge to main.

ECOSYSTEM CONTEXT: This repo is part of WebWaka OS v4. It has no CI/CD pipeline today. 
All quality checks are manual. The pipeline must enforce the quality standards described in 
the governance documents and not allow regressions to reach production.

BEFORE ACTING:
1. Read package.json for all scripts (dev, build, test, typecheck, deploy)
2. Read wrangler.toml for environment configuration
3. Read tsconfig.json and tsconfig.build.json for build config
4. Check if .eslintrc exists

REQUIRED DELIVERABLES:
1. .github/workflows/ci.yml
   - Trigger: pull_request targeting main
   - Jobs: lint (eslint), typecheck (tsc --noEmit), test (vitest run), build (vite build)
   - Node.js 20, npm ci for installs
   - Post test coverage summary as PR comment using actions/github-script
2. .github/workflows/deploy.yml
   - Trigger: push to main (after PR merge)
   - Same checks as CI + wrangler deploy --env production
   - Requires secrets: CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID
3. .github/workflows/i18n-check.yml
   - Trigger: pull_request
   - Runs: node scripts/check-i18n.js
   - Fails if any key in en.json is missing from yo.json, ig.json, or ha.json
4. .eslintrc.json — if not present, create with TypeScript + React rules
5. scripts/check-i18n.js — key parity checker

IMPORTANT REMINDERS:
- CI/CD Native Development: all quality gates automated, never manual
- Zero Skipping: all three workflow files required; do not skip the i18n check
- The wrangler deploy step requires D1 database IDs in GitHub Secrets — document in SECRETS.md

ACCEPTANCE CRITERIA:
- PR with failing tests → CI fails, PR blocked
- PR with TypeScript error → CI fails, PR blocked
- PR with missing i18n key → i18n check fails, PR blocked
- Merge to main → deploy workflow runs and deploys to Cloudflare
- Test coverage % reported on each PR
```

---

### IMPL-PROMPT-05: i18n Audit and Completion

```
IMPLEMENTATION PROMPT — TASK-05
Repository: webwaka-civic
Objective: Audit all i18n locale files, add every missing translation key to yo.json, ig.json, 
and ha.json, and add a CI check to enforce key parity going forward.

ECOSYSTEM CONTEXT: WebWaka Civic targets Nigerian users where Yoruba, Igbo, and Hausa are 
primary languages. Missing translations break the UX for millions of potential users and 
contradict the Nigeria-First, Africa-Ready mandate.

BEFORE ACTING:
1. Read src/i18n/en.json fully — this is the master key set
2. Read src/i18n/yo.json, ig.json, ha.json — identify all missing keys
3. Read src/i18n/index.ts — understand getTranslation() and key type usage
4. List all Phase 5, 6, 7, 8 features added to the app and verify their i18n keys exist

REQUIRED DELIVERABLES:
1. Updated yo.json, ig.json, ha.json — all keys from en.json present
   - Use accurate Yoruba, Igbo, Hausa translations; do NOT use English as fallback for all
   - For technical terms with no direct translation, use the accepted Nigerian-English equivalent
2. New file: scripts/check-i18n.js
   - Reads en.json, yo.json, ig.json, ha.json
   - Reports all missing keys per locale
   - Exits with code 1 if any keys missing (for CI)
3. Updated src/i18n/index.ts — TranslationKey type derived from keyof typeof en_json 
   (type-safe key usage)

IMPORTANT REMINDERS:
- Nigeria-First: Yoruba, Igbo, and Hausa translations must be meaningful, not placeholder
- Zero Skipping: Every key in en.json must appear in every locale file
- Build Once: The check-i18n.js script is reusable across WebWaka repos

ACCEPTANCE CRITERIA:
- scripts/check-i18n.js exits 0 (no missing keys)
- Switching to Yoruba in the app shows all UI text in Yoruba (not English or raw key names)
- TypeScript error if getTranslation() called with an invalid key
```

---

### IMPL-PROMPT-06: Recurring Giving

```
IMPLEMENTATION PROMPT — TASK-06
Repository: webwaka-civic
Objective: Add recurring/subscription giving support to the CIV-1 Church/NGO module using 
Paystack subscription plans.

ECOSYSTEM CONTEXT: This repo's CORE-PAYMENTS service client (src/core/services/payments.ts) 
emits payment events consumed by the CORE-PAYMENTS external service. Paystack subscription 
webhooks must be handled by this repo's webhook handler. The @webwaka/core package provides 
shared TypeScript types.

BEFORE ACTING:
1. Read src/core/services/payments.ts fully
2. Read src/core/db/schema.ts — understand civic_donations table structure
3. Read src/modules/church-ngo/api/index.ts — understand existing donation flow
4. Read src/i18n/en.json — understand existing donation i18n keys

REQUIRED DELIVERABLES:
1. New migration: migrations/012_recurring_donations.sql
   - civic_recurring_donations table: id, tenantId, memberId, organizationId, amountKobo, 
     interval (weekly/monthly/annual), paystackPlanCode, paystackSubscriptionCode, 
     status (active/paused/cancelled), nextChargeAt, createdAt, updatedAt, deletedAt
2. Updated src/core/db/schema.ts — add civic_recurring_donations type
3. Updated src/core/services/payments.ts — add createPaystackPlan(), createPaystackSubscription(), 
   cancelPaystackSubscription()
4. New endpoints in src/modules/church-ngo/api/index.ts:
   - POST /api/civic/recurring-donations
   - GET /api/civic/recurring-donations
   - GET /api/civic/members/:id/recurring-donations
   - PATCH /api/civic/recurring-donations/:id/cancel
5. Paystack webhook: handle subscription.create, invoice.payment_failed in existing handler
6. Updated src/modules/church-ngo/ui.tsx — RecurringGivingPage, RecurringGivingSetupForm
7. i18n keys in all 4 locales

ACCEPTANCE CRITERIA:
- Member can set up recurring monthly giving → Paystack subscription created
- Successful recurring charge → civic_donations record created automatically
- Failed charge → member notification sent via NotificationService
- Member can view and cancel their recurring schedule
- Recurring donations appear in analytics with recurring: true flag

DO NOT: Call Paystack APIs directly in the route handler; use PaymentService. 
Do not store the full Paystack subscription key, only the code.
```

---

### IMPL-PROMPT-07: JWT Fallback Fix

```
IMPLEMENTATION PROMPT — TASK-07
Repository: webwaka-civic
Objective: Remove all hardcoded JWT secret fallbacks from the authentication layer. 
If CIVIC_JWT_KEY is missing, the Worker must refuse to serve requests.

BEFORE ACTING:
1. Read src/core/auth.ts fully
2. Read src/core/rbac.ts fully
3. grep for patterns like: '|| "', "|| '", 'fallback', 'default', 'dev-secret' in all API files

REQUIRED DELIVERABLES:
1. src/core/auth.ts — remove any || 'fallback' patterns; add assertEnvVar() check at module init
2. src/core/rbac.ts — same
3. All module api/index.ts files — verify no local JWT key construction with fallbacks
4. Startup check: if (!env.CIVIC_JWT_KEY) { return c.json({ error: 'Server misconfiguration' }, 500) }

ACCEPTANCE CRITERIA:
- grep for hardcoded key strings returns zero results in auth-related files
- Missing env var → 500 on all requests
- Correct env var → normal operation
```

---

### IMPL-PROMPT-08: Cross-Tenant Public Endpoint Fix

```
IMPLEMENTATION PROMPT — TASK-08
Repository: webwaka-civic
Objective: Add tenant scoping to public election result endpoints to prevent cross-tenant 
data leakage.

BEFORE ACTING:
1. Read all public endpoints in src/modules/elections/api/index.ts (paths starting with /api/public)
2. Read src/core/db/queries.ts — understand how tenantId is used in existing queries
3. Understand how public endpoints currently receive tenant context (if at all)

REQUIRED DELIVERABLES:
1. All public endpoints require a tenantSlug or tenantToken query parameter
2. Tenant resolution: look up tenantId from slug/token in civic_organizations
3. All D1 queries in public handlers enforce the resolved tenantId
4. Return 404 (not 403) for elections not belonging to the resolved tenant

ACCEPTANCE CRITERIA:
- Correct tenant slug + valid election ID → results returned
- Correct tenant slug + wrong election ID (from another tenant) → 404
- Missing tenant slug → 400 with helpful error
```

---

### IMPL-PROMPT-09: Push Notifications

```
IMPLEMENTATION PROMPT — TASK-09
Repository: webwaka-civic
Objective: Implement native Web Push API (VAPID) for PWA push notifications across all 
three modules.

ECOSYSTEM CONTEXT: The existing NotificationService emits events to CORE-COMMS which handles 
SMS/WhatsApp delivery. Push notifications are a separate channel implemented directly in this 
repo using the Web Push API and the Service Worker.

BEFORE ACTING:
1. Read public/sw.js fully — understand current Service Worker structure
2. Read src/main.tsx — understand current SW registration
3. Read src/core/services/notifications.ts — understand existing notification pattern
4. Read src/core/db/schema.ts — plan push subscription table

REQUIRED DELIVERABLES:
1. migrations/013_push_subscriptions.sql — civic_push_subscriptions table
2. src/core/services/pushNotifications.ts — PushNotificationService class
   - subscribe(tenantId, memberId, subscription: PushSubscription): Promise<void>
   - unsubscribe(tenantId, memberId): Promise<void>
   - send(tenantId, memberId, payload: { title, body, icon, url }): Promise<void>
   - Uses VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY from env
3. POST /api/civic/push/subscribe — store subscription
4. DELETE /api/civic/push/subscribe — remove subscription
5. public/sw.js — add push event handler and notificationclick handler
6. src/main.tsx — add requestPushPermission() flow with user opt-in UI
7. i18n strings for push permission prompt (all 4 locales)

ACCEPTANCE CRITERIA:
- User opts in → subscription stored in D1
- Worker sends push → device receives notification even when app is closed
- Expired subscription (410) → removed from D1 automatically
- User opts out → subscription deleted, no more pushes
```

---

### IMPL-PROMPT-10 through IMPL-PROMPT-25

*(The following prompts follow the same structure. Each is fully self-contained and copy-paste ready.)*

---

### IMPL-PROMPT-10: Volunteer Task Auto-Reminders

```
IMPLEMENTATION PROMPT — TASK-10
Repository: webwaka-civic
Objective: Add automated 24h and 2h reminder notifications for volunteer task assignments 
using Cloudflare Cron Triggers.

BEFORE ACTING:
1. Read src/modules/volunteers/api/index.ts — understand task and assignment schema
2. Read wrangler.toml — understand existing cron trigger setup (if any)
3. Read src/core/services/notifications.ts and notification-templates.ts
4. Read src/core/db/queries.ts — understand civic_volunteer_tasks table

REQUIRED DELIVERABLES:
1. wrangler.toml — add cron trigger: "*/15 * * * *" (every 15 minutes)
2. New file: src/core/cron/volunteerReminders.ts
   - Queries civic_volunteer_tasks WHERE startTime BETWEEN now+23h AND now+25h (24h window)
   - Queries same for now+1h45m AND now+2h15m (2h window)
   - For each, checks civic_reminder_log for already-sent reminders
   - Sends notification via NotificationService for unsent reminders
   - Writes entry to civic_reminder_log
3. New migration: migrations/015_reminder_log.sql — civic_reminder_log table
4. src/core/services/notification-templates.ts — VOLUNTEER_REMINDER_24H, VOLUNTEER_REMINDER_2H 
   templates in all 4 languages
5. src/worker.ts — export scheduled() handler for cron trigger

ACCEPTANCE CRITERIA:
- Task at T+24h → reminder sent at T
- Task at T+2h → reminder sent at T
- Same reminder not sent twice (idempotent via civic_reminder_log)
- Cancelled task → no further reminders
- All 4 language templates used based on volunteer's preferred language
```

---

### IMPL-PROMPT-11: Member Communication History

```
IMPLEMENTATION PROMPT — TASK-11
Repository: webwaka-civic
Objective: Log all notifications sent to church/NGO members and display history in member 
detail UI.

BEFORE ACTING:
1. Read src/core/services/notifications.ts — understand requestNotification() interface
2. Read src/modules/church-ngo/ui.tsx — understand MemberDetailPage structure
3. Read src/core/db/schema.ts — plan the communications table

REQUIRED DELIVERABLES:
1. migrations/014_member_communications.sql — civic_member_communications table
   (id, tenantId, memberId, type, channel, contentSummary, sentAt, status, createdAt)
2. src/core/services/notifications.ts — add logMemberCommunication() helper called after 
   every member notification
3. GET /api/civic/members/:id/communications — paginated, latest first, admin auth
4. src/modules/church-ngo/ui.tsx — CommunicationHistorySection in MemberDetailPage

ACCEPTANCE CRITERIA:
- Every member notification creates a log entry
- Member detail page shows communication history
- Pagination works (default 20 per page)
- Empty state handled gracefully
```

---

### IMPL-PROMPT-12: Budget vs Actuals Dashboard

```
IMPLEMENTATION PROMPT — TASK-12
Repository: webwaka-civic
Objective: Add budget vs actuals visual dashboard to Church/NGO expense management.

BEFORE ACTING:
1. Read src/core/db/schema.ts — understand civic_budgets and civic_expenses tables
2. Read src/modules/church-ngo/api/index.ts — understand existing budget endpoints
3. Read src/modules/church-ngo/ui.tsx — understand expense/budget UI

REQUIRED DELIVERABLES:
1. GET /api/civic/budgets/summary — aggregates budget and actual spend by category/department
   Returns: { category, budgetKobo, actualKobo, remainingKobo, percentUsed }[]
2. src/modules/church-ngo/apiClient.ts — getBudgetSummary()
3. src/modules/church-ngo/ui.tsx — BudgetSummaryPage
   - Progress bars per category
   - Colours: green < 80%, amber 80-95%, red ≥ 95%
   - CSV export button
4. i18n keys in all 4 locales

ACCEPTANCE CRITERIA:
- Summary shows correct figures from D1
- Colour thresholds applied correctly
- Page updates after new expense recorded
- CSV export downloads correctly
```

---

### IMPL-PROMPT-13: TypeScript Strict Mode

```
IMPLEMENTATION PROMPT — TASK-13
Repository: webwaka-civic
Objective: Enable TypeScript strict mode in all tsconfig files and fix every resulting error.

BEFORE ACTING:
1. Read tsconfig.json and tsconfig.build.json
2. Run: tsc --noEmit --strict (note all errors)
3. Categorise errors: implicit any, null check failures, missing return types

REQUIRED DELIVERABLES:
1. tsconfig.json — add "strict": true
2. tsconfig.build.json — add "strict": true
3. Fix all TypeScript errors in src/**/*.ts and src/**/*.tsx
   - Replace 'any' with specific types or unknown
   - Add null checks where needed
   - Add explicit return types to all functions

ACCEPTANCE CRITERIA:
- tsc --noEmit exits 0 with strict: true
- Zero 'any' usages without documented justification
- CI enforces this going forward
```

---

### IMPL-PROMPT-14: INEC Export Format

```
IMPLEMENTATION PROMPT — TASK-14
Repository: webwaka-civic
Objective: Add INEC-compliant nomination and results export endpoints for the political 
party and elections modules.

BEFORE ACTING:
1. Read src/modules/political-party/api/index.ts — nominations endpoints
2. Read src/modules/elections/api/index.ts — results collation endpoints
3. Research INEC CF001 nomination form fields and IReV result format structure
4. Read src/core/db/queries.ts for existing nomination/results queries

REQUIRED DELIVERABLES:
1. New file: src/core/services/inecFormatter.ts
   - formatNominationForINEC(nomination: PartyNomination): INECNominationRecord
   - formatResultsForIReV(results: ElectionResult[]): IReVResultSheet
2. GET /api/party/nominations/inec-export — admin only, returns JSON array
3. GET /api/elections/:id/results/inec-export — admin only, returns JSON array
4. Audit log entry created on every export call

ACCEPTANCE CRITERIA:
- Nomination export includes all INEC CF001 required fields
- Results export matches IReV ward-level format
- Both endpoints admin-only
- Audit log entry on each export
```

---

### IMPL-PROMPT-15: Paystack Refund Handler

```
IMPLEMENTATION PROMPT — TASK-15
Repository: webwaka-civic
Objective: Add handling for Paystack refund.processed webhook events in all three module 
webhook handlers.

BEFORE ACTING:
1. Read the existing webhook handlers in all three module api/index.ts files
2. Understand the Paystack refund event payload structure
3. Read src/core/db/schema.ts for paymentStatus column values

REQUIRED DELIVERABLES:
1. In src/modules/church-ngo/api/index.ts webhook handler: handle 'refund.processed'
   - Set civic_donations.paymentStatus = 'refunded'
   - Create refund record in civic_webhook_log
2. Same in src/modules/political-party/api/index.ts (party_dues table)
3. Same in src/modules/elections/api/index.ts (civic_campaign_donations table)
4. Update PaymentStatus type in schema.ts to include 'refunded'
5. Update PaymentStatusBadge in UI to show refunded state

ACCEPTANCE CRITERIA:
- refund.processed webhook → paymentStatus set to 'refunded'
- All three modules handle the event
- UI badge shows 'Refunded' status
```

---

### IMPL-PROMPT-16: Service Worker Cache Versioning

```
IMPLEMENTATION PROMPT — TASK-16
Repository: webwaka-civic
Objective: Inject build-time cache version into Service Worker so caches are automatically 
invalidated on deployment.

BEFORE ACTING:
1. Read vite.config.ts fully
2. Read public/sw.js — identify all hardcoded cache version strings

REQUIRED DELIVERABLES:
1. vite.config.ts — add: define: { __SW_CACHE_VERSION__: JSON.stringify(`v${Date.now()}`) }
2. public/sw.js — replace hardcoded version strings with __SW_CACHE_VERSION__ constant
   (Vite's define replaces it at build time)
3. Ensure old cache is deleted when new SW activates (self.skipWaiting() + clients.claim())

ACCEPTANCE CRITERIA:
- Each build produces a unique cache version string
- Old cache cleared on new SW activation
- App shell loads fresh after deployment
```

---

### IMPL-PROMPT-17: Server-Sent Events for Real-Time Updates

```
IMPLEMENTATION PROMPT — TASK-17
Repository: webwaka-civic
Objective: Replace setInterval polling for payment status and election results with 
Server-Sent Events (SSE).

BEFORE ACTING:
1. Read src/modules/church-ngo/ui.tsx — identify the setInterval polling for donation status
2. Read src/modules/elections/ui.tsx — identify any polling for results
3. Understand Hono SSE support (hono/streaming)

REQUIRED DELIVERABLES:
1. GET /api/civic/donations/stream — SSE endpoint, streams paymentStatus updates for 
   pending donations belonging to the authenticated tenant
2. GET /api/elections/:id/results/stream — SSE endpoint, streams vote tally updates
3. src/modules/church-ngo/ui.tsx — replace setInterval with EventSource
4. src/modules/elections/ui.tsx — same

ACCEPTANCE CRITERIA:
- EventSource connects and receives events
- setInterval code removed
- Stream closes cleanly when component unmounts (EventSource.close())
- SSE works through the Cloudflare proxy
```

---

### IMPL-PROMPT-18: Workbox Migration

```
IMPLEMENTATION PROMPT — TASK-18
Repository: webwaka-civic
Objective: Migrate the hand-rolled Service Worker to Workbox via vite-plugin-pwa.

BEFORE ACTING:
1. Read public/sw.js fully — understand all custom logic
2. Read vite.config.ts
3. Read src/main.tsx — understand SW registration

REQUIRED DELIVERABLES:
1. npm install vite-plugin-pwa
2. vite.config.ts — add VitePWA plugin with Workbox InjectManifest config
   - Cache-first for static assets
   - NetworkFirst for /api/* routes
   - StaleWhileRevalidate for /api/elections/*/results (leaderboards, public results)
3. New file: src/sw.ts — extend generated SW with custom push handler from public/sw.js
4. Remove public/sw.js
5. src/main.tsx — update to use Workbox registerSW()

ACCEPTANCE CRITERIA:
- Generated SW works identically to hand-rolled version
- Precaching manifest auto-generated
- Cache version auto-bumped on each build
- Background sync still works
```

---

### IMPL-PROMPT-19: API Versioning

```
IMPLEMENTATION PROMPT — TASK-19
Repository: webwaka-civic
Objective: Add /v1/ prefix to all API routes and implement version middleware.

BEFORE ACTING:
1. Read src/worker.ts — understand how modules are mounted
2. Read all module api/index.ts files — note all route paths
3. Read all apiClient.ts files — note all URL constructions

REQUIRED DELIVERABLES:
1. src/worker.ts — mount all modules at /v1/ base path
2. All src/modules/*/api/index.ts — add /v1 prefix (or mount point handles it)
3. All src/modules/*/apiClient.ts — update base URL to /v1
4. New file: src/core/middleware/apiVersion.ts — adds API-Version: v1 response header
5. Legacy unversioned routes — 301 redirect to /v1/ equivalent for 6 months

ACCEPTANCE CRITERIA:
- All API calls succeed via /v1/ prefix
- API-Version: v1 header on all responses
- Legacy paths redirect (not 404)
```

---

### IMPL-PROMPT-20: AI Donation Insights

```
IMPLEMENTATION PROMPT — TASK-20
Repository: webwaka-civic
Objective: Add AI-powered donation and member insights via OpenRouter API.

ECOSYSTEM CONTEXT: Vendor Neutral AI principle requires OpenRouter (not direct OpenAI/Anthropic). 
The AI call must be a fire-and-forget enhancement — the app must work perfectly without it.

BEFORE ACTING:
1. Read src/modules/church-ngo/api/index.ts — understand analytics data available
2. Read src/core/services/ — understand service client patterns
3. Understand Workers KV caching pattern

REQUIRED DELIVERABLES:
1. New file: src/core/services/aiInsights.ts
   - Uses OpenRouter API (https://openrouter.ai/api/v1/chat/completions)
   - Model: env.AI_MODEL || 'google/gemini-flash-1.5'
   - Returns: { summary: string, highlights: string[], risks: string[], recommendations: string[] }
   - Cached in Workers KV for 1 hour (key: insights:{tenantId}:{date})
2. GET /api/civic/ai/insights — admin only, calls aiInsights service
3. src/modules/church-ngo/ui.tsx — AIInsightsPanel on AnalyticsPage
   - Shows only if insights available; degrades gracefully if OpenRouter unavailable
4. wrangler.toml — add OPENROUTER_API_KEY secret reference, AI_MODEL var

ACCEPTANCE CRITERIA:
- Insights returned for admin users
- Cached for 1 hour (no repeated API calls)
- OpenRouter unavailable → no insights panel shown, no error surfaced to user
- Uses Vendor Neutral AI (OpenRouter) not direct provider
```

---

### IMPL-PROMPT-21: Dues Reminder Cron

```
IMPLEMENTATION PROMPT — TASK-21
Repository: webwaka-civic
Objective: Add automated dues reminder cron job for Political Party members.

BEFORE ACTING:
1. Read src/modules/political-party/api/index.ts — understand party_dues table structure
2. Read wrangler.toml — understand cron trigger format
3. Read src/core/services/notification-templates.ts

REQUIRED DELIVERABLES:
1. wrangler.toml — add cron: "0 8 * * *" (daily 8am UTC)
2. New file: src/core/cron/duesReminders.ts
   - Query party_dues WHERE dueDate = today+7 (7-day reminder)
   - Query party_dues WHERE dueDate = today (due-date reminder)
   - Query party_dues WHERE dueDate < today AND paymentStatus != 'success' (overdue)
   - Send NotificationService reminder for each, avoid duplicates via reminder log
3. Notification templates: DUES_REMINDER_7D, DUES_REMINDER_DUE, DUES_OVERDUE (all 4 locales)
4. src/worker.ts — export scheduled() handler

ACCEPTANCE CRITERIA:
- 7-day reminder sent 7 days before due date
- Due-date reminder sent on due date
- Overdue reminder sent daily until paid or cancelled
- No duplicate reminders (idempotent via civic_reminder_log)
```

---

### IMPL-PROMPT-22: Per-Tenant D1 Planning

```
IMPLEMENTATION PROMPT — TASK-22
Repository: webwaka-civic
Objective: Create a technical design document for migrating to per-tenant D1 databases. 
Implement tenant provisioning for new tenants only.

BEFORE ACTING:
1. Read wrangler.toml — understand current D1 binding structure
2. Read src/core/db/schema.ts — all migration SQL blocks
3. Research Cloudflare D1 per-tenant architecture patterns

REQUIRED DELIVERABLES:
1. docs/per-tenant-d1-design.md — technical design:
   - Current state analysis
   - Target state (one DB per tenant)
   - Migration strategy for existing tenants
   - New tenant provisioning flow
   - Cost and operational implications
2. POST /admin/provision-tenant — creates a new D1 database via Cloudflare API, runs all 
   migrations, registers tenant in a global registry D1 database
3. This is Phase 1 — existing tenants unchanged; new tenants get isolated DB

ACCEPTANCE CRITERIA:
- Design document reviewed and approved
- New tenant provisioned in < 10 seconds
- New tenant's D1 DB isolated (no shared schema rows)
```

---

### IMPL-PROMPT-23: Async Member Import

```
IMPLEMENTATION PROMPT — TASK-23
Repository: webwaka-civic
Objective: Remove the 200-row bulk import limit using Cloudflare Queues for async processing.

BEFORE ACTING:
1. Read the existing bulk import endpoint in src/modules/church-ngo/api/index.ts
2. Read wrangler.toml for Queue binding format
3. Understand Cloudflare Queue consumer pattern

REQUIRED DELIVERABLES:
1. wrangler.toml — add Queue binding: MEMBER_IMPORT_QUEUE
2. Updated POST /api/civic/members/import:
   - If rows ≤ 200: process synchronously (existing behaviour)
   - If rows > 200: enqueue to MEMBER_IMPORT_QUEUE, return { jobId }
3. New file: src/modules/church-ngo/importQueue.ts — Queue consumer
   - Processes rows in batches of 50
   - Writes progress to Workers KV: import:{jobId}:{progress}
4. GET /api/civic/import-jobs/:id — returns import job progress

ACCEPTANCE CRITERIA:
- ≤ 200 rows: synchronous, immediate response (unchanged)
- > 200 rows: async, returns jobId
- Progress polling endpoint works
- Import completes correctly for 5000 rows
```

---

### IMPL-PROMPT-24: Stale-While-Revalidate Caching

```
IMPLEMENTATION PROMPT — TASK-24
Repository: webwaka-civic
Objective: Add stale-while-revalidate caching for leaderboard and public results in 
the Service Worker.

BEFORE ACTING:
1. Read public/sw.js — understand fetch event handler
2. Identify which URLs should use SWR (leaderboards, public results)

REQUIRED DELIVERABLES:
1. public/sw.js (or src/sw.ts if Task-18 completed first) — add SWR handler:
   - Match: /api/elections/*/leaderboard, /api/public/elections/*
   - Strategy: serve from cache immediately, fetch update in background, update cache
2. Cache name for SWR data: 'civic-swr-v1'

ACCEPTANCE CRITERIA:
- First load: network fetch (cache empty)
- Subsequent loads: instant from cache, background update
- Cache updated when background fetch completes
```

---

### IMPL-PROMPT-25: Electoral Act Breach Alert

```
IMPLEMENTATION PROMPT — TASK-25
Repository: webwaka-civic
Objective: Send automated alert when campaign finance reaches 80% of Electoral Act limit.

BEFORE ACTING:
1. Read src/modules/political-party/api/index.ts — campaign finance transaction endpoint
2. Read ELECTORAL_ACT_LIMITS_KOBO constants
3. Read src/core/services/notifications.ts and notification-templates.ts

REQUIRED DELIVERABLES:
1. In POST /api/party/campaign-finance/:id/transactions:
   - After successful insert, calculate new total expenditure
   - If total ≥ 80% of limit: send FINANCE_BREACH_WARNING notification to all admins
   - If total ≥ 95% of limit: send FINANCE_BREACH_CRITICAL notification
   - Track notification sent in KV to avoid repeat alerts at same threshold
2. src/core/services/notification-templates.ts — FINANCE_BREACH_WARNING, FINANCE_BREACH_CRITICAL
   (all 4 locales)
3. If Task-09 (push notifications) complete: also send push notification to admin devices

ACCEPTANCE CRITERIA:
- 80% breach → WARNING notification sent to all admins
- 95% breach → CRITICAL notification sent
- Same threshold alert not sent twice (idempotent)
- All 4 locales supported
```

---

## PART 9 — QA PROMPTS

---

### QA-PROMPT-01: Sync Endpoint QA

```
QA PROMPT — TASK-01
Repository: webwaka-civic
Objective: Verify the POST /api/civic/sync endpoint is correctly implemented, secure, 
idempotent, and consistent with the offline sync engine's mutation payload format.

ECOSYSTEM CONTEXT: This repo is NOT standalone. The sync endpoint receives mutations queued 
by the CivicSyncEngine in src/core/sync/client.ts. The endpoint is the critical bridge 
between offline client state and the live D1 database.

BEFORE TESTING:
1. Read src/core/sync/client.ts to understand exact mutation payload format
2. Read the new POST /api/civic/sync implementation
3. Read all tests in src/modules/church-ngo/sync-endpoint.test.ts

TEST SCENARIOS:
Happy Path:
- POST /api/civic/sync with valid JWT + valid member create mutation → member appears in D1
- POST with donation update mutation → donation record updated in D1
- POST with event create mutation → event appears in D1

Security:
- POST without JWT → 401
- POST with JWT from tenant A but mutation has tenantId for tenant B → mutation rejected, 
  others processed
- POST with invalid entity type (e.g., 'invoice') → per-mutation error, not 500

Idempotency:
- POST same mutation batch twice → second POST returns success: true for all, no duplicate records
- POST same mutationId with different payload → second ignored (first wins)

Edge Cases:
- Empty mutations array → 200 with empty results
- Mutation for non-existent record (UPDATE on deleted member) → per-mutation error

Integration:
- Run CivicSyncEngine.processQueue() in integration test → verify it successfully posts to 
  endpoint and D1 reflects the changes

REGRESSIONS TO CHECK:
- All existing church-ngo endpoints still work
- Webhook handler not broken
- Migration endpoint not broken

BUG INDICATORS:
- Any 500 response on malformed mutation (should be per-mutation error)
- DB records appear without tenantId column value
- Duplicate records after replay

DONE CRITERIA: All tests pass; manual offline-to-online sync workflow verified end-to-end.
```

---

### QA-PROMPT-02: Rate Limiter QA

```
QA PROMPT — TASK-02
Repository: webwaka-civic
Objective: Verify the Durable Object rate limiter correctly persists state across Worker 
instances and accurately enforces the 100 req/min limit.

TEST SCENARIOS:
- Send 100 requests within 60s → all succeed
- Send 101st request → 429 Too Many Requests
- Wait 60s → send request → succeeds (window reset)
- Simulate cold start (restart Worker) → send 101st request → still blocked (DO persisted)
- Different IPs → each has independent counter

SECURITY CHECKS:
- Verify Paystack HMAC verification still works after rate limit check
- Verify rate limit returns 429 before reaching business logic

PERFORMANCE:
- Measure latency overhead added by DO call (should be < 10ms p99)

REGRESSION:
- All three webhook handlers still process valid Paystack events

DONE CRITERIA: 
- Rate limit persists through Worker restart
- All tests pass
- Latency overhead documented
```

---

### QA-PROMPT-03: Ballot Encryption QA

```
QA PROMPT — TASK-03
Repository: webwaka-civic
Objective: Verify that all ballots are encrypted at rest in both D1 and IndexedDB, 
that decryption produces correct vote tallies, and that voter verification still works.

CRITICAL TESTS:
1. Security: Direct D1 query → civic_ballots has no plaintext candidateId UUIDs
   SELECT * FROM civic_ballots LIMIT 10; → encryptedBallot column is ciphertext, not UUID format
2. Roundtrip: Encrypt candidateId → decrypt → matches original
3. Tally: Create election with 3 candidates, cast 10 votes (mix), tally → correct counts
4. Verification: Cast vote → receive hash → verify hash → confirmed
5. Offline: Cast vote offline → store in IndexedDB → sync → D1 has encrypted ballot

SECURITY EDGE CASES:
- Missing BALLOT_ENCRYPTION_KEY → Worker refuses to start voting phase (not silently fails)
- Corrupt ciphertext → 422 on submit, not 500
- Same voter casts twice → one-vote enforcement still works (not bypassed by encryption)

REGRESSION:
- Public results still return candidate vote counts (tallying works)
- Voter card endpoint still works
- Election audit log still has entries

DONE CRITERIA: 
- No plaintext candidateId in D1 or IndexedDB
- Result tallying correct
- All tests pass
```

---

### QA-PROMPT-04: CI/CD Pipeline QA

```
QA PROMPT — TASK-04
Repository: webwaka-civic
Objective: Verify the CI/CD pipeline correctly enforces quality gates and deploys 
to Cloudflare on merge to main.

TEST SCENARIOS:
1. Create PR with failing test → CI marks checks as failed → cannot merge
2. Create PR with TypeScript error → CI fails
3. Create PR with missing i18n key in yo.json → i18n check fails
4. Create PR with all checks passing → CI succeeds, PR can be merged
5. Merge to main → deploy workflow runs → Cloudflare Worker updated

EDGE CASES:
- CI timeout (tests take > 10 minutes) → investigate and optimise
- Deploy fails (bad Cloudflare token) → alert sent, not silent failure

DONE CRITERIA: All four pipeline scenarios work as expected.
```

---

### QA-PROMPT-05: i18n QA

```
QA PROMPT — TASK-05
Repository: webwaka-civic
Objective: Verify all i18n keys are present in all locales and the app renders 
correctly in all 4 languages.

TEST SCENARIOS:
1. Run scripts/check-i18n.js → exits 0 (no missing keys)
2. Set app language to Yoruba → navigate all pages → zero raw key strings visible
3. Set to Igbo → same
4. Set to Hausa → same
5. TypeScript: call getTranslation('nonexistent.key') → compile-time error

EDGE CASES:
- Very long strings (Igbo currency description) → check UI doesn't overflow
- Strings with {count} placeholders → check they render correctly in all locales

DONE CRITERIA: check-i18n.js exits 0; all locales render correctly in UI.
```

---

### QA-PROMPT-06 through QA-PROMPT-25

*(All follow same structure. Abbreviated here — each prompt includes: test scenarios, edge cases, security checks, regression checks, done criteria.)*

For Tasks 06–25, QA prompts follow this template:

```
QA PROMPT — TASK-[N]
Repository: webwaka-civic
Objective: [Mirror of implementation objective — verify it's correctly done]

ECOSYSTEM CONTEXT: [Any cross-repo or platform context]

BEFORE TESTING:
1. Read the implementation diff
2. Run all tests: npm test
3. Check for regressions in related modules

TEST SCENARIOS:
Happy Path: [Primary feature works as designed]
Security: [Auth enforced, no injection, no data leak]
Edge Cases: [Empty state, missing env vars, network failure, large data sets]

REGRESSION CHECKS:
- [List of existing features that could be broken by this change]

DONE CRITERIA:
- All new tests pass
- All existing tests pass
- [Feature-specific done condition]
- i18n: all new strings in all 4 locales
- [Audit log created where applicable]
```

---

## PART 10 — PRIORITY ORDER

### P0 — Critical (Fix immediately, blocking production safety)

| Priority | Task | Reason |
|---|---|---|
| P0.1 | TASK-07 (JWT Fallback) | Silent auth bypass in production |
| P0.2 | TASK-03 (Ballot Encryption) | Electoral law violation |
| P0.3 | TASK-01 (Sync Endpoint) | Offline data silently lost |
| P0.4 | TASK-02 (Rate Limiter DO) | Security bypass via cold start |
| P0.5 | TASK-08 (Cross-Tenant) | Multi-tenancy breach |

### P1 — High (Implement in Sprint 1)

| Priority | Task | Reason |
|---|---|---|
| P1.1 | TASK-04 (CI/CD) | No quality gates — all fixes unprotected |
| P1.2 | TASK-13 (TypeScript Strict) | Type safety prevents future bugs |
| P1.3 | TASK-16 (SW Cache Version) | Stale caches break updates |
| P1.4 | TASK-15 (Paystack Refund) | Missing financial event handling |
| P1.5 | TASK-05 (i18n Audit) | Broken UX for 80% of target users |

### P2 — Medium (Implement in Sprint 2)

| Priority | Task | Reason |
|---|---|---|
| P2.1 | TASK-06 (Recurring Giving) | Revenue-critical feature |
| P2.2 | TASK-10 (Volunteer Reminders) | 40% no-show reduction |
| P2.3 | TASK-09 (Push Notifications) | Re-engagement critical |
| P2.4 | TASK-12 (Budget Dashboard) | Operational visibility |
| P2.5 | TASK-11 (Communication History) | Compliance and oversight |

### P3 — Standard (Implement in Sprint 3)

| Priority | Task | Reason |
|---|---|---|
| P3.1 | TASK-17 (SSE Real-time) | Better UX than polling |
| P3.2 | TASK-14 (INEC Export) | Compliance completeness |
| P3.3 | TASK-25 (Finance Breach Alert) | Electoral Act compliance |
| P3.4 | TASK-21 (Dues Reminders) | Member retention |
| P3.5 | TASK-18 (Workbox) | SW reliability |

### P4 — Enhancement (Sprint 4+)

| Priority | Task | Reason |
|---|---|---|
| P4.1 | TASK-19 (API Versioning) | Future-proofing |
| P4.2 | TASK-20 (AI Insights) | Premium feature |
| P4.3 | TASK-22 (Per-Tenant D1) | Long-term scale |
| P4.4 | TASK-23 (Async Import) | Edge case usability |
| P4.5 | TASK-24 (SWR Caching) | Performance polish |

---

## PART 11 — DEPENDENCIES MAP

```
TASK-04 (CI/CD) ──────────────────────────────────────────►enables all future tasks
TASK-05 (i18n) ─── depends on ─► TASK-04 (CI i18n check)
TASK-01 (Sync) ─── no deps
TASK-02 (Rate Limiter) ─── no deps
TASK-03 (Ballot Enc) ─── no deps (but highest priority)
TASK-07 (JWT Fix) ─── no deps
TASK-08 (Cross-Tenant) ─── no deps
TASK-06 (Recurring) ─── no deps
TASK-09 (Push) ─── no deps (enables TASK-25)
TASK-10 (Vol Reminders) ─── depends on ─► TASK-09 (push channel optional)
TASK-11 (Comm History) ─── no deps
TASK-12 (Budget Dashboard) ─── no deps
TASK-13 (TS Strict) ─── no deps
TASK-14 (INEC Export) ─── no deps
TASK-15 (Refund) ─── no deps
TASK-16 (SW Cache) ─── no deps; superseded by TASK-18
TASK-17 (SSE) ─── no deps
TASK-18 (Workbox) ─── supersedes ─► TASK-16 (SW Cache)
TASK-19 (API Version) ─── risk: breaks all apiClient.ts; coordinate carefully
TASK-20 (AI) ─── depends on ─► analytics endpoints (already exist)
TASK-21 (Dues Reminders) ─── no deps
TASK-22 (Per-Tenant D1) ─── Phase 1 only; Phase 2 depends on TASK-22 design
TASK-23 (Async Import) ─── no deps
TASK-24 (SWR) ─── better after TASK-18 (Workbox)
TASK-25 (Finance Alert) ─── optional dep on TASK-09 (push)
```

---

## PART 12 — PHASE 1 / PHASE 2 SPLIT

### Phase 1 (Security + Foundation) — Sprints 1–2

Tasks: TASK-01, TASK-02, TASK-03, TASK-04, TASK-05, TASK-07, TASK-08, TASK-13, TASK-15, TASK-16

**Goal:** Fix all security issues, establish CI/CD, enforce type safety, complete i18n.  
**Outcome:** Secure, tested, compliant foundation with full i18n coverage.

### Phase 2 (Features + Enhancement) — Sprints 3–5

Tasks: TASK-06, TASK-09, TASK-10, TASK-11, TASK-12, TASK-14, TASK-17, TASK-18, TASK-19, TASK-20, TASK-21, TASK-22, TASK-23, TASK-24, TASK-25

**Goal:** Add recurring giving, push notifications, volunteer automation, AI insights, and platform scalability features.  
**Outcome:** Feature-complete WebWaka Civic platform ready for production scale.

---

## PART 13 — REPO CONTEXT AND ECOSYSTEM NOTES

### What this repo provides to the WebWaka ecosystem

- The CIV-1 Church/NGO module is a complete tenant management system
- The CIV-2 Political Party module implements Nigerian Electoral Act 2022 compliance
- The CIV-3 Elections module is the most complex, with offline voting, result collation, and IReV-style public portals
- The volunteer and fundraising sub-modules support CIV-3 campaigns
- The offline sync engine (CORE-1 pattern) is the model for other WebWaka repos

### What this repo consumes from the ecosystem

- `@webwaka/core` package: currently a local stub — in production this is an npm package published by the WebWaka core team
- `CORE-COMMS`: the notification delivery service (SMS, WhatsApp, email) — this repo emits `notification.requested` events but does not deliver them
- `CORE-PAYMENTS`: the payment reconciliation service — this repo emits payment events and handles webhooks, but reconciliation lives elsewhere
- `CORE-DOCS`: the PDF generation service — this repo emits `document.generation.requested` but does not render PDFs
- `CORE-AUTH`: the JWT issuer — this repo verifies JWTs but does not issue them; token management is external
- `CORE-EVENTBUS`: the platform event bus — this repo publishes events using the EventBus client

### Cross-repo implementation constraints

When implementing in `webwaka-civic`:
- Never add direct API calls to other WebWaka repos — use the event bus pattern only
- Never implement JWT issuance — only verification
- Never implement PDF rendering — only emit `document.generation.requested`
- Never implement SMS/WhatsApp delivery — only emit `notification.requested`
- Always use `@webwaka/core` types from the local stub until the npm package is available
- The `@webwaka/core` stub in `node_modules/@webwaka/core/` must be kept in sync with additions

### Impact of changes on the ecosystem

Any new event type emitted by this repo (e.g., `civic.recurring.donation.created`) must be:
1. Documented in the platform event catalogue
2. Handled by the appropriate consumer service (CORE-COMMS, CORE-PAYMENTS, etc.)
3. Tested with a mock consumer to verify payload shape

---

## PART 14 — GOVERNANCE AND REMINDER BLOCK

### Mandatory Principles (apply to every task in this document)

| Principle | Requirement |
|---|---|
| **Build Once Use Infinitely** | All new helpers go in `src/core/` or `@webwaka/core`. Never duplicate logic across modules. |
| **Mobile/PWA/Offline First** | Any new data write must be offline-queueable. Any new UI must work without network. |
| **Nigeria-First, Africa-Ready** | All monetary values in kobo (integer). All UI strings in all 4 locales. Phone-first UX. |
| **Vendor Neutral AI** | All AI calls via OpenRouter. No direct OpenAI/Anthropic/Google imports. |
| **Multi-Tenant Tenant-as-Code** | Every DB query must enforce tenantId. No cross-tenant data access ever. |
| **Event-Driven** | No direct inter-module DB access. Cross-module communication via event bus only. |
| **Thoroughness Over Speed** | No shortcuts. No placeholders. No TODOs in delivered code. |
| **Zero Skipping Policy** | All affected files updated. All test cases written. All locales updated. |
| **Multi-Repo Platform Architecture** | Never implement in this repo what belongs in another. Use events. |
| **Governance-Driven Execution** | Read the replit.md and this taskbook before every implementation task. |
| **CI/CD Native Development** | All code must pass CI before merge. No bypassing pipeline. |
| **Cloudflare-First Deployment** | No Node.js built-ins in Worker code. Use Web Crypto, Durable Objects, KV, Queues. |

### Anti-Patterns to Avoid

- Do NOT store JWT secrets in code (even as comments)
- Do NOT use `Math.random()` for security tokens — use `crypto.randomUUID()` or Web Crypto
- Do NOT use floating point for monetary amounts — kobo integers only
- Do NOT create new API patterns that bypass existing auth middleware
- Do NOT add `any` types without justification
- Do NOT skip i18n for new UI strings
- Do NOT use direct SQL in route handlers — use query helpers in `src/core/db/queries.ts`
- Do NOT call Paystack directly from route handlers — use PaymentService
- Do NOT call external notification services directly — use NotificationService
- Do NOT add dependencies that are incompatible with Cloudflare Workers runtime

---

## PART 15 — EXECUTION READINESS NOTES

### Before Starting Any Task

1. Run `npm test` — verify all existing tests pass before you change anything
2. Run `tsc --noEmit` — verify zero TypeScript errors before you change anything
3. Run `npm run build` — verify the build succeeds
4. Read `replit.md` — understand all prior decisions and constraints
5. Read the relevant module's test file — understand what is already tested

### Development Environment

- Run `npm run dev` to start the Vite dev server on port 5000
- The Cloudflare Worker backend is not running in dev — API calls will fail unless mocked or a Wrangler dev instance is started separately
- Use Vitest for all unit tests (`npm test`)
- Use `wrangler dev` for integration testing with real D1 (requires Cloudflare account)

### Database Migrations

- Migrations are applied manually via the Admin UI in each module (POST /api/civic/migrate, POST /api/party/migrate, POST /api/elections/:id/migrate)
- New migration SQL must be added to the appropriate SQL constant in `src/core/db/schema.ts` AND as a numbered file in `migrations/`
- Migration numbering: continue from `011_` for the next new migration

### Secrets Management

- All secrets in `wrangler.toml` under `[vars]` (non-sensitive) or via `wrangler secret put` (sensitive)
- In development: use `.dev.vars` file (not committed to git)
- Required secrets for full functionality: `CIVIC_JWT_KEY`, `PAYSTACK_SECRET`, `BALLOT_ENCRYPTION_KEY` (new), `OPENROUTER_API_KEY` (new), `VAPID_PUBLIC_KEY` (new), `VAPID_PRIVATE_KEY` (new)

### Test Patterns

- Unit tests: use Vitest with `jsdom` environment for React components
- Worker tests: use `@cloudflare/workers-types` and `fake-indexeddb` for offline tests
- Mocking: use `vi.fn()` for service mocks; do NOT mock D1 queries in integration tests
- Coverage target: aim for > 80% line coverage on new code

### Definition of Done (All Tasks)

A task is DONE when:
1. All implementation deliverables are in place
2. All new unit tests pass
3. All existing tests still pass
4. TypeScript compiles without errors (strict mode after TASK-13)
5. All new UI strings have translations in all 4 locales
6. `npm run build` produces a clean build
7. The feature has been manually verified in the browser
8. Relevant audit log entries created where required
9. replit.md updated with the new phase/task summary

---

*End of WEBWAKA-CIVIC-DEEP-RESEARCH-TASKBOOK.md*  
*Document length: Comprehensive (15 parts, 25 tasks, 25 QA plans, 25 implementation prompts, 25 QA prompts)*  
*Next review: After Phase 1 completion*
