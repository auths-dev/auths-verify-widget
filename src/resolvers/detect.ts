import type { ForgeConfig, ForgeType } from './types';

/**
 * Parse a repository URL and detect the forge type.
 *
 * The canonical, recommended input is a full URL — `https://github.com/owner/repo`.
 * For robustness it also normalizes the messy forms people actually paste:
 *
 * - `https://github.com/owner/repo` (+ `.git`, trailing `/`, `/tree/main`, `?x#y`)
 * - `github.com/owner/repo` (protocol-less host — `https://` is assumed)
 * - `owner/repo` and `owner/repo.git` (shorthand — assumed GitHub, since Gitea/
 *   GitLab need a host)
 *
 * Detection: github.com → github · gitlab.com → gitlab · any other host → gitea
 * (self-hosted). `forgeHint` overrides auto-detection.
 *
 * Known limitation: only the first two path segments are used, so GitLab
 * subgroups (`group/subgroup/repo`) are not resolved.
 */
export function detectForge(repoUrl: string, forgeHint?: string): ForgeConfig | null {
  let input = repoUrl.trim();
  if (!input) return null;

  // Protocol-less host paste (e.g. "github.com/owner/repo"): if the first path
  // segment looks like a host (contains a dot), treat the whole thing as a URL.
  // A bare "owner/repo" shorthand has no dot before its first slash, so it is
  // left alone (repo names may still contain dots, e.g. "owner/my.repo").
  if (!/^https?:\/\//.test(input) && /^[^/]+\.[^/]+\//.test(input)) {
    input = `https://${input}`;
  }

  const isFullUrl = /^https?:\/\//.test(input);

  let url: URL | null = null;
  if (isFullUrl) {
    try {
      url = new URL(input);
    } catch {
      return null;
    }
  }

  let owner: string;
  let repo: string;

  if (url) {
    // URL parsing already drops ?query and #hash; take the first two path segments.
    const segments = url.pathname.split('/').filter(Boolean);
    if (segments.length < 2) return null;
    owner = segments[0];
    repo = segments[1];
  } else {
    // "owner/repo" shorthand (trailing slashes are filtered out by split).
    const parts = input.split('/').filter(Boolean);
    if (parts.length < 2) return null;
    owner = parts[0];
    repo = parts[1];
  }

  // Normalize the repo segment: strip a trailing ".git" clone suffix.
  repo = repo.replace(/\.git$/, '');
  if (!owner || !repo) return null;

  let type: ForgeType;
  let baseUrl: string;

  if (forgeHint) {
    type = forgeHint as ForgeType;
  } else if (url) {
    const host = url.hostname.toLowerCase();
    if (host === 'github.com') {
      type = 'github';
    } else if (host === 'gitlab.com') {
      type = 'gitlab';
    } else {
      type = 'gitea';
    }
  } else {
    // Shorthand without forge hint — assume GitHub
    type = 'github';
  }

  switch (type) {
    case 'github':
      baseUrl = 'https://api.github.com';
      break;
    case 'gitlab':
      baseUrl = url ? `${url.protocol}//${url.host}` : 'https://gitlab.com';
      break;
    case 'gitea':
      if (!url) return null; // Gitea requires full URL for self-hosted
      baseUrl = `${url.protocol}//${url.host}`;
      break;
    default:
      return null;
  }

  return { type, baseUrl, owner, repo };
}
