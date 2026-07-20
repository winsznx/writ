/*
  SERVER-ONLY. snarkjs Groth16 proof JSON -> arkworks uncompressed bytes.

  The on-chain groth16-verifier deserializes `Proof::<Bn254>` in the arkworks
  uncompressed layout: A (G1: x||y, 32 LE bytes each), B (G2: x.c0||x.c1||y.c0||y.c1),
  C (G1) = 256 bytes total, natural Fq2 ordering, with ark SWFlags on the last byte
  of each point's y encoding (bit 7 set when y is lexicographically "negative", i.e.
  y > -y; for Fq2 the comparison is (c1, then c0)). Proven byte-for-byte against the
  output of circuits/ark-verifier `gen_fixtures` for the same proof JSON — see the
  proof-serde test suite.

  This is what makes the stored on-chain proof the HOLDER'S OWN proof: the exact
  bytes any future challenge re-verifies. No placeholder is ever stored.
*/

import "server-only";

/** BN254 base-field modulus (Fq). */
const Q =
  21888242871839275222246405745257275088696311157297823662689037894645226208583n;

export type SnarkjsProof = {
  pi_a: [string, string, string];
  pi_b: [[string, string], [string, string], [string, string]];
  pi_c: [string, string, string];
  protocol: string;
  curve?: string;
};

export class MalformedProofError extends Error {
  constructor(msg: string) {
    super(`malformed proof: ${msg}`);
    this.name = "MalformedProofError";
  }
}

function fqToLe32(dec: string, label: string): Buffer {
  let v: bigint;
  try {
    v = BigInt(dec);
  } catch {
    throw new MalformedProofError(`${label} is not an integer`);
  }
  if (v < 0n || v >= Q) throw new MalformedProofError(`${label} out of base-field range`);
  const b = Buffer.alloc(32);
  for (let i = 0; i < 32; i++) { b[i] = Number(v & 0xffn); v >>= 8n; }
  return b;
}

function le32ToFq(buf: Buffer): bigint {
  let v = 0n;
  for (let i = 31; i >= 0; i--) v = (v << 8n) | BigInt(buf[i]);
  return v;
}

function negFq(y: bigint): boolean {
  return y > Q - y;
}

function negFq2(c0: bigint, c1: bigint): boolean {
  const n0 = (Q - c0) % Q, n1 = (Q - c1) % Q;
  if (c1 !== n1) return c1 > n1;
  return c0 > n0;
}

function g1Bytes(x: string, y: string, label: string): Buffer {
  const b = Buffer.concat([fqToLe32(x, `${label}.x`), fqToLe32(y, `${label}.y`)]);
  if (negFq(BigInt(y))) b[63] |= 0x80;
  return b;
}

function g2Bytes(x: [string, string], y: [string, string], label: string): Buffer {
  const b = Buffer.concat([
    fqToLe32(x[0], `${label}.x.c0`), fqToLe32(x[1], `${label}.x.c1`),
    fqToLe32(y[0], `${label}.y.c0`), fqToLe32(y[1], `${label}.y.c1`),
  ]);
  if (negFq2(BigInt(y[0]), BigInt(y[1]))) b[127] |= 0x80;
  return b;
}

/** snarkjs proof JSON -> 256-byte arkworks-uncompressed encoding. Throws
    MalformedProofError on any shape/range violation (including projective
    coordinates != 1, i.e. non-affine input). */
export function proofToArkBytes(proof: unknown): Buffer {
  const p = proof as SnarkjsProof;
  if (!p || typeof p !== "object") throw new MalformedProofError("not an object");
  if (p.protocol !== "groth16") throw new MalformedProofError("protocol != groth16");
  if (!Array.isArray(p.pi_a) || p.pi_a.length !== 3) throw new MalformedProofError("pi_a shape");
  if (!Array.isArray(p.pi_b) || p.pi_b.length !== 3 || p.pi_b.some((r) => !Array.isArray(r) || r.length !== 2)) {
    throw new MalformedProofError("pi_b shape");
  }
  if (!Array.isArray(p.pi_c) || p.pi_c.length !== 3) throw new MalformedProofError("pi_c shape");
  if (p.pi_a[2] !== "1" || p.pi_c[2] !== "1" || p.pi_b[2][0] !== "1" || p.pi_b[2][1] !== "0") {
    throw new MalformedProofError("points must be affine (z == 1)");
  }
  return Buffer.concat([
    g1Bytes(p.pi_a[0], p.pi_a[1], "A"),
    g2Bytes(p.pi_b[0], p.pi_b[1], "B"),
    g1Bytes(p.pi_c[0], p.pi_c[1], "C"),
  ]);
}

/** Parse 256 ark-uncompressed proof bytes back to coordinates, masking the SWFlags
    bits out of each y encoding (round-trip check). */
export function arkBytesToProofCoords(bytes: Buffer): {
  a: [bigint, bigint];
  b: [[bigint, bigint], [bigint, bigint]];
  c: [bigint, bigint];
} {
  if (bytes.length !== 256) throw new MalformedProofError(`expected 256 bytes, got ${bytes.length}`);
  const copy = Buffer.from(bytes);
  copy[63] &= 0x3f;
  copy[191] &= 0x3f;
  copy[255] &= 0x3f;
  const at = (i: number) => le32ToFq(copy.subarray(i * 32, (i + 1) * 32));
  return {
    a: [at(0), at(1)],
    b: [[at(2), at(3)], [at(4), at(5)]],
    c: [at(6), at(7)],
  };
}
