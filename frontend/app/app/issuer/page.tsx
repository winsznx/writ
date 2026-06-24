import type { Metadata } from "next";
import { Card, Mono } from "@/components/ui";
import { StatusBadge } from "@/components/status-badge";
import {
  ASSET,
  AUDIT_TRAIL,
  HOLDERS,
  RE_SCREEN,
  RULE_SET,
} from "@/lib/mocks";

export const metadata: Metadata = { title: "Issuer" };

export default function IssuerDashboard() {
  return (
    <div className="space-y-10">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-ink">Issuer control room</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-muted">
          A compliant holder book with zero investor PII on screen — only credential status and
          pseudonymous nullifiers.
        </p>
      </header>

      {/* Asset overview */}
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "Asset", value: ASSET.name, sub: ASSET.symbol },
          { label: "Supply", value: ASSET.supply, sub: ASSET.standard },
          { label: "Holders", value: String(ASSET.holders), sub: "credentialed" },
          { label: "Contract", value: ASSET.contract, sub: "testnet.cspr.live", mono: true },
        ].map((tile) => (
          <Card key={tile.label} className="p-5">
            <p className="text-xs font-medium uppercase tracking-[0.08em] text-ink-subtle">
              {tile.label}
            </p>
            <p className={`mt-2 truncate text-lg font-semibold text-ink ${tile.mono ? "font-mono text-base" : ""}`}>
              {tile.value}
            </p>
            <p className="mt-0.5 truncate text-xs text-ink-subtle">{tile.sub}</p>
          </Card>
        ))}
      </section>

      {/* Holder roster */}
      <section>
        <SectionHeading
          title="Holder roster"
          note="No identities — status & nullifier only"
        />
        <Card className="mt-4 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-[0.06em] text-ink-subtle">
                  <th className="px-4 py-3 font-medium">Holder</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Jurisdiction</th>
                  <th className="px-4 py-3 font-medium">Credential expiry</th>
                  <th className="px-4 py-3 font-medium">Last re-screen</th>
                </tr>
              </thead>
              <tbody>
                {HOLDERS.map((h) => (
                  <tr key={h.nullifier} className="border-b border-border last:border-0">
                    <td className="px-4 py-3"><Mono>{h.nullifier}</Mono></td>
                    <td className="px-4 py-3"><StatusBadge status={h.status} /></td>
                    <td className="px-4 py-3 text-ink-muted">{h.jurisdiction}</td>
                    <td className="px-4 py-3 text-ink-muted">{h.credentialExpiry}</td>
                    <td className="px-4 py-3 text-ink-subtle">{h.lastReScreen}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Rule set */}
        <section>
          <SectionHeading title="Rule set" note="Officer-gated edit" />
          <Card className="mt-4 p-5">
            <dl className="space-y-3 text-sm">
              <Row term="Eligibility predicate"><Mono>{RULE_SET.predicate}</Mono></Row>
              <Row term="Freshness window">{RULE_SET.freshnessWindow}</Row>
              <Row term="Verification quorum">{RULE_SET.quorum}</Row>
              <Row term="Re-screen cadence">{RULE_SET.reScreenCadence}</Row>
            </dl>
          </Card>
        </section>

        {/* Re-screen status */}
        <section>
          <SectionHeading title="Re-screen status" />
          <Card className="mt-4 p-5">
            <dl className="space-y-3 text-sm">
              <Row term="Last sweep">{RE_SCREEN.lastSweep}</Row>
              <Row term="Freshness">{RE_SCREEN.freshness}</Row>
              <Row term="Open flags">
                <span className="font-medium text-pending">{RE_SCREEN.flags}</span>
              </Row>
              <Row term="Quorum health">{RE_SCREEN.quorumHealth}</Row>
            </dl>
          </Card>
        </section>
      </div>

      {/* Officer actions */}
      <section>
        <SectionHeading title="Officer actions" note="Each requires an M-of-N officer key" />
        <Card className="mt-4 flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-ink-muted">
            Freeze, revoke, or override a credential. Every action is multisig-gated, logged
            on-chain, and requires a reason.
          </p>
          <div className="flex flex-wrap gap-2">
            <ActionChip>Freeze</ActionChip>
            <ActionChip>Revoke</ActionChip>
            <ActionChip>Override</ActionChip>
          </div>
        </Card>
      </section>

      {/* Audit trail */}
      <section>
        <SectionHeading title="Audit trail" note="On-chain-anchored · exportable" />
        <Card className="mt-4 divide-y divide-border">
          {AUDIT_TRAIL.map((e) => (
            <div key={e.id} className="flex flex-col gap-1 px-5 py-3.5 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <EventTag kind={e.kind} />
                <span className="text-sm text-ink">{e.detail}</span>
              </div>
              <div className="flex items-center gap-3 text-xs text-ink-subtle">
                <Mono>{e.txHash}</Mono>
                <span>{e.at}</span>
              </div>
            </div>
          ))}
        </Card>
      </section>
    </div>
  );
}

function SectionHeading({ title, note }: { title: string; note?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <h2 className="text-base font-semibold text-ink">{title}</h2>
      {note ? <span className="text-xs text-ink-subtle">{note}</span> : null}
    </div>
  );
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
  TRANSFER_DENY: "bg-enforce-subtle text-enforce",
  REVOKE: "bg-enforce-subtle text-enforce",
  FREEZE: "bg-enforce-subtle text-enforce",
  TRANSFER_OK: "bg-active-subtle text-active",
  ATTEST: "bg-brand-subtle text-brand",
  CHALLENGE: "bg-pending-subtle text-pending",
};

function EventTag({ kind }: { kind: string }) {
  return (
    <span
      className={`shrink-0 rounded px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wide ${EVENT_STYLES[kind] ?? "bg-neutral-subtle text-neutral"}`}
    >
      {kind.replace("_", " ")}
    </span>
  );
}
