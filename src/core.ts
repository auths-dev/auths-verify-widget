/**
 * `@auths-dev/verify/core` — DOM-free verification entry point.
 *
 * Exposes the WASM verifier functions directly, for any runtime without a DOM:
 * Node, Deno, Bun, SSR/RSC, edge functions, CI, and tests. This module loads
 * with **zero** references to HTMLElement / customElements / document, so it
 * imports cleanly outside a browser.
 *
 * It shares the exact same compiled WASM core (and therefore the exact same
 * verdict) as the <auths-verify> web component — both consume `verifier-bridge`.
 * It deliberately does NOT apply the Rust CLI's extra supply-chain /
 * commit-trust attestation-chain check; the verdict here matches the widget's.
 *
 * The WASM is inlined into this bundle, so there is no separate `.wasm` to
 * fetch and no init wiring required by the caller — the verify functions
 * initialize the engine on first use.
 */

import * as wasmGlue from 'auths-verifier-wasm';
import { setWasmModule } from './verifier-bridge';

// Import the WASM glue statically so it is instantiated as part of this
// module's top-level await, then hand it to the bridge. This avoids the
// bundler's inlined-dynamic-import path, which doesn't evaluate the glue
// headless (leaving its namespace in the temporal dead zone). By the time any
// export below is callable, the engine is ready.
setWasmModule(wasmGlue as unknown as Parameters<typeof setWasmModule>[0]);

export {
  // High-level helpers — the widget's verdict path.
  ensureInit,
  ensureInit as init,
  verifyAttestation, // (attestationJson, issuerKeyHex) => Promise<{ valid, error? }>
  verifyChain, // (attestations[], rootKeyHex) => Promise<VerificationReport>

  // Raw wasm-bindgen passthroughs.
  verifyAttestationJson, // strict: resolves on Valid, throws otherwise
  verifyChainJson, // raw VerificationReport JSON string
  verifyArtifactSignature, // detached signature over a file/artifact hash
  verifyArtifactSignature as verifySignature, // alias for the requested name
} from './verifier-bridge';

export type {
  VerificationResult,
  VerificationReport,
  VerificationStatus,
} from './types';
