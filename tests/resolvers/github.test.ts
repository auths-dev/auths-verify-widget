import { describe, it, expect, vi, beforeEach } from 'vitest';
import { githubAdapter } from '../../src/resolvers/github';
import type { ForgeConfig } from '../../src/resolvers/types';

const config: ForgeConfig = {
  type: 'github',
  baseUrl: 'https://api.github.com',
  owner: 'bordumb',
  repo: 'auths',
};

// CESR-encoded Ed25519 key for registry format
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

/** Standard mock for a registry with one identity and one device */
function registryMock() {
  return mockFetch({
    'matching-refs/auths/': [
      { ref: 'refs/auths/registry', object: { sha: 'commit-reg' } },
    ],
    'git/commits/commit-reg': { tree: { sha: 'tree-reg' } },
    [`git/trees/tree-reg?recursive=1`]: {
      tree: [
        { path: `v1/identities/EX/rB/${TEST_KERI_PREFIX}/state.json`, sha: 'blob-state', type: 'blob' },
        { path: `v1/devices/z6/Mk/did_key_z6MkDev1/attestation.json`, sha: 'blob-att', type: 'blob' },
        { path: `v1/identities/EX/rB/${TEST_KERI_PREFIX}`, sha: 'tree-id', type: 'tree' },
        { path: 'v1/metadata.json', sha: 'blob-meta', type: 'blob' },
      ],
    },
    'git/blobs/blob-state': { content: btoa(STATE_JSON), encoding: 'base64' },
    'git/blobs/blob-att': { content: btoa(ATTESTATION_JSON), encoding: 'base64' },
  });
}

describe('githubAdapter', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('should list auths refs', async () => {
    global.fetch = mockFetch({
      'matching-refs/auths/': [
        { ref: 'refs/auths/registry', object: { sha: 'abc123' } },
      ],
    });

    const refs = await githubAdapter.listAuthsRefs(config);
    expect(refs).toHaveLength(1);
    expect(refs[0]).toEqual({ ref: 'refs/auths/registry', sha: 'abc123' });
  });

  it('should read a blob with base64 decoding', async () => {
    const content = JSON.stringify({ test: true });
    global.fetch = mockFetch({
      'git/blobs/': { content: btoa(content), encoding: 'base64' },
    });

    const blob = await githubAdapter.readBlob(config, 'sha123');
    expect(blob).toBe(content);
  });

  it('should resolve identity from registry', async () => {
    global.fetch = registryMock();

    const result = await githubAdapter.resolve(config);
    expect(result.bundle).not.toBeNull();
    expect(result.bundle!.identity_did).toBe(`did:keri:${TEST_KERI_PREFIX}`);
    expect(result.bundle!.public_key_hex).toMatch(/^[0-9a-f]{64}$/);
    expect(result.bundle!.attestation_chain).toHaveLength(1);
  });

  it('should return error when no auths refs exist', async () => {
    global.fetch = mockFetch({
      'matching-refs/auths/': [],
    });

    const result = await githubAdapter.resolve(config);
    expect(result.bundle).toBeNull();
    expect(result.error).toContain('No auths refs found');
  });

  it('should return error when registry ref is missing', async () => {
    global.fetch = mockFetch({
      'matching-refs/auths/': [
        { ref: 'refs/auths/something-else', object: { sha: 'abc' } },
      ],
    });

    const result = await githubAdapter.resolve(config);
    expect(result.bundle).toBeNull();
    expect(result.error).toContain('No registry ref found');
  });

  it('should return error when registry has no identity state', async () => {
    global.fetch = mockFetch({
      'matching-refs/auths/': [
        { ref: 'refs/auths/registry', object: { sha: 'commit-reg' } },
      ],
      'git/commits/commit-reg': { tree: { sha: 'tree-reg' } },
      [`git/trees/tree-reg?recursive=1`]: {
        tree: [
          { path: 'v1/metadata.json', sha: 'blob-meta', type: 'blob' },
        ],
      },
    });

    const result = await githubAdapter.resolve(config);
    expect(result.bundle).toBeNull();
    expect(result.error).toContain('No identity state found');
  });

  it('should apply identity filter', async () => {
    global.fetch = registryMock();

    const result = await githubAdapter.resolve(config, 'did:keri:EDifferentPrefix');
    expect(result.bundle).toBeNull();
    expect(result.error).toContain('does not match filter');
  });

  it('should resolve with zero attestations', async () => {
    global.fetch = mockFetch({
      'matching-refs/auths/': [
        { ref: 'refs/auths/registry', object: { sha: 'commit-reg' } },
      ],
      'git/commits/commit-reg': { tree: { sha: 'tree-reg' } },
      [`git/trees/tree-reg?recursive=1`]: {
        tree: [
          { path: `v1/identities/EX/rB/${TEST_KERI_PREFIX}/state.json`, sha: 'blob-state', type: 'blob' },
        ],
      },
      'git/blobs/blob-state': { content: btoa(STATE_JSON), encoding: 'base64' },
    });

    const result = await githubAdapter.resolve(config);
    expect(result.bundle).not.toBeNull();
    expect(result.bundle!.attestation_chain).toHaveLength(0);
  });
});
