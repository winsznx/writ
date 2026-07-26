/*
  SERVER-ONLY. Mandatory wallet-control binding for onboarding.

  The server issues a single-use nonce; the visitor signs a domain-separated message
  (chain, registry, asset, account, nonce, expiry) with the wallet that owns the
  account being onboarded. Verification is BLOCKING: no claims are issued and no
  credential is attested unless the signature verifies for the exact account, the
  nonce is known, unexpired, and unconsumed.

  Store is in-memory (single Railway replica — same limitation as guards.ts).

  Casper signed-message format: the wallet signs the UTF-8 bytes of
  `Casper Message:\n${message}`. ed25519 (tag 01) signs those bytes directly;
  secp256k1 (tag 02) signs the sha256 digest (casper-js-sdk convention).
*/

import "server-only";
import { randomBytes } from "node:crypto";
import { ed25519 } from "@noble/curves/ed25519";
import { secp256k1 } from "@noble/curves/secp256k1";
import { sha256 } from "@noble/hashes/sha256";
import { blake2b } from "@noble/hashes/blake2b";

const BIND_TTL_MS = 10 * 60_000;
const MAX_PENDING = 5_000;

const CHAIN = process.env.CASPER_CHAIN ?? "casper-test";
const REGISTRY = process.env.REGISTRY_PKG ?? "hash-74148da7b68ce51e4dfa822af7106daaea7140862106a7b675057caf9ee404ce";
const ASSET = process.env.ASSET_ID ?? "writ-bond-001";

type BindRecord = {
  account: string;
  nonce: string;
  expiresAtMs: number;
  consumed: boolean;
};

const records = new Map<string, BindRecord>();

function prune(): void {
  const now = Date.now();
  for (const [k, r] of records) if (r.consumed || r.expiresAtMs < now) records.delete(k);
}

export function bindMessage(account: string, nonce: string, expiresAtMs: number): string {
  return [
    "Writ onboarding bind v2",
    `chain: ${CHAIN}`,
    `registry: ${REGISTRY}`,
    `asset: ${ASSET}`,
    `account: ${account}`,
    `nonce: ${nonce}`,
    `expires: ${Math.floor(expiresAtMs / 1000)}`,
  ].join("\n");
}

/** Issue a fresh single-use bind nonce for an account. */
export function issueBindNonce(account: string): { nonce: string; message: string; expiresAtMs: number } {
  prune();
  if (records.size >= MAX_PENDING) throw new Error("bind store full — try again shortly");
  const nonce = randomBytes(16).toString("hex");
  const expiresAtMs = Date.now() + BIND_TTL_MS;
  records.set(nonce, { account, nonce, expiresAtMs, consumed: false });
  return { nonce, message: bindMessage(account, nonce, expiresAtMs), expiresAtMs };
}

/** Casper account hash for a tagged public key hex (01 ed25519 / 02 secp256k1). */
export function publicKeyToAccountHash(publicKeyHex: string): string {
  const tag = publicKeyHex.slice(0, 2).toLowerCase();
  const algo = tag === "01" ? "ed25519" : "secp256k1";
  const pub = Buffer.from(publicKeyHex.slice(2), "hex");
  const input = Buffer.concat([Buffer.from(algo, "utf8"), Buffer.from([0]), pub]);
  return Buffer.from(blake2b(input, { dkLen: 32 })).toString("hex");
}

export type BindFailure =
  | "missing-fields"
  | "unknown-nonce"
  | "expired"
  | "replayed"
  | "account-mismatch"
  | "key-does-not-own-account"
  | "bad-signature";

export type BindVerification = { ok: true } | { ok: false; reason: BindFailure };

function verifySignature(publicKeyHex: string, message: string, signatureHex: string): boolean {
  const tag = publicKeyHex.slice(0, 2).toLowerCase();
  let sig = signatureHex.replace(/^0x/, "").toLowerCase();
  if (sig.length === 130) sig = sig.slice(2); // strip a leading algorithm tag
  const prefixed = new TextEncoder().encode(`Casper Message:\n${message}`);
  const pub = Buffer.from(publicKeyHex.slice(2), "hex");
  try {
    if (tag === "01") {
      if (pub.length !== 32 || sig.length !== 128) return false;
      return ed25519.verify(Buffer.from(sig, "hex"), prefixed, pub);
    }
    if (tag === "02") {
      if (pub.length !== 33 || sig.length !== 128) return false;
      return secp256k1.verify(Buffer.from(sig, "hex"), sha256(prefixed), pub);
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * BLOCKING verification that the caller controls `account`. Checks: nonce exists,
 * unexpired, unconsumed, issued for this account; the public key hashes to this
 * account; the signature verifies over the exact issued message.
 */
export function verifyBindStrict(args: {
  account: unknown;
  publicKey: unknown;
  nonce: unknown;
  signature: unknown;
  consume: boolean;
}): BindVerification {
  const { account, publicKey, nonce, signature } = args;
  if (
    typeof account !== "string" || typeof publicKey !== "string" ||
    typeof nonce !== "string" || typeof signature !== "string" ||
    !account || !publicKey || !nonce || !signature
  ) {
    return { ok: false, reason: "missing-fields" };
  }
  const rec = records.get(nonce);
  if (!rec) return { ok: false, reason: "unknown-nonce" };
  if (rec.expiresAtMs < Date.now()) return { ok: false, reason: "expired" };
  if (rec.consumed) return { ok: false, reason: "replayed" };
  if (rec.account !== account.toLowerCase()) return { ok: false, reason: "account-mismatch" };
  if (publicKeyToAccountHash(publicKey) !== account.toLowerCase()) {
    return { ok: false, reason: "key-does-not-own-account" };
  }
  const message = bindMessage(rec.account, rec.nonce, rec.expiresAtMs);
  if (!verifySignature(publicKey, message, signature)) return { ok: false, reason: "bad-signature" };
  if (args.consume) rec.consumed = true;
  return { ok: true };
}

/** Test hook — clears the nonce store. */
export function _resetBindStore(): void {
  records.clear();
}
