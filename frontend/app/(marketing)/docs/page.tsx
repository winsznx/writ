import type { Metadata } from "next";
import Link from "next/link";
import { DocArticle, Callout } from "@/components/docs";
import { Mono } from "@/components/ui";
import { SITE } from "@/lib/site";

export const metadata: Metadata = {
  title: "Docs",
  description:
    "How Writ works: privacy-preserving, ERC-3643-style compliance for tokenized RWA on Casper — verified off-chain, committed on-chain, enforced at every transfer.",
};

export default function DocsIntro() {
  return (
    <DocArticle
      slug="intro"
      title="How Writ works"
      description="Privacy-preserving, ERC-3643-style compliance for tokenized real-world assets on Casper."
    >
      <p>
        Every holder provably eligible, re-screened against live data, and blocked on-chain the
        moment they aren&apos;t — with zero investor PII on screen. Tokenizing an asset is easy;
        keeping it compliant for its whole life is the blocker. Writ solves it.
      </p>
      <p>
        It speaks the institutional security-token model the industry already trusts:{" "}
        <strong>identity, claims, compliance rules, transfer restrictions</strong> — the ERC-3643 /
        T-REX model. Casper has joined the <strong>ERC-3643 Association</strong>, the standards body
        for compliant RWA tokenization; Writ brings that model to Casper&apos;s native account and
        weighted-multisig model, on the recommended Casper stack — <Mono>Odra</Mono>,{" "}
        <Mono>CSPR.click</Mono>, <Mono>CSPR.cloud</Mono>.
      </p>
      <Callout title="Read next">
        These pages walk the whole system — the problem, how onboarding, gating and disclosure work,
        the honest trust model, and live on-chain proof you can click. Use the sidebar, or the Next
        button at the bottom of each page.
      </Callout>
      <div className="flex flex-wrap gap-4 pt-1 text-[15px]">
        <Link href="/app" className="font-medium text-brand underline-offset-2 hover:underline">
          Launch the app →
        </Link>
        <Link href={SITE.github} target="_blank" rel="noreferrer" className="font-medium text-ink-muted underline-offset-2 hover:text-ink hover:underline">
          Source on GitHub →
        </Link>
      </div>
    </DocArticle>
  );
}
