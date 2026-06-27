/*
  Best-effort verification of the holder-binding signature a visitor produces with their
  own wallet (CSPR.click signMessage) during onboarding. Proves the connected account
  controls the key being attested. Non-blocking: the proof is itself bound to the
  account-derived witness, so a cancelled or format-mismatched signature never gates the
  onboard — the result is surfaced so a human can confirm the wallet's exact format.

  Casper signed-message format: the wallet signs the UTF-8 bytes of
  `Casper Message:\n${message}`. ed25519 (public-key tag 01) signs those bytes directly.
*/

import { ed25519 } from "@noble/curves/ed25519";

export type BindStatus = "verified" | "unverified" | "unsigned";

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.replace(/^0x/, "").toLowerCase();
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  return out;
}

export function verifyBind(
  publicKeyHex: unknown,
  message: unknown,
  signatureHex: unknown,
): BindStatus {
  if (typeof signatureHex !== "string" || !signatureHex) return "unsigned";
  if (typeof publicKeyHex !== "string" || typeof message !== "string") return "unverified";
  try {
    const tag = publicKeyHex.slice(0, 2).toLowerCase();
    if (tag !== "01") return "unverified"; // ed25519 only; secp256k1 left for eyes-on
    const pub = hexToBytes(publicKeyHex.slice(2));
    if (pub.length !== 32) return "unverified";

    let sig = signatureHex.replace(/^0x/, "").toLowerCase();
    if (sig.length === 130) sig = sig.slice(2); // strip a leading algorithm tag if present
    if (sig.length !== 128) return "unverified";

    const formatted = new TextEncoder().encode(`Casper Message:\n${message}`);
    return ed25519.verify(hexToBytes(sig), formatted, pub) ? "verified" : "unverified";
  } catch {
    return "unverified";
  }
}
