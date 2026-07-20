# Final-round hardening — audit finding tracker

Branch: `final-round-hardening`. Statuses: **fixed** / **honestly downgraded**
(claim rewritten to match reality, with disclosure) / **disclosed** (limitation
stated, production roadmap). Every entry lists the evidence a reviewer can run.

## Baseline (recorded before any fix)

| Suite | Result before | Result after |
|---|---|---|
| credential-registry `cargo test` | 52 pass | **57 pass** (5 new canonical-binding tests) |
| challenge `cargo test` | 18 pass | 18 pass |
| groth16-verifier `cargo test` | 3 pass | **8 pass** (5 new adversarial deser tests) |
| transfer-filter / writ-token | 0 tests (delegation-only crates) | covered by the new fork E2E |
| CEP-78 fork `cargo test -p tests --lib writ` | 2 (test-double filter only) | **3** incl. `writ_registry_filter_e2e` (real registry on the real EE) |
| integration `cargo test` | 1 pass | 1 pass |
| frontend | no test infra; typecheck ok; lint 1 error | **28 tests pass**; typecheck ok; **lint 0 errors**; build ok |
| disclosure `npm test` | 14 pass | 14 pass |
| live-claims verification | none | `scripts/verify_live.sh` — 15/15 PASS against public node RPC |

## Fatal findings

### F-1 — Live ZK proof proved a public constant — **fixed**
- **Was:** `identitySecret`/`salt` = BLAKE2b(public account hash) derived **server-side**; claims hardcoded; anyone could recompute any wallet's witness/commitment/nullifier.
- **Fix:** client-side derivation from a wallet signature (`frontend/lib/identity.ts`) — deterministic per wallet, not derivable from public data; secret/salt never transmitted; server receives only `idCommit = Poseidon(identitySecret)` and signs claims against it (`frontend/lib/server/issuer-input.ts` rewritten — it cannot rebuild the witness). Witness assembled and proven in-browser (`components/investor-proving.tsx`).
- **Tests:** `frontend/tests/identity-e2e.test.ts` — different wallet signatures ⇒ different secret/salt/idCommit/nullifier/commitment; full in-node `groth16.fullProve` against the shipped circuit passes; the server-issued package alone cannot produce a witness. `frontend/tests/issuer.test.ts` — issued package contains no secret material.
- **Residual (disclosed):** signature-derived-key caveat (README §12.3); demo issuer still signs fixed demo claims — split demo vs production issuer is documented (README §3/§4).

