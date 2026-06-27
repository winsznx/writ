/*
  SERVER-ONLY. Guards for the public onboarding endpoint — a signing endpoint is an
  exposure surface. In-memory (single Railway replica): per-key sliding-window rate
  limit, per-wallet one-shot, global soft cap, testnet-only.
*/

import "server-only";

const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = Number(process.env.ONBOARD_RATE_MAX ?? 4);
const GLOBAL_CAP = Number(process.env.ONBOARD_GLOBAL_CAP ?? 200);

const hits = new Map<string, number[]>();
const onboarded = new Set<string>();
let globalCount = 0;

export function rateLimit(key: string): { ok: boolean; reason?: string } {
  const now = Date.now();
  const arr = (hits.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  if (arr.length >= MAX_PER_WINDOW) return { ok: false, reason: "rate limit — slow down" };
  arr.push(now);
  hits.set(key, arr);
  return { ok: true };
}

export function capCheck(account: string): { ok: boolean; reason?: string } {
  if (onboarded.has(account)) return { ok: false, reason: "this wallet already has a credential" };
  if (globalCount >= GLOBAL_CAP) return { ok: false, reason: "demo onboarding cap reached" };
  return { ok: true };
}

export function markOnboarded(account: string): void {
  onboarded.add(account);
  globalCount += 1;
}

export function isTestnet(): boolean {
  return (process.env.CASPER_CHAIN ?? "casper-test") === "casper-test";
}
