# CIV-2 Implementation Plan — Political Party Management

**Epic:** CIV-2 — Political Party Management (Hierarchical Structure, Dues)  
**Repository:** WebWakaDOS/webwaka-civic  
**Blueprint Reference:** Part 10.9 — Civic & Political Suite  
**Blueprint Citation:** *"Political Party Management: Hierarchical structure (National → Ward), membership ID cards, dues."*  
**Roadmap Reference:** Section 12 — Civic & Political Suite  
**Dependencies:** CORE-2 (Platform Event Bus)  
**Agent:** worker-alpha  
**Date:** 2026-03-15

---

## 1. Scope (from Blueprint Part 10.9)

> **Political Party Management:** Hierarchical structure (National → Ward), membership ID cards, dues.

### Nigeria-Specific Context

Nigerian political parties operate under a strict constitutional hierarchy defined by INEC (Independent National Electoral Commission):

- **National** — National headquarters (Abuja)
- **State** — 36 states + FCT
- **Senatorial District** — 3 per state (109 total)
- **Federal Constituency** — 360 total
- **Local Government Area (LGA)** — 774 LGAs
- **Ward** — smallest unit (~8,800 wards nationwide)

Key Nigeria-specific requirements:
- **Membership ID cards** — party-issued photo ID with membership number
- **Dues** — annual party dues (stored in kobo, NGN default)
- **INEC compliance** — member registration aligned with INEC voter registration
- **NDPR compliance** — member PII protected under Nigeria Data Protection Regulation
- **WAT timezone** — all timestamps in Africa/Lagos (UTC+1)

---

## 2. Blueprint Compliance — 7 Core Invariants

| Invariant | Implementation Strategy |
|-----------|------------------------|
| **Build Once Use Infinitely** [Part 9.1] | Module isolated under `src/modules/political-party/`. Reuses `src/core/` (event bus, logger, sync, DB interfaces). No code duplication with CIV-1. |
| **Mobile First** [Part 9.1] | Inline styles with `maxWidth: 600px`, `flexWrap: wrap`, `safe-area-inset-bottom`. Bottom navigation bar. Single-column layouts on mobile. |
| **PWA First** [Part 9.1] | Reuses existing `public/manifest.json` and `public/sw.js`. Module registers its own offline cache entries. |
| **Offline First** [Part 9.1] | `PartyOfflineDb` (Dexie) with `mutationQueue`, `members`, `dues` tables. Extends `CivicOfflineDb` pattern from CIV-1. |
| **Nigeria First** [Part 9.1] | NGN/kobo dues, WAT timezone, NDPR consent gate, Nigerian state/LGA/ward hierarchy, INEC-aligned member numbering. |
| **Africa First** [Part 9.1] | Multi-currency dues support (NGN, GHS, KES, ZAR). i18n: en/yo/ig/ha. |
| **Vendor Neutral AI** [Part 9.1] | Zero hardcoded AI vendor references. No direct OpenAI/Anthropic/Gemini calls. |

---

## 3. Architecture Standards Compliance [Part 9.2]

| Standard | Implementation |
|----------|----------------|
| **Multi-Tenancy** | `tenantId` on all 8 tables |
| **Soft Deletes** | `deletedAt` on all 8 tables |
| **Monetary Values** | `duesAmountKobo` as INTEGER (not REAL/FLOAT) |
| **API Response Format** | `{ success: true, data: ... }` / `{ success: false, error: ... }` |
| **Edge JWT Validation** | Reuses `verifyJWT` pattern from CIV-1 API |
| **RBAC** | `admin | organizer | member | viewer` roles |
| **Event-Driven** | All state changes publish to CORE-2 event bus |
| **Zero console.log** | Platform logger (`createLogger`) only |
| **Zero Direct DB Clients** | Injected D1 database via Cloudflare Workers binding |
| **Zero TODOs** | No TODO/FIXME/HACK comments |
| **Conventional Commits** | `feat(civ-2): description [Part X.Y]` format |

---

## 4. Database Schema Plan (8 Tables)

All tables: `tenantId` (multi-tenancy), `deletedAt` (soft deletes), `createdAt`/`updatedAt` (audit trail).

### Table 1: `party_organizations`
The top-level party entity (one per tenant).

