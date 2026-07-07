import type { Metadata } from "next";
import Link from "next/link";
import { DocArticle, Proof } from "@/components/docs";
import { DOCS_TX } from "@/lib/docs-nav";
import { CONTRACTS, deployTxUrl, deployUrl, accountUrl, REGULATED_HOLDER } from "@/lib/chain";

export const metadata: Metadata = { title: "Verify it yourself" };

export default function DocsVerify() {
  return (
    <DocArticle
      slug="verify"
      title="Verify it yourself"
      description="This isn't a slideshow. The contracts are live on Casper testnet; every claim is backed by a confirmed on-chain transaction."
    >
      <p>Click through — each lands on the real, confirmed deploy on testnet.cspr.live:</p>
      <div className="space-y-3">
        <Proof
          href={deployTxUrl(DOCS_TX.kicker)}
          label="A sanctioned sender's transfer REVERTS"
          detail="The kicker — the recipient-aware CEP-78 filter blocks it on-chain (filter error 159)."
        />
        <Proof
          href={deployTxUrl(DOCS_TX.recipientDeny)}
          label="A transfer to an ineligible recipient REVERTS"
          detail="Recipient-aware: the destination must hold a live credential too."
        />
        <Proof
          href={deployTxUrl(DOCS_TX.regulatedAttest)}
          label="A credential attested with a real ZK commitment"
          detail="The regulator surface recomputes Poseidon(claims) and matches this exact on-chain value."
        />
        <Proof
          href={deployTxUrl(DOCS_TX.fraudSlash)}
          label="A fraudulent attestation is slashed — and 110 CSPR burned"
          detail="resolve re-verifies the credential's own proof on-chain (Groth16 → false), revokes it for fraud, slashes the signers' bonds (500), pays the challenger, and burns the remainder to the treasury."
        />
      </div>
      <p className="text-sm text-ink-subtle">
        The live registry, NFT contract, and the regulated holder are all on{" "}
        <Link href={deployUrl(CONTRACTS.registry.pkg)} target="_blank" rel="noreferrer" className="text-brand underline-offset-2 hover:underline">
          testnet.cspr.live
        </Link>
        . Run the commitment match yourself in the{" "}
        <Link href="/app/regulator" className="text-brand underline-offset-2 hover:underline">
          Regulator surface
        </Link>{" "}
        — it verifies against{" "}
        <Link href={accountUrl(REGULATED_HOLDER.holder)} target="_blank" rel="noreferrer" className="text-brand underline-offset-2 hover:underline">
          a real holder
        </Link>
        .
      </p>
    </DocArticle>
  );
}
