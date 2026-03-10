export { resolveFromRepo } from './resolver';
export { detectForge } from './detect';
export { didKeyToPublicKeyHex, cesrToPublicKeyHex, sanitizeDidForRef } from './did-utils';
export { cacheClear } from './cache';
export type {
  IdentityBundle,
  ResolveResult,
  ForgeType,
  ForgeConfig,
  RefEntry,
} from './types';
export type { ForgeAdapter } from './adapter';
