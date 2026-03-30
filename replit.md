# WebWaka Civic & Political Suite

## Overview
WebWaka Civic is a unified platform for managing Churches/NGOs (CIV-1), Political Parties (CIV-2), and Elections & Campaigns (CIV-3), designed for the African context (specifically Nigeria). It features multi-language support (English, Yoruba, Igbo, Hausa) and an offline-first architecture.

## Tech Stack
- **Frontend**: React 18 + TypeScript, built with Vite
- **Offline Storage**: Dexie.js (IndexedDB wrapper)
- **Backend (production)**: Hono on Cloudflare Workers + D1 Database + R2 Storage
- **Testing**: Vitest (unit), Playwright (E2E)
- **Package Manager**: npm

## Project Structure
```
src/
  main.tsx              # React entry point
  worker.ts             # Cloudflare Worker entry point
  components/           # Shared React components
  core/
    auth.ts             # Shared JWT verification + auth middleware (CIVIC_JWT_KEY)
    response.ts         # Shared response helpers (apiSuccess, apiError, apiPaginated, koboToNaira, generateId, nowMs)
    rbac.ts             # RBAC middleware (electionAuthMiddleware, requireElectionRole, requireAdmin)
    db/                 # Database queries and schema
    event-bus/          # Platform event bus integration (all CivicEventType definitions)
    services/
      notifications.ts  # CORE-COMMS client — emits notification.requested events
      payments.ts       # CORE-PAYMENTS client — Paystack HMAC verify + payment events
      documents.ts      # CORE-DOCS client — emits document.generation.requested events
    sync/               # Offline sync engine (IndexedDB → server)
  modules/
    church-ngo/         # CIV-1: Church & NGO management (active UI)
    political-party/    # CIV-2: Political Party management
    elections/          # CIV-3: Elections & Campaigns
    volunteers/         # CIV-3: Volunteer management
    fundraising/        # CIV-3: Fundraising & expenses
  i18n/                 # Internationalization
migrations/             # D1 SQL migrations
public/                 # Static assets, PWA manifest, service worker
```

## Phase 4 — Unified Frontend & CIV-3 Module UI — COMPLETED (Weeks 19–24)

### T001: Unified App Shell (`src/App.tsx`)
- Module-selector landing page with three module cards: Church/NGO, Political Party, Elections & Campaigns
- Each card prompts Tenant ID + JWT (sessionStorage keyed per module: `webwaka_token`, `webwaka_party_token`, `webwaka_election_token`)
- Language selector (EN/YO/IG/HA) persisted to localStorage; global OfflineSyncBanner
- `src/main.tsx` updated to render `<App />` as unified entry point

### T002: OfflineSyncBanner (`src/components/shared/OfflineSyncBanner.tsx`)
- Listens to SW postMessages: `MUTATION_QUEUED`, `SYNC_COMPLETE`, `QUEUE_COUNT`
- States: offline + N queued, syncing, synced; used by all three module shells

### T003: CIV-3 Elections Module UI (`src/modules/elections/ui.tsx` + `apiClient.ts`)
- Pages: dashboard, election-list, election-detail, nominations, voting, results-collation, public-results, volunteers, fundraising, admin/migrate
- Typed API client (`src/modules/elections/apiClient.ts`) wired to all CIV-3 endpoints
- AdminPage: "Run Migrations" button calls `POST /api/elections/:id/migrate`

### T004: CIV-2 Nominations & Campaign Finance screens (`src/modules/political-party/ui.tsx`)
- New `Page` types: `nominations`, `nomination-create`, `nomination-detail`, `campaign-finance`, `finance-account-create`, `finance-transactions`
- `NominationsPage`: filterable list, inline approve/reject (with notes modal) + submit to INEC buttons
- `NominationCreatePage`: form for memberId, position, constituency, statement of intent
- `NominationDetailPage`: full detail with approve/reject/submit actions
- `CampaignFinancePage`: accounts list with Electoral Act limit display
- `FinanceAccountCreatePage`: create account with position level selector + limit preview
- `FinanceTransactionsPage`: income/expenditure log with progress bar vs. Electoral Act limit, ≥80% warning
- Bottom nav extended: 📋 Nominations, 💳 Finance
- i18n keys added: `nav.nominations`, `nav.campaignFinance` in all 4 locales (en/yo/ig/ha)
- API client extended: `getNominations`, `createNomination`, `approveNomination`, `rejectNomination`, `submitNomination`, `getCampaignAccounts`, `createCampaignAccount`, `getCampaignSummary`, `addCampaignTransaction`

