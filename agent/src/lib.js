// Writ compliance agent — core library.
// A verifier instance: account-bind → arkworks proof verify → OFAC screening →
// quorum sign. A coordinator collects >= threshold sigs and submits to the
// on-chain Credential Registry via put-deploy. Plus the re-screen scheduler.
//
// Reuses the proven binaries: circuits/ark-verifier (proof verify) and
// /tmp/writ-signer (canonical-payload quorum signer). Screening is real:
// the OFAC SDN list (HTTP) — the blocking gate, a clear-by-default denylist.

import { execFileSync } from "node:child_process";
import { ed25519 } from "@noble/curves/ed25519";
import { secp256k1 } from "@noble/curves/secp256k1";
import { blake2b } from "@noble/hashes/blake2b";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const KEYS_DIR = process.env.WRIT_KEYS_DIR ?? "/tmp/writ-keys";


const NODE = "https://node.testnet.casper.network/rpc";
const ARK_VERIFY = process.env.ARK_VERIFY ?? join(REPO_ROOT, "circuits", "ark-verifier", "target", "release", "ark-verify");
const WRIT_SIGNER = process.env.WRIT_SIGNER ?? "/tmp/writ-signer/target/release/writ-signer";
const CASPER = "casper-client";
const OFAC_LIST_URL =
  "https://raw.githubusercontent.com/0xB10C/ofac-sanctioned-digital-currency-addresses/lists/sanctioned_addresses_ETH.txt";

// ---------- (a) account binding ----------
// The holder signs blake2b256(nullifier || commitment) with their Casper account
// key, binding the (off-chain) proof to their on-chain account. Casper pubkey is
// tagged 01=ed25519 / 02=secp256k1.
export function accountBindMessage(nullifierHex, commitmentHex) {
  const bytes = Buffer.concat([Buffer.from(nullifierHex, "hex"), Buffer.from(commitmentHex, "hex")]);
  return blake2b(bytes, { dkLen: 32 });
}
export function verifyAccountBind(pubkeyHex, msg, sigHex) {
  const tag = pubkeyHex.slice(0, 2);
  const key = pubkeyHex.slice(2);
  const sig = Buffer.from(sigHex, "hex");
  if (tag === "01") return ed25519.verify(sig, msg, Buffer.from(key, "hex"));
  if (tag === "02") return secp256k1.verify(sig, blake2b(msg, { dkLen: 32 }), Buffer.from(key, "hex"));
  throw new Error("unknown key tag " + tag);
}

// ---------- (b) arkworks proof verification (the agent's verify path) ----------
export function verifyProof(vkeyPath, proofPath, publicPath) {
  try {
    const out = execFileSync(ARK_VERIFY, [vkeyPath, proofPath, publicPath], { encoding: "utf8" });
    return out.includes("ARKWORKS_VERIFY=PASS");
  } catch {
    return false;
  }
}

// ---------- (c) screening: OFAC SDN — the blocking gate ----------
let _ofacCache = null;
export async function getOfacSet(forceRefresh = false) {
  if (!_ofacCache || forceRefresh) {
    const res = await fetch(OFAC_LIST_URL);
    _ofacCache = (await res.text()).split("\n").map((s) => s.trim().toLowerCase()).filter(Boolean);
  }
  return new Set(_ofacCache);
}
export async function ofacScreen(evmAddress) {
  const set = await getOfacSet();
  return { source: "OFAC SDN digital-currency designations", listSize: set.size, hit: set.has(evmAddress.toLowerCase()) };
}
// The blocking decision is OFAC-clear: a hit on the SDN digital-currency
// denylist fails screening; clear-by-default otherwise. `clean` = pass/fail.
export async function screen(evmAddress) {
  const ofac = await ofacScreen(evmAddress);
  return { evmAddress, ofac, clean: !ofac.hit };
}

// ---------- (d) quorum signing over the registry canonical payload ----------
// field-decimal -> 32-byte big-endian hex (commitment/nullifier come from the proof publics).
export function fieldToHex32(decimal) {
  let h = BigInt(decimal).toString(16);
  return h.padStart(64, "0");
}
// returns { pubkey, sig } for one quorum key signing (asset, holder, commitment, nullifier, expiry).
export function quorumSign(keyPath, assetId, holderAcctHashHex, commitmentHex, nullifierHex, expiry) {
  const out = execFileSync(
    WRIT_SIGNER,
    [assetId, holderAcctHashHex, commitmentHex, nullifierHex, String(expiry), keyPath],
    { encoding: "utf8" }
  );
  const signers = JSON.parse(out.match(/SIGNERS_JSON=(\[.*\])/)[1]);
  const sigs = JSON.parse(out.match(/SIGNATURES_JSON=(\[.*\])/)[1]);
  return { pubkey: signers[0], sig: sigs[0] };
}

// ---------- one verifier instance: verify + screen + sign ----------
export async function verifierInstance(req, keyPath) {
  const msg = accountBindMessage(req.nullifierHex, req.commitmentHex);
  if (!verifyAccountBind(req.holderAccountPubkey, msg, req.accountControlSig))
    return { ok: false, reason: "account-bind signature invalid" };
  if (!verifyProof(req.vkeyPath, req.proofPath, req.publicPath))
    return { ok: false, reason: "ZK proof invalid" };
  const s = await screen(req.holderScreenAddress);
  if (!s.clean) return { ok: false, reason: "screening: OFAC hit", screen: s };
  const sig = quorumSign(keyPath, req.assetId, req.holderAcctHashHex, req.commitmentHex, req.nullifierHex, req.expiry);
  return { ok: true, screen: s, sig };
}

// ---------- coordinator: collect >= threshold sigs, submit attest ----------
export async function coordinate(req, keyPaths, threshold, regPackageHash, fundedKey, payment = "80000000000") {
  const results = [];
  for (const kp of keyPaths) results.push(await verifierInstance(req, kp));
  const ok = results.filter((r) => r.ok);
  if (ok.length < threshold) return { ok: false, results, collected: ok.length };
  const chosen = ok.slice(0, threshold); // a real 2-of-3: only `threshold` sigs submitted
  const args = [
    { name: "asset_id", type: "String", value: req.assetId },
    { name: "holder", type: "Key", value: "account-hash-" + req.holderAcctHashHex },
    { name: "commitment", type: { ByteArray: 32 }, value: req.commitmentHex },
    { name: "nullifier", type: { ByteArray: 32 }, value: req.nullifierHex },
    { name: "expiry", type: "U64", value: Number(req.expiry) },
    { name: "signers", type: { List: "PublicKey" }, value: chosen.map((r) => r.sig.pubkey) },
    { name: "signatures", type: { List: { List: "U8" } }, value: chosen.map((r) => r.sig.sig) },
  ];
  const hash = putDeploy("attest", JSON.stringify(args), regPackageHash, fundedKey, payment);
  return { ok: true, txHash: hash, collected: ok.length, signers: chosen.map((r) => r.sig.pubkey), screen: chosen[0].screen };
}

// ---------- registry calls via casper-client put-deploy ----------
export function putDeploy(entryPoint, argsJson, packageHash, fundedKey, payment) {
  const out = execFileSync(
    CASPER,
    ["put-deploy", "--node-address", NODE, "--chain-name", "casper-test", "--secret-key", fundedKey,
     "--session-package-hash", packageHash, "--session-entry-point", entryPoint,
     "--session-args-json", argsJson, "--payment-amount", payment],
    { encoding: "utf8" }
  );
  const m = out.match(/"deploy_hash": "([a-f0-9]{64})"/);
  return m ? m[1] : null;
}
export function waitResult(hash) {
  for (let i = 0; i < 60; i++) {
    try {
      const out = execFileSync(CASPER, ["get-deploy", "--node-address", NODE, hash], { encoding: "utf8" });
      const j = JSON.parse(out.slice(out.indexOf("{")));
      const ei = j.result?.execution_info;
      if (ei) {
        const v2 = ei.execution_result?.Version2;
        return { block: ei.block_height, consumed: v2?.consumed, error: v2?.error_message || "SUCCESS" };
      }
    } catch {}
    execFileSync("sleep", ["7"]);
  }
  return { error: "TIMEOUT" };
}
export function revoke(assetId, holderAcctHashHex, packageHash, fundedKey, payment = "12000000000") {
  const args = JSON.stringify([
    { name: "asset_id", type: "String", value: assetId },
    { name: "holder", type: "Key", value: "account-hash-" + holderAcctHashHex },
  ]);
  return putDeploy("revoke", args, packageHash, fundedKey, payment);
}

// ---------- re-screen scheduler: delta (F4) + full-sweep floor ----------
// Delta: on a sanctions-list update, re-screen only holders whose monitored
// address is among the NEW entries since the baseline — O(new ∩ holders), not O(all).
export async function deltaReScreen(tracked, baseline) {
  const cur = await getOfacSet(true);
  const fresh = [...cur].filter((a) => !baseline.has(a));
  const hits = tracked.filter((h) => fresh.includes(h.screenAddress.toLowerCase()));
  return { newEntries: fresh.length, hits, current: cur };
}
// Full-sweep floor: periodically re-screen every tracked holder regardless of deltas.
export async function fullSweep(tracked) {
  const cur = await getOfacSet(true);
  return tracked.filter((h) => cur.has(h.screenAddress.toLowerCase()));
}
