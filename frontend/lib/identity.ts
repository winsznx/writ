/*
  CLIENT-SIDE identity secret derivation.

  The identitySecret and salt are derived from a WALLET SIGNATURE over a fixed
  derivation message — a value only the wallet holder can produce. They are NOT
  derivable from the public account hash, and they NEVER leave the browser:
  the server only ever receives idCommit = Poseidon(identitySecret), a hiding
  commitment. The derivation signature itself must never be sent anywhere —
  anyone holding it could recompute the secret.

  ed25519 wallet signatures are deterministic (RFC 8032), so the same wallet
  re-derives the same secret across sessions and can refresh its credential.
  Known limitation (documented in README "Known limitations"): any dapp that
  convinces the wallet to sign this exact message could recompute the secret —
  the standard signature-derived-key caveat (same model as other sig-derived
  secrets in production ZK systems). Production replaces this with an external
  KYC issuer holding the credential.
*/

import { blake2b } from "@noble/hashes/blake2b";

export const FIELD =
  21888242871839275222246405745257275088548364400416034343698204186575808495617n;

export const IDENTITY_DERIVATION_VERSION = "writ-identity-v1";

/** The fixed derivation message — deliberately nonce-free so derivation is
    deterministic per wallet. Control of the account is proven separately by the
    nonce-bound onboarding bind signature (lib/server/bind.ts). */
export function identityDerivationMessage(accountHex: string, assetId: string): string {
  return [
    `${IDENTITY_DERIVATION_VERSION} — derive Writ identity secret`,
    `asset: ${assetId}`,
    `account: ${accountHex}`,
    "Only sign this in the Writ app. Never share the resulting signature.",
  ].join("\n");
}

function sigToField(sigBytes: Uint8Array, tag: string): bigint {
  const input = new Uint8Array(sigBytes.length + tag.length);
  input.set(sigBytes);
  input.set(new TextEncoder().encode(tag), sigBytes.length);
  const h = blake2b(input, { dkLen: 31 });
  let v = 0n;
  for (const byte of h) v = (v << 8n) | BigInt(byte);
  return v % FIELD;
}

export type DerivedIdentity = {
  identitySecret: bigint;
  salt: bigint;
  /** Poseidon(identitySecret) — the only identity value the server ever sees. */
  idCommit: string;
};

/** Derive identitySecret/salt/idCommit from the wallet's derivation signature.
    Runs entirely in the browser. */
export async function deriveIdentity(signatureHex: string): Promise<DerivedIdentity> {
  const clean = signatureHex.replace(/^0x/, "").toLowerCase();
  if (!/^[0-9a-f]{128,132}$/.test(clean)) throw new Error("unexpected wallet signature format");
  const sigBytes = Uint8Array.from(clean.match(/.{2}/g)!.map((b) => parseInt(b, 16)));

  const identitySecret = sigToField(sigBytes, "writ::identity/v1");
  const salt = sigToField(sigBytes, "writ::salt/v1");

  const { buildPoseidon } = await import("circomlibjs");
  const poseidon = await buildPoseidon();
  const idCommit = poseidon.F.toString(poseidon([identitySecret]));

  return { identitySecret, salt, idCommit };
}
