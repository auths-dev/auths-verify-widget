# fn-1.6 Land in-flight P-256 key-extraction support (did-utils) — foundational commit

## Description
## Goal

Land the in-flight P-256 key-extraction support in `src/resolvers/did-utils.ts` (+ its test) as the **foundational commit** of this epic. Folded into the GTM work at the user's request ("handle the in-flight P-256 changeset with this work, start with it"). fn-1.1's README wording change ("Ed25519 → Ed25519 **or** P-256") depends on this landing.

## What this is

Pre-existing uncommitted work on branch `fn-152-c1`:
- `src/resolvers/did-utils.ts` — adds P-256 alongside Ed25519 in both decoders, dispatching on the **in-band curve tag** (never byte length):
  - `didKeyToPublicKeyHex`: multicodec `0xED 0x01` → Ed25519 (32 B); `0x80 0x24` (varint of 0x1200) → P-256 compressed (33 B SEC1). New `hasMulticodec` + `base64UrlToBytes` helpers; explicit "Unsupported multicodec" error.
  - `cesrToPublicKeyHex`: derivation code `D`/`B` (44 chars) → Ed25519; `1AAJ`/`1AAI` (48 chars) → P-256 (33 B). Mirrors Rust `KeriPublicKey::parse`.
- `tests/resolvers/did-utils.test.ts` — P-256 did:key + CESR (`1AAI`/`1AAJ`) vectors, unsupported-multicodec/prefix rejection, updated error-string expectations.

## Scope

- Verify the change (typecheck + unit tests), then commit it as-is. **No new code authoring** — this task validates and lands existing work.
- This is the only non-GTM change in the epic; it's a prerequisite for fn-1.1's P-256 doc wording.
## Acceptance
- [ ] `npx vitest run tests/resolvers/did-utils.test.ts` passes, including the P-256 did:key and CESR (`1AAI`/`1AAJ`) vectors and the unsupported-tag rejections.
- [ ] `npm run typecheck` passes and the full `npx vitest run` suite is green (no regressions).
- [ ] The `did-utils.ts` + `did-utils.test.ts` changes are committed (foundational commit); working tree clean of those two files.
- [ ] Curve is dispatched on the in-band tag (multicodec / CESR derivation code), not byte length — confirmed by reading the diff.
## Done summary
- Landed in-flight P-256 key extraction in `did-utils.ts`: `didKeyToPublicKeyHex` now accepts P-256 multicodec `0x80 0x24` (33-byte compressed) alongside Ed25519 `0xED 0x01`; `cesrToPublicKeyHex` accepts `1AAJ`/`1AAI` (P-256, 48 chars) alongside `D`/`B` (Ed25519). Added `base64UrlToBytes` + `hasMulticodec` helpers and explicit unsupported-tag errors.
- Added P-256 test vectors (did:key + CESR `1AAI`/`1AAJ`) and rejection cases in `did-utils.test.ts`.
- Why: foundational prerequisite for fn-1.1's README wording (Ed25519 → Ed25519/P-256); folded into this epic per user request to handle the changeset here.
- Verification: `npm run typecheck` clean; `npx vitest run` → 72/72 passing (did-utils 15/15 incl. new P-256 vectors).
- Curve dispatched on in-band tag, never byte length (verified by diff review).
## Evidence
- Commits: c4b57d3adde7aeb9c686c645fe8e6707c78b4e7f
- Tests: npm run typecheck, npx vitest run
- PRs: