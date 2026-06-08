#!/usr/bin/env node
/**
 * Compute the Subresource Integrity (SRI) hash for the built CDN bundle(s).
 *
 * SRI is byte-exact: the hash below is valid ONLY for the precise bytes of the
 * file it was computed from. Re-run this after every `npm run build` / release
 * and paste the value into the pinned `<script integrity="...">` snippet in the
 * README. The hash must match the published, version-pinned CDN file
 * (e.g. unpkg `@<version>`), never a moving `@latest` URL.
 *
 * Usage:
 *   npm run build && npm run sri
 *   node scripts/sri.mjs [file ...]   # default: dist/auths-verify.mjs, dist/slim/auths-verify.mjs
 */
import { createHash } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';

const ALGO = 'sha384';
const files = process.argv.slice(2);
if (files.length === 0) {
  files.push('dist/auths-verify.mjs', 'dist/slim/auths-verify.mjs');
}

let missing = false;
for (const file of files) {
  if (!existsSync(file)) {
    console.error(`✗ ${file} — not found (run \`npm run build\` first)`);
    missing = true;
    continue;
  }
  const bytes = readFileSync(file);
  const digest = createHash(ALGO).update(bytes).digest('base64');
  const integrity = `${ALGO}-${digest}`;
  console.log(`${file}`);
  console.log(`  bytes:     ${bytes.length}`);
  console.log(`  integrity: ${integrity}`);
}

process.exit(missing ? 1 : 0);
