"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui";
import { cn } from "@/lib/cn";

type Phase = "idle" | "submitting" | "checking" | "denied";

const CHECKS = [
  { label: "Asset frozen?", verdict: "No", ok: true },
  { label: "Sender revoked or frozen?", verdict: "No", ok: true },
  { label: "Recipient credential ACTIVE?", verdict: "REVOKED — sanctions hit", ok: false },
];

export function DemoBlock() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [visibleChecks, setVisibleChecks] = useState(0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  function clearTimers() {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  }

  function run() {
    clearTimers();
    setPhase("submitting");
    setVisibleChecks(0);
    timers.current.push(setTimeout(() => setPhase("checking"), 650));
    timers.current.push(setTimeout(() => setVisibleChecks(1), 1000));
    timers.current.push(setTimeout(() => setVisibleChecks(2), 1500));
    timers.current.push(setTimeout(() => setVisibleChecks(3), 2050));
    timers.current.push(setTimeout(() => setPhase("denied"), 2450));
  }

  useEffect(() => clearTimers, []);

  const running = phase !== "idle";

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-surface shadow-[var(--shadow-card)]">
      <div className="flex items-center justify-between border-b border-border bg-surface-muted px-4 py-2.5">
        <div className="flex items-center gap-2 font-mono text-xs text-ink-subtle">
          <span className="h-2 w-2 rounded-full bg-border-strong" />
          casper-test · transfer
        </div>
        <span className="font-mono text-xs text-ink-subtle">CEP-78 filter</span>
      </div>

      <div className="space-y-4 p-5 sm:p-6">
        <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-canvas px-4 py-3 font-mono text-[13px]">
          <span className="text-ink-muted">transfer</span>
          <span className="truncate text-ink">bond #WRIT-001</span>
          <span aria-hidden className="text-ink-subtle">→</span>
          <span className="truncate text-ink-subtle">0x9f…a3e1</span>
        </div>

        <ul className="space-y-2" aria-live="polite">
          {CHECKS.map((check, i) => {
            const shown = visibleChecks > i;
            return (
              <li
                key={check.label}
                className={cn(
                  "flex items-center justify-between rounded-md border px-3 py-2 text-sm transition-all duration-300",
                  !shown && "translate-y-1 opacity-0",
                  shown && check.ok && "border-border bg-surface text-ink-muted opacity-100",
                  shown && !check.ok && "border-enforce-border bg-enforce-subtle text-enforce opacity-100",
                )}
              >
                <span>{check.label}</span>
                <span className="font-mono text-xs font-medium">{check.verdict}</span>
              </li>
            );
          })}
        </ul>

        <div
          className={cn(
            "flex items-center justify-between rounded-lg px-4 py-3 transition-all duration-300",
            phase === "denied"
              ? "bg-enforce text-ink-onbrand"
              : "bg-surface-inset text-ink-subtle",
          )}
        >
          <span className="font-semibold">
            {phase === "denied" ? "Transfer DENIED on-chain" : "Awaiting decision"}
          </span>
          <span className="font-mono text-xs">
            {phase === "denied" ? "revert 159" : "—"}
          </span>
        </div>

        <p
          className={cn(
            "text-sm transition-opacity duration-500",
            phase === "denied" ? "opacity-100" : "opacity-0",
          )}
        >
          <span className="font-medium text-ink">The holder&apos;s name appears nowhere.</span>{" "}
          <span className="text-ink-muted">
            The chain enforced eligibility against a signed credential — never PII.
          </span>
        </p>

        <Button
          variant={phase === "denied" ? "secondary" : "enforce"}
          size="md"
          onClick={run}
          className="w-full"
        >
          {phase === "idle"
            ? "Send to a sanctioned wallet"
            : running && phase !== "denied"
              ? "Checking on-chain…"
              : "Replay"}
        </Button>
      </div>
    </div>
  );
}
