# fn-1.4 Embed-snippet generator: paste repo URL -> canonical pinned+SRI snippet with accessible copy button

## Description
## Goal

A paste-repo-URL → copy-snippet **embed generator**: the visitor pastes a repo URL, the page normalizes it to the canonical full-URL form and emits the exact `<script>` + `<auths-verify>` snippet (pinned version + SRI from fn-1.3), with a one-click accessible copy button. **Roadmap:** G4.4 (UI half) — `[P1·EDIT]`. This is the generator half of the combined builder/playground page; fn-1.5 adds the live preview + Pages deploy.

## Context

No generator exists today; `examples/` are static and load from `../src/...`, and are excluded from the npm package (`package.json:18-20`). This task creates a new page (e.g. `examples/embed-builder.html` or `docs/`-hosted) — final hosting/deploy is fn-1.5.

## Behavior

1. **Input:** a single text field — paste any GitHub repo URL (full URL or `org/repo`); also an optional forge field for Gitea/GitLab full URLs.
2. **Normalize** via the same logic as `src/resolvers/detect.ts` (fn-1.2) — reuse it, do not re-implement parsing. Emit the canonical **full-URL** `repo=` form. Show a clear validation message for input that doesn't reduce to `owner/repo`.
3. **Output** the exact embed snippet defined in fn-1.3 (pinned `@0.3.0`, `integrity`, `crossorigin`) plus the `<auths-verify repo="https://…">` element, in a read-only code block.
4. **Copy button** — a real `<button type="button">` using `navigator.clipboard.writeText()`:
   - `aria-label` (icon-only) + visible `:focus-visible` styling; keyboard operable.
   - Announce success via an `aria-live="polite"` region ("Copied"), not just a tooltip.
   - **Secure-context fallback:** guard `navigator.clipboard && window.isSecureContext`; fall back to a transient `<textarea>` + `document.execCommand('copy')` (remove the textarea synchronously so tab order isn't broken). Surface failure visibly.
   - Copy from the canonical config string, not the rendered DOM.
5. Vanilla JS, no framework, no clipboard library (keep it ~static-page friendly for fn-1.5's GitHub Pages host).

## Notes

- Follow the Giscus/Shields builder pattern (config field → live read-only snippet → copy). Encode config in the URL query (`?repo=…`) so the builder is deep-linkable — sets up fn-1.5's live preview.
- The live badge preview + iframe sandbox + Pages deploy are **fn-1.5**, not here. This task can render the snippet without a live widget.

## Dependencies

Depends on **fn-1.2** (URL normalization / canonical form) and **fn-1.3** (the exact pinned+SRI snippet to emit).
## Acceptance

- [ ] A new builder page exists; pasting `https://github.com/org/repo`, `org/repo`, `…/org/repo.git`, or `…/org/repo/tree/main` all produce a snippet with the canonical `repo="https://github.com/org/repo"` form.
- [ ] Invalid input (not reducible to `owner/repo`) shows a clear inline validation message, not a broken snippet.
- [ ] The emitted snippet matches fn-1.3's canonical form: pinned `@0.3.0` `<script>` with `integrity="sha384-…"` + `crossorigin="anonymous"`, plus the `<auths-verify repo="https://…">` element.
- [ ] Normalization reuses `detect.ts` logic (no duplicated parser).
- [ ] Copy button: keyboard-operable real `<button>`, `aria-label`, `aria-live` "Copied" announcement, `:focus-visible` style; works in a secure context and falls back gracefully (with visible feedback) when `navigator.clipboard` is unavailable.
- [ ] Config is reflected in the URL query (`?repo=…`) so the page is deep-linkable.
- [ ] `npm run typecheck` passes (if any TS is added); page loads without console errors.
## Done summary
- Added `examples/embed-builder.html` — a paste-repo-URL → copy-snippet generator. Pasting a full URL or `owner/repo` produces the canonical full-URL `<auths-verify>` element plus the pinned (`@0.3.0`) + `integrity` + `crossorigin` `<script>` from fn-1.3.
- Extracted the pure logic into `examples/embed-snippet.ts` (`buildEmbed`/`canonicalRepoUrl`) which **reuses `detectForge`** for normalization — no duplicated parser. The HTML is DOM + clipboard wiring only.
- Accessible copy button: real `<button type="button">` with `aria-label`, an `aria-live="polite"` "Copied" status, `:focus-visible` styling, and a secure-context guard with a transient-`<textarea>` `execCommand` fallback (removed synchronously so tab order is intact). Copies the canonical snippet string, not the DOM.
- Config reflected in the URL query (`?repo=…&forge=…`) for deep-linking; the page prefills from the query on load. Linked from `examples/index.html`.
- Why: G4.4 UI — the generator half of the combined builder/playground (live preview + Pages deploy follow in fn-1.5).
- Verification: 9 new unit tests (`tests/embed-snippet.test.ts`) covering 8 input forms collapsing to one canonical snippet, pinned/SRI/crossorigin presence, forge-attribute logic, and validation errors — `npx vitest run` 89/89. Standalone `tsc` on `embed-snippet.ts` clean; project `npm run typecheck` clean. Served under Vite: `embed-builder.html` 200 and the `embed-snippet.ts → detect.ts` module graph transforms with no errors.
## Evidence
- Commits: d875f0d0ec1d788d3e0b20a770ef29ac40f8cb29
- Tests: npx vitest run, npm run typecheck
- PRs: