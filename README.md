# `<auths-verify>` Web Component

[![npm version](https://img.shields.io/npm/v/@auths-dev/verify.svg)](https://www.npmjs.com/package/@auths-dev/verify)
[![license](https://img.shields.io/npm/l/@auths-dev/verify.svg)](https://github.com/auths-dev/auths-verify-widget/blob/main/LICENSE)

A drop-in web component that verifies [Auths](https://github.com/auths-dev/auths) decentralized identities — the open-source equivalent of GitHub's green "Verified" badge. Point it at any repository that uses Auths, and it cryptographically verifies the identity chain in the browser via WASM.

## Install

**CDN (no build step):**

Pin an exact version and add a [Subresource Integrity](https://developer.mozilla.org/en-US/docs/Web/Security/Subresource_Integrity) (SRI) hash so the browser refuses a tampered bundle:

```html
<script
  type="module"
  src="https://unpkg.com/@auths-dev/verify@0.3.0/dist/auths-verify.mjs"
  integrity="sha384-M1UJQ02k36YqkLbXIPrV98mCZKA7pm3J2TX5PNGwi+ZJwjcJC2CoKN8dCJZpe0+l"
  crossorigin="anonymous"
></script>
```

> **Pin a version with SRI — never `@latest`.** The `integrity` hash is
> byte-exact, so it only validates against an immutable, version-pinned URL
> (`@0.3.0`). A moving `@latest` URL changes bytes on every release and would
> break the hash — and the badge — without warning. `crossorigin="anonymous"`
> is required: without it the browser fetches the cross-origin script opaquely,
> can't read it to verify, and the load fails. The hash above is for `@0.3.0`;
> regenerate it for any other version with `npm run sri`, or copy it from the
> file's page on [jsDelivr](https://www.jsdelivr.com/), which displays the SRI
> hash for you. The WASM verifier is base64-inlined into this single `.mjs`, so
> one `integrity` hash covers the entire runtime — there is no separate `.wasm`
> fetch to protect.

[jsDelivr](https://www.jsdelivr.com/) serves the same published file, so the same pin + `integrity` works there too:

```html
<script
  type="module"
  src="https://cdn.jsdelivr.net/npm/@auths-dev/verify@0.3.0/dist/auths-verify.mjs"
  integrity="sha384-M1UJQ02k36YqkLbXIPrV98mCZKA7pm3J2TX5PNGwi+ZJwjcJC2CoKN8dCJZpe0+l"
  crossorigin="anonymous"
></script>
```

**npm (for bundlers):**

```bash
npm install @auths-dev/verify
```

```js
import '@auths-dev/verify';
```

## Quick Start

Add the widget to any page and point it at a repository:

```html
<auths-verify repo="https://github.com/user/repo"></auths-verify>
```

That's it. The widget will:

1. Fetch the repository's latest GitHub Release and locate the `*.auths.json` attestation asset
2. Read the verification key (Ed25519 or P-256) from the attestation
3. Load the WASM verification engine
4. Cryptographically verify the attestation chain
5. Display a badge showing the result (Verified, Invalid, Expired, etc.)

**Prerequisite:** The repository owner must have published an Auths attestation as a `*.auths.json` asset on a GitHub Release (Gitea repos expose it via `refs/auths/` instead). If the repo has no Auths attestation, the widget will show an error.

**Supported forges:** GitHub (via Release assets) and Gitea (via Git refs, including self-hosted). GitLab is not supported for auto-resolve because its API does not expose custom Git refs — use manual mode instead.

> **Build your embed in the browser:** the [Embed Builder](https://auths-dev.github.io/auths-verify-widget/) lets you paste a repo URL, preview the live badge, and copy a version-pinned, SRI-protected snippet.

## Display Modes

### Badge (default)

Compact inline pill showing verification status.

```html
<auths-verify repo="https://github.com/user/repo"></auths-verify>
```

### Detail

Badge with an expandable panel showing the full attestation chain. Click the badge to expand.

```html
<auths-verify repo="https://github.com/user/repo" mode="detail"></auths-verify>
```

### Tooltip

Badge with a hover tooltip summarizing verification status.

```html
<auths-verify repo="https://github.com/user/repo" mode="tooltip"></auths-verify>
```

### Sizes

```html
<auths-verify repo="..." size="sm"></auths-verify>
<auths-verify repo="..." size="md"></auths-verify>  <!-- default -->
<auths-verify repo="..." size="lg"></auths-verify>
```

## Attributes

| Attribute | Type | Default | Description |
|---|---|---|---|
| `repo` | URL string | — | Repository URL to verify (recommended) |
| `forge` | `github` \| `gitea` \| `gitlab` | auto-detected | Override forge detection (useful for self-hosted Gitea) |
| `identity` | DID string | — | Filter to a specific identity when a repo has multiple |
| `mode` | `badge` \| `detail` \| `tooltip` | `badge` | Display mode |
| `size` | `sm` \| `md` \| `lg` | `md` | Badge size |
| `auto-verify` | boolean | `true` | Verify automatically on page load |
| `wasm-url` | URL string | — | Override the WASM binary URL |

### Manual mode

If you already have the attestation data (e.g., from a CI pipeline, from a GitLab repo, or for offline verification), you can supply it directly instead of using `repo`:

```html
<auths-verify
  attestation='{"version":1, ...}'
  public-key="aabbccdd..."
></auths-verify>
```

Or for a full chain:

```html
<auths-verify
  attestations='[{"version":1, ...}, {"version":1, ...}]'
  public-key="aabbccdd..."
></auths-verify>
```

| Attribute | Type | Description |
|---|---|---|
| `attestation` | JSON string | Single attestation to verify |
| `attestations` | JSON array string | Chain of attestations to verify |
| `public-key` | hex string | Root/issuer public key — Ed25519 (64 hex chars) or P-256 (66 hex chars, compressed) |

## JavaScript API

```js
const el = document.querySelector('auths-verify');

// Trigger verification manually
await el.verify();

// Get the last verification report
const report = el.getReport();
// report.status.type → 'Valid' | 'InvalidSignature' | 'Expired' | 'Revoked' | 'BrokenChain'
// report.chain       → [{ issuer, subject, valid, error? }, ...]
// report.warnings    → string[]

// Listen for events
el.addEventListener('auths-verified', (e) => {
  console.log('Status:', e.detail.status.type);
  console.log('Chain:', e.detail.chain);
});

el.addEventListener('auths-error', (e) => {
  console.error('Error:', e.detail.error);
});
```

## Theming

All colors are overridable via CSS custom properties:

```css
auths-verify {
  --auths-verified-bg: #eef2ff;
  --auths-verified-fg: #3730a3;
  --auths-verified-border: #a5b4fc;
  --auths-font-family: 'Inter', sans-serif;
  --auths-border-radius: 6px;
}
```

Available properties: `--auths-{state}-bg`, `--auths-{state}-fg`, `--auths-{state}-border` for each state (`verified`, `invalid`, `expired`, `revoked`, `error`, `loading`, `idle`), plus `--auths-font-family`, `--auths-font-size`, `--auths-border-radius`, `--auths-detail-border-radius`.

## How It Works

When you set `repo="https://github.com/user/repo"`:

1. The widget parses the URL and detects the forge (GitHub, Gitea, or GitLab).
2. It resolves the attestation data — the mechanism depends on the forge:
   - **GitHub:** fetches the repository's latest Release (`/repos/{owner}/{repo}/releases/latest`), finds the `*.auths.json` asset, and downloads it (via the Contents API, falling back to the Release asset API).
   - **Gitea:** reads the auths data from Git refs under `refs/auths/` via the Gitea REST API.
   - **GitLab:** not supported for auto-resolve (its REST API does not expose the required data) — use manual mode.
3. It derives the verification key (Ed25519 or P-256): for GitHub, the device public key carried in the attestation; for Gitea, extracted from the controller's `did:key`/CESR identifier (pure TypeScript, no WASM needed).
4. It loads the WASM verification engine and cryptographically verifies the attestation chain.
5. It renders the result as a badge.

The resolver layer uses dynamic imports — if you only use manual `attestation`/`public-key` attributes, the resolver code is never loaded (zero bundle size impact).

## Development

### Prerequisites

- Node.js >= 18
- Rust 1.93+ with `wasm32-unknown-unknown` target (for WASM builds)
- [wasm-pack](https://rustwasm.github.io/wasm-pack/)
- The [auths](https://github.com/auths-dev/auths) repo cloned alongside this one:
  ```
  auths-base/
  ├── auths/                  # main auths repo
  └── auths-verify-widget/    # this repo
  ```

### Setup

```bash
npm install
```

### Build WASM (requires Rust)

```bash
npm run build:wasm
```

### Run tests

```bash
# Unit tests (no WASM required — mocked)
npm test

# Type check
npm run typecheck
```

### Dev server

```bash
npm run dev
```

Opens the examples directory with hot reload via Vite.

### Production build

```bash
npm run build:wasm
npm run build
```

Outputs:
- `dist/auths-verify.mjs` — single self-contained file with the WASM base64-inlined. Recommended for CDN + SRI: one file, one `integrity` hash covers the whole runtime.
- `dist/slim/auths-verify.mjs` — the `./slim` export. Note: it currently also inlines the WASM (via `vite-plugin-wasm`), so it is the same size as the full bundle and shares the same single-hash SRI story; there is no separate `.wasm` to fetch today.

Generate the SRI hash for the built bundle(s) with `npm run sri`.

## License

MIT
