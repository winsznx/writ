/*
  Onboarding attestation. Order of gates — every one BLOCKING:

  1. guards (rate limit, one-shot cap, testnet only)
  2. wallet-control bind: nonce-bound, domain-separated, single-use signature —
     an account can only be onboarded by the wallet that controls it
  3. groth16 proof verification (snarkjs, server-side)
  4. full public-input binding: nullifier/commitment taken from the verified proof;
     issuerAx/issuerAy/assetId/allowedRoot must equal the canonical registry values
  5. sanctions screening (live OFAC ETH list for the linked ETH address; labeled
     demo Casper denylist) — unavailable/stale data refuses attestation
  6. attest on-chain, storing the HOLDER'S OWN proof bytes (ark encoding of the
     submitted snarkjs proof) with the holder's own public inputs

  Honest labeling: the two attestation signatures come from env keys held by THIS
  server process — a 2-signature demo attestation from one trust domain, not an
  independent 2-of-3 quorum. The on-chain registry does verify both signatures
  against its registered 3-key set with threshold 2.
*/

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { canonicalPublicValues, IssuerKeyMissingError } from "@/lib/server/issuer-input";
import { screenParties, ScreeningUnavailableError } from "@/lib/server/screen";
import { submitAttest, AttestExecutionError } from "@/lib/server/quorum-attest";
import { proofToArkBytes, arkBytesToProofCoords, MalformedProofError } from "@/lib/server/proof-serde";
import { rateLimit, capCheck, markOnboarded, isTestnet } from "@/lib/server/guards";
import { verifyBindStrict } from "@/lib/server/bind";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Credential lifetime (seconds). The registry enforces expiry on-chain
    (get_block_time_secs); is_active flips false after this window. */
const CREDENTIAL_TTL_SECS = Number(process.env.CREDENTIAL_TTL_SECS ?? 90 * 86_400);

function accountHex(s: unknown): string | null {
  if (typeof s !== "string") return null;
  const hex = s.replace(/^account-hash-/, "").toLowerCase();
  return /^[0-9a-f]{64}$/.test(hex) ? hex : null;
}

export async function POST(req: Request): Promise<Response> {
  if (!isTestnet()) return Response.json({ error: "testnet only" }, { status: 403 });
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0] ?? "local";

  let body: {
    account?: unknown;
    publicKey?: unknown;
    nonce?: unknown;
    signature?: unknown;
    proof?: unknown;
    publicSignals?: unknown;
    linkedEthAddress?: unknown;
  };
  try { body = await req.json(); } catch { return Response.json({ error: "bad json" }, { status: 400 }); }

  const account = accountHex(body.account);
  const proof = body.proof;
  const publicSignals = body.publicSignals;
  if (!account || !proof || !Array.isArray(publicSignals) || publicSignals.length !== 6 ||
      publicSignals.some((s) => typeof s !== "string" || !/^\d+$/.test(s))) {
    return Response.json({ error: "account, proof, and publicSignals[6] required" }, { status: 400 });
  }

  // (1) guards
  for (const k of [`onboard:${ip}`, `onboard:${account}`]) {
    const rl = rateLimit(k);
    if (!rl.ok) return Response.json({ error: rl.reason }, { status: 429 });
  }
  const cap = capCheck(account);
  if (!cap.ok) return Response.json({ error: cap.reason }, { status: 409 });

  // (2) wallet-control bind — BLOCKING and single-use (nonce consumed here)
  const bind = verifyBindStrict({
    account, publicKey: body.publicKey, nonce: body.nonce, signature: body.signature, consume: true,
  });
  if (!bind.ok) {
    return Response.json({ error: `wallet bind failed: ${bind.reason}` }, { status: 403 });
  }

  try {
    // (3) verify the groth16 proof server-side (never attest an invalid proof)
    const snarkjs = await import("snarkjs");
    const vkey = JSON.parse(await readFile(join(process.cwd(), "public", "circuit", "elig2_vkey.json"), "utf8"));
    const ok = await snarkjs.groth16.verify(vkey, publicSignals as string[], proof);
    if (!ok) return Response.json({ error: "invalid proof" }, { status: 400 });

    // (4) bind ALL public inputs to canonical registry values:
    // [0] nullifier / [1] commitment come from the verified proof itself;
    // [2..5] must equal the pinned issuer key, asset, and jurisdiction root.
    const canonical = await canonicalPublicValues();
    const [, , issuerAx, issuerAy, assetId, allowedRoot] = publicSignals as string[];
    if (issuerAx !== canonical.issuerAx || issuerAy !== canonical.issuerAy) {
      return Response.json({ error: "proof issuer key does not match the pinned issuer" }, { status: 400 });
    }
    if (assetId !== canonical.assetId) {
      return Response.json({ error: "proof asset does not match this registry's asset" }, { status: 400 });
    }
    if (allowedRoot !== canonical.allowedRoot) {
      return Response.json({ error: "proof jurisdiction root does not match the canonical root" }, { status: 400 });
    }

    // (5) sanctions screening — fail-closed on unavailable/stale data
    const linkedEthAddress = typeof body.linkedEthAddress === "string" && body.linkedEthAddress
      ? body.linkedEthAddress : null;
    const s = await screenParties({ casperAccountHex: account, linkedEthAddress });
    if (!s.clean) {
      return Response.json(
        { error: `screening hit (${s.hit?.list})`, screen: s },
        { status: 403 },
      );
    }

    // (6) attest, storing the holder's OWN proof bytes (no placeholder)
    const proofBytes = proofToArkBytes(proof);
    arkBytesToProofCoords(proofBytes); // round-trip sanity
    const expiry = Math.floor(Date.now() / 1000) + CREDENTIAL_TTL_SECS;
    const res = await submitAttest({
      holderHex: account, publicSignals: publicSignals as string[], proofBytes, expiry,
    });
    markOnboarded(account);
    return Response.json({
      status: "attested",
      deployHash: res.deployHash,
      commitment: "0x" + res.commitment,
      nullifier: "0x" + res.nullifier,
      expiry,
      storedProofSha256: createHash("sha256").update(proofBytes).digest("hex"),
      bind: "verified",
      attestation: {
        model: "2 signatures from server-held demo keys (single trust domain)",
        onChainCheck: "registry verifies both ed25519 signatures against its 3-key set, threshold 2",
      },
      screen: { screened: s.screened, meta: s.meta },
    });
  } catch (e) {
    if (e instanceof ScreeningUnavailableError) {
      return Response.json({ error: e.message }, { status: 503 });
    }
    if (e instanceof IssuerKeyMissingError) {
      return Response.json({ error: e.message }, { status: 503 });
    }
    if (e instanceof MalformedProofError) {
      return Response.json({ error: e.message }, { status: 400 });
    }
    if (e instanceof AttestExecutionError) {
      return Response.json(
        { error: e.message, deployHash: e.deployHash, status: "attest-failed-on-chain" },
        { status: 502 },
      );
    }
    return Response.json({ error: e instanceof Error ? e.message : "onboard failed" }, { status: 500 });
  }
}
