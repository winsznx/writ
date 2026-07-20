import type { Metadata } from "next";
import { DocArticle, Step } from "@/components/docs";

export const metadata: Metadata = { title: "How it works" };

export default function DocsHowItWorks() {
  return (
    <DocArticle
      slug="how-it-works"
      title="How it works"
      description="Three moves: private onboarding, gated transfer, and regulator disclosure."
    >
      <Step n="01" title="Private onboarding">
        The investor proves eligibility — accredited, in-jurisdiction, not sanctioned — in
        zero-knowledge, <strong>in their browser</strong>. The identity secret is derived from a
        wallet signature and stays in the browser; the eligibility claims are signed by a{" "}
        <strong>demo issuer</strong> (no external KYC provider is integrated). The server verifies
        the proof off-chain, binds every public input, runs sanctions screening (live OFAC ETH
        list for a linked address; a labeled demo denylist for Casper accounts), and co-signs with
        two server-held demo keys — a single trust domain, verified 2-of-3 by the registry
        on-chain. The credential stored on-chain includes the holder&apos;s own proof bytes.
      </Step>
      <Step n="02" title="Gated transfer">
        The asset is a real CEP-78 NFT wired to a recipient-aware transfer filter. Every transfer
        checks that <strong>both sender and recipient</strong> hold a live credential — and is{" "}
        <strong>denied by default</strong>. A sanctioned or ineligible party can&apos;t send or
        receive; the transfer reverts on-chain.
      </Step>
      <Step n="03" title="Regulator disclosure">
        Any single compliance fact is provable to a regulator on demand. The holder reveals the
        preimage of their commitment peer-to-peer; the regulator recomputes the Poseidon commitment
        and checks it equals the on-chain value — byte-for-byte. Nothing else about that holder, or
        any other, is revealed. There is no escrow and no ciphertext: the holder keeps their claims.
      </Step>
    </DocArticle>
  );
}
