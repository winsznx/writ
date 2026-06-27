"use client";

import { useState } from "react";
import { Button, Card, Mono } from "@/components/ui";
import { StatusBadge } from "@/components/status-badge";
import { PROVING_STEPS } from "@/lib/mocks";
import { cn } from "@/lib/cn";
import {
  generateEligibilityProof,
  loadSampleInput,
  commitmentToHex,
  type ProofResult,
} from "@/lib/prove";

export function InvestorProving() {
  const [step, setStep] = useState(0);
  const [proving, setProving] = useState(false);
  const [proof, setProof] = useState<ProofResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const total = PROVING_STEPS.length;
  const done = step >= total - 1;
  const onProveStep = PROVING_STEPS[step]?.key === "prove";

  async function runProof(): Promise<void> {
    setProving(true);
    setError(null);
    try {
      const input = await loadSampleInput();
      const result = await generateEligibilityProof(input);
      setProof(result);
      setStep((s) => Math.min(total - 1, s + 1));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setProving(false);
    }
  }

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-ink">Prove eligibility</h1>
        <p className="mt-2 max-w-xl text-sm leading-relaxed text-ink-muted">
          Prove you&apos;re eligible to hold the asset without uploading a single document.
          Your claims are proven in zero-knowledge. They never leave your device.
        </p>
      </header>

      <div className="grid gap-8 lg:grid-cols-[1fr_1.1fr] lg:items-start">
        <ol className="space-y-2">
          {PROVING_STEPS.map((s, i) => {
            const state = i < step ? "done" : i === step ? "current" : "upcoming";
            return (
              <li
                key={s.key}
                className={cn(
                  "flex gap-3 rounded-lg border p-4 transition-colors",
                  state === "current" && "border-brand-border bg-brand-subtle",
                  state === "done" && "border-border bg-surface",
                  state === "upcoming" && "border-border bg-surface opacity-60",
                )}
              >
                <span
                  className={cn(
                    "grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs font-semibold",
                    state === "done" && "bg-active text-ink-onbrand",
                    state === "current" && "bg-brand text-ink-onbrand",
                    state === "upcoming" && "bg-surface-inset text-ink-subtle",
                  )}
                >
                  {state === "done" ? "✓" : i + 1}
                </span>
                <div>
                  <p className="text-sm font-medium text-ink">{s.title}</p>
                  <p className="mt-0.5 text-sm leading-relaxed text-ink-muted">{s.body}</p>
                </div>
              </li>
            );
          })}
        </ol>

        <Card className="p-6">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium uppercase tracking-[0.08em] text-ink-subtle">
              Credential
            </span>
            <StatusBadge status={done ? "ACTIVE" : step >= 3 ? "PENDING" : "NONE"} />
          </div>

          <div className="mt-6 rounded-lg border border-border bg-canvas p-5">
            <p className="text-sm font-medium text-ink">{PROVING_STEPS[step].title}</p>
            <p className="mt-2 text-sm leading-relaxed text-ink-muted">
              {PROVING_STEPS[step].body}
            </p>
          </div>

          <div className="mt-5 flex items-center gap-2 rounded-md bg-active-subtle px-3 py-2 text-xs text-active">
            <span aria-hidden>🔒</span>
            Your documents never leave your device.
          </div>

          {proof && (
            <div className="mt-5 space-y-2 rounded-lg border border-active/30 bg-active-subtle p-4 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-active">Proof generated client-side</span>
                <span className="text-active">{(proof.ms / 1000).toFixed(2)}s</span>
              </div>
              <Row term="Commitment">
                <Mono>{commitmentToHex(proof.commitment).slice(0, 14)}…</Mono>
              </Row>
              <Row term="Nullifier">
                <Mono>{commitmentToHex(proof.nullifier).slice(0, 14)}…</Mono>
              </Row>
              <p className="leading-relaxed text-ink-subtle">
                Only the proof + these public inputs are submitted to the quorum — your claims stay
                on this device.
              </p>
            </div>
          )}

          {error && (
            <p className="mt-4 rounded-md bg-enforce-subtle px-3 py-2 text-xs text-enforce">
              Proof generation failed: {error}
            </p>
          )}

          <div className="mt-6 flex gap-3">
            <Button
              variant="secondary"
              size="md"
              disabled={step === 0 || proving}
              onClick={() => setStep((s) => Math.max(0, s - 1))}
            >
              Back
            </Button>
            {onProveStep ? (
              <Button size="md" className="flex-1" disabled={proving} onClick={runProof}>
                {proving ? "Generating proof…" : "Generate proof"}
              </Button>
            ) : (
              <Button
                size="md"
                className="flex-1"
                disabled={done}
                onClick={() => setStep((s) => Math.min(total - 1, s + 1))}
              >
                {done ? "Credential active" : step === 0 ? "Connect wallet" : "Continue"}
              </Button>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}

function Row({ term, children }: { term: string; children: React.ReactNode }): React.ReactElement {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-ink-subtle">{term}</span>
      <span className="text-ink">{children}</span>
    </div>
  );
}
