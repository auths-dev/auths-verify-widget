// Verdict types — the verification wire shapes returned by the WASM core.
//
// Vendored verbatim from the source of truth,
// auths/packages/auths-verifier-ts/src/types.ts. Kept local (rather than
// re-exported from `@auths/verifier`) so the emitted `.d.ts` is self-contained:
// `@auths-dev/verifier` is a types-only dev dependency, not a runtime dependency
// of this package, so a consumer could not resolve a re-export of it. Keep these
// in sync if the verifier wire-format changes.

/** Result of a single attestation verification. */
export interface VerificationResult {
  /** Whether the attestation is valid */
  valid: boolean;
  /** Error message if verification failed */
  error?: string;
}

/** Status of a verification operation. */
export type VerificationStatus =
  | { type: 'Valid' }
  | { type: 'Expired'; at: string }
  | { type: 'Revoked'; at?: string | null }
  | { type: 'InvalidSignature'; step: number }
  | { type: 'BrokenChain'; missing_link: string };

/** A single link in the attestation chain. */
export interface ChainLink {
  /** Issuer DID */
  issuer: string;
  /** Subject DID */
  subject: string;
  /** Whether this link verified successfully */
  valid: boolean;
  /** Error message if verification failed */
  error?: string | null;
}

/** Complete verification report for chain verification. */
export interface VerificationReport {
  /** Overall status of the verification */
  status: VerificationStatus;
  /** Details of each link in the chain */
  chain: ChainLink[];
  /** Warnings (non-fatal issues) */
  warnings: string[];
}

/** Attestation structure (for reference). */
export interface Attestation {
  version: number;
  rid: string;
  issuer: string;
  subject: string;
  device_public_key: string;
  identity_signature: string;
  device_signature: string;
  revoked: boolean;
  expires_at?: string | null;
  timestamp?: string | null;
  note?: string | null;
  payload?: unknown;
}

/** Visual state of the <auths-verify> component */
export type ComponentState =
  | 'idle'
  | 'loading'
  | 'verified'
  | 'invalid'
  | 'expired'
  | 'revoked'
  | 'error';

/** Display mode */
export type DisplayMode = 'badge' | 'detail' | 'tooltip';

/** Badge size */
export type BadgeSize = 'sm' | 'md' | 'lg';

/** Label text for each component state */
export const STATE_LABELS: Record<ComponentState, string> = {
  idle: 'Not verified',
  loading: 'Verifying\u2026',
  verified: 'Verified',
  invalid: 'Invalid',
  expired: 'Expired',
  revoked: 'Revoked',
  error: 'Error',
};
