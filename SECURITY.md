# Security Policy

Writ is a privacy-preserving compliance layer for tokenized real-world assets on
Casper. This document describes what is in scope, the trust model, and how to report
a vulnerability responsibly.

## Scope & status

- **This is a testnet demo.** All contracts are deployed on **casper-test** (Casper 2.x).
  Nothing here is on mainnet and nothing custodies real value.
- The quorum, coordinator, and treasury keys used by the live demo are **throwaway
  testnet keys**, generated for the demo and never used elsewhere. Real keys are never
  committed (see the note on secrets below).
- Admin roles on the demo registry are **not yet renounced** — they are intentionally
  held for a final hardening step so the demo instance can be maintained. In a
  production deployment these roles would be renounced or moved to a multisig.

## Trust model (stated precisely — no overclaim)

- **Onboarding is verified off-chain.** The investor generates a Groth16 eligibility
  proof in the browser (claims never leave the device). A server-side 2-of-3 quorum
  verifies that proof off-chain (snarkjs) and runs live OFAC SDN screening, then
  co-signs. The on-chain `registry.attest` entrypoint verifies the **ed25519 quorum
  signatures** and binds the published `public_inputs[0:64]` to the commitment — it does
  **not** run a SNARK verifier at onboarding.
- **On-chain Groth16 verification runs only in the fraud-challenge path.** A challenger
  bonds CSPR, disputes a credential, and `challenge.resolve` cross-calls the on-chain
  verifier against the credential's own stored proof. If it is invalid, the signing
  attestors are slashed, the credential is revoked for fraud, and the remainder is
  burned to the treasury.
- **Security holds** as long as the verifier quorum is honest **or** any single honest
  watcher challenges a bad attestation during the dispute window (a 1-of-N trust model).
- **Enforcement is fail-safe deny.** Every CEP-78 transfer calls a recipient-aware
  filter that checks both sender and recipient hold a live credential; anything else
  reverts on-chain.
- **Disclosure is Poseidon-commitment-only.** There is no escrow and no ciphertext. The
  holder keeps the preimage and reveals it peer-to-peer; a regulator recomputes
  `Poseidon(claims)` and checks it equals the on-chain commitment. No investor PII is
  stored on- or off-chain.

The adversarial analysis (griefing invariant, self-slash deterrence, public-input
binding, idempotent resolve, first-challenge-wins, freeze-blocks-refresh) is documented
in [ADVERSARIAL_TESTING.md](./ADVERSARIAL_TESTING.md).

## What is explicitly not claimed

- No on-chain SNARK verification at onboarding.
- No ciphertext escrow or encrypted-claims store.
- No 24/7 re-screening daemon over the whole holder base — re-screening runs at
  onboarding and on refresh.
- No shipped "watchtower" service — the 1-of-N watcher is a role the issuer can run.
- x402 payment for live compliance data is designed for but **not wired**.

## Reporting a vulnerability

Please report suspected vulnerabilities **privately** — do not open a public issue for a
security bug.

- Preferred: open a private **GitHub Security Advisory** on this repository
  (`Security` tab → `Report a vulnerability`).
- Or email the maintainer at the address on the GitHub profile.

Please include a description, affected component (contract / server / frontend), and a
reproduction if possible. As a testnet demo maintained by a small team, we aim to
acknowledge reports within a few days.

## Handling of secrets

Private keys and environment secrets are never committed. `internal/`, `*.pem`, and
`.env*` are gitignored, and the git history has been scanned to confirm no key or
secret value has ever been committed.
