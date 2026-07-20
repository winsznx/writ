/*
  Issues a single-use, expiring bind nonce for an account. The visitor signs the
  returned message with the wallet that owns the account; /api/claims and
  /api/onboard verify that signature BLOCKING before doing anything.
*/

import { issueBindNonce } from "@/lib/server/bind";
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
  const rl = rateLimit(`bind:${ip}`);
  if (!rl.ok) return Response.json({ error: rl.reason }, { status: 429 });

  let body: unknown;
  try { body = await req.json(); } catch { return Response.json({ error: "bad json" }, { status: 400 }); }
  const account = accountHex((body as { account?: unknown })?.account);
  if (!account) return Response.json({ error: "invalid account hash" }, { status: 400 });

  const { nonce, message, expiresAtMs } = issueBindNonce(account);
  return Response.json({ nonce, message, expiresAt: Math.floor(expiresAtMs / 1000) });
}
