import Link from "next/link";
import type { ReactNode } from "react";
import { adjacentDocs, type DocPage } from "@/lib/docs-nav";
import { deployUrl } from "@/lib/chain";
import { Mono } from "@/components/ui";

/** One docs page: serif title, prose body, and a prev/next pager driven by DOCS_PAGES. */
export function DocArticle({
  slug,
  title,
  description,
  children,
}: {
  slug: string;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  const { prev, next } = adjacentDocs(slug);
  return (
    <article className="min-w-0 max-w-2xl">
      <header className="mb-8">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-brand">Documentation</p>
        <h1 className="mt-3 font-serif text-[2.1rem] font-medium leading-[1.08] tracking-[-0.02em] text-ink sm:text-[2.6rem]">
          {title}
        </h1>
        {description ? (
          <p className="mt-4 text-lg leading-relaxed text-ink-muted">{description}</p>
        ) : null}
      </header>

      <div className="space-y-5 text-[15px] leading-relaxed text-ink-muted [&_a.inline]:text-brand [&_a.inline]:underline-offset-2 hover:[&_a.inline]:underline [&_strong]:font-medium [&_strong]:text-ink">
        {children}
      </div>

      <nav className="mt-16 grid gap-3 border-t border-border pt-8 sm:grid-cols-2">
        {prev ? <PagerCard dir="Previous" page={prev} /> : <span />}
        {next ? <PagerCard dir="Next" page={next} align="right" /> : <span />}
      </nav>
    </article>
  );
}

function PagerCard({ dir, page, align = "left" }: { dir: string; page: DocPage; align?: "left" | "right" }) {
  return (
    <Link
      href={page.href}
      className={cnPager(align)}
    >
      <span className="text-xs font-medium uppercase tracking-[0.08em] text-ink-subtle">
        {align === "right" ? `${dir} →` : `← ${dir}`}
      </span>
      <span className="mt-1 text-[15px] font-semibold text-ink group-hover:text-brand">{page.title}</span>
    </Link>
  );
}

function cnPager(align: "left" | "right"): string {
  return [
    "group flex flex-col rounded-xl border border-border bg-surface p-4 transition-colors hover:border-brand-border hover:bg-brand-subtle/30",
    align === "right" ? "sm:col-start-2 sm:items-end sm:text-right" : "",
  ].join(" ");
}

export function Callout({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-xl border border-brand-border bg-brand-subtle p-5">
      <p className="text-xs font-semibold uppercase tracking-[0.09em] text-brand">{title}</p>
      <p className="mt-2 text-[15px] leading-relaxed text-ink">{children}</p>
    </div>
  );
}

export function Step({ n, title, children }: { n: string; title: string; children: ReactNode }) {
  return (
    <div className="flex gap-4 rounded-xl border border-border bg-surface p-5">
      <Mono className="shrink-0 text-brand">{n}</Mono>
      <div>
        <h3 className="text-[15px] font-semibold text-ink">{title}</h3>
        <p className="mt-1.5 text-[15px] leading-relaxed text-ink-muted">{children}</p>
      </div>
    </div>
  );
}

export function Proof({ href, label, detail }: { href: string; label: string; detail: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="group flex items-start justify-between gap-4 rounded-xl border border-border bg-surface p-4 transition-colors hover:border-brand-border hover:bg-brand-subtle/40"
    >
      <div>
        <p className="text-[15px] font-medium text-ink">{label}</p>
        <p className="mt-1 text-sm leading-relaxed text-ink-muted">{detail}</p>
      </div>
      <span aria-hidden className="shrink-0 pt-0.5 text-ink-subtle transition-colors group-hover:text-brand">↗</span>
    </a>
  );
}

export function Contract({ pkg, name, job }: { pkg: string; name: string; job: string }) {
  return (
    <li className="flex flex-col gap-0.5">
      <a href={deployUrl(pkg)} target="_blank" rel="noreferrer" className="font-medium text-ink underline-offset-2 hover:text-brand hover:underline">
        {name} ↗
      </a>
      <span className="text-ink-muted">{job}</span>
    </li>
  );
}
