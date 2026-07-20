import Link from "next/link";
import { ButtonLink, Card, Container, Eyebrow, Mono } from "@/components/ui";
import { DemoBlock } from "@/components/landing/demo-block";
import { ScrollFx } from "@/components/landing/scroll-fx";

const STEPS = [
  {
    n: "01",
    title: "Prove privately",
    body: "The investor proves eligibility in zero-knowledge: accredited, in-jurisdiction, not sanctioned. The identity secret is wallet-derived and stays in the browser; claims come from a demo issuer.",
  },
  {
    n: "02",
    title: "Gated on-chain",
    body: "A signed credential lands on-chain. Every transfer is checked by a recipient-aware CEP-78 filter and denied by default.",
  },
  {
    n: "03",
    title: "Revocable at runtime",
    body: "Credentials are re-screened at onboarding and refresh, and revocable on-chain at any time — the very next transfer after a revoke reverts. (Screening scope and its demo limits are disclosed in the docs.)",
  },
  {
    n: "04",
    title: "Provable to regulators",
    body: "Any single compliance fact is provable to a regulator on demand via selective disclosure, without exposing the book.",
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
    usual: "Issuer custodies passports & accreditation docs, a breach lawsuit waiting to happen",
    writ: "Never custodied. Eligibility proven in zero-knowledge",
  },
  {
    point: "Screening",
    usual: "Point-in-time KYC: pass once, in forever",
    writ: "Screened against live sanctions data at onboarding and refresh; revocable on-chain at any time",
  },
  {
    point: "Enforcement",
    usual: "Off-chain checks and trust",
    writ: "Real on-chain CEP-78 transfer filter, denied by default",
  },
];

