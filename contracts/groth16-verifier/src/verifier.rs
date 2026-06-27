//! Writ on-chain Groth16-BN254 verifier — the keystone of the challenge layer.
//!
//! Casper testnet exposes no native elliptic-curve pairing host function
//! (`vm_casper_v1`), so the Groth16 pairing check runs as pure-WASM `arkworks`
//! INSIDE the contract. The eligibility circuit's verifying key is compiled in
//! as an immutable constant (the root trust anchor) — it is NOT a runtime
//! argument and cannot be swapped after install.
//!
//! `verify(proof, public_inputs)` deserializes the arkworks canonical-uncompressed
//! proof and the public inputs (32 bytes each, canonical circuit order:
//! `[nullifier, commitment, issuerAx, issuerAy, assetId, allowedRoot]`) and runs
//! the pairing check against the embedded VK. The path is fully deterministic —
//! no RNG, no host randomness.

use ark_bn254::{Bn254, Fr};
use ark_groth16::{prepare_verifying_key, Groth16, Proof, VerifyingKey};
use ark_serialize::CanonicalDeserialize;
use odra::casper_types::bytesrepr::Bytes;
use odra::prelude::*;

/// The eligibility circuit's verifying key, arkworks canonical-uncompressed,
/// produced by `circuits/ark-verifier`'s `gen_fixtures` from
/// `circuits/build/elig2_vkey.json` with the proven g2_swap=false ordering — the
/// exact same conversion the off-chain agent quorum uses. Immutable trust anchor.
const VK_BYTES: &[u8] = include_bytes!("../fixtures/vk_uncompressed.bin");

/// A BN254 scalar-field element is 32 bytes (canonical little-endian).
const FR_LEN: usize = 32;

/// Pure pairing-check verify. `_unchecked` deserialization mirrors the
/// `new_unchecked` construction the off-chain conversion used (no curve/subgroup
/// re-check); soundness rests on the Groth16 pairing equation. Any malformed
/// input is a clean `false`, never a panic/revert.
fn verify_groth16(proof_bytes: &[u8], inputs_concat: &[u8]) -> bool {
    let vk = match VerifyingKey::<Bn254>::deserialize_uncompressed_unchecked(VK_BYTES) {
        Ok(v) => v,
        Err(_) => return false,
    };
    let proof = match Proof::<Bn254>::deserialize_uncompressed_unchecked(proof_bytes) {
        Ok(p) => p,
        Err(_) => return false,
    };
    if inputs_concat.is_empty() || inputs_concat.len() % FR_LEN != 0 {
        return false;
    }
    let mut inputs = Vec::with_capacity(inputs_concat.len() / FR_LEN);
    for chunk in inputs_concat.chunks(FR_LEN) {
        match Fr::deserialize_uncompressed_unchecked(chunk) {
            Ok(f) => inputs.push(f),
            Err(_) => return false,
        }
    }
    let pvk = prepare_verifying_key(&vk);
    matches!(Groth16::<Bn254>::verify_proof(&pvk, &proof, &inputs), Ok(true))
}

#[odra::module]
pub struct Groth16Verifier {}

#[odra::module]
impl Groth16Verifier {
    /// Verify a Groth16-BN254 proof against the embedded eligibility VK.
    /// `proof` is the arkworks canonical-uncompressed `Proof`; `public_inputs`
    /// is the public inputs concatenated, 32 bytes each, in canonical circuit
    /// order. Returns whether the pairing check holds.
    pub fn verify(&self, proof: Bytes, public_inputs: Bytes) -> bool {
        verify_groth16(proof.as_slice(), public_inputs.as_slice())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use odra::host::{Deployer, HostEnv, NoArgs};

    fn setup() -> (HostEnv, Groth16VerifierHostRef) {
        let env = odra_test::env();
        let contract = Groth16Verifier::deploy(&env, NoArgs);
        (env, contract)
    }

    fn proof() -> Bytes {
        Bytes::from(include_bytes!("../fixtures/proof.bin").as_slice())
    }
    fn proof_tampered() -> Bytes {
        Bytes::from(include_bytes!("../fixtures/proof_tampered.bin").as_slice())
    }
    fn inputs() -> Bytes {
        Bytes::from(include_bytes!("../fixtures/inputs.bin").as_slice())
    }
    fn inputs_tampered() -> Bytes {
        Bytes::from(include_bytes!("../fixtures/inputs_tampered.bin").as_slice())
    }

    #[test]
    fn real_proof_verifies_true() {
        let (env, contract) = setup();
        assert!(
            contract.verify(proof(), inputs()),
            "the real valid eligibility proof must verify true"
        );
        println!("GAS_REPORT[valid]:\n{}", env.gas_report());
    }

    #[test]
    fn tampered_proof_verifies_false() {
        let (_env, contract) = setup();
        assert!(
            !contract.verify(proof_tampered(), inputs()),
            "a tampered proof must verify false"
        );
    }

    #[test]
    fn tampered_input_verifies_false() {
        let (_env, contract) = setup();
        assert!(
            !contract.verify(proof(), inputs_tampered()),
            "a tampered public input must verify false"
        );
    }
}
