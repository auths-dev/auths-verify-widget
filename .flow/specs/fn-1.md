# Stream C — `auths-verify-widget` GTM

> Source: `roadmap/go_to_market/go_to_market.md` → "Stream C — `auths-verify-widget` (the most launch-ready artifact)".
> Roadmap task IDs preserved for traceability: **G0.5 / G4.1 (D-5)**, **G4.4**, **G4.5**.

## Overview

`@auths-dev/verify@0.3.0` is the most launch-ready artifact in the GTM plan: live on unpkg *and* jsDelivr, WASM base64-inlined into a single file so the one-line `<script>` embed works today, 7 a11y states (`src/styles.ts`). It is held back by **one credibility blocker**: the docs describe a resolver the code stopped using two migrations ago. This epic makes the surface tell the truth about the substance, standardizes the embed form, and adds the SRI/version-pinning + interactive-playground polish that turns a curious visitor into a copy-paste.

**Scope discipline (from the roadmap):** zero new product features. Everything here is drift-elimination, packaging, and UX polish on primitives that already pass tests. **One repo per session** — this epic touches ONLY `auths-verify-widget`. The roadmap text mentions `example-verify-badge/README.md:21`; that is **Stream D, out of scope here**.

## The core drift (D-5)

The GitHub resolver **actually** fetches `*.auths.json` from GitHub **Releases** (`src/resolvers/github.ts`: `GET /repos/{owner}/{repo}/releases/latest` → find asset ending `.auths.json` → download via Contents API with a Releases-asset-API fallback → use `attestation.device_public_key` as the verification key). `listAuthsRefs` is a `return []` stub for the GitHub adapter (kept only for `ForgeAdapter` interface compat).

But the docs **claim** it reads git refs:
- `README.md:34-40` ("Quick Start" step 1) and `README.md:159-169` ("How It Works") describe `refs/auths/identity` + `refs/auths/devices/nodes/` — false for GitHub.
- `README.md:166` says "Ed25519 public key"; `did-utils.ts` now also extracts **P-256**.
- `CHANGELOG.md:17` documents the obsolete refs-based GitHub adapter; `[Unreleased]` is empty; the CHANGELOG's latest entry is `[0.1.1]` while `package.json` is `0.3.0`.
- `examples/auto-resolve.html:23` repeats "from the forge's Git refs."
- `src/resolvers/adapter.ts:3` interface comment still says "via Git refs."
- `tests/e2e/live-resolve.test.ts:50-58,74` is **executable** drift — it calls `githubAdapter.listAuthsRefs()` and asserts `refs/auths/registry` exists and a `did:keri:` issuer. It cannot pass and is silently CI-excluded (`vitest.config.ts:8`).

**Critical nuance — do NOT over-correct:** Gitea (`src/resolvers/gitea.ts`) *legitimately* uses git refs (`refs/auths/registry`) and implements `listAuthsRefs` for real. GitLab is intentionally unsupported (returns a descriptive error). So the fix is **GitHub-specific**, not a blanket removal of all "refs" language. Leave Gitea/GitLab refs wording (`README.md:44`, `CHANGELOG.md:18-19`, `gitea.ts`, `gitlab.ts`) intact.

## Decisions (locked at planning)

1. **Task 1 reach:** reconcile **docs + the e2e test + the `adapter.ts` comment** (the drift lives in code/tests too, not just prose).
2. **Canonical `repo=` form:** standardize every documented/generated snippet on the **full URL** form (`https://github.com/org/repo`). Works for all forges, unambiguous, matches the existing README. Short-form `org/repo` stays *supported* in `detect.ts` but is no longer the documented/emitted form.
3. **Interactive artifacts home:** one **combined embed-builder + live-playground page deployed to GitHub Pages** — public, linkable from the README, a real GTM asset. Generator and playground share one accessible copy-button component.
4. **Granularity:** fine-grained — five tasks, each sized for one `/flow-next:work` iteration.

## Scope / tasks

| Task | Pri | Roadmap | Summary |
|------|-----|---------|---------|
| fn-1.1 | P0 | G0.5 / G4.1 (D-5) | Reconcile GitHub resolver **docs + e2e test + adapter comment** to the Releases-asset reality |
| fn-1.2 | P1 | G4.4 (code) | Harden `detect.ts` URL normalization, standardize on full-URL form, add tests, align all snippets |
| fn-1.3 | P2 | G4.5 (SRI) | SRI + pinned-version + `crossorigin` CDN guidance; build-time sha384 tooling; resolve slim-build WASM truth |
| fn-1.4 | P1 | G4.4 (UI) | Embed-snippet generator page: paste repo URL → canonical pinned+SRI snippet with accessible copy button |
| fn-1.5 | P2 | G4.5 (playground) | Live badge preview (sandboxed iframe) + GitHub Pages deploy for the builder/playground |

**Dependency DAG:** `1.2 → 1.1`; `1.3 → 1.1`; `1.4 → {1.2, 1.3}`; `1.5 → 1.4`.

## Approach

- **fn-1.1 first** — until the docs/test tell the truth, the generator (1.4) and playground (1.5) would re-encode the wrong mental model. 1.2 and 1.3 also touch the README, so they depend on 1.1 to avoid re-introducing drift and to minimize merge churn.
- Reuse the correct **JSDoc in `src/resolvers/github.ts:1-12,28-32`** as the source of truth when rewriting "How It Works."
- The full build base64-inlines WASM into the single `dist/auths-verify.mjs` (671 KB) — **one sha384 covers everything**, the SRI-friendly path. The **slim** build (`dist/slim/`) is ambiguous (no separate `.wasm` emitted, same size as full); fn-1.3 must establish ground truth before writing any slim SRI guidance and should steer SRI users to the full bundle.
- SRI is incompatible with a moving `@latest` CDN URL (hash changes every release) → pinning an exact version (`@0.3.0`) is **mandatory** with SRI, and the snippet needs `crossorigin="anonymous"`.
- Playground respects GitHub's **60 req/hr/IP** unauthenticated limit: debounce, lean on the existing 5-min resolver cache (`resolver.ts:44-45`), and render the live preview in a sandboxed `iframe srcdoc`.

## Risks / dependencies

- **Precondition — clean tree.** This branch (`fn-152-c1`) carries in-flight uncommitted P-256 work in `src/resolvers/did-utils.ts` + its test. Commit/stash it and branch fresh from `main` before starting, or the GTM diff entangles with the P-256 change. (The README P-256 wording fix in fn-1.1 assumes that P-256 work lands.)
- **GitHub Pages enablement is a one-time repo setting** (OPS-ish). fn-1.5 commits the deploy workflow + page; turning Pages on in repo settings is a manual step flagged in that task.
- **Examples are not published** (`package.json:18-20` `files: ["dist"]`) — the builder/playground reaches users via GitHub Pages, not npm/CDN. Don't assume `unpkg` serves it.
- **Published-bytes hash drift:** the sha384 in docs must be computed from the *published* `0.3.0` bytes, not a stale local `dist/`. fn-1.3 wires hash generation into the release flow to prevent drift.

## Quick commands (smoke tests)

```bash
# from the repo root: /Users/bordumb/workspace/repositories/auths-base/auths-verify-widget
npm run typecheck          # tsc --noEmit
npm test                   # vitest run (unit; e2e is excluded by config)
npm run build              # build:full (inline WASM) + build:slim; CI verifies dist/auths-verify.mjs exists

# Drift guard (fn-1.1): these GitHub-specific refs strings must be GONE from user-facing docs
! grep -RInE 'refs/auths/identity|refs/auths/devices/nodes' README.md CHANGELOG.md examples/ \
  || echo "FAIL: stale GitHub git-refs language still present"

# Canonical form guard (fn-1.2): documented snippets use full URLs
grep -RIn 'auths-verify repo=' README.md examples/
```

## Acceptance (epic-level)

- [ ] No user-facing doc/test/comment describes the **GitHub** resolver as reading git refs; the Releases-asset flow is described accurately (incl. Ed25519 **and** P-256). Gitea/GitLab refs language is preserved.
- [ ] `tests/e2e/live-resolve.test.ts` asserts the real Releases-asset behavior for GitHub (or is restructured) — no assertion that can never pass.
- [ ] All documented and generated embed snippets use the canonical **full-URL** `repo=` form; `detect.ts` normalizes pasted URLs (`/tree/*`, `.git`, query/hash) with tests.
- [ ] README CDN snippet is **pinned** (`@0.3.0`) with a correct `integrity="sha384-…"` + `crossorigin="anonymous"`; hash generation is wired to the release flow; slim-vs-full SRI behavior is documented truthfully.
- [ ] A combined embed-builder + live-playground page is deployed to GitHub Pages, linked from the README, with an accessible (aria-live, keyboard, secure-context fallback) copy button.
- [ ] `npm run typecheck && npm test && npm run build` all pass.

## References

- `src/resolvers/github.ts:1-12,28-35,42-108` — Releases-asset resolver + stubs (source of truth)
- `src/resolvers/gitea.ts`, `src/resolvers/gitlab.ts` — legitimately refs-based / unsupported (do not touch wording)
- `src/resolvers/detect.ts:11-76` — `detectForge`, short-form vs full-URL handling
- `src/resolvers/did-utils.ts` — Ed25519 + P-256 key extraction (in-flight on this branch)
- `src/verifier-bridge.ts:11,22-44`, `vite.config.ts:7-32,44-51` — inline-vs-slim WASM build
- `package.json:3,18-20,23-31,45` — version, `files`, build scripts, keywords
- `README.md:12-14,34-44,75-77,143-169,226`, `CHANGELOG.md:8,10,17`, `examples/auto-resolve.html:21-24,67`
- `tests/e2e/live-resolve.test.ts:50-58,74`, `vitest.config.ts:8`, `tests/resolvers/detect.test.ts`
- External: [MDN SRI](https://developer.mozilla.org/en-US/docs/Web/Security/Subresource_Integrity), [jsDelivr SRI](https://www.jsdelivr.com/using-sri-with-dynamic-files), [GitHub REST — Releases](https://docs.github.com/en/rest/releases/releases), [GitHub rate limits](https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api), [MDN Clipboard.writeText](https://developer.mozilla.org/en-US/docs/Web/API/Clipboard/writeText)