### T005: D1 Migration Bootstrap UI
- Church/NGO: collapsible "⚙️ Admin Tools" section in dashboard, calls `POST /api/civic/migrate`
- Political Party: collapsible `AdminMigrateCard` component in dashboard, calls `POST /api/party/migrate`
- Elections: dedicated Admin page (already existed) with `POST /api/elections/:id/migrate`
- All show inline ✓/✗ result with applied-migration count; idempotent

### T007: Build Verification
- `tsc -p tsconfig.build.json && vite build` → **0 TS errors, 0 Vite errors**
- Bundle: 411 KB raw / 120 KB gzip

---

## Phase 3 — Offline-First Infrastructure — COMPLETED (Weeks 15–18)
- Service Worker: full IndexedDB mutation queue + BackgroundSync replay
- Phase 3 keys added to all 4 i18n locale files

---

## Phase 2 — Core Platform Gaps — COMPLETED (Weeks 9–14)

### T001: E03 — NotificationService wired into Church-NGO
- **Member registration** → `member.welcome` WhatsApp/email via `NotificationService.sendWelcome()`
- **Donation recorded** → `donation.receipt` notification (phone=WhatsApp, email fallback)
- **Event created** → `event.upcoming` broadcast notification
- **Pledge fulfilled** → `pledge.fulfilled` thank-you notification
- All calls fire-and-forget (`.catch()` logged, never blocks response)

### T002: E13 — Bulk Member Import
- `POST /api/civic/members/import` — accepts `Content-Type: text/csv` or JSON `{ rows: [...] }`
- Validates firstName, lastName, phone per row; max 200 rows per batch
- Batch INSERT, emits `civic.member.registered` + welcome notification per member
- Returns `{ imported, failed, errors: [{row, reason}] }`

### T003: P03 — INEC Membership Register Export
- `GET /api/party/members/export?format=csv|json` — admin-only
- CSV columns: membershipNumber, firstName, lastName, phone, state, lga, ward, structureId, memberStatus
- Returns `Content-Disposition: attachment; filename="inec-register-{orgId}-{date}.csv"`

### T004: P05 — Candidate Vetting & Nomination Workflow
- Schema: `party_nominations` table in `PARTY_MIGRATION_SQL`
- `GET/POST /api/party/nominations`, `PATCH …/:id/approve|reject|submit`
- On approve: emits `candidate.nominated` (CIV-2→CIV-3 bridge event)
- TypeScript: `PartyNomination`, `NominationStatus`; query helpers in `queries.ts`

### T005: P06 — Campaign Finance Tracker (Electoral Act 2022)
- Schema: `party_campaign_accounts` + `party_campaign_transactions` tables
- `ELECTORAL_ACT_LIMITS_KOBO` constants (presidential→₦5B, governorship→₦1B, senate→₦100M …)
- `GET/POST /api/party/campaign-finance`, `POST …/:id/transactions`, `GET …/:id/summary`
- Warning emitted when expenditure exceeds 80% of Electoral Act limit

### T006: EL02 — Multi-Level Result Collation
- Schema: `election_result_collations` table in `ELECTION_MIGRATION_SQL`
- Collation levels: polling_unit / ward / lga / state / senatorial / federal_constituency / national
- `POST /api/elections/results/collate`, `GET /api/elections/:id/results/collation?level=`, `PATCH …/results/:id/certify`
- Aggregate view per candidate with vote totals and percentage

### T007: EL03 — Public Result Portal (IReV-style)
- No JWT required — public endpoints
- `GET /api/public/elections/:id/results` — certified results with percentage
- `GET /api/public/elections/:id/results/breakdown?level=ward|lga|state` — geographic breakdown by candidate

---

## Phase 1 — CIV-1 & CIV-2 Features — COMPLETED

