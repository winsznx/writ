"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { DOCS_PAGES } from "@/lib/docs-nav";
import { cn } from "@/lib/cn";

export function DocsSidebar() {
  const pathname = usePathname();
  return (
    <nav className="mb-8 lg:mb-0">
      <div className="lg:sticky lg:top-24">
        <p className="mb-3 hidden px-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-subtle lg:block">
          Documentation
        </p>
        <ul className="flex gap-1.5 overflow-x-auto border-b border-border pb-2 lg:flex-col lg:gap-0.5 lg:border-b-0 lg:pb-0">
          {DOCS_PAGES.map((p) => {
            const active = pathname === p.href;
            return (
              <li key={p.slug} className="shrink-0">
                <Link
                  href={p.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "block whitespace-nowrap rounded-md px-2.5 py-1.5 text-sm transition-colors lg:border-l-2",
                    active
                      ? "bg-brand-subtle font-medium text-brand lg:border-l-brand"
                      : "text-ink-muted hover:bg-surface-muted hover:text-ink lg:border-l-transparent",
                  )}
                >
                  {p.title}
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </nav>
  );
}
