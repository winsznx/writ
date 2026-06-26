"use client";

import { useState } from "react";
import { Button, Card, Mono } from "@/components/ui";
import { cn } from "@/lib/cn";

type Verdict = "idle" | "verifying" | "valid";

export function RegulatorDisclosure() {
  const [holder, setHolder] = useState("0x7a3f…91c4");
  const [fact, setFact] = useState("eligible");
  const [time, setTime] = useState("2026-06-20");
  const [verdict, setVerdict] = useState<Verdict>("idle");

  function verify() {
    setVerdict("verifying");
    setTimeout(() => setVerdict("valid"), 900);
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
                  "bg-active-subtle text-active",
                )}
              >
                <span className="font-semibold">Proof valid</span>
                <span aria-hidden className="text-lg">✓</span>
              </div>
              <dl className="space-y-2 text-sm">
                <Row term="Holder"><Mono>{holder}</Mono></Row>
                <Row term="Claim">
                  {fact === "eligible" ? "Eligible" : fact === "accredited" ? "Accredited" : "Not sanctioned"} at {time}
                </Row>
                <Row term="Commitment"><Mono>0x4f2a…c19b</Mono></Row>
              </dl>
              <p className="text-xs leading-relaxed text-ink-subtle">
                Verified against the on-chain commitment. Nothing else about this holder, or any
                other holder, was revealed.
              </p>
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
