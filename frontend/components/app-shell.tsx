"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Wordmark } from "@/components/wordmark";
import { Button, ButtonLink, Container } from "@/components/ui";
import { APP_SURFACES } from "@/lib/site";
import { cn } from "@/lib/cn";
import { useCsprClick } from "@/lib/csprclick";

export function AppShell({ children }: { children: React.ReactNode }) {
  const { configured, ready, account, connect, disconnect } = useCsprClick();
  const pathname = usePathname();

  const connected = Boolean(account?.public_key);
  const address = account?.public_key
    ? `${account.public_key.slice(0, 6)}…${account.public_key.slice(-4)}`
    : undefined;

  if (!connected) {
    return (
      <div className="flex flex-1 flex-col">
        <AppTopBar />
        <div className="flex flex-1 items-center justify-center px-5 py-16 sm:py-24">
          <div className="w-full max-w-md overflow-hidden rounded-2xl border border-border bg-surface text-center shadow-[var(--shadow-pop)]">
            <div className="border-b border-border bg-surface-muted px-8 py-7">
              <span aria-hidden className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-brand-subtle text-xl text-brand">
                🔐
              </span>
              <h1 className="mt-4 font-serif text-2xl font-medium tracking-[-0.02em] text-ink">
                Connect your wallet
              </h1>
            </div>
            <div className="px-8 py-7">
              <p className="text-sm leading-relaxed text-ink-muted">
                Writ&apos;s surfaces are wallet-gated. Connect your Casper wallet to continue — your
                connected account becomes your holder identity. No documents or PII are ever requested.
              </p>
              <Button
                className="mt-6 w-full"
                size="lg"
                onClick={connect}
                disabled={!configured || !ready}
              >
                {configured ? (ready ? "Connect with CSPR.click" : "Loading wallet…") : "Wallet unavailable"}
              </Button>
              <p className="mt-4 text-xs text-ink-subtle">
                {configured
                  ? "Casper Wallet · Ledger · MetaMask Snap · WalletConnect"
                  : "Wallet connect not configured (NEXT_PUBLIC_CSPR_CLICK_APP_ID)."}
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col">
      <AppTopBar address={address} onDisconnect={disconnect} />
      <Container className="flex flex-1 flex-col gap-6 py-6 lg:flex-row lg:gap-8 lg:py-8">
        <nav className="lg:w-60 lg:shrink-0">
          <p className="mb-2 hidden px-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-subtle lg:block">
            Surfaces
          </p>
          <ul className="flex gap-2 overflow-x-auto pb-1 lg:flex-col lg:gap-1 lg:overflow-visible lg:pb-0">
            {APP_SURFACES.map((s) => {
              const active = pathname === s.href;
              return (
                <li key={s.key} className="shrink-0">
                  <Link
                    href={s.href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "group relative flex flex-col rounded-lg border px-3.5 py-2.5 transition-all lg:border-l-2",
                      active
                        ? "border-transparent bg-brand-subtle text-brand lg:border-l-brand"
                        : "border-transparent text-ink-muted hover:bg-surface-muted hover:text-ink lg:border-l-transparent",
                    )}
                  >
                    <span className="text-sm font-semibold">{s.label}</span>
                    <span className={cn("text-xs", active ? "text-brand/70" : "text-ink-subtle")}>
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
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-2 rounded-full border border-border bg-surface-muted px-3 py-1.5">
              <span aria-hidden className="h-2 w-2 rounded-full bg-active shadow-[0_0_0_3px_var(--active-subtle)]" />
              <span className="font-mono text-xs text-ink-muted">{address}</span>
            </span>
            <button
              type="button"
              onClick={onDisconnect}
              className="rounded-full px-2.5 py-1.5 text-xs font-medium text-ink-subtle transition-colors hover:bg-surface-muted hover:text-ink"
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
