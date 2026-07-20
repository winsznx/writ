import type { Metadata } from "next";
import { Card, Mono, PageHeader, SectionHeading, StatTile } from "@/components/ui";
import { StatusBadge, type CredentialStatus } from "@/components/status-badge";
import { CONTRACTS, ASSET_ID, deployUrl, deployTxUrl } from "@/lib/chain";
import { fetchRegistryView, type RosterRow, type TrailEvent } from "@/lib/cspr-cloud";

export const metadata: Metadata = { title: "Issuer" };
export const dynamic = "force-dynamic";

const cep78Short = `${CONTRACTS.cep78.contract.slice(0, 10)}…${CONTRACTS.cep78.contract.slice(-4)}`;

const NO_CURATION = { hiddenJunkEvents: 0, hiddenRevertedEvents: 0, hiddenPendingHolders: 0 };

async function getView() {
  const key = process.env.CSPR_CLOUD_KEY;
  if (!key) {
    return { error: "CSPR_CLOUD_KEY not set in frontend/.env.local", roster: [], trail: [], curation: NO_CURATION };
  }
  try {
    const v = await fetchRegistryView(key);
    return { error: null as string | null, roster: v.roster, trail: v.trail, curation: v.curation };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "live read failed", roster: [], trail: [], curation: NO_CURATION };
  }
}

export default async function IssuerDashboard() {
  const { error, roster, trail, curation } = await getView();
  const hiddenTotal = curation.hiddenJunkEvents + curation.hiddenRevertedEvents + curation.hiddenPendingHolders;

  return (
    <div className="space-y-10">
      <PageHeader
        eyebrow="Compliance control room"
        title="Issuer control room"
        description="A compliant holder book with zero investor PII on screen — only credential status and pseudonymous commitments, read live from the on-chain registry."
        actions={
          <span className="inline-flex items-center gap-2 rounded-full border border-active/20 bg-active-subtle px-3 py-1.5 text-xs font-medium text-active">
            <span aria-hidden className="h-1.5 w-1.5 animate-pulse rounded-full bg-active" />
            Live · CSPR.cloud
          </span>
        }
      />

      {error && (
        <p className="rounded-lg border border-enforce-border bg-enforce-subtle px-4 py-3 text-sm text-enforce">
          Live registry read unavailable: {error}
        </p>
      )}

      {/* Asset overview */}
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Asset (demo)" value="writ-rwa-bond-v4" sub={ASSET_ID} />
        <StatTile label="Standard" value="Real CEP-78" sub="recipient-aware filter" />
        <StatTile label="Credentialed" value={String(roster.length)} sub="live holders" />
        <StatTile label="NFT contract" value={cep78Short} sub="testnet.cspr.live" mono href={deployUrl(CONTRACTS.cep78.pkg)} />
      </section>

      {/* Holder roster — live */}
      <section>
        <SectionHeading
          title="Holder roster"
          note={`Live · commitments only, no identities${hiddenTotal > 0 ? ` · curation disclosed: ${curation.hiddenJunkEvents} staging events, ${curation.hiddenRevertedEvents} reverted events, ${curation.hiddenPendingHolders} incomplete holders hidden (full set on cspr.live)` : ""}`}
        />
        <Card className="mt-4 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-[0.06em] text-ink-subtle">
                  <th className="px-4 py-3 font-medium">Holder commitment</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Last action</th>
                  <th className="px-4 py-3 font-medium">Updated</th>
                </tr>
              </thead>
              <tbody>
                {roster.map((h) => (
                  <tr key={h.holder} className="border-b border-border last:border-0">
                    <td className="px-4 py-3"><Mono>{shortCommit(h.commitment)}</Mono></td>
                    <td className="px-4 py-3"><RosterStatus status={h.status} /></td>
                    <td className="px-4 py-3 text-ink-muted">
                      <a href={deployTxUrl(h.txHash)} target="_blank" rel="noreferrer"
                         className="underline decoration-dotted underline-offset-2 hover:text-brand">
                        {h.lastEvent} ↗
                      </a>
                    </td>
                    <td className="px-4 py-3 text-ink-subtle">{h.at.slice(0, 19).replace("T", " ")} UTC</td>
                  </tr>
                ))}
                {roster.length === 0 && !error && (
                  <tr><td colSpan={4} className="px-4 py-6 text-center text-ink-subtle">No credentials on-chain yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section>
          <SectionHeading title="Rule set" note="From the deployed circuit + registry config" />
          <Card className="mt-4 p-5">
            <dl className="space-y-3 text-sm">
              <Row term="Eligibility predicate"><Mono>accredited ∧ jurisdiction ∈ allowed-set ∧ ¬sanctioned</Mono></Row>
              <Row term="Credential expiry">enforced on-chain per credential (registry rejects expired)</Row>
              <Row term="Attestation">2 signatures, server-held demo keys — single trust domain; registry verifies 2-of-3 on-chain</Row>
              <Row term="Issuer">demo issuer (no external KYC integrated)</Row>
            </dl>
          </Card>
        </section>
        <section>
          <SectionHeading title="Sanctions screening" note="Honest scope — no background daemon" />
          <Card className="mt-4 p-5">
            <dl className="space-y-3 text-sm">
              <Row term="When">at onboarding / refresh only (no scheduled sweep)</Row>
              <Row term="Live source">OFAC SDN digital-currency list (ETH addresses), fetched with content-hash + timestamp</Row>
              <Row term="Casper mapping">labeled demo denylist — illustrative</Row>
              <Row term="Unavailable data">refuses attestation (fail-closed)</Row>
            </dl>
          </Card>
        </section>
      </div>

      {/* Officer actions */}
      <section>
        <SectionHeading title="Officer actions" note="Demo UI — buttons not wired; on-chain path is real" />
        <Card className="mt-4 flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-ink-muted">
            The registry&apos;s officer entrypoints (freeze / revoke / reinstate) are live on-chain and
            exercised by real testnet transactions. The officer role is held by a single demo key
            — not a multisig — and these buttons are illustrative, not wired to a signer.
          </p>
          <div className="flex flex-wrap gap-2">
            <ActionChip>Freeze</ActionChip>
            <ActionChip>Revoke</ActionChip>
            <ActionChip>Override</ActionChip>
          </div>
        </Card>
      </section>

      {/* Attribution trail — live */}
      <section>
        <SectionHeading title="Attribution trail" note="Live · on-chain events" />
        <Card className="mt-4 divide-y divide-border">
          {trail.map((e) => (
            <div key={e.txHash} className="flex flex-col gap-1 px-5 py-3.5 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <EventTag kind={e.kind} />
                <span className="text-sm text-ink">{detailOf(e)}</span>
              </div>
              <div className="flex items-center gap-3 text-xs text-ink-subtle">
                <a href={deployTxUrl(e.txHash)} target="_blank" rel="noreferrer" className="hover:text-brand">
                  <Mono>{e.txHash.slice(0, 8)}…</Mono>
                </a>
                <span>{e.at.slice(0, 19).replace("T", " ")} UTC</span>
                {!e.ok && <span className="text-enforce">reverted</span>}
              </div>
            </div>
          ))}
          {trail.length === 0 && (
            <div className="px-5 py-6 text-center text-sm text-ink-subtle">No on-chain events yet.</div>
          )}
        </Card>
      </section>
    </div>
  );
}

function shortCommit(c: string): string {
  const hex = c.startsWith("account-hash-") ? c.replace("account-hash-", "0x") : "0x" + c.replace(/^0x/, "");
  return `${hex.slice(0, 10)}…${hex.slice(-4)}`;
}

function detailOf(e: TrailEvent): string {
  const who = e.holder ? shortCommit(e.holder) : "attestor";
  switch (e.kind) {
    case "ATTEST": return `${who} attested ACTIVE by quorum`;
    case "REVOKE_SANCTIONS": return `${who} revoked — sanctions match`;
    case "OFFICER_FREEZE": return `${who} frozen by officer`;
    case "OFFICER_UNFREEZE": return `${who} unfrozen by officer`;
    case "OFFICER_REVOKE": return `${who} revoked by officer`;
    case "OFFICER_REINSTATE": return `${who} reinstated by officer`;
    case "CHALLENGE": return `${who} challenged — credential frozen`;
    case "RESOLVE_FRAUD": return `${who} resolved FRAUD → RevokedFraud + slash`;
    case "BOND": return `attestor bond posted`;
    default: return e.entryPoint;
  }
}

function RosterStatus({ status }: { status: RosterRow["status"] }) {
  if (status === "REVOKED_FRAUD") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-md bg-enforce-subtle px-2 py-0.5 text-xs font-semibold text-enforce">
        <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-enforce" /> REVOKED · FRAUD
      </span>
    );
  }
  return <StatusBadge status={status as CredentialStatus} />;
}

