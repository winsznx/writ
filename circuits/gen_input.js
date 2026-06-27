// Generates eligibility-circuit witnesses with a REAL external KYC issuer:
// a BabyJubJub EdDSA keypair signs the claims (Poseidon message). Builds the
// allowed-jurisdiction Merkle tree and the inclusion path. Writes an eligible
// witness and an ineligible (sanctioned=1) witness, and prints the derived
// nullifier/commitment + public values.
const { buildEddsa, buildPoseidon } = require("circomlibjs");
const { commitment, nullifier } = require("./commitment");
const fs = require("fs");

async function main() {
  const eddsa = await buildEddsa();
  const poseidon = await buildPoseidon();
  const F = poseidon.F;
  const s = (x) => F.toString(x);
  const P = (arr) => poseidon(arr);

  // --- real issuer EdDSA keypair (BabyJubJub) ---
  const issuerPrv = Buffer.from(
    "0001020304050607080900010203040506070809000102030405060708090001", "hex");
  const pub = eddsa.prv2pub(issuerPrv);
  const issuerAx = s(pub[0]), issuerAy = s(pub[1]);

  // --- asset id: string -> field (the agent uses the same mapping) ---
  const assetStr = "writ-bond-001";
  const assetId = BigInt("0x" + Buffer.from(assetStr).toString("hex")).toString();

  // --- allowed-jurisdiction Merkle tree (depth 4 => 16 leaves) ---
  const DEPTH = 4;
  const allowed = [840n, 826n, 276n, 250n, 392n, 36n, 124n, 756n]; // US UK DE FR JP AU CA CH
  let level = [];
  for (let i = 0; i < (1 << DEPTH); i++) level.push(F.e(i < allowed.length ? allowed[i] : 0n));
  const tree = [level];
  while (level.length > 1) {
    const next = [];
    for (let i = 0; i < level.length; i += 2) next.push(P([level[i], level[i + 1]]));
    tree.push(next); level = next;
  }
  const allowedRoot = s(level[0]);
  const path = (idx) => {
    const els = [], idxs = []; let i = idx;
    for (let d = 0; d < DEPTH; d++) { els.push(s(tree[d][i ^ 1])); idxs.push((i & 1).toString()); i >>= 1; }
    return { els, idxs };
  };

  const identitySecret = 12345678901234567890n;
  const salt = 98765432109876543210n;

  async function build(accredited, jur, sanctioned, jurIdx) {
    // issuer signs over identityCommitment = Poseidon(identitySecret), never the raw secret
    const idCommit = P([identitySecret]);
    const claimsHash = P([accredited, jur, sanctioned, idCommit]);
    const sig = eddsa.signPoseidon(issuerPrv, claimsHash);
    const p = path(jurIdx);
    return {
      input: {
        issuerAx, issuerAy, assetId, allowedRoot,
        accredited: accredited.toString(), jurisdictionCode: jur.toString(),
        sanctioned: sanctioned.toString(), identitySecret: identitySecret.toString(),
        salt: salt.toString(),
        sigR8x: s(sig.R8[0]), sigR8y: s(sig.R8[1]), sigS: sig.S.toString(),
        jurPathElements: p.els, jurPathIndices: p.idxs,
      },
      // commitment/nullifier come from the SHARED lib (circuits/commitment.js),
      // the single source the disclosure verifier also uses.
      nullifier: await nullifier(identitySecret, assetId),
      commitment: await commitment({
        accredited,
        jurisdictionCode: jur,
        sanctioned,
        identitySecret,
        salt,
      }),
    };
  }

  const elig = await build(1n, 840n, 0n, 0);
  fs.writeFileSync("build/input_eligible.json", JSON.stringify(elig.input, null, 1));
  const inelig = await build(1n, 840n, 1n, 0); // sanctioned=1, issuer signs it truthfully
  fs.writeFileSync("build/input_ineligible.json", JSON.stringify(inelig.input, null, 1));

  console.log("issuerAx    =", issuerAx);
  console.log("issuerAy    =", issuerAy);
  console.log("assetId     =", assetId);
  console.log("allowedRoot =", allowedRoot);
  console.log("ELIGIBLE   nullifier  =", elig.nullifier);
  console.log("ELIGIBLE   commitment =", elig.commitment);
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
