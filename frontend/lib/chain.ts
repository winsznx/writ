/*
  Live Casper testnet deployment — the canonical Writ V5 system (THE demo instance).
  Fresh registry whose quorum keys are server-held testnet-only demo keys (so any
  visitor can self-onboard via /api/onboard). V5 deploys the hardened verifier (checked deserialization) and pins the canonical
  public inputs (issuer key + jurisdiction root) on-chain via set_canonical_inputs.
  Addresses from internal/v5-keys/manifest_v5.json (put-deploy). Package hash = stable address;
  contract hash = active version. Source of truth that replaces the scaffold mocks.
*/

export const CHAIN = {
  name: "casper-test",
  node: "https://node.testnet.casper.network/rpc",
  events: "https://node.testnet.casper.network/events/main",
  explorer: "https://testnet.cspr.live",
} as const;

export const ASSET_ID = "writ-bond-001";

type ContractRef = { readonly pkg: string; readonly contract: string };

/** Canonical V4 contract set. */
export const CONTRACTS: Record<
  "verifier" | "registry" | "challenge" | "filter" | "filterToken" | "cep78" | "token",
  ContractRef
> = {
  verifier: {
    pkg: "hash-1785d5a368b2daa41c490dd83059d8ba8a62631b6112f5fed19e693c82d1d0fd",
    contract: "hash-e501ca714ece7e9818e861f901c1dd29975bb9ea49f1aa88b0782ea0ddd9caf9",
  },
  registry: {
    pkg: "hash-74148da7b68ce51e4dfa822af7106daaea7140862106a7b675057caf9ee404ce",
    contract: "hash-4169e95d290b5c80134994ff5e85b8eb335b2df8942ec3ebcb1ec5530ed1ce05",
  },
  challenge: {
    pkg: "hash-8cddad302d2d882070d62f581e6118ab371a24ced22294b81454754c2a5fd07e",
    contract: "hash-14ce5c4c13e307f3be4f2588f283c7cf42864a7a548b7e6a09154a70e6f21b0a",
  },
  filter: {
    pkg: "hash-0b1f806b13712752c6740890cb9fae33aa782d47b1c858564d97248c43407fb5",
    contract: "hash-5254fa90d7fae22ae427f96a458370074a55fe86ce15d15810562ffea459a047",
  },
  filterToken: {
    pkg: "hash-30cca9f1242679e7396b9a39ad2c087c7a30b1b4848cfb2324bbd4034976d469",
    contract: "hash-f8c6f324fe5a0407aef252f25da54868066d40e12f689d59a0d7a5d7f656b4e2",
  },
  cep78: {
    pkg: "hash-2ce2ff55ebdeb1e72b85dc0634c77ff7a256fb98086fab6d2969af78386e7c97",
    contract: "hash-cfec210f12199b74ecd2ad7bb0847db00aa4d2f745c478f825996472d83879b5",
  },
  token: {
    pkg: "hash-200cd1830a58a5e6154bf2ab31168523d7e90fe06d166fd9650712aa120c4e1b",
    contract: "hash-d6bd8dd3b918c04d304aa5f424a4b93b9fffe1c44263df76449f8e77f901d8f5",
  },
} as const;

/** Officer/coordinator = the server-held demo deployer key (testnet-only throwaway). */
export const OFFICER_MULTISIG =
  "account-hash-8580ff20c447444a38539c8ea92c9392e6240c0d4b8aee0264188ca09ebab6a4";

export const DEPLOYER =
  "account-hash-8580ff20c447444a38539c8ea92c9392e6240c0d4b8aee0264188ca09ebab6a4";

/** The regulated demo holder R — a real Active v4 credential attested with the REAL
    eligibility commitment (Poseidon output of the proven circuit; on-chain ByteArray =
    little-endian of this field). The regulator surface verifies a disclosed preimage by
    recomputing Poseidon and matching this exact on-chain value. */
export const REGULATED_HOLDER = {
  holder: "account-hash-88e898ecd83ebbdbf433c5f383201fc9f3f543aea89310a853888314f0cdb302",
  commitment: "0x02279cc98f1b933e33ec83b0da410fe85f64b9d088c4f097b08e75d63cc69125",
} as const;

export function deployUrl(contractOrPkgHash: string): string {
  return `${CHAIN.explorer}/contract-package/${contractOrPkgHash.replace(/^hash-/, "")}`;
}

export function accountUrl(accountHash: string): string {
  return `${CHAIN.explorer}/account/${accountHash.replace(/^account-hash-/, "")}`;
}

export function deployTxUrl(deployHash: string): string {
  return `${CHAIN.explorer}/deploy/${deployHash}`;
}