| Column | Type | Notes |
|--------|------|-------|
| `id` | TEXT PK | UUID |
| `tenantId` | TEXT | Multi-tenancy |
| `name` | TEXT | e.g., "All Progressives Congress" |
| `abbreviation` | TEXT | e.g., "APC" |
| `motto` | TEXT | Optional |
| `logoUrl` | TEXT | R2 URL |
| `foundedYear` | INTEGER | |
| `inecRegistrationNumber` | TEXT | INEC party reg number |
| `currency` | TEXT | Default "NGN" |
| `timezone` | TEXT | Default "Africa/Lagos" |
| `annualDuesKobo` | INTEGER | Default annual dues in kobo |
| `createdAt` | INTEGER | Unix ms |
| `updatedAt` | INTEGER | Unix ms |
| `deletedAt` | INTEGER | Soft delete |

### Table 2: `party_structures`
Hierarchical unit (National → State → Senatorial → Federal Constituency → LGA → Ward).

| Column | Type | Notes |
|--------|------|-------|
| `id` | TEXT PK | UUID |
| `tenantId` | TEXT | Multi-tenancy |
| `organizationId` | TEXT | FK → party_organizations |
| `parentId` | TEXT | FK → party_structures (NULL for National) |
| `level` | TEXT | national/state/senatorial/federal_constituency/lga/ward |
| `name` | TEXT | e.g., "Lagos State", "Ikeja Ward 3" |
| `code` | TEXT | INEC-aligned code |
| `state` | TEXT | Nigerian state name |
| `lga` | TEXT | LGA name (if applicable) |
| `ward` | TEXT | Ward name (if applicable) |
| `chairpersonId` | TEXT | FK → party_members |
| `secretaryId` | TEXT | FK → party_members |
| `createdAt` | INTEGER | |
| `updatedAt` | INTEGER | |
| `deletedAt` | INTEGER | |

### Table 3: `party_members`
Individual party members.

| Column | Type | Notes |
|--------|------|-------|
| `id` | TEXT PK | UUID |
| `tenantId` | TEXT | Multi-tenancy |
| `organizationId` | TEXT | FK → party_organizations |
| `structureId` | TEXT | FK → party_structures (ward-level) |
| `membershipNumber` | TEXT | Unique party ID (e.g., APC-LAG-0001234) |
| `firstName` | TEXT | |
| `lastName` | TEXT | |
| `middleName` | TEXT | Optional |
| `dateOfBirth` | INTEGER | Unix ms |
| `gender` | TEXT | male/female/other |
| `phone` | TEXT | Nigerian format |
| `email` | TEXT | Optional |
| `address` | TEXT | |
| `state` | TEXT | State of residence |
| `lga` | TEXT | LGA of residence |
| `ward` | TEXT | Ward of residence |
| `voterCardNumber` | TEXT | INEC voter card number |
| `photoUrl` | TEXT | R2 URL for member photo |
| `memberStatus` | TEXT | active/suspended/expelled/deceased/resigned |
| `role` | TEXT | ordinary/delegate/executive/chairman/secretary |
| `joinedDate` | INTEGER | Unix ms |
| `ndprConsent` | INTEGER | 1 = consented, 0 = not |
| `ndprConsentDate` | INTEGER | Unix ms |
| `createdAt` | INTEGER | |
| `updatedAt` | INTEGER | |
| `deletedAt` | INTEGER | |

### Table 4: `party_dues`
Annual dues payments per member.

| Column | Type | Notes |
|--------|------|-------|
| `id` | TEXT PK | UUID |
| `tenantId` | TEXT | Multi-tenancy |
| `organizationId` | TEXT | FK → party_organizations |
| `memberId` | TEXT | FK → party_members |
| `year` | INTEGER | Dues year (e.g., 2026) |
| `amountKobo` | INTEGER | Amount paid in kobo |
| `paymentMethod` | TEXT | cash/bank_transfer/pos/mobile_money |
| `receiptNumber` | TEXT | |
| `paidAt` | INTEGER | Unix ms |
| `collectedBy` | TEXT | FK → party_members (collector) |
| `notes` | TEXT | Optional |
| `createdAt` | INTEGER | |
| `updatedAt` | INTEGER | |
| `deletedAt` | INTEGER | |

