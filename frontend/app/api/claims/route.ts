/*
  Per-visitor eligibility witness (server-side). The connected wallet posts its account
  hash; the demo KYC issuer signs a witness for an identitySecret DERIVED from that
  wallet (unique nullifier). The browser then generates the groth16 proof from this
  witness via lib/prove.ts and submits it to /api/onboard.
*/

import { buildVisitorWitness } from "@/lib/server/issuer-input";
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

  let body: unknown;
  try { body = await req.json(); } catch { return Response.json({ error: "bad json" }, { status: 400 }); }
  const account = accountHex((body as { account?: unknown })?.account);
  if (!account) return Response.json({ error: "invalid account hash" }, { status: 400 });

  try {
    const w = await buildVisitorWitness(account);
    return Response.json({ input: w.input, commitment: w.commitment, nullifier: w.nullifier });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "witness failed" }, { status: 500 });
  }
}
