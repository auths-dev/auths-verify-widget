/**
 * E2E test: traces the full resolve pipeline against the live GitHub API.
 *
 * This test calls the real GitHub API (no mocks) to verify the widget
 * can resolve identity data from auths-dev/example-verify-badge.
 *
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

  // Step 2: listAuthsRefs (live API call)
  describe('Step 2: listAuthsRefs (live)', () => {
    it('finds refs/auths/registry', async () => {
      const config = detectForge(REPO_FULL_URL)!;
      const refs = await githubAdapter.listAuthsRefs(config);
      console.log('listAuthsRefs:', JSON.stringify(refs));
      expect(refs.length).toBeGreaterThan(0);
      const registryRef = refs.find(r => r.ref === 'refs/auths/registry');
      expect(registryRef).toBeDefined();
      console.log('registry ref SHA:', registryRef!.sha);
    });
  });

  // Step 3: full resolve (live API call)
  describe('Step 3: full resolve (live)', () => {
    it('resolves identity bundle from registry', async () => {
      const config = detectForge(REPO_FULL_URL)!;
      const result = await githubAdapter.resolve(config);
      console.log('resolve result:', JSON.stringify(result, null, 2));

      if (result.error) {
        console.error('RESOLVE ERROR:', result.error);
      }

      expect(result.error).toBeUndefined();
      expect(result.bundle).not.toBeNull();
      expect(result.bundle!.identity_did).toMatch(/^did:keri:/);
      expect(result.bundle!.public_key_hex).toMatch(/^[0-9a-f]{64}$/);
      console.log('identity_did:', result.bundle!.identity_did);
      console.log('public_key_hex:', result.bundle!.public_key_hex);
      console.log('attestation_chain length:', result.bundle!.attestation_chain.length);
    });
  });

  // Step 4: resolveFromRepo (the entry point the widget uses)
  describe('Step 4: resolveFromRepo (live)', () => {
    it('resolves via full URL', async () => {
      const result = await resolveFromRepo(REPO_FULL_URL);
      console.log('resolveFromRepo(full URL):', JSON.stringify(result, null, 2));
      if (result.error) console.error('ERROR:', result.error);
      expect(result.bundle).not.toBeNull();
    });

    it('resolves via shorthand', async () => {
      const result = await resolveFromRepo(REPO_SHORTHAND);
      console.log('resolveFromRepo(shorthand):', JSON.stringify(result, null, 2));
      if (result.error) console.error('ERROR:', result.error);
      expect(result.bundle).not.toBeNull();
    });

    it('resolves via shorthand + forge hint (what the demo uses)', async () => {
      const result = await resolveFromRepo(REPO_SHORTHAND, 'github');
      console.log('resolveFromRepo(shorthand + github hint):', JSON.stringify(result, null, 2));
      if (result.error) console.error('ERROR:', result.error);
      expect(result.bundle).not.toBeNull();
    });
  });

  // Step 5: CESR key decoding
  describe('Step 5: CESR decoding', () => {
    it('decodes the test CESR key', () => {
      const hex = cesrToPublicKeyHex('DQIS37c2Ar3CzozrmU9KpbUWBYWMJhBWPV-wN50i-RGI');
      console.log('CESR decoded hex:', hex);
      expect(hex).toMatch(/^[0-9a-f]{64}$/);
    });
  });
});
