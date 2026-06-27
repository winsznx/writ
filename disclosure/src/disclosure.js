// Writ selective disclosure — the regulator-view mechanism (off-chain).
//
// A regulator independently verifies a holder's eligibility against what is
// actually on-chain, WITHOUT the issuer ever exposing PII broadly:
//
//   - the COMMITMENT is already on-chain per credential (Poseidon(claims, salt));
//   - STATUS + the attribution TRAIL are already on-chain via the proven events;
//   - the holder reveals the PREIMAGE (claims+salt) directly to the regulator,
//     who recomputes the commitment locally and checks it against the chain.
//
// The recompute reuses the SHARED commitment lib (circuits/commitment.js) — the
// exact Poseidon/params of eligibility.circom and the agent's onboarding — so the
// local recompute equals the on-chain committed value byte-for-byte. Poseidon is
// NEVER reimplemented here.

const nacl = require("tweetnacl");
const { commitment } = require("../../circuits/commitment");

// ---------- STEP 1: verify primitive ----------

/// A disclosure package: references the on-chain credential and reveals exactly
/// the preimage of its commitment.
///   { asset_id, holder, commitment, revealed: { accredited, jurisdictionCode,
///     sanctioned, identitySecret, salt } }

/// Recompute Poseidon(revealed claims, salt) and compare to the on-chain
/// commitment. Returns true iff the revealed claims are provably the committed
/// ones. Any tampered claim or salt yields a different commitment -> false.
async function verifyDisclosure(pkg, onchainCommitment) {
  const recomputed = await commitment(pkg.revealed);
  return recomputed === String(onchainCommitment);
}

// ---------- STEP 2: holder-initiated disclosure (issuer not involved) ----------

/// The holder assembles the package from the claims+salt they already hold
/// (their onboarding artifacts) plus the on-chain credential reference.
///   artifacts = { asset_id, holder, commitment, claims: {...preimage} }
function buildDisclosure(artifacts) {
  return {
    asset_id: artifacts.asset_id,
    holder: artifacts.holder,
    commitment: String(artifacts.commitment),
    revealed: {
      accredited: String(artifacts.claims.accredited),
      jurisdictionCode: String(artifacts.claims.jurisdictionCode),
      sanctioned: String(artifacts.claims.sanctioned),
      identitySecret: String(artifacts.claims.identitySecret),
      salt: String(artifacts.claims.salt),
    },
  };
}

// ---------- STEP 3: holder-consented escrow (compelled disclosure) ----------
//
// The issuer NEVER has the preimage. So escrow is HOLDER-PROVIDED: as a condition
// of onboarding the holder seals their own preimage to the regulator's public key
// and submits only that ciphertext. Sealed box = ephemeral X25519 keypair +
// authenticated XSalsa20-Poly1305 (nacl.box): the sender is anonymous and only the
// regulator's secret key can open it. PLAINTEXT IS NEVER PERSISTED issuer-side.

const SEAL_EPH = nacl.box.publicKeyLength; // 32
const SEAL_NONCE = nacl.box.nonceLength; // 24

/// Holder side: seal `preimage` to the regulator's public key.
/// ciphertext = ephemeralPub(32) || nonce(24) || box.
function escrowEncrypt(preimage, regulatorPub) {
  const msg = Buffer.from(JSON.stringify(preimage), "utf8");
  const eph = nacl.box.keyPair();
  const nonce = nacl.randomBytes(SEAL_NONCE);
  const box = nacl.box(msg, nonce, regulatorPub, eph.secretKey);
  return Buffer.concat([Buffer.from(eph.publicKey), Buffer.from(nonce), Buffer.from(box)]);
}

/// Regulator side: open the ciphertext with the regulator secret key and assemble
/// the disclosure package bound to the on-chain credential. Returns null if the
/// key is wrong or the ciphertext was tampered (authentication fails).
function compelledDisclose(ciphertext, regulatorSecret, bindings) {
  const ct = Buffer.from(ciphertext);
  const ephPub = ct.subarray(0, SEAL_EPH);
  const nonce = ct.subarray(SEAL_EPH, SEAL_EPH + SEAL_NONCE);
  const box = ct.subarray(SEAL_EPH + SEAL_NONCE);
  const opened = nacl.box.open(box, nonce, ephPub, regulatorSecret);
  if (!opened) return null;
  const preimage = JSON.parse(Buffer.from(opened).toString("utf8"));
  return {
    asset_id: bindings.asset_id,
    holder: bindings.holder,
    commitment: String(bindings.commitment),
    revealed: preimage,
  };
}

/// Demo regulator keypair. The public key is the escrow target (published); the
/// secret key is held only regulator-side.
function regulatorKeypair() {
  return nacl.box.keyPair();
}

/// The disclosure store: keyed by credential, holds ONLY ciphertext. It is part of
/// `disclosure/`, separate from the agent's attest path (the proven agent is left
/// untouched). There is deliberately no plaintext API.
class DisclosureStore {
  constructor() {
    this._cipher = new Map();
  }
  _key(asset_id, holder) {
    return `${asset_id}::${holder}`;
  }
  putCiphertext(asset_id, holder, ciphertext) {
    this._cipher.set(this._key(asset_id, holder), Buffer.from(ciphertext));
  }
  getCiphertext(asset_id, holder) {
    return this._cipher.get(this._key(asset_id, holder));
  }
  /// Total bytes persisted — used by tests to assert nothing but ciphertext is held.
  entries() {
    return [...this._cipher.entries()].map(([k, v]) => ({ key: k, ciphertext: v }));
  }
}

// ---------- STEP 4: regulator verdict (what /app/regulator renders) ----------

/// Combine the commitment match with the credential's LIVE status and full
/// attribution trail into the single object the regulator view renders. In the
/// live frontend `onchain` is read from the chain event store / CSPR.cloud; the
/// commitment match is computed locally from the disclosed preimage.
///   onchain = { asset_id, holder, commitment, status, history: [events] }
async function assembleVerdict(onchain, pkg) {
  const claims_verified = await verifyDisclosure(pkg, onchain.commitment);
  return {
    asset_id: onchain.asset_id,
    holder: onchain.holder,
    claims_verified,
    revealed_claims: pkg.revealed,
    current_status: onchain.status,
    history: onchain.history,
  };
}

module.exports = {
  verifyDisclosure,
  buildDisclosure,
  escrowEncrypt,
  compelledDisclose,
  regulatorKeypair,
  DisclosureStore,
  assembleVerdict,
};
