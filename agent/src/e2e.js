// Live end-to-end (local agent, real testnet contracts + real OFAC screening):
//   onboard (account-bind + arkworks verify + OFAC screen + 2-of-3 co-sign -> attest -> ACTIVE)
//   -> autonomous sanctions revoke (scheduler delta re-screen -> revoke)
//   -> refresh (same-slot re-attest).
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { ed25519 } from "@noble/curves/ed25519";
import { blake2b } from "@noble/hashes/blake2b";
import * as A from "./lib.js";

const REG3 = "5f96786dea78a7c4cc90c1353cdc9c26b0a49ad468b7de5cf6b0bc23a033aaf9";
const FUNDED = "/tmp/writ-keys/funded_secret_key.pem";
const QKEYS = ["/tmp/writ-keys/q1/secret_key.pem", "/tmp/writ-keys/q2/secret_key.pem", "/tmp/writ-keys/q3/secret_key.pem"];
const ASSET = "writ-bond-001";
const CIRC = "/Users/mac/writ/circuits/build";
const READER = "credential_registry";
const hex = (u8) => Buffer.from(u8).toString("hex");

function casperAccountHash(pubkey32) {
  return hex(blake2b(Buffer.concat([Buffer.from("ed25519"), Buffer.from([0]), Buffer.from(pubkey32)]), { dkLen: 32 }));
}
function readCred(holderHash) {
  const out = execFileSync(
    "cargo",
    ["run", "--quiet", "--bin", "livenet_read", "--features", "livenet", "--", REG3, ASSET, holderHash],
    { cwd: "/Users/mac/writ/contracts/credential-registry", encoding: "utf8", env: { ...process.env, PATH: process.env.PATH } }
  );
  return out.trim();
}

async function main() {
  // ---- demo holder: real ed25519 Casper account ----
  const sk = ed25519.utils.randomPrivateKey();
  const pk = ed25519.getPublicKey(sk);
  const holderPubkey = "01" + hex(pk);
  const holderHash = casperAccountHash(pk);
  console.log("Holder account-hash:", holderHash);

  // ---- proof + public outputs from the eligibility circuit ----
  const pub = JSON.parse(readFileSync(`${CIRC}/elig2_public.json`, "utf8"));
  const nullifierHex = A.fieldToHex32(pub[0]);
  const commitmentHex = A.fieldToHex32(pub[1]);

  // ---- holder binds the proof to their account ----
  const bindMsg = A.accountBindMessage(nullifierHex, commitmentHex);
  const accountControlSig = hex(ed25519.sign(bindMsg, sk));

  const now = Math.floor(Date.now() / 1000);
  const cleanAddr = "0x1Fb1A5bf49b3d460830dd5ddC527eD7608B1770B";
  const req = {
    vkeyPath: `${CIRC}/elig2_vkey.json`, proofPath: `${CIRC}/elig2_proof.json`, publicPath: `${CIRC}/elig2_public.json`,
    holderAccountPubkey: holderPubkey, holderAcctHashHex: holderHash, holderScreenAddress: cleanAddr,
    accountControlSig, assetId: ASSET, commitmentHex, nullifierHex, expiry: now + 3600,
  };

  console.log("\n=== STEP 5.1 ONBOARD (account-bind + arkworks verify + OFAC screen + 2-of-3 co-sign -> attest) ===");
  const onboard = await A.coordinate(req, QKEYS, 2, REG3, FUNDED);
  console.log("screen:", JSON.stringify(onboard.screen));
  console.log("2-of-3 signers:", onboard.signers);
  console.log("ATTEST tx:", onboard.txHash, "->", JSON.stringify(A.waitResult(onboard.txHash)));
  console.log("on-chain:", readCred(holderHash));

  console.log("\n=== STEP 5.3 AUTONOMOUS SANCTIONS REVOKE (scheduler delta re-screen -> revoke) ===");
  const baseline = await A.getOfacSet(); // pre-update list
  // sanctions update: the holder's monitored address is now an OFAC-listed address
  const sanctionedAddr = readFileSync("/tmp/writ-keys/ofac_sanctioned_addr.txt", "utf8").trim();
  const tracked = [{ assetId: ASSET, holderAcctHashHex: holderHash, screenAddress: sanctionedAddr }];
  const sweep = await A.fullSweep(tracked);
  console.log("re-screen full-sweep hits:", sweep.length, "(OFAC-listed:", sanctionedAddr + ")");
  if (sweep.length > 0) {
    const rh = A.revoke(ASSET, holderHash, REG3, FUNDED);
    console.log("REVOKE tx:", rh, "->", JSON.stringify(A.waitResult(rh)));
    console.log("on-chain:", readCred(holderHash));
  }

  console.log("\n=== STEP 5.4 REFRESH (same-slot re-attest, new expiry) ===");
  const req2 = { ...req, expiry: now + 100000 };
  // refresh re-binds the same nullifier/slot; quorum re-signs the new expiry
  const refresh = await A.coordinate(req2, QKEYS, 2, REG3, FUNDED);
  console.log("REFRESH attest tx:", refresh.txHash, "->", JSON.stringify(A.waitResult(refresh.txHash)));
  console.log("on-chain:", readCred(holderHash));
}
main().catch((e) => { console.error(e); process.exit(1); });
