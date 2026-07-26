# Writ

**Privacy-preserving, on-chain-enforced compliance for tokenized RWAs on Casper — with an honest on-chain/off-chain split.**

Writ's claim, stated precisely: browser proof generation and attestation
verification happen **off-chain**; Casper stores signed credentials and enforces
transfer eligibility through a **recipient-aware CEP-78 filter**; the challenge
path can re-verify a credential's own published proof **on-chain** (Groth16) for
dispute resolution. Casper has joined the ERC-3643 Association, and Writ is built
in alignment with that compliance model.

Live app: **https://writ-app-production.up.railway.app** · reviewer page:
[/docs/whats-real](https://writ-app-production.up.railway.app/docs/whats-real)

---

## 1. What is live on Casper testnet

All contracts are live on **casper-test** (Casper 2.x). Every hash is verifiable
on [testnet.cspr.live](https://testnet.cspr.live), and
`scripts/verify_live.sh` re-checks every claim below against the public node RPC
from any machine (no keys needed).

### Canonical V5 contracts (current demo instance)

V5 is the hardened redeploy: the verifier ships **checked deserialization**, and the
registry **pins the canonical public inputs on-chain** (issuer key + jurisdiction
root) via `set_canonical_inputs` — so a proof carrying a forged issuer or root is
rejected at attest, on-chain, not merely by the onboarding service.

| Contract | Source | Role | Package hash |
|---|---|---|---|
| groth16-verifier | `contracts/groth16-verifier` | On-chain Groth16 pairing verify (checked deserialization) — fraud-challenge path only | [`1785d5a3`](https://testnet.cspr.live/contract-package/1785d5a368b2daa41c490dd83059d8ba8a62631b6112f5fed19e693c82d1d0fd) |
| credential-registry | `contracts/credential-registry` | Credentials + **on-chain canonical input pinning**; attest, revoke, freeze, status | [`74148da7`](https://testnet.cspr.live/contract-package/74148da7b68ce51e4dfa822af7106daaea7140862106a7b675057caf9ee404ce) |
| challenge | `contracts/challenge` | Fraud disputes: bond → challenge → resolve (slash + treasury transfer) | [`8cddad30`](https://testnet.cspr.live/contract-package/8cddad302d2d882070d62f581e6118ab371a24ced22294b81454754c2a5fd07e) |
| **writ_registry_filter** | `contracts/writ-cep78/fork/contracts/test-contracts/writ_registry_filter` | **The CEP-78 hook** — `can_transfer` (sender AND recipient) + `mint_allowed`; fail-safe deny | [`0b1f806b`](https://testnet.cspr.live/contract-package/0b1f806b13712752c6740890cb9fae33aa782d47b1c858564d97248c43407fb5) |
| transfer-filter (Odra) | `contracts/transfer-filter` | Odra adapter used by writ-token (not the CEP-78 hook) | [`30cca9f1`](https://testnet.cspr.live/contract-package/30cca9f1242679e7396b9a39ad2c087c7a30b1b4848cfb2324bbd4034976d469) |
| writ-cep78 | `contracts/writ-cep78/fork` | RWA bond NFT (patched CEP-78), wired to writ_registry_filter | [`2ce2ff55`](https://testnet.cspr.live/contract-package/2ce2ff55ebdeb1e72b85dc0634c77ff7a256fb98086fab6d2969af78386e7c97) |
| writ-token | `contracts/writ-token` | Odra demo token + its filter (integration-test model) | [`200cd183`](https://testnet.cspr.live/contract-package/200cd1830a58a5e6154bf2ab31168523d7e90fe06d166fd9650712aa120c4e1b) |

The superseded V4 set remains on-chain and its transactions stay valid history; see
[DEPLOYMENT_v2.md](./scripts/deploy/DEPLOYMENT_v2.md).

### Proof transactions — all V5, all RPC-verified by `./scripts/verify_live.sh` (27/27)

| What it proves | Deploy hash |
|---|---|
| **Canonical inputs pinned on-chain** — issuer key + jurisdiction root written to the registry | [`09975872`](https://testnet.cspr.live/deploy/099758726ffff9a427fe8a0fdf5a34bb242054e9d0fb5e2f6e0758a698ef16a6) |
| Holder attest — real Poseidon commitment + **the holder's own proof bytes**, accepted only because its public inputs match the pinned canon | [`a2dc0c8a`](https://testnet.cspr.live/deploy/a2dc0c8ad4f90f5b9dd86ada48498a2869c1570d75c5b4bb3f542f6cdb70296b) |
| Mint to an ineligible recipient reverts (filter error 159) | [`7f685f23`](https://testnet.cspr.live/deploy/7f685f232d4b12f281e09c3b2abe2d9a8cce260c6f17c1fb437860dd9af3fdf3) |
| Eligible transfer proceeds | [`4df6736c`](https://testnet.cspr.live/deploy/4df6736cf34382c6fbbdbffe2dedf1f1b3d72040e6b78ef4721537f73c912105) |
| Recipient-aware deny — transfer to ineligible recipient reverts (159) | [`af706a71`](https://testnet.cspr.live/deploy/af706a71f42e838ea7029785a2b80803798ebb34f61b00d5804119615a1bdf35) |
| **The kicker** — the *same route* proceeds [`65d81a5a`](https://testnet.cspr.live/deploy/65d81a5aaf7b5fa09bec9ac0867ee12c8ee1b2a84b5eb0a453161e0022ff1984), then reverts (159) after a sanctions revoke [`29ad4113`](https://testnet.cspr.live/deploy/29ad41132ec153d7f3059750010d502a69abcc3c8a3c95bd642dd47fb4c33f84) | [`1af2d7e6`](https://testnet.cspr.live/deploy/1af2d7e6821159b83819fed115ba072b7f10090c385ca18e1d5c71d288f4e7f3) |
| Fraud slash — `resolve` → on-chain Groth16 **FALSE** → slash 500, challenger paid 640, **110 CSPR transferred to treasury** (95.1 CSPR gas for the pairing verify) | [`79cce54a`](https://testnet.cspr.live/deploy/79cce54a4fbd125ee81c120150c77b8eda66d5acc16331c94790e2c51ad9193f) |
| Post-fraud — transfer to the RevokedFraud holder reverts (159) | [`0013547b`](https://testnet.cspr.live/deploy/0013547bf9a13134d14485db39658c9a0576a9e12580129524443f415a00c056) |

The fraud fixture is honest by construction: holder X was attested with **another
holder's valid proof** against X's own public inputs. It deserializes (so the
checked verifier accepts the encoding) but fails the pairing — exactly what a
forged credential looks like, and exactly what the challenge path is for.

Full manifest with install txs, gas, and the payable-call workaround:
[scripts/deploy/DEPLOYMENT.md](./scripts/deploy/DEPLOYMENT.md).

## 2. What is unit-tested

| Suite | Command | Coverage |
|---|---|---|
| credential-registry — 57 tests | `cd contracts/credential-registry && cargo test` | RBAC, sig validation, nullifier reuse/replay, public-input binding incl. on-chain canonical issuer/asset/root pinning, expiry, state machine, transfer matrix, officer paths |
| challenge — 18 tests | `cd contracts/challenge && cargo test` | bonding, withdraw guard, fraud/frivolous resolve, idempotency, effects-before-interactions, self-slash deterrence |
| groth16-verifier — 8 tests | `cd contracts/groth16-verifier && cargo test` | valid/tampered proof + inputs, **checked deserialization**: malformed proof, off-curve point, out-of-subgroup G2, non-canonical field element all rejected; embedded VK passes checked deserialization |
| CEP-78 ⇄ writ_registry_filter ⇄ registry E2E | `cd contracts/writ-cep78/fork && cargo test -p tests --lib writ` | real-EE gating: eligible/ineligible mint + transfer, revoked sender, expired credential, operator-path no-bypass, missing-registry fail-closed |
| integration lifecycle | `cd contracts/integration && cargo test` | onboard → gated transfer → revoke → refresh → fraud challenge → slash → officer overrides |
| frontend — 28 tests | `cd frontend && npm test` | wallet-bind (replay/expiry/domain/ownership), fail-closed issuer, screening (hit/clean/stale/unavailable), proof serde byte-exact vs arkworks, full in-node prove + public-input binding |
| disclosure — 14 tests | `cd disclosure && npm test` | Poseidon recompute vs live on-chain commitment, tamper detection, compelled-disclosure round-trip |

## 3. What is demo-only (labeled as such in the UI)

- **The claim issuer** is a demo issuer key (`ISSUER_EDDSA_KEY`, no default, fails
  closed) — **no external KYC provider is integrated**.
- **The attestation "quorum" is one trust domain**: two signatures produced by env
  keys held by one server process. The registry's on-chain check (2 valid ed25519
  sigs from its registered 3-key set, bonded signers only) is real; signer
  independence is not.
- **Sanctions screening scope**: the live OFAC SDN digital-currency list (ETH
  addresses) is fetched with content-hash + timestamp and screened against an
  optional **linked ETH address** — an identifier that can actually match.
  Casper-account matching uses a **labeled demo denylist** (no official
  Casper-account SDN mapping exists). Stale/unavailable data blocks attestation.
- **The officer role** is a single demo key (Casper weighted-key multisig is the
  documented production path; `scripts/officer_multisig/` demonstrates it).
- **The trusted setup** is a single-contribution dev ceremony (demo-grade).
- The landing-page terminal is a **scripted replay** of the real on-chain
  outcomes, labeled `SCRIPTED DEMO`.

## 4. Production roadmap

Independent verifier services holding one quorum key each (the `agent/` directory
implements the N-verifier shape); a real external KYC issuer; a multi-party
trusted-setup ceremony; circuit v3 with in-circuit claim expiry; redeploy of the
hardened verifier (checked deserialization); officer role behind Casper weighted
multisig; a provably unspendable slash sink.

## 5. The on-chain / off-chain split

**Off-chain (browser)**: the identity secret and salt are derived from a wallet
signature and never leave the browser; the witness is assembled locally; snarkjs
generates the Groth16 proof (~1s).
**Off-chain (server)**: verifies the proof, binds all six public inputs to the
pinned issuer key / asset / jurisdiction root, verifies the nonce-bound wallet
signature (blocking, single-use), screens sanctions data (fail-closed), then
co-signs.
**On-chain**: the registry verifies the attestation signatures against its
registered key set, enforces the public-input ↔ credential binding
(`pi[0..32] == nullifier`, `pi[32..64] == commitment`), stores commitment,
nullifier, expiry, and **the holder's own proof bytes**, and gates every CEP-78
transfer through the recipient-aware filter (fail-safe deny). Groth16 runs
on-chain **only** in `challenge.resolve`.

There is no on-chain SNARK verification at onboarding, and we don't claim one.

## 6. The ZK claim, precisely

A holder proves in zero-knowledge: *the configured issuer signed my claim set
(accredited=1, jurisdiction ∈ allowed Merkle set, sanctioned=0) against my
identity commitment, and my nullifier/commitment are correctly formed from my
wallet-derived secret.* Public inputs: `[nullifier, commitment, issuerAx,
issuerAy, assetId, allowedRoot]`. The proof, its public inputs, the nullifier,
and the commitment are all stored on-chain (not "only the commitment").
Constraint system: 12,254 constraints, EdDSA-Poseidon issuer signature +
jurisdiction Merkle inclusion + Poseidon nullifier/commitment
(`circuits/src/eligibility.circom`).

## 7. Attestation trust model

Demo: one operator (this server) holds 2 of the 3 registered quorum keys — a
**2-signature attestation from a single trust domain**. On-chain reality: the
registry accepts an attest only with ≥2 valid signatures from its registered,
**bonded** signer set; unbonded/unknown/duplicate signers and sub-threshold
signature sets are rejected (unit-tested). Economic backstop: any watcher can
challenge any credential; the stored proof adjudicates.

## 8. Challenge / slashing trust model

`challenge.resolve` reads the credential's **own stored proof and public inputs**
(never caller-supplied) and calls the on-chain verifier. Proof invalid → signers'
bonds slashed (2 × 250 demo), challenger paid gas allowance + reward + bond
refund (640 CSPR), **remainder (110 CSPR) transferred to the treasury account**
— a spendable account, so we call it a treasury transfer, **not a burn**. Proof
valid → challenger's bond compensates the signers. Resolve is idempotent and
effects precede interactions (unit-tested). Because every credential stores the
holder's real proof (no placeholders), an honest holder's credential resolves
VALID under challenge — slashing an honest holder via a stored-proof mismatch is
not possible.

## 9. Upgrade / admin trust model

Odra packages (registry, challenge, verifier, both filters, token) are installed
**locked** (`odra_cfg_is_upgradable: false`) — no key can swap their logic; the
verifier's verifying key is compiled in. The **CEP-78 NFT package is upgradable
by the installer key** (standard CEP-78 install) — disclosed; enforcement logic
it calls is locked, and production would lock the package or move its access
URef to a multisig. Registry admin: deployer holds `DEFAULT_ADMIN_ROLE` +
`QUORUM_ROLE` at init; challenge/officer roles are granted by recorded txs;
renounce paths are implemented and unit-tested.

## 10. Reproducibility

```bash
# clean clone
git clone https://github.com/winsznx/writ && cd writ

# contracts (Rust; each crate standalone)
(cd contracts/credential-registry && cargo test)
(cd contracts/challenge && cargo test)
(cd contracts/groth16-verifier && cargo test)
(cd contracts/integration && cargo test)

# CEP-78 fork E2E (pinned nightly toolchain; see fork/Makefile)
(cd contracts/writ-cep78/fork && make setup-test && cargo test -p tests --lib writ)

# frontend (typecheck, lint, tests incl. full in-node proving, build)
(cd frontend && npm install && npm run typecheck && npm run lint && npm test && npm run build)

# circuits deps FIRST — disclosure reuses circuits/commitment.js (circomlibjs)
(cd circuits && npm install)            # full prove/verify: circuits/README.md "Reproduce"

# disclosure (requires the circuits install above)
(cd disclosure && npm install && npm test)

# verify every live-tx claim in this README against the public node (no keys)
./scripts/verify_live.sh
```

No `/Users/...`-style machine paths remain (remaining `/tmp/...` defaults are documented conventions with env overrides); secrets exist only as env vars
(`frontend/.env.example` has placeholders only, and signing endpoints fail closed
without them).

## 11. Contract / tx hashes

Sections 1 above and [scripts/deploy/DEPLOYMENT.md](./scripts/deploy/DEPLOYMENT.md)
(canonical manifest: install txs, wiring txs, gas figures, treasury account,
payable-call workaround).

## 12. Known limitations

1. No in-circuit claim expiry (registry-level expiry is enforced on-chain; circuit
   v3 planned — see `circuits/README.md`).
2. Identity secret is derived from a deterministic wallet signature — any app that
   obtains a signature over the exact derivation message could recompute it
   (standard signature-derived-key caveat; production: issuer-held credentials).
3. **Canonical binding covers issuer key and jurisdiction root, not asset id.**
   V5 pins `issuerAx/issuerAy/allowedRoot` on-chain and rejects a mismatching
   attest; the asset is bound by the quorum-signed message and the registry's
   per-asset credential key rather than by a public-input comparison. The
   challenge path itself still only answers "is this proof valid for these stored
   inputs" — it is the pinning, not the challenge, that stops a forged issuer.
4. `set_canonical_inputs` is admin-gated: the deployer key can re-pin the canon.
   Production would renounce admin after wiring (the renounce path is implemented
   and unit-tested) or hold it behind a multisig.
5. Bind nonces / rate limits are in-memory (single replica).
6. The challenge "treasury" is a spendable account, not an unspendable sink — we
   call it a treasury transfer, never a burn. Verified live: +110 CSPR.
7. **Live self-onboarding needs both demo signers bonded.** The V5 fraud demo
   slashed both bonds (by design — that is what a successful challenge does).
   One signer has been re-bonded; the second re-bond is pending testnet faucet
   funds, and until then the registry correctly rejects attests with
   `SignerNotBonded` (error 11). The app awaits on-chain execution and reports
   that failure honestly — it never claims "attested" for a failed deploy.
8. The attestation quorum is two signatures from one operator (single trust
   domain), and the claim issuer is a demo issuer — no external KYC provider is
   integrated. Both are stated wherever the demo is presented.
9. The CEP-78 NFT package is upgradable by the installer key (the compliance
   logic it calls is locked); disclosed in §9.

---

## Stack

| Layer | Technology |
|---|---|
| Smart contracts | [Odra](https://odra.dev) 2.8.x + patched CEP-78 fork (Apache-2.0, see NOTICE) |
| Wallet | [CSPR.click](https://cspr.click) |
| Chain reads | [CSPR.cloud](https://cspr.cloud) (server-side; roster curation is counted and disclosed in the UI) |
| ZK | Circom v2 + snarkjs (browser + server verify), arkworks (on-chain + agent verify), Groth16-BN254 |
| Frontend | Next.js 16 / React 19, TypeScript, Tailwind — Railway |
| Network | Casper testnet (`casper-test`, Casper 2.x) |

## Repository layout

```
contracts/     six Casper contracts + the patched CEP-78 fork (fork = Apache-2.0)
agent/         N-verifier quorum + re-screen agent (CLI path; production shape)
circuits/      Circom eligibility circuit, dev ceremony, arkworks verifier crate
disclosure/    selective-disclosure suite (Poseidon commitment verification)
frontend/      Next.js app + API routes (bind / claims / onboard / registry)
scripts/       deploy scripts, verify_live.sh, officer multisig demo
docs/          PRD, frontend guide, final-round-hardening audit tracker
```

## Further reading

- [ARCHITECTURE.md](./ARCHITECTURE.md) — system design, trust model, data flow
- [ADVERSARIAL_TESTING.md](./ADVERSARIAL_TESTING.md) — attack surface + economics
- [scripts/deploy/DEPLOYMENT.md](./scripts/deploy/DEPLOYMENT.md) — live manifest
- [docs/final-round-hardening.md](./docs/final-round-hardening.md) — audit finding tracker
- [LICENSES.md](./LICENSES.md) — per-directory licensing (MIT / Apache-2.0 / GPL artifacts)
