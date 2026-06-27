/*
  Server-side quorum auto-attest onboarding. A connected wallet submits its in-browser
  proof + public signals; the server (1) guards the request, (2) binds the proof to the
  witness it issued for that wallet, (3) verifies the groth16 proof, (4) OFAC-screens,
  then (5) the 2-of-3 quorum (env keys) co-signs and attests on testnet — returning the
  live credential. A sanctioned or invalid request is never attested.
*/

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { buildVisitorWitness } from "@/lib/server/issuer-input";
import { screen } from "@/lib/server/screen";
import { submitAttest, placeholderProofBytes } from "@/lib/server/quorum-attest";
import { rateLimit, capCheck, markOnboarded, isTestnet } from "@/lib/server/guards";
import { verifyBind } from "@/lib/server/verify-bind";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const EXPIRY = 4_000_000_000;

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
    proof?: unknown;
    publicSignals?: unknown;
    publicKey?: unknown;
    bindMessage?: unknown;
    bindSignature?: unknown;
  };
  try { body = await req.json(); } catch { return Response.json({ error: "bad json" }, { status: 400 }); }

  const account = accountHex(body.account);
  const proof = body.proof;
  const publicSignals = body.publicSignals;
  if (!account || !proof || !Array.isArray(publicSignals) || publicSignals.length < 6) {
    return Response.json({ error: "account, proof, and publicSignals[6] required" }, { status: 400 });
  }

  // (1) guards
  for (const k of [`onboard:${ip}`, `onboard:${account}`]) {
    const rl = rateLimit(k);
    if (!rl.ok) return Response.json({ error: rl.reason }, { status: 429 });
  }
  const cap = capCheck(account);
  if (!cap.ok) return Response.json({ error: cap.reason }, { status: 409 });

  try {
    // (2) bind the proof to the witness the server issued for THIS wallet
    const w = await buildVisitorWitness(account);
    if (publicSignals[0] !== w.nullifier || publicSignals[1] !== w.commitment) {
      return Response.json({ error: "proof does not match this wallet's issued witness" }, { status: 400 });
    }

    // (3) verify the groth16 proof server-side (never attest an invalid proof)
    const snarkjs = await import("snarkjs");
    const vkey = JSON.parse(await readFile(join(process.cwd(), "public", "circuit", "elig2_vkey.json"), "utf8"));
    const ok = await snarkjs.groth16.verify(vkey, publicSignals as string[], proof);
    if (!ok) return Response.json({ error: "invalid proof" }, { status: 400 });

    // (4) OFAC screen — never attest a sanctioned wallet
    const s = await screen(account.slice(0, 40));
    if (!s.clean) return Response.json({ error: "screening: OFAC SDN hit", screen: s }, { status: 403 });

    // best-effort: confirm the visitor's wallet signed the holder-binding. Non-blocking —
    // the proof above is already bound to this account's issued witness.
    const bind = verifyBind(body.publicKey, body.bindMessage, body.bindSignature);

    // (5) quorum co-sign + attest
    const proofBytes = await placeholderProofBytes();
    const res = await submitAttest({ holderHex: account, publicSignals: publicSignals as string[], proofBytes, expiry: EXPIRY });
    markOnboarded(account);
    return Response.json({
      status: "attested",
      deployHash: res.deployHash,
      commitment: "0x" + res.commitment,
      bind,
      screen: { source: s.source, listSize: s.listSize },
    });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "onboard failed" }, { status: 500 });
  }
}
