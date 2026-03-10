import type { ForgeConfig, ForgeType } from './types';

/**
 * Parse a repository URL and detect the forge type.
 *
 * - github.com → github
 * - gitlab.com → gitlab
 * - Unknown host → defaults to gitea (self-hosted)
 * - forgeHint overrides auto-detection
 */
export function detectForge(repoUrl: string, forgeHint?: string): ForgeConfig | null {
  // Detect shorthand "owner/repo" — no protocol means not a real URL
  const isFullUrl = /^https?:\/\//.test(repoUrl);

  let url: URL | null = null;
  if (isFullUrl) {
    try {
      url = new URL(repoUrl);
    } catch {
      return null;
    }
  }

  let owner: string;
  let repo: string;

  if (url) {
    const path = url.pathname.replace(/\.git$/, '').replace(/\/$/, '');
    const segments = path.split('/').filter(Boolean);
    if (segments.length < 2) return null;
    owner = segments[0];
    repo = segments[1];
  } else {
    // Handle "owner/repo" shorthand
    const parts = repoUrl.split('/').filter(Boolean);
    if (parts.length < 2) return null;
    owner = parts[0];
    repo = parts[1];
  }

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
