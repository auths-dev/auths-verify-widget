#!/usr/bin/env node
/**
 * Headless smoke test for the DOM-free `@auths-dev/verify/core` entry.
 *
 * Imports the BUILT artifact (dist/core.mjs) in plain Node with NO DOM shim —
 * the truest reproduction of the acceptance criterion. This is the first test
 * to exercise the real compiled WASM end-to-end (the vitest suites mock it).
 *
 * Asserts: a known-good signed attestation verifies Valid, a tampered copy is
 * rejected, and malformed JSON is rejected cleanly (no process crash).
 *
 * Run after `npm run build`:  node scripts/smoke-core.mjs
 */

import {
  verifyAttestation,
  verifyAttestationJson,
} from '../dist/core.mjs';

import {
  issuerPkHex,
  attestationJson,
  tamperedJson,
  malformedJson,
} from '../tests/fixtures/attestation.fixture.js';

let failures = 0;

function ok(cond, label) {
  if (cond) {
    console.log(`  ✓ ${label}`);
  } else {
    console.error(`  ✗ ${label}`);
    failures++;
  }
}

async function main() {
  console.log('headless core smoke test (dist/core.mjs, no DOM shim)\n');

  // 1. Known-good attestation → Valid.
  const good = await verifyAttestation(attestationJson, issuerPkHex);
  ok(good.valid === true, `known-good verifies Valid (valid=${good.valid}${good.error ? `, error=${good.error}` : ''})`);

  // 2. Strict form resolves on the known-good vector.
  let strictResolved = false;
  try {
    await verifyAttestationJson(attestationJson, issuerPkHex);
    strictResolved = true;
  } catch (err) {
    strictResolved = false;
    console.error(`    strict verifyAttestationJson threw on known-good: ${err?.message ?? err}`);
  }
  ok(strictResolved, 'verifyAttestationJson resolves on known-good');

  // 3. Tampered signature → rejected.
  const tampered = await verifyAttestation(tamperedJson, issuerPkHex);
  ok(tampered.valid === false, `tampered signature rejected (valid=${tampered.valid})`);

  // 4. Strict form throws on the tampered vector.
  let strictThrew = false;
  try {
    await verifyAttestationJson(tamperedJson, issuerPkHex);
  } catch {
    strictThrew = true;
  }
  ok(strictThrew, 'verifyAttestationJson throws on tampered');

  // 5. Malformed JSON → rejected cleanly (no crash, returns a verdict).
  const malformed = await verifyAttestation(malformedJson, issuerPkHex);
  ok(malformed.valid === false, `malformed JSON rejected cleanly (valid=${malformed.valid})`);

  console.log('');
  if (failures > 0) {
    console.error(`FAILED: ${failures} assertion(s) did not hold.`);
    process.exit(1);
  }
  console.log('PASS: headless core verifies known-good and rejects tampered/malformed.');
}

main().catch((err) => {
  console.error('FAILED: smoke test crashed:', err);
  process.exit(1);
});
