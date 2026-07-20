import type { Metadata } from "next";
import { DocArticle, Callout } from "@/components/docs";

export const metadata: Metadata = { title: "The trust model" };

export default function DocsTrustModel() {
  return (
    <DocArticle
      slug="trust-model"
      title="The trust model — stated precisely"
      description="What is verified where, and what we never claim."
    >
      <p>
        Onboarding eligibility proofs are verified <strong>off-chain</strong> by the server, which
        then co-signs. In this demo the two attestation signatures come from{" "}
        <strong>one server process holding two env keys — a single trust domain</strong>, not
        independent verifiers; what the chain checks is real: the registry verifies both ed25519
        signatures against its registered 3-key set (threshold 2) and stores the credential. It
        does <strong>not</strong> run a SNARK verification at onboarding — Writ verifies off-chain
        and commits on-chain, and says so plainly.
      </p>
      <p>
        The on-chain Groth16 verification runs in exactly one place: the{" "}
        <strong>fraud challenge</strong>. Every credential stores the holder&apos;s own proof and
        public inputs. A false attestation can be challenged on-chain — <code>resolve</code>{" "}
        re-checks the credential&apos;s stored proof, and if it&apos;s invalid the signers&apos;
        bonds are slashed, the credential is revoked for fraud, the challenger is paid, and the
        remainder is <strong>transferred to the treasury account</strong> (a spendable account —
        not destroyed; we do not call this a burn). The expensive cryptography is paid only in a
        dispute, never on the happy path.
      </p>
      <p>
        Other trust facts, stated plainly: the eligibility claims are signed by a{" "}
        <strong>demo issuer key</strong> (no external KYC provider); the officer role is a{" "}
        <strong>single demo key</strong>, not a multisig; the Groth16 trusted setup is a{" "}
        <strong>single-contribution dev ceremony</strong> (demo-grade); the Odra contract packages
        are installed <strong>locked</strong> (non-upgradable) while the CEP-78 NFT package remains
        upgradable by the installer key.
      </p>
      <Callout title="Security in one line">
        Security holds as long as the attestation operator is honest — <em>or</em> any single
        honest watcher challenges a bad attestation during the dispute window. A 1-of-N trust
        model the issuer can backstop itself.
      </Callout>
    </DocArticle>
  );
}
