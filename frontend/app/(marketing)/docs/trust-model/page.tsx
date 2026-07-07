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
        Onboarding eligibility proofs are verified <strong>off-chain</strong> by the quorum, which
        then co-signs. The registry stores the signed credential commitment and checks the
        quorum&apos;s signatures on-chain — it does <strong>not</strong> run a SNARK verification at
        onboarding. On-chain pairing verification isn&apos;t cost-viable on Casper today, so Writ
        verifies off-chain and commits on-chain, and says so plainly.
      </p>
      <p>
        The expensive on-chain Groth16 verification runs in exactly one place: the{" "}
        <strong>fraud challenge</strong>. Every eligibility decision is published as a proof anyone
        can verify. A false attestation can be challenged on-chain — the verifier re-checks the
        credential&apos;s own stored proof, and if it&apos;s invalid the quorum that signed it gets
        its bond slashed, the credential is revoked for fraud, and the remainder is burned. The
        expensive cryptography is paid only in a dispute, never on the happy path.
      </p>
      <Callout title="Security in one line">
        Security holds as long as the verifier quorum is honest — <em>or</em> any single honest
        watcher challenges a bad attestation during the dispute window. A 1-of-N trust model the
        issuer can backstop itself.
      </Callout>
    </DocArticle>
  );
}