### Table 5: `party_positions`
Elected/appointed positions within the party.

| Column | Type | Notes |
|--------|------|-------|
| `id` | TEXT PK | UUID |
| `tenantId` | TEXT | Multi-tenancy |
| `organizationId` | TEXT | FK → party_organizations |
| `structureId` | TEXT | FK → party_structures |
| `title` | TEXT | e.g., "Ward Chairman", "State Secretary" |
| `holderId` | TEXT | FK → party_members |
| `electedDate` | INTEGER | Unix ms |
| `expiresDate` | INTEGER | Unix ms |
| `isActive` | INTEGER | 1 = active |
| `createdAt` | INTEGER | |
| `updatedAt` | INTEGER | |
| `deletedAt` | INTEGER | |

### Table 6: `party_meetings`
Party meetings at any structural level.

| Column | Type | Notes |
|--------|------|-------|
| `id` | TEXT PK | UUID |
| `tenantId` | TEXT | Multi-tenancy |
| `organizationId` | TEXT | FK → party_organizations |
| `structureId` | TEXT | FK → party_structures |
| `title` | TEXT | |
| `meetingType` | TEXT | executive/ward/state/national/emergency |
| `venue` | TEXT | |
| `scheduledAt` | INTEGER | Unix ms |
| `minutesUrl` | TEXT | R2 URL for meeting minutes |
| `attendeeCount` | INTEGER | |
| `createdAt` | INTEGER | |
| `updatedAt` | INTEGER | |
| `deletedAt` | INTEGER | |

### Table 7: `party_announcements`
Official party communications.

| Column | Type | Notes |
|--------|------|-------|
| `id` | TEXT PK | UUID |
| `tenantId` | TEXT | Multi-tenancy |
| `organizationId` | TEXT | FK → party_organizations |
| `structureId` | TEXT | NULL = all structures |
| `title` | TEXT | |
| `content` | TEXT | |
| `priority` | TEXT | normal/urgent/critical |
| `publishedAt` | INTEGER | Unix ms |
| `expiresAt` | INTEGER | Unix ms |
| `createdBy` | TEXT | FK → party_members |
| `createdAt` | INTEGER | |
| `updatedAt` | INTEGER | |
| `deletedAt` | INTEGER | |

### Table 8: `party_id_cards`
Digital membership ID card records.

| Column | Type | Notes |
|--------|------|-------|
| `id` | TEXT PK | UUID |
| `tenantId` | TEXT | Multi-tenancy |
| `organizationId` | TEXT | FK → party_organizations |
| `memberId` | TEXT | FK → party_members |
| `cardNumber` | TEXT | Unique card number |
| `issuedAt` | INTEGER | Unix ms |
| `expiresAt` | INTEGER | Unix ms |
| `cardImageUrl` | TEXT | R2 URL for generated card image |
| `isActive` | INTEGER | 1 = active, 0 = revoked |
| `revokedAt` | INTEGER | Unix ms |
| `revokedReason` | TEXT | |
| `createdAt` | INTEGER | |
| `updatedAt` | INTEGER | |
| `deletedAt` | INTEGER | |

---

## 5. API Endpoints Plan (Hono — 30 endpoints)

All endpoints: `Authorization: Bearer <JWT>` required. RBAC enforced.  
Base path: `/api/party`

### Organizations (3)
- `GET /organizations/:id` — get party org details
- `PATCH /organizations/:id` — update org settings (admin only)
- `GET /organizations/:id/stats` — dashboard statistics

### Structures (5)
- `GET /structures` — list all structures (tree or flat)
- `GET /structures/:id` — get structure with children
- `POST /structures` — create new structure node (admin)
- `PATCH /structures/:id` — update structure (admin)
- `DELETE /structures/:id` — soft delete (admin)

### Members (7)
- `GET /members` — paginated list, filter by structure/status
- `GET /members/:id` — full member profile
- `POST /members` — register new member (NDPR consent required)
- `PATCH /members/:id` — update member details
- `DELETE /members/:id` — soft delete (expel/resign)
- `GET /members/:id/dues` — member dues history
- `GET /members/:id/card` — member ID card details

