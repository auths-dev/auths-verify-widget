/**
 * Pure TypeScript did:key:z... → Ed25519 public key hex extraction.
 *
 * Uses base58btc decoding + multicodec prefix stripping (0xED 0x01).
 * No external dependencies — runs before WASM loads.
 */

const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

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

/**
 * Extract Ed25519 public key hex from a did:key:z... identifier.
 *
 * The multibase prefix 'z' indicates base58btc encoding.
 * After decoding, the first two bytes are the multicodec prefix:
 * 0xED 0x01 = Ed25519 public key.
 * The remaining 32 bytes are the raw public key.
 */
export function didKeyToPublicKeyHex(didKey: string): string {
  if (!didKey.startsWith('did:key:z')) {
    throw new Error(`Expected did:key:z... format, got: ${didKey}`);
  }

  // Strip 'did:key:z' — 'z' is the base58btc multibase prefix
  const encoded = didKey.slice('did:key:z'.length);
  const decoded = base58Decode(encoded);

  // Verify multicodec prefix for Ed25519: 0xED 0x01
  if (decoded.length < 34 || decoded[0] !== 0xed || decoded[1] !== 0x01) {
    throw new Error(
      `Expected Ed25519 multicodec prefix (0xED 0x01), got: 0x${bytesToHex(decoded.slice(0, 2))}`,
    );
  }

  // Remaining 32 bytes are the public key
  return bytesToHex(decoded.slice(2, 34));
}

/**
 * Decode a CESR-encoded Ed25519 public key to hex.
 *
 * CESR uses a 1-char type code prefix that replaces base64 padding.
 * For Ed25519 keys: prefix 'D', total 44 chars.
 * To decode: replace prefix with 'A' (zero byte), base64url-decode → 33 bytes,
 * skip first byte, remaining 32 bytes are the raw key.
 */
export function cesrToPublicKeyHex(cesr: string): string {
  if (cesr.length !== 44 || cesr[0] !== 'D') {
    throw new Error(`Expected 44-char CESR Ed25519 key (D prefix), got: ${cesr}`);
  }
  const b64url = 'A' + cesr.slice(1);
  const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(b64);
  const bytes = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    bytes[i] = binary.charCodeAt(i + 1);
  }
  return bytesToHex(bytes);
}

/**
 * Sanitize a DID for use in Git ref paths.
 * Matches Rust: layout.rs:247-251 — replace non-alphanumeric with '_'
 */
export function sanitizeDidForRef(did: string): string {
  return did.replace(/[^a-zA-Z0-9]/g, '_');
}
