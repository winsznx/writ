/*
  SERVER-ONLY. The 2-of-3 quorum co-sign + attest, reimplemented in pure Node (no
  Rust signer). Proven byte-exact against the live v4 registry: canonical_message =
  String.to_bytes(asset) || Key::Account.to_bytes(holder) || commitment[32] ||
  nullifier[32] || u64.to_bytes(expiry); ed25519-signed (tag 01).

  Keys come from env (testnet-only throwaway demo keys); NEVER imported client-side.
*/

import "server-only";
import { ed25519 } from "@noble/curves/ed25519";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  DeployUtil, RuntimeArgs, CLValueBuilder, CLPublicKey, CLAccountHash, Keys,
} from "casper-js-sdk";

const NODE = process.env.CASPER_NODE ?? "https://node.testnet.casper.network/rpc";
const CHAIN = process.env.CASPER_CHAIN ?? "casper-test";
const REGISTRY_PKG = process.env.REGISTRY_PKG ?? "hash-2e19e2bfc5383fd51103ee54fb430b53ec7a1a63c83a7841e08f00b188653fca";

function u32le(n: number): Buffer { const b = Buffer.alloc(4); b.writeUInt32LE(n); return b; }
function u64le(n: number | bigint): Buffer { const b = Buffer.alloc(8); b.writeBigUInt64LE(BigInt(n)); return b; }
function strBytes(s: string): Buffer { return Buffer.concat([u32le(Buffer.byteLength(s)), Buffer.from(s, "utf8")]); }
function keyAccountBytes(hex: string): Buffer { return Buffer.concat([Buffer.from([0]), Buffer.from(hex, "hex")]); }

/** field decimal -> 32-byte little-endian (the on-chain ByteArray encoding). */
export function fieldToLe32(decimal: string): Buffer {
  const b = Buffer.alloc(32);
  let v = BigInt(decimal);
  for (let i = 0; i < 32; i++) { b[i] = Number(v & 0xffn); v >>= 8n; }
  return b;
}

export function canonicalMessage(
  asset: string, holderHex: string, commitment: Buffer, nullifier: Buffer, expiry: number,
): Buffer {
  return Buffer.concat([strBytes(asset), keyAccountBytes(holderHex), commitment, nullifier, u64le(expiry)]);
}

/** Env keys are stored base64-encoded (the raw secret_key.pem, base64'd) to avoid
    dotenv edge cases with PEM headers. Accepts either a raw PEM or base64-of-PEM. */
export function loadPem(envValue: string): string {
  if (envValue.includes("BEGIN")) return envValue;
  return Buffer.from(envValue, "base64").toString("utf8");
}

function seedFromPem(pem: string): Buffer {
  const b64 = pem.replace(/-----[^-]+-----/g, "").replace(/\s/g, "");
  return Buffer.from(b64, "base64").subarray(-32); // PKCS8 ed25519 seed = last 32 bytes
}

/** One quorum signature over the canonical message. */
export function quorumSign(pem: string, msg: Buffer): { pubkey: string; sig: string } {
  const seed = seedFromPem(pem);
  const pub = ed25519.getPublicKey(seed);
  const sig = ed25519.sign(msg, seed);
  return { pubkey: "01" + Buffer.from(pub).toString("hex"), sig: "01" + Buffer.from(sig).toString("hex") };
}

/** Build the public_inputs (192 bytes: 6 field elements, LE) from snarkjs public signals. */
export function publicInputsLe(signals: readonly string[]): Buffer {
  return Buffer.concat(signals.slice(0, 6).map((s) => fieldToLe32(s)));
}

export type AttestResult = { deployHash: string; commitment: string; nullifier: string };

/**
 * Co-sign with the env quorum keys and submit the attest to the v4 registry, paid by
 * the coordinator key. Returns the deploy hash. proofBytes is stored on-chain (the
 * registry does not re-verify it at attest; the proof is verified off-chain first).
 */
export async function submitAttest(args: {
  holderHex: string;
  publicSignals: readonly string[];
  proofBytes: Buffer;
  expiry: number;
}): Promise<AttestResult> {
  const asset = process.env.ASSET_ID ?? "writ-bond-001";
  const commitment = fieldToLe32(args.publicSignals[1]);
  const nullifier = fieldToLe32(args.publicSignals[0]);
  const msg = canonicalMessage(asset, args.holderHex, commitment, nullifier, args.expiry);

  const q1 = process.env.QUORUM_KEY_1, q2 = process.env.QUORUM_KEY_2;
  const coordEnv = process.env.CASPER_COORDINATOR_KEY ?? q1;
  if (!q1 || !q2 || !coordEnv) throw new Error("server quorum keys not configured");
  const s1 = quorumSign(loadPem(q1), msg);
  const s2 = quorumSign(loadPem(q2), msg);
  const coordSeed = seedFromPem(loadPem(coordEnv));

  // Build + sign + submit the attest Deploy — pure Node (casper-js-sdk), no binary.
  const u8list = (buf: Buffer) => CLValueBuilder.list(Array.from(buf).map((b) => CLValueBuilder.u8(b)));
  const runtimeArgs = RuntimeArgs.fromMap({
    asset_id: CLValueBuilder.string(asset),
    holder: CLValueBuilder.key(new CLAccountHash(Uint8Array.from(Buffer.from(args.holderHex, "hex")))),
    commitment: CLValueBuilder.byteArray(Uint8Array.from(commitment)),
    nullifier: CLValueBuilder.byteArray(Uint8Array.from(nullifier)),
    expiry: CLValueBuilder.u64(args.expiry),
    proof: u8list(args.proofBytes),
    public_inputs: u8list(publicInputsLe(args.publicSignals)),
    signers: CLValueBuilder.list([CLPublicKey.fromHex(s1.pubkey), CLPublicKey.fromHex(s2.pubkey)]),
    signatures: CLValueBuilder.list([u8list(Buffer.from(s1.sig, "hex")), u8list(Buffer.from(s2.sig, "hex"))]),
  });
  const coordKp = Keys.Ed25519.parseKeyPair(ed25519.getPublicKey(coordSeed), coordSeed);
  const regHash = Uint8Array.from(Buffer.from(REGISTRY_PKG.replace(/^hash-/, ""), "hex"));
  const session = DeployUtil.ExecutableDeployItem.newStoredVersionContractByHash(regHash, null, "attest", runtimeArgs);
  let deploy = DeployUtil.makeDeploy(
    new DeployUtil.DeployParams(coordKp.publicKey, CHAIN), session, DeployUtil.standardPayment(90_000_000_000),
  );
  deploy = DeployUtil.signDeploy(deploy, coordKp);

  // Submit via plain JSON-RPC (casper-js-sdk's own RPC client is incompatible with the
  // Next server runtime; the Deploy construction above is what we need from it).
  const deployJson = DeployUtil.deployToJson(deploy);
  const res = await fetch(NODE, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "account_put_deploy", params: deployJson }),
  });
  const json = (await res.json()) as { result?: { deploy_hash?: string }; error?: { message?: string } };
  if (json.error) throw new Error(json.error.message ?? "put_deploy failed");
  const deployHash = json.result?.deploy_hash;
  if (!deployHash) throw new Error("no deploy hash from node");
  return { deployHash, commitment: commitment.toString("hex"), nullifier: nullifier.toString("hex") };
}

/** The stored proof placeholder (valid-format groth16 proof bytes). The visitor's
    proof is verified off-chain by snarkjs before this; the registry stores but does
    not re-verify the proof at attest. */
export async function placeholderProofBytes(): Promise<Buffer> {
  return readFile(join(process.cwd(), "public", "circuit", "proof.bin"));
}
