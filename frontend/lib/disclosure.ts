/*
  Selective disclosure verify — client-side. The regulator recomputes the Poseidon
  commitment from a disclosed preimage and checks it against the credential's REAL
  on-chain commitment. Same Poseidon params as the eligibility circuit and the v3
  on-chain value (lib/chain.ts REGULATED_HOLDER), so a match is byte-for-byte.

  Mirrors the proven Node lib (disclosure/ — 14/14): commitment =
  Poseidon([accredited, jurisdictionCode, sanctioned, identitySecret, salt]).
*/

export type DisclosedClaims = {
  readonly accredited: string;
  readonly jurisdictionCode: string;
  readonly sanctioned: string;
  readonly identitySecret: string;
  readonly salt: string;
};

let poseidonPromise: Promise<{
  (inputs: bigint[]): unknown;
  F: { toString(x: unknown): string };
}> | null = null;

async function poseidon() {
  if (!poseidonPromise) {
    const circomlibjs = await import("circomlibjs");
    poseidonPromise = circomlibjs.buildPoseidon();
  }
  return poseidonPromise;
}

/** Recompute the field-decimal commitment from disclosed claims. */
export async function recomputeCommitment(claims: DisclosedClaims): Promise<string> {
  const p = await poseidon();
  const out = p([
    BigInt(claims.accredited),
    BigInt(claims.jurisdictionCode),
    BigInt(claims.sanctioned),
    BigInt(claims.identitySecret),
    BigInt(claims.salt),
  ]);
  return p.F.toString(out);
}

/** True iff the disclosed claims hash to the on-chain commitment. `onchain` may be a
    field decimal or a 0x… 32-byte hex (both are normalised). */
export async function verifyDisclosure(
  claims: DisclosedClaims,
  onchain: string,
): Promise<boolean> {
  const recomputed = await recomputeCommitment(claims);
  const onchainDecimal = onchain.startsWith("0x") ? BigInt(onchain).toString() : onchain;
  return recomputed === onchainDecimal;
}
