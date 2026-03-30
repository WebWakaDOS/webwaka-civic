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
    db/                 # Database queries and schema
    event-bus/          # Platform event bus integration
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

## Key Features
- Mobile-first, offline-first PWA
- Multi-tenancy (every record includes `tenantId`)
- Multi-language support (English, Yoruba, Igbo, Hausa)
- Nigerian financial conventions (kobo integers, Naira display)
- Service Worker for asset caching and background sync
