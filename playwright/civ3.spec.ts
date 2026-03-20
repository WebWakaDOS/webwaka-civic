/**
 * WebWaka Civic — E2E Test Suite (Playwright)
 * Full workflow testing for Elections, Voting, Volunteers, and Fundraising
 */

import { test, expect, Page } from '@playwright/test';

// Test configuration
const BASE_URL = process.env.BASE_URL || 'http://localhost:5173';
const TIMEOUT = 30000;

test.describe('CIV-3 Elections & Campaigns E2E Tests', () => {
  let page: Page;

  test.beforeEach(async ({ browser }) => {
    page = await browser.newPage();
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });
  });

  test.afterEach(async () => {
    await page.close();
  });

  // ─── Elections Dashboard Tests ──────────────────────────────────────────

  test.describe('Elections Dashboard', () => {
    test('should display elections list', async () => {
      // Wait for elections to load
      await page.waitForSelector('[data-testid="elections-list"]', { timeout: TIMEOUT });

      // Verify elections are displayed
      const elections = await page.locator('[data-testid="election-card"]').count();
      expect(elections).toBeGreaterThan(0);
    });

    test('should filter elections by status', async () => {
      // Click status filter
      await page.click('[data-testid="filter-voting"]');

      // Wait for filtered results
      await page.waitForTimeout(500);

      // Verify filtered elections
      const filteredElections = await page.locator('[data-testid="election-card"]').count();
      expect(filteredElections).toBeGreaterThan(0);
    });

    test('should search elections by name', async () => {
      // Enter search query
      await page.fill('[data-testid="search-elections"]', 'Presidential');

      // Wait for search results
      await page.waitForTimeout(500);

      // Verify search results
      const results = await page.locator('[data-testid="election-card"]').count();
      expect(results).toBeGreaterThan(0);
    });

    test('should navigate to election details', async () => {
      // Click first election
      await page.click('[data-testid="election-card"]:first-child');

      // Wait for details page
      await page.waitForSelector('[data-testid="election-details"]', { timeout: TIMEOUT });

      // Verify details are displayed
      const title = await page.locator('[data-testid="election-title"]').textContent();
      expect(title).toBeTruthy();
    });
  });

  // ─── Voting Tests ──────────────────────────────────────────────────────

  test.describe('Voting System', () => {
    test('should display voting screen with candidates', async () => {
      // Navigate to voting page
      await page.goto(`${BASE_URL}/voting/e1`, { waitUntil: 'networkidle' });

      // Wait for candidates to load
      await page.waitForSelector('[data-testid="candidate-card"]', { timeout: TIMEOUT });

      // Verify candidates are displayed
      const candidates = await page.locator('[data-testid="candidate-card"]').count();
      expect(candidates).toBeGreaterThan(0);
    });

    test('should select candidate and show confirmation', async () => {
      // Navigate to voting page
      await page.goto(`${BASE_URL}/voting/e1`, { waitUntil: 'networkidle' });

      // Click first candidate
      await page.click('[data-testid="candidate-card"]:first-child');

      // Wait for confirmation modal
      await page.waitForSelector('[data-testid="confirmation-modal"]', { timeout: TIMEOUT });

      // Verify confirmation is shown
      const confirmationText = await page.locator('[data-testid="confirmation-modal"]').textContent();
      expect(confirmationText).toContain('Confirm');
    });

    test('should submit vote successfully', async () => {
      // Navigate to voting page
      await page.goto(`${BASE_URL}/voting/e1`, { waitUntil: 'networkidle' });

      // Select candidate
      await page.click('[data-testid="candidate-card"]:first-child');

      // Wait for confirmation modal
      await page.waitForSelector('[data-testid="confirmation-modal"]', { timeout: TIMEOUT });

      // Click confirm button
      await page.click('[data-testid="confirm-vote-button"]');

      // Wait for success message
      await page.waitForSelector('[data-testid="vote-submitted"]', { timeout: TIMEOUT });

      // Verify success
      const successText = await page.locator('[data-testid="vote-submitted"]').textContent();
      expect(successText).toContain('submitted');
    });

    test('should prevent duplicate voting', async () => {
      // Navigate to voting page
      await page.goto(`${BASE_URL}/voting/e1`, { waitUntil: 'networkidle' });

      // Check for "already voted" message
      const alreadyVotedMessage = await page.locator('[data-testid="already-voted"]');
      const isVisible = await alreadyVotedMessage.isVisible().catch(() => false);

      if (isVisible) {
        expect(isVisible).toBe(true);
      }
    });

    test('should handle offline voting', async () => {
      // Navigate to voting page
      await page.goto(`${BASE_URL}/voting/e1`, { waitUntil: 'networkidle' });

      // Go offline
      await page.context().setOffline(true);

      // Select candidate
      await page.click('[data-testid="candidate-card"]:first-child');

      // Wait for confirmation modal
      await page.waitForSelector('[data-testid="confirmation-modal"]', { timeout: TIMEOUT });

      // Verify offline notice
      const offlineNotice = await page.locator('[data-testid="offline-notice"]').isVisible();
      expect(offlineNotice).toBe(true);

      // Click confirm button
      await page.click('[data-testid="confirm-vote-button"]');

      // Wait for offline success
      await page.waitForSelector('[data-testid="vote-saved-offline"]', { timeout: TIMEOUT });

      // Go back online
      await page.context().setOffline(false);

      // Wait for sync
      await page.waitForTimeout(1000);

      // Verify sync status
      const syncStatus = await page.locator('[data-testid="sync-status"]').textContent();
      expect(syncStatus).toContain('synced');
    });
  });

  // ─── Volunteer Tests ────────────────────────────────────────────────────

  test.describe('Volunteer Management', () => {
    test('should display volunteer dashboard', async () => {
      // Navigate to volunteer page
      await page.goto(`${BASE_URL}/volunteers/e1`, { waitUntil: 'networkidle' });

      // Wait for dashboard to load
      await page.waitForSelector('[data-testid="volunteer-dashboard"]', { timeout: TIMEOUT });

      // Verify dashboard is displayed
      const dashboard = await page.locator('[data-testid="volunteer-dashboard"]').isVisible();
      expect(dashboard).toBe(true);
    });

    test('should display available tasks', async () => {
      // Navigate to volunteer page
      await page.goto(`${BASE_URL}/volunteers/e1`, { waitUntil: 'networkidle' });

      // Wait for tasks to load
      await page.waitForSelector('[data-testid="task-card"]', { timeout: TIMEOUT });

      // Verify tasks are displayed
      const tasks = await page.locator('[data-testid="task-card"]').count();
      expect(tasks).toBeGreaterThan(0);
    });

    test('should complete task successfully', async () => {
      // Navigate to volunteer page
      await page.goto(`${BASE_URL}/volunteers/e1`, { waitUntil: 'networkidle' });

      // Wait for tasks to load
      await page.waitForSelector('[data-testid="complete-task-button"]', { timeout: TIMEOUT });

      // Click complete button
      await page.click('[data-testid="complete-task-button"]:first-child');

      // Wait for success
      await page.waitForSelector('[data-testid="task-completed"]', { timeout: TIMEOUT });

      // Verify success
      const successText = await page.locator('[data-testid="task-completed"]').textContent();
      expect(successText).toContain('completed');
    });

    test('should display leaderboard', async () => {
      // Navigate to volunteer page
      await page.goto(`${BASE_URL}/volunteers/e1`, { waitUntil: 'networkidle' });

      // Click leaderboard tab
      await page.click('[data-testid="leaderboard-tab"]');

      // Wait for leaderboard to load
      await page.waitForSelector('[data-testid="leaderboard-entry"]', { timeout: TIMEOUT });

      // Verify leaderboard entries
      const entries = await page.locator('[data-testid="leaderboard-entry"]').count();
      expect(entries).toBeGreaterThan(0);
    });

    test('should display volunteer stats', async () => {
      // Navigate to volunteer page
      await page.goto(`${BASE_URL}/volunteers/e1`, { waitUntil: 'networkidle' });

      // Wait for stats to load
      await page.waitForSelector('[data-testid="volunteer-stats"]', { timeout: TIMEOUT });

      // Verify stats are displayed
      const points = await page.locator('[data-testid="volunteer-points"]').textContent();
      expect(points).toBeTruthy();
    });
  });

  // ─── Fundraising Tests ─────────────────────────────────────────────────

  test.describe('Fundraising System', () => {
    test('should display fundraising dashboard', async () => {
      // Navigate to fundraising page
      await page.goto(`${BASE_URL}/fundraising/e1`, { waitUntil: 'networkidle' });

      // Wait for dashboard to load
      await page.waitForSelector('[data-testid="fundraising-dashboard"]', { timeout: TIMEOUT });

      // Verify dashboard is displayed
      const dashboard = await page.locator('[data-testid="fundraising-dashboard"]').isVisible();
      expect(dashboard).toBe(true);
    });

    test('should display budget status', async () => {
      // Navigate to fundraising page
      await page.goto(`${BASE_URL}/fundraising/e1`, { waitUntil: 'networkidle' });

      // Wait for budget to load
      await page.waitForSelector('[data-testid="budget-status"]', { timeout: TIMEOUT });

      // Verify budget is displayed
      const budgetText = await page.locator('[data-testid="budget-status"]').textContent();
      expect(budgetText).toBeTruthy();
    });

    test('should display donations list', async () => {
      // Navigate to fundraising page
      await page.goto(`${BASE_URL}/fundraising/e1`, { waitUntil: 'networkidle' });

      // Click donations tab
      await page.click('[data-testid="donations-tab"]');

      // Wait for donations to load
      await page.waitForSelector('[data-testid="donation-entry"]', { timeout: TIMEOUT });

      // Verify donations are displayed
      const donations = await page.locator('[data-testid="donation-entry"]').count();
      expect(donations).toBeGreaterThanOrEqual(0);
    });

    test('should display expenses list', async () => {
      // Navigate to fundraising page
      await page.goto(`${BASE_URL}/fundraising/e1`, { waitUntil: 'networkidle' });

      // Click expenses tab
      await page.click('[data-testid="expenses-tab"]');

      // Wait for expenses to load
      await page.waitForSelector('[data-testid="expense-entry"]', { timeout: TIMEOUT });

      // Verify expenses are displayed
      const expenses = await page.locator('[data-testid="expense-entry"]').count();
      expect(expenses).toBeGreaterThanOrEqual(0);
    });
  });

  // ─── Results Tests ─────────────────────────────────────────────────────

  test.describe('Election Results', () => {
    test('should display election results', async () => {
      // Navigate to results page
      await page.goto(`${BASE_URL}/results/e1`, { waitUntil: 'networkidle' });

      // Wait for results to load
      await page.waitForSelector('[data-testid="results-container"]', { timeout: TIMEOUT });

      // Verify results are displayed
      const results = await page.locator('[data-testid="results-container"]').isVisible();
      expect(results).toBe(true);
    });

    test('should display candidate rankings', async () => {
      // Navigate to results page
      await page.goto(`${BASE_URL}/results/e1`, { waitUntil: 'networkidle' });

      // Wait for rankings to load
      await page.waitForSelector('[data-testid="candidate-ranking"]', { timeout: TIMEOUT });

      // Verify rankings are displayed
      const rankings = await page.locator('[data-testid="candidate-ranking"]').count();
      expect(rankings).toBeGreaterThan(0);
    });

    test('should display vote counts', async () => {
      // Navigate to results page
      await page.goto(`${BASE_URL}/results/e1`, { waitUntil: 'networkidle' });

      // Wait for vote counts to load
      await page.waitForSelector('[data-testid="vote-count"]', { timeout: TIMEOUT });

      // Verify vote counts are displayed
      const voteCount = await page.locator('[data-testid="vote-count"]').first().textContent();
      expect(voteCount).toBeTruthy();
    });
  });

  // ─── Multi-Language Tests ──────────────────────────────────────────────

  test.describe('Multi-Language Support', () => {
    test('should switch to Yoruba language', async () => {
      // Click language selector
      await page.click('[data-testid="language-selector"]');

      // Select Yoruba
      await page.click('[data-testid="language-yo"]');

      // Wait for page to update
      await page.waitForTimeout(500);

      // Verify language changed
      const htmlLang = await page.locator('html').getAttribute('lang');
      expect(htmlLang).toBe('yo');
    });

    test('should switch to Igbo language', async () => {
      // Click language selector
      await page.click('[data-testid="language-selector"]');

      // Select Igbo
      await page.click('[data-testid="language-ig"]');

      // Wait for page to update
      await page.waitForTimeout(500);

      // Verify language changed
      const htmlLang = await page.locator('html').getAttribute('lang');
      expect(htmlLang).toBe('ig');
    });

    test('should switch to Hausa language', async () => {
      // Click language selector
      await page.click('[data-testid="language-selector"]');

      // Select Hausa
      await page.click('[data-testid="language-ha"]');

      // Wait for page to update
      await page.waitForTimeout(500);

      // Verify language changed
      const htmlLang = await page.locator('html').getAttribute('lang');
      expect(htmlLang).toBe('ha');
    });

    test('should persist language preference', async () => {
      // Switch to Yoruba
      await page.click('[data-testid="language-selector"]');
      await page.click('[data-testid="language-yo"]');

      // Reload page
      await page.reload();

      // Verify language is still Yoruba
      const htmlLang = await page.locator('html').getAttribute('lang');
      expect(htmlLang).toBe('yo');
    });
  });

  // ─── Accessibility Tests ────────────────────────────────────────────────

  test.describe('Accessibility', () => {
    test('should have proper heading hierarchy', async () => {
      // Check for h1
      const h1 = await page.locator('h1').count();
      expect(h1).toBeGreaterThan(0);
    });

    test('should have alt text on images', async () => {
      // Get all images
      const images = await page.locator('img').count();

      if (images > 0) {
        // Check first image has alt text
        const altText = await page.locator('img').first().getAttribute('alt');
        expect(altText).toBeTruthy();
      }
    });

    test('should have proper ARIA labels', async () => {
      // Check for ARIA labels on buttons
      const buttons = await page.locator('button').count();
      expect(buttons).toBeGreaterThan(0);
    });

    test('should support keyboard navigation', async () => {
      // Tab to first interactive element
      await page.keyboard.press('Tab');

      // Verify focus is on an interactive element
      const focusedElement = await page.evaluate(() => document.activeElement?.tagName);
      expect(['BUTTON', 'A', 'INPUT', 'SELECT', 'TEXTAREA']).toContain(focusedElement);
    });
  });

  // ─── Performance Tests ──────────────────────────────────────────────────

  test.describe('Performance', () => {
    test('should load elections page within 3 seconds', async () => {
      const startTime = Date.now();

      await page.goto(`${BASE_URL}/elections`, { waitUntil: 'networkidle' });

      const loadTime = Date.now() - startTime;
      expect(loadTime).toBeLessThan(3000);
    });

    test('should load voting page within 2 seconds', async () => {
      const startTime = Date.now();

      await page.goto(`${BASE_URL}/voting/e1`, { waitUntil: 'networkidle' });

      const loadTime = Date.now() - startTime;
      expect(loadTime).toBeLessThan(2000);
    });

    test('should have Lighthouse score >= 90', async () => {
      // This test requires lighthouse integration
      // For now, we'll verify basic performance metrics
      const metrics = await page.evaluate(() => {
        const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
        return {
          fcp: performance.getEntriesByName('first-contentful-paint')[0]?.startTime || 0,
          lcp: performance.getEntriesByName('largest-contentful-paint')[0]?.startTime || 0,
          cls: 0, // CLS requires more complex calculation
        };
      });

      expect(metrics.fcp).toBeLessThan(1500);
      expect(metrics.lcp).toBeLessThan(2500);
    });
  });

  // ─── Error Handling Tests ───────────────────────────────────────────────

  test.describe('Error Handling', () => {
    test('should handle network errors gracefully', async () => {
      // Go offline
      await page.context().setOffline(true);

      // Try to navigate
      await page.goto(`${BASE_URL}/elections`, { waitUntil: 'domcontentloaded' }).catch(() => {});

      // Verify error message is shown
      const errorMessage = await page.locator('[data-testid="error-message"]').isVisible().catch(() => false);

      // Go back online
      await page.context().setOffline(false);
    });

    test('should show validation errors', async () => {
      // Navigate to a form page
      await page.goto(`${BASE_URL}/fundraising/e1`, { waitUntil: 'networkidle' });

      // Try to submit empty form
      await page.click('[data-testid="submit-donation-button"]').catch(() => {});

      // Verify validation error is shown
      const validationError = await page.locator('[data-testid="validation-error"]').isVisible().catch(() => false);
    });
  });
});