function Row({ term, children }: { term: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <dt className="text-ink-subtle">{term}</dt>
      <dd className="text-right text-ink">{children}</dd>
    </div>
  );
}

function ActionChip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md border border-border-strong bg-surface px-3 py-1.5 text-sm font-medium text-ink-muted">
      <span aria-hidden className="text-ink-subtle">🔒</span>
      {children}
    </span>
  );
}

const EVENT_STYLES: Record<string, string> = {
  ATTEST: "bg-brand-subtle text-brand",
  REVOKE_SANCTIONS: "bg-enforce-subtle text-enforce",
  OFFICER_FREEZE: "bg-pending-subtle text-pending",
  OFFICER_UNFREEZE: "bg-active-subtle text-active",
  OFFICER_REVOKE: "bg-enforce-subtle text-enforce",
  OFFICER_REINSTATE: "bg-active-subtle text-active",
  CHALLENGE: "bg-pending-subtle text-pending",
  RESOLVE_FRAUD: "bg-enforce-subtle text-enforce",
  BOND: "bg-neutral-subtle text-neutral",
};

function EventTag({ kind }: { kind: string }) {
  return (
    <span className={`shrink-0 rounded px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wide ${EVENT_STYLES[kind] ?? "bg-neutral-subtle text-neutral"}`}>
      {kind.replace(/_/g, " ")}
    </span>
  );
}