export default function LandingPage() {
  return (
    <ScrollFx>
      {/* Hero */}
      <section className="relative overflow-hidden border-b border-border">
        <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
          <div className="absolute inset-x-0 -top-32 h-[28rem] bg-[radial-gradient(70%_60%_at_50%_0%,var(--brand-subtle),transparent_70%)]" />
          <div data-parallax className="absolute -left-24 top-4 h-72 w-72 rounded-full bg-brand-subtle opacity-60 blur-3xl" />
          <div data-parallax className="absolute -right-20 top-24 h-64 w-64 rounded-full bg-active-subtle opacity-50 blur-3xl" />
        </div>
        <Container className="relative grid gap-12 py-16 sm:py-24 lg:grid-cols-[1.1fr_0.9fr] lg:items-center lg:gap-16">
          <div data-reveal>
            <Eyebrow>Privacy-preserving compliance for tokenized RWA</Eyebrow>
            <h1 className="mt-5 font-serif text-[2.7rem] font-medium leading-[1.04] tracking-[-0.02em] text-ink sm:text-5xl lg:text-[3.6rem]">
              Keep tokenized assets compliant{" "}
              <span className="italic text-brand">for life.</span>
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-ink-muted">
              Every holder provably eligible, screened against live sanctions data, and blocked
              on-chain the moment their credential is revoked — and your firm never custodies
              investor PII.
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
          <div id="hero-demo" data-reveal className="lg:pl-4">
            <DemoBlock />
          </div>
        </Container>
      </section>

      {/* Problem: two pains */}
      <section className="border-b border-border py-16 sm:py-24">
        <Container>
          <div data-reveal>
            <Eyebrow>The problem</Eyebrow>
            <h2 className="mt-4 max-w-2xl font-serif text-3xl font-medium tracking-[-0.015em] text-ink sm:text-4xl">
              Tokenizing the asset is easy. Staying compliant for its entire life is the blocker.
            </h2>
          </div>
          <div className="mt-12 grid gap-6 md:grid-cols-2">
            <Card data-reveal className="p-7">
              <h3 className="text-lg font-semibold text-ink">The honeypot</h3>
              <p className="mt-3 text-[15px] leading-relaxed text-ink-muted">
                Conventional compliance forces the issuer to custody a mountain of investor PII:
                passports, accreditation, addresses. The data you collect to be compliant becomes
                the thing that gets you sued. It&apos;s a board-level reason institutions stall on tokenization.
              </p>
            </Card>
            <Card data-reveal className="p-7">
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
          <div data-reveal>
            <Eyebrow>How it works</Eyebrow>
            <h2 className="mt-4 max-w-2xl font-serif text-3xl font-medium tracking-[-0.015em] text-ink sm:text-4xl">
              One compliance layer, across the asset&apos;s entire on-chain life.
            </h2>
          </div>
          <ol className="mt-12 grid gap-px overflow-hidden rounded-xl border border-border bg-border md:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((step) => (
              <li key={step.n} data-reveal className="bg-surface p-6">
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
          <div data-reveal>
            <Eyebrow>The moment that converts</Eyebrow>
            <h2 className="mt-4 font-serif text-3xl font-medium tracking-[-0.015em] text-ink sm:text-4xl">
              A sanctioned wallet tries to receive the bond. Writ blocks it on-chain. Nobody ever
              saw their name.
            </h2>
            <p className="mt-6 text-[15px] leading-relaxed text-ink-muted">
              The recipient was an active holder until their credential was revoked through the
              registry&apos;s sanctions path. The very next transfer reverts on-chain, fail-safe by
              default. The enforcement is real; the identity is invisible.
            </p>
            <p className="mt-4 text-sm text-ink-subtle">
              A walkthrough of the real mechanism — the same recipient-aware CEP-78 filter that{" "}
              <Link href="https://testnet.cspr.live/deploy/3448182cb432dd4278551dc378a8485c7ee9cb09b3c619101ea37efb34a17b1d" target="_blank" rel="noreferrer" className="text-brand underline-offset-2 hover:underline">
                reverts a sanctioned transfer live on Casper testnet
              </Link>
              . Press the button.
            </p>
          </div>
          <div data-reveal>
            <DemoBlock />
          </div>
        </Container>
      </section>

      {/* Differentiation */}
      <section className="border-b border-border bg-surface py-16 sm:py-24">
        <Container>
          <div data-reveal>
            <Eyebrow>Why Writ</Eyebrow>
            <h2 className="mt-4 max-w-2xl font-serif text-3xl font-medium tracking-[-0.015em] text-ink sm:text-4xl">
              No honeypot. Real continuity. On-chain enforcement.
            </h2>
          </div>
          <div data-reveal className="mt-12 overflow-hidden rounded-xl border border-border">
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
          <div data-reveal>
            <Eyebrow>The trust flex</Eyebrow>
            <h2 className="mt-4 font-serif text-3xl font-medium italic tracking-[-0.015em] text-ink sm:text-[2.75rem]">
              &ldquo;You can&apos;t publish a false proof.&rdquo;
            </h2>
          </div>
          <p data-reveal className="mt-6 text-lg leading-relaxed text-ink-muted">
            Every credential stores the holder&apos;s own proof, published for anyone to verify.
            An attestation whose stored proof is invalid can be challenged on-chain — the
            verifier re-runs it, and the signers that attested it lose their bonds. The
            expensive cryptographic verification is paid only in a dispute, never on the happy
            path.
          </p>
          <p data-reveal className="mt-4 text-sm text-ink-subtle">
            Scope, stated precisely: the challenge verifies the stored proof; canonical
            issuer/asset/jurisdiction-root pinning is a separate gate (onboarding service today,
            with an on-chain registry entrypoint in the hardened build — README §12). Security
            holds as long as the attestation operator is honest <em>or</em> any single honest
            watcher challenges a bad attestation during the dispute window — a 1-of-N trust
            model the issuer can backstop itself.
          </p>
        </Container>
      </section>

      {/* Who it's for */}
      <section className="border-b border-border bg-surface py-16 sm:py-24">
        <Container>
          <div data-reveal>
            <Eyebrow>Who it&apos;s for</Eyebrow>
            <h2 className="mt-4 max-w-2xl font-serif text-3xl font-medium tracking-[-0.015em] text-ink sm:text-4xl">
              Compliance is the pick-axe every RWA vertical needs.
            </h2>
            <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-ink-muted">
              Writ doesn&apos;t pick a vertical. It owns the job every vertical has to solve.
            </p>
          </div>
          <div data-reveal className="mt-10 flex flex-wrap gap-3">
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

      {/* How the ZK works: the honest claim */}
      <section className="border-b border-border py-16 sm:py-24">
        <Container className="max-w-3xl">
          <div data-reveal>
            <Eyebrow>How the ZK works</Eyebrow>
            <h2 className="mt-4 font-serif text-3xl font-medium tracking-[-0.015em] text-ink sm:text-4xl">
              The honest claim, stated precisely.
            </h2>
          </div>
          <Card data-reveal className="mt-8 p-7">
            <p className="text-[15px] leading-relaxed text-ink">
              Writ uses an honest on-chain/off-chain split: proofs are generated in the browser
              and verified off-chain before attestation; Casper stores the signed credential —
              commitment, nullifier, expiry, and the holder&apos;s own proof bytes — and enforces
              transfer eligibility through a recipient-aware CEP-78 filter. The challenge path
              re-verifies the published proof on-chain (Groth16, ~80 CSPR) to adjudicate disputes.
            </p>
          </Card>
          <p className="mt-5 text-sm leading-relaxed text-ink-subtle">
            We never claim SNARK verification at onboarding. In this demo the attestation is
            co-signed by two server-held keys in one trust domain (the registry verifies both
            against its 3-key set on-chain) and the claim issuer is a demo issuer — both stated
            plainly here and in the docs.
          </p>
        </Container>
      </section>

      {/* Built on Casper */}
      <section className="border-b border-border bg-surface py-16 sm:py-24">
        <Container className="max-w-3xl">
          <div data-reveal>
            <Eyebrow>Built on Casper</Eyebrow>
            <h2 className="mt-4 font-serif text-3xl font-medium tracking-[-0.015em] text-ink sm:text-4xl">
              ERC-3643-style compliance, native to Casper.
            </h2>
          </div>
          <p data-reveal className="mt-6 text-[15px] leading-relaxed text-ink-muted">
            Casper has joined the ERC-3643 Association, the standards body for compliant RWA
            tokenization. Writ brings that institutional security-token model — identity, claims,
            compliance rules, transfer restrictions — to Casper&apos;s native account and
            weighted-multisig model, and is built to pay for live compliance data on demand. It sits
            dead-center on Casper&apos;s RWA and compliant-privacy thesis.
          </p>
        </Container>
      </section>

      {/* Final CTA: saturated brand band */}
      <section className="px-5 py-16 sm:px-8 sm:py-24">
        <div data-reveal className="relative mx-auto max-w-6xl overflow-hidden rounded-3xl bg-brand px-6 py-16 text-center shadow-[var(--shadow-pop)] sm:py-20">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_120%_at_50%_0%,rgb(255_255_255/0.16),transparent_70%)]"
          />
          <h2 className="relative mx-auto max-w-3xl font-serif text-3xl font-medium tracking-[-0.015em] text-ink-onbrand sm:text-4xl">
            Compliant for life. Provable to anyone.{" "}
            <span className="italic">PII to no one.</span>
          </h2>
          <div className="relative mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              href="/app"
              className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-surface px-6 text-base font-medium text-brand shadow-[var(--shadow-pop)] transition-all hover:bg-surface-muted active:translate-y-px"
            >
              Launch app
            </Link>
            <Link
              href="/docs"
              className="inline-flex h-12 items-center justify-center gap-2 rounded-full border border-white/30 px-6 text-base font-medium text-ink-onbrand transition-colors hover:bg-white/10 active:translate-y-px"
            >
              Read the docs
            </Link>
          </div>
        </div>
      </section>
    </ScrollFx>
  );
}
