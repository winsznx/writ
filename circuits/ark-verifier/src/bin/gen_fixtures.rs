// Emits the arkworks canonical-UNCOMPRESSED bytes the on-chain verifier embeds
// (the VK) and consumes (proof, public inputs), using the SAME snarkjs->arkworks
// conversion as `ark-verify` (g2_swap=false). This guarantees the on-chain
// verify operates on byte-identical material to the proven off-chain path.
//
// `_unchecked` deserialization on-chain mirrors the `new_unchecked` construction
// here (no curve/subgroup re-check); soundness comes from the pairing equation.
//
// usage: gen_fixtures <vkey.json> <proof.json> <public.json> <out_dir>

use ark_serialize::CanonicalSerialize;
use ark_verifier::{build_inputs, build_proof, build_vk};
use serde_json::Value;
use std::fs;
use std::path::Path;

fn ser<T: CanonicalSerialize>(v: &T) -> Vec<u8> {
    let mut b = Vec::new();
    v.serialize_uncompressed(&mut b).expect("serialize_uncompressed");
    b
}

fn main() {
    let a: Vec<String> = std::env::args().collect();
    let vkj: Value = serde_json::from_reader(fs::File::open(&a[1]).unwrap()).unwrap();
    let prj: Value = serde_json::from_reader(fs::File::open(&a[2]).unwrap()).unwrap();
    let pbj: Value = serde_json::from_reader(fs::File::open(&a[3]).unwrap()).unwrap();
    let out = Path::new(&a[4]);
    fs::create_dir_all(out).unwrap();

    let vk = build_vk(&vkj, false);
    let proof = build_proof(&prj, false);
    let inputs = build_inputs(&pbj);

    let vk_bytes = ser(&vk);
    let proof_bytes = ser(&proof);
    let mut inputs_bytes = Vec::new();
    for fr in &inputs {
        inputs_bytes.extend_from_slice(&ser(fr));
    }

    // Tampered proof: flip the lowest bit of pi_a.x. Still well-formed field
    // bytes (deserializes fine) but no longer a valid proof -> pairing fails.
    let mut proof_tampered = proof_bytes.clone();
    proof_tampered[0] ^= 0x01;

    // Tampered inputs: flip the lowest bit of the first public input (nullifier).
    let mut inputs_tampered = inputs_bytes.clone();
    inputs_tampered[0] ^= 0x01;

    fs::write(out.join("vk_uncompressed.bin"), &vk_bytes).unwrap();
    fs::write(out.join("proof.bin"), &proof_bytes).unwrap();
    fs::write(out.join("proof_tampered.bin"), &proof_tampered).unwrap();
    fs::write(out.join("inputs.bin"), &inputs_bytes).unwrap();
    fs::write(out.join("inputs_tampered.bin"), &inputs_tampered).unwrap();

    println!(
        "wrote: vk={}B proof={}B inputs={}B ({} public) -> {}",
        vk_bytes.len(),
        proof_bytes.len(),
        inputs_bytes.len(),
        inputs.len(),
        out.display()
    );
}
