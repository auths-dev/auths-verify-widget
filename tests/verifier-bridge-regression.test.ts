import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Regression tests for verifier-bridge.
 *
 * These test the REAL verifier-bridge source against a mocked WASM module,
 * unlike verifier-bridge.test.ts which mocks the entire bridge.
 *
 * Covers:
 *   - Bug #1: loadWasm crashes when WASM module has no .default() export
 *             (auto-initialized by vite-plugin-wasm)
 *   - Bug #2: WASM functions return Promises but were not awaited,
 *             causing JSON.parse(Promise) → SyntaxError
 */

const mockVerifyAttestationWithResult = vi.fn();
const mockVerifyChainJson = vi.fn();

// Mock the underlying WASM module — NOT the bridge itself.
// This exercises the real verifier-bridge logic.
vi.mock('auths-verifier-wasm', () => ({
  // Explicitly set default to undefined — simulates vite-plugin-wasm
  // auto-initialized module that has no init function.
  default: undefined,
  verifyAttestationWithResult: mockVerifyAttestationWithResult,
  verifyChainJson: mockVerifyChainJson,
}));

// Import the REAL verifier-bridge (it will dynamically import our mock above)
import { ensureInit, verifyAttestation, verifyChain } from '../src/verifier-bridge';

describe('verifier-bridge regressions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Bug #1: WASM module without .default export', () => {
    it('ensureInit succeeds when module has no .default()', async () => {
      // vite-plugin-wasm auto-initializes WASM and produces a module
      // without .default(). Before the fix, this threw:
      //   TypeError: wasm.default is not a function
      await expect(ensureInit()).resolves.toBeUndefined();
    });
  });

  describe('Bug #2: async WASM functions must be awaited', () => {
    it('verifyChain awaits a Promise-returning verifyChainJson', async () => {
      // WASM functions compiled with async Rust return Promises via externref.
      // Before the fix, the Promise was passed directly to JSON.parse(),
      // which stringified it to "[object Promise]" and threw SyntaxError.
      mockVerifyChainJson.mockResolvedValue(
        JSON.stringify({
          status: { type: 'Valid' },
          chain: [{ issuer: 'did:keri:a', subject: 'did:key:b', valid: true }],
          warnings: [],
        }),
      );

      const report = await verifyChain([{ test: true }], 'aabbccdd');
      expect(report.status.type).toBe('Valid');
      expect(report.chain).toHaveLength(1);
    });

    it('verifyAttestation awaits a Promise-returning verifyAttestationWithResult', async () => {
      mockVerifyAttestationWithResult.mockResolvedValue(
        JSON.stringify({ valid: true }),
      );

      const result = await verifyAttestation('{"test":true}', 'aabbccdd');
      expect(result.valid).toBe(true);
    });

    it('verifyChain does not produce BrokenChain from un-awaited Promise', async () => {
      // The specific symptom: JSON.parse(Promise) throws, catch block returns
      // { status: { type: 'BrokenChain' } }. If this test gets BrokenChain
      // with a valid mock, the await is missing.
      mockVerifyChainJson.mockResolvedValue(
        JSON.stringify({
          status: { type: 'Valid' },
          chain: [],
          warnings: [],
        }),
      );

      const report = await verifyChain([], 'aabb');
      expect(report.status.type).not.toBe('BrokenChain');
      expect(report.status.type).toBe('Valid');
    });

    it('verifyChain still handles sync return values', async () => {
      // If WASM functions return a plain string (not a Promise),
      // await on a non-thenable just passes it through.
      mockVerifyChainJson.mockReturnValue(
        JSON.stringify({
          status: { type: 'Valid' },
          chain: [],
          warnings: [],
        }),
      );

      const report = await verifyChain([], 'aabb');
      expect(report.status.type).toBe('Valid');
    });

    it('verifyAttestation still handles sync return values', async () => {
      mockVerifyAttestationWithResult.mockReturnValue(
        JSON.stringify({ valid: true }),
      );

      const result = await verifyAttestation('{"test":true}', 'aabb');
      expect(result.valid).toBe(true);
    });
  });
});
