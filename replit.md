# WebWaka Civic Suite

## Project Overview

**WebWaka Civic** is a Civic & Political Suite for Nigeria/Africa, part of the **WebWaka OS v4** ecosystem. It provides management tools for Church/NGO organizations, Political Parties, and Elections/Campaigns.

## Architecture

### Frontend
- **Framework**: React 18 + TypeScript
- **Build Tool**: Vite 6 (port **5000**, host `0.0.0.0`, all hosts allowed for Replit proxy)
- **Styling**: Tailwind CSS 3 (for Elections/Volunteers/Fundraising modules) + inline styles (Church/NGO module)
- **Offline Support**: Dexie (IndexedDB) for offline-first data storage
- **PWA**: Service worker + manifest for installable web app

### Backend
- **Runtime**: Cloudflare Workers (Hono framework)
- **Database**: Cloudflare D1 (SQLite)
- **Storage**: Cloudflare R2
- **Auth**: JWT-based authentication via `@webwaka/core` middleware

### Key Files
- `src/main.tsx` — App entry point; multi-module navigation shell
- `src/worker.ts` — Unified Cloudflare Worker entry point
- `src/modules/church-ngo/ui.tsx` — Church/NGO full PWA UI (1400+ lines, inline styles)
- `src/modules/elections/api/index.ts` — Elections API (45 endpoints, RBAC applied)
- `src/modules/volunteers/api/index.ts` — Volunteer management API (14 endpoints, RBAC applied)
- `src/modules/fundraising/api/index.ts` — Fundraising/expense API (12 endpoints, Paystack kobo)
- `src/components/elections/ElectionsDashboard.tsx` — Elections React component (Tailwind)
- `src/components/volunteers/VolunteerBoard.tsx` — Volunteer board React component (Tailwind)
- `src/components/fundraising/FundraisingDashboard.tsx` — Fundraising React component (Tailwind)
- `packages/webwaka-core/` — Local stub for `@webwaka/core` platform utilities

## Modules

### CIV-1: Church & NGO Management
- Member registration, donations, pledges, events, grants
- Offline-first with Dexie mutation queue
- NDPR consent enforcement

### CIV-2: Political Party Management
- Party structure (National → Ward hierarchy)
- Member dues tracking, ID card issuance

### CIV-3: Elections & Campaigns (recently merged)
- **Elections**: Create, nominate, vote, announce results (45 endpoints)
- **Volunteers**: Task management, leaderboard, gamification (14 endpoints)
- **Fundraising**: Donations, expenses, budget, Paystack integration (12 endpoints)

## Security & RBAC

Global JWT authentication is applied to all `/api/*` routes via `jwtAuthMiddleware` in `src/worker.ts`.

Fine-grained RBAC using `requireRole()` is applied to sensitive endpoints:
- **Elections**: Create, delete, lifecycle transitions (start-nomination, start-voting, announce-results), candidate approval, financial reports → requires `campaign_manager` or `super_admin`
- **Volunteers**: Task creation, assignment, badge awarding → requires `campaign_manager` or `super_admin`
- **Fundraising**: Expense approval → requires `campaign_manager`, `finance_officer`, or `super_admin`

## Key Invariants
- **Offline First**: Field volunteers can log data without internet (Dexie sync engine)
- **Privacy First (NDPR)**: Voter/volunteer data requires explicit consent; financial reports are role-restricted
- **Nigeria First**: NGN/kobo for all financial amounts, WAT timezone, Nigerian phone/state validation
- **Paystack**: All amounts must be **integer kobo** (e.g., ₦5,000 = `500000`). Never pass naira fractions.

## Local Development

```bash
npm install
npm run dev       # Vite dev server on port 5000
npm run build     # TypeScript build + Vite bundle
npm run test      # Vitest unit tests
```

## Deployment (Cloudflare)

```bash
wrangler deploy   # Deploy worker to Cloudflare edge
```

Requires: D1 database, R2 bucket, JWT_SECRET, EVENT_BUS_URL, EVENT_BUS_TOKEN set via `wrangler secret`.

## Dependencies

| Package | Purpose |
|---------|---------|
| `react` / `react-dom` | Frontend UI |
| `hono` | Backend API framework (Cloudflare Workers) |
| `dexie` | IndexedDB ORM for offline storage |
| `uuid` | UUID generation |
| `tailwindcss` | Utility-first CSS for Elections/Volunteers/Fundraising components |
| `@webwaka/core` | Platform utilities: JWT auth, RBAC, CORS, event bus (local stub at `packages/webwaka-core/`) |
| `wrangler` | Cloudflare Workers deployment tool |
