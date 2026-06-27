# Writ

**The ERC-3643 / T-REX-style compliance primitive for Casper — privacy-preserving, agent-operated, on-chain enforced.**

Casper has joined the ERC-3643 Association (the standards body for compliant RWA tokenization). Writ is built on that stack: every holder proves eligibility in zero-knowledge, a threshold of autonomous agents attests on-chain, and a native CEP-78 transfer filter enforces compliance at every transfer — without the issuer or the chain ever touching investor PII.

---

## Live app

**https://writ-app-production.up.railway.app**

Product docs (how it works + verify-it-yourself): https://writ-app-production.up.railway.app/docs

---

## Verify it yourself

All contracts are live on **casper-test** (Casper 2.x). Every hash below is real and verifiable on [testnet.cspr.live](https://testnet.cspr.live).

### V4 canonical contracts

| Contract | Role | Package hash (stable address) |
|---|---|---|
| groth16-verifier | On-chain Groth16 pairing verify — fraud-challenge path only | [2bc9a855](https://testnet.cspr.live/contract-package/2bc9a8556c75ee912bab4f7d2cf2622863d1f1e29eb5cf68685a52d6a718ff61) |
| credential-registry | Per-holder credential: attest, revoke, freeze, status | [2e19e2bf](https://testnet.cspr.live/contract-package/2e19e2bfc5383fd51103ee54fb430b53ec7a1a63c83a7841e08f00b188653fca) |
| challenge | Economic fraud disputes: bond → challenge → resolve (slash/burn) | [c1080d67](https://testnet.cspr.live/contract-package/c1080d67eed0c4945eadd84bc016d3b183a650086e39de60fb9c96cfe59dda34) |
| transfer-filter | CEP-78 hook — checks sender AND recipient; fail-safe deny | [d84a9321](https://testnet.cspr.live/contract-package/d84a932187624c1c982ed5c6dcbd1961fe370f732ce02fcbc0fe3e5e28389726) |
| writ-cep78 | RWA bond NFT (real CEP-78), wired to the filter | [ad407c6b](https://testnet.cspr.live/contract-package/ad407c6bccbfc13e9fef28a03b75b175b0d186d3205952be684934c8dcb59bbe) |
| writ-token | Writ fungible token + Odra transfer filter | [512068de](https://testnet.cspr.live/contract-package/512068de722212ce497cb081049649339f0a8994394328164f3dde52c4ab8a3e) |

### V4 proof transactions

| What it proves | Deploy hash |
|---|---|
| Regulated holder attest — genuine Poseidon commitment on-chain | [f3fd7cbb](https://testnet.cspr.live/deploy/f3fd7cbba19ef1195d70df72bc3ea073da4b6f78899c261ffadbc305d7a86645) |
| Kicker — transfer from a sanctioned sender reverts (filter error 159) | [3448182c](https://testnet.cspr.live/deploy/3448182cb432dd4278551dc378a8485c7ee9cb09b3c619101ea37efb34a17b1d) |
| Recipient-aware deny — transfer to ineligible recipient reverts (159) | [ce0f1a3a](https://testnet.cspr.live/deploy/ce0f1a3a03131a4de663d04d60243aa4c261a9f0eab24acf55a4f5af9a26a2ad) |
| Fraud slash — resolve → Groth16 FALSE → slash 500 + burn 110 CSPR | [0ae7aecd](https://testnet.cspr.live/deploy/0ae7aecdf9510e34db2e6a2f392630843bbd11176f067124d01f2012d0e00c83) |
| Post-fraud transfer reverts — RevokedFraud holder blocked (159) | [8922e979](https://testnet.cspr.live/deploy/8922e979320ba28f38cab32b107893a5f868ec07281c9790c8b57d2b2c5786f9) |

---

## How it works

### The honest architecture (do not overclaim)

```
Investor browser          Agent quorum (2-of-3)        Casper testnet
─────────────────         ──────────────────────        ───────────────
generate Groth16          verify proof OFF-CHAIN        registry.attest()
proof in-browser          (snarkjs)                       - verifies ed25519
(snarkjs; claims          + OFAC SDN screening            quorum signatures
never leave device)       co-sign credential              - binds public_inputs
        │                         │                        to nullifier/commitment
        └──────────────────────→ sign ──────────────────→  - stores commitment
```

**Onboarding**: proof generated and verified off-chain; the chain stores signed credentials. The on-chain `attest` entrypoint verifies ed25519 quorum signatures and binds the published `public_inputs[0:64]` to the commitment. It does **not** run a Groth16/SNARK verifier at onboarding — that is the honest, correct framing.

**On-chain Groth16 verification** happens only in the fraud-challenge path: a challenger bonds 250 CSPR, claims a credential is fraudulent, and `challenge.resolve` cross-calls the groth16-verifier. If the proof is FALSE the attestors are slashed and the excess is burned.

**Selective disclosure**: Poseidon-commitment only — no ciphertext, no escrow. The holder keeps the preimage and reveals it peer-to-peer to a regulator, who recomputes `Poseidon(claims)` and checks it equals the on-chain commitment byte-for-byte.

**Transfer gating**: every CEP-78 transfer calls the `transfer-filter` hook, which checks both sender and recipient against the registry. Ineligible parties are denied by default (fail-safe deny).

### Challenge economics

| Parameter | Value |
|---|---|
| Attestor bond | 250 CSPR |
| Challenger bond | 250 CSPR |
| Challenger reward | 300 CSPR |
| Gas allowance | 90 CSPR |
| Reward cap | 390 CSPR |
| Burn to treasury | 110 CSPR (500 slashed − 390 reward cap) |
| On-chain Groth16 gas | ~79.29 CSPR |

Griefing invariant: `A = G + R + B` — a successful challenger is made whole on gas + reward and refunded their bond; the rest is burned. Self-slash deterrence: residual `A − R`.

---

## Stack

| Layer | Technology |
|---|---|
| Smart contracts | [Odra](https://odra.dev) 2.8.x (the recommended Casper contract framework) |
| Wallet | [CSPR.click](https://cspr.click) (recommended Casper wallet connector) |
| Chain reads | [CSPR.cloud](https://cspr.cloud) (recommended Casper data layer) |
| ZK / proofs | Circom v2 + snarkjs, Groth16-BN254 |
| Agent quorum | Node.js server-side 2-of-3, runs in the app on Railway |
| Sanctions screening | OFAC SDN live screen at onboarding |
| Frontend | Next.js 16 / React 19, TypeScript, Tailwind, deployed on Railway |
| Network | Casper testnet (`casper-test`, Casper 2.x) |

---

## Test coverage

| Suite | Result |
|---|---|
| credential-registry | 49/49 (both Odra backends) |
| challenge | 18/18 |
| integration lifecycle | full onboard → freeze → revoke → refresh cycle |
| disclosure | 14/14 (recompute Poseidon == live on-chain commitment, byte-for-byte) |

---

## Quickstart

### Run the frontend locally

```bash
cd frontend
npm install
npm run dev
# → http://localhost:3000
```

### Explore the contracts

```
contracts/
  groth16-verifier/      # on-chain Groth16 pairing verifier (Odra)
  credential-registry/   # per-holder credential store
  challenge/             # economic fraud-dispute contract
  transfer-filter/       # CEP-78 transfer hook (recipient-aware, fail-safe deny)
  writ-cep78/            # RWA bond NFT
  writ-token/            # writ fungible token
  integration/           # end-to-end lifecycle test suite
```

### Deployment scripts

```
scripts/deploy/
  deploy_v4.py           # canonical V4 deployment (casper-test, put-deploy)
  e2e_live.py            # full lifecycle smoke test against live testnet
  matrix_live.py         # CEP-78 gated-transfer matrix (13 cases)
  DEPLOYMENT.md          # full V4 manifest with all tx hashes and gas figures
```

---

## Repository layout

```
contracts/     six Odra contracts (see above)
agent/         verifier quorum + autonomous re-screening agent
circuits/      Circom eligibility circuit + snarkjs artifacts
disclosure/    selective-disclosure suite (Poseidon commitment verification)
frontend/      Next.js app (App Router, TypeScript, Tailwind)
scripts/       deploy scripts, lifecycle tests, payable-call tooling
docs/          PRD.md (full product spec), FRONTEND.md (frontend build guide)
```

---

## Further reading

- [ARCHITECTURE.md](./ARCHITECTURE.md) — system design, trust model, enforcement model
- [ADVERSARIAL_TESTING.md](./ADVERSARIAL_TESTING.md) — fraud-challenge cycle, slash mechanics, edge cases
- [scripts/deploy/DEPLOYMENT.md](./scripts/deploy/DEPLOYMENT.md) — full V4 deploy manifest, all tx hashes, gas figures
- [Live /docs](https://writ-app-production.up.railway.app/docs) — product docs: how it works + verify-it-yourself
- [docs/PRD.md](./docs/PRD.md) — full product requirements
