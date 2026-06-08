/**
 * Pure embed-snippet builder for the Embed Builder page.
 *
 * Reuses `detectForge` (the single source of truth for repo-URL normalization)
 * so the generated snippet round-trips through the exact same parser the widget
 * uses at runtime. No URL parsing is re-implemented here.
 */
import { detectForge } from '../src/resolvers/detect';
import type { ForgeConfig } from '../src/resolvers/types';

// Keep VERSION + SRI in sync with the README CDN snippet and `npm run sri`.
export const VERSION = '0.3.0';
export const SRI = 'sha384-M1UJQ02k36YqkLbXIPrV98mCZKA7pm3J2TX5PNGwi+ZJwjcJC2CoKN8dCJZpe0+l';

export const cdnUrl = (version = VERSION): string =>
  `https://unpkg.com/@auths-dev/verify@${version}/dist/auths-verify.mjs`;

/** Reconstruct the canonical web URL (full form) from a ForgeConfig. */
export function canonicalRepoUrl(cfg: ForgeConfig): string {
  // GitHub's baseUrl is api.github.com; its web origin is github.com.
  const origin = cfg.type === 'github' ? 'https://github.com' : cfg.baseUrl;
  return `${origin}/${cfg.owner}/${cfg.repo}`;
}

export type BuildResult =
  | { ok: true; snippet: string; repo: string; forge: ForgeConfig['type'] }
  | { ok: false; error: string };

/**
 * Build the copy-paste embed (pinned + SRI `<script>` plus the `<auths-verify>`
 * element) for a pasted repo URL. Returns a validation error for unparseable
 * input.
 */
export function buildEmbed(input: string, forgeHint?: string): BuildResult {
  const raw = input.trim();
  if (!raw) {
    return { ok: false, error: 'Enter a repository URL.' };
  }

  const cfg = detectForge(raw, forgeHint || undefined);
  if (!cfg) {
    return {
      ok: false,
      error:
        'Could not parse that into owner/repo. Use a full URL (https://github.com/owner/repo) or owner/repo.',
    };
  }

  const repo = canonicalRepoUrl(cfg);

  // Emit a `forge` attribute only when the widget couldn't auto-detect the same
  // forge from the canonical URL (auto: github.com→github, gitlab.com→gitlab,
  // any other host→gitea). Self-hosted Gitea over a full URL needs no hint.
  const autoType = detectForge(repo)?.type;
  const forgeAttr = cfg.type !== autoType ? ` forge="${cfg.type}"` : '';

  const snippet =
    `<script type="module"\n` +
    `  src="${cdnUrl()}"\n` +
    `  integrity="${SRI}"\n` +
    `  crossorigin="anonymous"></script>\n\n` +
    `<auths-verify repo="${repo}"${forgeAttr}></auths-verify>`;

  return { ok: true, snippet, repo, forge: cfg.type };
}
