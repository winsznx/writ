"use client";

import { useSyncExternalStore } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Wordmark } from "@/components/wordmark";
import { Button, ButtonLink, Container } from "@/components/ui";
import { APP_SURFACES } from "@/lib/site";
import { cn } from "@/lib/cn";

const MOCK_ADDRESS = "0x7a3f…91c4";
const SESSION_KEY = "writ:connected";

const listeners = new Set<() => void>();

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  window.addEventListener("storage", onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
}

function getSnapshot() {
  return sessionStorage.getItem(SESSION_KEY) === "1";
}

function setConnection(value: boolean) {
  if (value) sessionStorage.setItem(SESSION_KEY, "1");
  else sessionStorage.removeItem(SESSION_KEY);
  listeners.forEach((l) => l());
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const connected = useSyncExternalStore(subscribe, getSnapshot, () => false);
  const pathname = usePathname();

  const connect = () => setConnection(true);
  const disconnect = () => setConnection(false);

  if (!connected) {
    return (
      <div className="flex flex-1 flex-col">
        <AppTopBar />
        <div className="flex flex-1 items-center justify-center px-5 py-20">
          <div className="w-full max-w-md rounded-xl border border-border bg-surface p-8 text-center shadow-[var(--shadow-card)]">
            <h1 className="text-xl font-semibold text-ink">Connect your wallet</h1>
            <p className="mt-3 text-sm leading-relaxed text-ink-muted">
              The Writ app surfaces are wallet-gated. Connect with CSPR.click to continue.
              No documents or PII are ever requested.
            </p>
            <Button className="mt-6 w-full" onClick={connect}>
              Connect with CSPR.click
            </Button>
            <p className="mt-4 text-xs text-ink-subtle">
              Demo build. Connection is simulated for the walkthrough.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col">
      <AppTopBar address={MOCK_ADDRESS} onDisconnect={disconnect} />
      <Container className="flex flex-1 flex-col gap-8 py-8 lg:flex-row">
        <nav className="lg:w-56 lg:shrink-0">
          <ul className="flex gap-2 overflow-x-auto lg:flex-col lg:gap-1">
            {APP_SURFACES.map((s) => {
              const active = pathname === s.href;
              return (
                <li key={s.key} className="shrink-0">
                  <Link
                    href={s.href}
                    className={cn(
                      "flex flex-col rounded-lg px-3.5 py-2.5 transition-colors",
                      active
                        ? "bg-brand-subtle text-brand"
                        : "text-ink-muted hover:bg-surface-muted hover:text-ink",
                    )}
                  >
                    <span className="text-sm font-medium">{s.label}</span>
                    <span
                      className={cn(
                        "text-xs",
                        active ? "text-brand/70" : "text-ink-subtle",
                      )}
                    >
                      {s.blurb}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
        <div className="min-w-0 flex-1">{children}</div>
      </Container>
    </div>
  );
}

function AppTopBar({
  address,
  onDisconnect,
}: {
  address?: string;
  onDisconnect?: () => void;
}) {
  return (
    <header className="border-b border-border bg-surface">
      <Container className="flex h-14 items-center justify-between">
        <div className="flex items-center gap-3">
          <Wordmark />
          <span className="rounded-full bg-surface-muted px-2 py-0.5 text-xs font-medium text-ink-subtle">
            App
          </span>
        </div>
        {address ? (
          <div className="flex items-center gap-3">
            <span className="font-mono text-xs text-ink-muted">{address}</span>
            <button
              type="button"
              onClick={onDisconnect}
              className="text-xs font-medium text-ink-subtle hover:text-ink"
            >
              Disconnect
            </button>
          </div>
        ) : (
          <ButtonLink href="/" variant="ghost" size="sm">
            Back to site
          </ButtonLink>
        )}
      </Container>
    </header>
  );
}
