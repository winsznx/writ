"use client";

import { useState } from "react";
import { Button, Card } from "@/components/ui";
import { StatusBadge } from "@/components/status-badge";
import { PROVING_STEPS } from "@/lib/mocks";
import { cn } from "@/lib/cn";

export function InvestorProving() {
  const [step, setStep] = useState(0);
  const total = PROVING_STEPS.length;
  const done = step >= total - 1;

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-ink">Prove eligibility</h1>
        <p className="mt-2 max-w-xl text-sm leading-relaxed text-ink-muted">
          Prove you&apos;re eligible to hold the asset without uploading a single document.
          Your claims are proven in zero-knowledge — they never leave your device.
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

          <div className="mt-6 flex gap-3">
            <Button
              variant="secondary"
              size="md"
              disabled={step === 0}
              onClick={() => setStep((s) => Math.max(0, s - 1))}
            >
              Back
            </Button>
            <Button
              size="md"
              className="flex-1"
              disabled={done}
              onClick={() => setStep((s) => Math.min(total - 1, s + 1))}
            >
              {done ? "Credential active" : step === 0 ? "Connect wallet" : "Continue"}
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}
