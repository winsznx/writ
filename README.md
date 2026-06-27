# Writ

**Privacy-preserving, agent-operated compliance for tokenized real-world assets on Casper.**

> Writ keeps a tokenized real-world asset compliant for life — every holder provably eligible, continuously re-screened, blocked on-chain the moment they're not — without the issuer ever touching a single piece of investor PII, and with a cryptographic audit trail the regulator can verify themselves.

`Casper Agentic Buildathon 2026 · Casper Innovation Track`

## What Writ is

An autonomous, privacy-preserving compliance + lifecycle-governance layer for tokenized RWA. Its one job: keep the asset legal and private across its entire on-chain life — entry eligibility, transfer gating, runtime re-screening, and selective disclosure. Investors prove eligibility in zero-knowledge so the issuer (and the agent, and the chain) never custody investor PII, while a native CEP-78 transfer filter enforces who may hold or receive the asset on every transfer.

## Status

**Architecture locked. CEP-78 recipient-gating substrate proven on live Casper testnet (real txs, node 2.2.1):** the patched 441KB CEP-78 wasm installs live; a transfer to an eligible recipient PROCEEDS (on-chain state confirms the move) while a transfer to an ineligible recipient is DENIED (revert 159); mint-to-denied PROCEEDS (so issuance is gated separately at mint); and a panic/unreachable filter DENIES fail-safe (token never moves). Per-transfer cost ≈ 0.87 CSPR. Next: sequenced build, component by component.

## The claim (verbatim — do not deviate)

> *Eligibility proven in zero-knowledge, verified by a threshold of autonomous agents; the chain stores signed credentials, enforces compliance at every transfer via a native CEP-78 filter, and exposes published proofs for on-chain fraud challenge, with off-chain selective disclosure to regulators.*

**Never** "on-chain SNARK verification." On-chain SNARK verification on Casper is not cost-viable (no native EC-pairing host function on testnet); Writ verifies **off-chain** and commits **on-chain**, with an optimistic on-chain Groth16 fraud-proof path for disputes.

## Repository structure

```
docs/        PRD.md (full product spec) + FRONTEND.md (frontend build guide)
contracts/   patched CEP-78 (recipient-aware filter) + Credential Registry (Odra) — backend phase
agent/       verifier quorum + autonomous re-screening agent — backend phase
frontend/    Next.js app per docs/FRONTEND.md — frontend PRs land here
```

## Tech stack

- **Contracts:** Odra 2.8.x + **patched CEP-78** (Casper 2.0, `vm_casper_v1`)
- **ZK:** Circom v2 / snarkjs / **Groth16-BN254** prover, **arkworks** (`ark-groth16` / `ark-bn254`) verifier (off-chain, <10ms)
- **Agent:** Railway, MCP-driven (CSPR.cloud), **OFAC SDN** sanctions screening
- **Frontend:** Next.js (App Router, TypeScript, Tailwind)
- **Infra:** casper-client 5.0.1 (`put-deploy`), Casper testnet, testnet.cspr.live explorer

## Docs

- [docs/PRD.md](docs/PRD.md) — full product requirements (problem, architecture, enforcement model, trust model, build plan)
- [docs/FRONTEND.md](docs/FRONTEND.md) — frontend build guide
