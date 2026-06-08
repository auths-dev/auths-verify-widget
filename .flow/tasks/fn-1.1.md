# fn-1.1 Reconcile GitHub resolver docs + e2e test + adapter comment to Releases-asset reality

## Description
## Goal

Make every **GitHub** resolver surface tell the truth: the widget resolves attestations from GitHub **Releases** (`*.auths.json` assets), not from git refs. Fix the docs, the lying e2e test, and the stale interface comment. **Roadmap:** G0.5 / G4.1 (D-5) — `[P0·EDIT]`, the #1 credibility blocker.

## Source of truth

`src/resolvers/github.ts:1-12,28-35,42-108` already documents the real flow in JSDoc — reuse its wording:
1. `GET {baseUrl}/repos/{owner}/{repo}/releases/latest` (`baseUrl` = `https://api.github.com`).
2. Find the release asset whose name ends in `.auths.json` (`github.ts:55`).
3. Download it via the Contents API (`.../contents/{name}`, base64-decoded — `github.ts:69-72`), falling back to the Releases-asset API (`.../releases/assets/{id}` with `Accept: application/octet-stream` — `github.ts:75-77`).
4. Use `attestation.device_public_key` as the verification key and `attestation.issuer` as `identity_did` (`github.ts:95-101`).
5. Hand the bundle to the WASM verifier.

## Edits (GitHub-specific only)

1. **`README.md:34-40`** — "Quick Start" step 1: replace "read the repository's `refs/auths/` identity data" with the Releases-asset flow.
2. **`README.md:159-169`** — "How It Works": rewrite steps 2/3/5 (`refs/auths/identity`, `identity.json`, `refs/auths/devices/nodes/`) to the 5-step Releases flow above. If the section is single-forge, either make it GitHub-specific with a short "Gitea differs (git refs)" note, or split per-forge — keep it accurate for both.
3. **`README.md:166`** — "Ed25519 public key" → "Ed25519 **or** P-256 public key" (`did-utils.ts` now extracts both).
4. **`CHANGELOG.md`** — add an entry documenting the GitHub adapter pivot (refs → Releases assets) and P-256 support. **Chosen approach:** convert the empty `[Unreleased]` (`CHANGELOG.md:8`) into / add a `[0.3.0]` entry capturing the pivot; do NOT attempt a full 0.2.x reconstruction — add a one-line note that 0.2.x history is summarized. The obsolete line `CHANGELOG.md:17` ("resolves `refs/auths/identity` …") should be corrected or annotated as superseded, **without** touching the accurate Gitea/GitLab lines (`:18-19`).
5. **`examples/auto-resolve.html:21-24`** — "from the forge's **Git refs**" → forge-accurate wording (GitHub = Releases assets; Gitea = git refs).
6. **`src/resolvers/adapter.ts:3`** — interface comment "via Git refs" → forge-neutral (e.g. "resolves identity + attestations from a forge — git refs for Gitea, Release assets for GitHub").
7. **`tests/e2e/live-resolve.test.ts:50-58,74`** — the GitHub portion asserts `listAuthsRefs()` returns `refs/auths/registry` and a `did:keri:` issuer; neither holds for the Releases adapter (`listAuthsRefs` is a `return []` stub). Rewrite the GitHub case to assert the Releases-asset path (or restructure the test so it no longer makes an assertion that can never pass). **Keep the Gitea refs assertions** — they are legitimate.

## Do NOT touch (legitimately refs-based)

- `src/resolvers/gitea.ts` (real `refs/auths/registry` implementation), `src/resolvers/gitlab.ts` (intentional error).
- `README.md:44` ("GitLab … does not expose custom Git refs") and `CHANGELOG.md:18-19` — accurate.

## Notes

- Assumes the in-flight P-256 work in `did-utils.ts` lands (it's uncommitted on this branch). If it is reverted, drop the P-256 wording in edit #3.
- This is docs + a focused test/comment fix — no resolver logic changes.

## Out of scope

- `example-verify-badge/README.md:21` (Stream D, different repo).
- Publishing a real `*.auths.json` demo asset (Stream D, OPS, D-6/G4.2).
## Acceptance

- [ ] `grep -RInE 'refs/auths/identity|refs/auths/devices/nodes' README.md CHANGELOG.md examples/` returns **nothing** (GitHub git-refs language gone from user-facing docs).
- [ ] `README.md` "How It Works" + "Quick Start" describe the GitHub Releases-asset flow accurately (latest release → `*.auths.json` asset → Contents/asset API → `device_public_key`), and mention **Ed25519 or P-256**.
- [ ] Gitea/GitLab refs wording is **preserved** — `grep -n 'refs/auths/registry' src/resolvers/gitea.ts` still present; `README.md:44` GitLab note unchanged.
- [ ] `CHANGELOG.md` has an entry documenting the refs→Releases pivot + P-256; the obsolete refs description is corrected/superseded.
- [ ] `examples/auto-resolve.html` no longer claims GitHub resolves "from Git refs."
- [ ] `src/resolvers/adapter.ts` interface comment is forge-neutral (no implication that all forges use git refs).
- [ ] `tests/e2e/live-resolve.test.ts` no longer asserts `githubAdapter.listAuthsRefs()` returns refs; the GitHub case reflects Releases-asset reality (Gitea case still asserts refs). The test file is internally consistent (would pass if run against a live/mocked Releases asset).
- [ ] `npm run typecheck` and `npm test` pass.
## Done summary
TBD

## Evidence
- Commits:
- Tests:
- PRs:
