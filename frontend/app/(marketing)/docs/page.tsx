import type { Metadata } from "next";
import Link from "next/link";
import { Container, Eyebrow, Mono } from "@/components/ui";
import { CONTRACTS, deployUrl, deployTxUrl, accountUrl, REGULATED_HOLDER } from "@/lib/chain";
import { SITE } from "@/lib/site";

export const metadata: Metadata = {
  title: "Docs",
  description:
    "How Writ works: privacy-preserving, ERC-3643-style compliance for tokenized RWA on Casper — verified off-chain, committed on-chain, enforced at every transfer.",
};

const LIVE = "https://writ-app-production.up.railway.app";

// Real, confirmed v4 testnet deploys — clickable proof.
const TX = {
  kicker: "3448182cb432dd4278551dc378a8485c7ee9cb09b3c619101ea37efb34a17b1d",
  recipientDeny: "ce0f1a3a03131a4de663d04d60243aa4c261a9f0eab24acf55a4f5af9a26a2ad",
  regulatedAttest: "f3fd7cbba19ef1195d70df72bc3ea073da4b6f78899c261ffadbc305d7a86645",
  fraudSlash: "0ae7aecdf9510e34db2e6a2f392630843bbd11176f067124d01f2012d0e00c83",
};

const NAV = [
  { id: "what", label: "What Writ is" },
  { id: "problem", label: "The problem" },
  { id: "how", label: "How it works" },
  { id: "trust", label: "The trust model" },
  { id: "verify", label: "Verify it yourself" },
  { id: "architecture", label: "Architecture" },
];

export default function DocsPage() {
  return (
    <Container className="py-12 sm:py-16">
      <div className="lg:grid lg:grid-cols-[200px_1fr] lg:gap-12">
        {/* Section nav */}
        <nav className="mb-8 lg:mb-0">
          <div className="lg:sticky lg:top-24">
            <p className="mb-3 hidden text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-subtle lg:block">
              On this page
            </p>
            <ul className="flex gap-2 overflow-x-auto border-b border-border pb-2 lg:flex-col lg:gap-0.5 lg:border-b-0 lg:pb-0">
              {NAV.map((s) => (
                <li key={s.id} className="shrink-0">
                  <a
                    href={`#${s.id}`}
                    className="block whitespace-nowrap rounded-md px-3 py-1.5 text-sm text-ink-muted transition-colors hover:bg-surface-muted hover:text-ink lg:border-l-2 lg:border-transparent lg:hover:border-brand-border"
                  >
                    {s.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </nav>

        {/* Content */}
        <article className="max-w-2xl space-y-16">
          <header>
            <Eyebrow>Documentation</Eyebrow>
            <h1 className="mt-4 font-serif text-[2.4rem] font-medium leading-[1.05] tracking-[-0.02em] text-ink sm:text-5xl">
              How Writ works
            </h1>
            <p className="mt-5 text-lg leading-relaxed text-ink-muted">
              Privacy-preserving, ERC-3643-style compliance for tokenized real-world assets on
              Casper. Every holder provably eligible, re-screened against live data, and blocked
              on-chain the moment they aren&apos;t — with zero investor PII on screen.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link href="/app" className="text-sm font-medium text-brand underline-offset-2 hover:underline">
                Launch the app →
              </Link>
              <Link href={SITE.github} target="_blank" rel="noreferrer" className="text-sm font-medium text-ink-muted underline-offset-2 hover:text-ink hover:underline">
                Read the source on GitHub →
              </Link>
            </div>
          </header>

          <Section id="what" title="What Writ is">
            <p>
              Tokenizing a real-world asset is the easy part. Keeping it compliant for its entire
              on-chain life — every holder eligible, every transfer screened, every change enforced —
              is the blocker institutions stall on. Writ is the compliance primitive that solves it.
            </p>
            <p>
              It speaks the institutional security-token model the industry already trusts:{" "}
              <strong className="font-medium text-ink">identity, claims, compliance rules, transfer
              restrictions</strong> — the ERC-3643 / T-REX model. Casper has joined the{" "}
              <strong className="font-medium text-ink">ERC-3643 Association</strong>, the standards
              body for compliant RWA tokenization; Writ brings that standard&apos;s model to Casper&apos;s
              native account and weighted-multisig model, built on the recommended Casper stack —{" "}
              <Mono>Odra</Mono> contracts, <Mono>CSPR.click</Mono> wallet, <Mono>CSPR.cloud</Mono> reads.
            </p>
          </Section>

          <Section id="problem" title="The problem it removes">
            <div className="grid gap-4 sm:grid-cols-2">
              <Callout title="The PII honeypot">
                Conventional compliance forces the issuer to custody a mountain of investor PII —
                passports, accreditation, addresses. The data you collect to be compliant becomes the
                thing that gets you sued.
              </Callout>
              <Callout title="Point-in-time KYC fails">
                Sanctions lists update, accreditation lapses, jurisdictions change rules. &ldquo;Pass
                once, in forever&rdquo; is exactly what regulators keep fining firms for. Compliance is
                a runtime engine, not a checkbox.
              </Callout>
            </div>
            <p>
              Writ keeps the compliance and throws away the honeypot: the issuer holds{" "}
              <strong className="font-medium text-ink">only pseudonymous commitments</strong> — never a
              single piece of investor PII.
            </p>
          </Section>

          <Section id="how" title="How it works">
            <Step n="01" title="Private onboarding">
              The investor proves eligibility — accredited, in-jurisdiction, not sanctioned — in
              zero-knowledge, <strong className="font-medium text-ink">in their browser</strong>. The
              claims never leave the device. A server-side 2-of-3 quorum verifies that proof off-chain
              and runs live OFAC screening, then co-signs a credential the registry commits on-chain.
            </Step>
            <Step n="02" title="Gated transfer">
              The asset is a real CEP-78 NFT wired to a recipient-aware transfer filter. Every transfer
              checks that <strong className="font-medium text-ink">both sender and recipient</strong>
              hold a live credential — and is <strong className="font-medium text-ink">denied by
              default</strong>. A sanctioned or ineligible party can&apos;t send or receive; the transfer
              reverts on-chain.
            </Step>
            <Step n="03" title="Regulator disclosure">
              Any single compliance fact is provable to a regulator on demand. The holder reveals the
              preimage of their commitment peer-to-peer; the regulator recomputes the Poseidon
              commitment and checks it equals the on-chain value — byte-for-byte. Nothing else about
              that holder, or any other, is revealed. There is no escrow and no ciphertext: the holder
              keeps their own claims.
            </Step>
          </Section>

          <Section id="trust" title="The trust model — stated precisely">
            <p>
              Onboarding eligibility proofs are verified <strong className="font-medium text-ink">off-chain</strong>{" "}
              by the quorum, which then co-signs. The registry stores the signed credential commitment
              and checks the quorum&apos;s signatures on-chain — it does{" "}
              <strong className="font-medium text-ink">not</strong> run a SNARK verification at
              onboarding. On-chain pairing verification isn&apos;t cost-viable on Casper today, so Writ
              verifies off-chain and commits on-chain, and says so plainly.
            </p>
            <p>
              The expensive on-chain Groth16 verification runs in exactly one place: the{" "}
              <strong className="font-medium text-ink">fraud challenge</strong>. Every eligibility
              decision is published as a proof anyone can verify. A false attestation can be challenged
              on-chain — the verifier re-checks the credential&apos;s own stored proof, and if it&apos;s
              invalid the quorum that signed it gets its bond slashed, the credential is revoked for
              fraud, and the remainder is burned. The expensive cryptography is paid only in a dispute,
              never on the happy path.
            </p>
            <Callout title="Security in one line">
              Security holds as long as the verifier quorum is honest — <em>or</em> any single honest
              watcher challenges a bad attestation during the dispute window. A 1-of-N trust model the
              issuer can backstop itself.
            </Callout>
          </Section>

          <Section id="verify" title="Verify it yourself">
            <p>
              This isn&apos;t a slideshow. The contracts are live on Casper testnet; every claim above is
              backed by a confirmed on-chain transaction. Click through:
            </p>
            <ul className="space-y-3">
              <Proof
                href={deployTxUrl(TX.kicker)}
                label="A sanctioned sender's transfer REVERTS"
                detail="The kicker — the recipient-aware CEP-78 filter blocks it on-chain (filter error 159)."
              />
              <Proof
                href={deployTxUrl(TX.recipientDeny)}
                label="A transfer to an ineligible recipient REVERTS"
                detail="Recipient-aware: the destination must hold a live credential too."
              />
              <Proof
                href={deployTxUrl(TX.regulatedAttest)}
                label="A credential attested with a real ZK commitment"
                detail="The regulator surface recomputes Poseidon(claims) and matches this exact on-chain value."
              />
              <Proof
                href={deployTxUrl(TX.fraudSlash)}
                label="A fraudulent attestation is slashed — and 110 CSPR burned"
                detail="resolve re-verifies the credential's own proof on-chain (Groth16 → false), revokes it for fraud, slashes the signers' bonds (500), pays the challenger, and burns the remainder to the treasury."
              />
            </ul>
            <p className="text-sm text-ink-subtle">
              The live registry, NFT contract, and the regulated holder are all on{" "}
              <Link href={deployUrl(CONTRACTS.registry.pkg)} target="_blank" rel="noreferrer" className="text-brand underline-offset-2 hover:underline">
                testnet.cspr.live
              </Link>
              . Try the commitment match yourself in the{" "}
              <Link href="/app/regulator" className="text-brand underline-offset-2 hover:underline">
                Regulator surface
              </Link>{" "}
              — it verifies against{" "}
              <Link href={accountUrl(REGULATED_HOLDER.holder)} target="_blank" rel="noreferrer" className="text-brand underline-offset-2 hover:underline">
                a real holder
              </Link>
              .
            </p>
          </Section>

          <Section id="architecture" title="Architecture overview">
            <p>Six contracts, each with one job, on casper-test:</p>
            <ul className="space-y-2.5 text-[15px]">
              <Contract pkg={CONTRACTS.registry.pkg} name="Credential Registry" job="per-holder credential (commitment, nullifier, status, bonded signer set); attest, revoke, officer actions, role grant/revoke/renounce." />
              <Contract pkg={CONTRACTS.verifier.pkg} name="Groth16 Verifier" job="on-chain pairing verification — used only by the fraud-challenge path." />
              <Contract pkg={CONTRACTS.challenge.pkg} name="Challenge" job="economic fraud disputes: bond, challenge, resolve → slash + burn, withdraw." />
              <Contract pkg={CONTRACTS.filter.pkg} name="Transfer Filter" job="the recipient-aware CEP-78 hook — checks sender and recipient are live; fail-safe deny." />
              <Contract pkg={CONTRACTS.cep78.pkg} name="Writ CEP-78" job="the RWA bond NFT (real CEP-78), wired to the filter and mint-gated." />
              <Contract pkg={CONTRACTS.token.pkg} name="Writ Token" job="the writ-token and its Odra transfer filter." />
            </ul>
            <p className="text-sm text-ink-subtle">
              The full system design, data flow, and trust model are in{" "}
              <Link href={`${SITE.github}/blob/main/ARCHITECTURE.md`} target="_blank" rel="noreferrer" className="text-brand underline-offset-2 hover:underline">
                ARCHITECTURE.md
              </Link>
              ; the closed attack surface and test coverage in{" "}
              <Link href={`${SITE.github}/blob/main/ADVERSARIAL_TESTING.md`} target="_blank" rel="noreferrer" className="text-brand underline-offset-2 hover:underline">
                ADVERSARIAL_TESTING.md
              </Link>
              .
            </p>
          </Section>

          <footer className="border-t border-border pt-8">
            <p className="text-sm text-ink-muted">
              Ready to see it block a transfer?{" "}
              <Link href="/app" className="font-medium text-brand underline-offset-2 hover:underline">
                Launch the app
              </Link>{" "}
              or read the{" "}
              <Link href={SITE.github} target="_blank" rel="noreferrer" className="font-medium text-ink underline-offset-2 hover:underline">
                source on GitHub
              </Link>
              .
            </p>
          </footer>
        </article>
      </div>
    </Container>
  );
}

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-24 space-y-4">
      <h2 className="font-serif text-2xl font-medium tracking-[-0.015em] text-ink sm:text-3xl">{title}</h2>
      <div className="space-y-4 text-[15px] leading-relaxed text-ink-muted [&_strong]:text-ink">
        {children}
      </div>
    </section>
  );
}

function Callout({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-brand-border bg-brand-subtle p-5">
      <p className="text-xs font-semibold uppercase tracking-[0.09em] text-brand">{title}</p>
      <p className="mt-2 text-[15px] leading-relaxed text-ink">{children}</p>
    </div>
  );
}

function Step({ n, title, children }: { n: string; title: string; children: React.ReactNode }) {
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

function Proof({ href, label, detail }: { href: string; label: string; detail: string }) {
  return (
    <li>
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
        <span aria-hidden className="shrink-0 pt-0.5 text-ink-subtle transition-colors group-hover:text-brand">
          ↗
        </span>
      </a>
    </li>
  );
}

function Contract({ pkg, name, job }: { pkg: string; name: string; job: string }) {
  return (
    <li className="flex flex-col gap-0.5">
      <a href={deployUrl(pkg)} target="_blank" rel="noreferrer" className="font-medium text-ink underline-offset-2 hover:text-brand hover:underline">
        {name} ↗
      </a>
      <span className="text-ink-muted">{job}</span>
    </li>
  );
}