### T010–T011: Departments + Expenses/Budgets (CIV-1)
- `civic_departments`, `civic_expenses`, `civic_budgets` tables + full CRUD API
- `CivicExpenseCategory` / `CivicExpenseStatus` (renamed to avoid CIV-3 conflict)

### T012: PaymentService wired into donations + pledges (CIV-1)
- `POST /api/civic/donations` → Paystack initializePayment for paystack method
- `POST /api/civic/pledges/:id/payment?via=paystack`
- `POST /webhooks/paystack` HMAC-SHA512 verified, outside JWT scope

### T013: Party ID Card document generation (CIV-2)
- `createPartyIdCard()` emits `document.generation.requested`
- `POST /api/party/id-cards/:id/regenerate`

---

## Phase 0 Infrastructure — COMPLETED

### Shared Auth (`src/core/auth.ts`)
- `verifyWebwakaJWT<T>()` — Web Crypto HS256 verification (Cloudflare Workers compatible)
- `createCivicAuthMiddleware<T>()` — factory replacing all local verifyJWT copies
- `requireRole(allowedRoles[])` — generic role guard
- Typed payload interfaces: `CivicJWTPayload`, `PartyJWTPayload`, `ElectionJWTPayload`
- `CIVIC_JWT_KEY` constant — single context key across all modules

### Shared Response Helpers (`src/core/response.ts`)
- `apiSuccess<T>()`, `apiError()`, `apiPaginated<T>()` — canonical response factories
- `koboToNaira()` — Nigerian kobo→Naira formatter
- `generateId()` — crypto.randomUUID()
- `nowMs()`, `nowSec()` — timestamp helpers

### Platform Service Clients (`src/core/services/`)
All three clients emit events; no direct SDK calls to Paystack/WhatsApp/PDF:
- **notifications.ts** — `NotificationService.requestNotification()` → `notification.requested` event
- **payments.ts** — `PaymentService.initializePayment()` + Paystack HMAC webhook verification
- **documents.ts** — `DocumentService.requestDocument()` → `document.generation.requested` event

### Module Migrations (T003, T004)
- `church-ngo/api/index.ts` — removed local verifyJWT, apiSuccess, apiError, koboToNaira, generateId, now(); now imports from core/auth + core/response; all context keys use CIVIC_JWT_KEY
- `political-party/api/index.ts` — same migration; all 35 route handlers updated

## Development

### Start the dev server
```bash
npm run dev
```
Runs on port 5000 (configured for Replit preview).

### Build
```bash
npm run build
```

### Run tests
```bash
npm test
```

## Replit Setup Notes
- The `@webwaka/core` package is a sibling repo stub — it's only used in the Cloudflare Worker backend (not the frontend React app). A local stub is provided in `node_modules/@webwaka/core/` for type compatibility.
- Frontend runs on `0.0.0.0:5000` with all hosts allowed for the Replit proxy.
- Deployment is configured as a static site (Vite builds to `dist/`).

## Deployment
- **Type**: Static site
- **Build command**: `npm run build`
- **Output directory**: `dist/`
- The Cloudflare Workers backend must be deployed separately via `wrangler deploy`.

## RBAC Architecture

### Shared RBAC module — `src/core/rbac.ts`
Provides reusable JWT verification and role-guard middleware for CIV-3 (Elections & Campaigns):
- **Roles**: `admin | campaign_manager | candidate | voter | volunteer`
- `electionAuthMiddleware()` — verifies HS256 Bearer JWT, stores payload in Hono context
- `requireElectionRole(allowedRoles)` — route-level middleware; returns 403 if role not in list
- Shorthand exports: `requireAdmin`, `requireAdminOrManager`

### Module RBAC coverage
| Module | Auth | Role Guards |
|--------|------|-------------|
| `church-ngo` | JWT middleware on `*` | Inline `payload.role` checks on all mutations + attendance |
| `political-party` | JWT middleware on `*` | Inline `payload.role` checks on all mutations |
| `elections` | JWT middleware via `electionAuthMiddleware` (health exempt) | `requireAdmin` / `requireAdminOrManager` / `requireElectionRole` on all 26 mutation endpoints |
| `volunteers` | JWT middleware via `electionAuthMiddleware` (health exempt) | `requireAdminOrManager` on create/update/assign/badge; `requireElectionRole(["admin","campaign_manager","volunteer"])` on accept/complete |

