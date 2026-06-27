// No-gas validation of the agent core before the live e2e.
import { ed25519 } from "@noble/curves/ed25519";
import { blake2b } from "@noble/hashes/blake2b";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import * as A from "./lib.js";
const hex = (u8) => Buffer.from(u8).toString("hex");
const C = "/Users/mac/writ/circuits/build";

const sk = ed25519.utils.randomPrivateKey();
const pk = ed25519.getPublicKey(sk);
const pubHex = "01" + hex(pk);
const jsHash = hex(blake2b(Buffer.concat([Buffer.from("ed25519"), Buffer.from([0]), Buffer.from(pk)]), { dkLen: 32 }));
const cc = execFileSync("casper-client", ["account-address", "--public-key", pubHex], { encoding: "utf8" }).trim();
console.log("account-hash match (JS vs casper-client):", "account-hash-" + jsHash === cc);

const msg = A.accountBindMessage("11".repeat(32), "22".repeat(32));
const sig = hex(ed25519.sign(msg, sk));
console.log("account-bind verify (valid):", A.verifyAccountBind(pubHex, msg, sig));
console.log("account-bind verify (tampered nullifier rejected):",
  A.verifyAccountBind(pubHex, A.accountBindMessage("99".repeat(32), "22".repeat(32)), sig) === false);

console.log("arkworks proof verify:", A.verifyProof(`${C}/elig2_vkey.json`, `${C}/elig2_proof.json`, `${C}/elig2_public.json`));

const clean = await A.ofacScreen("0x1Fb1A5bf49b3d460830dd5ddC527eD7608B1770B");
const sanctioned = await A.ofacScreen(readFileSync("/tmp/writ-keys/ofac_sanctioned_addr.txt", "utf8").trim());
console.log("OFAC clean -> hit?", clean.hit, "| OFAC sanctioned -> hit?", sanctioned.hit, "| list size:", clean.listSize);

const scClean = await A.screen("0x1Fb1A5bf49b3d460830dd5ddC527eD7608B1770B");
const scBad = await A.screen(readFileSync("/tmp/writ-keys/ofac_sanctioned_addr.txt", "utf8").trim());
console.log("screen() OFAC-only -> clean clean?", scClean.clean, "| sanctioned clean?", scBad.clean, "| no cordon field?", !("cordon" in scClean));

const pub = JSON.parse(readFileSync(`${C}/elig2_public.json`, "utf8"));
const qs = A.quorumSign("/tmp/writ-keys/q1/secret_key.pem", "writ-bond-001", jsHash, A.fieldToHex32(pub[1]), A.fieldToHex32(pub[0]), 4000000000);
console.log("quorum sign -> pubkey:", qs.pubkey.slice(0, 18) + "...", "sig len:", qs.sig.length);
