# WebWaka Civic — Comprehensive Research & Enhancement Report
**Prepared:** March 2026  
**Scope:** Full codebase audit + Nigerian civic market research + 120 platform enhancements + cross-repo integration map + execution roadmap

---

## Table of Contents

1. [Civic Codebase Architecture Report](#1-civic-codebase-architecture-report)
2. [Nigeria Civic Market Research Summary](#2-nigeria-civic-market-research-summary)
3. [Top 20 Church & NGO Enhancements](#3-top-20-church--ngo-enhancements)
4. [Top 20 Political Party Enhancements](#4-top-20-political-party-enhancements)
5. [Top 20 Elections & Campaigns Enhancements](#5-top-20-elections--campaigns-enhancements)
6. [Top 20 Volunteer Management Enhancements](#6-top-20-volunteer-management-enhancements)
7. [Top 20 Fundraising / Donation Enhancements](#7-top-20-fundraising--donation-enhancements)
8. [Top 20 Voter Education / Civic Engagement Enhancements](#8-top-20-voter-education--civic-engagement-enhancements)
9. [Cross-Repo Integration Map](#9-cross-repo-integration-map)
10. [Recommended Execution Order](#10-recommended-execution-order)

---

## 1. Civic Codebase Architecture Report

### 1.1 Platform Context

WebWaka Civic is **one modular component** in the broader WebWaka multi-repo ecosystem. It is not a standalone application. It is deployed as a Cloudflare Worker that exposes REST APIs consumed by a React PWA frontend. The platform operates under the following invariants: **Offline First**, **Nigeria First**, **Build Once Use Infinitely**, and **Event-Driven Architecture**.

The codebase runs in three distinct environments:
- **Cloudflare Workers** (Edge compute, no Node.js runtime)
- **Cloudflare D1** (SQLite-based edge database)
- **Cloudflare R2** (Object storage for files, ID card images, manifestos)

### 1.2 Major Modules

| Module | Path | Blueprint Ref | Status |
|--------|------|---------------|--------|
| Church & NGO | `src/modules/church-ngo/` | CIV-1 | Complete foundation |
| Political Party | `src/modules/political-party/` | CIV-2 | Complete foundation |
| Elections & Campaigns | `src/modules/elections/` | CIV-3 | Complete foundation |
| Volunteer Management | `src/modules/volunteers/` | CIV-3 Phase 3 | Complete foundation |
| Core Infrastructure | `src/core/` | Part 9 | Active |
| Worker Entry Point | `src/worker.ts` | Part 2 | Active |
| Frontend Components | `src/components/` | Part 10 | Active |
| i18n Layer | `src/i18n/` | Part 9.3 | Active (EN/YO/IG/HA) |
| Service Worker | `public/sw.js` | Part 9 | Active |

### 1.3 Core Infrastructure Layer

**`src/core/db/schema.ts`**  
The single source of truth for all database structures. Contains:
- SQL migration strings for CIV-1, CIV-2, and CIV-3
- TypeScript interfaces for all entities
- Enums for status fields, types, and classifications
- Complete tenant isolation (`tenantId` on every row)
- Soft delete pattern (`deletedAt` nullable timestamp)
- Financial precision via kobo integers (no floats)

**`src/core/db/queries.ts`**  
Type-safe query helpers enforcing tenant isolation. Functions include: organization lookup, member CRUD, donation recording, pledge management, event and attendance tracking, dashboard aggregation, party member management, dues tracking. All functions accept an injected `D1Database` — never instantiated directly.

**`src/core/event-bus/index.ts`**  
Centralized event system implementing Event-Driven Architecture. Publishes named events (`civic.member.registered`, `party.dues.paid`, `election.vote_cast`, etc.) to the CORE-2 platform integration layer. Prevents direct inter-module database access. Events carry `tenantId`, `organizationId`, and event-specific payload.

**`src/core/sync/client.ts`**  
Universal Offline Sync Engine (CORE-1 pattern). Uses IndexedDB via Dexie with a Mutation Queue. Captures all writes locally, replays them via `POST /api/civic/sync` when online. The Service Worker (`public/sw.js`) listens for the `civic-sync` background sync tag to trigger processing. Retry policy: up to 5 attempts per mutation.

**`src/core/rbac.ts`**  
Shared RBAC middleware for the Elections suite. Implements HS256 JWT verification compatible with Cloudflare Workers Web Crypto API. Exposes `electionAuthMiddleware()`, `requireElectionRole()`, `requireAdmin`, and `requireAdminOrManager`. Church/NGO and Political Party modules define their own inline role check patterns but follow the same JWT structure.

**`src/core/logger.ts`**  
Structured JSON logging using `console.debug/info/warn/error` (never `console.log`). Produces log entries with `level`, `message`, `module`, `tenantId`, `timestamp`, and optional `data`. Used consistently across all modules.

### 1.4 Module Architecture

#### CIV-1: Church & NGO
- **API**: Hono router mounted at `/api/civic/*`, 23 endpoints
- **Auth**: JWT middleware on all `/api/civic/*` routes; role checks inline (`admin`, `leader`, `member`, `viewer`)
- **Database**: 9 tables (`civic_organizations`, `civic_departments`, `civic_members`, `civic_donations`, `civic_pledges`, `civic_events`, `civic_attendance`, `civic_grants`, `civic_announcements`)
- **Frontend**: Single React module (`church-ngo/ui.tsx`) with 10+ screens using `useReducer` state machine
- **Offline**: Universal sync engine for member creation, donations, attendance

#### CIV-2: Political Party
- **API**: Hono router mounted at `/api/party/*`, 33 endpoints
- **Auth**: JWT middleware with `admin` and `organizer` roles; inline checks
- **Database**: 8 tables (`party_organizations`, `party_structures`, `party_members`, `party_dues`, `party_positions`, `party_meetings`, `party_announcements`, `party_id_cards`)
- **Frontend**: Single React module (`political-party/ui.tsx`) with 8+ screens
- **Offline**: Dedicated pull/push sync endpoints (`GET /sync/pull`, `POST /sync/push`)

#### CIV-3: Elections & Campaigns
- **API (main)**: Hono router at `/api/elections/*`, 45+ endpoints across 8 groups
- **API (voting)**: Dedicated voting router at `/api/elections/:electionId/voting/*`, 8 endpoints
- **API (volunteers)**: Separate Hono router, 14 endpoints
- **Auth**: Global `electionAuthMiddleware()` from `src/core/rbac.ts`; roles: `admin`, `campaign_manager`, `candidate`, `voter`, `volunteer`
- **Database**: CIV-3 specific tables (`civic_elections`, `civic_candidates`, `civic_votes`, `civic_voting_stations`, `civic_volunteers`, `civic_volunteer_tasks`, `civic_campaign_donations`, `civic_campaign_expenses`, `civic_campaign_materials`, `civic_campaign_announcements`)
- **Frontend**: `ElectionsDashboard.tsx`, `VotingScreen.tsx`, `VolunteerBoard.tsx`, `FundraisingDashboard.tsx`
- **Offline**: Dedicated `offlineDb.ts` (Dexie schema for ballots, sessions, sync queue); `sessionManager.ts` for voter session handling

### 1.5 Integration Points

| Integration | Type | Direction | Implementation |
|-------------|------|-----------|----------------|
| Event Bus (CORE-2) | Platform service | Outbound | `createEventBus()` in each module |
| Sync Engine (CORE-1) | Platform service | Bidirectional | `POST /api/civic/sync` endpoint |
| JWT Auth | Platform service | Inbound | `verifyJWT()` / `verifyElectionJWT()` in each module |
| @webwaka/core | Platform package | Import | Stub in `node_modules/@webwaka/core/` |
| Cloudflare D1 | Infrastructure | Inbound | Injected as `c.env.DB` |
| Cloudflare R2 | Infrastructure | Inbound | Injected as `c.env.STORAGE` |
| Paystack | Payment gateway | Outbound | Referenced in fundraising schema; integration incomplete |

### 1.6 Shared Components and Reuse Opportunities

**Already shared (DRY):**
- `D1Database` interface exported from `src/core/db/queries.ts` — used by all API modules
- `createLogger()` — used uniformly across all modules
- `MIGRATION_SQL` exported from schema — used by migrate endpoints
- `ElectionJWTPayload` type — shared between elections and volunteers via `rbac.ts`
- i18n strings centralized in `src/i18n/`

**Reuse opportunities not yet realized:**
- `verifyJWT()` is duplicated in `church-ngo/api/index.ts` AND `political-party/api/index.ts` — should be consolidated in `src/core/rbac.ts` or a shared `src/core/auth.ts`
- Error response helpers (`apiError()`, `apiSuccess()`) are duplicated across modules — should be in `src/core/response.ts`
- ID card generation logic (referenced in party module) has no implementation — should be a shared platform service
- PDF/receipt generation — needed by church-ngo, political party, and elections — should be a shared platform service

### 1.7 Duplication Risks

| Risk | Location | Severity |
|------|----------|----------|
| `verifyJWT()` reimplemented identically in church-ngo and political-party | `church-ngo/api/index.ts:106`, `political-party/api/index.ts` | Medium |
| `apiSuccess()` / `apiError()` helpers duplicated | Both module entry files | Low |
| Donation schema conceptually duplicates between civic_donations and civic_campaign_donations | schema.ts | Medium |
| Member concept exists in civic_members, party_members, and civic_volunteers separately | schema.ts | Medium — intentional separation but ID reconciliation needed |
| Announcement entity duplicated in church-ngo, political-party, and elections | All three APIs | Low — domain separation appropriate |

### 1.8 Gaps and Missing Functionality (Current State)

**CIV-1 Church & NGO:**
- No department management UI
- No expense/budget tracking
- No PDF export for financial reports or receipts
- No member self-service portal
- No SMS/email automated communications
- No group/cell/fellowship sub-unit management
- No tithe projection / giving trend analytics

**CIV-2 Political Party:**
- No public QR-based ID card verification endpoint
- No ID card image generation (only URL field)
- No bulk member import (CSV/Excel)
- No dues receipt generation
- No candidate nomination workflow integrated with CIV-3
- No inter-module linking (party members → election candidates)

**CIV-3 Elections & Campaigns:**
- Fundraising Paystack integration is schema-only (no webhook handlers)
- No result publication to public portal
- No BVAS-style biometric accreditation integration
- No diaspora/absentee voting workflow
- Voter education content delivery is minimal (no quiz/assessment)
- No notification system for voters (election reminders, result alerts)

---

## 2. Nigeria Civic Market Research Summary

### 2.1 Church & Faith-Based Organization Landscape

Nigeria has the highest church attendance rate in Africa and one of the highest globally. Key facts:
- Estimated **85,000+ registered churches** (CAC, CAN data)
- Pentecostal denominations dominate: RCCG, Winners' Chapel (LCI), MFM, DCLM, CAC, COZA, Daystar
- Each major denomination operates thousands of branches with multi-level hierarchies (HQ → Province → Zone → Area → Parish → Cell Group)
- **Islamic organizations** are equally significant: JNI (Jama'atu Nasril Islam), NASFAT, ACN
- Churches serve as social infrastructure — healthcare clinics, schools, welfare programs
- **Typical operational pain points:**
  - Manual ledger-based tithe/offering tracking
  - No reconciliation between paper envelopes and bank records
  - Cell group attendance tracked on paper registers
  - No member database; records scattered across departments
  - Manual WhatsApp broadcast lists for communication
  - Giving records not available for FIRS compliance

**Product implications:**
- Members expect mobile-first interfaces (Android dominant, iOS secondary)
- Pastors and admins need offline functionality for rural branches
- Financial reporting must accommodate Nigerian tax exemptions for religious organizations
- Group hierarchy (HQ → Cell) must be navigable and actionable
- NDPR compliance is both legal requirement and trust signal
- WhatsApp integration is not optional — it is the primary communication channel

### 2.2 NGO & Civil Society Organization Landscape

- **~55,000 registered NGOs** in Nigeria (CAC + SCUML)
- Regulated by: CAC (incorporation), SCUML (anti-money laundering compliance), COSO (oversight committee, though contested)
- Funding primarily from international donors (USAID, EU, Ford Foundation, Gates Foundation)
- **Operational pain points:**
  - Donor reporting requirements are extremely granular (per-expenditure tracking)
  - Multiple fund/project accounting needed (each donor grant is separate)
  - Staff/volunteer distinction for NDPR and labor law compliance
  - Annual reports to CAC
  - SCUML compliance requires transaction records

**Product implications:**
- Project-based fund tracking (not just general donations)
- Donor portal for international funders to view grant utilization
- Compliance-ready reporting (SCUML transaction logs, CAC annual returns)
- Multi-currency support (grants often come in USD/EUR, disbursed in NGN)
- Beneficiary data collection with NDPR consent workflows

### 2.3 Political Party Administration

- Nigeria has **18 registered political parties** under INEC supervision
- Dominant parties: APC (ruling 2015–present), PDP (former ruling 1999–2015), Labour Party, NNPP, APGA, SDP
- Each party operates a hierarchy: National → State → Senatorial → Federal Constituency → LGA → Ward (matching INEC structure)
- Party membership is formalized: membership register submitted to INEC
- **Internal elections (primaries)** are regulated by Electoral Act 2022 and monitored by INEC
- Membership dues: typically ₦100–₦1,000/year depending on party
- **Party administration pain points:**
  - No digital membership register at most parties
  - Dues collected informally via ward executives
  - No party-issued digital ID cards
  - Meeting minutes rarely recorded formally
  - Candidate vetting data (criminal records, academic) not digitized
  - Campaign finance not tracked against INEC limits

**Product implications:**
- Digital membership register must be INEC-submittable (CSV/Excel export)
- QR-coded membership cards for event access and verification
- Candidate vetting checklist workflow
- Campaign finance tracking against Electoral Act 2022 spending limits
- Dues collection via Paystack (USSD bank transfer is most common)
- Grassroots mobilization tools (ward agents, parallel reporting)

### 2.4 Elections and Campaign Operations

- Presidential, Governorship, Senate, House of Reps, State Assembly, and LGA elections
- INEC oversees federal and state elections; SIEC (State Independent Electoral Commission) oversees LGA
- Voter registration (PVC): ~93 million registered voters as of 2023
- **BVAS** (Bimodal Voter Accreditation System): fingerprint + facial recognition, deployed since 2021
- **IReV** (INEC Result Viewing Portal): real-time upload of polling unit results since 2023
- Campaign season typically 90–120 days before election day
- **Campaign realities:**
  - Field agents (party agents, INEC ad-hoc staff) work in low-connectivity rural areas
  - Real-time result collation from 176,000+ polling units is the biggest operational challenge
  - Vote-buying remains widespread — civic tech can help with transparency
  - Women and youth candidates face structural barriers to nomination

**Product implications:**
- Offline-capable field agent apps for polling unit result entry
- Multi-level result collation (Polling Unit → Ward → LGA → State → National)
- Real-time chart-based results display
- Integration with IReV data for result verification
- Campaign finance transparency dashboard (public-facing)
- Candidate background check workflow

### 2.5 Volunteer Coordination

- Nigerian political parties rely heavily on grassroots volunteers
- Major volunteer programs: INEC "Friends of INEC", YVA (Youth Voter Advocates), YIAGA Africa's "Not Too Young to Run" campaign
- Volunteer roles: polling agents, collation officers, campaign canvassers, social media volunteers, logistics
- **Volunteer pain points:**
  - No centralized tracking; volunteers managed via WhatsApp groups
  - No compensation or points system for campaign volunteers
  - Geographic assignments not systematically tracked
  - No skills-based matching

**Product implications:**
- WhatsApp-first volunteer onboarding (USSD fallback for low-end devices)
- Geolocation-based task assignment to volunteers closest to their ward
- Points/gamification system (already partially implemented in CIV-3)
- Certified training completion tracking for INEC-standard volunteers

### 2.6 Fundraising and Donor Engagement

- Campaign finance in Nigeria is primarily informal (cash-based)
- Electoral Act 2022 spending limits: Presidential ₦5B, Governorship ₦1B, Senate ₦100M, House ₦70M, State Assembly ₦30M
- Church fundraising: tithes, offerings, building fund drives, welfare fund, love gifts
- NGO fundraising: grants, individual donors, corporate CSR
- Payment rails used: **Paystack** (preferred for NGO/civic), **Flutterwave**, bank transfers, USSD (*737#, *737#, etc.)
- Mobile money penetration increasing but M-Pesa-style dominance not yet achieved
- Remittances from diaspora are significant funding source for both churches and campaign financing

**Product implications:**
- Paystack integration is table-stakes (already referenced in schema)
- USSD-based donation collection for feature phone users
- Bank transfer reconciliation (account number matching)
- Diaspora donation workflow with FX conversion (USD/GBP → NGN)
- Automated tithe receipts (WhatsApp, email, SMS)
- FIRS-compliant donation receipts for tax purposes

### 2.7 Voter Education and Civic Participation

- Nigeria's voter turnout has declined: 44% (2015) → 35% (2019) → 27% (2023)
- Primary reasons: voter apathy, distrust, distance from polling units, inadequate information
- **Key civil society actors:** INEC, YIAGA Africa, Transition Monitoring Group (TMG), CDD-West Africa, Enough is Enough Nigeria
- Youth voters (18–35) are the largest demographic but have lowest turnout
- Women face voter intimidation, especially in northern states
- **Civic education channels in Nigeria:**
  - INEC accreditation workshops
  - Radio (especially for rural areas — Hausa/Fulani vernacular broadcasts)
  - SMS campaigns
  - WhatsApp
  - Community town halls
  - Church and mosque announcements

**Product implications:**
- Bite-sized civic education content (quiz format, sharable)
- Multilingual content (Hausa especially critical for northern Nigeria)
- USSD civic information service (no smartphone required)
- WhatsApp chatbot for voter question-answering
- Polling unit locator (using INEC registration data)
- Election day timeline countdown with push notifications

---

## 3. Top 20 Church & NGO Enhancements

### E01 — Department & Cell Group Management
**Priority:** Critical  
**Why it matters:** Nigerian churches operate in multi-level structures (Departments → Zones → Cell Groups → Families). Without this, the platform cannot model real church operations.  
**Problem solved:** Currently, the schema has `civic_departments` but no API or UI to create, manage, or assign members to sub-units. Cell group leadership tracking is also absent.  
**Implementation approach:** Add department CRUD endpoints, cell group table (`civic_cell_groups`), member-to-cell-group assignment, and a cell group leader role. Add a "Cell Groups" page to the church-ngo UI.  
**Reuse/integration notes:** Uses existing `tenantId` pattern. Emits `civic.cell_group.member_assigned` event.  
**Dependencies:** Existing `civic_departments` schema, member endpoints.

---

### E02 — Expense & Budget Tracking
**Priority:** Critical  
**Why it matters:** Churches and NGOs must account for both income AND spending. No expense module exists. Without it, financial stewardship reporting (annual general meetings, donor reports, FIRS) is incomplete.  
**Problem solved:** Admins currently have no way to record petty cash disbursements, salary payments, project costs, or utility bills.  
**Implementation approach:** New `civic_expenses` table (amount in kobo, category, approved_by, receipt_url); API endpoints for create/list/approve; frontend Expenses page under financials; integrate with grant tracking so grant disbursements auto-create expense records.  
**Reuse/integration notes:** Mirrors campaign expense model already in CIV-3. Reuse the schema pattern. Emits `civic.expense.recorded` event.  
**Dependencies:** R2 for receipt image uploads.

---

### E03 — WhatsApp Notification Integration
**Priority:** Critical  
**Why it matters:** WhatsApp is the primary communication channel for Nigerian churches and NGOs. Bulk announcements, donation receipts, and event reminders must reach members there — not just inside the app.  
**Problem solved:** Currently, no notification system exists. Leaders must manually broadcast to WhatsApp groups.  
**Implementation approach:** Integrate via WhatsApp Business API (Meta) or a third-party (Twilio, Termii) abstracted behind a shared platform notification service. Trigger on key events: new announcement, donation receipt, event reminder 24 hours before, pledge due. Store WhatsApp opt-in consent under NDPR.  
**Reuse/integration notes:** This should be a **shared platform notification service** (not built here). Civic subscribes to `civic.notification.requested` and the platform sends. Do not build notification infrastructure in this repo.  
**Dependencies:** Platform notification service (CORE-X), NDPR consent field on member profile.

---

### E04 — Automated Donation Receipt Generation
**Priority:** High  
**Why it matters:** Nigerian tax law (FIRS) and church accountability require formal receipts. Members also expect professional receipts for their giving records.  
**Problem solved:** The system records donations but produces no receipt document. Manual paper receipts are error-prone and untraceable.  
**Implementation approach:** On donation creation, generate a PDF receipt via a shared platform PDF service. Receipt includes: church logo, member name, amount in NGN, donation type, date, reference number, digital signature. Deliver via WhatsApp/email using notification service.  
**Reuse/integration notes:** PDF generation should be a **shared platform service** (not built in this repo). Use `civic.donation.recorded` event to trigger receipt generation.  
**Dependencies:** Notification service (E03), PDF platform service.

---

### E05 — Member Self-Service Portal
**Priority:** High  
**Why it matters:** Members currently cannot view their own giving history, pledge status, or update their profile. This creates unnecessary admin burden and reduces member engagement.  
**Problem solved:** All member data management requires admin/leader access. Members have no autonomy.  
**Implementation approach:** Implement a `member` role login flow that shows a personal dashboard: total giving this year, active pledges, upcoming events, group membership. Allow profile updates (phone, address) that generate an admin approval request rather than direct database writes.  
**Reuse/integration notes:** Reuses existing member API with role filtering. Frontend addition to church-ngo UI.  
**Dependencies:** Separate JWT flow for member self-login, existing RBAC.

---

### E06 — Multi-Fund / Project Accounting
**Priority:** High  
**Why it matters:** NGOs receive multiple grants from different donors for specific projects. Each must be accounted for separately. Currently, all donations go into a single pool.  
**Problem solved:** NGO program officers have no way to track grant funds separately, report per-project financials, or prevent cross-fund spending.  
**Implementation approach:** Add `civic_projects` table (project name, donor, budget, start/end dates, status). Link donations and expenses to projects. Add project financial summary endpoint. Build project selection to donation/expense creation forms.  
**Reuse/integration notes:** Extends existing donation/expense tables with optional `projectId` foreign key. Emits `civic.project.budget_exceeded` event for alerts.  
**Dependencies:** E02 (expense tracking).

---

### E07 — Tithe & Offering Analytics Dashboard
**Priority:** High  
**Why it matters:** Pastors and finance committee members need trend visibility — is giving up or down vs. last year? Which departments give most? What are monthly patterns?  
**Problem solved:** Currently only a flat list and a basic summary endpoint. No trend charts, department breakdown, or year-over-year comparison.  
**Implementation approach:** New analytics endpoints: monthly trend (12 months), department breakdown, top-givers anonymized tier (not individual names), year-over-year comparison, forecast based on pledge pipeline. Add charts to the frontend dashboard.  
**Reuse/integration notes:** Built in this repo using existing D1 queries. Aggregation queries only — no new data.  
**Dependencies:** Existing donation/pledge data.

---

### E08 — NDPR Consent Management & Audit Trail
**Priority:** High  
**Why it matters:** The Nigeria Data Protection Regulation (NDPR) 2019 requires organizations processing personal data to maintain consent records and provide a way for data subjects to withdraw consent or request deletion.  
**Problem solved:** Consent is currently recorded as a boolean at member creation. There is no audit trail, no withdrawal workflow, and no data subject request handling.  
**Implementation approach:** Expand consent to include timestamp, consent version, and specific data processing categories. Add consent audit log table. Implement data subject request endpoint (right to erasure activates soft delete cascade). Generate NDPR compliance report.  
**Reuse/integration notes:** Should eventually be a **shared platform compliance service**. Build locally first, then extract.  
**Dependencies:** Existing `ndprConsent` field.

---

### E09 — Event & Service Streaming / Recording Tracker
**Priority:** Medium  
**Why it matters:** Post-COVID, Nigerian churches have hybrid services. Admins need to track online attendance, manage access codes for live streams, and log viewing numbers alongside physical attendance.  
**Problem solved:** The events system only tracks physical attendance. Online participation is invisible.  
**Implementation approach:** Add `attendanceMode` field (`physical | online | hybrid`) to events. Add online attendance endpoint accepting streaming platform webhook (YouTube Live, Facebook Live view count). Track virtual registrations with distinct UUIDs. Store stream link securely on event object.  
**Reuse/integration notes:** Built in this repo. YouTube/Facebook webhook integration is optional phase 2.  
**Dependencies:** Existing event/attendance tables.

---

### E10 — Welfare / Benevolence Case Management
**Priority:** Medium  
**Why it matters:** Church welfare departments manage aid requests — funeral support, hospital bills, school fees assistance. This workflow is currently entirely manual (WhatsApp + Excel).  
**Problem solved:** No workflow for receiving, reviewing, approving, and disbursing welfare requests.  
**Implementation approach:** New `civic_welfare_cases` table (requestor, type, amount, status, approver, documents). Frontend workflow for member to submit request, leader to review, admin to approve and disburse. Link disbursements to the expense module.  
**Reuse/integration notes:** Emits `civic.welfare.disbursed` event. Links to E02 (expenses).  
**Dependencies:** E02, member portal (E05).

---

### E11 — Pastoral Visit & Follow-Up Scheduling
**Priority:** Medium  
**Why it matters:** Nigerian Pentecostal churches prioritize member follow-up (hospital visits, home visits, new convert care). No digital tool tracks this.  
**Problem solved:** Pastoral care assignments fall through the cracks. New members are not followed up on.  
**Implementation approach:** `civic_pastoral_visits` table. Assign visits to leaders/ministers. Track scheduled date, completed date, outcome (prayer, counseling, referral), notes. Dashboard showing overdue visits and upcoming schedule.  
**Reuse/integration notes:** Built in this repo. Triggers notification to assigned pastor (via E03).  
**Dependencies:** E03 (notifications).

---

### E12 — Volunteer Ministry Sign-Up
**Priority:** Medium  
**Why it matters:** Nigerian churches have formal ministry departments (Ushers, Choir, Technical, Evangelism, etc.). Members volunteer for specific ministries. No tracking exists.  
**Problem solved:** Ministry coordinators manage rosters via paper and WhatsApp.  
**Implementation approach:** Reuse the CIV-3 volunteer system concepts (tasks, assignments) but scoped to church ministry context. Allow members to sign up for ministries, track rosters, schedule assignment rotation (Sunday usher rota).  
**Reuse/integration notes:** **Build once, use everywhere** — extend the volunteer module concepts from CIV-3 into CIV-1. Do not rebuild from scratch.  
**Dependencies:** CIV-3 volunteer module, member portal (E05).

---

### E13 — Bulk Member Import (CSV/Excel)
**Priority:** Medium  
**Why it matters:** Migrating from paper/Excel-based registers is a critical adoption step. Without bulk import, onboarding a 500-member church means 500 manual entries.  
**Problem solved:** No import pathway exists. New clients cannot migrate their existing data.  
**Implementation approach:** Worker endpoint accepting CSV upload (R2 staging), validation pipeline (NDPR consent check, duplicate detection by phone/email), staged import with error report. Frontend upload UI with preview and validation feedback.  
**Reuse/integration notes:** R2 for file staging. Should be a shared platform bulk-import service eventually.  
**Dependencies:** R2 binding.

---

### E14 — Annual Report Generation
**Priority:** Medium  
**Why it matters:** NGOs are legally required to file annual reports with CAC. Churches hold Annual General Meetings (AGMs) requiring financial reports. No report exists in the platform.  
**Problem solved:** Finance secretaries spend weeks compiling data from multiple sources manually.  
**Implementation approach:** Automated annual report endpoint: total income, expense breakdown, member growth, event count, welfare disbursements, grant summary. Generate as PDF via platform PDF service. Branded with organization logo and colors.  
**Reuse/integration notes:** Use platform PDF service (E04). Data from existing endpoints.  
**Dependencies:** E02 (expenses), E04 (PDF service), E06 (project accounting).

---

### E15 — Children's Ministry & Sunday School Tracker
**Priority:** Medium  
**Why it matters:** Nigerian churches have large youth and children's programs. Child safeguarding requires documented attendance and parental consent.  
**Problem solved:** Children are registered and tracked separately from adult members, but no system exists for this demographic.  
**Implementation approach:** Sub-member model: `civic_children` table linked to parent member. Age groups (Nursery, Primary, Teens). Attendance tracking with parental consent. Safeguarding flag for worker clearance status.  
**Reuse/integration notes:** Extends member model. NDPR compliance required for children's data.  
**Dependencies:** Existing member schema.

---

### E16 — CAC / INEC / SCUML Compliance Pack
**Priority:** Medium  
**Why it matters:** Nigerian NGOs must file with CAC annually, comply with SCUML (anti-money laundering), and maintain records accessible to regulatory auditors.  
**Problem solved:** No compliance reporting capability; organizations are exposed to regulatory risk.  
**Implementation approach:** Compliance report module: members list (for CAC annual return), transaction log (for SCUML), consent register (for NDPR audits). Export as formatted PDF or CSV.  
**Reuse/integration notes:** Data-only feature; no new tables needed. Platform PDF service for export.  
**Dependencies:** E08 (NDPR), E14 (annual report).

---

### E17 — Multiple Service / Campus Management
**Priority:** Low-Medium  
**Why it matters:** Large Nigerian churches (RCCG, Winners) run multiple services per Sunday and have satellite campuses. The current single-organization model cannot represent this.  
**Problem solved:** A church with 5,000 members split across 3 campuses and 3 service times cannot use a single tenant account effectively.  
**Implementation approach:** Add `civic_campuses` and `civic_service_times` tables. Members assigned to a campus and default service. Attendance tracked per campus/service. Financial reporting aggregated across campuses.  
**Reuse/integration notes:** Extend multi-tenancy model. Each campus could be a sub-tenant or a tag on the existing tenant.  
**Dependencies:** Significant schema changes; architectural decision needed.

---

### E18 — Tithe Projection & Pledge Pipeline Forecasting
**Priority:** Low-Medium  
**Why it matters:** Church finance committees plan annual budgets based on expected giving. Without a forecast tool, budgets are guesswork.  
**Problem solved:** No way to project future income from active pledges and historical giving trends.  
**Implementation approach:** Forecast algorithm: project forward 12 months using (a) active pledge scheduled payments + (b) historical giving average per member x membership count. Display as bar chart with confidence intervals.  
**Reuse/integration notes:** Analytics endpoint built in this repo. No new data required.  
**Dependencies:** Pledge and donation history.

---

### E19 — QR Code Check-In for Events
**Priority:** Low-Medium  
**Why it matters:** Physical event attendance tracking is currently manual (name-calling or sign-in sheets). QR codes enable fast, accurate digital check-in.  
**Problem solved:** Leaders spend 15–20 minutes doing manual attendance at services.  
**Implementation approach:** Generate unique QR code per member (encoded with member ID and tenant). Event check-in screen allows scanner to validate QR and log attendance in real time. Works offline (local validation, sync later).  
**Reuse/integration notes:** QR generation can be done client-side. Integrates with offline sync engine.  
**Dependencies:** Member identity system, sync engine.

---

### E20 — Multi-Currency & Diaspora Giving Support
**Priority:** Low-Medium  
**Why it matters:** Nigerian diaspora communities (UK, US, Canada) give regularly to their home churches. Currently, only NGN is supported.  
**Problem solved:** Diaspora donations are either excluded or require manual FX conversion.  
**Implementation approach:** Allow donations to be recorded in GBP/USD/CAD with automatic FX conversion to NGN at time of recording (via CBN/open exchange rate API). Display both original currency and NGN equivalent. Tag diaspora donations for separate reporting.  
**Reuse/integration notes:** FX rate service should be a shared platform utility.  
**Dependencies:** Platform FX utility, donation recording.

---

## 4. Top 20 Political Party Enhancements

### P01 — Digital Member ID Card Generation (PDF/PNG)
**Priority:** Critical  
**Why it matters:** The API records `cardImageUrl` but has no implementation to generate the card. Physical card production requires a digital template. INEC requirements for party membership cards are specific.  
**Problem solved:** Party officials currently print cards manually using desktop publishing tools with no traceability.  
**Implementation approach:** Shared platform service generates card from template (member photo, name, ID number, party logo, QR code, valid year). Returns PNG via R2. Worker triggers generation on `party.id_card.issued` event. Frontend displays card for download/share.  
**Reuse/integration notes:** Use shared platform ID card/document generation service. Do not build in this repo.  
**Dependencies:** Platform document service, R2 for photo storage.

---

### P02 — QR Code Membership Verification (Public Endpoint)
**Priority:** Critical  
**Why it matters:** A party agent presenting a membership card at an event or polling unit has no way to verify authenticity without calling headquarters. Public QR verification solves this.  
**Problem solved:** Fake membership cards circulate freely with no verification mechanism.  
**Implementation approach:** Public `GET /api/party/verify/:cardId` endpoint (no auth required). Returns member name, membership status, card valid dates, and photo thumbnail. Encode card ID in QR at generation (P01). Rate-limit to prevent data harvesting.  
**Reuse/integration notes:** Built in this repo. Reuses existing card and member data.  
**Dependencies:** P01 (card generation).

---

### P03 — INEC Membership Register Export
**Priority:** Critical  
**Why it matters:** INEC requires political parties to submit their membership registers in a specific format for party registration and renewal. No export functionality exists.  
**Problem solved:** Party secretariats spend weeks manually compiling membership lists from scattered ward records.  
**Implementation approach:** Endpoint to export full membership register as CSV/Excel in INEC-specified format (columns: name, state, LGA, ward, voter card number, phone, date registered). Include filterable view by state/LGA/ward. Pagination to handle large exports.  
**Reuse/integration notes:** Built in this repo. Platform file export service for Excel generation.  
**Dependencies:** Existing member data, platform export service.

---

### P04 — Dues Collection via Paystack / USSD
**Priority:** Critical  
**Why it matters:** Most party members are in low-income brackets. They cannot make card payments. USSD-based dues collection (e.g., *737# or *901#) is essential for ward-level collection.  
**Problem solved:** Cash-only dues collection leads to unrecorded payments and financial leakage.  
**Implementation approach:** Integrate Paystack standard payment link (for smartphone users) and generate a USSD payment code (if supported by Paystack/Flutterwave). On successful payment webhook, auto-create a dues record with payment reference.  
**Reuse/integration notes:** Payment integration should be a **shared platform service**. Civic subscribes to payment events. Do not build a bespoke payment module.  
**Dependencies:** Platform payment service (Paystack integration), webhook handlers.

---

### P05 — Candidate Vetting & Nomination Workflow
**Priority:** Critical  
**Why it matters:** Parties conduct internal primaries before INEC-supervised elections. Candidate screening (form submission, clearance, delegate voting) is currently undocumented and inconsistent.  
**Problem solved:** The party module has no linkage to the elections module for internal candidate selection. Party members cannot submit nomination interest, and screening criteria are not enforced.  
**Implementation approach:** Nomination workflow in political-party module: member submits form (INEC form CF001 equivalent), checklist attached (tax clearance, court affidavit, academic certificates). Admin marks each criterion. Approved nominees are exported as candidates to the linked CIV-3 election record.  
**Reuse/integration notes:** Creates bridge between CIV-2 (party) and CIV-3 (elections). This is a cross-module integration, not duplication. Emits `party.candidate.nominated` → consumed by elections module.  
**Dependencies:** CIV-3 elections module, existing CIV-2 member and structure data.

---

### P06 — Campaign Finance Tracker (Electoral Act 2022 Compliance)
**Priority:** High  
**Why it matters:** The Electoral Act 2022 sets hard limits on campaign spending by position. Exceeding limits is an offense. No tracking tool exists.  
**Problem solved:** Campaign managers track expenses manually in Excel with no alerts when approaching INEC spending limits.  
**Implementation approach:** Add `party_campaign_budgets` table per election/candidate. Track expenditures per category (advertising, logistics, personnel, venue) against limits. Dashboard shows percent of limit consumed. Auto-alert when 80% is reached. Export INEC-compatible campaign finance report.  
**Reuse/integration notes:** Extends CIV-3 campaign expense model. Adds INEC compliance layer.  
**Dependencies:** CIV-3 fundraising/expense tracking, party structure for limit lookup by position.

---

### P07 — Ward Agent Field Reporting App
**Priority:** High  
**Why it matters:** On election day, party ward agents (polling agents) submit incident reports and result sheets from the field. Currently done via WhatsApp voice notes — completely unstructured.  
**Problem solved:** No structured real-time reporting from 176,000+ polling units.  
**Implementation approach:** Mobile-optimized form for ward agents: polling unit selection, voter accreditation count, incident report (with photo), result sheet photo upload, result entry (candidate vote counts). Works fully offline. Syncs via background sync on connectivity.  
**Reuse/integration notes:** Extends CIV-3 offline voting/sync capabilities. Ward agents use volunteer role.  
**Dependencies:** CIV-3 volunteer system, offline sync engine, R2 for photo uploads.

---

### P08 — Bulk Member Import (CSV/INEC Voter Register Integration)
**Priority:** High  
**Why it matters:** Parties transitioning to the platform need to import thousands of existing members. Manual entry is impractical.  
**Problem solved:** No import pathway. Legacy data migration is a major barrier to adoption.  
**Implementation approach:** CSV upload endpoint with INEC voter register column mapping (voterCardNumber, state, LGA, ward). Deduplication by voter card number. Import staging table with error report before commit. Support up to 50,000 records per batch.  
**Reuse/integration notes:** Same approach as Church E13. Should be shared platform bulk-import service.  
**Dependencies:** R2 for staging, platform bulk-import service.

---

### P09 — Multi-Level Hierarchy Analytics Dashboard
**Priority:** High  
**Why it matters:** National executives need membership and dues breakdown by state; state executives need it by LGA; LGA executives by ward. Current analytics are flat.  
**Problem solved:** No drill-down analytics. National HQ cannot assess which states are growing or underperforming.  
**Implementation approach:** Analytics endpoint accepting a `structureId` parameter and returning member count, active count, dues collection, and meeting activity for that node and all descendants. Use D1 recursive queries or materialized path for hierarchy traversal.  
**Reuse/integration notes:** Built in this repo. Extends existing structure and stats endpoints.  
**Dependencies:** Existing party structures and member data.

---

### P10 — Meeting Minutes & Resolution Tracker
**Priority:** High  
**Why it matters:** Party governance requires formal documentation of NEC/NWC/State meetings. Minutes are currently in Word documents or WhatsApp.  
**Problem solved:** No structured record of resolutions passed, who voted, or implementation status.  
**Implementation approach:** Add `party_meeting_minutes` table (linked to `party_meetings`): minutes text, attendees, resolutions with assignees and deadlines, ratification status. Frontend editor within meeting detail screen. Export as PDF.  
**Reuse/integration notes:** Built in this repo. Platform PDF service for export.  
**Dependencies:** Existing meetings table.

---

### P11 — Position Vacancy & Succession Planning
**Priority:** Medium  
**Why it matters:** Party positions have fixed terms. Without a system tracking tenure, vacancies go unfilled or are filled without proper succession.  
**Problem solved:** No tracking of position tenure start/end dates or vacancy alerts.  
**Implementation approach:** Add `termStartAt`, `termEndAt` to `party_positions`. Calculate and expose "positions expiring in 30/60/90 days." Admin receives notification when position expires. Succession candidate list per position.  
**Reuse/integration notes:** Notification via platform notification service (E03 equivalent).  
**Dependencies:** Existing positions schema.

---

### P12 — Disciplinary Case Management
**Priority:** Medium  
**Why it matters:** Parties enforce discipline (suspension, expulsion) on errant members. Currently ad hoc and unrecorded.  
**Problem solved:** No structured workflow for issuing show-cause letters, recording hearings, or processing outcomes.  
**Implementation approach:** `party_disciplinary_cases` table: member reference, charge, hearing date, outcome (cleared/suspended/expelled), appeal status. Timeline view in member profile. Suspension status auto-updates member active status.  
**Reuse/integration notes:** Built in this repo. Emits `party.member.suspended` event.  
**Dependencies:** Existing member management.

---

### P13 — Multi-Party Platform Support
**Priority:** Medium  
**Why it matters:** WebWaka serves multiple parties. Some clients may be opposition parties to each other. Complete tenant isolation must be verified.  
**Problem solved:** While `tenantId` isolation exists at the query level, there is no explicit tenant provisioning workflow or inter-party data isolation audit.  
**Implementation approach:** Document and enforce: (a) all queries filter by tenantId, (b) no cross-tenant data in analytics, (c) tenant provisioning workflow for new party onboarding, (d) data deletion workflow when party terminates subscription.  
**Reuse/integration notes:** Architecture review, not a new feature. Platform security audit.  
**Dependencies:** Existing tenantId pattern.

---

### P14 — Manifesto & Policy Repository
**Priority:** Medium  
**Why it matters:** Parties produce manifestos and policy documents that their field agents need offline access to. Currently distributed via WhatsApp PDFs.  
**Problem solved:** No central repository for official party documents.  
**Implementation approach:** `party_documents` table (type: manifesto, policy, circular, press_release; contentUrl → R2). API for upload and list. Frontend document library with offline caching via service worker.  
**Reuse/integration notes:** Reuses CIV-3 campaign materials pattern. R2 for storage.  
**Dependencies:** R2 binding, service worker for caching.

---

### P15 — Party Logo & Branding Management
**Priority:** Medium  
**Why it matters:** Official party branding (logo, colors, party chairman signature) must be applied consistently to ID cards, letters, and reports.  
**Problem solved:** No system for storing or distributing official branding assets.  
**Implementation approach:** Add `logoUrl`, `primaryColor`, `secondaryColor`, `officialSignatureUrl` to `party_organizations`. Admin upload via R2. Applied automatically to ID card generation (P01) and PDF reports.  
**Reuse/integration notes:** Supports P01 (card generation) and P10 (meeting minutes PDF).  
**Dependencies:** R2, P01.

---

### P16 — SMS / WhatsApp Broadcast for Ward Members
**Priority:** Medium  
**Why it matters:** Ward-level mobilization for meetings, rallies, and election day turnout is almost entirely SMS/WhatsApp based.  
**Problem solved:** Admins manually copy phone numbers from the database into WhatsApp/bulk SMS tools.  
**Implementation approach:** Broadcast endpoint: select target (all members, specific state/LGA/ward), compose message, send via platform notification service. Track delivery/open rates if supported. Schedule future broadcasts.  
**Reuse/integration notes:** Integrates with shared platform notification service. Do not build own SMS gateway.  
**Dependencies:** Platform notification service, E03 notification framework.

---

### P17 — Election Result Collation Dashboard
**Priority:** Medium  
**Why it matters:** Real-time result collation from 176,000 polling units is the most critical operation on election day. Currently entirely manual and phone-based.  
**Problem solved:** No structured, real-time result collection from ward agents.  
**Implementation approach:** Two-part: (a) Field Agent form (P07) for result entry per polling unit; (b) Collation dashboard aggregating upward: PU → Ward → LGA → Senatorial → State → National. Live charts, declared vs. expected polling units, trend per candidate.  
**Reuse/integration notes:** Reuses CIV-3 voting results infrastructure. Extends to party-specific collation layer.  
**Dependencies:** P07 (ward agent reporting), CIV-3 results system.

---

### P18 — Voter Mobilization Tracking
**Priority:** Low-Medium  
**Why it matters:** Parties track how many of their members have actually collected their PVCs (Permanent Voter Cards) and are registered to vote.  
**Problem solved:** Large membership numbers mean nothing if most members are not registered voters. No way to track this.  
**Implementation approach:** Add `pvcStatus` (not_collected, collected, confirmed) and `lastVotedYear` to party member profile. Dashboard showing mobilization rate by ward. Field agents update status during canvassing.  
**Reuse/integration notes:** Built in this repo. Links to ward agent operations (P07).  
**Dependencies:** Existing member table.

---

### P19 — Youth Wing & Women's Wing Sub-Module
**Priority:** Low-Medium  
**Why it matters:** All major Nigerian parties have formal Youth and Women's wings with separate registration, events, and leadership.  
**Problem solved:** No way to distinguish or manage auxiliary organizations within the party.  
**Implementation approach:** Add `wingType` field to party structures (main, youth, women, diaspora). Filter endpoints to work within wings. Separate dashboards per wing. Wing-specific leadership positions and meetings.  
**Reuse/integration notes:** Extends existing structure and member models.  
**Dependencies:** Existing structure/member schema.

---

### P20 — Diaspora Chapter Management
**Priority:** Low  
**Why it matters:** All major Nigerian parties have registered diaspora chapters in UK, US, Canada, Europe. These operate differently (no ward structure, different dues, virtual meetings).  
**Problem solved:** The INEC 6-level hierarchy model does not accommodate diaspora chapters.  
**Implementation approach:** Add `country` and `city` fields to `party_structures` for diaspora nodes. Allow structures without Nigerian LGA/Ward parents. Virtual meeting type. Diaspora dues in USD/GBP. FX conversion on collection.  
**Reuse/integration notes:** Extends structure model. Requires FX support (platform utility).  
**Dependencies:** Platform FX utility, existing structure schema.

---

## 5. Top 20 Elections & Campaigns Enhancements

### EL01 — INEC BVAS Integration (Biometric Accreditation Simulation)
**Priority:** Critical  
**Why it matters:** BVAS (Bimodal Voter Accreditation System) is now mandatory at all INEC-supervised elections. Party internal elections could use a simplified version for credibility.  
**Problem solved:** Current voter session management relies on a unique voter ID without biometric verification.  
**Implementation approach:** Phase 1: QR-based voter card scan (mock BVAS using phone camera). Phase 2: Fingerprint API on supported devices (WebAuthn). Store accreditation record with timestamp. Refuse ballot if voter not yet accredited.  
**Reuse/integration notes:** Built in this repo. Extends session manager. WebAuthn is a web standard — no vendor dependency.  
**Dependencies:** `sessionManager.ts`, `offlineDb.ts`.

---

### EL02 — Multi-Level Result Collation (PU → National)
**Priority:** Critical  
**Why it matters:** Current results endpoint gives flat per-candidate totals for a single election. Real elections require multi-level aggregation: Polling Unit results feed Ward totals, which feed LGA totals, which feed State totals.  
**Problem solved:** No hierarchical result structure. Party collation agents have no structured tool to collate upward.  
**Implementation approach:** Add `civic_result_sheets` table (electionId, level, jurisdictionId, candidateId, votes, declaration status). Build collation workflow: ward collation officer enters PU sheets → LGA officer reviews → State officer declares. Dashboard shows percentage of polling units declared.  
**Reuse/integration notes:** Integrates with P17 (party collation dashboard) and political-party structures. Emits `election.results.ward_declared`, `election.results.lga_declared`, etc.  
**Dependencies:** Party structure data (for jurisdiction hierarchy).

---

### EL03 — Public Result Portal (IReV-style)
**Priority:** Critical  
**Why it matters:** INEC's IReV (Result Viewing Portal) transformed election transparency. Organizations using WebWaka for internal elections should have the same transparency tool.  
**Problem solved:** Election results are currently only accessible to authenticated users. No public-facing result display.  
**Implementation approach:** Public (unauthenticated) result endpoint per election (if marked as `public: true` by admin). Results display: per-candidate totals, percentage, charts. Real-time updates via server-sent events or 30-second polling. Embeddable widget for organization website.  
**Reuse/integration notes:** Built in this repo. No auth required for public results.  
**Dependencies:** Existing results endpoints, admin election settings.

---

### EL04 — Candidate Profile & Manifesto Portal
**Priority:** High  
**Why it matters:** Voters need to know who they are voting for. Currently candidates have a `manifestoUrl` field but no structured profile display.  
**Problem solved:** Candidate information is buried in the admin interface. Voters using the VotingScreen see minimal candidate context.  
**Implementation approach:** Public candidate profile page: photo, bio, party, manifesto (PDF viewer), key policy points (structured JSON), social media links, endorsements. Accessible during nomination and voting phases.  
**Reuse/integration notes:** Built in this repo. Extends existing candidate model.  
**Dependencies:** R2 for manifesto PDFs and candidate photos.

---

### EL05 — Absentee / Postal Voting Workflow
**Priority:** High  
**Why it matters:** Nigerian diaspora communities hold elections for their hometown development unions and professional associations. Absentee voting is essential for these use cases.  
**Problem solved:** Current voting requires physical or app-based ballot submission with no provision for pre-submitted ballots.  
**Implementation approach:** Absentee voter registration (email or WhatsApp delivery). Time-limited ballot token sent to registered email/phone. One-time use token authenticates ballot submission. Ballot sealed and submitted; opened only after voting closes.  
**Reuse/integration notes:** Extends session manager and voting router.  
**Dependencies:** Platform notification service, session manager.

---

### EL06 — Observer / Monitoring Accreditation System
**Priority:** High  
**Why it matters:** INEC-supervised and CSO-monitored elections require accredited observers. No observer management system exists.  
**Problem solved:** Observer organizations (like YIAGA Africa, TMG) have no structured way to be accredited, deployed, and report from polling units.  
**Implementation approach:** Observer role added to election roles. Observer accreditation workflow (org application, admin approval, credential issuance). Observer check-in per polling unit. Observer incident report form (structured) with photo upload.  
**Reuse/integration notes:** Extends election roles in `rbac.ts`. Uses volunteer system patterns.  
**Dependencies:** Existing RBAC, R2 for incident photos.

---

### EL07 — Real-Time Notification for Election Events
**Priority:** High  
**Why it matters:** Voters need to know when nominations open/close, when voting starts, and when results are announced. Currently no notification system.  
**Problem solved:** Voters miss election deadlines because they are not notified.  
**Implementation approach:** On each election state transition (`start-nomination`, `start-voting`, `announce-results`), trigger notification to all registered voters for that election. Delivery via WhatsApp, SMS, and push notification. Respect NDPR opt-in.  
**Reuse/integration notes:** Platform notification service. Civic only needs to emit the event; platform delivers it.  
**Dependencies:** Platform notification service, election state transition endpoints.

---

### EL08 — Candidate Endorsement & Support Pledges
**Priority:** Medium  
**Why it matters:** Elections generate significant social energy around endorsements. Tracking who endorses whom is data that organizations want to record formally.  
**Problem solved:** Endorsements happen informally via WhatsApp; no structured record.  
**Implementation approach:** `civic_endorsements` table: endorser (org or individual), candidate, statement, date, public/private flag. Public endorsements shown on candidate profile (EL04). Admin can moderate which endorsements appear publicly.  
**Reuse/integration notes:** Built in this repo. Extends candidate model.  
**Dependencies:** Candidate profile (EL04).

---

### EL09 — Election Dispute Resolution Workflow
**Priority:** Medium  
**Why it matters:** Nigerian elections are frequently disputed. Internal party elections have their own appeal processes. No structured dispute mechanism exists.  
**Problem solved:** Post-election complaints are handled via WhatsApp and informal meetings with no documented process.  
**Implementation approach:** `civic_election_disputes` table (challenger, respondent, grounds, submitted evidence URLs, status: filed/under_review/adjudicated/dismissed). Admin dispute review workflow with notification at each stage.  
**Reuse/integration notes:** Built in this repo. Emits `election.dispute.filed` event.  
**Dependencies:** R2 for evidence uploads, platform notification service.

---

### EL10 — AI-Powered Candidate Matching Quiz
**Priority:** Medium  
**Why it matters:** In large elections with many candidates, voters struggle to identify which candidate aligns with their values. A matching quiz dramatically improves informed voting.  
**Problem solved:** Voters vote based on name recognition or party loyalty rather than issue alignment.  
**Implementation approach:** Candidate manifesto positions coded into structured key/value (economic policy, education, security, etc.). Voter answers quiz questions. Algorithm matches voter to closest candidate. Display results with explanation. Powered by OpenRouter (vendor-neutral AI abstraction per platform convention).  
**Reuse/integration notes:** AI via OpenRouter platform service only. Content structured in candidate profile.  
**Dependencies:** Candidate profile (EL04), platform AI service via OpenRouter.

---

### EL11 — Polling Unit Locator
**Priority:** Medium  
**Why it matters:** Millions of Nigerian voters do not know where their polling unit is. This is a primary cause of voter suppression.  
**Problem solved:** Voters have their PVC but cannot find their assigned polling unit on election day.  
**Implementation approach:** Integrate INEC polling unit database (publicly available). Search by voter name or PVC number. Display polling unit address, ward, distance from current location (with map link). Works offline if data is pre-cached.  
**Reuse/integration notes:** INEC polling unit data is public and can be cached in D1. Built in this repo under voter education.  
**Dependencies:** INEC data integration, geolocation API.

---

### EL12 — Post-Election Result Analytics & Reporting
**Priority:** Medium  
**Why it matters:** After an election, stakeholders want trend analysis, margin of victory, voter turnout rate, and demographic breakdowns.  
**Problem solved:** Only raw vote totals are available post-election. No analytical view.  
**Implementation approach:** Analytics endpoints: turnout rate (voted/eligible), margin per candidate, winning margin over threshold (50%+1, plurality), geographic breakdown by voting station, over-time vote accumulation chart, export as PDF report.  
**Reuse/integration notes:** Built in this repo. Platform PDF service for export.  
**Dependencies:** Existing results and voting station data.

---

### EL13 — Secure Vote Encryption Verification (ZKP-Lite)
**Priority:** Medium  
**Why it matters:** The current system stores `encryptedVote` and `verificationHash` but the encryption and verification logic is minimal. For high-stakes elections, cryptographic proof of vote integrity is required.  
**Problem solved:** Voters have no mathematical proof their vote was counted as cast.  
**Implementation approach:** Implement a Commitment Scheme: voter receives a blinded receipt at casting time. After voting closes, a public verification endpoint confirms that the set of ballots matches the published commitment. Not full ZKP (too computationally expensive), but verifiable commitment.  
**Reuse/integration notes:** Built in this repo. Web Crypto API in Cloudflare Workers is sufficient.  
**Dependencies:** Existing vote casting and verification endpoints.

---

### EL14 — Nomination Form Builder
**Priority:** Medium  
**Why it matters:** Different elections have different nomination requirements. A hardcoded form cannot accommodate this variation.  
**Problem solved:** All nomination forms have the same fields regardless of election type.  
**Implementation approach:** `civic_nomination_form_schemas` table: JSON schema defining form fields per election. Candidates fill this dynamic form. Admin configures fields when creating an election (bio, qualifications, manifesto, additional documents).  
**Reuse/integration notes:** Built in this repo. JSON Schema standard for form definition.  
**Dependencies:** Existing candidate/election model.

---

### EL15 — Election Timeline & Status Dashboard
**Priority:** Low-Medium  
**Why it matters:** Managing multiple concurrent elections is operationally complex. Admins need a bird's-eye view.  
**Problem solved:** The elections list view shows elections but provides no timeline or status progression overview.  
**Implementation approach:** Timeline view of all elections: Gantt-style or kanban with swimlanes (Draft → Nomination → Voting → Results). Alert indicators for elections approaching phase transitions. Quick action buttons for state transitions.  
**Reuse/integration notes:** Frontend addition to ElectionsDashboard.tsx.  
**Dependencies:** Existing elections endpoints.

---

### EL16 — Voting Station Offline Sync with Conflict Resolution
**Priority:** Low-Medium  
**Why it matters:** Voting stations in rural areas may intermittently disconnect. The current offline ballot sync handles basic deduplication but lacks conflict resolution for network splits.  
**Problem solved:** Concurrent offline voting at two stations for the same voter creates ambiguity.  
**Implementation approach:** Strengthen conflict detection in `offlineDb.ts`: implement vector clocks or a last-write-wins with logging approach. Any conflict is flagged for manual admin review with both conflicting records displayed.  
**Reuse/integration notes:** Enhancement to existing `offlineDb.ts` and sync engine.  
**Dependencies:** Existing offline database.

---

### EL17 — Multi-Position Election (Single Ballot)
**Priority:** Low-Medium  
**Why it matters:** Some elections involve voting for multiple positions simultaneously (e.g., Chairman and Secretary on the same day). Currently each election is a single position.  
**Problem solved:** Organizations must create separate elections for simultaneous multi-position races.  
**Implementation approach:** Allow an election to have multiple positions. Voter receives a multi-section ballot. Vote is recorded per position per voter. Results are grouped by position.  
**Reuse/integration notes:** Schema change to elections model.  
**Dependencies:** Election and candidate schema changes.

---

### EL18 — Live Election Results Broadcast (SMS/WhatsApp)
**Priority:** Low-Medium  
**Why it matters:** After results are announced, stakeholders expect immediate broadcast. Currently manual.  
**Problem solved:** Result announcement is a manual process with no automated notification.  
**Implementation approach:** On `announce-results` event, trigger formatted result message to all registered voters: winner's name, vote count, percentage, verification link. Send via platform notification service.  
**Reuse/integration notes:** Platform notification service. Reuses EL07 pattern.  
**Dependencies:** EL07 notification framework, existing results endpoint.

---

### EL19 — Delegate Election System (Indirect Voting)
**Priority:** Low  
**Why it matters:** Nigerian party primaries (governorship, presidential) often use delegate systems where ward delegates elect candidates, not all members directly.  
**Problem solved:** No support for delegate-based elections.  
**Implementation approach:** Add `electionType: "delegate"` to election model. Delegate list (registered members with delegate designation). Only delegates receive ballot tokens. Results weighted by delegate composition if configured.  
**Reuse/integration notes:** Extension of election model and voting workflow.  
**Dependencies:** Existing election and member systems.

---

### EL20 — Election Audit Report for INEC Submission
**Priority:** Low  
**Why it matters:** INEC monitors party primaries and may request audit trails. A structured report demonstrates compliance.  
**Problem solved:** The system generates audit log entries but no INEC-formatted submission report.  
**Implementation approach:** Endpoint to compile INEC-style audit report for an election: voter accreditation log, ballot cast log, sync events, result declaration timeline. Export as PDF and structured CSV.  
**Reuse/integration notes:** Platform PDF service. Builds on existing audit log infrastructure.  
**Dependencies:** Existing audit log tables, platform PDF service.

---

## 6. Top 20 Volunteer Management Enhancements

### V01 — WhatsApp Onboarding Flow
**Priority:** Critical  
**Why it matters:** Nigerian campaign volunteers primarily communicate and register via WhatsApp. Directing them to a web form creates massive drop-off.  
**Problem solved:** Current volunteer registration requires filling a web form. Most grassroots volunteers will not do this.  
**Implementation approach:** WhatsApp chatbot (via WhatsApp Business API) guides volunteer through registration: name, phone, ward, skills. Completes registration via platform chatbot service. Data flows into `civic_volunteers` table via API.  
**Reuse/integration notes:** Platform chatbot service (not built here). Civic exposes a registration webhook endpoint.  
**Dependencies:** Platform WhatsApp chatbot service, volunteer registration endpoint.

---

### V02 — Geolocation-Based Task Assignment
**Priority:** Critical  
**Why it matters:** Assigning a volunteer in Kano to canvassing tasks in Lagos is operationally useless. Tasks must be matched to volunteers' geographic proximity.  
**Problem solved:** Task assignment is manual with no geographic matching.  
**Implementation approach:** Add `latitude`, `longitude` to volunteer profile (set on registration or via browser geolocation). Add `location.lat`, `location.lng` to tasks. Implement proximity-based task recommendation endpoint: return open tasks within N km of volunteer's location. Frontend shows nearby tasks map.  
**Reuse/integration notes:** Built in this repo. Geolocation via browser navigator.geolocation.  
**Dependencies:** Volunteer and task schema additions.

---

### V03 — Skills-Based Task Matching
**Priority:** High  
**Why it matters:** Tasks like social media management, legal support, or medical services require specific skills. Random assignment wastes specialized volunteers.  
**Problem solved:** Task assignment ignores volunteer skills declared at registration.  
**Implementation approach:** Normalize skills as a structured enum (canvassing, phonebanking, social_media, legal, medical, logistics, data_entry, photography). Match task `requiredSkills` against volunteer `skills` array. Offer tasks to skill-matched volunteers first.  
**Reuse/integration notes:** Built in this repo. Extends existing volunteer and task schema.  
**Dependencies:** Volunteer and task schema updates.

---

### V04 — Availability Calendar & Scheduling
**Priority:** High  
**Why it matters:** Volunteers have day jobs and availability constraints. Assigning tasks without considering availability causes no-shows.  
**Problem solved:** Volunteer availability is stored as an opaque JSON field with no structured calendar interface.  
**Implementation approach:** Structured availability model: days of week + time slots. Calendar view in volunteer board. Task creation allows selecting day/time. System shows available volunteer count for selected slot. Conflict detection (volunteer already assigned at this time).  
**Reuse/integration notes:** Built in this repo. Frontend calendar addition to VolunteerBoard.  
**Dependencies:** Existing task/availability schema.

---

### V05 — Training & Certification Tracking
**Priority:** High  
**Why it matters:** INEC polling agents require specific training. Parties train campaign volunteers. Certified volunteers perform significantly better.  
**Problem solved:** No tracking of which volunteers have completed required training modules.  
**Implementation approach:** `civic_volunteer_certifications` table: volunteer, training module name, completed date, expiry date, issued by. Admin uploads training certificate (R2). Certification status shown on volunteer profile. Some tasks require certification to be eligible.  
**Reuse/integration notes:** Built in this repo. R2 for certificate storage.  
**Dependencies:** Existing volunteer schema.

---

### V06 — Automated Task Reminders
**Priority:** High  
**Why it matters:** Volunteers forget tasks. A reminder 24 hours before and 2 hours before significantly improves show-up rates.  
**Problem solved:** No task reminder system. No-show rate is high.  
**Implementation approach:** Scheduled reminder triggers (via platform cron/notification service): 24h before task start, 2h before task start. Message via WhatsApp/SMS with task details, location, and reporting contact.  
**Reuse/integration notes:** Platform notification + scheduling service. Civic emits scheduling events.  
**Dependencies:** Platform notification service, task start-time data.

---

### V07 — Gamification Level System (Tiers & Seasons)
**Priority:** High  
**Why it matters:** The existing points/badge system is functional but static. Real gamification requires seasons (campaign periods), rank progression, and public acknowledgment.  
**Problem solved:** The current tier system (bronze → platinum) is one-dimensional. No seasonal context, no rank display, no social sharing.  
**Implementation approach:** Campaign seasons (tied to election lifecycle). Seasonal leaderboard resets per campaign. Tier upgrades displayed with animation. Public share card ("I'm a Gold Volunteer for [Candidate Name]!"). Special event badges (Election Day Hero, First Week, Top Ward Agent).  
**Reuse/integration notes:** Enhances existing volunteer module. Frontend additions to VolunteerBoard.  
**Dependencies:** Existing points/tier system.

---

### V08 — Volunteer Hours Verification by Supervisor
**Priority:** Medium  
**Why it matters:** Volunteers can game self-reported hours. Hours claimed for points must be verifiable.  
**Problem solved:** Task completion and hours are self-reported with no supervisor verification.  
**Implementation approach:** Task completion requires supervisor confirmation: volunteer submits completion request; assigned supervisor approves/rejects with notes. Only approved completions count for points and tier advancement.  
**Reuse/integration notes:** Extends existing task completion workflow. New `supervisor_id` field on tasks.  
**Dependencies:** Existing volunteer task schema.

---

### V09 — Volunteer Expense Reimbursement
**Priority:** Medium  
**Why it matters:** Campaign volunteers incur real costs (transport, meals). Reimbursement tracking is currently entirely informal.  
**Problem solved:** Volunteers submit handwritten receipts; disbursements are cash-based with no record.  
**Implementation approach:** `civic_volunteer_expenses` table: volunteer, task, amount_kobo, receipt_url, status (pending/approved/disbursed). Volunteer submits via app (photo receipt). Campaign manager approves. Triggers payment via Paystack.  
**Reuse/integration notes:** Links to campaign expense module (CIV-3). Reuse approval workflow pattern.  
**Dependencies:** CIV-3 expense module, Paystack payment service.

---

### V10 — Volunteer Impact Report (Individual)
**Priority:** Medium  
**Why it matters:** Volunteers are motivated by recognition. A personalized impact report ("You canvassed 47 voters in 12 tasks") drives retention and referrals.  
**Problem solved:** Volunteers have no summary view of their personal contribution.  
**Implementation approach:** Personal impact report endpoint per volunteer: total hours, tasks by type, wards covered, voters contacted estimate, points earned, badges, rank percentile among all volunteers in election. Shareable card image generated via platform document service.  
**Reuse/integration notes:** Data from existing volunteer/task tables. Platform document service for card generation.  
**Dependencies:** Existing volunteer stats endpoint, platform document service.

---

### V11 — Volunteer Team / Squad Management
**Priority:** Medium  
**Why it matters:** Large campaigns organize volunteers into squads with a team leader responsible for their squad's performance.  
**Problem solved:** Volunteers are managed individually with no team structure.  
**Implementation approach:** `civic_volunteer_squads` table: squad name, leader (volunteer), election, members. Squad-level statistics. Task assignment can target a squad (all squad members assigned). Squad leaderboard.  
**Reuse/integration notes:** Built in this repo. Extends volunteer management.  
**Dependencies:** Existing volunteer and task tables.

---

### V12 — Check-In / Check-Out at Polling Units
**Priority:** Medium  
**Why it matters:** On election day, party agents must be deployed to specific polling units. Real-time check-in confirms deployment.  
**Problem solved:** No way to confirm that party agents actually arrived at their assigned polling units.  
**Implementation approach:** QR code or geo-fence based check-in at polling unit (party agent scans a unique QR placed at polling unit or within geo-fence). Check-in timestamp recorded. Dashboard shows which polling units have active party agents.  
**Reuse/integration notes:** Extends check-in pattern from church events (E19). Polling unit data from INEC integration.  
**Dependencies:** Polling unit locator (EL11), geolocation API.

---

### V13 — Volunteer Referral Program
**Priority:** Medium  
**Why it matters:** Peer-to-peer volunteer recruitment is more effective than advertising. A referral system formalizes this.  
**Problem solved:** No mechanism to track which volunteer referred which other volunteer.  
**Implementation approach:** Unique referral link per volunteer (encoded with their ID). New volunteer registrations via the link are attributed to the referrer. Referrer earns bonus points when referred volunteer completes first task.  
**Reuse/integration notes:** Built in this repo. URL generation + attribution tracking.  
**Dependencies:** Volunteer registration endpoint.

---

### V14 — Volunteer NDPR Consent Lifecycle
**Priority:** Medium  
**Why it matters:** Volunteer data (name, phone, location, political affiliation) is sensitive personal data. NDPR requires explicit consent for each processing purpose.  
**Problem solved:** Consent is recorded as a boolean at registration with no granularity for purpose, no withdrawal mechanism, no data subject rights workflow.  
**Implementation approach:** Structured consent at volunteer signup: (a) contact communication, (b) location tracking during tasks, (c) public leaderboard display, (d) post-election impact reporting. Individual consent can be withdrawn. Data deletion workflow for withdrawn consents.  
**Reuse/integration notes:** Extends E08 (NDPR framework). Platform compliance service.  
**Dependencies:** E08 NDPR framework.

---

### V15 — Multi-Election Volunteer Portfolio
**Priority:** Low-Medium  
**Why it matters:** Experienced campaign volunteers work across multiple elections. Their cross-election experience should be tracked as a professional credential.  
**Problem solved:** Currently volunteer records are scoped to a single election with no cross-election view.  
**Implementation approach:** Volunteer profile at tenant level (not election level). Cross-election stats: total elections participated in, total hours across campaigns, total points accumulated. "Veteran Volunteer" tier for cross-election achievement.  
**Reuse/integration notes:** Schema change: volunteer linked to tenant, not just election. Migration needed.  
**Dependencies:** Volunteer schema refactor.

---

### V16 — Post-Campaign Volunteer Satisfaction Survey
**Priority:** Low-Medium  
**Why it matters:** Campaign managers improve future volunteer programs by collecting feedback. No survey tool exists.  
**Problem solved:** No structured mechanism to collect volunteer feedback post-election.  
**Implementation approach:** Auto-send survey to all volunteers after election closes. 5-question NPS-style survey (experience, support, communication, would-return, open comment). Analytics dashboard of results.  
**Reuse/integration notes:** Platform survey/form service. Civic emits `volunteer.survey.requested` event.  
**Dependencies:** Platform notification + survey service.

---

### V17 — Volunteer Legal Briefing Repository
**Priority:** Low  
**Why it matters:** INEC polling agents have legal rights and obligations. Volunteers need easy access to official guidance on what they can/cannot do.  
**Problem solved:** Polling agents often lack awareness of their legal rights (right to view result sheet, challenge accreditation, etc.).  
**Implementation approach:** Document library under voter education: INEC regulations, Electoral Act 2022 extracts, party agent rights guide, incident reporting procedures. Offline cached. Multilingual (EN/YO/IG/HA).  
**Reuse/integration notes:** Reuses CIV-3 campaign materials model. Content managed by admin.  
**Dependencies:** Campaign materials module, i18n layer.

---

### V18 — Volunteer De-Briefing & After-Action Report
**Priority:** Low  
**Why it matters:** Post-election, campaigns run after-action reviews. Structured volunteer de-briefs generate actionable intelligence.  
**Problem solved:** Post-election learning is entirely informal (WhatsApp discussions).  
**Implementation approach:** After election closes, volunteers receive structured de-brief form: incidents observed, voter sentiment, opposition tactics, resource gaps. Responses aggregated into analytics for campaign leadership.  
**Reuse/integration notes:** Platform survey service. Extends V16 pattern.  
**Dependencies:** V16 survey framework.

---

### V19 — NYSC & Youth Corps Volunteer Integration
**Priority:** Low  
**Why it matters:** Nigeria's National Youth Service Corps (NYSC) program produces thousands of civic-minded young graduates annually. INEC uses NYSC corps members as ad hoc staff.  
**Problem solved:** NYSC civic engagement is not connected to any digital volunteer platform.  
**Implementation approach:** NYSC batch designation field on volunteer profile. State code tracking. NYSC coordinator role for managing corps members within a state. Integration with NYSC orientation schedule for availability.  
**Reuse/integration notes:** Built in this repo. Extends volunteer model.  
**Dependencies:** Existing volunteer schema.

---

### V20 — Volunteer Demographic Analytics
**Priority:** Low  
**Why it matters:** Campaign strategy requires understanding volunteer demographics: age, gender, education level, location distribution.  
**Problem solved:** No demographic breakdown of the volunteer base.  
**Implementation approach:** Collect optional demographic data at registration (age group, gender, education, occupation). Dashboard showing distribution charts. Identify demographic gaps (low female participation in a ward, low youth in a region) for targeted recruitment.  
**Reuse/integration notes:** Built in this repo. NDPR consent required for demographic data.  
**Dependencies:** Volunteer registration, NDPR consent framework.

---

## 7. Top 20 Fundraising / Donation Enhancements

### F01 — Paystack Payment Gateway Integration
**Priority:** Critical  
**Why it matters:** The schema references Paystack but no webhook handler or payment link generation exists. This is the single most impactful missing feature for real-world adoption.  
**Problem solved:** No way to accept digital payments. All fundraising is offline (cash/bank transfer).  
**Implementation approach:** Platform payment service handles Paystack integration (initialize transaction, webhook verification, charge event). Civic subscribes: on `payment.success`, auto-create donation/dues record with payment reference. Link `paymentReference` to donation record. Support card, bank transfer, USSD.  
**Reuse/integration notes:** Payment integration must be a **shared platform service**. Civic only consumes events. Do not build Paystack SDK integration in this repo.  
**Dependencies:** Platform payment service (Paystack).

---

### F02 — Donation Campaign Landing Page
**Priority:** Critical  
**Why it matters:** Churches and political campaigns run specific fundraising drives (building fund, campaign for governor, school fees assistance). Each drive needs its own dedicated donation page.  
**Problem solved:** No campaign-specific donation page. All donations go to a general fund.  
**Implementation approach:** `civic_fundraising_campaigns` table: title, goal amount (kobo), description, deadline, share image. Public landing page endpoint (no auth) with: campaign story, progress bar (amount raised vs goal), donate button (Paystack link), donor count (anonymized if preferred). Shareable link for WhatsApp.  
**Reuse/integration notes:** Extends existing donation model. Public endpoint for campaign page. Paystack via platform service (F01).  
**Dependencies:** F01 (Paystack), public endpoint.

---

### F03 — Recurring Donation (Direct Debit / Standing Order)
**Priority:** High  
**Why it matters:** Tithe is monthly; some church donors want automated deductions rather than monthly manual payments. Recurring giving increases total donation volume.  
**Problem solved:** All donations are one-off. No recurring/subscription mechanism.  
**Implementation approach:** Paystack supports recurring billing via subscription plans. Create a subscription for donor. Platform payment service manages subscription billing. On each billing event, auto-create donation record. Frontend toggle: "Set up recurring tithe" on donation form.  
**Reuse/integration notes:** Via platform payment service (F01). Requires Paystack subscription API.  
**Dependencies:** F01 (Paystack), platform payment service.

---

### F04 — USSD Donation Collection (*737# / *901# style)
**Priority:** High  
**Why it matters:** Approximately 40% of Nigerian mobile users do not have smartphones capable of running a PWA. USSD is the only payment channel for this demographic — critical for grassroots church members and ward-level party dues.  
**Problem solved:** The platform excludes the bottom 40% of the mobile market who use feature phones.  
**Implementation approach:** Partner with a USSD gateway (Cellulant, Mettl, or Paystack USSD). User dials a short code → select organization → enter donor reference → confirm amount. Platform processes and creates donation record.  
**Reuse/integration notes:** Platform USSD service. Not built in this repo.  
**Dependencies:** Platform USSD gateway service.

---

### F05 — Diaspora Donation (Multi-Currency with FX Conversion)
**Priority:** High  
**Why it matters:** Nigerian diaspora remittances are one of the largest foreign exchange inflows ($25B+ annually). Churches receive significant portions; political campaigns receive informal foreign contributions.  
**Problem solved:** Only NGN donations are supported. FX donations require manual reconciliation.  
**Implementation approach:** Enable donation form to specify currency (NGN, USD, GBP, CAD, EUR). Use CBN or open exchange rate API to convert to NGN at time of recording. Paystack supports multi-currency. Store both original amount/currency and NGN equivalent. Tag as diaspora donation.  
**Reuse/integration notes:** Platform FX utility for rate lookup. Paystack multi-currency via platform payment service.  
**Dependencies:** F01 (Paystack), platform FX utility.

---

### F06 — Donor Management & CRM
**Priority:** High  
**Why it matters:** Major donors to churches and campaigns expect personalized stewardship. A donor CRM tracks giving history, relationship notes, and communication preferences.  
**Problem solved:** Donors are currently indistinguishable from regular members. No relationship management layer.  
**Implementation approach:** `civic_donors` table (may be same as member with `isDonor: true`). Donor profile: total giving, giving frequency, last gift date, average gift, preferred contact method, notes, stewardship history. Segment donors: major givers (top 10%), regular givers, lapsed givers (>6 months). Campaign staff can add relationship notes.  
**Reuse/integration notes:** Built in this repo. Extends member and donation models.  
**Dependencies:** Existing donation and member data.

---

### F07 — Pledge-to-Payment Reconciliation Dashboard
**Priority:** High  
**Why it matters:** Pledge fulfillment is one of the most operationally complex financial processes for churches. Many pledges go unfulfilled and are never followed up.  
**Problem solved:** The current pledge system tracks pledges and individual payments but has no automated follow-up, aging report, or reconciliation dashboard.  
**Implementation approach:** Dashboard: total pledges made vs. paid (NGN), pledge aging by bucket (30d, 60d, 90d+), top unfulfilled pledges, automated reminder to pledgers approaching due date.  
**Reuse/integration notes:** Built in this repo using existing pledge/payment data. Notification via platform service.  
**Dependencies:** Existing pledge data, platform notification service.

---

### F08 — Donation Tax Receipt (FIRS Compliant)
**Priority:** High  
**Why it matters:** FIRS (Federal Inland Revenue Service) allows tax deductions for donations to registered religious and non-profit organizations. Members need formal receipts.  
**Problem solved:** No tax-compliant receipt generation. FIRS-registered organizations cannot provide the receipt their donors need for tax relief.  
**Implementation approach:** Generate PDF receipt on donation creation: organization RC/registration number, donor name, amount, date, donation type, FIRS-reference statement ("This receipt is issued in accordance with CITA Third Schedule"). Deliver via email/WhatsApp.  
**Reuse/integration notes:** Platform PDF + notification service. One of the highest-priority notification types.  
**Dependencies:** F01 (payment), platform PDF service, platform notification service (E03).

---

### F09 — Anonymous Giving Option
**Priority:** Medium  
**Why it matters:** Some high-profile donors prefer anonymity (e.g., political donors, large church givers who want to avoid social attention). Nigerian cultural norms support anonymous giving.  
**Problem solved:** All donations are linked to a named member.  
**Implementation approach:** Allow donation to be flagged `anonymous: true` by donor at time of giving. Anonymous donations appear as "Anonymous Donor" in reports. Admin-only view of full donor record. Public campaign pages show anonymized totals.  
**Reuse/integration notes:** Simple flag on donation model.  
**Dependencies:** Existing donation schema.

---

### F10 — Fundraising Goal Meter & Public Dashboard
**Priority:** Medium  
**Why it matters:** Publicly visible fundraising progress motivates additional giving ("Only ₦2M to reach our building fund goal"). Nigerian churches and campaigns use visual thermometer charts.  
**Problem solved:** No public-facing fundraising goal display.  
**Implementation approach:** Public endpoint for campaign goal status (campaign title, goal, raised, percentage, donor count, deadline countdown). Embeddable widget for WhatsApp status, Instagram story, organization website.  
**Reuse/integration notes:** Extends F02 (campaign landing page).  
**Dependencies:** F02 (fundraising campaigns).

---

### F11 — Corporate / Organizational Donor Tracking
**Priority:** Medium  
**Why it matters:** Large organizations (businesses, foundations) donate to churches and campaigns under their company name, not as individuals.  
**Problem solved:** All donors are assumed to be individual members. No corporate donor type.  
**Implementation approach:** Add `donorType: "individual" | "organization"` and `companyName`, `companyRC` to donation records. Corporate donations require no member linkage. Separate corporate donor ledger. Corporate donors may be subject to INEC campaign finance disclosures.  
**Reuse/integration notes:** Extension of donation model.  
**Dependencies:** Existing donation schema.

---

### F12 — Budget vs Actual Spending Dashboard
**Priority:** Medium  
**Why it matters:** Campaign managers and church finance committees plan budgets months in advance. A live budget vs. actual view prevents overspending.  
**Problem solved:** No budget planning tool. No variance reporting.  
**Implementation approach:** `civic_budgets` table: financial year, category, budget_amount_kobo, period. Dashboard: budget per category vs. actual spend (from expense records). Variance chart. Alert at 80% and 100% of any budget line.  
**Reuse/integration notes:** Ties into E02/F fundraising expense tracking. Applies to both church and campaign contexts.  
**Dependencies:** E02 (expense tracking), existing donation data.

---

### F13 — Expense Approval Workflow with Cheque/Transfer Generation
**Priority:** Medium  
**Why it matters:** Financial controls require that expenses above a threshold are approved by a second officer before disbursement. No approval workflow exists.  
**Problem solved:** Single-person expense recording creates fraud risk.  
**Implementation approach:** Configurable approval threshold (e.g., expenses above ₦50,000 require admin approval). Pending approval queue. Approver receives notification. On approval, trigger payment (Paystack disbursement) or generate payment instruction document.  
**Reuse/integration notes:** CIV-3 already has `approve` endpoint for campaign expenses. Extend same pattern to CIV-1 (church expenses).  
**Dependencies:** E02 (expenses), F01 (Paystack for disbursement).

---

### F14 — Donation Matching Campaign
**Priority:** Medium  
**Why it matters:** "Match my donation" campaigns (a major donor matches all donations 1:1 up to a cap) dramatically increase giving. Tracking the match requires specific logic.  
**Problem solved:** No concept of donation matching or conditional giving.  
**Implementation approach:** `civic_donation_matching` table: match patron (donor name), match ratio (1:1, 2:1), cap_amount_kobo, campaign reference. For each new donation during match period, auto-create a matching donation. Progress dashboard shows how much of the matching cap remains.  
**Reuse/integration notes:** Builds on F02 (fundraising campaigns).  
**Dependencies:** F02, F01 (Paystack).

---

### F15 — Grant Management for NGOs (Donor Reporting)
**Priority:** Medium  
**Why it matters:** The existing grant module tracks grants but has no donor reporting capability. International donors require detailed utilization reports.  
**Problem solved:** NGOs produce donor reports manually in Word/Excel.  
**Implementation approach:** Link project expenses to a specific grant. Generate grant utilization report: budget vs. spent per project activity, narrative import from admin notes, supporting receipts list. Export as PDF in common donor format (USAID SF-425 style or Ford Foundation template).  
**Reuse/integration notes:** Platform PDF service. Ties to E06 (project accounting) and E02 (expenses).  
**Dependencies:** E06, E02, platform PDF service.

---

### F16 — Crowdfunding for Community Projects
**Priority:** Low-Medium  
**Why it matters:** Community groups (CSOs, town development unions, church building projects) run crowdfunding campaigns targeting specific amounts by a deadline.  
**Problem solved:** No purpose-built crowdfunding capability.  
**Implementation approach:** Campaign with goal, deadline, public story, updates section, tiered rewards (if applicable). Shareable social link. Donor wall (public or anonymous). Auto-close when goal is reached or deadline passes.  
**Reuse/integration notes:** Builds on F02 (campaign landing page). Paystack via platform service.  
**Dependencies:** F02, F01.

---

### F17 — Financial Audit Trail Export
**Priority:** Low-Medium  
**Why it matters:** Financial audits require complete transaction history in a standard format. This must be exportable for external auditors.  
**Problem solved:** No structured financial audit export.  
**Implementation approach:** Export endpoint: all donations, pledges, payments, expenses, and grant disbursements in date range. CSV format with: date, type, amount_kobo, amount_naira, reference, recorded_by, approved_by, category. Tamper-evident hash of export at time of generation.  
**Reuse/integration notes:** Built in this repo using existing query layer.  
**Dependencies:** E02 (expenses), existing donation/pledge data.

---

### F18 — In-App Donation Button (Embeddable Widget)
**Priority:** Low-Medium  
**Why it matters:** Churches and campaigns want to embed a donation button on their website or share on WhatsApp without requiring the donor to download an app.  
**Problem solved:** No embeddable donation experience outside the PWA.  
**Implementation approach:** Single-file embeddable widget (JavaScript + CSS) with organization ID configuration. Loads Paystack popup. Minimal dependencies. Hosted on CDN via Cloudflare.  
**Reuse/integration notes:** Small separate bundle. Paystack via platform service.  
**Dependencies:** F01 (Paystack), F02 (campaign).

---

### F19 — Gift Aid / Covenant Partner Tracking
**Priority:** Low  
**Why it matters:** Many Nigerian churches have formal "Covenant Partner" programs where members commit to regular giving levels. Tracking partner status and benefits is operationally complex.  
**Problem solved:** No structured tier system for regular committed givers.  
**Implementation approach:** `civic_giving_tiers` table: tier name, minimum monthly kobo, benefits (event priority, publications, pastoral access). Auto-assign tier based on rolling 12-month giving average. Display tier badge on member profile. Auto-downgrade if giving drops.  
**Reuse/integration notes:** Built in this repo. Gamification pattern similar to volunteer tiers.  
**Dependencies:** Existing donation data.

---

### F20 — Capital Campaign Pledge Drive
**Priority:** Low  
**Why it matters:** Major capital projects (new church building, party headquarters, campaign bus fleet) require organized multi-year pledge drives with formal commitment cards.  
**Problem solved:** The existing pledge system handles general pledges but not organized capital campaigns with structured pledge drives and commitment periods.  
**Implementation approach:** Capital campaign entity: name, target, multi-year duration, pledge card template. Donors make campaign-specific pledges with installment schedule. Pledge drive dashboard: number of pledgers, total pledged, average pledge, collection rate. Pledge cards exportable as PDFs.  
**Reuse/integration notes:** Extends existing pledge model.  
**Dependencies:** Existing pledge system, F02 (campaigns), platform PDF service.

---

## 8. Top 20 Voter Education / Civic Engagement Enhancements

### CE01 — Multilingual Civic Education Quiz (EN/YO/IG/HA)
**Priority:** Critical  
**Why it matters:** The most effective voter education is interactive. Nigeria's 27% turnout in 2023 is partly attributable to citizens not understanding the voting process. A localized quiz is one of the highest-impact civic tools.  
**Problem solved:** Voter education content is not interactive, not multilingual at scale, and not shareable.  
**Implementation approach:** Question bank covering: how to register, how to vote, understanding the ballot, voter rights, how to report violations. JSON-structured questions with 4 options + correct answer + explanation. Served in user's selected language. Score displayed. Certificate of completion issued. Shareable via WhatsApp.  
**Reuse/integration notes:** Built in this repo. i18n layer already supports 4 languages. Content authored by admin.  
**Dependencies:** Existing i18n infrastructure, platform notification for sharing.

---

### CE02 — INEC Polling Unit Locator (PVC Number Lookup)
**Priority:** Critical  
**Why it matters:** Millions of voters with valid PVCs do not vote because they cannot locate their polling unit. This is confirmed as the #1 logistical barrier by INEC research.  
**Problem solved:** No in-app polling unit locator.  
**Implementation approach:** Integrate INEC voter verification API (publicly documented) or cache INEC polling unit data (available as open data). Voter enters PVC number and date of birth → system returns: polling unit name, address, ward, LGA, state. Map link (Google Maps / Apple Maps). Distance from current location.  
**Reuse/integration notes:** INEC data is public. Caching in D1 is feasible (~8,000 wards, ~176,000 polling units).  
**Dependencies:** INEC open data, geolocation API.

---

### CE03 — Election Calendar & Countdown
**Priority:** High  
**Why it matters:** Nigerian voters often miss PVC collection deadlines, voter registration windows, and election dates because they receive no structured reminders.  
**Problem solved:** No calendar of civic dates in the platform.  
**Implementation approach:** Admin-managed election calendar: key dates (registration deadline, PVC collection, election day, result declaration). Push notification countdown reminders at 30 days, 7 days, 1 day. Display in app as visual timeline with days remaining. All dates shown in local time zone.  
**Reuse/integration notes:** Built in this repo. Platform notification service for reminders.  
**Dependencies:** Platform notification service.

---

### CE04 — Know Your Rights Explainer Module
**Priority:** High  
**Why it matters:** Most Nigerian voters do not know their rights when voting — the right to refuse assistance, the right to a secrecy screen, the right to spoil a ballot, the right to challenge illegal accreditation.  
**Problem solved:** Rights information is scattered across INEC publications in formal legal language.  
**Implementation approach:** Plain-language, illustrated explainer cards (Rights at Registration, Rights on Election Day, How to Report Violations, How to Be a Party Agent). Swipeable card format optimized for mobile. Available offline. Multilingual (all 4 languages).  
**Reuse/integration notes:** Built in this repo as a content module. i18n layer handles translation.  
**Dependencies:** i18n infrastructure, service worker for offline caching.

---

### CE05 — WhatsApp Civic Chatbot
**Priority:** High  
**Why it matters:** 50%+ of Nigerian civic information-seeking happens via WhatsApp. A civic chatbot in WhatsApp reaches users in their preferred channel without requiring app download.  
**Problem solved:** Only app-based access to civic education; excludes majority of population.  
**Implementation approach:** WhatsApp chatbot (via platform chatbot service): responds to "when is election?", "how do I vote?", "where is my polling unit?", "who are the candidates?". Connects to civic database for real-time data. Escalates to human agent if answer not found.  
**Reuse/integration notes:** Platform chatbot/WhatsApp service (not built here). Civic exposes a query API that chatbot calls. Do not build chatbot infrastructure in this repo.  
**Dependencies:** Platform WhatsApp chatbot service, civic query endpoints.

---

### CE06 — Civic Education Content Management System
**Priority:** High  
**Why it matters:** Voter education content must be updated regularly as election rules change. Without a CMS, content updates require code deployments.  
**Problem solved:** All civic education content is hardcoded or in static files; no admin-managed content system.  
**Implementation approach:** `civic_education_content` table: title, body (rich text), contentType (article/quiz/explainer/video), language, tags, published/draft status. Admin CMS for content creation and approval. Content served to app and chatbot (CE05) from same source.  
**Reuse/integration notes:** Built in this repo. Platform rich text editor (if available) for admin interface.  
**Dependencies:** Existing admin auth.

---

### CE07 — Video Education Library (Offline Capable)
**Priority:** High  
**Why it matters:** Video is the most effective civic education format. Showing someone how to vote is far more effective than text instructions.  
**Problem solved:** No video content delivery capability.  
**Implementation approach:** Video content URLs stored in `civic_education_content`. Service worker caches video thumbnails and metadata offline. Full video streamed when online from R2/CDN. Playlist grouped by topic: How to Vote, Know Your Candidate, Understanding Results. Multilingual captioning.  
**Reuse/integration notes:** R2 for video storage. Service worker for caching. Platform CDN for streaming.  
**Dependencies:** R2, CE06 (content management), service worker.

---

### CE08 — Civic Pledge & Commitment Registry
**Priority:** Medium  
**Why it matters:** "I Pledge to Vote" campaigns have been shown to increase turnout by 5–10% in peer-reviewed studies (Gerber & Green). Formal public commitments create accountability.  
**Problem solved:** No tool for organizing civic commitment campaigns.  
**Implementation approach:** Pledge campaign: title, target count, deadline. Users sign the pledge. Public counter shows total pledges. Shareable pledge card for WhatsApp. Reminders sent as election approaches. Post-election survey to pledgers on whether they voted.  
**Reuse/integration notes:** Platform pledge/commitment service (could reuse church pledge model adapted for civic context).  
**Dependencies:** CE03 (election calendar), platform notification.

---

### CE09 — Women & Youth Voter Specific Content Track
**Priority:** Medium  
**Why it matters:** Female voters in Northern Nigeria face specific barriers (spousal permission, distance, intimidation). Youth voters face specific barriers (low PVC collection, unfamiliarity). Targeted content addresses these directly.  
**Problem solved:** Generic civic education does not address specific barriers faced by key demographic groups.  
**Implementation approach:** Content tags: `target: "women" | "youth" | "firsttime" | "diaspora"`. Personalized content track based on user profile (age, gender, location state). Special landing pages for women's voter education in Hausa and Fulfulde. Youth-specific content in urban slang + pidgin English.  
**Reuse/integration notes:** Extends CE06 (CMS). Hausa content already supported in i18n.  
**Dependencies:** CE06 (content), i18n layer.

---

### CE10 — Election Results Comparison & Trend Tool
**Priority:** Medium  
**Why it matters:** Informed citizens compare current election results with historical data. "In 2019, APC won this ward by 2,000 votes" is powerful civic context.  
**Problem solved:** No historical result data or comparison capability.  
**Implementation approach:** Historical result data import (INEC results are publicly available). Comparison view: 2023 vs. 2019 results by ward/LGA. Swing analysis ("This ward swung 15% to Labour Party"). Interactive bar charts. Data powered by public INEC data.  
**Reuse/integration notes:** Historical data imported into D1. Public read-only endpoint.  
**Dependencies:** INEC historical result data, EL12 (result analytics).

---

### CE11 — Civic Issues Tracker (Community Reporting)
**Priority:** Medium  
**Why it matters:** Citizens want to document and track local civic issues (road failure, school funding cuts, water supply). A community reporting tool ties civic education to local reality.  
**Problem solved:** No platform for civic issue reporting and community accountability.  
**Implementation approach:** `civic_issues` table: title, description, category (infrastructure/education/health/security), location (ward/LGA), photo evidence, submitted by (anonymous or named), status (reported/acknowledged/in_progress/resolved). Public-facing issue tracker. Admin moderation. Export to ward rep's dashboard.  
**Reuse/integration notes:** Built in this repo. R2 for photo evidence. Geolocation for issue location.  
**Dependencies:** R2, geolocation.

---

### CE12 — Offline Voter Education Package (PWA Install)
**Priority:** Medium  
**Why it matters:** Many rural voters have limited data and may not have consistent internet. The civic education content must be fully downloadable for offline use.  
**Problem solved:** All civic content requires internet to access. Rural Nigeria has low broadband penetration.  
**Implementation approach:** "Download Voter Guide" button: caches all civic education articles, quiz questions, rights explainers, polling unit data for user's state. Works completely offline thereafter. Service worker manages cache versioning and background updates when online.  
**Reuse/integration notes:** Extends existing service worker offline capabilities.  
**Dependencies:** Service worker, CE04-CE07 content.

---

### CE13 — Representative Accountability Tracker
**Priority:** Medium  
**Why it matters:** Citizens should be able to hold elected representatives accountable between elections. Tracking attendance, bills sponsored, and voting record in the legislature creates civic accountability.  
**Problem solved:** No platform for representative accountability.  
**Implementation approach:** `civic_representatives` table (name, position, constituency, party, term). `civic_accountability_records` (type: attendance/bill/vote/speech; date; summary; source URL). Admin-curated data (or imported from NASS public records). Citizen can follow their local representative.  
**Reuse/integration notes:** Built in this repo as a new sub-module. Data curation is the key challenge.  
**Dependencies:** NASS public data integration (National Assembly), admin content management.

---

### CE14 — Election Day Status Map (Real-Time)
**Priority:** Medium  
**Why it matters:** On election day, citizens want to know: Is my polling unit open? Are there reports of violence? Is voting proceeding? Real-time crowd-sourced status helps.  
**Problem solved:** No real-time election day status visibility.  
**Implementation approach:** Polling unit status map: crowdsourced reports from party agents (P07) and observer organizations. Status per polling unit: open/delayed/closed/violence_reported. Heatmap overlay by ward. Read-only for general public. Writes only for accredited reporters.  
**Reuse/integration notes:** Builds on EL06 (observer system) and P07 (ward agent reporting). Geospatial view.  
**Dependencies:** EL06, P07, geolocation data.

---

### CE15 — SMS-Based Civic Information Service (No Smartphone)
**Priority:** Medium  
**Why it matters:** An estimated 40% of Nigerian voters use feature phones without smartphone/internet access. They cannot use a PWA. SMS-based civic info is essential for inclusive access.  
**Problem solved:** The platform excludes feature phone users (40% of target demographic).  
**Implementation approach:** SMS shortcode or long number (via Termii, Infobip). User sends: "WARD IBADAN" → receives their LGA/ward info. "VOTE DATE" → receives next election date. "CANDIDATE GOVERNOR LAGOS" → receives list of candidates. Powered by platform SMS gateway.  
**Reuse/integration notes:** Platform SMS gateway service. Civic exposes text-based query API.  
**Dependencies:** Platform SMS service, civic query endpoints.

---

### CE16 — Civic Education Certificate Program
**Priority:** Low-Medium  
**Why it matters:** Young Nigerians respond strongly to certificates that demonstrate civic knowledge (useful for CV/LinkedIn). A structured civic certification program drives engagement.  
**Problem solved:** No structured learning path or credential for civic education completion.  
**Implementation approach:** Multi-module certification track: (a) Voter Registration, (b) How to Vote, (c) Electoral Law Basics, (d) Community Leadership. Each module has 5 lessons + quiz. Pass all modules → receive signed certificate (PDF + shareable card). Certificates issued on blockchain or via verifiable credential standard.  
**Reuse/integration notes:** Platform certificate/credential service. Quiz from CE01. Content from CE06.  
**Dependencies:** CE01, CE06, platform document service.

---

### CE17 — Pre-Election Civic Survey / Exit Poll Integration
**Priority:** Low-Medium  
**Why it matters:** Pre-election surveys improve campaign strategy. Exit polls provide immediate result direction and can flag potential manipulation.  
**Problem solved:** No survey tool exists for electoral research.  
**Implementation approach:** Survey creation: questions, response options, target audience (by ward, demographic). Responses anonymous by default. Aggregate analytics: approval ratings, issue priorities, projected winner. Can be deployed as exit poll by accredited organizations.  
**Reuse/integration notes:** Platform survey service. Civic exposes survey response endpoint.  
**Dependencies:** Platform survey service, CE06 (content management).

---

### CE18 — Civic Engagement Score per Citizen
**Priority:** Low  
**Why it matters:** Gamified civic participation (voted in last election, completed civic quiz, attended a town hall, signed a petition, reported an issue) increases engagement.  
**Problem solved:** No way to recognize and incentivize diverse forms of civic participation.  
**Implementation approach:** Civic score per user: points for completing quiz (+10), registering to vote (+20), voting (+50), attending civic event (+15), reporting a civic issue (+5), completing education module (+10). Public leaderboard by ward. Top scorers recognized by civic organizations.  
**Reuse/integration notes:** Reuses CIV-3 volunteer gamification pattern applied to civic context.  
**Dependencies:** CE01, CE08, volunteer gamification system.

---

### CE19 — Community Town Hall Scheduling & Moderation
**Priority:** Low  
**Why it matters:** Town halls (virtual and physical) are critical for deliberative democracy. Organizing them digitally enables broader participation.  
**Problem solved:** Town halls are organized via WhatsApp with no moderation tools, RSVP tracking, or question queue management.  
**Implementation approach:** `civic_town_halls` table: organizer, topic, date, format (physical/virtual), location/meeting_link, RSVP list. Public RSVP. Pre-submitted question queue with upvote function. Live session moderation (mark question answered, add to transcript). Post-session transcript/video archive.  
**Reuse/integration notes:** Built in this repo. Integrates with events model from church-ngo.  
**Dependencies:** Existing events framework, notification service.

---

### CE20 — Inclusive Voting Guide (Sign Language & Accessibility)
**Priority:** Low  
**Why it matters:** Nigeria has an estimated 25–29 million persons with disabilities. INEC has specific accessibility obligations. Civic platforms must be accessible.  
**Problem solved:** No accessibility provisions in the current UI. WCAG compliance is unverified.  
**Implementation approach:** WCAG 2.1 AA audit and compliance fixes. Sign language video explainers (Nigerian Sign Language) embedded in key civic education screens. High-contrast mode toggle. Text-size adjustment. Screen reader compatibility audit (NVDA/JAWS). Voice-to-text for form input.  
**Reuse/integration notes:** Frontend accessibility audit. NSL video content (short videos produced externally, hosted on R2).  
**Dependencies:** Frontend audit, R2 for NSL video content.

---

## 9. Cross-Repo Integration Map

### 9.1 What Should Be Built in This Repo (WebWaka Civic)

| Capability | Rationale |
|------------|-----------|
| All CIV-1, CIV-2, CIV-3 API endpoints | Domain-specific; no value in externalizing |
| RBAC role checks for all civic roles | Civic-specific roles (admin/leader/organizer/campaign_manager/voter/volunteer) |
| Civic-specific database schema and queries | D1 tables scoped to civic domain |
| Election lifecycle management | Entire voting workflow is civic-domain-specific |
| Party structure hierarchy | INEC-specific structure not relevant to other verticals |
| Volunteer gamification and task management | Civic-specific context (campaign tasks, civic engagement points) |
| Civic education content and quiz | Domain-specific |
| i18n for civic domain (YO/IG/HA/EN) | Civic-specific strings; common infrastructure externalized |
| Offline voting database and session manager | Civic-specific (ballot management, voter sessions) |
| INEC compliance report generation | Domain-specific |
| Campaign finance tracking | Civic-domain-specific regulatory context |

### 9.2 What Should Be Integrated from Other Repos

| Capability | Source Repo (Platform) | Integration Method |
|------------|----------------------|-------------------|
| JWT Authentication & Session Management | AUTH / CORE-AUTH | Import `@webwaka/auth` package; verify JWTs issued by central auth service |
| Payment Processing (Paystack/Flutterwave) | PAYMENTS / CORE-PAYMENTS | Subscribe to `payment.success` events; do not build payment SDK here |
| SMS & WhatsApp Notification Delivery | COMMS / CORE-NOTIFICATIONS | Emit `notification.requested` events; platform delivers |
| PDF Document Generation | DOCS / CORE-DOCS | Call platform document service API; do not bundle PDF library in Worker |
| ID Card / Certificate Image Generation | DOCS / CORE-DOCS | Same document service |
| Bulk Import Processing | DATA / CORE-DATA | Upload CSV to R2; trigger platform import pipeline; receive completion event |
| FX Rate Conversion | FINANCE / CORE-FINANCE | Call platform FX utility endpoint |
| WhatsApp Chatbot & USSD Gateway | COMMS / CORE-COMMS | Platform handles; civic exposes query webhook endpoints |
| Event Bus Infrastructure | CORE-2 | `createEventBus()` already integrated; maintain this |
| Universal Sync Engine | CORE-1 | `POST /api/civic/sync` already integrated; maintain this |
| AI/ML Services (quiz generation, matching) | AI / CORE-AI | OpenRouter abstraction only; no direct model calls |

### 9.3 What Should Be Exposed as Shared Platform Capabilities

| Capability | How to Expose | Consumer |
|------------|--------------|----------|
| INEC Polling Unit Data (176,000 PUs) | Read-only D1 dataset exposed via platform data API | All civic verticals; partner orgs |
| Electoral Calendar API | Platform service with webhook for date reminders | Civic; partner NGOs; media |
| Voter Education Content API | Public REST API (no auth) from civic repo | Partner orgs, CSOs, media houses |
| Election Results API (public elections) | Public REST API from civic repo | Media; civil society monitors |
| Civic Score API | Platform-wide civic engagement scoring | All WebWaka products |
| Donation Campaign Page | Embeddable widget (CDN-hosted) | Partner org websites |
| Volunteer Certification Verification | Public `/verify/:certId` endpoint | Partner orgs; INEC; employers |
| Party Member Verification | Public `/verify/party-member/:cardId` endpoint | Event organizers; INEC |

### 9.4 What Should Never Be Duplicated

| Anti-Pattern | Canonical Location | Note |
|--------------|-------------------|------|
| JWT verification logic | Should be in shared `@webwaka/auth` package | Currently duplicated in church-ngo and political-party modules — consolidate |
| `apiSuccess()` / `apiError()` helpers | Should be in `src/core/response.ts` | Currently duplicated in church-ngo and political-party — consolidate |
| SMS/Email delivery code | Platform CORE-COMMS | Never add SMS SDK dependencies to this repo |
| Payment SDK (Paystack/Flutterwave) | Platform CORE-PAYMENTS | Never add Paystack SDK to this repo |
| PDF generation library | Platform CORE-DOCS | Too large for Cloudflare Worker bundle; use remote service |
| Biometric processing | Platform CORE-AUTH | Security-critical; must be centralized |
| AI/ML model calls | OpenRouter via CORE-AI | Vendor-neutral abstraction required by platform convention |

---

## 10. Recommended Execution Order

The sequence below prioritizes: (a) highest user impact, (b) dependency order, (c) revenue-generating features first, (d) platform infrastructure before feature work.

### Phase 0 — Platform Infrastructure (Pre-Feature) [Weeks 1–3]
Unblock all downstream feature work by resolving shared infrastructure gaps.

1. **[INFRA] Consolidate `verifyJWT()` into `src/core/auth.ts`** — Eliminate duplication in church-ngo and political-party. Single test point.
2. **[INFRA] Create `src/core/response.ts`** — Standardize `apiSuccess()` / `apiError()` / `apiJson()` helpers across all modules.
3. **[INFRA] Platform notification service integration** — Connect to CORE-COMMS. Required by E03, V06, EL07, and most fundraising features.
4. **[INFRA] Platform payment service integration** — Connect Paystack via CORE-PAYMENTS. Required by F01 (and 15+ features depend on F01).
5. **[INFRA] Platform PDF service integration** — Required by E04, F08, P10, and 10+ report features.

---

### Phase 1 — Critical Revenue Features [Weeks 4–8]
Directly drives adoption and monetization.

6. **F01 — Paystack Payment Integration** (via platform service)
7. **F02 — Donation Campaign Landing Page**
8. **F03 — Recurring Donation (Tithe Direct Debit)**
9. **P01 — Digital ID Card Generation**
10. **P02 — QR Code Membership Verification**
11. **E02 — Expense & Budget Tracking (Church/NGO)**
12. **P04 — Dues Collection via Paystack / USSD**
13. **F08 — FIRS-Compliant Donation Receipt**

---

### Phase 2 — Core Platform Gaps [Weeks 9–14]
Fill the most critical functional gaps in the three completed modules.

14. **E01 — Department & Cell Group Management**
15. **E03 — WhatsApp Notification Integration**
16. **E13 — Bulk Member Import (CSV)**
17. **P03 — INEC Membership Register Export**
18. **P05 — Candidate Vetting & Nomination Workflow** (CIV-2 → CIV-3 bridge)
19. **P06 — Campaign Finance Tracker (Electoral Act 2022)**
20. **EL02 — Multi-Level Result Collation**
21. **EL03 — Public Result Portal (IReV-style)**

---

### Phase 3 — Voter Education & Civic Engagement [Weeks 15–20]
Builds public-facing platform reach and societal impact.

22. **CE01 — Multilingual Civic Education Quiz**
23. **CE02 — INEC Polling Unit Locator**
24. **CE03 — Election Calendar & Countdown**
25. **CE04 — Know Your Rights Explainer**
26. **CE06 — Civic Education CMS**
27. **CE05 — WhatsApp Civic Chatbot** (via platform chatbot service)

---

### Phase 4 — Volunteer & Campaign Operations [Weeks 21–26]
Enhances the CIV-3 campaign operations capabilities.

28. **V01 — WhatsApp Volunteer Onboarding**
29. **V02 — Geolocation-Based Task Assignment**
30. **V03 — Skills-Based Task Matching**
31. **V04 — Availability Calendar**
32. **V05 — Training & Certification Tracking**
33. **V06 — Automated Task Reminders**
34. **P07 — Ward Agent Field Reporting App**
35. **EL04 — Candidate Profile & Manifesto Portal**
36. **EL07 — Real-Time Notification for Election Events**

---

### Phase 5 — Analytics, Compliance & Governance [Weeks 27–32]
Deepens data intelligence and regulatory positioning.

37. **E08 — NDPR Consent Management & Audit Trail**
38. **E05 — Member Self-Service Portal**
39. **E06 — Multi-Fund / Project Accounting**
40. **E07 — Tithe & Offering Analytics Dashboard**
41. **P09 — Multi-Level Hierarchy Analytics Dashboard**
42. **F06 — Donor Management & CRM**
43. **F07 — Pledge-to-Payment Reconciliation Dashboard**
44. **EL12 — Post-Election Result Analytics**
45. **CE10 — Election Results Comparison Tool**

---

### Phase 6 — Advanced Civic Features [Weeks 33–40]
Sophisticated features for high-value institutional clients.

46. **EL01 — BVAS-style Biometric Accreditation**
47. **EL05 — Absentee / Postal Voting Workflow**
48. **EL06 — Observer Accreditation System**
49. **EL10 — AI Candidate Matching Quiz** (via OpenRouter)
50. **CE13 — Representative Accountability Tracker**
51. **CE14 — Election Day Status Map**
52. **F15 — Grant Management Donor Reporting**
53. **V07 — Gamification Season System**

---

### Phase 7 — Scale & Platform Extraction [Weeks 41–52]
Platform-wide capabilities, multi-repo extraction, and scale features.

54. **E17 — Multi-Campus Management**
55. **P20 — Diaspora Chapter Management**
56. **F05 — Diaspora Donation (Multi-Currency)**
57. **CE16 — Civic Education Certificate Program**
58. **V15 — Multi-Election Volunteer Portfolio**
59. **[EXTRACT] JWT verification → shared `@webwaka/auth` package**
60. **[EXTRACT] Notification triggers → standardized platform event schema**
61. **[EXPOSE] Public Election Results API**
62. **[EXPOSE] Voter Education Content API**
63. **[EXPOSE] INEC Polling Unit Dataset API**

---

## Appendix: Dependency Graph Summary

```
F01 (Paystack) ──────────────► F02, F03, F04, F08, P04, V09, F13, F16, F20
E03 (Notifications) ──────────► E04, V06, EL07, F07, CE03, CE05, CE08, CE17
E02 (Expenses) ───────────────► E14, F12, F13, F15, E10
E01 (Departments) ────────────► E12, E15, E17
P01 (ID Cards) ───────────────► P02
P05 (Nominations) ────────────► EL01, EL04, EL14
EL02 (Result Collation) ──────► EL03, P17, CE10, CE14
CE01 (Civic Quiz) ────────────► CE16, CE18
CE06 (Content CMS) ───────────► CE04, CE07, CE09, CE12, CE17
V05 (Certifications) ─────────► V12, V17
Platform Infra (Phase 0) ─────► ALL PHASES
```

---

*This document reflects the WebWaka Civic codebase state as of March 2026 and the Nigerian civic ecosystem landscape as of the same date. Enhancement priorities should be reviewed quarterly as market conditions, INEC regulations, and Electoral Act interpretations evolve.*
