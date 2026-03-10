/**
 * GitHub adapter — resolves auths identity data via GitHub REST API.
 *
 * Reads from refs/auths/registry — structured tree with:
 *   v1/identities/XX/YY/<prefix>/state.json  (KERI identity state)
 *   v1/devices/XX/YY/<did>/attestation.json   (device attestations)
 */

import type { ForgeAdapter } from './adapter';
import type { ForgeConfig, RefEntry, ResolveResult } from './types';
import { cesrToPublicKeyHex } from './did-utils';

const REGISTRY_REF = 'refs/auths/registry';

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

      const registryRef = refs.find((r) => r.ref === REGISTRY_REF);
      if (!registryRef) {
        return { bundle: null, error: 'No registry ref found (refs/auths/registry)' };
      }

      // Get commit → tree SHA
      const commitUrl = `${config.baseUrl}/repos/${config.owner}/${config.repo}/git/commits/${registryRef.sha}`;
      const commitRes = await githubFetch(commitUrl);
      const commit: { tree: { sha: string } } = await commitRes.json();

      // Get full recursive tree
      const treeUrl = `${config.baseUrl}/repos/${config.owner}/${config.repo}/git/trees/${commit.tree.sha}?recursive=1`;
      const treeRes = await githubFetch(treeUrl);
      const tree: { tree: Array<{ path: string; sha: string; type: string }> } = await treeRes.json();

      // Find identity state.json
      const stateEntry = tree.tree.find(
        (e) => e.type === 'blob' && /^v1\/identities\/[^/]{2}\/[^/]{2}\/[^/]+\/state\.json$/.test(e.path),
      );
      if (!stateEntry) {
        return { bundle: null, error: 'No identity state found in registry' };
      }

      // Extract KERI prefix from path: v1/identities/XX/YY/<prefix>/state.json
      const keriPrefix = stateEntry.path.split('/')[4];
      const controllerDid = `did:keri:${keriPrefix}`;

      if (identityFilter && controllerDid !== identityFilter) {
        return {
          bundle: null,
          error: `Identity ${controllerDid} does not match filter ${identityFilter}`,
        };
      }

      // Read state.json to get current public key (CESR-encoded)
      const stateBlob = await this.readBlob(config, stateEntry.sha);
      const state = JSON.parse(stateBlob);
      const currentKeyCesr: string | undefined = state.state?.current_keys?.[0];

      if (!currentKeyCesr) {
        return { bundle: null, error: 'No current key found in identity state' };
      }

      let publicKeyHex: string;
      try {
        publicKeyHex = cesrToPublicKeyHex(currentKeyCesr);
      } catch (err) {
        return {
          bundle: null,
          error: `Failed to decode CESR key: ${err instanceof Error ? err.message : String(err)}`,
        };
      }

      // Find all device attestation.json blobs
      const attestationEntries = tree.tree.filter(
        (e) => e.type === 'blob' && /^v1\/devices\/[^/]{2}\/[^/]{2}\/[^/]+\/attestation\.json$/.test(e.path),
      );

      const attestationChain: object[] = [];
      for (const entry of attestationEntries) {
        try {
          const blob = await this.readBlob(config, entry.sha);
          attestationChain.push(JSON.parse(blob));
        } catch {
          // Skip unreadable attestations
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
