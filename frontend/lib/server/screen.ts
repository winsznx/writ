/*
  SERVER-ONLY. OFAC SDN screening — the blocking gate, mirroring the proven agent
  path: a hit on the OFAC sanctioned-digital-currency denylist fails screening;
  clear-by-default otherwise. A sanctioned wallet is NEVER attested.
*/

import "server-only";

const OFAC_LIST_URL =
  "https://raw.githubusercontent.com/0xB10C/ofac-sanctioned-digital-currency-addresses/lists/sanctioned_addresses_ETH.txt";

let cache: { set: Set<string>; at: number } | null = null;

async function ofacSet(): Promise<Set<string>> {
  if (cache && Date.now() - cache.at < 3_600_000) return cache.set;
  const res = await fetch(OFAC_LIST_URL, { cache: "no-store" });
  if (!res.ok) throw new Error(`OFAC list fetch failed: ${res.status}`);
  const set = new Set(
    (await res.text()).split("\n").map((s) => s.trim().toLowerCase()).filter(Boolean),
  );
  cache = { set, at: Date.now() };
  return set;
}

export type ScreenResult = { clean: boolean; source: string; listSize: number };

/** Screen an address (EVM-style screen address) against the OFAC SDN denylist. */
export async function screen(screenAddress: string): Promise<ScreenResult> {
  const set = await ofacSet();
  return {
    clean: !set.has(screenAddress.toLowerCase()),
    source: "OFAC SDN digital-currency designations",
    listSize: set.size,
  };
}
