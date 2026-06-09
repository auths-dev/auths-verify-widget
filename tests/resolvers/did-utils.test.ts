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

  it('extracts P-256 compressed key from did:key:zDna... (33 bytes)', () => {
    // Vector: P-256 compressed key 0x02 || 0x00..0x1f, multicodec 0x80 0x24, base58btc.
    const didKey = 'did:key:zDnaeQRywL8RCtEJDKtCyC1VdhMZrFLqPnRJ6udCLK3MvA4ut';
    const expected = '02000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f';
    const hex = didKeyToPublicKeyHex(didKey);
    expect(hex).toBe(expected);
    expect(hex).toHaveLength(66); // 33 bytes → 66 hex chars (curve resolved by length downstream)
  });

  it('rejects an unsupported multicodec', () => {
    // Deterministic vector: raw multicodec [0x12,0x00] (neither Ed25519 nor P-256) + 32 bytes.
    expect(() => didKeyToPublicKeyHex('did:key:zQbrzXjvR2ew9AFuZgHdj4f7hbsDDgsLcwSbMUhB4fDRbZQ')).toThrow(
      'Unsupported did:key multicodec',
    );
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

  it('decodes a P-256 CESR verkey (1AAI, 48 chars → 33 bytes)', () => {
    // Vector: 1AAI || base64url-nopad(0x02 || 0x00..0x1f). Mirrors Rust KeriPublicKey::parse.
    const cesr = '1AAIAgABAgMEBQYHCAkKCwwNDg8QERITFBUWFxgZGhscHR4f';
    const expected = '02000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f';
    expect(cesrToPublicKeyHex(cesr)).toBe(expected);
  });

  it('accepts the transferable P-256 code 1AAJ', () => {
    const cesr = '1AAJAgABAgMEBQYHCAkKCwwNDg8QERITFBUWFxgZGhscHR4f';
    const expected = '02000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f';
    expect(cesrToPublicKeyHex(cesr)).toBe(expected);
  });

  it('rejects an unsupported prefix', () => {
    expect(() => cesrToPublicKeyHex('X' + 'A'.repeat(43))).toThrow('Unsupported CESR verkey');
  });

  it('rejects wrong length', () => {
    expect(() => cesrToPublicKeyHex('DAAA')).toThrow('Unsupported CESR verkey');
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