### F-2 — Committed demo issuer key; server self-issues — **fixed**
- **Was:** `ISSUER_EDDSA_KEY ?? "000102…9001"` committed fallback, live in prod.
- **Fix:** fallback deleted; `requireIssuerKey()` fails closed (503) when unset/malformed; `.env.example` placeholder-only with `openssl rand -hex 32` instructions; issuer key pinned via public-input binding (route rejects proofs whose `issuerAx/Ay` ≠ the configured key's).
- **Tests:** `frontend/tests/issuer.test.ts` — refuses without key; signature verifies only against the configured key; wrong key fails; source regression asserts no `??` fallback and no `000102…` constant.
- **Note:** the old default key is burned as a credential-signing secret; the deployment must set a fresh `ISSUER_EDDSA_KEY` (breaking change for the running Railway service — documented in `.env.example`).

### F-3 — Static placeholder proof stored on-chain — **fixed**
- **Was:** every onboarded credential stored `public/circuit/proof.bin` (= demo holder R's fixture proof) under the visitor's own public inputs ⇒ every honest self-onboarded holder was falsely slashable.
- **Fix:** `placeholderProofBytes()` and `public/circuit/proof.bin` deleted; `frontend/lib/server/proof-serde.ts` serializes the verified snarkjs proof to the exact arkworks-uncompressed 256-byte layout (incl. SWFlags y-sign bits) and the onboard route stores those bytes with the holder's own public inputs.
- **Tests:** `frontend/tests/proof-serde.test.ts` — conversion is byte-identical to the Rust `gen_fixtures` output for the same proof JSON; round-trip; malformed proofs rejected; regression tripwire (no `placeholderProofBytes`, no `proof.bin` in the route). `identity-e2e` proves a fresh holder proof serializes for storage. On-chain, `challenge.resolve` reads only stored bytes (existing challenge tests), so an honest holder's credential resolves VALID.
- **Note:** credentials attested by the OLD frontend build carry the mismatched placeholder — those demo credentials are challengeable-by-design history on testnet; the code path no longer exists.

### F-4 — OFAC screening screened the wrong identifier — **fixed (honest hybrid: Option A for linked ETH + Option B labeling for Casper)**
- **Was:** first 40 hex chars of a Casper account hash checked against an ETH-address SDN list — could never fire.
- **Fix:** `frontend/lib/server/screen.ts` v2 — live OFAC SDN ETH list fetched with source URL, timestamp, content SHA-256, entry count; screened against an optional **linked ETH address** (an identifier that can actually match; UI field added); Casper-account matching via env-configured **demo denylist, labeled illustrative** in UI + docs; stale (>24 h) or unavailable data throws and blocks attestation (fail-closed).
- **Tests:** `frontend/tests/screen.test.ts` — sanctioned linked ETH denied; clean passes; demo-denylist hit denied + labeled; malformed address rejected; unavailable and stale-data cases refuse attestation; degraded fresh-cache path works.
- **Docs/UI:** every "live OFAC screen" claim rewritten to the honest scope (README §3, SECURITY.md, ARCHITECTURE.md §5, issuer dashboard, investor flow, /docs pages). On-chain revokes are attributed to the registry sanctions path, never to automatic OFAC detection.

### F-5 — Anyone could activate any account — **fixed**
- **Was:** `/api/claims` returned a full witness for any posted account; bind check best-effort and non-blocking; nonce-less replayable message.
- **Fix:** new `/api/bind` issues a single-use 10-min nonce; the signed message binds chain, registry package, asset, account, nonce, expiry (`frontend/lib/server/bind.ts`); `verifyBindStrict` is **blocking** on both `/api/claims` and `/api/onboard`, requires the public key to hash to the claimed account, verifies ed25519 and secp256k1 Casper-message signatures, and consumes the nonce at onboard (replay rejected). Client flow requires both signatures; cancellation aborts onboarding.
- **Tests:** `frontend/tests/bind.test.ts` — attacker key for victim account fails (`key-does-not-own-account`); replay fails; expiry fails; tampered domain/asset fails; wrong-account nonce fails; unknown nonce fails; valid control passes.

### F-6 — Slash/treasury tx contradiction — **fixed (verified on-chain)**
- **Was:** README claimed a live fraud slash while `DEPLOYMENT.md` said the payable path was blocked; "burn" named a spendable transfer.
- **Fix:** deploy `0ae7aecd…` verified by direct node RPC: SUCCESS at block 8321548 on the canonical V4 challenge package `c1080d67…` (`resolve`, ~80.37 CSPR consumed; 640 CSPR → challenger, **110 CSPR → treasury account `50f4e6e8…`, a spendable account**). `scripts/deploy/DEPLOYMENT.md` rewritten as the canonical V4 manifest (all install/wiring txs from `manifest_v4.json`, the payable cargo-purse workaround, upgrade-authority disclosure); old manifests archived with banners. **"burn" renamed to "treasury transfer" in every doc, UI string, and demo line**; the unspendable-sink option is stated as roadmap.
- **Evidence:** `scripts/verify_live.sh` — 15/15 PASS, including explicit checks that the slash tx paid 640 to the challenger and 110 to the treasury.

## Major findings

### M-1 — Public inputs unbound at attestation — **fixed (service layer + on-chain in hardened code); deployed-instance gap disclosed**
- Server rejects any proof whose `issuerAx/issuerAy/assetId/allowedRoot` differ from the canonical values (`/api/onboard` step 4; `canonicalPublicValues()`); nullifier/commitment come from the verified proof itself and the registry enforces `pi[0..32]==nullifier ∧ pi[32..64]==commitment` on-chain (existing `PublicInputBindingMismatch` + tests). Cross-asset/registry replay is blocked on-chain by the nullifier↔slot binding (`cross_asset_replay_rejected`).
- **On-chain (closeout pass):** `registry.set_canonical_inputs(issuer_ax, issuer_ay, allowed_root)` (DEFAULT_ADMIN_ROLE) pins the canonical values; once set, `attest` rejects public inputs [2..6] that don't match (`CanonicalInputMismatch`), with the asset encoding derived on-chain from the call's own `asset_id`. Tests (registry now 57/57): `canonical_binding_accepts_matching_inputs`, `canonical_wrong_issuer_rejected_on_chain`, `canonical_wrong_asset_rejected_on_chain`, `canonical_wrong_root_rejected_on_chain`, `set_canonical_inputs_admin_only_and_unset_keeps_legacy_behavior`.
- **Precise challenge-scope statement (corrected in this pass — the earlier "enforced by the circuit at challenge time" wording was wrong):** the challenge path verifies whether the published proof is valid for the *stored* public inputs; it does not compare them to canonical state, so it cannot catch a valid proof stored for a forged issuer/asset/root. That gap is closed by the service pinning + the new on-chain pinning.
- **Disclosed (README §12.4):** the deployed testnet registry predates `set_canonical_inputs` (locked package) and binds only `pi[0..64]` on-chain.

### M-2 — "2-of-3 quorum" is one process — **honestly downgraded (Option B)**
- All copy rewritten to "2-signature demo attestation from a single trust domain"; what IS real (on-chain 2-of-3 threshold, bonded-signer enforcement) is stated separately. Files: `quorum-attest.ts` header, onboard route + response payload, investor UI, issuer dashboard, proving steps, ARCHITECTURE §1/§4/§5, SECURITY.md, README §3/§7, PRD §8 note, /docs/trust-model, /docs/whats-real. The `agent/` N-verifier implementation is referenced as the production shape only.

### M-3 — Burn and officer multisig overclaim — **honestly downgraded**
- Burn → treasury transfer everywhere (see F-6). Officer: deployed officer is a single demo key — every "officer multisig"/"2-of-3 multisig" claim rewritten (ARCHITECTURE roles table + §5, issuer dashboard "Demo UI — buttons not wired", FRONTEND.md, PRD status note); `scripts/officer_multisig/` retained as the documented native mechanism for production.

### M-4 — Mock issuer telemetry — **fixed**
- `lib/mocks.ts` deleted (dead HOLDERS/AUDIT_TRAIL/ASSET/RULE_SET/RE_SCREEN removed). Issuer dashboard now shows real config (circuit predicate, on-chain expiry enforcement, honest attestation model, screening scope with "no scheduled sweep") — no fabricated "3/3 online"/"last sweep"/flag counts. Landing terminal: fake block height removed, "LIVE" badge → "SCRIPTED DEMO", all copy says scripted replay, real tx links referenced. Roster/trail stay live via CSPR.cloud with **curation counts disclosed in the UI** (`cspr-cloud.ts` returns hidden-row counts; "nothing is fabricated or mocked" claim removed). Proving-step copy moved to `lib/proving-steps.ts`, matching the implemented flow.

### M-5 — Shipping CEP-78 registry filter untested; README pointed at the wrong filter — **fixed**
- New `contracts/writ-cep78/fork/tests/src/writ_registry_smoke.rs` (`writ_registry_filter_e2e`) wires the patched CEP-78 → production `writ_registry_filter` → the **real prebuilt `CredentialRegistry.wasm`** on the Casper EE, with real ed25519 quorum signatures over the byte-exact canonical message. Covers: eligible/ineligible mint, eligible/ineligible-recipient transfer, revoked-sender revert, expired-credential revert (block-time advance), missing-registry fail-closed (reverts, zero tokens), and operator/approval no-bypass (incl. an ordering proof that the filter fires before the auth check). Ownership asserted unchanged after every denial. `make setup-test` now builds/copies the needed wasm; `CredentialRegistry.wasm` committed as the exact deployed artifact.
- README contract table now names `writ_registry_filter` (pkg `d84a9321`) as the CEP-78 hook and lists the Odra `transfer-filter` (pkg `406e90f7`) separately; ADVERSARIAL_TESTING table fixed likewise.

### M-6 — Token package upgradable by one key — **disclosed (partially structural)**
- Odra packages verified installed with `odra_cfg_is_upgradable: false` (locked — including registry, challenge, verifier, filters). The CEP-78 NFT package IS upgradable by the installer key: disclosed in DEPLOYMENT.md, README §9, /docs pages; the compliance logic it calls is locked, so enforcement cannot be silently removed without the stated key; lock/multisig-URef is roadmap. (Redeploying a locked CEP-78 before the deadline would invalidate the live proof txs; the disclosure path was chosen.)

### M-7 — Single-contribution trusted setup — **honestly downgraded**
- `circuits/README.md` now labels the ceremony demo-grade in full (toxic-waste holder could forge; no transcript; the shipped frontend artifacts and the embedded on-chain VK derive from it; multi-party ceremony required for production). Frontend `prove.ts` and /docs/whats-real repeat the caveat.

### M-8 — No in-circuit expiry — **honestly downgraded + on-chain layer verified real**
- The registry's credential-layer expiry is real and on-chain: attest rejects `expiry <= now`, `is_active` flips at expiry, `settle_expired` materializes it (existing tests + the new fork E2E's expired-credential revert). The frontend now sets a **real expiry** (`now + CREDENTIAL_TTL_SECS`, default 90 days) instead of the former year-2096 constant. The ZK-layer gap (issuer-signed claims carry no timestamp) is documented in `circuits/README.md` and README §12.1 with the circuit-v3 plan (new VK ⇒ verifier redeploy).

### M-9 — Unchecked Groth16 deserialization — **fixed in code; deployed-instance lag disclosed**
- `verifier.rs`: proof and public inputs now use **checked** deserialization (on-curve + subgroup + canonical range); VK stays unchecked at runtime (compile-time constant) but the exact bytes are held to checked deserialization in a test. New tests: malformed proof, off-curve point, **on-curve out-of-subgroup G2 point**, non-canonical field element — all rejected; valid proof still passes (8/8).
- Deployed instance predates this (locked package) — README §12.2 discloses it with the risk assessment.

### M-10 — Provenance risk (hardcoded paths, leftovers) — **fixed**
- All `/Users/mac/...` paths removed: deploy scripts use `REPO_ROOT` from `__file__` (+ `DEPLOY_KEY` env override); agent code derives the repo root from `import.meta.url` with `ARK_VERIFY`/`WRIT_SIGNER`/`WRIT_KEYS_DIR` env overrides. All scripts syntax-checked; agent module import-checked. Dated, RPC-verifiable testnet timestamps are recorded in DEPLOYMENT.md (block heights + dates). CEP-78 fork attribution in `contracts/writ-cep78/NOTICE`.
- Remaining `/tmp/...` defaults are documented conventions, env-overridable.

### M-11 — Licensing conflict — **fixed**
- `contracts/writ-cep78/NOTICE` (Apache-2.0 attribution + modification list); root `LICENSE` already scoped MIT with the fork carve-out; new `LICENSES.md` maps every directory, declares `frontend/public/circuit/eligibility.wasm` a GPL-3.0-generated artifact with its complete corresponding source and regeneration commands, and explains why generated artifacts are committed (`circuits/build/` stays gitignored).

### M-12 — Clean-clone reproducibility — **fixed**
- No machine-specific paths (M-10); `.env.example` placeholders only; committed public test fixtures (`frontend/tests/fixtures/`); `CredentialRegistry.wasm` + `cep78.wasm` committed as the exact deployed artifacts; fork `make setup-test` copies test wasm; README §10 gives the full clean-clone command list; `scripts/verify_live.sh` verifies every live-tx claim with no keys or laptop context.

## Phase 3 (UI honesty) summary
Demo labels: SCRIPTED DEMO terminal, demo-issuer copy, single-trust-domain attest copy, officer "Demo UI" note, regulator walkthrough preimage label, "Asset (demo)" tile, screening-scope card, curation counts on the live roster. New reviewer page **/docs/whats-real** (live vs demo vs limitations). Onboard response now returns an audit payload (commitment, nullifier, expiry, stored-proof SHA-256, bind status, attestation model, screening source/timestamp/hash). Lint 0 errors.

## Phase 4 (docs) summary
README fully rewritten around the 12 required sections; ARCHITECTURE/SECURITY/ADVERSARIAL_TESTING/PRD/FRONTEND/circuits-README/frontend-README edited to the same claims; archived manifests banner-marked; DEMO_SCRIPT (local) updated. Banned phrases eliminated repo-wide (checked by grep; the only remaining "burned" is a verbatim Rust variable name, annotated).

## Clean-clone verification (closeout pass — exact outputs)

Run in a pristine `git worktree` of the final commit (no `node_modules`, no
`circuits/build`, no `internal/`, no env files), following README §10:

```
== 1 registry ==      test result: ok. 57 passed; 0 failed
== 2 challenge ==     test result: ok. 18 passed; 0 failed
== 3 verifier ==      test result: ok. 8 passed; 0 failed
== 4 integration ==   test result: ok. 1 passed; 0 failed
== 5 fork E2E ==      make setup-test && cargo test -p tests --lib writ
                      test result: ok. 3 passed; 0 failed (143 filtered)
== 6 frontend ==      npm install (537 pkgs) · tsc --noEmit OK · eslint exit 0
                      Test Files 5 passed · Tests 28 passed · build Compiled OK
== 7 circuits deps == npm install (94 pkgs) — required BEFORE disclosure
                      (disclosure reuses circuits/commitment.js / circomlibjs)
== 8 disclosure ==    14 passed, 0 failed
== 9 verify_live ==   15/15 PASS against the public node RPC (no keys)
```

One reproducibility bug was found and fixed during this run: the disclosure
suite crashed on a clean clone (`Cannot find module 'circomlibjs'`) when
`circuits/npm install` had not run first — README §10 now orders circuits deps
before disclosure and states the dependency. Two earlier clean-clone bugs fixed
in the same pass: a `SyntaxError` in `deploy_v4.py` (double `ff"` prefix from
the path-portability rewrite) and the disclosure fixtures themselves
(`disclosure/fixtures/` now committed, with `circuits/build` taking precedence
when present).

## Residual risks (also in README §12)
1. In-circuit claim expiry absent (registry-level expiry real; circuit v3 roadmap).
2. Deployed verifier predates checked-deserialization hardening.
3. Signature-derived identity secret caveat.
4. On-chain attest binds pi[0..64]; issuer/asset/root binding is service-layer + challenge-time.
5. In-memory nonce/rate-limit stores (single replica).
6. Treasury is spendable (transfer, not burn).
7. CEP-78 NFT package upgradable by installer key (logic it calls is locked).
