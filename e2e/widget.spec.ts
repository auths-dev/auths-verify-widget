import { test, expect, type Page } from '@playwright/test';

// ---------------------------------------------------------------------------
// Mock data — matches the registry format (refs/auths/registry)
// ---------------------------------------------------------------------------

const TEST_KERI_PREFIX = 'EXrBYxo2ovC9iZIKgXZhbiDvD21eAVwoLnlziitHeTiM';
const TEST_CESR_KEY = 'DQIS37c2Ar3CzozrmU9KpbUWBYWMJhBWPV-wN50i-RGI';

const STATE_JSON = JSON.stringify({
  version: 1,
  state: {
    prefix: TEST_KERI_PREFIX,
    current_keys: [TEST_CESR_KEY],
    sequence: 0,
  },
});

const ATTESTATION_JSON = JSON.stringify({
  version: 1,
  rid: '.auths',
  issuer: `did:keri:${TEST_KERI_PREFIX}`,
  subject: 'did:key:z6MkDev1Device',
  device_public_key: 'abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234',
  identity_signature: 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef',
  device_signature: 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef',
  timestamp: '2025-01-01T00:00:00Z',
});

const STATE_B64 = btoa(STATE_JSON);
const ATTESTATION_B64 = btoa(ATTESTATION_JSON);

// ---------------------------------------------------------------------------
// Route handler: mocks the GitHub REST API for forge adapter (registry format)
// ---------------------------------------------------------------------------

async function mockGitHubAPI(page: Page) {
  await page.route('https://api.github.com/**', async (route) => {
    const url = route.request().url();

    // 1. List refs — GET /repos/{owner}/{repo}/git/matching-refs/auths/
    if (url.includes('test-org/test-repo/git/matching-refs/auths/')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          { ref: 'refs/auths/registry', object: { sha: 'commit-registry' } },
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
    if (url.includes('git/commits/commit-registry')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ tree: { sha: 'tree-registry' } }),
      });
    }

    // 3. Get recursive tree → all blobs in registry
    if (url.includes('git/trees/tree-registry')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          tree: [
            { path: `v1/identities/EX/rB/${TEST_KERI_PREFIX}/state.json`, sha: 'blob-state', type: 'blob' },
            { path: `v1/devices/z6/Mk/did_key_z6MkDev1Device/attestation.json`, sha: 'blob-attestation', type: 'blob' },
            { path: 'v1/metadata.json', sha: 'blob-meta', type: 'blob' },
          ],
        }),
      });
    }

    // 4. Read blobs
    if (url.includes('git/blobs/blob-state')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ content: STATE_B64, encoding: 'base64' }),
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

  test('badge mode: resolves identity from mocked registry and reaches terminal state', async ({ page }) => {
    await waitForState(page, '#badge-repo');

    const state = await page.getAttribute('#badge-repo', 'data-state');
    // The widget fetched registry, read state.json, attempted WASM verification.
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
