/**
 * Pure TypeScript did:key / CESR → public-key-hex extraction (Ed25519 + P-256).
 *
 * Curve is dispatched on the in-band tag — the multicodec varint for did:key, the
 * derivation-code prefix for CESR — never on byte length (per the repo's wire-format
 * curve-tagging rule). The returned hex is 32 bytes for Ed25519 and 33 bytes
 * (compressed SEC1) for P-256; the WASM verifier resolves the curve from that length
 * at its ingestion boundary (32 → Ed25519, 33 → P-256). No external dependencies —
 * runs before WASM loads.
 */

const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

/** Ed25519 public-key multicodec prefix (varint of 0xED). */
const ED25519_MULTICODEC = [0xed, 0x01];
/** P-256 compressed public-key multicodec prefix (varint of 0x1200). */
const P256_MULTICODEC = [0x80, 0x24];

/** Decode a base58btc-encoded string to bytes */
function base58Decode(input: string): Uint8Array {
  const bytes: number[] = [0];
  for (const char of input) {
    const value = BASE58_ALPHABET.indexOf(char);
    if (value < 0) throw new Error(`Invalid base58 character: ${char}`);
    let carry = value;
    for (let j = 0; j < bytes.length; j++) {
      carry += bytes[j] * 58;
      bytes[j] = carry & 0xff;
      carry >>= 8;
    }
    while (carry > 0) {
      bytes.push(carry & 0xff);
      carry >>= 8;
    }
  }
  // Leading zeros
  for (const char of input) {
    if (char !== '1') break;
    bytes.push(0);
  }
  return new Uint8Array(bytes.reverse());
}

/** Convert a byte array to hex string */
function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Decode a base64url string (no/any padding) to bytes, mirroring Rust URL_SAFE_NO_PAD. */
function base64UrlToBytes(input: string): Uint8Array {
  let b64 = input.replace(/-/g, '+').replace(/_/g, '/');
  const remainder = b64.length % 4;
  if (remainder === 2) b64 += '==';
  else if (remainder === 3) b64 += '=';
  else if (remainder === 1) throw new Error('Invalid base64url length');
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/** Whether `bytes` starts with the two-byte multicodec `prefix`. */
function hasMulticodec(bytes: Uint8Array, prefix: number[]): boolean {
  return bytes.length >= prefix.length && prefix.every((b, i) => bytes[i] === b);
}

/**
 * Extract a public key (hex) from a did:key:z... identifier.
 *
 * The multibase prefix 'z' is base58btc. After decoding, the leading multicodec
 * varint selects the curve:
 * - `0xED 0x01` → Ed25519 (`z6Mk…`), 32-byte key.
 * - `0x80 0x24` → P-256 compressed (`zDna…`), 33-byte SEC1 key.
 *
 * Returns the raw key hex (no multicodec). Throws on any other multicodec.
 */
export function didKeyToPublicKeyHex(didKey: string): string {
  if (!didKey.startsWith('did:key:z')) {
    throw new Error(`Expected did:key:z... format, got: ${didKey}`);
  }

  // Strip 'did:key:z' — 'z' is the base58btc multibase prefix
  const encoded = didKey.slice('did:key:z'.length);
  const decoded = base58Decode(encoded);

  if (hasMulticodec(decoded, ED25519_MULTICODEC)) {
    if (decoded.length < 2 + 32) {
      throw new Error(`Truncated Ed25519 did:key: need 34 bytes, got ${decoded.length}`);
    }
    return bytesToHex(decoded.slice(2, 2 + 32));
  }

  if (hasMulticodec(decoded, P256_MULTICODEC)) {
    if (decoded.length < 2 + 33) {
      throw new Error(`Truncated P-256 did:key: need 35 bytes, got ${decoded.length}`);
    }
    return bytesToHex(decoded.slice(2, 2 + 33));
  }

  throw new Error(
    `Unsupported did:key multicodec (expected Ed25519 [0xED,0x01] or P-256 [0x80,0x24]), ` +
      `got: 0x${bytesToHex(decoded.slice(0, 2))}`,
  );
}

/**
 * Decode a CESR-encoded verkey to hex (Ed25519 or P-256).
 *
 * Dispatches on the derivation-code prefix, matching Rust `KeriPublicKey::parse`:
 * - Ed25519: `D`/`B` (1-char code) + 43 base64url chars = 44 total → 32 bytes.
 * - P-256:   `1AAJ`/`1AAI` (4-char code) + 44 base64url chars = 48 total → 33 bytes
 *   (compressed SEC1). `1AAJ` is transferable, `1AAI` non-transferable; both decode
 *   to the same point.
 */
export function cesrToPublicKeyHex(cesr: string): string {
  if (cesr.length === 44 && (cesr[0] === 'D' || cesr[0] === 'B')) {
    const bytes = base64UrlToBytes(cesr.slice(1));
    if (bytes.length !== 32) {
      throw new Error(`Expected 32-byte Ed25519 key, decoded ${bytes.length} bytes`);
    }
    return bytesToHex(bytes);
  }

  if (cesr.length === 48 && (cesr.startsWith('1AAJ') || cesr.startsWith('1AAI'))) {
    const bytes = base64UrlToBytes(cesr.slice(4));
    if (bytes.length !== 33) {
      throw new Error(`Expected 33-byte P-256 key, decoded ${bytes.length} bytes`);
    }
    return bytesToHex(bytes);
  }

  throw new Error(
    `Unsupported CESR verkey: expected 'D'/'B' Ed25519 (44 chars) or '1AAJ'/'1AAI' P-256 ` +
      `(48 chars), got '${cesr.slice(0, 6)}…' (length ${cesr.length})`,
  );
}

/**
 * Sanitize a DID for use in Git ref paths.
 * Matches Rust: layout.rs:247-251 — replace non-alphanumeric with '_'
 */
export function sanitizeDidForRef(did: string): string {
  return did.replace(/[^a-zA-Z0-9]/g, '_');
}
