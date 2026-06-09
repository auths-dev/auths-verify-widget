# fn-1.3 SRI + pinned-version + crossorigin CDN guidance; build-time sha384 tooling; resolve slim-WASM truth

## Description
## Goal

Give the CDN `<script>` embed real supply-chain guidance: a **pinned** version + a correct **SRI** hash + `crossorigin`, plus build-time tooling so the hash never drifts. Establish the truth about the slim build before documenting it. **Roadmap:** G4.5 (SRI half) — `[P2·EDIT]`.

## Context

`README.md:12-14` ships the only CDN snippet, and it is unpinned + unprotected:
```html
<script type="module" src="https://unpkg.com/@auths-dev/verify/dist/auths-verify.mjs"></script>
```
No version pin (implicit `@latest`), no `integrity=`, no `crossorigin`. The full build base64-inlines WASM into the single `dist/auths-verify.mjs` (671 KB) — so **one sha384 covers the entire runtime**, the SRI-friendly path. The slim build (`dist/slim/`) is ambiguous: no separate `.wasm` is emitted and it's the same size as full (see Investigation).

## Changes

1. **Investigation (do first):** determine what the slim build actually ships for WASM (`package.json:25` `build:slim` runs `vite build --mode slim` *without* `INLINE_WASM`; `vite.config.ts:7-32` inline plugin; `verifier-bridge.ts:11,22-44` sentinel + `wasm-url` override). Confirm whether slim fetches a separate `.wasm` at runtime. Record the finding in the task notes.
2. **README CDN guidance** — replace the bare snippet with a **pinned + SRI** one:
   ```html
   <script type="module"
     src="https://unpkg.com/@auths-dev/verify@0.3.0/dist/auths-verify.mjs"
     integrity="sha384-…" crossorigin="anonymous"></script>
   ```
   - Add a short subsection explaining: pin an exact version (SRI + `@latest` breaks on every release); `crossorigin="anonymous"` is **required** or the browser blocks the cross-origin script; jsDelivr equivalent + that it can show the SRI hash for you.
   - State the **full-vs-slim** SRI truth from the investigation: recommend the **full** inlined bundle for SRI users (one hash = everything); document slim honestly (if it fetches a sibling `.wasm`, the `<script>` integrity does NOT cover it → needs `fetch(url,{integrity})` or "not SRI-complete").
3. **Hash generation tooling** — add a small script (e.g. `scripts/sri.mjs` or a `package.json` `postbuild`/`prepublishOnly` step) that computes `sha384` over the built `dist/auths-verify.mjs` (`crypto.createHash('sha384')` or `openssl dgst -sha384 -binary | openssl base64 -A`) and prints/writes it, so the documented hash is generated from the **published** bytes, not hand-copied. Wire it so a version bump regenerates the value.
4. **Pinned-version guidance** applies to both unpkg and jsDelivr URL forms; mention `files: ["dist"]` means only `dist` is on the CDN.

## Notes

- The sha384 in the README must match the bytes published for `0.3.0`. If the published artifact isn't available yet, document the generation command + a placeholder and have the tooling fill it at release; do not hand-fabricate a hash.
- This task defines the **canonical snippet** that fn-1.4's generator emits — keep the exact attribute order/wording reusable.

## Dependencies

Depends on **fn-1.1** (both edit the README).
## Acceptance

- [ ] The slim-build WASM behavior is determined and written down in the task notes (separate `.wasm` fetch: yes/no).
- [ ] `README.md` CDN snippet is **pinned** to `@0.3.0`, has `integrity="sha384-…"` and `crossorigin="anonymous"`, with a subsection explaining why pinning is mandatory with SRI and why `crossorigin` is required.
- [ ] README documents the full-vs-slim SRI distinction truthfully and recommends the full inlined bundle for SRI users.
- [ ] A build/release hash-generation step exists (script or npm lifecycle hook) that emits the sha384 of `dist/auths-verify.mjs` from built bytes; running it reproduces the value documented in the README.
- [ ] The documented sha384 matches the output of the generation step (no hand-fabricated hash).
- [ ] `npm run build` succeeds and the hash step runs without error; `npm run typecheck` passes.
## Done summary
- Investigation result (slim-WASM truth): rebuilt both bundles — `dist/auths-verify.mjs` and `dist/slim/auths-verify.mjs` are **byte-identical (672784 bytes, same sha384)**. The slim build inlines the WASM via `vite-plugin-wasm` and emits no separate `.wasm`. So a single `integrity` hash covers the whole runtime for both builds; the README's "slim loads `.wasm` separately" claim was false and is corrected.
- README: replaced the unpinned unpkg `<script>` with a version-pinned (`@0.3.0`) snippet carrying `integrity="sha384-…"` + `crossorigin="anonymous"`, for both unpkg and jsDelivr; added a callout explaining why pinning is mandatory with SRI (the hash is byte-exact; `@latest` breaks it) and why `crossorigin` is required.
- Added `scripts/sri.mjs` + `npm run sri` to compute the sha384 from the built bundle, so the documented hash is reproducible and regenerated per release rather than hand-copied.
- Why: G4.5 SRI half — give the one-line CDN embed real supply-chain guidance.
- Verification: `npm run build` (full+slim) succeeds; `npm run sri` → `sha384-M1UJQ02k36YqkLbXIPrV98mCZKA7pm3J2TX5PNGwi+ZJwjcJC2CoKN8dCJZpe0+l`, which matches the value in README (consistency check passes); `npm run typecheck` clean; `npx vitest run` 80/80. `dist/` is gitignored (built on publish).
- Follow-ups: (1) at release, run `npm run sri` against the *published* version's bytes and confirm the README hash — the value shown is from a local build of this source. (2) The slim build no longer produces a smaller artifact (vite-plugin-wasm inlines regardless of `INLINE_WASM`); truly externalizing the `.wasm` is a separate build-architecture change, out of GTM scope.
## Evidence
- Commits: 07d2a3e5de43cab38abf4226502d38e19f7ca695
- Tests: npm run build, npm run sri, npm run typecheck, npx vitest run
- PRs: