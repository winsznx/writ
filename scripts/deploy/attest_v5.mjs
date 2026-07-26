/*
  V5 demo attestation driver. Generates REAL eligibility proofs with the CURRENT
  demo issuer key (the same key the live app uses), then attests them against the
  V5 registry — including one deliberately fraudulent credential (holder X gets
  holder A's proof bytes against X's own public inputs: the proof deserializes
  fine but the pairing fails, so challenge.resolve returns FALSE).

  Run from repo root:
    ISSUER_EDDSA_KEY=$(cat internal/issuer_eddsa_key.hex) \
    node scripts/deploy/attest_v5.mjs <holder-label>...

  Labels: R (regulator demo holder), F (sender), E (eligible recipient), X (fraud).
  Requires: circuits/build artifacts, internal/v5-keys/manifest_v5.json, and the
  quorum/coordinator PEMs under internal/v4-keys/.
*/
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "../..");
const require = createRequire(join(ROOT, "frontend/package.json"));
const snarkjs = require("snarkjs");
const { buildPoseidon, buildEddsa } = require("circomlibjs");
const { ed25519 } = require("@noble/curves/ed25519");
const { blake2b } = require("@noble/hashes/blake2b");
const {
  DeployUtil, RuntimeArgs, CLValueBuilder, CLPublicKey, CLAccountHash, Keys,
} = require("casper-js-sdk");

const NODE = process.env.CASPER_NODE ?? "https://node.testnet.casper.network/rpc";
const CHAIN = "casper-test";
const ASSET = "writ-bond-001";
const FIELD = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;
const MAN = JSON.parse(readFileSync(join(ROOT, "internal/v5-keys/manifest_v5.json"), "utf8"));
const REGISTRY_PKG = MAN.registry.package;
const WASM = join(ROOT, "circuits/build/eligibility_js/eligibility.wasm");
const ZKEY = join(ROOT, "circuits/build/elig2_final.zkey");
const ISSUER_HEX = process.env.ISSUER_EDDSA_KEY;
if (!ISSUER_HEX) throw new Error("ISSUER_EDDSA_KEY required");

/* Demo holder identity secrets — DELIBERATELY PUBLIC constants. These are demo
   fixtures, not user wallets: the regulator page discloses R's preimage on purpose.
   Real users derive their secret from a wallet signature in the browser. */
const DEMO_SECRETS = {
  R: 111111111111111111111111111111n,
  F: 222222222222222222222222222222n,
  E: 333333333333333333333333333333n,
  X: 444444444444444444444444444444n,
};

const pemSeed = (p) => {
  const b64 = readFileSync(p, "utf8").replace(/-----[^-]+-----/g, "").replace(/\s/g, "");
  return Buffer.from(b64, "base64").subarray(-32);
};
const acctOf = (seed) => {
  const pub = ed25519.getPublicKey(seed);
  return Buffer.from(blake2b(
    Buffer.concat([Buffer.from("ed25519", "utf8"), Buffer.from([0]), Buffer.from(pub)]), { dkLen: 32 },
  )).toString("hex");
};

const u32le = (n) => { const b = Buffer.alloc(4); b.writeUInt32LE(n); return b; };
const u64le = (n) => { const b = Buffer.alloc(8); b.writeBigUInt64LE(BigInt(n)); return b; };
const strBytes = (s) => Buffer.concat([u32le(Buffer.byteLength(s)), Buffer.from(s, "utf8")]);
const keyAccountBytes = (hex) => Buffer.concat([Buffer.from([0]), Buffer.from(hex, "hex")]);
const fieldToLe32 = (dec) => {
  const b = Buffer.alloc(32); let v = BigInt(dec);
  for (let i = 0; i < 32; i++) { b[i] = Number(v & 0xffn); v >>= 8n; }
  return b;
};
const quorumSign = (seed, msg) => ({
  pubkey: "01" + Buffer.from(ed25519.getPublicKey(seed)).toString("hex"),
  sig: "01" + Buffer.from(ed25519.sign(msg, seed)).toString("hex"),
});

/** snarkjs proof -> arkworks canonical-uncompressed 256 bytes (mirrors lib/server/proof-serde.ts). */
function proofToArkBytes(proof) {
  const leFq = (dec) => {
    const b = Buffer.alloc(32); let v = BigInt(dec);
    for (let i = 0; i < 32; i++) { b[i] = Number(v & 0xffn); v >>= 8n; }
    return b;
  };
  return Buffer.concat([
    leFq(proof.pi_a[0]), leFq(proof.pi_a[1]),
    leFq(proof.pi_b[0][0]), leFq(proof.pi_b[0][1]),
    leFq(proof.pi_b[1][0]), leFq(proof.pi_b[1][1]),
    leFq(proof.pi_c[0]), leFq(proof.pi_c[1]),
  ]);
}

async function buildWitnessAndProve(identitySecret, salt) {
  const poseidon = await buildPoseidon(); const F = poseidon.F;
  const eddsa = await buildEddsa();
  const s = (x) => F.toString(x);
  const issuerPrv = Buffer.from(ISSUER_HEX, "hex");
  const pub = eddsa.prv2pub(issuerPrv);

  const DEPTH = 4;
  const allowed = [840n, 826n, 276n, 250n, 392n, 36n, 124n, 756n];
  let level = [];
  for (let i = 0; i < (1 << DEPTH); i++) level.push(F.e(i < allowed.length ? allowed[i] : 0n));
  const tree = [level];
  while (level.length > 1) {
    const nx = [];
    for (let i = 0; i < level.length; i += 2) nx.push(poseidon([level[i], level[i + 1]]));
    tree.push(nx); level = nx;
  }
  const allowedRoot = s(level[0]);
  const els = [], idxs = [];
  let i = 0;
  for (let d = 0; d < DEPTH; d++) { els.push(s(tree[d][i ^ 1])); idxs.push((i & 1).toString()); i >>= 1; }

  const assetId = BigInt("0x" + Buffer.from(ASSET).toString("hex")).toString();
  const accredited = 1n, jur = 840n, sanctioned = 0n;
  const idCommit = poseidon([identitySecret]);
  const sig = eddsa.signPoseidon(issuerPrv, poseidon([accredited, jur, sanctioned, idCommit]));

  const input = {
    issuerAx: s(pub[0]), issuerAy: s(pub[1]), assetId, allowedRoot,
    accredited: accredited.toString(), jurisdictionCode: jur.toString(),
    sanctioned: sanctioned.toString(),
    identitySecret: identitySecret.toString(), salt: salt.toString(),
    sigR8x: s(sig.R8[0]), sigR8y: s(sig.R8[1]), sigS: sig.S.toString(),
    jurPathElements: els, jurPathIndices: idxs,
  };
  const { proof, publicSignals } = await snarkjs.groth16.fullProve(input, WASM, ZKEY);
  return { input, proof, publicSignals };
}

async function attest({ holderHex, publicSignals, proofBytes, expiry }) {
  const commitment = fieldToLe32(publicSignals[1]);
  const nullifier = fieldToLe32(publicSignals[0]);
  const msg = Buffer.concat([
    strBytes(ASSET), keyAccountBytes(holderHex), commitment, nullifier, u64le(expiry),
  ]);
  const q1 = pemSeed(join(ROOT, "internal/v4-keys/q1/secret_key.pem"));
  const q2 = pemSeed(join(ROOT, "internal/v4-keys/q2/secret_key.pem"));
  const s1 = quorumSign(q1, msg), s2 = quorumSign(q2, msg);

  const u8list = (buf) => CLValueBuilder.list(Array.from(buf).map((b) => CLValueBuilder.u8(b)));
  const publicInputs = Buffer.concat(publicSignals.slice(0, 6).map((x) => fieldToLe32(x)));
  const runtimeArgs = RuntimeArgs.fromMap({
    asset_id: CLValueBuilder.string(ASSET),
    holder: CLValueBuilder.key(new CLAccountHash(Uint8Array.from(Buffer.from(holderHex, "hex")))),
    commitment: CLValueBuilder.byteArray(Uint8Array.from(commitment)),
    nullifier: CLValueBuilder.byteArray(Uint8Array.from(nullifier)),
    expiry: CLValueBuilder.u64(expiry),
    proof: u8list(proofBytes),
    public_inputs: u8list(publicInputs),
    signers: CLValueBuilder.list([CLPublicKey.fromHex(s1.pubkey), CLPublicKey.fromHex(s2.pubkey)]),
    signatures: CLValueBuilder.list([u8list(Buffer.from(s1.sig, "hex")), u8list(Buffer.from(s2.sig, "hex"))]),
  });
  const coordSeed = pemSeed(join(ROOT, "internal/v4-keys/q1/secret_key.pem"));
  const coordKp = Keys.Ed25519.parseKeyPair(ed25519.getPublicKey(coordSeed), coordSeed);
  const regHash = Uint8Array.from(Buffer.from(REGISTRY_PKG.replace(/^hash-/, ""), "hex"));
  const session = DeployUtil.ExecutableDeployItem.newStoredVersionContractByHash(regHash, null, "attest", runtimeArgs);
  let deploy = DeployUtil.makeDeploy(
    new DeployUtil.DeployParams(coordKp.publicKey, CHAIN), session,
    DeployUtil.standardPayment(Number(process.env.ATTEST_PAYMENT_MOTES ?? 25_000_000_000)),
  );
  deploy = DeployUtil.signDeploy(deploy, coordKp);
  const res = await fetch(NODE, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "account_put_deploy", params: DeployUtil.deployToJson(deploy) }),
  });
  const json = await res.json();
  if (json.error) throw new Error(json.error.message);
  return json.result.deploy_hash;
}

async function waitDeploy(dh) {
  for (let i = 0; i < 25; i++) {
    await new Promise((r) => setTimeout(r, 7000));
    const res = await fetch(NODE, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "info_get_deploy", params: { deploy_hash: dh } }),
    });
    const j = await res.json();
    const v2 = j.result?.execution_info?.execution_result?.Version2;
    if (v2) return v2.error_message ?? "SUCCESS";
  }
  return "TIMEOUT";
}

const labels = process.argv.slice(2);
const EXPIRY = Math.floor(Date.now() / 1000) + 7776000;
const out = {};
const proofs = {};

for (const label of labels) {
  const secret = DEMO_SECRETS[label];
  if (!secret) throw new Error(`unknown label ${label}`);
  const seed = pemSeed(join(ROOT, `internal/v5-keys/holders/${label}/secret_key.pem`));
  const holderHex = acctOf(seed);
  const salt = (secret * 7n) % FIELD;
  const { input, proof, publicSignals } = await buildWitnessAndProve(secret, salt);
  proofs[label] = { proof, publicSignals, input, holderHex };
  console.log(`${label}: account ${holderHex} commitment ${publicSignals[1]}`);
}

for (const label of labels) {
  const p = proofs[label];
  // Holder X is the FRAUD fixture: attested with another holder's proof bytes
  // against its own public inputs — deserializes, but the pairing check fails.
  const donor = label === "X" ? (proofs.R ?? proofs[labels.find((l) => l !== "X")]) : p;
  const proofBytes = proofToArkBytes(donor.proof);
  const dh = await attest({ holderHex: p.holderHex, publicSignals: p.publicSignals, proofBytes, expiry: EXPIRY });
  const status = await waitDeploy(dh);
  console.log(`attest ${label}: ${dh} -> ${status}${label === "X" ? "  [FRAUD FIXTURE: donor proof]" : ""}`);
  out[label] = {
    account: p.holderHex, deploy: dh, status,
    commitment: "0x" + fieldToLe32(p.publicSignals[1]).toString("hex"),
    nullifier: "0x" + fieldToLe32(p.publicSignals[0]).toString("hex"),
    fraudFixture: label === "X",
  };
  if (label === "R") {
    writeFileSync(join(ROOT, "frontend/public/circuit/sample_input.json"), JSON.stringify(p.input, null, 1));
    console.log("  wrote frontend/public/circuit/sample_input.json (regulator demo preimage)");
  }
}

const outPath = join(ROOT, "internal/v5-keys/holders_v5.json");
writeFileSync(outPath, JSON.stringify({ expiry: EXPIRY, holders: out }, null, 2));
console.log("\n" + JSON.stringify(out, null, 2));
