/**
 * Gitea adapter — resolves auths identity data via Gitea REST API.
 *
 * Mirrors the GitHub adapter with Gitea-specific API paths:
 *   /api/v1/repos/{owner}/{repo}/git/...
 *
 * Base URL is configurable for self-hosted instances.
 */

import type { ForgeAdapter } from './adapter';
import type { ForgeConfig, RefEntry, ResolveResult } from './types';
import { didKeyToPublicKeyHex } from './did-utils';

// Git ref constants — mirrors auths-id/src/storage/layout.rs
const IDENTITY_REF = 'refs/auths/identity';
const DEVICE_PREFIX = 'refs/auths/keys';
const IDENTITY_BLOB = 'identity.json';
const ATTESTATION_BLOB = 'attestation.json';

async function giteaFetch(url: string): Promise<Response> {
  const res = await fetch(url, {
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) {
    throw new Error(`Gitea API ${res.status}: ${res.statusText} (${url})`);
  }
  return res;
}

export const giteaAdapter: ForgeAdapter = {
  async listAuthsRefs(config: ForgeConfig): Promise<RefEntry[]> {
    // Gitea API: GET /api/v1/repos/{owner}/{repo}/git/refs/auths
    const url = `${config.baseUrl}/api/v1/repos/${config.owner}/${config.repo}/git/refs/auths`;
    const res = await giteaFetch(url);
    const data: Array<{ ref: string; object: { sha: string } }> = await res.json();
    // Gitea may return a single object or array depending on version
    const entries = Array.isArray(data) ? data : [data];
    return entries.map((entry) => ({ ref: entry.ref, sha: entry.object.sha }));
  },

  async readBlob(config: ForgeConfig, sha: string): Promise<string> {
    const url = `${config.baseUrl}/api/v1/repos/${config.owner}/${config.repo}/git/blobs/${sha}`;
    const res = await giteaFetch(url);
    const data: { content: string; encoding: string } = await res.json();
    if (data.encoding === 'base64') {
      return atob(data.content.replace(/\n/g, ''));
    }
    return data.content;
  },

  async resolve(config: ForgeConfig, identityFilter?: string): Promise<ResolveResult> {
    try {
      const refs = await this.listAuthsRefs(config);
      if (refs.length === 0) {
        return { bundle: null, error: 'No auths refs found in this repository' };
      }

      // Find and read identity ref
      const identityRef = refs.find((r) => r.ref === IDENTITY_REF);
      if (!identityRef) {
        return { bundle: null, error: 'No identity ref found (refs/auths/identity)' };
      }

      // Follow commit → tree → identity.json blob
      const identityBlob = await resolveTreeBlob(config, identityRef.sha, IDENTITY_BLOB);
      if (!identityBlob) {
        return { bundle: null, error: 'Could not read identity.json from identity ref' };
      }

      const identity = JSON.parse(identityBlob);
      const controllerDid: string = identity.controller_did ?? identity.identity_did;

      if (!controllerDid) {
        return { bundle: null, error: 'No controller_did found in identity.json' };
      }

      if (identityFilter && controllerDid !== identityFilter) {
        return {
          bundle: null,
          error: `Identity ${controllerDid} does not match filter ${identityFilter}`,
        };
      }

      // Extract public key from DID
      let publicKeyHex: string;
      if (controllerDid.startsWith('did:key:z')) {
        publicKeyHex = didKeyToPublicKeyHex(controllerDid);
      } else {
        return {
          bundle: null,
          error: `Cannot extract public key from ${controllerDid}. Only did:key is supported for auto-resolve.`,
        };
      }

      // Discover device attestation refs
      const deviceRefs = refs.filter((r) => r.ref.startsWith(DEVICE_PREFIX + '/'));
      const attestationChain: object[] = [];

      for (const deviceRef of deviceRefs) {
        try {
          const attestBlob = await resolveTreeBlob(config, deviceRef.sha, ATTESTATION_BLOB);
          if (attestBlob) {
            attestationChain.push(JSON.parse(attestBlob));
          }
        } catch {
          // Skip unreadable device refs
        }
      }

      return {
        bundle: {
          identity_did: controllerDid,
          public_key_hex: publicKeyHex,
          attestation_chain: attestationChain,
        },
      };
    } catch (err) {
      return {
        bundle: null,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  },
};

async function resolveTreeBlob(
  config: ForgeConfig,
  commitSha: string,
  blobName: string,
): Promise<string | null> {
  const commitUrl = `${config.baseUrl}/api/v1/repos/${config.owner}/${config.repo}/git/commits/${commitSha}`;
  const commitRes = await giteaFetch(commitUrl);
  const commit: { tree: { sha: string } } = await commitRes.json();

  const treeUrl = `${config.baseUrl}/api/v1/repos/${config.owner}/${config.repo}/git/trees/${commit.tree.sha}`;
  const treeRes = await giteaFetch(treeUrl);
  const tree: { tree: Array<{ path: string; sha: string }> } = await treeRes.json();

  const blobEntry = tree.tree.find((t) => t.path === blobName);
  if (!blobEntry) return null;

  return giteaAdapter.readBlob(config, blobEntry.sha);
}
