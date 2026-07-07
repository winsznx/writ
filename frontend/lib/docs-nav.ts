/** Ordered docs pages — drives the sidebar + the prev/next pager (single source). */
export type DocPage = { slug: string; href: string; title: string };

export const DOCS_PAGES: readonly DocPage[] = [
  { slug: "intro", href: "/docs", title: "Introduction" },
  { slug: "problem", href: "/docs/problem", title: "The problem" },
  { slug: "how-it-works", href: "/docs/how-it-works", title: "How it works" },
  { slug: "trust-model", href: "/docs/trust-model", title: "The trust model" },
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

/** Real, confirmed v4 testnet deploys — clickable proof. */
export const DOCS_TX = {
  kicker: "3448182cb432dd4278551dc378a8485c7ee9cb09b3c619101ea37efb34a17b1d",
  recipientDeny: "ce0f1a3a03131a4de663d04d60243aa4c261a9f0eab24acf55a4f5af9a26a2ad",
  regulatedAttest: "f3fd7cbba19ef1195d70df72bc3ea073da4b6f78899c261ffadbc305d7a86645",
  fraudSlash: "0ae7aecdf9510e34db2e6a2f392630843bbd11176f067124d01f2012d0e00c83",
} as const;
