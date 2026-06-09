/**
 * E2E test: traces the full resolve pipeline against the live GitHub API.
 *
 * This test calls the real GitHub API (no mocks) to verify the widget
 * can resolve attestation data from auths-dev/example-verify-badge.
 *
 * The GitHub adapter resolves from a `*.auths.json` GitHub **Release asset**
 * (not Git refs). Until that asset is published on the example repo, `resolve`
 * returns a well-formed "no asset" error rather than a bundle — so the resolve
 * steps below accept either a valid bundle or a well-formed error.
 *
 * Excluded from CI (live network + GitHub's 60 req/hr/IP unauthenticated limit).
 * Run with: npx vitest run tests/e2e/live-resolve.test.ts
 */
import { describe, it, expect } from 'vitest';
import { detectForge } from '../../src/resolvers/detect';
import { githubAdapter } from '../../src/resolvers/github';
import { cesrToPublicKeyHex } from '../../src/resolvers/did-utils';
import { resolveFromRepo } from '../../src/resolvers/resolver';

const REPO_SHORTHAND = 'auths-dev/example-verify-badge';
const REPO_FULL_URL = 'https://github.com/auths-dev/example-verify-badge';

describe('live resolve pipeline', () => {
  // Step 1: detectForge
  describe('Step 1: detectForge', () => {
    it('parses full URL', () => {
      const config = detectForge(REPO_FULL_URL);
      console.log('detectForge(full URL):', JSON.stringify(config));
      expect(config).not.toBeNull();
      expect(config!.type).toBe('github');
      expect(config!.owner).toBe('auths-dev');
      expect(config!.repo).toBe('example-verify-badge');
      expect(config!.baseUrl).toBe('https://api.github.com');
    });

    it('parses owner/repo shorthand', () => {
      const config = detectForge(REPO_SHORTHAND);
      console.log('detectForge(shorthand):', JSON.stringify(config));
      expect(config).not.toBeNull();
      expect(config!.type).toBe('github');
      expect(config!.owner).toBe('auths-dev');
      expect(config!.repo).toBe('example-verify-badge');
    });

    it('parses shorthand with forge hint', () => {
      const config = detectForge(REPO_SHORTHAND, 'github');
      console.log('detectForge(shorthand + hint):', JSON.stringify(config));
      expect(config).not.toBeNull();
      expect(config!.type).toBe('github');
    });
  });

  // Step 2: GitHub resolves from Release assets, not Git refs.
  // listAuthsRefs is an interface stub for the GitHub adapter — it returns [].
  describe('Step 2: listAuthsRefs is a stub for GitHub', () => {
    it('returns no refs (GitHub resolves from Release assets)', async () => {
      const config = detectForge(REPO_FULL_URL)!;
      const refs = await githubAdapter.listAuthsRefs(config);
      console.log('listAuthsRefs (GitHub stub):', JSON.stringify(refs));
      expect(refs).toEqual([]);
    });
  });

  // Step 3: full resolve (live API call) — from the latest Release's *.auths.json asset.
  describe('Step 3: full resolve (live)', () => {
    it('resolves a bundle from the Release asset, or returns a well-formed error', async () => {
      const config = detectForge(REPO_FULL_URL)!;
      const result = await githubAdapter.resolve(config);
      console.log('resolve result:', JSON.stringify(result, null, 2));

      if (result.bundle) {
        // 32-byte Ed25519 (64 hex) or 33-byte P-256 (66 hex) device key.
        expect(result.bundle.identity_did).toMatch(/^did:/);
        expect(result.bundle.public_key_hex).toMatch(/^[0-9a-f]{64,66}$/);
        expect(result.bundle.attestation_chain.length).toBeGreaterThan(0);
        console.log('identity_did:', result.bundle.identity_did);
        console.log('public_key_hex:', result.bundle.public_key_hex);
      } else {
        // Asset not published yet (see example-verify-badge / D-6).
        console.warn('RESOLVE returned no bundle:', result.error);
        expect(result.error).toMatch(/release|asset|\.auths\.json/i);
      }
    });
  });

  // Step 4: resolveFromRepo (the entry point the widget uses)
  describe('Step 4: resolveFromRepo (live)', () => {
    const expectWellFormed = (result: { bundle: unknown; error?: string }) => {
      // Either a resolved bundle or a well-formed error — never both null/undefined.
      expect(result.bundle != null || typeof result.error === 'string').toBe(true);
    };

    it('resolves via full URL', async () => {
      const result = await resolveFromRepo(REPO_FULL_URL);
      console.log('resolveFromRepo(full URL):', JSON.stringify(result, null, 2));
      expectWellFormed(result);
    });

    it('resolves via shorthand', async () => {
      const result = await resolveFromRepo(REPO_SHORTHAND);
      console.log('resolveFromRepo(shorthand):', JSON.stringify(result, null, 2));
      expectWellFormed(result);
    });

    it('resolves via shorthand + forge hint (what the demo uses)', async () => {
      const result = await resolveFromRepo(REPO_SHORTHAND, 'github');
      console.log('resolveFromRepo(shorthand + github hint):', JSON.stringify(result, null, 2));
      expectWellFormed(result);
    });
  });

  // Step 5: CESR key decoding (the key-extraction path used for Gitea refs).
  describe('Step 5: CESR decoding', () => {
    it('decodes the test CESR key', () => {
      const hex = cesrToPublicKeyHex('DQIS37c2Ar3CzozrmU9KpbUWBYWMJhBWPV-wN50i-RGI');
      console.log('CESR decoded hex:', hex);
      expect(hex).toMatch(/^[0-9a-f]{64}$/);
    });
  });
});
