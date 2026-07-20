"use client";

import { useState } from "react";
import { Button, Card, Mono, PageHeader } from "@/components/ui";
import { StatusBadge } from "@/components/status-badge";
import { PROVING_STEPS } from "@/lib/proving-steps";
import { cn } from "@/lib/cn";
import { generateEligibilityProof, commitmentToHex, type ProofResult } from "@/lib/prove";
import { deriveIdentity, identityDerivationMessage } from "@/lib/identity";
import { deployTxUrl } from "@/lib/chain";
import { useCsprClick, publicKeyToAccountHash } from "@/lib/csprclick";
import { ASSET_ID } from "@/lib/chain";

type OnboardResult = {
  account: string;
  deployHash: string;
  nullifier?: string;
  storedProofSha256?: string;
  screenScope?: string;
};

export function InvestorProving() {
  const { account, signMessage } = useCsprClick();
  const [step, setStep] = useState(0);
  const [proving, setProving] = useState(false);
  const [proof, setProof] = useState<ProofResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [linkedEth, setLinkedEth] = useState("");
  const [onboard, setOnboard] = useState<OnboardResult | null>(null);
  // the CONNECTED wallet is the holder; its account hash binds the credential.
  const walletPublicKey = account?.public_key ?? null;
  const walletAccount = walletPublicKey ? publicKeyToAccountHash(walletPublicKey) : null;
  const total = PROVING_STEPS.length;
  const done = step >= total - 1;
  const onProveStep = PROVING_STEPS[step]?.key === "prove";

  // Full onboarding, all gates blocking:
  // 1. wallet signs the identity-derivation message -> identitySecret/salt derived and
  //    kept IN THIS BROWSER; only Poseidon(identitySecret) goes to the server
  // 2. wallet signs a server-issued single-use bind nonce (proves account control)
  // 3. demo issuer signs the claim set for the identity commitment
  // 4. groth16 proof generated in-browser from the locally assembled witness
  // 5. server verifies proof + public-input binding + sanctions screen, then attests
  //    with 2 server-held demo keys (single trust domain — labeled honestly)
  async function runProof(): Promise<void> {
    if (!walletAccount || !walletPublicKey) {
      setError("Connect your Casper wallet to onboard.");
      return;
    }
    setProving(true);
    setError(null);
    setOnboard(null);
    try {
      const account = walletAccount;

      // (1) derive the wallet-held identity secret — the signature never leaves here.
      const idSig = await signMessage(identityDerivationMessage(account, ASSET_ID), walletPublicKey);
      if (!idSig || idSig.cancelled || !idSig.signature) {
        throw new Error("identity signature required — it derives your private identity secret");
      }
      const identity = await deriveIdentity(idSig.signature);

      // (2) prove control of the account: sign the server's single-use bind nonce.
      const bRes = await fetch("/api/bind", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ account }),
      });
      const bind = (await bRes.json()) as { nonce?: string; message?: string; error?: string };
      if (!bind.nonce || !bind.message) throw new Error(bind.error ?? "bind nonce failed");
      const bindSig = await signMessage(bind.message, walletPublicKey);
      if (!bindSig || bindSig.cancelled || !bindSig.signature) {
        throw new Error("bind signature required — onboarding is blocked without proof of wallet control");
      }

      // (3) demo issuer signs the claim set for our identity commitment.
      const cRes = await fetch("/api/claims", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          account,
          publicKey: walletPublicKey,
          nonce: bind.nonce,
          signature: bindSig.signature,
          idCommit: identity.idCommit,
        }),
      });
      const claims = (await cRes.json()) as { input?: Record<string, unknown>; error?: string };
      if (!claims.input) throw new Error(claims.error ?? "claims failed");

      // (4) assemble the full witness LOCALLY (secret + salt never sent) and prove.
      const witness = {
        ...claims.input,
        identitySecret: identity.identitySecret.toString(),
        salt: identity.salt.toString(),
      };
      const result = await generateEligibilityProof(witness);
      setProof(result);
      setStep((s) => Math.min(total - 1, s + 1));

      // (5) onboard — server verifies everything and stores THIS proof on-chain.
      const oRes = await fetch("/api/onboard", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          account,
          publicKey: walletPublicKey,
          nonce: bind.nonce,
          signature: bindSig.signature,
          proof: result.proof,
          publicSignals: result.publicSignals,
          linkedEthAddress: linkedEth.trim() || undefined,
        }),
      });
      const ob = (await oRes.json()) as {
        deployHash?: string;
        nullifier?: string;
        storedProofSha256?: string;
        screen?: { meta?: { scope?: string } };
        error?: string;
      };
      if (!ob.deployHash) throw new Error(ob.error ?? "onboard rejected");
      setOnboard({
        account,
        deployHash: ob.deployHash,
        nullifier: ob.nullifier,
        storedProofSha256: ob.storedProofSha256,
        screenScope: ob.screen?.meta?.scope,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setProving(false);
    }
  }

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Prove eligibility privately"
        title="Prove eligibility"
        description="Prove eligibility in zero-knowledge. Your identity secret is derived from a wallet signature and stays in this browser — only the proof and its public signals are submitted. Claims are signed by the demo issuer (no external KYC provider is integrated)."
        actions={
          <span className="inline-flex items-center gap-2 rounded-full border border-active/20 bg-active-subtle px-3 py-1.5 text-xs font-medium text-active">
            <span aria-hidden>🔒</span> Zero-knowledge
          </span>
        }
      />

      <div className="grid gap-8 lg:grid-cols-[1fr_1.1fr] lg:items-start">
        <ol className="space-y-2">
          {PROVING_STEPS.map((s, i) => {
            const state = i < step ? "done" : i === step ? "current" : "upcoming";
            return (
              <li
                key={s.key}
                className={cn(
                  "flex gap-3 rounded-lg border p-4 transition-colors",
                  state === "current" && "border-brand-border bg-brand-subtle",
                  state === "done" && "border-border bg-surface",
                  state === "upcoming" && "border-border bg-surface opacity-60",
                )}
              >
                <span
                  className={cn(
                    "grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs font-semibold",
                    state === "done" && "bg-active text-ink-onbrand",
                    state === "current" && "bg-brand text-ink-onbrand",
                    state === "upcoming" && "bg-surface-inset text-ink-subtle",
                  )}
                >
                  {state === "done" ? "✓" : i + 1}
                </span>
                <div>
                  <p className="text-sm font-medium text-ink">{s.title}</p>
                  <p className="mt-0.5 text-sm leading-relaxed text-ink-muted">{s.body}</p>
                </div>
              </li>
            );
          })}
        </ol>

        <Card className="p-6">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium uppercase tracking-[0.08em] text-ink-subtle">
              Credential
            </span>
            <StatusBadge status={done ? "ACTIVE" : step >= 3 ? "PENDING" : "NONE"} />
          </div>

          <div className="mt-6 rounded-lg border border-border bg-canvas p-5">
            <p className="text-sm font-medium text-ink">{PROVING_STEPS[step].title}</p>
            <p className="mt-2 text-sm leading-relaxed text-ink-muted">
              {PROVING_STEPS[step].body}
            </p>
          </div>

          <div className="mt-5 flex items-center gap-2 rounded-md bg-active-subtle px-3 py-2 text-xs text-active">
            <span aria-hidden>🔒</span>
            Your identity secret and witness stay in this browser — only the proof is sent.
          </div>

          <label className="mt-4 block">
            <span className="mb-1.5 block text-xs font-medium uppercase tracking-[0.08em] text-ink-subtle">
              Linked ETH address (optional)
            </span>
            <input
              type="text"
              value={linkedEth}
              onChange={(e) => setLinkedEth(e.target.value)}
              placeholder="0x… — screened against the live OFAC SDN ETH list"
              spellCheck={false}
              className="w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-xs font-mono text-ink"
            />
            <span className="mt-1 block text-[11px] leading-relaxed text-ink-subtle">
              The live OFAC list holds ETH addresses, so only a linked ETH address can match it.
              Casper-account matching uses a labeled demo denylist (illustrative).
            </span>
          </label>

          {proof && (
            <div className="mt-5 space-y-2 rounded-lg border border-active/30 bg-active-subtle p-4 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-active">Proof generated client-side</span>
                <span className="text-active">{(proof.ms / 1000).toFixed(2)}s</span>
              </div>
              <Row term="Commitment">
                <Mono>{commitmentToHex(proof.commitment).slice(0, 14)}…</Mono>
              </Row>
              <Row term="Nullifier">
                <Mono>{commitmentToHex(proof.nullifier).slice(0, 14)}…</Mono>
              </Row>
              <p className="leading-relaxed text-ink-subtle">
                Only the proof + these public signals are submitted — your identity secret and
                witness stay in this browser.
              </p>
            </div>
          )}

          {onboard && (
            <div className="mt-4 space-y-2 rounded-lg border border-active/40 bg-active-subtle p-4 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-active">Credential live on-chain</span>
                <span aria-hidden className="text-base">✓</span>
              </div>
              <Row term="Holder"><Mono>0x{onboard.account.slice(0, 10)}…</Mono></Row>
              <Row term="Attest tx">
                <a href={deployTxUrl(onboard.deployHash)} target="_blank" rel="noreferrer"
                   className="underline decoration-dotted underline-offset-2 hover:text-active">
                  <Mono>{onboard.deployHash.slice(0, 10)}… ↗</Mono>
                </a>
              </Row>
              {onboard.storedProofSha256 && (
                <Row term="Stored proof (sha256)">
                  <Mono>{onboard.storedProofSha256.slice(0, 14)}…</Mono>
                </Row>
              )}
              <p className="leading-relaxed text-ink-subtle">
                Your proof was verified server-side and stored on-chain (your own proof bytes —
                what any fraud challenge would re-verify). The attestation is co-signed by two
                server-held demo keys from a single trust domain; the registry verifies both
                signatures on-chain against its 3-key set. You can now hold the asset.
              </p>
            </div>
          )}

          {error && (
            <p className="mt-4 rounded-md bg-enforce-subtle px-3 py-2 text-xs text-enforce">
              Proof generation failed: {error}
            </p>
          )}

          <div className="mt-6 flex gap-3">
            <Button
              variant="secondary"
              size="md"
              disabled={step === 0 || proving}
              onClick={() => setStep((s) => Math.max(0, s - 1))}
            >
              Back
            </Button>
            {onProveStep ? (
              <Button size="md" className="flex-1" disabled={proving} onClick={runProof}>
                {proving ? "Proving + onboarding…" : "Prove + onboard"}
              </Button>
            ) : (
              <Button
                size="md"
                className="flex-1"
                disabled={done}
                onClick={() => setStep((s) => Math.min(total - 1, s + 1))}
              >
                {done ? "Credential active" : step === 0 ? "Connect wallet" : "Continue"}
              </Button>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}

function Row({ term, children }: { term: string; children: React.ReactNode }): React.ReactElement {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-ink-subtle">{term}</span>
      <span className="text-ink">{children}</span>
    </div>
  );
}
