# WebWaka Civic (`webwaka-civic`) QA Certification

**Prepared by:** Manus AI
**Date:** April 2026
**Target Repository:** `webwaka-civic`

## 1. Audit Scope

This QA certification covers the implementation of the Citizen Reporting Portal, AI Issue Triage, and Secure Voting System in `webwaka-civic`.

## 2. Acceptance Criteria

| ID | Feature | Acceptance Criteria | Status |
| :--- | :--- | :--- | :--- |
| QA-CIV-1 | Citizen Reporting | `POST /reports` successfully creates a new issue report with geotagged coordinates and an image URL. | PENDING |
| QA-CIV-2 | AI Issue Triage | `getAICompletion()` successfully analyzes the report description and assigns the correct category (e.g., "Infrastructure"). | PENDING |
| QA-CIV-3 | Secure Voting | The voting endpoint successfully records a vote and prevents duplicate voting using cryptographic signatures. | PENDING |
| QA-CIV-4 | Unit Tests | All new reporting and voting modules have passing unit tests in `src/**/*.test.ts`. | PENDING |

## 3. Offline Resilience Testing

- The civic service is a backend API; offline resilience applies to its clients (e.g., citizen portals).
- However, the service must gracefully handle upstream provider outages (e.g., AI platform 503s) by defaulting to a "Pending Triage" category and allowing manual categorization later.

## 4. Security & RBAC Validation

- Verify that the `POST /reports` endpoint requires a valid citizen JWT.
- Ensure that citizens cannot view or modify reports submitted by other citizens unless they are marked as public.
- Confirm that the voting system is completely anonymous and that votes cannot be traced back to individual citizens.

## 5. Regression Guards

- Run `npm run test` to ensure 100% pass rate.
- Run `npm run build` to ensure no TypeScript compilation errors.
- Verify that the existing community forum logic still functions correctly and integrates with the new reporting system.
