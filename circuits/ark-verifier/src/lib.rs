//! Shared snarkjs -> arkworks Groth16-BN254 conversion. Single source of truth
//! for both the off-chain verifier (bin `ark-verify`) and the on-chain fixture
//! generator (bin `gen_fixtures`), so the bytes the agent verifies off-chain and
//! the bytes the contract verifies on-chain are produced by identical code.
//!
//! g2_swap=false is the proven Fq2 ordering (natural c0,c1) for this circuit.

use ark_bn254::{Bn254, Fq, Fq2, Fr, G1Affine, G2Affine};
use ark_groth16::{Proof, VerifyingKey};
use num_bigint::BigUint;
use serde_json::Value;
use std::str::FromStr;

pub fn fq(s: &str) -> Fq {
    Fq::from(BigUint::from_str(s).expect("Fq decimal"))
}
pub fn fr(s: &str) -> Fr {
    Fr::from(BigUint::from_str(s).expect("Fr decimal"))
}
pub fn g1(v: &Value) -> G1Affine {
    G1Affine::new_unchecked(fq(v[0].as_str().unwrap()), fq(v[1].as_str().unwrap()))
}
pub fn g2(v: &Value, swap: bool) -> G2Affine {
    let (xa, xb) = (v[0][0].as_str().unwrap(), v[0][1].as_str().unwrap());
    let (ya, yb) = (v[1][0].as_str().unwrap(), v[1][1].as_str().unwrap());
    let (x, y) = if swap {
        (Fq2::new(fq(xb), fq(xa)), Fq2::new(fq(yb), fq(ya)))
    } else {
        (Fq2::new(fq(xa), fq(xb)), Fq2::new(fq(ya), fq(yb)))
    };
    G2Affine::new_unchecked(x, y)
}

pub fn build_vk(vkj: &Value, swap: bool) -> VerifyingKey<Bn254> {
    VerifyingKey::<Bn254> {
        alpha_g1: g1(&vkj["vk_alpha_1"]),
        beta_g2: g2(&vkj["vk_beta_2"], swap),
        gamma_g2: g2(&vkj["vk_gamma_2"], swap),
        delta_g2: g2(&vkj["vk_delta_2"], swap),
        gamma_abc_g1: vkj["IC"].as_array().unwrap().iter().map(g1).collect(),
    }
}
pub fn build_proof(prj: &Value, swap: bool) -> Proof<Bn254> {
    Proof::<Bn254> {
        a: g1(&prj["pi_a"]),
        b: g2(&prj["pi_b"], swap),
        c: g1(&prj["pi_c"]),
    }
}
pub fn build_inputs(pbj: &Value) -> Vec<Fr> {
    pbj.as_array()
        .unwrap()
        .iter()
        .map(|s| fr(s.as_str().unwrap()))
        .collect()
}
