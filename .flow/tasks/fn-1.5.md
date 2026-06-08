# fn-1.5 Live badge preview (sandboxed iframe) + GitHub Pages deploy for the builder/playground

## Description
## Goal

Turn the embed builder (fn-1.4) into a **live playground** — render the real badge from the pasted config — and **deploy it to GitHub Pages** so it's a public, linkable GTM asset. **Roadmap:** G4.5 (playground half) — `[P2·EDIT]`.

## Behavior

1. **Live preview** next to the generated snippet: render an actual `<auths-verify>` badge from the current config (loaded from the pinned CDN bundle, matching what the snippet tells users to use), so the preview reflects reality.
2. **Sandbox isolation:** build the preview with `iframe srcdoc` + `sandbox="allow-scripts"` — compose the configured HTML + `<script src=CDN>` into the `srcdoc` string so the demo runs but can't touch the parent page.
3. **Rate-limit hygiene:** GitHub unauthenticated API is **60 req/hr/IP**. Debounce regeneration on input change; rely on the widget's existing 5-min resolver cache (`src/resolvers/resolver.ts:44-45`); avoid auto-verifying on every keystroke. Surface a friendly message if a rate-limit/error event fires (`auths-error`).
4. **GitHub Pages deploy:** add a workflow (e.g. `.github/workflows/pages.yml`) that builds/publishes the builder+playground page (and the CDN-loaded widget) to Pages. Note in the PR description that **enabling Pages in repo Settings is a one-time manual step** (flagged — it's the OPS-ish part).
5. **Link it from the README** (near the CDN/quick-start section) so the page is discoverable.

## Notes

- The page itself is the deploy artifact; `package.json` `files: ["dist"]` means it won't ship to npm — Pages is the distribution channel (locked decision).
- Reuse fn-1.4's copy button / config plumbing; this task only adds the live render + sandbox + deploy.
- Keep it vanilla + static-host friendly (no server).

## Dependencies

Depends on **fn-1.4** (the builder page + copy/config plumbing it extends).
## Acceptance

- [ ] The builder page renders a **live** `<auths-verify>` badge from the pasted config, loaded from the pinned CDN bundle.
- [ ] The live preview runs inside a sandboxed `iframe srcdoc` (`sandbox="allow-scripts"`) — it cannot script the parent page.
- [ ] Input changes are debounced and the page does not fire a verification request on every keystroke; a rate-limit/error (`auths-error`) shows a friendly message rather than a silent failure.
- [ ] A GitHub Pages deploy workflow is committed; the PR/notes explicitly state that enabling Pages in repo Settings is the remaining one-time manual step.
- [ ] The README links to the hosted builder/playground page.
- [ ] Page loads without console errors; `npm run build` and `npm run typecheck` pass.
## Done summary
- Added a live badge preview to the Embed Builder: a sandboxed `iframe srcdoc` (`sandbox="allow-scripts"`) renders the real `<auths-verify>` from the pinned CDN bundle. `previewDocument()` (in `embed-snippet.ts`) reuses `buildEmbed`'s `forgeAttr` so the snippet and preview always agree; it omits `integrity` so the preview loads the published bytes (SRI only blocks tampered bytes — the rendered result is identical).
- Rate-limit hygiene: the preview is debounced (800 ms) and deduped by canonical repo URL, so it never fires a GitHub API call per keystroke (the resolver also caches 5 min). The page documents the ~60 req/hr/IP unauthenticated limit and that a repo shows "Verified" only with a published `*.auths.json` Release asset; the widget renders its own error-state badge otherwise (not a silent failure). Defaults to the example repo on load.
- GitHub Pages deploy: `vite.pages.config.ts` + `npm run build:pages` build the builder/playground to `dist-pages/` (bundles only the detect/snippet logic — 4.42 kB, no WASM/Rust); `.github/workflows/pages.yml` deploys it. The workflow mirrors CI's sibling-`auths` checkout for the `@auths/verifier` file dep.
- README links to the hosted Embed Builder.
- Why: G4.5 playground half + the combined GitHub-Pages artifact decision.
- Verification: `npm run build:pages` succeeds → `dist-pages/index.html` + hashed asset with relative `./assets/` base; served statically (index + asset → HTTP 200); built HTML carries the sandboxed iframe; `npx vitest run` 93/93 (4 new previewDocument tests); `npm run typecheck` clean. `dist-pages/` gitignored.
- Follow-up (manual, one-time): enable Pages in repo Settings → Pages → Source: "GitHub Actions" — until then the deploy step fails (noted in the workflow). The live "Verified" demo also depends on Stream D / D-6 publishing the example repo's `*.auths.json` asset.
## Evidence
- Commits: 66856f2fae118ba6838aaa0b1154f68f8d7b4635
- Tests: npm run build:pages, npx vitest run, npm run typecheck
- PRs: