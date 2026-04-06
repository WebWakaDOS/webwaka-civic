# WEBWAKA-CIVIC — DEEP RESEARCH + ENHANCEMENT TASKBOOK

**Repo:** webwaka-civic
**Document Class:** Platform Taskbook — Implementation + QA Ready
**Date:** 2026-04-05
**Status:** EXECUTION READY

---

# WebWaka OS v4 — Ecosystem Scope & Boundary Document

**Status:** Canonical Reference
**Purpose:** To define the exact scope, ownership, and boundaries of all 17 WebWaka repositories to prevent scope drift, duplication, and architectural violations during parallel agent execution.

## 1. Core Platform & Infrastructure (The Foundation)

### 1.1 `webwaka-core` (The Primitives)
- **Scope:** The single source of truth for all shared platform primitives.
- **Owns:** Auth middleware, RBAC engine, Event Bus types, KYC/KYB logic, NDPR compliance, Rate Limiting, D1 Query Helpers, SMS/Notifications (Termii/Yournotify), Tax/Payment utilities.
- **Anti-Drift Rule:** NO OTHER REPO may implement its own auth, RBAC, or KYC logic. All repos MUST import from `@webwaka/core`.

### 1.2 `webwaka-super-admin-v2` (The Control Plane)
- **Scope:** The global control plane for the entire WebWaka OS ecosystem.
- **Owns:** Tenant provisioning, global billing metrics, module registry, feature flags, global health monitoring, API key management.
- **Anti-Drift Rule:** This repo manages *tenants*, not end-users. It does not handle vertical-specific business logic.

### 1.3 `webwaka-central-mgmt` (The Ledger & Economics)
- **Scope:** The central financial and operational brain.
- **Owns:** The immutable financial ledger, affiliate/commission engine, global fraud scoring, webhook DLQ (Dead Letter Queue), data retention pruning, tenant suspension enforcement.
- **Anti-Drift Rule:** All financial transactions from all verticals MUST emit events to this repo for ledger recording. Verticals do not maintain their own global ledgers.

### 1.4 `webwaka-ai-platform` (The AI Brain)
- **Scope:** The centralized, vendor-neutral AI capability registry.
- **Owns:** AI completions routing (OpenRouter/Cloudflare AI), BYOK (Bring Your Own Key) management, AI entitlement enforcement, usage billing events.
- **Anti-Drift Rule:** NO OTHER REPO may call OpenAI or Anthropic directly. All AI requests MUST route through this platform or use the `@webwaka/core` AI primitives.

### 1.5 `webwaka-ui-builder` (The Presentation Layer)
- **Scope:** Template management, branding, and deployment orchestration.
- **Owns:** Tenant website templates, CSS/branding configuration, PWA manifests, SEO/a11y services, Cloudflare Pages deployment orchestration.
- **Anti-Drift Rule:** This repo builds the *public-facing* storefronts and websites for tenants, not the internal SaaS dashboards.

### 1.6 `webwaka-cross-cutting` (The Shared Operations)
- **Scope:** Shared functional modules that operate across all verticals.
- **Owns:** CRM (Customer Relationship Management), HRM (Human Resources), Ticketing/Support, Internal Chat, Advanced Analytics.
- **Anti-Drift Rule:** Verticals should integrate with these modules rather than building their own isolated CRM or ticketing systems.

### 1.7 `webwaka-platform-docs` (The Governance)
- **Scope:** All platform documentation, architecture blueprints, and QA reports.
- **Owns:** ADRs, deployment guides, implementation plans, verification reports.
- **Anti-Drift Rule:** No code lives here.

## 2. The Vertical Suites (The Business Logic)

### 2.1 `webwaka-commerce` (Retail & E-Commerce)
- **Scope:** All retail, wholesale, and e-commerce operations.
- **Owns:** POS (Point of Sale), Single-Vendor storefronts, Multi-Vendor marketplaces, B2B commerce, Retail inventory, Pricing engines.
- **Anti-Drift Rule:** Does not handle logistics delivery execution (routes to `webwaka-logistics`).

### 2.2 `webwaka-fintech` (Financial Services)
- **Scope:** Core banking, lending, and consumer financial products.
- **Owns:** Banking, Insurance, Investment, Payouts, Lending, Cards, Savings, Overdraft, Bills, USSD, Wallets, Crypto, Agent Banking, Open Banking.
- **Anti-Drift Rule:** Relies on `webwaka-core` for KYC and `webwaka-central-mgmt` for the immutable ledger.

### 2.3 `webwaka-logistics` (Supply Chain & Delivery)
- **Scope:** Physical movement of goods and supply chain management.
- **Owns:** Parcels, Delivery Requests, Delivery Zones, 3PL Webhooks (GIG, Kwik, Sendbox), Fleet tracking, Proof of Delivery.
- **Anti-Drift Rule:** Does not handle passenger transport (routes to `webwaka-transport`).

### 2.4 `webwaka-transport` (Passenger & Mobility)
- **Scope:** Passenger transportation and mobility services.
- **Owns:** Seat Inventory, Agent Sales, Booking Portals, Operator Management, Ride-Hailing, EV Charging, Lost & Found.
- **Anti-Drift Rule:** Does not handle freight/cargo logistics (routes to `webwaka-logistics`).

### 2.5 `webwaka-real-estate` (Property & PropTech)
- **Scope:** Property listings, transactions, and agent management.
- **Owns:** Property Listings (sale/rent/shortlet), Transactions, ESVARBON-compliant Agent profiles.
- **Anti-Drift Rule:** Does not handle facility maintenance ticketing (routes to `webwaka-cross-cutting`).

### 2.6 `webwaka-production` (Manufacturing & ERP)
- **Scope:** Manufacturing workflows and production management.
- **Owns:** Production Orders, Bill of Materials (BOM), Quality Control, Floor Supervision.
- **Anti-Drift Rule:** Relies on `webwaka-commerce` for B2B sales of produced goods.

### 2.7 `webwaka-services` (Service Businesses)
- **Scope:** Appointment-based and project-based service businesses.
- **Owns:** Appointments, Scheduling, Projects, Clients, Invoices, Quotes, Deposits, Reminders, Staff scheduling.
- **Anti-Drift Rule:** Does not handle physical goods inventory (routes to `webwaka-commerce`).

### 2.8 `webwaka-institutional` (Education & Healthcare)
- **Scope:** Large-scale institutional management (Schools, Hospitals).
- **Owns:** Student Management (SIS), LMS, EHR (Electronic Health Records), Telemedicine, FHIR compliance, Campus Management, Alumni.
- **Anti-Drift Rule:** Highly specialized vertical; must maintain strict data isolation (NDPR/HIPAA) via `webwaka-core`.

### 2.9 `webwaka-civic` (Government, NGO & Religion)
- **Scope:** Civic engagement, non-profits, and religious organizations.
- **Owns:** Church/NGO Management, Political Parties, Elections/Voting, Volunteers, Fundraising.
- **Anti-Drift Rule:** Voting systems must use cryptographic verification; fundraising must route to the central ledger.

### 2.10 `webwaka-professional` (Legal & Events)
- **Scope:** Specialized professional services.
- **Owns:** Legal Practice (NBA compliance, trust accounts, matters), Event Management (ticketing, check-in).
- **Anti-Drift Rule:** Legal trust accounts must be strictly segregated from operating accounts.

## 3. The 7 Core Invariants (Enforced Everywhere)
1. **Build Once Use Infinitely:** Never duplicate primitives. Import from `@webwaka/core`.
2. **Mobile First:** UI/UX optimized for mobile before desktop.
3. **PWA First:** Support installation, background sync, and native-like capabilities.
4. **Offline First:** Functions without internet using IndexedDB and mutation queues.
5. **Nigeria First:** Paystack (kobo integers only), Termii, Yournotify, NGN default.
6. **Africa First:** i18n support for regional languages and currencies.
7. **Vendor Neutral AI:** OpenRouter abstraction — no direct provider SDKs.

---

## 4. REPOSITORY DEEP UNDERSTANDING & CURRENT STATE

Based on the provided scope, `webwaka-civic` is designed for **Civic engagement, non-profits, and religious organizations**. Its core functionalities include **Church/NGO Management, Political Parties, Elections/Voting, Volunteers, and Fundraising**. The anti-drift rules emphasize **cryptographic verification for voting systems** and **routing fundraising through the central ledger (`webwaka-central-mgmt`)**.

As I do not have access to the live code (e.g., `worker.ts`, `src/` directory structure, `package.json`, migration files), this section is based on an inferred understanding of the repository's purpose and architectural guidelines. A true deep dive would involve analyzing the actual codebase to identify existing implementations, stubs, and architectural patterns, as well as any discrepancies between this taskbook and the current code state.

## 5. MASTER TASK REGISTRY (NON-DUPLICATED)

This section lists all tasks specifically assigned to the `webwaka-civic` repository. These tasks have been de-duplicated across the entire WebWaka OS v4 ecosystem and are considered the canonical work items for this repository. Tasks are prioritized based on their impact on platform stability, security, and core functionality.

| Task ID | Description | Rationale |
|---|---|---|
| WC-001 | Implement secure and verifiable online voting system. | Core civic engagement functionality, requires cryptographic verification as per anti-drift rule. |
| WC-002 | Integrate with `webwaka-central-mgmt` for fundraising ledger. | Essential for financial transparency and compliance with anti-drift rule. |
| WC-003 | Develop comprehensive NGO/Church management module. | Central to the repository's scope, covering membership, events, and resource management. |
| WC-004 | Create volunteer management and coordination features. | Facilitates community engagement and operational efficiency for civic organizations. |
| WC-005 | Implement political party registration and member management. | Supports the political parties aspect of the civic scope. |

## 6. TASK BREAKDOWN & IMPLEMENTATION PROMPTS

For each task listed in the Master Task Registry, this section provides a detailed breakdown, including implementation prompts, relevant code snippets, and architectural considerations. The goal is to provide a clear path for a Replit agent to execute the task.

### Task: WC-001 - Implement secure and verifiable online voting system.

**Implementation Prompt:** Design and implement a module for online voting that ensures cryptographic verification of votes, voter anonymity, and resistance to tampering. Leverage `webwaka-core` for authentication and user management. Consider using a blockchain-like structure or secure multi-party computation for vote tallying.

**Architectural Considerations:**
- **Data Model:** Define schemas for `Voter`, `Election`, `Candidate`, `Vote` (encrypted). Store vote hashes securely.
- **Cryptography:** Integrate with a cryptographic library for digital signatures and encryption. Ensure proper key management.
- **Integration:** Use `@webwaka/core` for user authentication and authorization. Potentially integrate with `webwaka-platform-docs` for audit trails.
- **Scalability:** Design for high concurrency during voting periods.

**Example Code Snippet (Conceptual - `src/voting/service.ts`):**
```typescript
import { authenticateUser, generateUUID } from '@webwaka/core';
import { encryptVote, verifySignature } from '../utils/crypto';
import { VoteRepository } from './repository';

class VotingService {
  async castVote(userId: string, electionId: string, candidateId: string, signature: string): Promise<boolean> {
    // 1. Authenticate user via @webwaka/core
    const isAuthenticated = await authenticateUser(userId);
    if (!isAuthenticated) throw new Error('Unauthorized');

    // 2. Verify vote signature
    const isValidSignature = verifySignature(userId, electionId, candidateId, signature);
    if (!isValidSignature) throw new Error('Invalid vote signature');

    // 3. Encrypt vote and store hash
    const encryptedVote = encryptVote(userId, electionId, candidateId);
    const voteId = generateUUID();
    await VoteRepository.saveVote({ id: voteId, electionId, encryptedVote, timestamp: new Date() });

    // 4. Emit event for audit/tallying
    // eventBus.emit('vote_cast', { voteId, electionId });

    return true;
  }
}
```

### Task: WC-002 - Integrate with `webwaka-central-mgmt` for fundraising ledger.

**Implementation Prompt:** Develop a module that captures all fundraising activities within `webwaka-civic` (donations, pledges, grants) and emits them as events to `webwaka-central-mgmt` for immutable ledger recording. Ensure all financial transactions adhere to the `webwaka-central-mgmt`'s event schema.

**Architectural Considerations:**
- **Event Sourcing:** Design a mechanism to emit fundraising events to the central ledger. This could involve a dedicated event producer.
- **Data Mapping:** Map `webwaka-civic` fundraising data to the `webwaka-central-mgmt`'s financial event schema.
- **Error Handling:** Implement robust error handling and retry mechanisms for event emission to ensure no financial data is lost.
- **Compliance:** Ensure all transactions comply with relevant financial regulations and the `webwaka-central-mgmt`'s requirements.

**Example Code Snippet (Conceptual - `src/fundraising/service.ts`):**
```typescript
import { EventBus } from '@webwaka/core'; // Assuming EventBus is in core

class FundraisingService {
  async recordDonation(donorId: string, amount: number, currency: string, campaignId: string): Promise<void> {
    // 1. Process donation locally
    // ... save donation details in webwaka-civic's local database ...

    // 2. Construct event for webwaka-central-mgmt
    const financialEvent = {
      eventType: 'DONATION_RECEIVED',
      transactionId: `WC-DON-${Date.now()}`,
      sourceRepo: 'webwaka-civic',
      amount: amount, // Kobo integers only, as per Nigeria First invariant
      currency: currency,
      metadata: { donorId, campaignId },
      timestamp: new Date().toISOString(),
    };

    // 3. Emit event to central ledger via EventBus
    await EventBus.emit('financial_transaction', financialEvent);
    console.log(`Donation event emitted for transaction: ${financialEvent.transactionId}`);
  }
}
```

## 7. QA PLANS & PROMPTS

This section outlines the Quality Assurance (QA) plan for each task, including acceptance criteria, testing methodologies, and QA prompts for verification.

**General QA Principles:**
- **Unit Tests:** All new functions and modules must have comprehensive unit tests covering edge cases and error conditions.
- **Integration Tests:** Verify seamless interaction with `@webwaka/core` and `webwaka-central-mgmt` (for financial tasks).
- **End-to-End Tests:** Simulate user flows to ensure the entire feature works as expected from a user perspective.
- **Security Testing:** Pay special attention to security vulnerabilities, especially for voting and financial modules.
- **Performance Testing:** Ensure features perform adequately under expected load.

**QA Prompts for Task WC-001 (Online Voting System):**
- **Acceptance Criteria:**
    - Voters can securely cast their votes.
    - Votes are cryptographically verified and tamper-proof.
    - Voter anonymity is maintained.
    - Election results are accurate and auditable.
    - System handles concurrent voting without issues.
- **Testing Methodology:**
    - **Unit:** Test cryptographic functions (encryption, decryption, signature verification).
    - **Integration:** Test vote casting flow with `@webwaka/core` authentication.
    - **E2E:** Simulate multiple users casting votes and verify final tally. Attempt to tamper with votes and verify detection.
- **QA Prompt:** 
