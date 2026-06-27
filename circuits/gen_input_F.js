// Second REAL eligible witness for holder F (the NFT sender in the gated matrix):
// a distinct identitySecret/salt → distinct nullifier/commitment, same allowed
// jurisdiction + issuer. Writes build/input_F.json for snarkjs and prints publics.
const { buildEddsa, buildPoseidon } = require("circomlibjs");
const { commitment, nullifier } = require("./commitment");
const fs = require("fs");

async function main() {
  const eddsa = await buildEddsa();
  const poseidon = await buildPoseidon();
  const F = poseidon.F;
  const s = (x) => F.toString(x);
  const P = (arr) => poseidon(arr);

  const issuerPrv = Buffer.from(
    "0001020304050607080900010203040506070809000102030405060708090001", "hex");
  const pub = eddsa.prv2pub(issuerPrv);
  const issuerAx = s(pub[0]), issuerAy = s(pub[1]);

  const assetStr = "writ-bond-001";
  const assetId = BigInt("0x" + Buffer.from(assetStr).toString("hex")).toString();

  const DEPTH = 4;
  const allowed = [840n, 826n, 276n, 250n, 392n, 36n, 124n, 756n];
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

  // DISTINCT identity for F (must differ from R's so the nullifier is unique).
  const identitySecret = 24681357902468135790n;
  const salt = 13579024681357902468n;
  const accredited = 1n, jur = 840n, sanctioned = 0n, jurIdx = 0;

  const idCommit = P([identitySecret]);
  const claimsHash = P([accredited, jur, sanctioned, idCommit]);
  const sig = eddsa.signPoseidon(issuerPrv, claimsHash);
  const p = path(jurIdx);

  const input = {
    issuerAx, issuerAy, assetId, allowedRoot,
    accredited: accredited.toString(), jurisdictionCode: jur.toString(),
    sanctioned: sanctioned.toString(), identitySecret: identitySecret.toString(),
    salt: salt.toString(),
    sigR8x: s(sig.R8[0]), sigR8y: s(sig.R8[1]), sigS: sig.S.toString(),
    jurPathElements: p.els, jurPathIndices: p.idxs,
  };
  fs.writeFileSync("build/input_F.json", JSON.stringify(input, null, 1));

  const nul = await nullifier(identitySecret, assetId);
  const com = await commitment({ accredited, jurisdictionCode: jur, sanctioned, identitySecret, salt });
  console.log("F nullifier  =", nul);
  console.log("F commitment =", com);
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