### Dues (5)
- `GET /dues` — list dues records (filter by year/structure)
- `GET /dues/summary` — dues collection summary by year
- `POST /dues` — record dues payment
- `PATCH /dues/:id` — update dues record
- `DELETE /dues/:id` — soft delete

### Positions (4)
- `GET /positions` — list positions by structure
- `POST /positions` — create/assign position
- `PATCH /positions/:id` — update position holder
- `DELETE /positions/:id` — soft delete

### Meetings (4)
- `GET /meetings` — list meetings by structure
- `POST /meetings` — create meeting
- `PATCH /meetings/:id` — update meeting
- `DELETE /meetings/:id` — soft delete

### ID Cards (2)
- `POST /id-cards` — issue new ID card for member
- `PATCH /id-cards/:id` — revoke ID card

### Sync (2)
- `GET /sync/pull` — CORE-1 pull endpoint (delta sync)
- `POST /sync/push` — CORE-1 push endpoint (mutation queue)

---

## 6. Event Bus Events (CORE-2) [Part 5]

| Event Constant | Event String | Trigger | Payload |
|----------------|-------------|---------|---------|
| `PARTY_MEMBER_REGISTERED` | `party.member.registered` | New member joins | `{ memberId, structureId, membershipNumber }` |
| `PARTY_MEMBER_SUSPENDED` | `party.member.suspended` | Member suspended | `{ memberId, reason }` |
| `PARTY_MEMBER_EXPELLED` | `party.member.expelled` | Member expelled | `{ memberId, reason }` |
| `PARTY_DUES_PAID` | `party.dues.paid` | Dues payment recorded | `{ memberId, year, amountKobo }` |
| `PARTY_DUES_OVERDUE` | `party.dues.overdue` | Member dues overdue | `{ memberId, year, dueAmountKobo }` |
| `PARTY_POSITION_ASSIGNED` | `party.position.assigned` | Position holder set | `{ positionId, memberId, title }` |
| `PARTY_MEETING_SCHEDULED` | `party.meeting.scheduled` | Meeting created | `{ meetingId, structureId, scheduledAt }` |
| `PARTY_ID_CARD_ISSUED` | `party.id_card.issued` | ID card issued | `{ memberId, cardNumber }` |
| `PARTY_ID_CARD_REVOKED` | `party.id_card.revoked` | ID card revoked | `{ memberId, cardNumber, reason }` |
| `PARTY_STRUCTURE_CREATED` | `party.structure.created` | New structure node | `{ structureId, level, parentId }` |
| `PARTY_ANNOUNCEMENT_PUBLISHED` | `party.announcement.published` | Announcement live | `{ announcementId, priority }` |

---

## 7. Frontend Pages Plan (6 PWA Pages)

| Page | Description | Key Features |
|------|-------------|--------------|
| **Dashboard** | Party overview | Member count by structure, dues collection rate, upcoming meetings, recent announcements |
| **Members** | Member registry | List/search/filter, NDPR consent gate, membership number display |
| **Dues** | Dues management | Record payment, view history, dues status by year, collection summary |
| **Structure** | Hierarchy browser | Tree view: National → State → LGA → Ward, click to drill down |
| **Meetings** | Meeting management | Schedule, list by structure, attendance count |
| **ID Cards** | Digital ID management | Issue card, view card details, revoke |

---

## 8. i18n Plan (en/yo/ig/ha) [Part 9.1 — Africa First]

Sections required:
- `nav` — navigation labels
- `dashboard` — dashboard strings
- `members` — member management strings
- `dues` — dues management strings
- `structure` — hierarchy strings
- `meetings` — meeting strings
- `idCards` — ID card strings
- `common` — shared strings (save, cancel, delete, search, etc.)

Nigeria-specific terms to translate:
- "Ward" → Yoruba: "Agbegbe", Igbo: "Ogbe", Hausa: "Unguwa"
- "Local Government Area" → Yoruba: "Agbegbe Ijoba Ibilẹ", Igbo: "Ọchịchị Obodo", Hausa: "Hukumar Yanki"
- "Dues" → Yoruba: "Owo Ẹgbẹ", Igbo: "Ụgwọ Otu", Hausa: "Kuɗin Ƙungiya"

