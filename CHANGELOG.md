# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.3.0] - 2026-06-08

### Changed

- **resolver:** GitHub adapter now resolves attestations from **GitHub Release assets** — it fetches the latest release (`/releases/latest`), locates the `*.auths.json` asset, and downloads it via the Contents API (falling back to the Release asset API). It no longer reads Git refs. `listAuthsRefs`/`readBlob` remain only as `ForgeAdapter` interface stubs for GitHub; Gitea still resolves via Git refs. _(Supersedes the refs-based GitHub adapter described under 0.1.1.)_
- **docs:** "How It Works", Quick Start, and the auto-resolve example corrected to describe the GitHub Release-asset flow (the previous Git-refs description was stale).

### Added

- **resolver:** P-256 key extraction alongside Ed25519 in both the `did:key` decoder (multicodec `0x80 0x24` → 33-byte compressed SEC1) and the CESR decoder (`1AAJ`/`1AAI` derivation codes, 48 chars). Curve is dispatched on the in-band tag, never on byte length; mirrors Rust `KeriPublicKey::parse`.

> Note: 0.2.x history is summarized in this entry rather than reconstructed in detail.

## [0.1.1] - 2026-02-16

### Added

- **resolver:** Auto-resolve identity and attestation data from a repository URL via new `repo` attribute. No more manual JSON — `<auths-verify repo="https://github.com/user/repo">` just works.
- **resolver:** `forge` attribute to override auto-detection of forge type (`github`, `gitea`, `gitlab`).
- **resolver:** `identity` attribute to filter to a specific DID when a repository has multiple identities.
- **resolver:** GitHub adapter — resolved identity and attestation data via the GitHub REST API and extracted the public key from `did:key:z...`. _(Superseded in 0.3.0 — the GitHub adapter now resolves from Release assets; see above.)_
- **resolver:** Gitea adapter — mirrors GitHub adapter with `/api/v1/` prefix and configurable base URL for self-hosted instances.
- **resolver:** GitLab stub — returns descriptive error explaining GitLab does not expose custom Git refs via its REST API.
- **resolver:** Pure TypeScript `did:key:z...` to Ed25519 public key hex extraction (inline base58btc decoder, multicodec prefix stripping). Runs before WASM loads.
- **resolver:** URL parser with auto-detection: `github.com` → GitHub, `gitlab.com` → GitLab, unknown hosts → Gitea.
- **resolver:** In-memory cache with 5-minute TTL prevents redundant API calls when multiple widgets point to the same repo.
- **resolver:** Dynamic import (`import('./resolvers/index')`) — zero bundle size impact when `repo` attribute is not used.
- **resolver:** DID sanitization helper matching Rust `layout.rs` (`replace(/[^a-zA-Z0-9]/g, '_')`).
- **tests:** 29 new resolver tests — `detect.test.ts` (10), `did-utils.test.ts` (7), `github.test.ts` (7), `gitea.test.ts` (5).
- **examples:** `auto-resolve.html` demonstrating the `repo` attribute with GitHub, Gitea, forge hints, and identity filters.

### Changed

- **widget:** `#hasInput()` now returns `true` when `repo` is set, even without manual `attestation`/`public-key` data.
- **widget:** `verify()` resolves from forge before loading WASM when `repo` is set but attestation data is missing.
- **README:** Updated quick start to recommend `repo` attribute. Added new attributes to the attribute table.

## [0.1.0] - 2026-02-16

### Added

- Initial release of `<auths-verify>` web component.
- Three display modes: `badge` (default), `detail` (expandable chain table), `tooltip` (hover summary).
- Three badge sizes: `sm`, `md`, `lg`.
- WASM-powered Ed25519 attestation chain verification via `@auths/verifier`.
- Dual build outputs: full bundle (WASM base64-inlined) and slim bundle (separate WASM file).
- Singleton WASM initialization with coalesced loading.
- CSS custom property theming for all states and typography.
- Accessibility: `role="status"`, `aria-live="polite"`, `aria-expanded`, focus-visible outlines, forced-colors support.
- Custom events: `auths-verified`, `auths-error`.
- JavaScript API: `verify()`, `getReport()`.
- Auto-verify on connect and attribute change (debounced).
- SVG icons for all 7 component states.
