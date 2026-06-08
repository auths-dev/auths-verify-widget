# fn-1.2 Harden detect.ts URL normalization; standardize on full-URL repo= form; add tests; align snippets

## Description
## Goal

Standardize the embed on the **full-URL** `repo=` form and make `detect.ts` robust to the messy URLs users actually paste (browser address bars, clone URLs). **Roadmap:** G4.4 (code half) — `[P1·EDIT]`. This is the parsing foundation the generator (fn-1.4) builds on.

## Context

`src/resolvers/detect.ts:11-76` (`detectForge`) already accepts both full URLs and `org/repo` short form, but:
- Short form `org/repo` **always** assumes GitHub (`detect.ts:55-57`); Gitea/GitLab need full URLs (`detect.ts:68` returns null for short-form Gitea). So short form can't be the universal canonical — **full URL is** (locked decision).
- Full-URL parsing strips `.git` + trailing slash (`detect.ts:28`) but takes only `segments[0..1]`, so `https://github.com/org/repo/tree/main` silently drops the extra path (acceptable) while `org/repo.git` short form yields `repo = "repo.git"` (broken).
- `tests/resolvers/detect.test.ts` covers full URLs (`:5-75`) but has **no** short-form coverage and no `/tree/*`, `.git`, query/hash, or trailing-slash normalization tests.

## Changes

1. **Normalize before parsing** in `detectForge` (or a small extracted `normalizeRepoUrl` helper) so all of these reduce to the same `{owner, repo}`:
   - `https://github.com/org/repo`
   - `https://github.com/org/repo.git`
   - `https://github.com/org/repo/` (trailing slash)
   - `https://github.com/org/repo/tree/main` and other extra path segments
   - URLs with `?query` / `#hash`
   - bare `org/repo` and `org/repo.git` (short form — apply `.git`/slash stripping here too)
   - Keep the existing forge selection (`github.com`→github, `gitlab.com`→gitlab, else gitea; explicit `forgeHint` wins).
2. **Keep short form supported** (don't break it) but it is no longer the *documented/emitted* form.
3. **Align all documented snippets to full URLs.** Confirm `README.md:31,53,61,69,75-77,161` and `examples/auto-resolve.html:28,39,49,65` all use `repo="https://github.com/org/repo"`. (Most already do — fix any that don't; ensure none demo the short form.)
4. **Tests** in `tests/resolvers/detect.test.ts`: add cases for each normalization above (full-URL `.git`/trailing-slash/`/tree/*`/query/hash, and a short-form `org/repo` + `org/repo.git` regression), asserting the resolved `{owner, repo, forge, baseUrl}`.

## Notes

- This task is the single source of truth for URL normalization so the runtime widget and the fn-1.4 generator behave identically — do the normalization in `detect.ts`, not in the generator UI.
- GitLab subgroups (`group/subgroup/repo`) remain out of scope (still only first two segments) — note it as a known limitation if you touch that code path.

## Dependencies

Depends on **fn-1.1** (both edit the README; sequencing avoids re-introducing the git-refs drift and minimizes merge churn).
## Acceptance

- [ ] `detectForge` resolves all of these to the **same** GitHub `{owner: "org", repo: "repo"}`: `https://github.com/org/repo`, `…/org/repo.git`, `…/org/repo/`, `…/org/repo/tree/main`, `…/org/repo?x=1#y`, and bare `org/repo` / `org/repo.git`.
- [ ] Short-form `org/repo` still resolves (GitHub) — not a regression.
- [ ] New unit tests in `tests/resolvers/detect.test.ts` cover every normalization case above and assert `{owner, repo, forge, baseUrl}`; `npm test` passes.
- [ ] Every embed snippet in `README.md` and `examples/` uses the canonical **full-URL** `repo=` form; none demo the short form. (`grep -RIn 'auths-verify repo=' README.md examples/` shows only full `https://…` URLs.)
- [ ] `npm run typecheck` passes.
- [ ] If GitLab-subgroup handling was touched, its known limitation is noted in a comment; otherwise unchanged.
## Done summary
- Rewrote `detectForge` normalization so every pasted form reduces to the same `{owner, repo, forge, baseUrl}`: full URLs (with `.git`, trailing `/`, `/tree/main`, `?query#hash`), protocol-less hosts (`github.com/org/repo`, `git.example.com/user/repo`), and `owner/repo` / `owner/repo.git` shorthand.
- Fixed the real bug: shorthand `owner/repo.git` previously yielded `repo='repo.git'` — now stripped. Dots inside shorthand repo names (`owner/my.repo`) are preserved.
- Documented full URL as the canonical form and the GitLab-subgroup known limitation in the JSDoc.
- Confirmed all README/example embed snippets already use the full-URL `repo=` form (no short-form demos).
- Why: G4.4 code foundation — the embed generator (fn-1.4) reuses this single normalizer so the runtime widget and the generated snippet behave identically.
- Verification: added 8 unit tests (detect.test.ts 10 → 18), incl. a table asserting 8 GitHub input forms collapse to one config; `npx vitest run` 80/80; `npm run typecheck` clean.
## Evidence
- Commits: 8ff53e3a49572455fe5861986ce438d7932399a5
- Tests: npm run typecheck, npx vitest run
- PRs: