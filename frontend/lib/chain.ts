/*
  Live Casper testnet deployment — the canonical Writ V4 system (THE demo instance).
  Fresh registry whose quorum keys are server-held testnet-only demo keys (so any
  visitor can self-onboard via /api/onboard). Verifier reused from v3. Addresses from
  internal/v4-keys/manifest_v4.json (put-deploy). Package hash = stable address;
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
    pkg: "hash-2bc9a8556c75ee912bab4f7d2cf2622863d1f1e29eb5cf68685a52d6a718ff61",
    contract: "hash-c99e443ff8cdc6164c863d5f11d88aa309bc105a69d2037bfb7cbfe9dbbb076b",
  },
  registry: {
    pkg: "hash-2e19e2bfc5383fd51103ee54fb430b53ec7a1a63c83a7841e08f00b188653fca",
    contract: "hash-a0f8ddec0ce5aa23a12a15059f11e4e76b6a785511402ed3e5478b61a04112d2",
  },
  challenge: {
    pkg: "hash-c1080d67eed0c4945eadd84bc016d3b183a650086e39de60fb9c96cfe59dda34",
    contract: "hash-8bbbce35c98c1cfc6939001642a76ce8f9a23a6d4d5c7799a519039d263c13f4",
  },
  filter: {
    pkg: "hash-d84a932187624c1c982ed5c6dcbd1961fe370f732ce02fcbc0fe3e5e28389726",
    contract: "hash-a2cc8c3da4a61dd997b5191121f48f8617c5bc368144cb374827553bfbdaf933",
  },
  filterToken: {
    pkg: "hash-406e90f7646576e2eb252fe1ce5144823c12b09bfe4c21cede18f9333c5f6d8e",
    contract: "hash-957deb64d7b194f7ec257b3fed25eeb4eb49fd8c5b989be9543c4306d460727e",
  },
  cep78: {
    pkg: "hash-ad407c6bccbfc13e9fef28a03b75b175b0d186d3205952be684934c8dcb59bbe",
    contract: "hash-9fa2af90a582650b338947909100c085f24da6411b3f686a0b24ab9bbde3906a",
  },
  token: {
    pkg: "hash-512068de722212ce497cb081049649339f0a8994394328164f3dde52c4ab8a3e",
    contract: "hash-18eb2187587b3022e9dbdf5884fa30b44426bef2b5adca58ee6e56f5e8761f13",
  },
} as const;

/** Officer/coordinator = the server-held demo deployer key (testnet-only throwaway). */
export const OFFICER_MULTISIG =
  "account-hash-8580ff20c447444a38539c8ea92c9392e6240c0d4b8aee0264188ca09ebab6a4";

export const DEPLOYER =
  "account-hash-8580ff20c447444a38539c8ea92c9392e6240c0d4b8aee0264188ca09ebab6a4";

/** The pre-staged regulated demo holder R, attested on v4 with the REAL eligibility
    commitment (Poseidon output of the proven circuit). The regulator surface verifies
    a disclosed preimage by recomputing Poseidon and matching this exact on-chain value. */
export const REGULATED_HOLDER = {
  holder: "account-hash-1234123412341234123412341234123412341234123412341234123412341234",
  commitment: "0x213df7cd6dde3ed3bdbb4523865a1b50939ef70e876fc7116e67cee535b6e0ac",
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
