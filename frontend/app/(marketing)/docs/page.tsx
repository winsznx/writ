import type { Metadata } from "next";
import Link from "next/link";
import { Card, Container, Eyebrow } from "@/components/ui";
import { SITE } from "@/lib/site";

export const metadata: Metadata = {
  title: "Docs",
  description:
    "Writ documentation: architecture, the honest ZK claim, integration, and the agent surface.",
};

const SECTIONS = [
  { title: "Quickstart", body: "Add Writ to a tokenized asset and onboard your first credentialed holder." },
  { title: "Architecture", body: "The off-chain-verify, on-chain-commit model: quorum, Credential Registry, and the patched CEP-78 filter." },
  { title: "The honest claim", body: "What Writ proves on-chain and what it doesn't, stated precisely and never overclaimed." },
  { title: "Integration", body: "How an issuer wires Writ into a CEP-78 asset: mint gate, transfer filter, rule sets." },
  { title: "Agent & MCP surface", body: "The autonomous verifier quorum, re-screen scheduler, and Cordon / x402 screening sources." },
  { title: "FAQ", body: "Trust model, watchers, revocation latency, and the limits we own." },
];

export default function DocsPage() {
  return (
    <Container className="py-16 sm:py-20">
      <Eyebrow>Documentation</Eyebrow>
      <h1 className="mt-4 text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
        Build on Writ
      </h1>
      <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-ink-muted">
        Everything an issuer or integrator needs to add privacy-preserving compliance to a
        tokenized real-world asset. Docs follow the Mintlify house convention; this is the v1 index.
      </p>

      <Card className="mt-8 border-brand-border bg-brand-subtle p-6">
        <p className="text-xs font-semibold uppercase tracking-[0.1em] text-brand">The honest claim</p>
        <p className="mt-3 text-[15px] leading-relaxed text-ink">
          Eligibility is proven in zero-knowledge, verified by a threshold of autonomous agents.
          The chain stores signed credentials, enforces compliance at every transfer via a native
          CEP-78 filter, and exposes published proofs for on-chain fraud challenge, with off-chain
          selective disclosure to regulators. We never claim on-chain SNARK verification.
        </p>
      </Card>

      <div className="mt-10 grid gap-4 sm:grid-cols-2">
        {SECTIONS.map((s) => (
          <Card key={s.title} className="p-6">
            <h2 className="text-base font-semibold text-ink">{s.title}</h2>
            <p className="mt-2 text-sm leading-relaxed text-ink-muted">{s.body}</p>
          </Card>
        ))}
      </div>

      <p className="mt-10 text-sm text-ink-subtle">
        Source and issue tracker on{" "}
        <Link href={SITE.github} target="_blank" rel="noreferrer" className="text-brand underline-offset-2 hover:underline">
          GitHub
        </Link>
        .
      </p>
    </Container>
  );
}
