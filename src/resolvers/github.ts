/**
 * GitHub adapter — resolves auths identity data via GitHub REST API.
 *
 * Resolution flow (matches Rust ref layout from layout.rs):
 * 1. List refs under refs/auths/
 * 2. Read identity ref → commit → tree → identity.json blob
 * 3. Extract public key from controller DID (did:key:z...)
 * 4. Discover device attestation refs
 * 5. Read attestation.json blobs for each device
 * 6. Return IdentityBundle
 */

import type { ForgeAdapter } from './adapter';
import type { ForgeConfig, RefEntry, ResolveResult } from './types';
import { didKeyToPublicKeyHex, sanitizeDidForRef } from './did-utils';

// Git ref constants — mirrors auths-id/src/storage/layout.rs
const IDENTITY_REF = 'refs/auths/identity';
const DEVICE_PREFIX = 'refs/auths/keys';
const IDENTITY_BLOB = 'identity.json';
const ATTESTATION_BLOB = 'attestation.json';

async function githubFetch(url: string): Promise<Response> {
  const res = await fetch(url, {
    headers: { Accept: 'application/vnd.github.v3+json' },
  });
  if (!res.ok) {
    throw new Error(`GitHub API ${res.status}: ${res.statusText} (${url})`);
  }
  return res;
}

export const githubAdapter: ForgeAdapter = {
  async listAuthsRefs(config: ForgeConfig): Promise<RefEntry[]> {
    const url = `${config.baseUrl}/repos/${config.owner}/${config.repo}/git/matching-refs/auths/`;
    const res = await githubFetch(url);
    const data: Array<{ ref: string; object: { sha: string } }> = await res.json();
    return data.map((entry) => ({ ref: entry.ref, sha: entry.object.sha }));
  },

  async readBlob(config: ForgeConfig, sha: string): Promise<string> {
    const url = `${config.baseUrl}/repos/${config.owner}/${config.repo}/git/blobs/${sha}`;
    const res = await githubFetch(url);
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

      // Step 1: Find and read identity ref
      const identityRef = refs.find((r) => r.ref === IDENTITY_REF);
      if (!identityRef) {
        return { bundle: null, error: 'No identity ref found (refs/auths/identity)' };
      }

      // Follow commit → tree → identity.json blob
      const identityBlob = await resolveTreeBlob(
        config,
        identityRef.sha,
        IDENTITY_BLOB,
      );
      if (!identityBlob) {
        return { bundle: null, error: 'Could not read identity.json from identity ref' };
      }

      const identity = JSON.parse(identityBlob);
      const controllerDid: string = identity.controller_did ?? identity.identity_did;

      if (!controllerDid) {
        return { bundle: null, error: 'No controller_did found in identity.json' };
      }

      // Apply identity filter if provided
      if (identityFilter && controllerDid !== identityFilter) {
        return {
          bundle: null,
          error: `Identity ${controllerDid} does not match filter ${identityFilter}`,
        };
      }

      // Step 2: Extract public key from DID
      let publicKeyHex: string;
      if (controllerDid.startsWith('did:key:z')) {
        publicKeyHex = didKeyToPublicKeyHex(controllerDid);
      } else {
        return {
          bundle: null,
          error: `Cannot extract public key from ${controllerDid}. Only did:key is supported for auto-resolve.`,
        };
      }

      // Step 3: Discover device attestation refs
      const deviceRefs = refs.filter((r) => r.ref.startsWith(DEVICE_PREFIX + '/'));
      const attestationChain: object[] = [];

      for (const deviceRef of deviceRefs) {
        // Only process refs that end with a blob-bearing path
        // Device ref pattern: refs/auths/keys/<sanitized_did>/signatures
        try {
          const attestBlob = await resolveTreeBlob(
            config,
            deviceRef.sha,
            ATTESTATION_BLOB,
          );
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

/**
 * Follow a commit SHA → tree SHA → find a specific blob in the tree → read it.
 */
async function resolveTreeBlob(
  config: ForgeConfig,
  commitSha: string,
  blobName: string,
): Promise<string | null> {
  // Get commit to find tree SHA
  const commitUrl = `${config.baseUrl}/repos/${config.owner}/${config.repo}/git/commits/${commitSha}`;
  const commitRes = await githubFetch(commitUrl);
  const commit: { tree: { sha: string } } = await commitRes.json();

  // Get tree to find blob SHA
  const treeUrl = `${config.baseUrl}/repos/${config.owner}/${config.repo}/git/trees/${commit.tree.sha}`;
  const treeRes = await githubFetch(treeUrl);
  const tree: { tree: Array<{ path: string; sha: string }> } = await treeRes.json();

  const blobEntry = tree.tree.find((t) => t.path === blobName);
  if (!blobEntry) return null;

  // Read blob content
  return githubAdapter.readBlob(config, blobEntry.sha);
}
