import Link from "next/link";
import { Wordmark } from "@/components/wordmark";
import { Container } from "@/components/ui";
import { SITE } from "@/lib/site";

const COLUMNS = [
  {
    heading: "Product",
    links: [
      { label: "Launch app", href: "/app" },
      { label: "Issuer", href: "/app/issuer" },
      { label: "Investor", href: "/app/investor" },
      { label: "Regulator", href: "/app/regulator" },
    ],
  },
  {
    heading: "Resources",
    links: [
      { label: "Docs", href: "/docs" },
      { label: "GitHub", href: SITE.github, external: true },
      { label: "CSPR.fans", href: SITE.csprFans, external: true },
    ],
  },
] as const;

export function SiteFooter() {
  return (
    <footer className="mt-auto bg-ink text-white">
      <Container className="py-14">
        <div className="flex flex-col gap-10 md:flex-row md:justify-between">
          <div className="max-w-sm">
            <Wordmark tone="onDark" />
            <p className="mt-4 text-sm leading-relaxed text-white/55">
              {SITE.oneLiner}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-10 sm:gap-16">
            {COLUMNS.map((col) => (
              <div key={col.heading}>
                <h3 className="text-xs font-semibold uppercase tracking-[0.1em] text-white/45">
                  {col.heading}
                </h3>
                <ul className="mt-4 space-y-2.5">
                  {col.links.map((link) => (
                    <li key={link.href}>
                      <Link
                        href={link.href}
                        {...("external" in link && link.external
                          ? { target: "_blank", rel: "noreferrer" }
                          : {})}
                        className="text-sm text-white/65 transition-colors hover:text-white"
                      >
                        {link.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
        <div className="mt-12 flex flex-col gap-2 border-t border-white/10 pt-6 text-xs text-white/40 sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} {SITE.name}. Privacy-preserving compliance for tokenized RWA.</p>
          <p>Built on Casper · Casper Agentic Buildathon 2026</p>
        </div>
      </Container>
    </footer>
  );
}
