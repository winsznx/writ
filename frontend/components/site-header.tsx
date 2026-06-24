"use client";

import { useState } from "react";
import Link from "next/link";
import { Wordmark } from "@/components/wordmark";
import { ButtonLink, Container } from "@/components/ui";
import { NAV_LINKS, SITE } from "@/lib/site";
import { cn } from "@/lib/cn";

export function SiteHeader() {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-canvas/80 backdrop-blur-md">
      <Container className="flex h-16 items-center justify-between gap-4">
        <div className="flex items-center gap-6">
          <Wordmark />
          <Link
            href={SITE.csprFans}
            target="_blank"
            rel="noreferrer"
            className="hidden items-center gap-1.5 rounded-full border border-brand-border bg-brand-subtle px-3 py-1 text-xs font-medium text-brand transition-colors hover:bg-brand-subtle/70 sm:inline-flex"
          >
            <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-brand" />
            Vote on CSPR.fans
          </Link>
        </div>

        <nav className="hidden items-center gap-1 md:flex">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              {...("external" in link && link.external
                ? { target: "_blank", rel: "noreferrer" }
                : {})}
              className="rounded-md px-3 py-2 text-sm font-medium text-ink-muted transition-colors hover:text-ink hover:bg-surface-muted"
            >
              {link.label}
            </Link>
          ))}
          <ButtonLink href="/app" size="sm" className="ml-2">
            Launch app
          </ButtonLink>
        </nav>

        <div className="flex items-center gap-2 md:hidden">
          <ButtonLink href="/app" size="sm">
            Launch app
          </ButtonLink>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-label="Toggle menu"
            className="grid h-9 w-9 place-items-center rounded-md border border-border-strong text-ink-muted"
          >
            <span aria-hidden className="text-lg leading-none">
              {open ? "×" : "≡"}
            </span>
          </button>
        </div>
      </Container>

      <div
        className={cn(
          "overflow-hidden border-t border-border bg-canvas md:hidden",
          open ? "block" : "hidden",
        )}
      >
        <Container className="flex flex-col gap-1 py-3">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setOpen(false)}
              {...("external" in link && link.external
                ? { target: "_blank", rel: "noreferrer" }
                : {})}
              className="rounded-md px-3 py-2.5 text-sm font-medium text-ink-muted hover:bg-surface-muted"
            >
              {link.label}
            </Link>
          ))}
          <Link
            href={SITE.csprFans}
            target="_blank"
            rel="noreferrer"
            onClick={() => setOpen(false)}
            className="rounded-md px-3 py-2.5 text-sm font-medium text-brand hover:bg-brand-subtle"
          >
            Vote on CSPR.fans
          </Link>
        </Container>
      </div>
    </header>
  );
}
