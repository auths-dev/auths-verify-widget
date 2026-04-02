/**
 * GitHub adapter — resolves auths attestations from GitHub Releases.
 *
 * Workflow:
 *   1. Fetch latest release via GitHub API
 *   2. Find the *.auths.json release asset
 *   3. Use device_public_key from the attestation as the verification key
 *
 * The attestation file is self-contained for device-only attestations
 * (no identity_signature): device_signature is verified against
 * device_public_key, both of which are in the file.
 */

import type { ForgeAdapter } from './adapter';
import type { ForgeConfig, RefEntry, ResolveResult } from './types';

async function githubFetch(url: string, accept?: string): Promise<Response> {
  const res = await fetch(url, {
    headers: { Accept: accept || 'application/vnd.github.v3+json' },
  });
  if (!res.ok) {
    throw new Error(`GitHub API ${res.status}: ${res.statusText} (${url})`);
  }
  return res;
}

export const githubAdapter: ForgeAdapter = {
  /**
   * Not used in release-asset-based resolution.
   * GitHub adapter resolves from /releases/latest, not from Git refs.
   * Kept as stub for ForgeAdapter interface compatibility (Gitea uses these).
   */
  async listAuthsRefs(_config: ForgeConfig): Promise<RefEntry[]> {
    return [];
  },

  /** @see listAuthsRefs — same rationale */
  async readBlob(_config: ForgeConfig, _sha: string): Promise<string> {
    return '';
  },

  async resolve(config: ForgeConfig, identityFilter?: string): Promise<ResolveResult> {
    try {
      // Fetch latest release
      const releaseUrl = `${config.baseUrl}/repos/${config.owner}/${config.repo}/releases/latest`;
      const releaseRes = await githubFetch(releaseUrl);
      const release: { assets: Array<{ id: number; name: string; browser_download_url: string }> } =
        await releaseRes.json();

      if (!release.assets || release.assets.length === 0) {
        return { bundle: null, error: 'No assets found in latest release' };
      }

      // Find *.auths.json asset
      const attestationAsset = release.assets.find((a) => a.name.endsWith('.auths.json'));
      if (!attestationAsset) {
        return { bundle: null, error: 'No .auths.json attestation found in latest release' };
      }

      // Try to download attestation via Contents API (works if file is committed to repo)
      // Fall back to asset API endpoint if not found (for repos with assets only)
      let attestation: {
        issuer: string;
        subject: string;
        device_public_key: string;
      };

      try {
        const contentsUrl = `${config.baseUrl}/repos/${config.owner}/${config.repo}/contents/${attestationAsset.name}`;
        const contentsRes = await githubFetch(contentsUrl);
        const contentsData: { content: string } = await contentsRes.json();
        attestation = JSON.parse(atob(contentsData.content.replace(/\n/g, '')));
      } catch {
        // Fall back to asset API endpoint if file not in tree
        const assetUrl = `${config.baseUrl}/repos/${config.owner}/${config.repo}/releases/assets/${attestationAsset.id}`;
        const assetRes = await githubFetch(assetUrl, 'application/octet-stream');
        attestation = await assetRes.json();
      }

      if (!attestation.issuer || !attestation.device_public_key) {
        return { bundle: null, error: 'Attestation missing required fields (issuer, device_public_key)' };
      }

      if (identityFilter && attestation.issuer !== identityFilter) {
        return {
          bundle: null,
          error: `Issuer ${attestation.issuer} does not match filter ${identityFilter}`,
        };
      }

      // device_public_key is used as the root key.
      // For device-only attestations (no identity_signature), the verifier
      // skips the identity check and only verifies device_signature against
      // device_public_key — both present in the file.
      return {
        bundle: {
          identity_did: attestation.issuer,
          public_key_hex: attestation.device_public_key,
          attestation_chain: [attestation],
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
