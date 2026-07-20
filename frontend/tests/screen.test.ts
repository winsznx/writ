/*
  F-4 acceptance: the sanctions gate can actually fire.
  - a sanctioned LINKED ETH address (an identifier the live OFAC list can contain)
    is denied
  - a clean linked address / account passes
  - the demo Casper denylist fires and is labeled as demo
  - unavailable or stale list data refuses attestation (fail closed)
*/

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import {
  screenParties,
  ScreeningUnavailableError,
  _setScreenCache,
} from "@/lib/server/screen";

const SANCTIONED_ETH = "0x7f367cc41522ce07553e823bf3be79a889debe1b"; // real SDN entry format
const CLEAN_ETH = "0x1111111111111111111111111111111111111111";
const ACCOUNT = "ab".repeat(32);

function freshSnapshot(ageMs = 0) {
  return {
    set: new Set([SANCTIONED_ETH]),
    fetchedAt: Date.now() - ageMs,
    sha256: createHash("sha256").update("fixture").digest("hex"),
  };
}

describe("sanctions screening", () => {
  beforeEach(() => {
    _setScreenCache(freshSnapshot());
    delete process.env.DEMO_SANCTIONED_ACCOUNTS;
  });
  afterEach(() => {
    _setScreenCache(null);
    vi.unstubAllGlobals();
    delete process.env.DEMO_SANCTIONED_ACCOUNTS;
  });

  it("denies a sanctioned linked ETH address against the live-list snapshot", async () => {
    const res = await screenParties({ casperAccountHex: ACCOUNT, linkedEthAddress: SANCTIONED_ETH });
    expect(res.clean).toBe(false);
    expect(res.hit).toEqual({ identifier: SANCTIONED_ETH, list: "ofac-sdn-eth" });
  });

  it("accepts a clean linked ETH address and a clean account", async () => {
    const res = await screenParties({ casperAccountHex: ACCOUNT, linkedEthAddress: CLEAN_ETH });
    expect(res.clean).toBe(true);
    expect(res.hit).toBeNull();
    expect(res.meta.entries).toBeGreaterThan(0);
    expect(res.meta.scope).toMatch(/demo denylist/i);
  });

  it("denies an account on the labeled demo denylist", async () => {
    process.env.DEMO_SANCTIONED_ACCOUNTS = `account-hash-${ACCOUNT}`;
    const res = await screenParties({ casperAccountHex: ACCOUNT });
    expect(res.clean).toBe(false);
    expect(res.hit?.list).toBe("demo-casper-denylist");
  });

  it("rejects a malformed linked ETH address", async () => {
    await expect(
      screenParties({ casperAccountHex: ACCOUNT, linkedEthAddress: "not-an-address" }),
    ).rejects.toThrow(/ETH address/);
  });

  it("refuses to attest when list data is unavailable (no cache)", async () => {
    _setScreenCache(null);
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("network down"); }));
    await expect(screenParties({ casperAccountHex: ACCOUNT })).rejects.toThrow(
      ScreeningUnavailableError,
    );
  });

  it("refuses to attest when cached data is stale (>24h) and refresh fails", async () => {
    _setScreenCache(freshSnapshot(25 * 3_600_000));
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("network down"); }));
    await expect(screenParties({ casperAccountHex: ACCOUNT })).rejects.toThrow(
      ScreeningUnavailableError,
    );
  });

  it("serves a degraded-but-fresh cache (<24h) when refresh fails", async () => {
    _setScreenCache(freshSnapshot(2 * 3_600_000));
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("network down"); }));
    const res = await screenParties({ casperAccountHex: ACCOUNT, linkedEthAddress: SANCTIONED_ETH });
    expect(res.clean).toBe(false);
  });
});
