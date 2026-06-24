import Link from "next/link";
import { APP_SURFACES } from "@/lib/site";

export default function AppHome() {
  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight text-ink">Choose a surface</h1>
      <p className="mt-2 text-sm text-ink-muted">
        Three roles, one compliance layer. Pick where you&apos;re working today.
      </p>
      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        {APP_SURFACES.map((s) => (
          <Link
            key={s.key}
            href={s.href}
            className="group rounded-xl border border-border bg-surface p-5 shadow-[var(--shadow-card)] transition-colors hover:border-brand-border"
          >
            <h2 className="text-base font-semibold text-ink group-hover:text-brand">{s.label}</h2>
            <p className="mt-1.5 text-sm text-ink-muted">{s.blurb}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
