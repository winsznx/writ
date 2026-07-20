/*
  F-3 acceptance: the stored on-chain proof is the holder's own proof.
  The snarkjs->ark conversion is proven byte-for-byte against the output of the
  Rust `gen_fixtures` tool (circuits/ark-verifier) for the same proof JSON, and
  malformed proofs are rejected. A regression tripwire asserts no placeholder
  proof path remains in the onboarding route.
*/

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  proofToArkBytes,
  arkBytesToProofCoords,
  MalformedProofError,
  type SnarkjsProof,
} from "@/lib/server/proof-serde";

const FIX = join(__dirname, "fixtures");
const proofJson = JSON.parse(readFileSync(join(FIX, "elig2_proof.json"), "utf8")) as SnarkjsProof;
const arkBytes = readFileSync(join(FIX, "elig2_proof.ark.bin"));

describe("proof serialization (snarkjs -> ark uncompressed)", () => {
  it("matches the Rust gen_fixtures output byte-for-byte", () => {
    expect(proofToArkBytes(proofJson).equals(arkBytes)).toBe(true);
  });

  it("round-trips coordinates through the ark byte layout", () => {
    const bytes = proofToArkBytes(proofJson);
    const coords = arkBytesToProofCoords(bytes);
    expect(coords.a[0]).toBe(BigInt(proofJson.pi_a[0]));
    expect(coords.a[1]).toBe(BigInt(proofJson.pi_a[1]));
    expect(coords.b[0][0]).toBe(BigInt(proofJson.pi_b[0][0]));
    expect(coords.b[1][1]).toBe(BigInt(proofJson.pi_b[1][1]));
    expect(coords.c[1]).toBe(BigInt(proofJson.pi_c[1]));
  });

  it("rejects malformed proofs", () => {
    expect(() => proofToArkBytes(null)).toThrow(MalformedProofError);
    expect(() => proofToArkBytes({})).toThrow(MalformedProofError);
    expect(() => proofToArkBytes({ ...proofJson, protocol: "plonk" })).toThrow(MalformedProofError);
    expect(() =>
      proofToArkBytes({ ...proofJson, pi_a: [proofJson.pi_a[0], proofJson.pi_a[1], "2"] }),
    ).toThrow(/affine/);
    const overQ =
      "21888242871839275222246405745257275088696311157297823662689037894645226208584";
    expect(() =>
      proofToArkBytes({ ...proofJson, pi_a: [overQ, proofJson.pi_a[1], "1"] }),
    ).toThrow(/range/);
    expect(() => arkBytesToProofCoords(Buffer.alloc(255))).toThrow(/256/);
  });

  it("regression: no placeholder proof remains on the onboarding path", () => {
    const route = readFileSync(
      join(__dirname, "..", "app", "api", "onboard", "route.ts"),
      "utf8",
    );
    expect(route).not.toContain("placeholderProofBytes");
    expect(route).not.toContain("proof.bin");
    expect(route).toContain("proofToArkBytes(proof)");
  });
});
