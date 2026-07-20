/*
  F-2 acceptance: no committed/default issuer key; signing fails closed.
  - issueClaims refuses to run without ISSUER_EDDSA_KEY
  - the issued signature verifies against the configured issuer's public key
  - verification against a DIFFERENT issuer key fails
  - the issued claims package contains no identity secret material
  - source regression: no hardcoded issuer key fallback exists
*/

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildEddsa, buildPoseidon } from "circomlibjs";
import {
  issueClaims,
  canonicalPublicValues,
  IssuerKeyMissingError,
} from "@/lib/server/issuer-input";

const TEST_ISSUER_KEY = "e2".repeat(32); // test-only fixture key, set via env below
const OTHER_ISSUER_KEY = "d4".repeat(32);
const ID_COMMIT = "12345678901234567890123456789012345678";

describe("demo issuer (fail closed)", () => {
  const saved = process.env.ISSUER_EDDSA_KEY;
  beforeEach(() => { process.env.ISSUER_EDDSA_KEY = TEST_ISSUER_KEY; });
  afterEach(() => {
    if (saved === undefined) delete process.env.ISSUER_EDDSA_KEY;
    else process.env.ISSUER_EDDSA_KEY = saved;
  });

  it("refuses to issue claims without a configured issuer key", async () => {
    delete process.env.ISSUER_EDDSA_KEY;
    await expect(issueClaims(ID_COMMIT)).rejects.toThrow(IssuerKeyMissingError);
    await expect(canonicalPublicValues()).rejects.toThrow(IssuerKeyMissingError);
  });

  it("refuses a malformed issuer key", async () => {
    process.env.ISSUER_EDDSA_KEY = "not-hex";
    await expect(issueClaims(ID_COMMIT)).rejects.toThrow(IssuerKeyMissingError);
  });

  it("issues a signature that verifies against the configured issuer key only", async () => {
    const issued = await issueClaims(ID_COMMIT);
    const eddsa = await buildEddsa();
    const poseidon = await buildPoseidon();
    const F = poseidon.F;

    const claimsHash = poseidon([1n, 840n, 0n, F.e(BigInt(ID_COMMIT))]);
    const sig = {
      R8: [F.e(BigInt(issued.input.sigR8x)), F.e(BigInt(issued.input.sigR8y))],
      S: BigInt(issued.input.sigS),
    };
    const rightPub = eddsa.prv2pub(Buffer.from(TEST_ISSUER_KEY, "hex"));
    const wrongPub = eddsa.prv2pub(Buffer.from(OTHER_ISSUER_KEY, "hex"));

    expect(eddsa.verifyPoseidon(claimsHash, sig, rightPub)).toBe(true);
    expect(eddsa.verifyPoseidon(claimsHash, sig, wrongPub)).toBe(false);
    expect(issued.issuer.kind).toBe("demo-issuer");
  });

  it("never includes identity secret material in the issued package", async () => {
    const issued = await issueClaims(ID_COMMIT);
    const keys = Object.keys(issued.input);
    expect(keys).not.toContain("identitySecret");
    expect(keys).not.toContain("salt");
    expect(JSON.stringify(issued)).not.toMatch(/identitySecret|"salt"/);
  });

  it("rejects an out-of-field idCommit", async () => {
    await expect(
      issueClaims("21888242871839275222246405745257275088548364400416034343698204186575808495617"),
    ).rejects.toThrow(/field/);
  });

  it("source regression: no hardcoded issuer key fallback exists", () => {
    const src = readFileSync(join(__dirname, "..", "lib", "server", "issuer-input.ts"), "utf8");
    expect(src).not.toMatch(/ISSUER_EDDSA_KEY\s*\?\?/);
    expect(src).not.toMatch(/0001020304050607/);
  });
});
