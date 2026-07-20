/*
  SERVER-ONLY. Sanctions screening — honest scope:

  1. LIVE data source: the OFAC SDN digital-currency designations (ETH address list,
     mirrored by 0xB10C from the official SDN). Fetched live, versioned by content
     hash + timestamp. This list contains ETHEREUM addresses, so it can only match a
     linked ETH address the holder supplies — a Casper account hash can never appear
     in it. We therefore screen the OPTIONAL linked ETH address against it.
  2. DEMO denylist: a Casper-account denylist (env DEMO_SANCTIONED_ACCOUNTS) used to
     demonstrate the on-chain revoke/deny path. This is illustrative — there is no
     official Casper-account SDN mapping today. Results are labeled accordingly.

  Fail-closed freshness: if the live list cannot be fetched and no sufficiently
  fresh cached copy exists, screening throws and NO attestation happens.
*/

import "server-only";
import { createHash } from "node:crypto";

const OFAC_LIST_URL =
  "https://raw.githubusercontent.com/0xB10C/ofac-sanctioned-digital-currency-addresses/lists/sanctioned_addresses_ETH.txt";

const REFRESH_MS = 3_600_000; // re-fetch after 1h
const MAX_STALE_MS = 24 * 3_600_000; // refuse to attest on data older than 24h

export class ScreeningUnavailableError extends Error {
  constructor(msg: string) {
    super(`sanctions screening unavailable — refusing to attest: ${msg}`);
    this.name = "ScreeningUnavailableError";
  }
}

type ListSnapshot = { set: Set<string>; fetchedAt: number; sha256: string };
let cache: ListSnapshot | null = null;

async function liveList(now: number = Date.now()): Promise<ListSnapshot> {
  if (cache && now - cache.fetchedAt < REFRESH_MS) return cache;
  try {
    const res = await fetch(OFAC_LIST_URL, { cache: "no-store" });
    if (!res.ok) throw new Error(`fetch failed: HTTP ${res.status}`);
    const text = await res.text();
    const set = new Set(text.split("\n").map((s) => s.trim().toLowerCase()).filter(Boolean));
    if (set.size === 0) throw new Error("empty list");
    cache = { set, fetchedAt: now, sha256: createHash("sha256").update(text).digest("hex") };
    return cache;
  } catch (e) {
    if (cache && now - cache.fetchedAt < MAX_STALE_MS) return cache; // degraded but < 24h old
    throw new ScreeningUnavailableError(e instanceof Error ? e.message : "fetch failed");
  }
}

function demoDenylist(): Set<string> {
  return new Set(
    (process.env.DEMO_SANCTIONED_ACCOUNTS ?? "")
      .split(",")
      .map((s) => s.trim().replace(/^account-hash-/, "").toLowerCase())
      .filter(Boolean),
  );
}

export type ScreenResult = {
  clean: boolean;
  /** Which check fired, if any. */
  hit: null | { identifier: string; list: "ofac-sdn-eth" | "demo-casper-denylist" };
  screened: { casperAccount: string; linkedEthAddress: string | null };
  meta: {
    source: string;
    url: string;
    fetchedAt: string;
    listSha256: string;
    entries: number;
    /** Honest scope label surfaced to the UI/audit panel. */
    scope: string;
  };
};

/**
 * Screen the onboarding parties. The Casper account is checked against the DEMO
 * denylist only (labeled illustrative); the optional linked ETH address is checked
 * against the LIVE OFAC SDN ETH list (an identifier that can actually match).
 */
export async function screenParties(args: {
  casperAccountHex: string;
  linkedEthAddress?: string | null;
}): Promise<ScreenResult> {
  const account = args.casperAccountHex.toLowerCase();
  let linkedEth: string | null = null;
  if (args.linkedEthAddress) {
    const raw = String(args.linkedEthAddress).trim().toLowerCase();
    if (!/^0x[0-9a-f]{40}$/.test(raw)) throw new Error("linked ETH address must be 0x + 40 hex chars");
    linkedEth = raw;
  }

  const snapshot = await liveList();
  const meta = {
    source: "OFAC SDN digital-currency designations (ETH), 0xB10C mirror",
    url: OFAC_LIST_URL,
    fetchedAt: new Date(snapshot.fetchedAt).toISOString(),
    listSha256: snapshot.sha256,
    entries: snapshot.set.size,
    scope:
      "Live OFAC list holds ETH addresses; it is screened against the linked ETH address (if provided). Casper-account matching uses a demo denylist (illustrative — no official Casper SDN mapping exists).",
  };

  if (linkedEth && snapshot.set.has(linkedEth)) {
    return { clean: false, hit: { identifier: linkedEth, list: "ofac-sdn-eth" }, screened: { casperAccount: account, linkedEthAddress: linkedEth }, meta };
  }
  if (demoDenylist().has(account)) {
    return { clean: false, hit: { identifier: account, list: "demo-casper-denylist" }, screened: { casperAccount: account, linkedEthAddress: linkedEth }, meta };
  }
  return { clean: true, hit: null, screened: { casperAccount: account, linkedEthAddress: linkedEth }, meta };
}

/** Test hooks. */
export function _setScreenCache(snapshot: { set: Set<string>; fetchedAt: number; sha256: string } | null): void {
  cache = snapshot;
}
