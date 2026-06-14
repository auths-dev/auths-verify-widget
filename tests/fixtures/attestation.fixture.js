// Deterministic signed attestation fixture for the headless-core smoke test.
//
// Source: auths/crates/auths-verifier/tests/wasm_bindings.rs
//   (FIXTURE_ISSUER_PK_HEX + FIXTURE_ATTESTATION_JSON, generated via
//    `cargo run --example gen_wasm_fixture -p auths-verifier`).
// This is a verbatim copy of a vector the Rust wasm-bindgen test proves
// verifies Valid. Regenerate it from that source if the attestation
// wire-format ever changes (otherwise the smoke test will drift / break).

/** Issuer (root) Ed25519 public key, hex. */
export const issuerPkHex =
  '8a88e3dd7409f195fd52db2d3cba5d72ca6709bf1d94121bf3748801b40f6f5c';

/** A real, signed attestation that verifies to a Valid verdict. */
export const attestationJson = JSON.stringify({
  version: 1,
  rid: 'test-rid',
  issuer: 'did:key:z6Mkon3Necd6NkkyfoGoHxid2znGc59LU3K7mubaRcFbLfLX',
  subject: 'did:key:z6Mko9hTggMwjSTEaJaPUfE6tqcy2xvU6BnNq3e3o8qVBiyH',
  device_public_key: '8139770ea87d175f56a35466c34c7ecccb8d8a91b4ee37a25df60f5b8fc9b394',
  identity_signature:
    '1690dee2371b2bd586e696c6f891c509140ff808b82cda8c83ecfa0ea396cb3e295006ad2e6498389b5e3b1ff9d089a9ab654c30adb68d55bde04a64d7e80208',
  device_signature:
    'df199539fd0367b3684fef8b484f829c679c1d02373acf9787150032a573a3e79c878e3c4c403dfeffc25f5d4695aecb64ea67a286068ed7ca4a51f042adfc08',
  timestamp: null,
});

/**
 * The same attestation with one hex digit of `device_signature` flipped.
 * Must NOT verify (rejected verdict / thrown error).
 */
export const tamperedJson = (() => {
  const att = JSON.parse(attestationJson);
  const sig = att.device_signature;
  const last = sig.slice(-1);
  att.device_signature = sig.slice(0, -1) + (last === '8' ? '9' : '8');
  return JSON.stringify(att);
})();

/** Not valid JSON — used to prove the entry rejects garbage cleanly. */
export const malformedJson = 'not valid json {{{{';
