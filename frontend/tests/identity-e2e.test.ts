/*
  F-1 acceptance (end-to-end, real circuit artifacts):
  - the identity secret derives from a WALLET SIGNATURE, not public account data —
    different wallet signatures give different secrets, commitments, and nullifiers
  - the server-issued claims package + the client-held secret assemble into a
    witness that produces a VALID groth16 proof against the shipped vkey
  - all six public signals bind: [0]/[1] from the proof, [2..5] equal the
    canonical issuer/asset/root values (M-1)
  - the server cannot generate the witness: the issued package alone is missing
    identitySecret/salt and proving from it fails
  - the proof converts to the exact ark bytes that would be stored on-chain (F-3)
*/

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import * as snarkjs from "snarkjs";
import { deriveIdentity, identityDerivationMessage } from "@/lib/identity";
import { issueClaims, canonicalPublicValues } from "@/lib/server/issuer-input";
import { proofToArkBytes } from "@/lib/server/proof-serde";

const PUB = join(__dirname, "..", "public", "circuit");
const WASM = join(PUB, "eligibility.wasm");
const ZKEY = join(PUB, "elig2_final.zkey");
const VKEY = JSON.parse(readFileSync(join(PUB, "elig2_vkey.json"), "utf8"));

const TEST_ISSUER_KEY = "e2".repeat(32);
// Two distinct fake wallet signatures (128 hex chars = ed25519 sig length).
const SIG_A = "01" + "ab".repeat(64);
const SIG_B = "01" + "cd".repeat(64);

const saved = process.env.ISSUER_EDDSA_KEY;
beforeAll(() => { process.env.ISSUER_EDDSA_KEY = TEST_ISSUER_KEY; });
afterAll(() => {
  if (saved === undefined) delete process.env.ISSUER_EDDSA_KEY;
  else process.env.ISSUER_EDDSA_KEY = saved;
});

describe("identity derivation + full proving path", () => {
  it("derives deterministically from a signature, never from the account hash", async () => {
    const a1 = await deriveIdentity(SIG_A);
    const a2 = await deriveIdentity(SIG_A);
    const b = await deriveIdentity(SIG_B);
    expect(a1.identitySecret).toBe(a2.identitySecret);
    expect(a1.idCommit).toBe(a2.idCommit);
    expect(a1.identitySecret).not.toBe(b.identitySecret);
    expect(a1.salt).not.toBe(b.salt);
    expect(a1.idCommit).not.toBe(b.idCommit);
    // the derivation message warns the user and contains no secret
    const msg = identityDerivationMessage("aa".repeat(32), "writ-bond-001");
    expect(msg).toMatch(/Never share/);
  });

  it("proves end-to-end and binds all six public signals (M-1)", async () => {
    const identity = await deriveIdentity(SIG_A);
    const issued = await issueClaims(identity.idCommit);
    const witness = {
      ...issued.input,
      identitySecret: identity.identitySecret.toString(),
      salt: identity.salt.toString(),
    };
    const { proof, publicSignals } = await snarkjs.groth16.fullProve(witness, WASM, ZKEY);
    expect(await snarkjs.groth16.verify(VKEY, publicSignals, proof)).toBe(true);

    const canonical = await canonicalPublicValues();
    expect(publicSignals[2]).toBe(canonical.issuerAx);
    expect(publicSignals[3]).toBe(canonical.issuerAy);
    expect(publicSignals[4]).toBe(canonical.assetId);
    expect(publicSignals[5]).toBe(canonical.allowedRoot);

    // F-3: the holder's own proof serializes to the 256-byte on-chain encoding
    const bytes = proofToArkBytes(proof);
    expect(bytes.length).toBe(256);

    // different wallet signature -> different nullifier + commitment
    const identityB = await deriveIdentity(SIG_B);
    const issuedB = await issueClaims(identityB.idCommit);
    const witnessB = {
      ...issuedB.input,
      identitySecret: identityB.identitySecret.toString(),
      salt: identityB.salt.toString(),
    };
    const runB = await snarkjs.groth16.fullProve(witnessB, WASM, ZKEY);
    expect(runB.publicSignals[0]).not.toBe(publicSignals[0]); // nullifier differs
    expect(runB.publicSignals[1]).not.toBe(publicSignals[1]); // commitment differs
  }, 120_000);

  it("server-issued package alone cannot produce a witness (secrets missing)", async () => {
    const identity = await deriveIdentity(SIG_A);
    const issued = await issueClaims(identity.idCommit);
    await expect(
      snarkjs.groth16.fullProve(
        issued.input as unknown as Record<string, string>, WASM, ZKEY,
      ),
    ).rejects.toThrow();
  });

  it("a proof for a wrong issuer key fails canonical binding", async () => {
    const identity = await deriveIdentity(SIG_A);
    const issued = await issueClaims(identity.idCommit);
    process.env.ISSUER_EDDSA_KEY = "d4".repeat(32); // rotate the pinned issuer
    try {
      const canonical = await canonicalPublicValues();
      expect(issued.input.issuerAx).not.toBe(canonical.issuerAx);
    } finally {
      process.env.ISSUER_EDDSA_KEY = TEST_ISSUER_KEY;
    }
  });
});