---

## 9. Offline Sync Plan (CORE-1) [Part 6]

`PartyOfflineDb` (Dexie) extends the platform pattern from CIV-1:

```
Tables:
- mutationQueue: ++id, entityType, entityId, tenantId, organizationId, synced, createdAt
- members: id, tenantId, organizationId, structureId, memberStatus, updatedAt
- dues: id, tenantId, organizationId, memberId, year, synced
- structures: id, tenantId, organizationId, level, parentId
```

Critical offline operations:
1. Register new member (enqueue CREATE mutation)
2. Record dues payment (enqueue CREATE mutation)
3. View cached member list (read from IndexedDB)
4. View structure hierarchy (read from IndexedDB)

---

## 10. Nigeria-First Specifics [Part 9.1]

- **Membership Number Format:** `{PARTY_ABBR}-{STATE_CODE}-{SEQUENCE}` e.g., `APC-LAG-0001234`
- **INEC Voter Card:** Optional linkage field for cross-reference
- **Dues Currency:** NGN default, stored as kobo integers
- **Hierarchy Levels:** national, state, senatorial, federal_constituency, lga, ward (6 levels)
- **Nigerian States:** All 36 states + FCT (37 total)
- **LGA Count:** 774 LGAs (stored as text, not enumerated)
- **Ward Count:** ~8,800 wards (stored as text)
- **NDPR Compliance:** Consent timestamp required for all member PII

---

## 11. File Structure

```
src/modules/political-party/
  api/
    index.ts              — Hono API router (30 endpoints)
  __tests__/
    political-party.test.ts  — Vitest tests (140+ tests)
  utils.ts                — Nigeria-first utilities (dues, membership number, WAT)
  i18n.ts                 — en/yo/ig/ha translations
  apiClient.ts            — Type-safe fetch wrapper
  ui.tsx                  — Mobile-first PWA UI (6 pages)

src/core/db/
  schema.ts               — EXTENDED: add 8 party tables + types + PARTY_TABLE_NAMES + PARTY_MIGRATION_SQL
  queries.ts              — EXTENDED: add party query helpers

src/core/event-bus/
  index.ts                — EXTENDED: add PARTY_EVENTS constants + PartyEventType union
```

---

## 12. QA Protocol [Part 9.4]

| Layer | Check | Target |
|-------|-------|--------|
| Layer 1 | TypeScript strict mode, 0 errors | `tsc --noEmit` passes |
| Layer 2 | Vitest unit tests | 140+ tests, 100% pass rate |
| Layer 3 | Production build | `pnpm run build` succeeds |
| Layer 4 | Acceptance criteria | All 30 endpoints, 6 pages, 8 tables verified |
| Layer 5 | 7 Core Invariants | All 7 invariants documented with evidence |

---

## 13. Implementation Sequence

1. **Extend `src/core/db/schema.ts`** — add 8 party tables, `PARTY_TABLE_NAMES`, `PARTY_MIGRATION_SQL`, TypeScript interfaces
2. **Extend `src/core/db/queries.ts`** — add party query helpers (members, dues, structures, positions, meetings, ID cards)
3. **Extend `src/core/event-bus/index.ts`** — add `PARTY_EVENTS` constants and `PartyEventType` union
4. **Create `src/modules/political-party/utils.ts`** — dues utilities, membership number formatter, Nigerian hierarchy constants
5. **Create `src/modules/political-party/i18n.ts`** — en/yo/ig/ha translations
6. **Create `src/modules/political-party/apiClient.ts`** — typed fetch wrapper
7. **Create `src/modules/political-party/api/index.ts`** — Hono API with 30 endpoints
8. **Create `src/modules/political-party/ui.tsx`** — 6 PWA pages
9. **Create `src/modules/political-party/__tests__/political-party.test.ts`** — 140+ Vitest tests
10. **Update `wrangler.toml`** — add political-party module entry point
11. **Run 5-Layer QA** — TypeScript, tests, build, acceptance, invariants
12. **Write QA report** — `docs/qa-reports/CIV-2-QA-REPORT.md`
13. **Push to GitHub** — feature/civ-2-political-party branch + main
14. **Update queue** — mark CIV-2 as DONE
