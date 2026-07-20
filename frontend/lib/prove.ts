/*
  In-browser zero-knowledge proof generation. Runs the REAL eligibility circuit
  (the one the on-chain groth16-verifier checks) client-side via snarkjs. The
  witness — including the wallet-derived identitySecret and salt (lib/identity.ts)
  — is assembled and consumed in the browser; only the proof + public signals are
  submitted.

  Assets in /public/circuit are the proven artifacts:
    eligibility.wasm    — witness calculator
    elig2_final.zkey    — groth16 proving key (matches the on-chain verifying key;
                          NOTE: produced by a single-contribution DEV ceremony —
                          demo-grade, see circuits/README.md)

  Measured locally (Node, Apple Silicon): ~0.9s for witness + proof.
*/

export type ProofResult = {
  readonly proof: unknown;
  readonly publicSignals: readonly string[];
  /** publicSignals[1] — the Poseidon commitment (field decimal), matches on-chain. */
  readonly commitment: string;
  /** publicSignals[0] — the nullifier (field decimal). */
  readonly nullifier: string;
  /** wall-clock milliseconds for fullProve (witness + groth16). */
  readonly ms: number;
};

const WASM_URL = "/circuit/eligibility.wasm";
const ZKEY_URL = "/circuit/elig2_final.zkey";

/** Generate a groth16 eligibility proof from a circuit witness input, entirely in
    the browser. Returns the proof, public signals, and the precise generation time. */
export async function generateEligibilityProof(
  input: Record<string, unknown>,
): Promise<ProofResult> {
  // dynamic import keeps snarkjs out of the server bundle (browser-only).
  const snarkjs = await import("snarkjs");
  const t0 = performance.now();
  const { proof, publicSignals } = await snarkjs.groth16.fullProve(input, WASM_URL, ZKEY_URL);
  const ms = performance.now() - t0;
  return {
    proof,
    publicSignals,
    commitment: publicSignals[1],
    nullifier: publicSignals[0],
    ms,
  };
}

/** DEMO FIXTURE: the demo holder R's witness, whose preimage is intentionally
    public (it powers the regulator disclosure walkthrough — a holder voluntarily
    revealing their own preimage). Not used on the onboarding path. */
export async function loadSampleInput(): Promise<Record<string, unknown>> {
  const res = await fetch("/circuit/sample_input.json");
  if (!res.ok) throw new Error(`failed to load circuit input: ${res.status}`);
  return (await res.json()) as Record<string, unknown>;
}

/** Convert a field-decimal commitment to the 0x… 32-byte form used on-chain / in UI. */
export function commitmentToHex(fieldDecimal: string): string {
  return "0x" + BigInt(fieldDecimal).toString(16).padStart(64, "0");
}
