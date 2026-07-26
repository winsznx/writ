import type { Metadata } from "next";
import { DocArticle, Callout } from "@/components/docs";

export const metadata: Metadata = { title: "What's real vs demo" };

const LIVE: readonly [string, string][] = [
  ["Six contracts on casper-test", "locked Odra packages (registry, challenge, verifier, both filters, token) + the CEP-78 NFT — install txs in DEPLOYMENT.md"],
  ["Recipient-aware CEP-78 transfer gating", "real reverts (user error 159) for sanctioned sender, ineligible recipient, and post-fraud holder — clickable on Verify"],
  ["On-chain Groth16 verification in the challenge path", "the fraud slash tx consumed ~80 CSPR running the pairing check inside the contract"],
  ["Economic slash", "500 CSPR slashed, 640 to the challenger, 110 transferred to the treasury account (spendable — a treasury transfer, not a burn)"],
  ["In-browser proof generation", "snarkjs Groth16 against the real eligibility circuit; identity secret derived from a wallet signature, never sent to the server"],
  ["On-chain public-input binding", "registry rejects an attest whose public inputs don't match the credential's nullifier + commitment; the server pins issuer key, asset, and jurisdiction root; the hardened registry code can pin all six on-chain (set_canonical_inputs, unit-tested) — the deployed instance predates that entrypoint"],
  ["Live sanctions data fetch", "the OFAC SDN digital-currency (ETH) list is fetched live with content hash + timestamp; unavailable or stale data blocks attestation"],
  ["Selective disclosure", "regulator surface recomputes Poseidon(claims) and matches the live on-chain commitment byte-for-byte"],
];

const DEMO: readonly [string, string][] = [
  ["The claim issuer", "a demo issuer key held by this deployment signs accredited/jurisdiction/sanctioned claims — no external KYC provider is integrated"],
  ["The attestation “quorum”", "two signatures from env keys in ONE server process (single trust domain); the registry's on-chain 2-of-3 threshold check is real, the signer independence is not"],
  ["Casper-account sanctions mapping", "the live OFAC list holds ETH addresses; a linked ETH address is screened for real, while Casper-account matching uses a labeled demo denylist"],
  ["The officer role", "a single demo key, not a multisig (Casper weighted-key multisig is the documented production path)"],
  ["The trusted setup", "single-contribution dev ceremony — the proving/verifying keys are demo-grade; production requires a multi-party ceremony"],
  ["The landing terminal", "a scripted replay of the real on-chain outcomes, labeled SCRIPTED DEMO — it does not talk to the chain"],
  ["The regulator walkthrough holder", "demo holder R, whose commitment preimage is intentionally public to demonstrate voluntary disclosure"],
];

const LIMITS: readonly string[] = [
  "The circuit has no in-circuit expiry/freshness field — credential expiry is enforced on-chain by the registry (attest rejects past expiry; is_active flips at expiry), but an issuer-signed claim set itself does not expire at the ZK layer.",
  "The identity secret derives from a deterministic wallet signature — any app that convinces the wallet to sign the exact derivation message could recompute it (the standard signature-derived-key caveat; production replaces this with issuer-held credentials).",
  "The CEP-78 NFT package is upgradable by the installer key (the compliance logic it calls — registry + filter — is locked); a production deployment would lock it or move the upgrade URef to a multisig.",
  "Canonical binding covers the issuer key and jurisdiction root, which V5 pins ON-CHAIN (set_canonical_inputs) so a forged-issuer proof is rejected at attest; the asset is bound by the quorum-signed message and the per-asset credential key rather than by a public-input comparison. The challenge path itself still only answers 'is this proof valid for these stored inputs'.",
  "set_canonical_inputs is admin-gated — the deployer key can re-pin the canon; production would renounce admin (path implemented and unit-tested) or hold it behind a multisig.",
  "Bind nonces and rate limits are in-memory (single replica) — fine for the demo topology, documented for production.",
  "Live self-onboarding is currently blocked by the slash demo itself: the fraud-challenge demo slashed the demo signers' bonds, and the registry rejects attestations from unbonded signers (SignerNotBonded) — the economic gate working as designed. The app awaits on-chain execution and reports this failure honestly; re-bonding (2 × 250 CSPR testnet) restores onboarding.",
];

export default function DocsWhatsReal() {
  return (
    <DocArticle
      slug="whats-real"
      title="What's real vs demo — the reviewer page"
      description="Every claim on this site, sorted honestly: live on testnet, demo-scope, or known limitation."
    >
      <h3 className="font-semibold text-ink">Live on Casper testnet (verify each on the next page)</h3>
      <ul className="space-y-2 text-[15px]">
        {LIVE.map(([head, body]) => (
          <li key={head}>
            <strong>{head}.</strong> <span className="text-ink-muted">{body}.</span>
          </li>
        ))}
      </ul>

      <h3 className="mt-8 font-semibold text-ink">Demo-scope (labeled in the UI, not production claims)</h3>
      <ul className="space-y-2 text-[15px]">
        {DEMO.map(([head, body]) => (
          <li key={head}>
            <strong>{head}:</strong> <span className="text-ink-muted">{body}.</span>
          </li>
        ))}
      </ul>

      <h3 className="mt-8 font-semibold text-ink">Known limitations (stated, not hidden)</h3>
      <ul className="list-disc space-y-2 pl-5 text-[15px] text-ink-muted">
        {LIMITS.map((l) => (
          <li key={l.slice(0, 40)}>{l}</li>
        ))}
      </ul>

      <Callout title="The rule this page follows">
        &ldquo;Real&rdquo; is only said where code, tests, or a live transaction proves it. The
        repository&apos;s docs/final-round-hardening.md tracks every audited claim to its
        evidence.
      </Callout>
    </DocArticle>
  );
}
