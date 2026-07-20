/*
  SERVER-ONLY. The DEMO credential issuer.

  Honest model: Writ has no external KYC provider integrated. This module plays the
  issuer role for the testnet demo — it signs an eligibility claim set
  (accredited=1, jurisdiction=840/US, sanctioned=0) for a holder identity commitment.
  In production this signing key would belong to a real KYC/accreditation provider;
  see docs/final-round-hardening.md and README "What is demo-only".

  What the issuer signs: claimsHash = Poseidon(accredited, jurisdiction, sanctioned,
  idCommit) where idCommit = Poseidon(identitySecret). The identitySecret and salt
  are derived and held CLIENT-SIDE from a wallet signature (lib/identity.ts) and are
  never sent to this server. The server cannot rebuild the witness or the proof: it
  only ever sees the hiding commitment Poseidon(identitySecret).

  The signing key comes exclusively from ISSUER_EDDSA_KEY. There is no default and
  no fallback: absence fails closed (no claims are issued).
*/

import "server-only";

export const FIELD =
  21888242871839275222246405745257275088548364400416034343698204186575808495617n;

const ASSET = process.env.ASSET_ID ?? "writ-bond-001";

export class IssuerKeyMissingError extends Error {
  constructor() {
    super("ISSUER_EDDSA_KEY is not configured — refusing to issue claims (fail closed)");
    this.name = "IssuerKeyMissingError";
  }
}

/** The issuer signing key. Throws (fails closed) when unset or malformed. */
export function requireIssuerKey(): Buffer {
  const hex = process.env.ISSUER_EDDSA_KEY;
  if (!hex || !/^[0-9a-fA-F]{64}$/.test(hex)) throw new IssuerKeyMissingError();
  return Buffer.from(hex, "hex");
}

export type IssuedClaims = {
  /** Circuit input fields, WITHOUT identitySecret/salt (those stay client-side). */
  input: {
    issuerAx: string;
    issuerAy: string;
    assetId: string;
    allowedRoot: string;
    accredited: string;
    jurisdictionCode: string;
    sanctioned: string;
    sigR8x: string;
    sigR8y: string;
    sigS: string;
    jurPathElements: string[];
    jurPathIndices: string[];
  };
  /** Explicit provenance label — this is a self-run demo issuer, not external KYC. */
  issuer: { kind: "demo-issuer"; ax: string; ay: string };
};

type Circomlib = {
  eddsa: Awaited<ReturnType<typeof import("circomlibjs").buildEddsa>>;
  poseidon: Awaited<ReturnType<typeof import("circomlibjs").buildPoseidon>>;
};
let circomlib: Promise<Circomlib> | null = null;
function loadCircomlib(): Promise<Circomlib> {
  circomlib ??= (async () => {
    const { buildEddsa, buildPoseidon } = await import("circomlibjs");
    return { eddsa: await buildEddsa(), poseidon: await buildPoseidon() };
  })();
  return circomlib;
}

/** assetId as the circuit encodes it: the asset string's bytes as a big-endian integer. */
export function assetIdDecimal(asset: string = ASSET): string {
  return BigInt("0x" + Buffer.from(asset).toString("hex")).toString();
}

/** Allowed-jurisdiction Merkle tree (depth 4), US (840) at index 0 — mirrors
    circuits/gen_input.js. Returns the root and the inclusion path for US. */
async function jurisdictionTree(): Promise<{ allowedRoot: string; els: string[]; idxs: string[] }> {
  const { poseidon } = await loadCircomlib();
  const F = poseidon.F;
  const s = (x: unknown) => F.toString(x);
  const DEPTH = 4;
  const allowed = [840n, 826n, 276n, 250n, 392n, 36n, 124n, 756n];
  let level: unknown[] = [];
  for (let i = 0; i < 1 << DEPTH; i++) level.push(F.e(i < allowed.length ? allowed[i] : 0n));
  const tree: unknown[][] = [level];
  while (level.length > 1) {
    const next: unknown[] = [];
    for (let i = 0; i < level.length; i += 2) next.push(poseidon([level[i], level[i + 1]]));
    tree.push(next);
    level = next;
  }
  const els: string[] = [], idxs: string[] = [];
  let i = 0; // US at index 0
  for (let d = 0; d < DEPTH; d++) { els.push(s(tree[d][i ^ 1])); idxs.push((i & 1).toString()); i >>= 1; }
  return { allowedRoot: s(level[0]), els, idxs };
}

/** The canonical public values every accepted proof must carry (public-input binding
    at attestation: issuer key, asset, jurisdiction root). */
export async function canonicalPublicValues(): Promise<{
  issuerAx: string; issuerAy: string; assetId: string; allowedRoot: string;
}> {
  const { eddsa, poseidon } = await loadCircomlib();
  const F = poseidon.F;
  const pub = eddsa.prv2pub(requireIssuerKey());
  const { allowedRoot } = await jurisdictionTree();
  return { issuerAx: F.toString(pub[0]), issuerAy: F.toString(pub[1]), assetId: assetIdDecimal(), allowedRoot };
}

/**
 * Sign the demo claim set for a client-supplied identity commitment.
 * `idCommitDecimal` = Poseidon(identitySecret), computed in the holder's browser.
 * The raw identitySecret never reaches this function.
 */
export async function issueClaims(idCommitDecimal: string): Promise<IssuedClaims> {
  const idCommit = BigInt(idCommitDecimal); // throws on non-numeric
  if (idCommit <= 0n || idCommit >= FIELD) throw new Error("idCommit out of field range");

  const { eddsa, poseidon } = await loadCircomlib();
  const F = poseidon.F;
  const s = (x: unknown) => F.toString(x);

  const issuerPrv = requireIssuerKey();
  const pub = eddsa.prv2pub(issuerPrv);
  const { allowedRoot, els, idxs } = await jurisdictionTree();

  const accredited = 1n, jur = 840n, sanctioned = 0n;
  const claimsHash = poseidon([accredited, jur, sanctioned, F.e(idCommit)]);
  const sig = eddsa.signPoseidon(issuerPrv, claimsHash);

  return {
    input: {
      issuerAx: s(pub[0]),
      issuerAy: s(pub[1]),
      assetId: assetIdDecimal(),
      allowedRoot,
      accredited: accredited.toString(),
      jurisdictionCode: jur.toString(),
      sanctioned: sanctioned.toString(),
      sigR8x: s(sig.R8[0]),
      sigR8y: s(sig.R8[1]),
      sigS: sig.S.toString(),
      jurPathElements: els,
      jurPathIndices: idxs,
    },
    issuer: { kind: "demo-issuer", ax: s(pub[0]), ay: s(pub[1]) },
  };
}
