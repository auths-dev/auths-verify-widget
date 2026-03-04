# `<auths-verify>` Web Component

[![npm version](https://img.shields.io/npm/v/auths-verify.svg)](https://www.npmjs.com/package/auths-verify)
[![license](https://img.shields.io/npm/l/auths-verify.svg)](https://github.com/auths-dev/auths-verify-widget/blob/main/LICENSE)

A drop-in web component that verifies [Auths](https://github.com/auths-dev/auths) decentralized identities — the open-source equivalent of GitHub's green "Verified" badge. Point it at any repository that uses Auths, and it cryptographically verifies the identity chain in the browser via WASM.

## Install

**CDN (no build step):**

```html
<script type="module" src="https://unpkg.com/auths-verify/dist/auths-verify.mjs"></script>
```

**npm (for bundlers):**

```bash
npm install auths-verify
```

```js
import 'auths-verify';
```

## Quick Start

Add the widget to any page and point it at a repository:

```html
<auths-verify repo="https://github.com/user/repo"></auths-verify>
```

That's it. The widget will:

1. Call the GitHub API to read the repository's `refs/auths/` identity data
2. Extract the public key from the identity's `did:key`
3. Load the WASM verification engine
4. Cryptographically verify the full attestation chain
5. Display a badge showing the result (Verified, Invalid, Expired, etc.)

**Prerequisite:** The repository owner must have set up an Auths identity with [`auths init`](https://github.com/auths-dev/auths). If the repo doesn't have Auths identity data, the widget will show an error.

**Supported forges:** GitHub and Gitea (including self-hosted). GitLab is not supported for auto-resolve because its API does not expose custom Git refs — use manual mode instead.

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
| `public-key` | hex string | Root/issuer Ed25519 public key (64 hex chars) |

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

1. The widget parses the URL and detects the forge (GitHub, Gitea, or GitLab)
2. It calls the forge's REST API to list Git refs under `refs/auths/`
3. It reads `identity.json` from `refs/auths/identity` to get the controller DID
4. It extracts the Ed25519 public key from the `did:key:z...` identifier (pure TypeScript, no WASM needed)
5. It reads `attestation.json` from each device ref under `refs/auths/devices/nodes/`
6. It loads the WASM verification engine and cryptographically verifies the attestation chain
7. It renders the result as a badge

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
- `dist/auths-verify.mjs` — single file with WASM base64-inlined
- `dist/slim/auths-verify.mjs` — smaller JS, loads `.wasm` separately

## License

MIT
