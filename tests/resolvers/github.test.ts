import { describe, it, expect, vi, beforeEach } from 'vitest';
import { githubAdapter } from '../../src/resolvers/github';
import type { ForgeConfig } from '../../src/resolvers/types';

const config: ForgeConfig = {
  type: 'github',
  baseUrl: 'https://api.github.com',
  owner: 'bordumb',
  repo: 'auths',
};

// Known did:key for test — we use a real-ish one
const TEST_DID_KEY = 'did:key:z6MkiTBz1ymuepAQ4HEHYSF1H8quG5GLVVQR3djdX3mDooWp';

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

describe('githubAdapter', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('should list auths refs', async () => {
    global.fetch = mockFetch({
      'matching-refs/auths/': [
        { ref: 'refs/auths/identity', object: { sha: 'abc123' } },
        { ref: 'refs/auths/keys/dev1/signatures', object: { sha: 'def456' } },
      ],
    });

    const refs = await githubAdapter.listAuthsRefs(config);
    expect(refs).toHaveLength(2);
    expect(refs[0]).toEqual({ ref: 'refs/auths/identity', sha: 'abc123' });
  });

  it('should read a blob with base64 decoding', async () => {
    const content = JSON.stringify({ controller_did: TEST_DID_KEY });
    const base64Content = btoa(content);

    global.fetch = mockFetch({
      'git/blobs/': { content: base64Content, encoding: 'base64' },
    });

    const blob = await githubAdapter.readBlob(config, 'sha123');
    expect(blob).toBe(content);
  });

  it('should resolve identity bundle from refs', async () => {
    const identityJson = JSON.stringify({ controller_did: TEST_DID_KEY });
    const attestationJson = JSON.stringify({
      version: 1,
      rid: 'test',
      issuer: TEST_DID_KEY,
      subject: 'did:key:z6MkDev1',
    });

    global.fetch = mockFetch({
      'matching-refs/auths/': [
        { ref: 'refs/auths/identity', object: { sha: 'commit1' } },
        { ref: 'refs/auths/keys/dev1/signatures', object: { sha: 'commit2' } },
      ],
      'git/commits/commit1': { tree: { sha: 'tree1' } },
      'git/trees/tree1': {
        tree: [{ path: 'identity.json', sha: 'blob1' }],
      },
      'git/blobs/blob1': { content: btoa(identityJson), encoding: 'base64' },
      'git/commits/commit2': { tree: { sha: 'tree2' } },
      'git/trees/tree2': {
        tree: [{ path: 'attestation.json', sha: 'blob2' }],
      },
      'git/blobs/blob2': { content: btoa(attestationJson), encoding: 'base64' },
    });

    const result = await githubAdapter.resolve(config);
    expect(result.bundle).not.toBeNull();
    expect(result.bundle!.identity_did).toBe(TEST_DID_KEY);
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

  it('should return error when identity ref is missing', async () => {
    global.fetch = mockFetch({
      'matching-refs/auths/': [
        { ref: 'refs/auths/keys/dev1', object: { sha: 'abc' } },
      ],
    });

    const result = await githubAdapter.resolve(config);
    expect(result.bundle).toBeNull();
    expect(result.error).toContain('No identity ref found');
  });

  it('should apply identity filter', async () => {
    const identityJson = JSON.stringify({ controller_did: TEST_DID_KEY });

    global.fetch = mockFetch({
      'matching-refs/auths/': [
        { ref: 'refs/auths/identity', object: { sha: 'commit1' } },
      ],
      'git/commits/commit1': { tree: { sha: 'tree1' } },
      'git/trees/tree1': {
        tree: [{ path: 'identity.json', sha: 'blob1' }],
      },
      'git/blobs/blob1': { content: btoa(identityJson), encoding: 'base64' },
    });

    const result = await githubAdapter.resolve(config, 'did:key:z6MkDifferent');
    expect(result.bundle).toBeNull();
    expect(result.error).toContain('does not match filter');
  });

  it('should return error for non did:key identities', async () => {
    const identityJson = JSON.stringify({ controller_did: 'did:keri:EOrg123' });

    global.fetch = mockFetch({
      'matching-refs/auths/': [
        { ref: 'refs/auths/identity', object: { sha: 'commit1' } },
      ],
      'git/commits/commit1': { tree: { sha: 'tree1' } },
      'git/trees/tree1': {
        tree: [{ path: 'identity.json', sha: 'blob1' }],
      },
      'git/blobs/blob1': { content: btoa(identityJson), encoding: 'base64' },
    });

    const result = await githubAdapter.resolve(config);
    expect(result.bundle).toBeNull();
    expect(result.error).toContain('Only did:key is supported');
  });
});
