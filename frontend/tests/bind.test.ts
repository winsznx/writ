/*
  F-5 acceptance: an account can only be onboarded by the wallet that controls it.
  Covers: valid bind passes; attacker key for victim account fails; replay fails;
  expiry fails; tampered message (wrong domain/registry/asset) fails; unknown
  nonce fails.
*/

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ed25519 } from "@noble/curves/ed25519";
import {
  issueBindNonce,
  verifyBindStrict,
  publicKeyToAccountHash,
  _resetBindStore,
} from "@/lib/server/bind";

function wallet() {
  const seed = ed25519.utils.randomPrivateKey();
  const pub = Buffer.from(ed25519.getPublicKey(seed)).toString("hex");
  const publicKey = "01" + pub;
  const account = publicKeyToAccountHash(publicKey);
  const sign = (message: string): string => {
    const bytes = new TextEncoder().encode(`Casper Message:\n${message}`);
    return "01" + Buffer.from(ed25519.sign(bytes, seed)).toString("hex");
  };
  return { publicKey, account, sign };
}

describe("wallet bind (blocking)", () => {
  beforeEach(() => _resetBindStore());
  afterEach(() => vi.useRealTimers());

  it("accepts a valid signature from the wallet that owns the account", () => {
    const w = wallet();
    const { nonce, message } = issueBindNonce(w.account);
    const res = verifyBindStrict({
      account: w.account, publicKey: w.publicKey, nonce, signature: w.sign(message), consume: false,
    });
    expect(res).toEqual({ ok: true });
  });

  it("rejects an attacker requesting a bind for a victim account", () => {
    const victim = wallet();
    const attacker = wallet();
    const { nonce, message } = issueBindNonce(victim.account);
    const res = verifyBindStrict({
      account: victim.account,
      publicKey: attacker.publicKey, // attacker's key does not hash to victim's account
      nonce,
      signature: attacker.sign(message),
      consume: false,
    });
    expect(res).toEqual({ ok: false, reason: "key-does-not-own-account" });
  });

  it("rejects a replayed (consumed) bind signature", () => {
    const w = wallet();
    const { nonce, message } = issueBindNonce(w.account);
    const sig = w.sign(message);
    const first = verifyBindStrict({ account: w.account, publicKey: w.publicKey, nonce, signature: sig, consume: true });
    expect(first.ok).toBe(true);
    const replay = verifyBindStrict({ account: w.account, publicKey: w.publicKey, nonce, signature: sig, consume: true });
    expect(replay).toEqual({ ok: false, reason: "replayed" });
  });

  it("rejects an expired bind", () => {
    vi.useFakeTimers();
    const w = wallet();
    const { nonce, message } = issueBindNonce(w.account);
    const sig = w.sign(message);
    vi.advanceTimersByTime(11 * 60_000); // past the 10-minute TTL
    const res = verifyBindStrict({ account: w.account, publicKey: w.publicKey, nonce, signature: sig, consume: false });
    expect(res).toEqual({ ok: false, reason: "expired" });
  });

  it("rejects a signature over a tampered message (wrong domain/registry/asset)", () => {
    const w = wallet();
    const { nonce, message } = issueBindNonce(w.account);
    const tampered = message.replace("writ-bond-001", "writ-bond-999");
    const res = verifyBindStrict({
      account: w.account, publicKey: w.publicKey, nonce, signature: w.sign(tampered), consume: false,
    });
    expect(res).toEqual({ ok: false, reason: "bad-signature" });
  });

  it("rejects an unknown nonce", () => {
    const w = wallet();
    const res = verifyBindStrict({
      account: w.account, publicKey: w.publicKey, nonce: "ff".repeat(16), signature: w.sign("x"), consume: false,
    });
    expect(res).toEqual({ ok: false, reason: "unknown-nonce" });
  });

  it("rejects a bind issued for a different account", () => {
    const a = wallet();
    const b = wallet();
    const { nonce, message } = issueBindNonce(a.account);
    const res = verifyBindStrict({
      account: b.account, publicKey: b.publicKey, nonce, signature: b.sign(message), consume: false,
    });
    expect(res).toEqual({ ok: false, reason: "account-mismatch" });
  });
});
