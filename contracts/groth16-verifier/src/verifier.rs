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

/// Pure pairing-check verify with CHECKED deserialization of all caller-supplied
/// material: proof points must be on-curve AND in the correct subgroup, public
/// inputs must be canonical field elements (< r). Any malformed input is a clean
/// `false`, never a panic/revert.
///
/// The VK alone stays on the `_unchecked` path at runtime: it is a compile-time
/// constant from the project's own trusted build (not caller input), and the test
/// suite validates the exact same bytes with fully CHECKED deserialization
/// (`vk_bytes_pass_checked_deserialization`), so the runtime skip costs nothing
/// in soundness while avoiding a redundant per-call subgroup sweep over the VK.
fn verify_groth16(proof_bytes: &[u8], inputs_concat: &[u8]) -> bool {
    let vk = match VerifyingKey::<Bn254>::deserialize_uncompressed_unchecked(VK_BYTES) {
        Ok(v) => v,
        Err(_) => return false,
    };
    let proof = match Proof::<Bn254>::deserialize_uncompressed(proof_bytes) {
        Ok(p) => p,
        Err(_) => return false,
    };
    if inputs_concat.is_empty() || inputs_concat.len() % FR_LEN != 0 {
        return false;
    }
    let mut inputs = Vec::with_capacity(inputs_concat.len() / FR_LEN);
    for chunk in inputs_concat.chunks(FR_LEN) {
        match Fr::deserialize_uncompressed(chunk) {
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

    #[test]
    fn vk_bytes_pass_checked_deserialization() {
        // The runtime keeps the compile-time VK on the unchecked path; this test
        // holds the exact embedded bytes to the FULL checked standard (on-curve +
        // subgroup for every VK point).
        VerifyingKey::<Bn254>::deserialize_uncompressed(VK_BYTES)
            .expect("embedded VK must satisfy checked deserialization");
    }

    #[test]
    fn malformed_proof_rejected() {
        let (_env, contract) = setup();
        assert!(!contract.verify(Bytes::from(vec![]), inputs()));
        assert!(!contract.verify(Bytes::from(vec![0u8; 255]), inputs()));
        assert!(!contract.verify(Bytes::from(vec![0xffu8; 256]), inputs()));
    }

    #[test]
    fn off_curve_proof_point_rejected() {
        // Corrupt A.y so (x, y) is (almost surely) off-curve but still a valid
        // field encoding — checked deserialization must reject it.
        let (_env, contract) = setup();
        let mut bytes = include_bytes!("../fixtures/proof.bin").to_vec();
        bytes[32] ^= 0x01; // low bit of A.y
        assert!(
            !contract.verify(Bytes::from(bytes), inputs()),
            "an off-curve proof point must be rejected"
        );
    }

    #[test]
    fn non_subgroup_g2_point_rejected() {
        use ark_bn254::{Fq, Fq2, G2Affine};
        use ark_ec::AffineRepr;
        use ark_ff::Field;
        use ark_serialize::CanonicalSerialize;

        // Find a point ON the G2 curve but OUTSIDE the r-order subgroup (the G2
        // cofactor is huge, so any solved point is out-of-subgroup w.h.p.).
        let b = G2Affine::generator().y().unwrap().square()
            - G2Affine::generator().x().unwrap().square() * G2Affine::generator().x().unwrap();
        let mut found = None;
        for i in 1u64..200 {
            let x = Fq2::new(Fq::from(i), Fq::from(0u64));
            if let Some(y) = (x.square() * x + b).sqrt() {
                let p = G2Affine::new_unchecked(x, y);
                if p.is_on_curve() && !p.is_in_correct_subgroup_assuming_on_curve() {
                    found = Some(p);
                    break;
                }
            }
        }
        let rogue = found.expect("an on-curve, out-of-subgroup G2 point exists in range");

        // Splice the rogue point into the B slot (bytes 64..192) of a valid proof.
        let mut bytes = include_bytes!("../fixtures/proof.bin").to_vec();
        let mut rogue_bytes = Vec::new();
        rogue.serialize_uncompressed(&mut rogue_bytes).unwrap();
        bytes[64..192].copy_from_slice(&rogue_bytes);

        let (_env, contract) = setup();
        assert!(
            !contract.verify(Bytes::from(bytes), inputs()),
            "an out-of-subgroup G2 point must be rejected by checked deserialization"
        );
    }

    #[test]
    fn non_canonical_field_element_rejected() {
        // 32 bytes of 0xff encode a value >= r — checked Fr deserialization must
        // reject the non-canonical input.
        let (_env, contract) = setup();
        let mut bad_inputs = include_bytes!("../fixtures/inputs.bin").to_vec();
        bad_inputs[0..32].copy_from_slice(&[0xffu8; 32]);
        assert!(
            !contract.verify(proof(), Bytes::from(bad_inputs)),
            "a non-canonical (>= r) public input must be rejected"
        );
    }
}
