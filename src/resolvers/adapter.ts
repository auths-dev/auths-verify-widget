import type { ForgeConfig, ResolveResult, RefEntry } from './types';

/**
 * Forge-specific adapter for resolving auths identity data from a forge.
 * The source differs per forge: Git refs (`refs/auths/*`) for Gitea, GitHub
 * Release assets (`*.auths.json`) for GitHub. `listAuthsRefs`/`readBlob` are
 * the refs-based hooks (used by Gitea); the GitHub adapter stubs them.
 */
export interface ForgeAdapter {
  resolve(config: ForgeConfig, identityFilter?: string): Promise<ResolveResult>;
  listAuthsRefs(config: ForgeConfig): Promise<RefEntry[]>;
  readBlob(config: ForgeConfig, sha: string): Promise<string>;
}
