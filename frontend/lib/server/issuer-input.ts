/*
  SERVER-ONLY. Per-visitor eligibility witness — the demo KYC issuer (a BabyJubJub
  EdDSA key, env ISSUER_EDDSA_KEY) signs the claims for an identitySecret DERIVED from
  the connected wallet, so every wallet gets a unique nullifier (= Poseidon(secret,
  assetId)) and can onboard exactly once. Mirrors circuits/gen_input.js. The visitor
  then generates the groth16 proof IN-BROWSER from this witness; the server never sees
  their proof inputs beyond what it issued.
*/

import "server-only";
import { blake2b } from "@noble/hashes/blake2b";

const ISSUER_PRV_HEX =
  process.env.ISSUER_EDDSA_KEY ?? "0001020304050607080900010203040506070809000102030405060708090001";
const ASSET = process.env.ASSET_ID ?? "writ-bond-001";
const FIELD = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;

export type CircuitInput = Record<string, string | string[]>;
export type VisitorWitness = {
  input: CircuitInput;
  commitment: string;
  nullifier: string;
};

function deriveField(accountHex: string, tag: string): bigint {
  const h = blake2b(Buffer.from(accountHex + tag, "utf8"), { dkLen: 31 });
  return BigInt("0x" + Buffer.from(h).toString("hex")) % FIELD;
}

/** Build the witness for a wallet. identitySecret/salt are deterministic per account. */
export async function buildVisitorWitness(accountHex: string): Promise<VisitorWitness> {
  const { buildEddsa, buildPoseidon } = await import("circomlibjs");
  const eddsa = await buildEddsa();
  const poseidon = await buildPoseidon();
  const F = poseidon.F;
  const s = (x: unknown) => F.toString(x);
  const P = (arr: unknown[]) => poseidon(arr);

  const issuerPrv = Buffer.from(ISSUER_PRV_HEX, "hex");
  const pub = eddsa.prv2pub(issuerPrv);
  const issuerAx = s(pub[0]), issuerAy = s(pub[1]);

  const assetId = BigInt("0x" + Buffer.from(ASSET).toString("hex")).toString();

  // allowed-jurisdiction Merkle tree (depth 4), US (840) at index 0
  const DEPTH = 4;
  const allowed = [840n, 826n, 276n, 250n, 392n, 36n, 124n, 756n];
  let level: unknown[] = [];
  for (let i = 0; i < 1 << DEPTH; i++) level.push(F.e(i < allowed.length ? allowed[i] : 0n));
  const tree: unknown[][] = [level];
  while (level.length > 1) {
    const next: unknown[] = [];
    for (let i = 0; i < level.length; i += 2) next.push(P([level[i], level[i + 1]]));
    tree.push(next); level = next;
  }
  const allowedRoot = s(level[0]);
  const jurIdx = 0;
  const els: string[] = [], idxs: string[] = [];
  let i = jurIdx;
  for (let d = 0; d < DEPTH; d++) { els.push(s(tree[d][i ^ 1])); idxs.push((i & 1).toString()); i >>= 1; }

  const identitySecret = deriveField(accountHex, "writ::identity");
  const salt = deriveField(accountHex, "writ::salt");
  const accredited = 1n, jur = 840n, sanctioned = 0n;

  const idCommit = P([identitySecret]);
  const claimsHash = P([accredited, jur, sanctioned, idCommit]);
  const sig = eddsa.signPoseidon(issuerPrv, claimsHash);

  const commitment = s(P([accredited, jur, sanctioned, identitySecret, salt]));
  const nullifier = s(P([identitySecret, BigInt(assetId)]));

  return {
    input: {
      issuerAx, issuerAy, assetId, allowedRoot,
      accredited: accredited.toString(), jurisdictionCode: jur.toString(),
      sanctioned: sanctioned.toString(), identitySecret: identitySecret.toString(), salt: salt.toString(),
      sigR8x: s(sig.R8[0]), sigR8y: s(sig.R8[1]), sigS: sig.S.toString(),
      jurPathElements: els, jurPathIndices: idxs,
    },
    commitment,
    nullifier,
  };
}
