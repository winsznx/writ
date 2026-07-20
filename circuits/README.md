# Writ Eligibility Circuit (Circom + Groth16-BN254)

The off-chain cryptographic core. An investor proves — in zero-knowledge — that
the configured issuer attested them eligible for an asset, without revealing any
claim. In the shipped demo that issuer is a **demo issuer key** (env
`ISSUER_EDDSA_KEY`); the production model swaps in a real external KYC issuer
holding the same signing role. The proof carries a per-person-per-asset
**nullifier** and a hiding **commitment**. The verification path uses
**arkworks** and attests the nullifier/commitment to the on-chain Credential
Registry.

## Files
- `src/square.circom` — STEP 0 probe (x²==y) for the snarkjs→arkworks seam.
- `src/eligibility.circom` — the eligibility circuit.
- `gen_input.js` — real BabyJubJub EdDSA issuer keypair, signs claims, builds the
  allowed-jurisdiction Merkle tree, emits eligible + ineligible witnesses.
- `ark-verifier/` — Rust crate: verifies a snarkjs-exported vkey+proof+public in
  `ark-groth16` + `ark-bn254`. **This is the agent's verification path.**
- `build/` (gitignored) — r1cs/wasm/ptau/zkey/proof/witness artifacts.

## The snarkjs → arkworks seam (the gate)
`ark-verify` parses snarkjs JSON (decimal field strings → `BigUint` → `Fq`/`Fr`,
G1/G2 as affine points) and verifies with ark-groth16. **Result: PASS with the
natural Fq2 ordering — `Fq2::new(c0, c1)` from snarkjs `[c0, c1]`, no swap.** Both
the probe (1 public) and the real eligibility proof (6 public) verify. This is
what makes off-chain agent verification viable (PRD §8).

## Public / private interface
Public inputs: `issuerAx, issuerAy` (issuer EdDSA pubkey), `assetId` (string→field),
`allowedRoot` (Merkle root of allowed jurisdictions).
Public outputs: `nullifier`, `commitment`.
→ snarkjs `public.json` order: **[nullifier, commitment, issuerAx, issuerAy, assetId, allowedRoot]**.

Private witness: `accredited, jurisdictionCode, sanctioned, identitySecret, salt`,
issuer signature `sigR8x, sigR8y, sigS`, and the jurisdiction Merkle path
`jurPathElements[4], jurPathIndices[4]`.

## Constraints proven
1. **Issuer signature** — `EdDSAPoseidonVerifier` over `claimsHash =
   Poseidon(accredited, jurisdictionCode, sanctioned, Poseidon(identitySecret))`.
   The issuer signs over the **identity commitment** `Poseidon(identitySecret)`,
   never the raw secret — which is what lets the browser keep `identitySecret`
   local and send the issuer only the commitment. The holder cannot alter a claim
   without breaking the signature.
2. **Predicate** — `accredited == 1 ∧ sanctioned == 0 ∧ jurisdictionCode ∈ allowed`
   (Merkle inclusion against `allowedRoot`). An ineligible witness (e.g.
   `sanctioned = 1`) cannot satisfy the circuit, so **no witness and no proof**.
3. **Nullifier** = `Poseidon(identitySecret, assetId)` — per-person-per-asset.
   Refresh re-derives the same value for the same asset; a person can hold many
   assets. Sybil resistance is bounded by the KYC issuer (PRD F3), not the nullifier.
4. **Commitment** = `Poseidon(accredited, jurisdictionCode, sanctioned, identitySecret, salt)`
   — hiding, for later selective disclosure.

Account binding is **not** in-circuit — done at submission: the holder signs a
server-issued, nonce-bound message with their Casper key, and the server verifies
it (blocking) before issuing claims or attesting.

**No in-circuit expiry/freshness** (known limitation, disclosed): the signed
`claimsHash` carries no timestamp, so an issuer-signed claim set does not expire
at the ZK layer. Freshness is enforced on-chain at the credential layer — the
registry rejects an attest with a past expiry and `is_active` flips false when
the credential's expiry elapses. Adding an issuedAt/expiry field to the signed
claims (and binding it as a public input) is the planned circuit v3 change; it
requires a new verifying key and therefore a redeploy of the locked on-chain
verifier.

**Constraint count:** 12,254 total (9,230 non-linear + 3,024 linear), dominated by
the EdDSA verification. 4 public inputs, 2 public outputs, 14 witness inputs.

## Reproduce
```bash
npm install
# STEP 0 probe
circom src/square.circom --r1cs --wasm --sym -l node_modules -o build
# eligibility
circom src/eligibility.circom --r1cs --wasm --sym -l node_modules -o build
node gen_input.js
node build/eligibility_js/generate_witness.js build/eligibility_js/eligibility.wasm build/input_eligible.json build/eligibility.wtns
# trusted setup (DEV ceremony — production needs a real MPC ceremony)
snarkjs powersoftau new bn128 14 build/pot14_0.ptau
snarkjs powersoftau contribute build/pot14_0.ptau build/pot14_1.ptau -e="$(head -c 32 /dev/urandom|xxd -p)"
snarkjs powersoftau prepare phase2 build/pot14_1.ptau build/pot14_final.ptau
snarkjs groth16 setup build/eligibility.r1cs build/pot14_final.ptau build/elig_0.zkey
snarkjs zkey contribute build/elig_0.zkey build/elig_final.zkey -e="$(head -c 32 /dev/urandom|xxd -p)"
snarkjs zkey export verificationkey build/elig_final.zkey build/elig_vkey.json
snarkjs groth16 prove build/elig_final.zkey build/eligibility.wtns build/elig_proof.json build/elig_public.json
snarkjs groth16 verify build/elig_vkey.json build/elig_public.json build/elig_proof.json   # snarkjs path
cargo run --release --manifest-path ark-verifier/Cargo.toml -- \
  build/elig_vkey.json build/elig_proof.json build/elig_public.json                        # agent (arkworks) path
```

> **Trusted setup: single-contribution DEV ceremony — demo-grade only.** One
> Powers-of-Tau contribution and one phase-2 contribution, both run by this
> project. Whoever ran it held the toxic waste and could in principle forge
> proofs; there is no ceremony transcript beyond the commands above. The shipped
> artifacts in `frontend/public/circuit/` (`elig2_final.zkey`, `elig2_vkey.json`,
> `eligibility.wasm`) and the verifying key embedded in the on-chain verifier all
> derive from this ceremony. Production requires a real multi-party
> Powers-of-Tau + phase-2 ceremony with published transcripts.
