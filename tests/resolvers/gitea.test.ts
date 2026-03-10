import { describe, it, expect, vi, beforeEach } from 'vitest';
import { giteaAdapter } from '../../src/resolvers/gitea';
import type { ForgeConfig } from '../../src/resolvers/types';

const config: ForgeConfig = {
  type: 'gitea',
  baseUrl: 'https://git.example.com',
  owner: 'user',
  repo: 'project',
};

const TEST_CESR_KEY = 'DQIS37c2Ar3CzozrmU9KpbUWBYWMJhBWPV-wN50i-RGI';
const TEST_KERI_PREFIX = 'EXrBYxo2ovC9iZIKgXZhbiDvD21eAVwoLnlziitHeTiM';

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
  subject: 'did:key:z6MkDev1',
  device_public_key: 'abcd1234',
  identity_signature: 'sig1',
  device_signature: 'sig2',
});

function mockFetch(responses: Record<string, unknown>) {
  return vi.fn(async (url: string) => {
    for (const [pattern, data] of Object.entries(responses)) {
      if (url.includes(pattern)) {
        return {
          ok: true,
          json: async () => data,
        } as Response;
      }
    }
    return {
      ok: false,
      status: 404,
      statusText: 'Not Found',
    } as Response;
  });
}

describe('giteaAdapter', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('should use Gitea API prefix for refs', async () => {
    global.fetch = mockFetch({
      '/api/v1/repos/user/project/git/refs/auths': [
        { ref: 'refs/auths/registry', object: { sha: 'abc123' } },
      ],
    });

    const refs = await giteaAdapter.listAuthsRefs(config);
    expect(refs).toHaveLength(1);
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/v1/repos/'),
      expect.anything(),
    );
  });

  it('should handle single-object response from Gitea', async () => {
    global.fetch = mockFetch({
      '/api/v1/repos/user/project/git/refs/auths': {
        ref: 'refs/auths/registry',
        object: { sha: 'abc123' },
      },
    });

    const refs = await giteaAdapter.listAuthsRefs(config);
    expect(refs).toHaveLength(1);
  });

  it('should resolve identity from registry', async () => {
    global.fetch = mockFetch({
      'git/refs/auths': [
        { ref: 'refs/auths/registry', object: { sha: 'commit-reg' } },
      ],
      'git/commits/commit-reg': { tree: { sha: 'tree-reg' } },
      [`git/trees/tree-reg?recursive=1`]: {
        tree: [
          { path: `v1/identities/EX/rB/${TEST_KERI_PREFIX}/state.json`, sha: 'blob-state', type: 'blob' },
          { path: `v1/devices/z6/Mk/did_key_z6MkDev1/attestation.json`, sha: 'blob-att', type: 'blob' },
        ],
      },
      'git/blobs/blob-state': { content: btoa(STATE_JSON), encoding: 'base64' },
      'git/blobs/blob-att': { content: btoa(ATTESTATION_JSON), encoding: 'base64' },
    });

    const result = await giteaAdapter.resolve(config);
    expect(result.bundle).not.toBeNull();
    expect(result.bundle!.identity_did).toBe(`did:keri:${TEST_KERI_PREFIX}`);
    expect(result.bundle!.public_key_hex).toMatch(/^[0-9a-f]{64}$/);
    expect(result.bundle!.attestation_chain).toHaveLength(1);
  });

  it('should return error when no auths refs exist', async () => {
    global.fetch = mockFetch({
      'git/refs/auths': [],
    });

    const result = await giteaAdapter.resolve(config);
    expect(result.bundle).toBeNull();
    expect(result.error).toContain('No auths refs found');
  });

  it('should use configurable base URL', async () => {
    const customConfig: ForgeConfig = {
      type: 'gitea',
      baseUrl: 'https://my-gitea.internal:3000',
      owner: 'org',
      repo: 'code',
    };

    global.fetch = mockFetch({
      'my-gitea.internal:3000/api/v1/repos/org/code/git/refs/auths': [],
    });

    await giteaAdapter.resolve(customConfig);
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('my-gitea.internal:3000'),
      expect.anything(),
    );
  });
});
