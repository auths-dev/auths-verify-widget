import { describe, it, expect, vi, beforeEach } from 'vitest';
import { giteaAdapter } from '../../src/resolvers/gitea';
import type { ForgeConfig } from '../../src/resolvers/types';

const config: ForgeConfig = {
  type: 'gitea',
  baseUrl: 'https://git.example.com',
  owner: 'user',
  repo: 'project',
};

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

describe('giteaAdapter', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('should use Gitea API prefix for refs', async () => {
    global.fetch = mockFetch({
      '/api/v1/repos/user/project/git/refs/auths': [
        { ref: 'refs/auths/identity', object: { sha: 'abc123' } },
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
    // Some Gitea versions return a single object instead of array
    global.fetch = mockFetch({
      '/api/v1/repos/user/project/git/refs/auths': {
        ref: 'refs/auths/identity',
        object: { sha: 'abc123' },
      },
    });

    const refs = await giteaAdapter.listAuthsRefs(config);
    expect(refs).toHaveLength(1);
  });

  it('should resolve identity bundle', async () => {
    const identityJson = JSON.stringify({ controller_did: TEST_DID_KEY });
    const attestationJson = JSON.stringify({
      version: 1,
      rid: 'test',
      issuer: TEST_DID_KEY,
      subject: 'did:key:z6MkDev1',
    });

    global.fetch = mockFetch({
      'git/refs/auths': [
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

    const result = await giteaAdapter.resolve(config);
    expect(result.bundle).not.toBeNull();
    expect(result.bundle!.identity_did).toBe(TEST_DID_KEY);
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
