/*
  Demo-issuer claim signing. The caller must prove control of the account (bind
  signature — BLOCKING) and supply idCommit = Poseidon(identitySecret) computed in
  the browser. The server signs the demo claim set for that commitment and returns
  the public witness parts. It never sees — and cannot derive — identitySecret or
  salt, so it cannot rebuild the witness or generate the holder's proof.
*/

import { issueClaims, IssuerKeyMissingError, FIELD } from "@/lib/server/issuer-input";
import { verifyBindStrict } from "@/lib/server/bind";
import { rateLimit, isTestnet } from "@/lib/server/guards";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function accountHex(s: unknown): string | null {
  if (typeof s !== "string") return null;
  const hex = s.replace(/^account-hash-/, "").toLowerCase();
  return /^[0-9a-f]{64}$/.test(hex) ? hex : null;
}

export async function POST(req: Request): Promise<Response> {
  if (!isTestnet()) return Response.json({ error: "testnet only" }, { status: 403 });
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0] ?? "local";
  const rl = rateLimit(`claims:${ip}`);
  if (!rl.ok) return Response.json({ error: rl.reason }, { status: 429 });

  let body: {
    account?: unknown; publicKey?: unknown; nonce?: unknown; signature?: unknown; idCommit?: unknown;
  };
  try { body = await req.json(); } catch { return Response.json({ error: "bad json" }, { status: 400 }); }

  const account = accountHex(body.account);
  if (!account) return Response.json({ error: "invalid account hash" }, { status: 400 });

  // BLOCKING wallet-control check: no claims for an account the caller doesn't own.
  const bind = verifyBindStrict({
    account, publicKey: body.publicKey, nonce: body.nonce, signature: body.signature, consume: false,
  });
  if (!bind.ok) {
    return Response.json({ error: `wallet bind failed: ${bind.reason}` }, { status: 403 });
  }

  const idCommit = typeof body.idCommit === "string" ? body.idCommit : null;
  if (!idCommit || !/^\d+$/.test(idCommit) || BigInt(idCommit) >= FIELD) {
    return Response.json({ error: "idCommit (decimal field element) required" }, { status: 400 });
  }

  try {
    const issued = await issueClaims(idCommit);
    return Response.json(issued);
  } catch (e) {
    if (e instanceof IssuerKeyMissingError) {
      return Response.json({ error: e.message }, { status: 503 });
    }
    return Response.json({ error: e instanceof Error ? e.message : "claims failed" }, { status: 500 });
  }
}
