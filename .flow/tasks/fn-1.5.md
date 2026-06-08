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
TBD

## Evidence
- Commits:
- Tests:
- PRs:
