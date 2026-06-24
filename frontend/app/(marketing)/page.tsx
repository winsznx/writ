import Link from "next/link";
import { ButtonLink, Card, Container, Eyebrow, Mono } from "@/components/ui";
import { DemoBlock } from "@/components/landing/demo-block";
import { SITE } from "@/lib/site";

const STEPS = [
  {
    n: "01",
    title: "Prove privately",
    body: "The investor proves eligibility in zero-knowledge — accredited, in-jurisdiction, not sanctioned. No document ever leaves their device.",
  },
  {
    n: "02",
    title: "Gated on-chain",
    body: "A signed credential lands on-chain. Every transfer is checked by a recipient-aware CEP-78 filter and denied by default.",
  },
  {
    n: "03",
    title: "Continuously re-screened",
    body: "An autonomous agent re-screens the whole holder base against live sanctions and accreditation data — and revokes the moment something changes.",
  },
  {
    n: "04",
    title: "Provable to regulators",
    body: "Any single compliance fact is provable to a regulator on demand via selective disclosure — without exposing the book.",
  },
];

const VERTICALS = [
  "Tokenized equities",
  "Treasuries",
  "Corporate debt",
  "Real estate",
  "Funds",
];

const COMPARE = [
  {
    point: "Investor PII",
    usual: "Issuer custodies passports & accreditation docs — a breach lawsuit waiting to happen",
    writ: "Never custodied. Eligibility proven in zero-knowledge",
  },
  {
    point: "Screening",
    usual: "Point-in-time KYC — pass once, in forever",
    writ: "Continuous runtime re-screening by an autonomous agent",
  },
  {
    point: "Enforcement",
    usual: "Off-chain checks and trust",
    writ: "Real on-chain CEP-78 transfer filter — denied by default",
  },
];

