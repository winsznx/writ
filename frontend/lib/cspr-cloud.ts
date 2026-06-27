/*
  CSPR.cloud reader — SERVER-SIDE ONLY. The API key is read from the environment by
  the caller (the /api/registry route) and never reaches the browser. CSPR.cloud's
  CES-event endpoints are not indexed for this contract, so the live attribution
  trail + roster are derived from the deploys (top-level entrypoint calls) of the v3
  registry and challenge contracts — the same calls proven in DEPLOYMENT_v3.md.
*/

import { CONTRACTS, ASSET_ID } from "@/lib/chain";

const BASE = "https://api.testnet.cspr.cloud";

type CloudDeploy = {
  deploy_hash: string;
  entry_point_id: number;
  status: string;
  error_message: string | null;
  timestamp: string;
  caller_public_key?: string;
  args: Record<string, { parsed?: unknown }>;
};

export type TrailEvent = {
  readonly kind:
    | "ATTEST"
    | "REVOKE_SANCTIONS"
    | "OFFICER_FREEZE"
    | "OFFICER_UNFREEZE"
    | "OFFICER_REVOKE"
    | "OFFICER_REINSTATE"
    | "CHALLENGE"
    | "RESOLVE_FRAUD"
    | "BOND"
    | "OTHER";
  readonly entryPoint: string;
  readonly holder: string | null;
  readonly commitment: string | null;
  readonly at: string;
  readonly txHash: string;
  readonly ok: boolean;
};

export type RosterRow = {
  readonly commitment: string; // pseudonymous — never PII
  readonly holder: string;
  readonly status: "ACTIVE" | "REVOKED" | "REVOKED_FRAUD" | "FROZEN" | "EXPIRED" | "PENDING";
  readonly lastEvent: string;
  readonly at: string;
};

export type RegistryView = { readonly roster: readonly RosterRow[]; readonly trail: readonly TrailEvent[] };

async function cloud(path: string, key: string): Promise<{ data?: unknown[]; item_count?: number }> {
  const res = await fetch(`${BASE}${path}`, { headers: { Authorization: key }, cache: "no-store" });
  if (!res.ok) throw new Error(`CSPR.cloud ${path} -> ${res.status}`);
  return (await res.json()) as { data?: unknown[]; item_count?: number };
}

async function entryPointNames(contractHash: string, key: string): Promise<Map<number, string>> {
  const r = await cloud(`/contracts/${contractHash}/entry-points?page_size=100`, key);
  const m = new Map<number, string>();
  for (const e of (r.data ?? []) as { id: number; name: string }[]) m.set(e.id, e.name);
  return m;
}

async function allDeploys(pkg: string, key: string): Promise<CloudDeploy[]> {
  const out: CloudDeploy[] = [];
  for (let page = 1; page <= 5; page++) {
    const r = await cloud(`/deploys?contract_package_hash=${pkg}&page_size=100&page=${page}`, key);
    const data = (r.data ?? []) as CloudDeploy[];
    out.push(...data);
    if (data.length < 100) break;
  }
  return out;
}

function arg(d: CloudDeploy, name: string): string | null {
  const v = d.args?.[name]?.parsed;
  return typeof v === "string" ? v : null;
}

const ENTRY_TO_KIND: Record<string, TrailEvent["kind"]> = {
  attest: "ATTEST",
  revoke: "REVOKE_SANCTIONS",
  officer_freeze: "OFFICER_FREEZE",
  officer_unfreeze: "OFFICER_UNFREEZE",
  officer_revoke: "OFFICER_REVOKE",
  officer_reinstate: "OFFICER_REINSTATE",
  challenge: "CHALLENGE",
  resolve: "RESOLVE_FRAUD",
  bond: "BOND",
};

/** Replay a holder's status-changing events (latest wins). */
function statusFor(events: TrailEvent[]): RosterRow["status"] {
  let status: RosterRow["status"] = "PENDING";
  for (const e of events) {
    if (!e.ok) continue;
    switch (e.kind) {
      case "ATTEST":
      case "OFFICER_UNFREEZE":
      case "OFFICER_REINSTATE":
        status = "ACTIVE";
        break;
      case "REVOKE_SANCTIONS":
      case "OFFICER_REVOKE":
        status = "REVOKED";
        break;
      case "OFFICER_FREEZE":
      case "CHALLENGE":
        status = "FROZEN";
        break;
      case "RESOLVE_FRAUD":
        status = "REVOKED_FRAUD";
        break;
    }
  }
  return status;
}

/** Fetch the live registry view (roster + attribution trail) from CSPR.cloud. */
export async function fetchRegistryView(key: string): Promise<RegistryView> {
  const regHash = CONTRACTS.registry.contract.replace(/^hash-/, "");
  const regPkg = CONTRACTS.registry.pkg.replace(/^hash-/, "");
  const chalHash = CONTRACTS.challenge.contract.replace(/^hash-/, "");
  const chalPkg = CONTRACTS.challenge.pkg.replace(/^hash-/, "");

  const [regNames, chalNames, regDeploys, chalDeploys] = await Promise.all([
    entryPointNames(regHash, key),
    entryPointNames(chalHash, key),
    allDeploys(regPkg, key),
    allDeploys(chalPkg, key),
  ]);

  const toEvent = (d: CloudDeploy, names: Map<number, string>): TrailEvent => {
    const ep = names.get(d.entry_point_id) ?? `#${d.entry_point_id}`;
    return {
      kind: ENTRY_TO_KIND[ep] ?? "OTHER",
      entryPoint: ep,
      holder: arg(d, "holder"),
      commitment: arg(d, "commitment"),
      at: d.timestamp,
      txHash: d.deploy_hash,
      ok: d.status === "processed" && !d.error_message,
    };
  };

  const events = [
    ...regDeploys.map((d) => toEvent(d, regNames)),
    ...chalDeploys.map((d) => toEvent(d, chalNames)),
  ]
    .filter((e) => arg2(e))
    .sort((a, b) => a.at.localeCompare(b.at));

  // roster: one row per holder, current status replayed from its events
  const byHolder = new Map<string, TrailEvent[]>();
  for (const e of events) {
    if (!e.holder) continue;
    const list = byHolder.get(e.holder) ?? [];
    list.push(e);
    byHolder.set(e.holder, list);
  }
  const roster: RosterRow[] = [];
  for (const [holder, hes] of byHolder) {
    const commitment = hes.find((e) => e.commitment)?.commitment ?? holder;
    const last = hes[hes.length - 1];
    roster.push({
      commitment,
      holder,
      status: statusFor(hes),
      lastEvent: last.entryPoint,
      at: last.at,
    });
  }

  return { roster, trail: events.slice().reverse() };
}

// keep only asset-relevant events (drop unrelated deploys to the same contracts)
function arg2(e: TrailEvent): boolean {
  return e.kind !== "OTHER" || e.holder != null;
}

export const VIEW_ASSET = ASSET_ID;
