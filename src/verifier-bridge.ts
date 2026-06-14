/**
 * WASM bridge — singleton wrapper around @auths/verifier
 *
 * Ensures the WASM module is initialized exactly once, shared across
 * all <auths-verify> instances on the page.
 */

import type { VerificationResult, VerificationReport } from './types';

// Sentinel replaced at build time by Vite plugin for single-file distribution
const INLINE_WASM_BASE64: string | null = '__INLINE_WASM_BASE64__' as string | null;

let initPromise: Promise<void> | null = null;
let wasmModule: WasmModule | null = null;

interface WasmModule {
  default?: (input?: BufferSource | string) => Promise<void>;
  verifyAttestationWithResult(attestationJson: string, issuerPkHex: string): string | Promise<string>;
  verifyChainJson(attestationsJsonArray: string, rootPkHex: string): string | Promise<string>;
  verifyAttestationJson(attestationJson: string, issuerPkHex: string): void | Promise<void>;
  verifyArtifactSignature(
    fileHashHex: string,
    signatureHex: string,
    publicKeyHex: string,
    curve?: string | null,
  ): boolean | Promise<boolean>;
}

function isInlined(): boolean {
  return INLINE_WASM_BASE64 !== null && INLINE_WASM_BASE64 !== '__INLINE_WASM_BASE64__';
}

async function loadWasm(wasmUrl?: string): Promise<void> {
  // Dynamic import of the WASM JS glue — path resolved by Vite alias
  const wasm: WasmModule = await import(/* @vite-ignore */ 'auths-verifier-wasm');

  if (typeof wasm.default === 'function') {
    // Module requires explicit initialization (slim build or dev mode)
    if (isInlined()) {
      const binary = Uint8Array.from(atob(INLINE_WASM_BASE64!), c => c.charCodeAt(0));
      await wasm.default(binary);
    } else if (wasmUrl) {
      await wasm.default(wasmUrl);
    } else {
      await wasm.default();
    }
  }
  // If no .default export, WASM was auto-initialized by vite-plugin-wasm (ESM direct import)

  wasmModule = wasm;
}

/**
 * Inject an already-initialized WASM module, bypassing the dynamic-import
 * loader. Used by the DOM-free `core` entry, which imports the WASM glue
 * statically so it is instantiated as part of module load (the bundler's
 * inlined-dynamic-import path is unreliable headless). After this, `ensureInit`
 * resolves immediately and the lazy `loadWasm` path is never taken.
 */
export function setWasmModule(mod: WasmModule): void {
  wasmModule = mod;
}

/**
 * Ensure the WASM module is initialized. Calls are coalesced — only the
 * first invocation actually loads; subsequent calls await the same promise.
 */
export async function ensureInit(wasmUrl?: string): Promise<void> {
  if (wasmModule) return;
  if (!initPromise) {
    initPromise = loadWasm(wasmUrl).catch(err => {
      initPromise = null; // allow retry on failure
      throw err;
    });
  }
  return initPromise;
}

/**
 * Verify a single attestation against an issuer's public key.
 */
export async function verifyAttestation(
  attestationJson: string,
  issuerPublicKeyHex: string,
): Promise<VerificationResult> {
  await ensureInit();
  try {
    const resultJson = await wasmModule!.verifyAttestationWithResult(attestationJson, issuerPublicKeyHex);
    return JSON.parse(resultJson) as VerificationResult;
  } catch (error) {
    return {
      valid: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Verify a chain of attestations from a root identity to a leaf device.
 */
export async function verifyChain(
  attestations: (string | object)[],
  rootPublicKeyHex: string,
): Promise<VerificationReport> {
  await ensureInit();
  const attestationsJson = JSON.stringify(
    attestations.map(att => (typeof att === 'string' ? JSON.parse(att) : att)),
  );

  try {
    const reportJson = await wasmModule!.verifyChainJson(attestationsJson, rootPublicKeyHex);
    return JSON.parse(reportJson) as VerificationReport;
  } catch (error) {
    return {
      status: {
        type: 'BrokenChain',
        missing_link: error instanceof Error ? error.message : String(error),
      },
      chain: [],
      warnings: [],
    };
  }
}

// --- Raw WASM passthroughs ---------------------------------------------------
// Thin wrappers exposing the wasm-bindgen functions directly, for headless
// consumers that want the strict (throwing) verdict or the raw JSON report.
// Each ensures the WASM is initialized first. These produce the exact same
// verdict as the high-level helpers above — they are the layer those helpers
// (and therefore the <auths-verify> widget) are built on.

/**
 * Strict single-attestation check. Resolves on a Valid verdict; throws with
 * the status/error message (e.g. "[AUTHS-E2003] expired") otherwise.
 */
export async function verifyAttestationJson(
  attestationJson: string,
  issuerKeyHex: string,
): Promise<void> {
  await ensureInit();
  await wasmModule!.verifyAttestationJson(attestationJson, issuerKeyHex);
}

/**
 * Verify a chain and return the raw `VerificationReport` JSON string (as
 * produced by the WASM core, without parsing). Never throws — the verdict is
 * carried in the report's `status`.
 */
export async function verifyChainJson(
  attestationsJsonArray: string,
  rootKeyHex: string,
): Promise<string> {
  await ensureInit();
  return wasmModule!.verifyChainJson(attestationsJsonArray, rootKeyHex);
}

/**
 * Verify a detached signature over a file/artifact hash (NOT a generic
 * message-signature check). `curve` defaults to ed25519; pass "p256" for P-256.
 */
export async function verifyArtifactSignature(
  fileHashHex: string,
  signatureHex: string,
  publicKeyHex: string,
  curve?: string | null,
): Promise<boolean> {
  await ensureInit();
  return wasmModule!.verifyArtifactSignature(fileHashHex, signatureHex, publicKeyHex, curve);
}
