import { describe, it, expect } from 'vitest';
import {
  cesrToPublicKeyHex,
  didKeyToPublicKeyHex,
  sanitizeDidForRef,
} from '../../src/resolvers/did-utils';

describe('didKeyToPublicKeyHex', () => {
  it('should extract Ed25519 public key from did:key:z...', () => {
    // Known test vector:
    // Ed25519 public key (32 bytes hex): d75a980182b10ab7d54bfed3c964073a0ee172f3daa3f4a18446b7e8c7f8e2db
    // Multicodec prefix: ed01
    // Base58btc of ed01 + key: z6MkiTBz1ymuepAQ4HEHYSF1H8quG5GLVVQR3djdX3mDooWp
    const didKey = 'did:key:z6MkiTBz1ymuepAQ4HEHYSF1H8quG5GLVVQR3djdX3mDooWp';
    const hex = didKeyToPublicKeyHex(didKey);
    // Should be 64 hex chars (32 bytes)
    expect(hex).toHaveLength(64);
    // Verify it's valid hex
    expect(hex).toMatch(/^[0-9a-f]{64}$/);
  });

  it('should reject non did:key:z... format', () => {
    expect(() => didKeyToPublicKeyHex('did:keri:EOrg123')).toThrow('Expected did:key:z');
    expect(() => didKeyToPublicKeyHex('not-a-did')).toThrow('Expected did:key:z');
  });

  it('should produce consistent results for same input', () => {
    const did = 'did:key:z6MkiTBz1ymuepAQ4HEHYSF1H8quG5GLVVQR3djdX3mDooWp';
    const hex1 = didKeyToPublicKeyHex(did);
    const hex2 = didKeyToPublicKeyHex(did);
    expect(hex1).toBe(hex2);
  });
});

describe('cesrToPublicKeyHex', () => {
  it('decodes CESR Ed25519 key matching Rust KeriPublicKey::parse', () => {
    // Real test vector from identity E6IXlw5-lnX88r3WZCt3u1qyN_Xlq7nQjtoTmuOfMIjI
    // CESR key from state.json current_keys[0]
    const cesr = 'D1P_LPk3v4aTOxFMeLJq55lsPL5-i_BhRfIn27APru2Q';
    // Expected: Rust KeriPublicKey::parse strips D, base64url-decodes 43 chars → 32 bytes
    const expected = 'd4ffcb3e4defe1a4cec4531e2c9ab9e65b0f2f9fa2fc18517c89f6ec03ebbb64';
    expect(cesrToPublicKeyHex(cesr)).toBe(expected);
  });

  it('decodes all-zero key correctly', () => {
    // Rust: KeriPublicKey::parse("DAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA") → [0u8; 32]
    const cesr = 'DAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
    const expected = '0'.repeat(64);
    expect(cesrToPublicKeyHex(cesr)).toBe(expected);
  });

  it('rejects non-D prefix', () => {
    expect(() => cesrToPublicKeyHex('X' + 'A'.repeat(43))).toThrow('Expected 44-char CESR');
  });

  it('rejects wrong length', () => {
    expect(() => cesrToPublicKeyHex('DAAA')).toThrow('Expected 44-char CESR');
  });
});

describe('sanitizeDidForRef', () => {
  it('should replace colons with underscores', () => {
    expect(sanitizeDidForRef('did:keri:EOrg123')).toBe('did_keri_EOrg123');
  });

  it('should replace all non-alphanumeric characters', () => {
    expect(sanitizeDidForRef('did:key:z6Mk...')).toBe('did_key_z6Mk___');
  });

  it('should keep alphanumeric characters unchanged', () => {
    expect(sanitizeDidForRef('abc123')).toBe('abc123');
  });

  it('should handle empty string', () => {
    expect(sanitizeDidForRef('')).toBe('');
  });
});
