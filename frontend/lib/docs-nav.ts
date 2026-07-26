/** Ordered docs pages — drives the sidebar + the prev/next pager (single source). */
export type DocPage = { slug: string; href: string; title: string };

export const DOCS_PAGES: readonly DocPage[] = [
  { slug: "intro", href: "/docs", title: "Introduction" },
  { slug: "problem", href: "/docs/problem", title: "The problem" },
  { slug: "how-it-works", href: "/docs/how-it-works", title: "How it works" },
  { slug: "trust-model", href: "/docs/trust-model", title: "The trust model" },
  { slug: "whats-real", href: "/docs/whats-real", title: "What's real vs demo" },
  { slug: "verify", href: "/docs/verify", title: "Verify it yourself" },
  { slug: "architecture", href: "/docs/architecture", title: "Architecture" },
] as const;

export function adjacentDocs(slug: string): { prev: DocPage | null; next: DocPage | null } {
  const i = DOCS_PAGES.findIndex((p) => p.slug === slug);
  return {
    prev: i > 0 ? DOCS_PAGES[i - 1] : null,
    next: i >= 0 && i < DOCS_PAGES.length - 1 ? DOCS_PAGES[i + 1] : null,
  };
}

/** Real, confirmed V5 testnet deploys — clickable proof (scripts/verify_live.sh
    re-checks every one against the public node). */
export const DOCS_TX = {
  kicker: "1af2d7e6821159b83819fed115ba072b7f10090c385ca18e1d5c71d288f4e7f3",
  recipientDeny: "af706a71f42e838ea7029785a2b80803798ebb34f61b00d5804119615a1bdf35",
  regulatedAttest: "a2dc0c8ad4f90f5b9dd86ada48498a2869c1570d75c5b4bb3f542f6cdb70296b",
  fraudSlash: "79cce54a4fbd125ee81c120150c77b8eda66d5acc16331c94790e2c51ad9193f",
  postFraudDeny: "0013547bf9a13134d14485db39658c9a0576a9e12580129524443f415a00c056",
  mintDeny: "7f685f232d4b12f281e09c3b2abe2d9a8cce260c6f17c1fb437860dd9af3fdf3",
  canonicalPin: "099758726ffff9a427fe8a0fdf5a34bb242054e9d0fb5e2f6e0758a698ef16a6",
} as const;
