pragma circom 2.1.0;

include "circomlib/circuits/poseidon.circom";
include "circomlib/circuits/eddsaposeidon.circom";
include "circomlib/circuits/mux1.circom";

// Binary Poseidon Merkle inclusion proof.
template MerkleProof(DEPTH) {
    signal input leaf;
    signal input pathElements[DEPTH];
    signal input pathIndices[DEPTH];   // 0 = current node is left, 1 = right
    signal output root;

    component hashers[DEPTH];
    component mux[DEPTH];
    signal levelHash[DEPTH + 1];
    levelHash[0] <== leaf;
    for (var i = 0; i < DEPTH; i++) {
        pathIndices[i] * (pathIndices[i] - 1) === 0;  // boolean
        mux[i] = MultiMux1(2);
        mux[i].c[0][0] <== levelHash[i];
        mux[i].c[0][1] <== pathElements[i];
        mux[i].c[1][0] <== pathElements[i];
        mux[i].c[1][1] <== levelHash[i];
        mux[i].s <== pathIndices[i];
        hashers[i] = Poseidon(2);
        hashers[i].inputs[0] <== mux[i].out[0];
        hashers[i].inputs[1] <== mux[i].out[1];
        levelHash[i + 1] <== hashers[i].out;
    }
    root <== levelHash[DEPTH];
}

// Writ eligibility proof.
//   claims signed by a real external KYC issuer (EdDSA-BabyJubJub-Poseidon).
//   Proves: issuer-signed ∧ accredited ∧ jurisdiction∈allowed ∧ ¬sanctioned,
//   and derives the per-person-per-asset nullifier + a hiding commitment.
// Account binding is done at submission (out of circuit), per the design.
template Eligibility(DEPTH) {
    // ---- public inputs ----
    signal input issuerAx;       // issuer EdDSA public key (BabyJubJub)
    signal input issuerAy;
    signal input assetId;        // field-hash of the asset id
    signal input allowedRoot;    // Merkle root of the allowed-jurisdiction set

    // ---- private witness ----
    signal input accredited;           // 0/1
    signal input jurisdictionCode;     // field
    signal input sanctioned;           // 0/1
    signal input identitySecret;       // person's secret (binds the nullifier)
    signal input salt;                 // commitment blinding
    signal input sigR8x;               // issuer signature over claimsHash
    signal input sigR8y;
    signal input sigS;
    signal input jurPathElements[DEPTH];
    signal input jurPathIndices[DEPTH];

    // ---- public outputs ----
    signal output nullifier;
    signal output commitment;

    // booleanity of the boolean claims
    accredited * (accredited - 1) === 0;
    sanctioned * (sanctioned - 1) === 0;

    // (1) verify the issuer signed exactly these claims.
    // The issuer signs over identityCommitment = Poseidon(identitySecret), NOT the
    // raw secret. Poseidon is preimage-resistant, so the issuer never learns
    // identitySecret and cannot compute nullifier = Poseidon(identitySecret, assetId)
    // — it cannot de-anonymize holders on-chain.
    component idCommit = Poseidon(1);
    idCommit.inputs[0] <== identitySecret;   // identityCommitment (private intermediate)

    component claimsHash = Poseidon(4);
    claimsHash.inputs[0] <== accredited;
    claimsHash.inputs[1] <== jurisdictionCode;
    claimsHash.inputs[2] <== sanctioned;
    claimsHash.inputs[3] <== idCommit.out;

    component eddsa = EdDSAPoseidonVerifier();
    eddsa.enabled <== 1;
    eddsa.Ax <== issuerAx;
    eddsa.Ay <== issuerAy;
    eddsa.R8x <== sigR8x;
    eddsa.R8y <== sigR8y;
    eddsa.S <== sigS;
    eddsa.M <== claimsHash.out;

    // (2) eligibility predicate: accredited ∧ ¬sanctioned ∧ jurisdiction∈allowed
    accredited === 1;
    sanctioned === 0;
    component merkle = MerkleProof(DEPTH);
    merkle.leaf <== jurisdictionCode;
    for (var i = 0; i < DEPTH; i++) {
        merkle.pathElements[i] <== jurPathElements[i];
        merkle.pathIndices[i] <== jurPathIndices[i];
    }
    merkle.root === allowedRoot;

    // (3) nullifier = Poseidon(identitySecret, assetId) — per-person-per-asset
    component nullHash = Poseidon(2);
    nullHash.inputs[0] <== identitySecret;
    nullHash.inputs[1] <== assetId;
    nullifier <== nullHash.out;

    // (4) commitment = Poseidon(accredited, jurisdictionCode, sanctioned, identitySecret, salt)
    component commHash = Poseidon(5);
    commHash.inputs[0] <== accredited;
    commHash.inputs[1] <== jurisdictionCode;
    commHash.inputs[2] <== sanctioned;
    commHash.inputs[3] <== identitySecret;
    commHash.inputs[4] <== salt;
    commitment <== commHash.out;
}

component main {public [issuerAx, issuerAy, assetId, allowedRoot]} = Eligibility(4);
