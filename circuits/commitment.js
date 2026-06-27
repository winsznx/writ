// Shared Poseidon commitment — the SINGLE source of the on-chain committed value.
//
//   commitment = Poseidon(accredited, jurisdictionCode, sanctioned, identitySecret, salt)
//   nullifier  = Poseidon(identitySecret, assetIdField)
//
// Identical to eligibility.circom's `commitment`/`nullifier` and to the values the
// agent onboarded. This module is reused by the witness generator (gen_input.js)
// AND the off-chain disclosure verifier (disclosure/) so a regulator's local
// recompute matches the on-chain commitment BYTE-FOR-BYTE. Do NOT reimplement
// Poseidon anywhere else — import from here.

const { buildPoseidon } = require("circomlibjs");

let _poseidon = null;
async function poseidon() {
  if (!_poseidon) _poseidon = await buildPoseidon();
  return _poseidon;
}

/// claims = { accredited, jurisdictionCode, sanctioned, identitySecret, salt }
/// (decimal strings or bigints). Returns the field element as a decimal string.
async function commitment(claims) {
  const p = await poseidon();
  return p.F.toString(
    p([
      BigInt(claims.accredited),
      BigInt(claims.jurisdictionCode),
      BigInt(claims.sanctioned),
      BigInt(claims.identitySecret),
      BigInt(claims.salt),
    ])
  );
}

async function nullifier(identitySecret, assetIdField) {
  const p = await poseidon();
  return p.F.toString(p([BigInt(identitySecret), BigInt(assetIdField)]));
}

/// Map an asset string to its field element the same way the agent/circuit does.
function assetIdField(assetStr) {
  return BigInt("0x" + Buffer.from(assetStr).toString("hex")).toString();
}

module.exports = { poseidon, commitment, nullifier, assetIdField };
