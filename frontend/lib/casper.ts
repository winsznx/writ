/*
  Casper write path — build the SAME entrypoint args proven live on v3 (see
  scripts/deploy/*.py), have the connected wallet sign them, and submit to the node.

  The arg builders are pure data and match the args used in the proven on-chain runs
  byte-for-byte. The SIGNING step is delegated to a WalletSigner (CSPR.click / Casper
  Wallet) — that is the only browser-gated piece; everything else is deterministic.
*/

import { CHAIN, CONTRACTS, ASSET_ID } from "@/lib/chain";

export type NamedArg = { readonly name: string; readonly type: unknown; readonly value: unknown };

/** A connected Casper wallet able to sign a built deploy. Implemented by the
    CSPR.click connector in the browser; kept as an interface so the rest of the
    write path is testable without a wallet present. */
export interface WalletSigner {
  readonly publicKeyHex: string;
  /** Sign a JSON deploy and return the signed deploy ready to send. */
  signDeploy(deployJson: unknown): Promise<unknown>;
}

export type WriteCall = {
  readonly contract: string; // package hash
  readonly entryPoint: string;
  readonly args: readonly NamedArg[];
  readonly paymentMotes: string;
};

// ---- entrypoint arg builders (mirror the proven scripts/deploy calls) ----

/** attest(asset, holder, commitment, nullifier, expiry, proof, public_inputs, signers, signatures) */
export function buildAttest(p: {
  holder: string;
  commitmentHex: string;
  nullifierHex: string;
  expiry: number;
  proofHex: string;
  publicInputsHex: string;
  signers: readonly string[];
  signatures: readonly string[];
}): WriteCall {
  return {
    contract: CONTRACTS.registry.pkg,
    entryPoint: "attest",
    args: [
      { name: "asset_id", type: "String", value: ASSET_ID },
      { name: "holder", type: "Key", value: p.holder },
      { name: "commitment", type: { ByteArray: 32 }, value: p.commitmentHex },
      { name: "nullifier", type: { ByteArray: 32 }, value: p.nullifierHex },
      { name: "expiry", type: "U64", value: p.expiry },
      { name: "proof", type: { List: "U8" }, value: p.proofHex },
      { name: "public_inputs", type: { List: "U8" }, value: p.publicInputsHex },
      { name: "signers", type: { List: "PublicKey" }, value: p.signers },
      { name: "signatures", type: { List: { List: "U8" } }, value: p.signatures },
    ],
    paymentMotes: "90000000000",
  };
}

/** CEP-78 transfer(token_id, source_key, target_key) — gated by the recipient-aware filter. */
export function buildNftTransfer(p: { tokenId: number; from: string; to: string }): WriteCall {
  return {
    contract: CONTRACTS.cep78.pkg,
    entryPoint: "transfer",
    args: [
      { name: "token_id", type: "U64", value: p.tokenId },
      { name: "source_key", type: "Key", value: p.from },
      { name: "target_key", type: "Key", value: p.to },
    ],
    paymentMotes: "30000000000",
  };
}

/** revoke(asset, holder) — OFAC/sanctions revoke (QUORUM or OFFICER). */
export function buildRevoke(holder: string): WriteCall {
  return {
    contract: CONTRACTS.registry.pkg,
    entryPoint: "revoke",
    args: [
      { name: "asset_id", type: "String", value: ASSET_ID },
      { name: "holder", type: "Key", value: holder },
    ],
    paymentMotes: "12000000000",
  };
}

/** officer_freeze/unfreeze/revoke/reinstate(asset, holder, reason_hash) — OFFICER multisig. */
export function buildOfficerAction(
  action: "officer_freeze" | "officer_unfreeze" | "officer_revoke" | "officer_reinstate",
  holder: string,
  reasonHash: string,
): WriteCall {
  return {
    contract: CONTRACTS.registry.pkg,
    entryPoint: action,
    args: [
      { name: "asset_id", type: "String", value: ASSET_ID },
      { name: "holder", type: "Key", value: holder },
      { name: "reason_hash", type: { ByteArray: 32 }, value: reasonHash },
    ],
    paymentMotes: "12000000000",
  };
}

/** Submit an already-signed deploy to the node RPC; returns the deploy hash. */
export async function sendSignedDeploy(signedDeploy: unknown): Promise<string> {
  const res = await fetch(CHAIN.node, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "account_put_deploy", params: [signedDeploy] }),
  });
  const json = (await res.json()) as { result?: { deploy_hash?: string }; error?: { message?: string } };
  if (json.error) throw new Error(json.error.message ?? "put_deploy failed");
  if (!json.result?.deploy_hash) throw new Error("no deploy_hash in response");
  return json.result.deploy_hash;
}