### Role-to-endpoint matrix (elections)
- **admin only**: delete election, approve candidate, approve expense
- **admin + campaign_manager**: create/update election, state transitions, nominate candidate, create voting station, all finance, all materials, all announcements, register/update volunteer, create/assign task
- **admin + campaign_manager + voter**: cast vote
- **admin + campaign_manager + volunteer**: update task status
- **authenticated (any)**: all reads, verify vote, sync pull

## Phase 5 — Analytics, Compliance & Governance — COMPLETED (Weeks 27–32)

### T001: Schema Extensions
- `CivicProject` table: multi-fund project accounting (id, tenantId, organizationId, name, donorName, budgetKobo, startDate, endDate, status, description)
- `CivicNdprAuditLog` table: NDPR compliance log (id, tenantId, memberId, action, consentVersion, requestType, notes, performedBy, createdAt)
- `isDonor`, `donorSince`, `donorNotes` fields added to `CivicMember`
- `projectId` optional FK added to `CivicDonation` and `CivicExpense`
- All tables appended to `MIGRATION_SQL` constant in `src/core/db/schema.ts`

### T002: Church/NGO Analytics & Compliance APIs
- `GET /api/civic/analytics/donations` (E07): 12-month monthly trend, department breakdown, top-givers tiers, YoY comparison
- `GET /api/civic/analytics/pledges` (F07): totalPledged, totalPaid, fulfillmentPercent, aging buckets, top-5 unfulfilled
- `GET/POST /api/civic/projects` + `GET /api/civic/projects/:id/summary` (E06): project accounting
- `GET /api/civic/donors` + `PATCH /api/civic/members/:id/donor-profile` (F06): donor CRM
- `POST /api/civic/members/:id/consent-withdraw` + `GET /api/civic/ndpr/audit-log` + `POST /api/civic/members/:id/data-erasure-request` (E08): NDPR

### T003: Party Hierarchy Analytics API
- `GET /api/party/analytics/hierarchy?structureId=...` (P09): node + direct children with memberCount, activeMemberCount, duesCollectedKoboYTD, meetingCountLast90d

### T004: Election Analytics & Comparison APIs
- `GET /api/elections/:id/analytics` (EL12): turnout, ranked results, winMargin, geographic breakdown
- `GET /api/public/elections/compare?ids=...` (CE10): public endpoint, candidate comparison + swing % across 2 elections

### T005/T006: Church/NGO Frontend (Analytics Dashboard + Member Portal)
- New pages: AnalyticsPage (12-month bar chart, pledge aging, department breakdown), DonorsPage, DonorDetailPage, ProjectsPage, ProjectCreatePage
- Member self-service portal: MemberPortal, PortalGivingPage, PortalPledgesPage, PortalEventsPage, PortalProfilePage
- Extended apiClient: getDonationAnalytics, getPledgeAnalytics, getDonors, updateDonorProfile, getProjects, createProject, getProjectSummary
- Added 📊 Analytics tab to bottom nav (i18n: en/yo/ig/ha)

### T007: Party Hierarchy Analytics Frontend
- `HierarchyAnalyticsPage`: drill-down structure cards with breadcrumb trail, memberCount, dues bar chart
- Added 📊 Analytics nav item to political-party bottom nav
- `getHierarchyAnalytics(structureId?)` added to party apiClient
- `analytics` key added to all 4 party locales (en/yo/ig/ha)

### T008: Election Post-Analytics Frontend
- `ElectionAnalyticsPage`: turnout gauge, ranked results bars, win margin callout, geographic breakdown table
- `CompareElectionsPage`: select 2 elections, side-by-side candidate bars with swing % arrows
- 📈 Analytics button on ElectionDetailPage
- `analyticsApi` (electionAnalytics, compareElections) added to elections apiClient

### Build Status
- **0 TypeScript errors**, **0 Vite errors**, **447 KB bundle**

## Key Features
- Mobile-first, offline-first PWA
- Multi-tenancy (every record includes `tenantId`)
- Multi-language support (English, Yoruba, Igbo, Hausa)
- Nigerian financial conventions (kobo integers, Naira display)
- Service Worker for asset caching and background sync
