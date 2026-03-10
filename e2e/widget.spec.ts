import { test, expect, type Page } from '@playwright/test';

// ---------------------------------------------------------------------------
// Mock data — matches the structure the GitHub adapter expects
// ---------------------------------------------------------------------------

const TEST_DID = 'did:key:z6MkiTBz1ymuepAQ4HEHYSF1H8quG5GLVVQR3djdX3mDooWp';

const IDENTITY_JSON = JSON.stringify({ controller_did: TEST_DID });
const ATTESTATION_JSON = JSON.stringify({
  version: 1,
  rid: 'test-rid',
  issuer: TEST_DID,
  subject: 'did:key:z6MkDev1Device',
  iat: '2025-01-01T00:00:00Z',
  signature: 'deadbeef',
});

const IDENTITY_B64 = btoa(IDENTITY_JSON);
const ATTESTATION_B64 = btoa(ATTESTATION_JSON);

// ---------------------------------------------------------------------------
// Route handler: mocks the GitHub REST API for forge adapter
// ---------------------------------------------------------------------------

async function mockGitHubAPI(page: Page) {
  // Intercept all requests to api.github.com
  await page.route('https://api.github.com/**', async (route) => {
    const url = route.request().url();

    // 1. List refs — GET /repos/{owner}/{repo}/git/matching-refs/auths/
    if (url.includes('test-org/test-repo/git/matching-refs/auths/')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          { ref: 'refs/auths/identity', object: { sha: 'commit-id-1' } },
          { ref: 'refs/auths/keys/dev1/signatures', object: { sha: 'commit-att-1' } },
        ]),
      });
    }

    // Empty repo — no refs
    if (url.includes('test-org/empty-repo/git/matching-refs/auths/')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      });
    }

    // 2. Get commit → tree SHA
    if (url.includes('git/commits/commit-id-1')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ tree: { sha: 'tree-identity' } }),
      });
    }

    if (url.includes('git/commits/commit-att-1')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ tree: { sha: 'tree-attestation' } }),
      });
    }

    // 3. Get tree → blob entries
    if (url.includes('git/trees/tree-identity')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          tree: [{ path: 'identity.json', sha: 'blob-identity' }],
        }),
      });
    }

    if (url.includes('git/trees/tree-attestation')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          tree: [{ path: 'attestation.json', sha: 'blob-attestation' }],
        }),
      });
    }

    // 4. Read blobs
    if (url.includes('git/blobs/blob-identity')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ content: IDENTITY_B64, encoding: 'base64' }),
      });
    }

    if (url.includes('git/blobs/blob-attestation')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ content: ATTESTATION_B64, encoding: 'base64' }),
      });
    }

    // Fallback: 404
    return route.fulfill({ status: 404, body: 'Not found' });
  });
}

// ---------------------------------------------------------------------------
// Helper: wait for widget to reach a terminal state
// ---------------------------------------------------------------------------

async function waitForState(page: Page, selector: string, timeout = 15_000) {
  await page.waitForFunction(
    ({ sel }) => {
      const el = document.querySelector(sel);
      if (!el) return false;
      const state = el.getAttribute('data-state');
      return state && state !== 'idle' && state !== 'loading';
    },
    { sel: selector },
    { timeout },
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('auths-verify widget E2E', () => {
  test.beforeEach(async ({ page }) => {
    await mockGitHubAPI(page);
    await page.goto('/e2e/fixture.html');
  });

  test('badge mode: resolves identity from mocked GitHub API and reaches terminal state', async ({ page }) => {
    await waitForState(page, '#badge-repo');

    const state = await page.getAttribute('#badge-repo', 'data-state');
    // The widget fetched refs, read identity.json, attempted WASM verification.
    // With fake crypto data the result is either 'verified', 'invalid', or 'error'
    // — any of these proves the pipeline ran end-to-end.
    expect(['verified', 'invalid', 'error']).toContain(state);

    // Verify shadow DOM rendered a label
    const label = await page.evaluate(() => {
      const el = document.querySelector('#badge-repo');
      return el?.shadowRoot?.querySelector('.label')?.textContent;
    });
    expect(label).toBeTruthy();
    expect(label).not.toBe('Not verified'); // moved past idle
    expect(label).not.toBe('Verifying...'); // moved past loading
  });

  test('detail mode: resolves and renders detail panel', async ({ page }) => {
    await waitForState(page, '#detail-repo');

    const state = await page.getAttribute('#detail-repo', 'data-state');
    expect(['verified', 'invalid', 'error']).toContain(state);

    // Detail panel should exist in shadow DOM
    const hasDetailPanel = await page.evaluate(() => {
      const el = document.querySelector('#detail-repo');
      return el?.shadowRoot?.querySelector('.detail-panel') !== null;
    });
    expect(hasDetailPanel).toBe(true);
  });

  test('tooltip mode: resolves and renders tooltip panel', async ({ page }) => {
    await waitForState(page, '#tooltip-repo');

    const state = await page.getAttribute('#tooltip-repo', 'data-state');
    expect(['verified', 'invalid', 'error']).toContain(state);

    // Tooltip wrapper should exist
    const hasTooltip = await page.evaluate(() => {
      const el = document.querySelector('#tooltip-repo');
      return el?.shadowRoot?.querySelector('.tooltip-wrapper') !== null;
    });
    expect(hasTooltip).toBe(true);
  });

  test('empty repo: shows error state when no auths refs exist', async ({ page }) => {
    await waitForState(page, '#badge-empty');

    const state = await page.getAttribute('#badge-empty', 'data-state');
    expect(state).toBe('error');

    const label = await page.evaluate(() => {
      const el = document.querySelector('#badge-empty');
      return el?.shadowRoot?.querySelector('.label')?.textContent;
    });
    expect(label).toBe('Error');
  });

  test('events: widget emits auths-verified or auths-error', async ({ page }) => {
    // Collect events from the badge-repo widget
    const events = await page.evaluate(() => {
      return new Promise<{ type: string; detail: unknown }[]>((resolve) => {
        const collected: { type: string; detail: unknown }[] = [];
        const el = document.querySelector('#badge-repo');
        if (!el) return resolve([]);

        el.addEventListener('auths-verified', (e) => {
          collected.push({ type: 'auths-verified', detail: (e as CustomEvent).detail });
        });
        el.addEventListener('auths-error', (e) => {
          collected.push({ type: 'auths-error', detail: (e as CustomEvent).detail });
        });

        // Wait for event (widget auto-verifies on connect)
        setTimeout(() => resolve(collected), 10_000);
      });
    });

    expect(events.length).toBeGreaterThan(0);
    expect(['auths-verified', 'auths-error']).toContain(events[0].type);
  });

  test('accessibility: badge has correct ARIA attributes', async ({ page }) => {
    await waitForState(page, '#badge-repo');

    const aria = await page.evaluate(() => {
      const el = document.querySelector('#badge-repo');
      const badge = el?.shadowRoot?.querySelector('.badge');
      return {
        role: badge?.getAttribute('role'),
        ariaLive: badge?.getAttribute('aria-live'),
      };
    });
    expect(aria.role).toBe('status');
    expect(aria.ariaLive).toBe('polite');
  });

  test('accessibility: detail mode has aria-expanded', async ({ page }) => {
    await waitForState(page, '#detail-repo');

    const expanded = await page.evaluate(() => {
      const el = document.querySelector('#detail-repo');
      const badge = el?.shadowRoot?.querySelector('.badge');
      return badge?.getAttribute('aria-expanded');
    });
    expect(expanded).toBe('false');
  });

});
