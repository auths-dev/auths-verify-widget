/**
 * Gitea adapter — resolves auths identity data via Gitea REST API.
 *
 * Reads from refs/auths/registry — structured tree with:
 *   v1/identities/XX/YY/<prefix>/state.json  (KERI identity state)
 *   v1/devices/XX/YY/<did>/attestation.json   (device attestations)
 *
 * Base URL is configurable for self-hosted instances.
 */

import type { ForgeAdapter } from './adapter';
import type { ForgeConfig, RefEntry, ResolveResult } from './types';
import { cesrToPublicKeyHex } from './did-utils';

const REGISTRY_REF = 'refs/auths/registry';

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
    const url = `${config.baseUrl}/api/v1/repos/${config.owner}/${config.repo}/git/refs/auths`;
    const res = await giteaFetch(url);
    const data: Array<{ ref: string; object: { sha: string } }> = await res.json();
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

      const registryRef = refs.find((r) => r.ref === REGISTRY_REF);
      if (!registryRef) {
        return { bundle: null, error: 'No registry ref found (refs/auths/registry)' };
      }

      const commitUrl = `${config.baseUrl}/api/v1/repos/${config.owner}/${config.repo}/git/commits/${registryRef.sha}`;
      const commitRes = await giteaFetch(commitUrl);
      const commit: { tree: { sha: string } } = await commitRes.json();

      const treeUrl = `${config.baseUrl}/api/v1/repos/${config.owner}/${config.repo}/git/trees/${commit.tree.sha}?recursive=1`;
      const treeRes = await giteaFetch(treeUrl);
      const tree: { tree: Array<{ path: string; sha: string; type: string }> } = await treeRes.json();

      const stateEntry = tree.tree.find(
        (e) => e.type === 'blob' && /^v1\/identities\/[^/]{2}\/[^/]{2}\/[^/]+\/state\.json$/.test(e.path),
      );
      if (!stateEntry) {
        return { bundle: null, error: 'No identity state found in registry' };
      }

      const keriPrefix = stateEntry.path.split('/')[4];
      const controllerDid = `did:keri:${keriPrefix}`;

      if (identityFilter && controllerDid !== identityFilter) {
        return {
          bundle: null,
          error: `Identity ${controllerDid} does not match filter ${identityFilter}`,
        };
      }

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
