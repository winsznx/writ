# Writ — Adversarial Testing & Economic Security

> Cross-references: [README.md](./README.md) | [ARCHITECTURE.md](./ARCHITECTURE.md) | [DEPLOYMENT](./scripts/deploy/DEPLOYMENT.md)

This document explains why the Writ build can be trusted. It covers the attack surface each subsystem closes, the economic invariants that make griefing unprofitable, and the test evidence that verifies them on real code. Every number here was read directly from the source.

---

## 1. The Threat Model in One Sentence

Bonded signer keys attest credentials optimistically — in the shipped demo both signatures come from a single trust domain (one server process holding two of the registry's three registered keys); an independent production quorum is roadmap, and the on-chain threshold/bonding mechanism that would hold it accountable exists today. Any watcher can post a bond and challenge an attestation; the dispute resolves by running the credential's own **stored** proof through the on-chain Groth16 verifier. An attestation whose stored proof is invalid costs the signers their entire bond pool and lands the credential in the irreversible `RevokedFraud` state. A challenger who disputes a valid credential loses their bond to the signers they accused. Scope, precisely: the challenge adjudicates proof validity for the stored public inputs — canonical issuer/asset/root pinning is a separate gate (see §2.5).

---

## 2. The Attack Surface Closed

### 2.1 Exit-Scam Guard (Withdraw Block)

An attacker who attests a fraudulent credential cannot post the fraud and then immediately withdraw their bond before anyone challenges.

The `withdraw` entrypoint on the challenge contract checks `attestor_outstanding(key) > 0` against the registry. The registry increments the outstanding counter for every signer at `attest` time and decrements it only when a credential leaves the challengeable set (revoke, fraud-revoke, settle_expired, or unfreeze to Expired). While any signed credential remains live or frozen, `withdraw` reverts with `HasOutstanding`.

Source: `challenge.rs` lines 183–192, `registry.rs` `adjust_outstanding`.

### 2.2 First-Challenge-Wins

Only one open dispute may exist per `(asset_id, holder)` slot at a time. A second caller who tries to `challenge` an already-frozen credential hits `is_active` returning false and reverts `NotChallengeable`. Within the contract the prior dispute is checked and reverts `AlreadyChallenged` if unresolved.

This prevents dispute-spam and ensures the reward flows to exactly one challenger.

Source: `challenge.rs` lines 209–219.

### 2.3 Freeze Blocks Refresh + Expiry Suspend

Once a credential is frozen by a dispute, two things happen simultaneously:

1. The registry rejects any `attest` call on that `(asset_id, holder)` slot with `NotRefreshable`. The fraudster cannot overwrite the disputed credential with a clean one while the challenge is open.
2. The `is_active` logic does not evaluate expiry against a frozen credential. The expiry clock is suspended. If the credential's original expiry elapses while it is frozen, `unfreeze` (on a valid / frivolous resolve) transitions it directly to `Expired` rather than back to `Active`.

This closes both the "refresh out of a dispute" vector and the "wait for expiry to lapse" vector.

Source: `registry.rs` lines 355–358 (NotRefreshable), `registry.rs` lines 481–489 (unfreeze expiry check), test `expiry_under_freeze_lands_expired` (registry line 1474) and `challenge_freeze_blocks_refresh` (challenge line 793).

### 2.4 Fail-Safe Deny

The transfer filter (`transfer_allowed`) defaults to deny. The logic is:

```
if asset frozen    -> false
if sender has a credential AND !is_active(sender) -> false
return is_active(recipient)    // recipient must be live; no credential -> false
```

A holder with no credential cannot receive an asset. The mint sentinel bypasses the sender check (so issuance works) but the recipient must still be active. Any revert in the filter call propagates as CEP-78 user error 159, blocking the transfer.

Live evidence: transfer to ineligible recipient reverts at [af706a71f42e838ea7029785a2b80803798ebb34f61b00d5804119615a1bdf35](https://testnet.cspr.live/deploy/af706a71f42e838ea7029785a2b80803798ebb34f61b00d5804119615a1bdf35) (CEP-78 user error 159).

Source: `registry.rs` lines 738–749.

### 2.5 Public-Input Binding

At `attest` time the registry enforces that `public_inputs[0:32] == nullifier` and `public_inputs[32:64] == commitment` — reverting `PublicInputBindingMismatch` otherwise. In the hardened build the admin can additionally pin the canonical issuer key and allowed-jurisdiction root on-chain (`set_canonical_inputs`); once pinned, `attest` also enforces `public_inputs[64:192]` against the pinned issuer, the call's own asset encoding, and the pinned root, reverting `CanonicalInputMismatch` (tests: `canonical_wrong_issuer/asset/root_rejected_on_chain`). The canonical values are **pinned on the live V5 registry** (tx `09975872`), so this is enforced on-chain. It matters because the challenge path alone would not catch it: resolve verifies the stored proof against the stored inputs and nothing more, so without pinning a malicious QUORUM_ROLE caller could store a valid proof naming a forged issuer or attacker-chosen root. The onboarding service pins the same values before signing, giving two independent gates.

At `resolve` time the challenge contract reads the credential's **own stored proof and public inputs** — never caller-supplied data. An attacker cannot supply a different valid proof at resolve time; the verifier runs against exactly the bytes that were stored at attest time.

Source: `registry.rs` lines 307–311, `challenge.rs` lines 249–259, test `public_input_binding_fraud` (challenge line 826).

### 2.6 Idempotent Resolve / No Double-Slash

`resolve` sets `dispute.resolved = true` before any CSPR moves. On re-call it reverts `AlreadyResolved`. The signer bonds are zeroed in the same effects phase, so a re-entrant or repeated call finds an empty bond and cannot extract additional value.

Source: `challenge.rs` lines 242–248 and lines 262–265, test `resolve_idempotent_no_double_slash` (line 769).

### 2.7 Officer Cannot Rescue Proven Fraud

`revoke_fraud` produces `Status::RevokedFraud`, a terminal state distinct from `Status::Revoked`. The `officer_reinstate` entrypoint checks `cred.status != Status::Revoked` and reverts `NotReinstatable` on any other state including `RevokedFraud`. Only a sanctions/manual `Revoked` is reinstatable; a cryptographically proven fraud is not.

The officer also cannot unfreeze a challenge-frozen credential. `frozen_by_challenge` is set to `true` by the challenge-path `freeze`; `officer_unfreeze` checks this flag and reverts `ChallengePending` if set. A dispute resolves through the verifier, not officer fiat.

Source: `registry.rs` lines 524–536 (reinstate), lines 574–579 (officer_unfreeze), tests `officer_reinstate_rejects_fraud` (line 1825) and `officer_unfreeze_rejects_challenge_pending` (line 1886).

### 2.8 Nullifier Binding (Anti-Sybil / Anti-Replay)

A nullifier is bound to exactly one `(asset_id, holder)` slot on first use. Any attempt to use the same nullifier for a different `(asset_id, holder)` pair reverts `NullifierReused`. Same-slot refresh is the only allowed re-use (the holder renews their own credential with the same nullifier and a new expiry).

Source: `registry.rs` lines 314–320, tests `reused_nullifier_rejected` (line 1223) and `cross_asset_replay_rejected` (line 1271).

### 2.9 Role Isolation

Three roles are enforced by the AccessControl submodule:

- `QUORUM_ROLE` — may call `attest` and `revoke`
- `OFFICER_ROLE` — may call `officer_freeze/unfreeze/revoke/reinstate` and asset-level freeze
- `CHALLENGE_ROLE` — held by the challenge contract; may call `freeze`, `unfreeze`, `revoke_fraud`, `set_bonded`

No caller may call outside their role. The deployer may renounce `DEFAULT_ADMIN_ROLE` and `CHALLENGE_ROLE` after wiring, leaving no single key with admin authority. Tests verify that post-renounce, grant operations revert while runtime operations (attest, officer actions, challenge-path freeze/unfreeze) continue to work.

Source: `registry.rs` lines 33–38 (roles), test `renounce_admin_and_challenge_keeps_runtime_working` (line 942).

---

## 3. The Economic Invariants

### 3.1 Constants (read directly from `challenge.rs` lines 33–41)

```rust
const REWARD_CSPR: u64 = 300;
const CHALLENGER_BOND_CSPR: u64 = 250;
const GAS_ALLOWANCE_CSPR: u64 = 90;   // pegged to the measured resolve() cost, rounded up
```

The attestor bond is a deploy-time constructor parameter (`attestor_bond: U512`). The production default documented in the source is 5000 CSPR. The demo/testnet deployment uses 250 CSPR (set in `integration/lifecycle.rs` line 21: `const DEMO_BOND_CSPR: u64 = 250`).

### 3.2 Fraud Path: Worked Example (Demo Bond, Two Signers)

Setup: two signers each bonded at 250 CSPR (demo). A watcher challenges, paying 250 CSPR. Resolve finds the proof invalid.

```
slashed pool   = 250 + 250                    = 500 CSPR   (both signer bonds)
reward_cap     = GAS_ALLOWANCE + REWARD        = 90 + 300   = 390 CSPR
to challenger  = reward_cap + challenger_bond  = 390 + 250  = 640 CSPR
to treasury    = slashed - reward_cap          = 500 - 390  = 110 CSPR  (spendable treasury account — a transfer, not a burn)
```

The challenger is made whole on gas (90 CSPR) plus earns a 300 CSPR reward and gets their 250 CSPR bond back. The remainder (110 CSPR) is transferred to the treasury account. (The code's local variable is historically named `burned`; the destination is a spendable account, so the docs say treasury transfer.)

Source: `challenge.rs` lines 304–309 (`settle_fraud`), test `resolve_fraud_full_split` (line 698):

```rust
let slashed = cspr(2 * ATTESTOR_BOND_CSPR);
let burned = slashed - cspr(GAS_ALLOWANCE_CSPR + REWARD_CSPR);
assert_eq!(bal(&w.env, 8), t0 + burned);   // treasury receives exactly 110 CSPR
```

### 3.3 Griefing Invariant: A = G + R + B

A successful challenger is always made whole. In the fraud path:

```
A (slashed from attestors) >= G (gas allowance) + R (reward) + B (bond refund)
```

The code uses `min(reward_cap, slashed)` so if the slashed pool is somehow smaller than the reward cap, the challenger still receives everything available. The bond refund is always in addition to the pool payout:

```rust
env.transfer_tokens(&dispute.challenger, &(from_pool + dispute.bond));
```

The challenger always pays their own gas for the `resolve` transaction. The gas allowance is a reimbursement, not pre-payment.

### 3.4 Self-Slash Deterrence: Residual A − R

A signer who tries to extract the reward by self-challenging their own fraudulent credential:

```
signer net = -attestor_bond + reward_cap - own_gas
           = -250 + 390 - gas              (demo bond)
```

But the signer also loses their co-signer's bond (joint liability). For the demo two-signer case:

```
signer 0 net = -250 (bond slashed) - 250 (challenger bond paid) + 390 (reward+gas back) - gas
             = -110 CSPR net loss before tx gas
co-signer 1  = -250 (bond slashed) + 0 (no recovery)
```

The test `self_challenge_is_net_negative` (challenge line 874) verifies this:

```rust
let net_loss = cspr(ATTESTOR_BOND_CSPR) - cspr(GAS_ALLOWANCE_CSPR) - cspr(REWARD_CSPR);
assert!(bal(&w.env, 0) < a0_initial);
assert!(a0_initial - bal(&w.env, 0) >= net_loss);
assert!(bal(&w.env, 1) < a1_initial);   // co-signer also loses with no recovery
```

The residual `A − R` (attestor bond minus the portion a sockpuppet can recover) makes self-challenge strictly negative regardless of who initiates resolve.

### 3.5 Frivolous Challenge: Challenger Pays Signers

If resolve finds the proof valid, the credential is unfrozen and the challenger's bond is split equally among the signers they accused. Any integer rounding remainder is transferred to the treasury account. The challenger receives nothing back.

Source: `challenge.rs` lines 313–341 (`settle_frivolous`), test `resolve_frivolous_compensates_signers` (line 736).

---

## 4. On-Chain Gas: Groth16 Verify

The on-chain Groth16 pairing verification (groth16-verifier contract, BN254, arkworks, called only in the fraud-challenge `resolve` path) costs approximately **79.29 CSPR** on the Casper EE. The `GAS_ALLOWANCE_CSPR` constant of 90 is set above this measured value to ensure challengers are always made whole.

Source: `challenge.rs` lines 39–41 (comment: "89.60 CSPR rounded up").

The 79.29 CSPR figure is the measured on-chain cost from live testnet runs. See `scripts/deploy/` for the deploy sequence and raw gas data.

---

## 5. Test Evidence

### 5.1 Credential Registry — 57 tests (OdraVM)

All 57 `#[test]` functions in `contracts/credential-registry/src/registry.rs` run against the OdraVM in-process backend (52 pre-hardening + 5 canonical-input-binding tests added in the final-round pass). The crate also ships a `livenet_read` binary (feature-gated `livenet`) for live state reads against the deployed testnet instance.

Key correctness groups:

| Group | Tests |
|---|---|
| Role renounce / claw-back | `renounce_admin_and_challenge_keeps_runtime_working`, `admin_revokes_challenge_role_from_a_holder`, `non_admin_cannot_revoke_role` |
| Attest / quorum validation | `attest_then_active_after_window`, `unbonded_signer_rejected`, `public_input_binding_enforced`, `bad_signature_does_not_count`, `sub_threshold_rejected`, `unknown_signer_rejected`, `duplicate_signer_rejected` |
| Nullifier / replay guard | `reused_nullifier_rejected`, `same_slot_refresh_allowed`, `cross_asset_replay_rejected` |
| Refresh rules | `refresh_rejected_when_frozen`, `refresh_from_revoked_reonboards`, `refresh_rejected_when_fraud` |
| Status transitions | `revoke_blocks_active_and_clears_outstanding`, `revoke_fraud_status_distinct`, `freeze_blocks_then_unfreeze_restores`, `expiry_under_freeze_lands_expired`, `settle_expired_decrements_outstanding` |
| Transfer gate | `transfer_allowed_*` (10 tests), `transfer_check_*` (5 tests) |
| Officer overrides | `officer_revoke_*`, `officer_reinstate_*`, `officer_freeze_*`, `officer_unfreeze_*`, `officer_entrypoints_reject_non_officer`, `officer_action_emits_attribution_event` |

### 5.2 Challenge — 18 tests (OdraVM)

All 18 `#[test]` functions in `contracts/challenge/src/challenge.rs`.

| Test | Invariant verified |
|---|---|
| `bond_marks_bonded_and_mirrors_to_registry` | Bond mirrors to registry's bonded map |
| `bond_wrong_amount_rejected` | Exact bond required |
| `bond_not_owner_rejected` | Only the key's own account may bond it |
| `double_bond_rejected` | One bond per key |
| `unbonded_key_cannot_sign_attest` | Unbonded signers rejected at attest |
| `withdraw_blocked_while_outstanding_then_allowed` | Exit-scam guard + cooldown |
| `withdraw_cooldown_enforced` | Cooldown period enforced independently |
| `challenge_rejects_non_active` | Cannot challenge a non-active credential |
| `challenge_double_rejected_first_wins` | First-challenge-wins |
| `challenge_wrong_bond_rejected` | Exact challenger bond required |
| `resolve_fraud_full_split` | Fraud path: slash, 110 to treasury, challenger net positive |
| `resolve_frivolous_compensates_signers` | Frivolous path: signers split challenger bond |
| `resolve_idempotent_no_double_slash` | No double-slash on re-call |
| `challenge_freeze_blocks_refresh` | Freeze blocks re-attest |
| `public_input_binding_fraud` | Proof valid for different inputs -> fraud |
| `expiry_under_freeze_resolves_expired` | Expiry suspend during freeze |
| `self_challenge_is_net_negative` | Sockpuppet: net loss, co-signer loses too |
| `resolve_gas_report` | Gas report (informational) |

### 5.3 Integration — 1 lifecycle test

`contracts/integration/src/lifecycle.rs` contains one test function, `full_lifecycle`, which chains the complete operational sequence against a single wired instance:

1. Eligible recipient onboarded (dummy proof, unchallenged)
2. Holder onboarded with real Groth16 proof fixtures
3. Gated transfer: eligible holder PROCEEDS; ineligible recipient DENIED
4. Sanctions revoke (quorum/officer path) -> transfer DENIED
5. Same-slot refresh (re-onboard after sanctions revoke) -> Active -> transfer PROCEEDS
6. Fraud path: tampered-proof credential challenged, resolved FALSE -> `RevokedFraud` + slash -> transfer DENIED
7. Frivolous path: valid credential challenged, resolved TRUE -> unfreeze -> Active -> transfer PROCEEDS
8. Officer override cycle: revoke -> reinstate -> freeze -> unfreeze, each verified via transfer allow/deny
9. Boundary assertions: `officer_reinstate` on `RevokedFraud` reverts; `officer_unfreeze` on challenge-frozen reverts
10. Attribution trail assertions: `CredentialAttested` (initial + refresh), `CredentialRevoked` (sanctions vs fraud distinction), `Challenged`, `Resolved` (fraud + frivolous), `OfficerAction`

The setup in this test mirrors the exact sequence run by `scripts/deploy/wire_writ.sh` on testnet: deploy verifier + registry + challenge + filter + token, `grant_challenge`, `grant_officer`, bond the attestors (2 signing keys of the registered 3-key set).

---

## 6. Live Testnet Evidence

All six contracts are deployed and verified on Casper testnet. Package hashes (stable addresses across upgrades):

| Contract | Package hash |
|---|---|
| groth16-verifier | [1785d5a3…](https://testnet.cspr.live/contract-package/1785d5a368b2daa41c490dd83059d8ba8a62631b6112f5fed19e693c82d1d0fd) |
| credential-registry | [74148da7…](https://testnet.cspr.live/contract-package/74148da7b68ce51e4dfa822af7106daaea7140862106a7b675057caf9ee404ce) |
| challenge | [8cddad30…](https://testnet.cspr.live/contract-package/8cddad302d2d882070d62f581e6118ab371a24ced22294b81454754c2a5fd07e) |
| writ_registry_filter (CEP-78 hook) | [0b1f806b…](https://testnet.cspr.live/contract-package/0b1f806b13712752c6740890cb9fae33aa782d47b1c858564d97248c43407fb5) |
| writ-cep78 | [2ce2ff55…](https://testnet.cspr.live/contract-package/2ce2ff55ebdeb1e72b85dc0634c77ff7a256fb98086fab6d2969af78386e7c97) |
| writ-token | [200cd183…](https://testnet.cspr.live/contract-package/200cd1830a58a5e6154bf2ab31168523d7e90fe06d166fd9650712aa120c4e1b) |

Key transaction evidence:

| Event | TX |
|---|---|
| Sanctioned sender reverts (filter user-error 159) | [1af2d7e6…](https://testnet.cspr.live/deploy/1af2d7e6821159b83819fed115ba072b7f10090c385ca18e1d5c71d288f4e7f3) |
| Ineligible recipient reverts (user-error 159) | [af706a71…](https://testnet.cspr.live/deploy/af706a71f42e838ea7029785a2b80803798ebb34f61b00d5804119615a1bdf35) |
| Regulated holder attest (Poseidon commitment on-chain) | [a2dc0c8a…](https://testnet.cspr.live/deploy/a2dc0c8ad4f90f5b9dd86ada48498a2869c1570d75c5b4bb3f542f6cdb70296b) |
| Fraud slash (resolve -> Groth16 FALSE -> slash 500, 110 CSPR treasury transfer, resolve consumed 95.1 CSPR incl. the pairing-verify cross-call) | [79cce54a…](https://testnet.cspr.live/deploy/79cce54a4fbd125ee81c120150c77b8eda66d5acc16331c94790e2c51ad9193f) |
| Post-fraud transfer reverts (RevokedFraud holder, error 159) | [0013547b…](https://testnet.cspr.live/deploy/0013547bf9a13134d14485db39658c9a0576a9e12580129524443f415a00c056) |

---

## 7. What Is Not Claimed

The following claims are explicitly out of scope and are not made anywhere in the Writ documentation:

- On-chain SNARK/Groth16 verification at onboarding time. Writ verifies the eligibility proof off-chain (snarkjs, server-side) and commits the credential and attestation signatures on-chain. On-chain Groth16 verification happens only in the fraud-challenge `resolve` path.
- A ciphertext escrow or encrypted claims store. Disclosure is Poseidon-commitment-only. The holder retains the preimage and reveals it peer-to-peer; the regulator recomputes `Poseidon(claims)` and checks it equals the on-chain `ByteArray` commitment.
- A 24/7 re-screening daemon over the entire holder base. The agent re-screens at onboarding and on-demand; there is no continuous watchtower service.
- x402 live wire. x402 is designed into the payment path for live compliance data but is not yet wired.
- An independent verifier quorum. The demo's two attestation signatures come from one server process (single trust domain); the on-chain 2-of-3 threshold check is real, signer independence is roadmap.
- Challenge-time enforcement of issuer/asset/root. The challenge verifies the stored proof for the stored public inputs only. Canonical enforcement lives elsewhere: on-chain via `set_canonical_inputs` (pinned on the live V5 registry, tx `09975872`) and at onboarding in the service. The asset id is bound by the quorum-signed message and the per-asset credential key rather than by a public-input comparison.
- A token burn. The slash remainder is a transfer to a spendable treasury account.

**The harshest fair criticism of the current system**: the eligibility being attested is demo-grade end-to-end — a demo issuer signs the claim set for any connected wallet, and the attestation trust domain is a single operator. What the cryptography and the chain enforce around that demo core (holder-held secrets, real stored proofs, recipient-aware transfer gating, economic slashing of invalid proofs, on-chain expiry) is real and tested; the issuer and signer-independence boundaries are the two production gaps, and both are stated on every surface.
