import { describe, it, expect, vi, beforeEach } from 'vitest';
import { githubAdapter } from '../../src/resolvers/github';
import type { ForgeConfig } from '../../src/resolvers/types';

const config: ForgeConfig = {
  type: 'github',
  baseUrl: 'https://api.github.com',
  owner: 'bordumb',
  repo: 'auths',
};

const RELEASE_MOCK = {
  assets: [
    {
      id: 42,
      name: 'hello.tar.gz.auths.json',
      browser_download_url:
        'https://github.com/bordumb/auths/releases/download/v0.0.1/hello.tar.gz.auths.json',
    },
  ],
};

const ATTESTATION = {
  version: 1,
  rid: 'sha256:abc123',
  issuer: 'did:keri:EXrBYxo2ovC9iZIKgXZhbiDvD21eAVwoLnlziitHeTiM',
  subject: 'did:key:z6MkDev1',
  device_public_key: 'abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234',
  identity_signature: 'sig1',
  device_signature: 'sig2',
};

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

/** Mock releases/latest + contents/ for the happy path */
function releaseMock() {
  return mockFetch({
    'releases/latest': RELEASE_MOCK,
    [`contents/${RELEASE_MOCK.assets[0].name}`]: {
      content: btoa(JSON.stringify(ATTESTATION)),
      encoding: 'base64',
    },
  });
}

describe('githubAdapter', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('should resolve identity from latest release', async () => {
    global.fetch = releaseMock();

    const result = await githubAdapter.resolve(config);
    expect(result.bundle).not.toBeNull();
    expect(result.bundle!.identity_did).toBe(ATTESTATION.issuer);
    expect(result.bundle!.public_key_hex).toBe(ATTESTATION.device_public_key);
    expect(result.bundle!.attestation_chain).toHaveLength(1);
  });

  it('should return error when no assets in release', async () => {
    global.fetch = mockFetch({
      'releases/latest': { assets: [] },
    });

    const result = await githubAdapter.resolve(config);
    expect(result.bundle).toBeNull();
    expect(result.error).toContain('No assets found');
  });

  it('should return error when no .auths.json asset found', async () => {
    global.fetch = mockFetch({
      'releases/latest': {
        assets: [{ id: 1, name: 'README.md', browser_download_url: 'https://example.com' }],
      },
    });

    const result = await githubAdapter.resolve(config);
    expect(result.bundle).toBeNull();
    expect(result.error).toContain('No .auths.json');
  });

  it('should fall back to asset API when contents API 404s', async () => {
    // releases/latest OK, contents/ will 404 (not in responses), asset API returns attestation
    global.fetch = mockFetch({
      'releases/latest': RELEASE_MOCK,
      [`releases/assets/${RELEASE_MOCK.assets[0].id}`]: ATTESTATION,
    });

    const result = await githubAdapter.resolve(config);
    expect(result.bundle).not.toBeNull();
    expect(result.bundle!.identity_did).toBe(ATTESTATION.issuer);
    expect(result.bundle!.public_key_hex).toBe(ATTESTATION.device_public_key);
    expect(result.bundle!.attestation_chain).toHaveLength(1);
  });

  it('should return error when attestation missing required fields', async () => {
    global.fetch = mockFetch({
      'releases/latest': RELEASE_MOCK,
      [`contents/${RELEASE_MOCK.assets[0].name}`]: {
        content: btoa(JSON.stringify({ version: 1 })),
        encoding: 'base64',
      },
    });

    const result = await githubAdapter.resolve(config);
    expect(result.bundle).toBeNull();
    expect(result.error).toContain('missing required fields');
  });

  it('should apply identity filter', async () => {
    global.fetch = releaseMock();

    const result = await githubAdapter.resolve(config, 'did:keri:EDifferentPrefix');
    expect(result.bundle).toBeNull();
    expect(result.error).toContain('does not match filter');
  });

  it('should return error when releases API fails (no releases)', async () => {
    global.fetch = mockFetch({});

    const result = await githubAdapter.resolve(config);
    expect(result.bundle).toBeNull();
    expect(result.error).toContain('GitHub API 404');
  });

  it('should return stub values for listAuthsRefs and readBlob', async () => {
    const refs = await githubAdapter.listAuthsRefs(config);
    expect(refs).toEqual([]);

    const blob = await githubAdapter.readBlob(config, 'any-sha');
    expect(blob).toBe('');
  });
});
