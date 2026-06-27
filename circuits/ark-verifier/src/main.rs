// snarkjs -> arkworks Groth16-BN254 verifier.
// Parses snarkjs-exported verification_key.json + proof.json + public.json and
// verifies with ark-groth16 + ark-bn254. This is the agent's off-chain
// verification path. Tries both Fq2 coordinate orderings to settle the
// snarkjs/arkworks G2 serialization convention.
//
// usage: ark-verify <vkey.json> <proof.json> <public.json>

use ark_bn254::Bn254;
use ark_groth16::{prepare_verifying_key, Groth16};
use ark_verifier::{build_inputs, build_proof, build_vk};
use serde_json::Value;

fn main() {
    let a: Vec<String> = std::env::args().collect();
    let vkj: Value = serde_json::from_reader(std::fs::File::open(&a[1]).unwrap()).unwrap();
    let prj: Value = serde_json::from_reader(std::fs::File::open(&a[2]).unwrap()).unwrap();
    let pbj: Value = serde_json::from_reader(std::fs::File::open(&a[3]).unwrap()).unwrap();
    let inputs = build_inputs(&pbj);

    for swap in [false, true] {
        let vk = build_vk(&vkj, swap);
        let proof = build_proof(&prj, swap);
        let pvk = prepare_verifying_key(&vk);
        match Groth16::<Bn254>::verify_proof(&pvk, &proof, &inputs) {
            Ok(true) => {
                println!("ARKWORKS_VERIFY=PASS g2_swap={} n_public={}", swap, inputs.len());
                std::process::exit(0);
            }
            Ok(false) => eprintln!("invalid (g2_swap={})", swap),
            Err(e) => eprintln!("error (g2_swap={}): {:?}", swap, e),
        }
    }
    println!("ARKWORKS_VERIFY=FAIL");
    std::process::exit(1);
}