export default function LandingPage() {
  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden border-b border-border">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 -top-40 h-80 bg-[radial-gradient(60%_100%_at_50%_0%,var(--brand-subtle),transparent)]"
        />
        <Container className="relative grid gap-12 py-16 sm:py-24 lg:grid-cols-[1.1fr_0.9fr] lg:items-center lg:gap-16">
          <div>
            <Eyebrow>Privacy-preserving compliance for tokenized RWA</Eyebrow>
            <h1 className="mt-5 text-4xl font-semibold leading-[1.08] tracking-tight text-ink sm:text-5xl lg:text-[3.4rem]">
              Keep your tokenized asset compliant{" "}
              <span className="text-brand">for life</span> — without touching a single piece of investor PII.
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-ink-muted">
              Every holder provably eligible, continuously re-screened, and blocked on-chain
              the moment they&apos;re not. Your firm never becomes the honeypot.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <ButtonLink href="#demo" size="lg">
                See it block a transfer
              </ButtonLink>
              <ButtonLink href="/app" variant="secondary" size="lg">
                Launch app
              </ButtonLink>
            </div>
          </div>
          <div id="hero-demo" className="lg:pl-4">
            <DemoBlock />
          </div>
        </Container>
      </section>

      {/* Problem — two pains */}
      <section className="border-b border-border py-16 sm:py-24">
        <Container>
          <Eyebrow>The problem</Eyebrow>
          <h2 className="mt-4 max-w-2xl text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
            Tokenizing the asset is easy. Staying compliant for its entire life is the blocker.
          </h2>
          <div className="mt-12 grid gap-6 md:grid-cols-2">
            <Card className="p-7">
              <h3 className="text-lg font-semibold text-ink">The honeypot</h3>
              <p className="mt-3 text-[15px] leading-relaxed text-ink-muted">
                Conventional compliance forces the issuer to custody a mountain of investor PII —
                passports, accreditation, addresses. The data you collect to be compliant becomes
                the thing that gets you sued. It&apos;s a board-level reason institutions stall on tokenization.
              </p>
            </Card>
            <Card className="p-7">
              <h3 className="text-lg font-semibold text-ink">Point-in-time KYC fails</h3>
              <p className="mt-3 text-[15px] leading-relaxed text-ink-muted">
                Sanctions lists update. Accreditation lapses. Jurisdictions change rules. &ldquo;Pass
                KYC once, you&apos;re in forever&rdquo; is exactly the failure regulators keep fining
                firms for. Real compliance is a runtime engine, not a checkbox.
              </p>
            </Card>
          </div>
        </Container>
      </section>

      {/* How it works */}
      <section className="border-b border-border bg-surface py-16 sm:py-24">
        <Container>
          <Eyebrow>How it works</Eyebrow>
          <h2 className="mt-4 max-w-2xl text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
            One compliance layer, across the asset&apos;s entire on-chain life.
          </h2>
          <ol className="mt-12 grid gap-px overflow-hidden rounded-xl border border-border bg-border md:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((step) => (
              <li key={step.n} className="bg-surface p-6">
                <Mono className="text-brand">{step.n}</Mono>
                <h3 className="mt-3 text-base font-semibold text-ink">{step.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-ink-muted">{step.body}</p>
              </li>
            ))}
          </ol>
        </Container>
      </section>

      {/* The demo moment */}
      <section id="demo" className="scroll-mt-20 border-b border-border py-16 sm:py-24">
        <Container className="grid gap-12 lg:grid-cols-2 lg:items-center lg:gap-16">
          <div>
            <Eyebrow>The moment that converts</Eyebrow>
            <h2 className="mt-4 text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
              A sanctioned wallet tries to receive the bond. Writ blocks it on-chain. Nobody ever
              saw their name.
            </h2>
            <p className="mt-6 text-[15px] leading-relaxed text-ink-muted">
              The recipient was an active holder until a sanctions list updated. The agent
              re-screened, revoked the credential autonomously, and the very next transfer reverts
              on-chain — fail-safe by default. The enforcement is real; the identity is invisible.
            </p>
            <p className="mt-4 text-sm text-ink-subtle">
              Runs on Casper testnet against a real{" "}
              <Link href={SITE.explorer} target="_blank" rel="noreferrer" className="text-brand underline-offset-2 hover:underline">
                CEP-78 transfer
              </Link>
              . Press the button.
            </p>
          </div>
          <DemoBlock />
        </Container>
      </section>

      {/* Differentiation */}
      <section className="border-b border-border bg-surface py-16 sm:py-24">
        <Container>
          <Eyebrow>Why Writ</Eyebrow>
          <h2 className="mt-4 max-w-2xl text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
            No honeypot. Real continuity. On-chain enforcement.
          </h2>
          <div className="mt-12 overflow-hidden rounded-xl border border-border">
            <div className="grid grid-cols-1 divide-y divide-border sm:grid-cols-3 sm:divide-x sm:divide-y-0">
              <div className="bg-surface-muted px-6 py-4 text-xs font-semibold uppercase tracking-[0.1em] text-ink-subtle sm:col-span-3 sm:hidden">
                Writ vs. the usual way
              </div>
              {COMPARE.map((row) => (
                <div key={row.point} className="flex flex-col gap-4 p-6">
                  <h3 className="text-sm font-semibold text-ink">{row.point}</h3>
                  <p className="text-sm leading-relaxed text-ink-subtle line-through decoration-enforce/40">
                    {row.usual}
                  </p>
                  <p className="text-sm font-medium leading-relaxed text-ink">{row.writ}</p>
                </div>
              ))}
            </div>
          </div>
        </Container>
      </section>

      {/* Trust flex */}
      <section className="border-b border-border py-16 sm:py-24">
        <Container className="max-w-3xl">
          <Eyebrow>The trust flex</Eyebrow>
          <h2 className="mt-4 text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
            &ldquo;You can&apos;t lie to it.&rdquo;
          </h2>
          <p className="mt-6 text-lg leading-relaxed text-ink-muted">
            Every eligibility decision is published as a proof anyone can verify. A false
            attestation can be challenged on-chain — and a quorum that signed it gets its bond
            slashed. The expensive cryptographic verification is paid only in a dispute, never on
            the happy path.
          </p>
          <p className="mt-4 text-sm text-ink-subtle">
            Security holds as long as the verifier quorum is honest <em>or</em> a single watcher
            checks during the challenge window. Writ ships an issuer watchtower by default.
          </p>
        </Container>
      </section>

      {/* Who it's for */}
      <section className="border-b border-border bg-surface py-16 sm:py-24">
        <Container>
          <Eyebrow>Who it&apos;s for</Eyebrow>
          <h2 className="mt-4 max-w-2xl text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
            Compliance is the pick-axe every RWA vertical needs.
          </h2>
          <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-ink-muted">
            Writ doesn&apos;t pick a vertical — it owns the job every vertical has to solve.
          </p>
          <div className="mt-10 flex flex-wrap gap-3">
            {VERTICALS.map((v) => (
              <span
                key={v}
                className="rounded-full border border-border bg-canvas px-4 py-2 text-sm font-medium text-ink-muted"
              >
                {v}
              </span>
            ))}
          </div>
        </Container>
      </section>

      {/* How the ZK works — the honest claim */}
      <section className="border-b border-border py-16 sm:py-24">
        <Container className="max-w-3xl">
          <Eyebrow>How the ZK works</Eyebrow>
          <h2 className="mt-4 text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
            The honest claim — stated precisely.
          </h2>
          <Card className="mt-8 p-7">
            <p className="text-[15px] leading-relaxed text-ink">
              Eligibility is proven in zero-knowledge, verified by a threshold of autonomous
              agents. The chain stores signed credentials, enforces compliance at every transfer
              via a native CEP-78 filter, and exposes published proofs for on-chain fraud
              challenge — with off-chain selective disclosure to regulators.
            </p>
          </Card>
          <p className="mt-5 text-sm leading-relaxed text-ink-subtle">
            We never claim on-chain SNARK verification. On-chain pairing verification isn&apos;t
            cost-viable on Casper today, so Writ verifies off-chain and commits on-chain — and says
            so plainly. Honesty reads as senior.
          </p>
        </Container>
      </section>

      {/* Built on Casper */}
      <section className="border-b border-border bg-surface py-16 sm:py-24">
        <Container className="max-w-3xl">
          <Eyebrow>Built on Casper</Eyebrow>
          <h2 className="mt-4 text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
            The ERC-3643-equivalent for Casper — shipped ahead of the protocol.
          </h2>
          <p className="mt-6 text-[15px] leading-relaxed text-ink-muted">
            Writ speaks the institutional security-token model — identity, claims, compliance
            rules, transfer restrictions — on Casper&apos;s native account and weighted-multisig
            model, paying for live compliance data through x402. It sits dead-center on Casper&apos;s
            RWA and compliant-privacy thesis.
          </p>
        </Container>
      </section>

      {/* Final CTA */}
      <section className="py-20 sm:py-28">
        <Container className="text-center">
          <h2 className="mx-auto max-w-3xl text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
            Compliant for life. Provable to anyone. PII to no one.
          </h2>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <ButtonLink href="/app" size="lg">
              Launch app
            </ButtonLink>
            <ButtonLink href="/docs" variant="secondary" size="lg">
              Read the docs
            </ButtonLink>
          </div>
        </Container>
      </section>
    </>
  );
}
