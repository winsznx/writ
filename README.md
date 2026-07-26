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

### Canonical V4 contracts

| Contract | Source | Role | Package hash |
|---|---|---|---|
| groth16-verifier | `contracts/groth16-verifier` | On-chain Groth16 pairing verify — fraud-challenge path only | [`2bc9a855`](https://testnet.cspr.live/contract-package/2bc9a8556c75ee912bab4f7d2cf2622863d1f1e29eb5cf68685a52d6a718ff61) |
| credential-registry | `contracts/credential-registry` | Per-holder credential: attest, revoke, freeze, status | [`2e19e2bf`](https://testnet.cspr.live/contract-package/2e19e2bfc5383fd51103ee54fb430b53ec7a1a63c83a7841e08f00b188653fca) |
| challenge | `contracts/challenge` | Fraud disputes: bond → challenge → resolve (slash + treasury transfer) | [`c1080d67`](https://testnet.cspr.live/contract-package/c1080d67eed0c4945eadd84bc016d3b183a650086e39de60fb9c96cfe59dda34) |
| **writ_registry_filter** | `contracts/writ-cep78/fork/contracts/test-contracts/writ_registry_filter` | **The CEP-78 hook** — `can_transfer` (sender AND recipient) + `mint_allowed`; fail-safe deny | [`d84a9321`](https://testnet.cspr.live/contract-package/d84a932187624c1c982ed5c6dcbd1961fe370f732ce02fcbc0fe3e5e28389726) |
| transfer-filter (Odra) | `contracts/transfer-filter` | Odra adapter used by writ-token (not the CEP-78 hook) | [`406e90f7`](https://testnet.cspr.live/contract-package/406e90f7646576e2eb252fe1ce5144823c12b09bfe4c21cede18f9333c5f6d8e) |
| writ-cep78 | `contracts/writ-cep78/fork` | RWA bond NFT (patched CEP-78), wired to writ_registry_filter | [`ad407c6b`](https://testnet.cspr.live/contract-package/ad407c6bccbfc13e9fef28a03b75b175b0d186d3205952be684934c8dcb59bbe) |
| writ-token | `contracts/writ-token` | Odra demo token + its filter (integration-test model) | [`512068de`](https://testnet.cspr.live/contract-package/512068de722212ce497cb081049649339f0a8994394328164f3dde52c4ab8a3e) |

### Proof transactions (each RPC-verified; see `scripts/verify_live.sh`)

| What it proves | Deploy hash |
|---|---|
| Holder attest — real Poseidon commitment + the holder's proof bytes stored on-chain | [`f3fd7cbb`](https://testnet.cspr.live/deploy/f3fd7cbba19ef1195d70df72bc3ea073da4b6f78899c261ffadbc305d7a86645) |
| Transfer from a sanctioned (revoked) sender reverts (filter error 159) | [`3448182c`](https://testnet.cspr.live/deploy/3448182cb432dd4278551dc378a8485c7ee9cb09b3c619101ea37efb34a17b1d) |
| Recipient-aware deny — transfer to ineligible recipient reverts (159) | [`ce0f1a3a`](https://testnet.cspr.live/deploy/ce0f1a3a03131a4de663d04d60243aa4c261a9f0eab24acf55a4f5af9a26a2ad) |
| Fraud slash — `resolve` → on-chain Groth16 FALSE → slash 500, pay challenger 640, **110 CSPR to treasury** (~80 CSPR gas for the pairing verify) | [`0ae7aecd`](https://testnet.cspr.live/deploy/0ae7aecdf9510e34db2e6a2f392630843bbd11176f067124d01f2012d0e00c83) |
| Post-fraud transfer reverts — RevokedFraud holder blocked (159) | [`8922e979`](https://testnet.cspr.live/deploy/8922e979320ba28f38cab32b107893a5f868ec07281c9790c8b57d2b2c5786f9) |

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
2. The deployed verifier instance predates the checked-deserialization hardening
   in this repo (locked package → fix requires redeploy; exploiting the deployed
   instance would require a pairing forgery via non-subgroup points — no known
   practical break, disclosed regardless).
3. Identity secret is derived from a deterministic wallet signature — any app that
   obtains a signature over the exact derivation message could recompute it
   (standard signature-derived-key caveat; production: issuer-held credentials).
4. Public-input binding, stated precisely: the challenge path verifies whether the
   published Groth16 proof is valid **for the stored public inputs** — it does NOT
   check those inputs against any canonical issuer/asset/root, so a malicious
   QUORUM_ROLE caller storing a valid proof for a forged issuer or root would not
   be caught by a challenge. In this build the issuer/asset/root are pinned by the
   onboarding service before attestation, and the hardened registry can pin all
   six inputs **on-chain** (`set_canonical_inputs`, admin-gated, unit-tested:
   wrong issuer / wrong asset / wrong root rejected at attest). The **deployed
   testnet instance predates that entrypoint** (locked package) and binds
   nullifier + commitment only on-chain.
5. Bind nonces / rate limits are in-memory (single replica).
6. The challenge "treasury" is a spendable account, not an unspendable sink.
7. **Live self-onboarding is currently blocked by the slash demo itself**: the
   fraud-challenge demo (`0ae7aecd`) slashed the two demo signers' bonds, and the
   registry rejects attestations from unbonded signers (`SignerNotBonded`, error
   11) — the economic gate working as designed. A full onboarding was run through
   the deployed production app end-to-end (bind → demo-issuer claims →
   in-browser-equivalent proving → screening → attest submission, deploy
   [`4d9ef21a`](https://testnet.cspr.live/deploy/4d9ef21aed6fd95eaacc924e5ec505248ddbeee3d4b55aa764e9c5085f9f91bb));
   the chain correctly rejected it with error 11. The app now awaits on-chain
   execution and reports this failure honestly (it never claims "attested" for a
   failed deploy). Re-bonding the signers (2 × 250 CSPR) and re-funding the
   coordinator require testnet faucet funds.

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
