"use client";

import { useState } from "react";
import { Button, Card, Mono } from "@/components/ui";
import { cn } from "@/lib/cn";
import { CONTRACTS, REGULATED_HOLDER, deployUrl, deployTxUrl } from "@/lib/chain";
import { verifyDisclosure, type DisclosedClaims } from "@/lib/disclosure";
import { loadSampleInput } from "@/lib/prove";
import type { TrailEvent } from "@/lib/cspr-cloud";

const COMMITMENT_SHORT = `${REGULATED_HOLDER.commitment.slice(0, 8)}…${REGULATED_HOLDER.commitment.slice(-4)}`;

type Verdict = "idle" | "verifying" | "valid" | "invalid";

export function RegulatorDisclosure() {
  const [holder, setHolder] = useState("0x7a3f…91c4");
  const [fact, setFact] = useState("eligible");
  const [time, setTime] = useState("2026-06-20");
  const [verdict, setVerdict] = useState<Verdict>("idle");
  const [trail, setTrail] = useState<TrailEvent[]>([]);

  // Real client-side verify: recompute Poseidon(disclosed claims) and check it against
  // the credential's REAL on-chain commitment (lib/chain.ts). For the walkthrough the
  // disclosed preimage is the proven eligible holder; "sanctioned" tampers one claim so
  // the mismatch path is demonstrable too.
  async function verify(): Promise<void> {
    setVerdict("verifying");
    try {
      const input = await loadSampleInput();
      const claims: DisclosedClaims = {
        accredited: String(input.accredited),
        jurisdictionCode: String(input.jurisdictionCode),
        sanctioned: fact === "unsanctioned" ? "1" : String(input.sanctioned),
        identitySecret: String(input.identitySecret),
        salt: String(input.salt),
      };
      const ok = await verifyDisclosure(claims, REGULATED_HOLDER.commitment);
      setVerdict(ok ? "valid" : "invalid");
      // pull the holder's REAL on-chain attribution trail (via our server endpoint)
      try {
        const res = await fetch("/api/registry", { cache: "no-store" });
        const view = (await res.json()) as { trail?: TrailEvent[] };
        setTrail((view.trail ?? []).filter((e) => e.holder === REGULATED_HOLDER.holder));
      } catch {
        setTrail([]);
      }
    } catch {
      setVerdict("invalid");
    }
  }

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-ink">Disclosure & verification</h1>
        <p className="mt-2 max-w-xl text-sm leading-relaxed text-ink-muted">
          Verify a single compliance fact against the on-chain commitment, without exposing the
          rest of the book.
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
        <Card className="p-6">
          <h2 className="text-base font-semibold text-ink">Request a disclosure</h2>
          <div className="mt-5 space-y-4">
            <Field label="Holder">
              <select
                value={holder}
                onChange={(e) => { setHolder(e.target.value); setVerdict("idle"); }}
                className="w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-sm font-mono text-ink"
              >
                <option>0x7a3f…91c4</option>
                <option>0x2c81…44de</option>
                <option>0x9f0b…a3e1</option>
              </select>
            </Field>
            <Field label="Fact">
              <select
                value={fact}
                onChange={(e) => { setFact(e.target.value); setVerdict("idle"); }}
                className="w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-sm text-ink"
              >
                <option value="eligible">Was eligible</option>
                <option value="accredited">Was accredited</option>
                <option value="unsanctioned">Was not sanctioned</option>
              </select>
            </Field>
            <Field label="At time">
              <input
                type="date"
                value={time}
                onChange={(e) => { setTime(e.target.value); setVerdict("idle"); }}
                className="w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-sm text-ink"
              />
            </Field>
            <Button className="w-full" onClick={verify} disabled={verdict === "verifying"}>
              {verdict === "verifying" ? "Verifying proof…" : "Verify against commitment"}
            </Button>
          </div>
        </Card>

        <Card className="p-6">
          <h2 className="text-base font-semibold text-ink">Verdict</h2>
          {verdict === "idle" || verdict === "verifying" ? (
            <div className="mt-5 rounded-lg border border-dashed border-border bg-canvas px-5 py-10 text-center text-sm text-ink-subtle">
              {verdict === "verifying"
                ? "Checking selective-disclosure proof…"
                : "Submit a request to see a verdict."}
            </div>
          ) : (
            <div className="mt-5 space-y-4">
              <div
                className={cn(
                  "flex items-center justify-between rounded-lg px-4 py-3",
                  verdict === "valid" ? "bg-active-subtle text-active" : "bg-enforce-subtle text-enforce",
                )}
              >
                <span className="font-semibold">
                  {verdict === "valid" ? "Commitment verified" : "Commitment mismatch"}
                </span>
                <span aria-hidden className="text-lg">{verdict === "valid" ? "✓" : "✗"}</span>
              </div>
              <dl className="space-y-2 text-sm">
                <Row term="Holder"><Mono>{holder}</Mono></Row>
                <Row term="Claim">
                  {fact === "eligible" ? "Eligible" : fact === "accredited" ? "Accredited" : "Not sanctioned"} at {time}
                </Row>
                <Row term="Commitment">
                  <a
                    href={deployUrl(CONTRACTS.registry.contract)}
                    target="_blank"
                    rel="noreferrer"
                    className="underline decoration-dotted underline-offset-2 hover:text-active"
                  >
                    <Mono>{COMMITMENT_SHORT}</Mono>
                  </a>
                </Row>
              </dl>
              <p className="text-xs leading-relaxed text-ink-subtle">
                Verified against the on-chain commitment. Nothing else about this holder, or any
                other holder, was revealed.
              </p>
              {verdict === "valid" && trail.length > 0 && (
                <div className="space-y-1.5 border-t border-border pt-3">
                  <p className="text-xs font-medium uppercase tracking-[0.08em] text-ink-subtle">
                    On-chain attribution trail
                  </p>
                  {trail.map((e) => (
                    <div key={e.txHash} className="flex items-center justify-between gap-3 text-xs">
                      <span className="font-mono text-[10px] font-semibold uppercase tracking-wide text-ink-muted">
                        {e.kind.replace(/_/g, " ")}
                      </span>
                      <a
                        href={deployTxUrl(e.txHash)}
                        target="_blank"
                        rel="noreferrer"
                        className="text-ink-subtle hover:text-active"
                      >
                        {e.at.slice(0, 10)} ↗
                      </a>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium uppercase tracking-[0.08em] text-ink-subtle">
        {label}
      </span>
      {children}
    </label>
  );
}

function Row({ term, children }: { term: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="text-ink-subtle">{term}</dt>
      <dd className="text-ink">{children}</dd>
    </div>
  );
}
