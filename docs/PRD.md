# Writ — Product Requirements Document

**Privacy-preserving, agent-operated compliance for tokenized real-world assets on Casper.**

`v1.0` · Casper Agentic Buildathon 2026 · Casper Innovation Track · Submission deadline June 30, 2026

---

## 0. One line

> Writ keeps a tokenized real-world asset compliant for life — every holder provably eligible, continuously re-screened, blocked on-chain the moment they're not — without the issuer ever touching a single piece of investor PII, and with a cryptographic audit trail the regulator can verify themselves.

**Verbs:** enforce · prove · never-custody.

---

## 1. Problem

RWA tokenization is a multi-trillion-dollar thesis (Casper's own positioning cites a $16T market). The blocker isn't minting the token — it's compliance. The moment an asset is tokenized, the issuer is legally responsible, in perpetuity, for *who holds it*: only eligible parties (accredited / correct jurisdiction / non-sanctioned) may hold or receive a security, and eligibility is a **continuous** obligation, not a one-time gate.

Two unsolved pains the whole market feels:

1. **The honeypot.** Conventional compliance means the issuer custodies a mountain of investor PII — passports, accreditation docs, addresses. That's a GDPR/breach liability and a board-level reason institutions stall on tokenization. The data you collect to be compliant becomes the thing that gets you sued.
2. **Point-in-time KYC fails.** Sanctions lists update, accreditation lapses, jurisdictions change rules, holders become PEPs. "Pass KYC once, you're in forever" is exactly the failure regulators keep fining firms for. Real compliance is a runtime engine, not a checkbox.

Nobody is solving both at once. (See §4 for the field.)

---

## 2. User / ICP

The **issuer**: a tokenization platform, asset manager, or bank digital-assets desk that puts an RWA on-chain and is on the legal hook for its holder base. Horizontal across RWA verticals — tokenized equities, treasuries, corporate debt, real estate, funds — because **compliance is the pick-axe every vertical needs**. Writ does not pick a vertical; it owns the job every vertical has to solve.

Demo reference asset: a **tokenized corporate bond** on Casper testnet (one concrete, real instance — not a mock; horizontal product, single reference deployment).

---

## 3. What Writ is

An autonomous, privacy-preserving compliance + lifecycle-governance layer for tokenized RWA. One job: keep the asset legal and private across its entire on-chain life.

- **Entry eligibility** — investor proves eligibility in zero-knowledge; gets an on-chain credential. PII never propagates to the issuer, the agent, or the chain.
- **Transfer gating** — every transfer is checked on-chain (sender not revoked, recipient eligible) and denied by default if not.
- **Runtime re-screening** — an autonomous agent continuously re-screens the holder base against live sanctions/accreditation/jurisdiction data and revokes on change.
- **Compliant distributions** — value flows (coupons, redemptions) gated by the same credential layer. *(v2)*
- **Selective disclosure** — the issuer proves any specific compliance fact to a regulator on demand, without exposing the book.

The agent is the spine (perceive → decide → act); ZK is the privacy mechanism; the on-chain CEP-78 filter is the enforcement teeth.

---

## 4. Differentiation & defensibility

**Vs. the Buildathon field (46 submissions, scouted).** The field clusters hard: ~12 x402 payment/M2M projects, ~6 agentic DeFi/yield bots, ~5 RWA *oracle/data* agents, a few identity/credit plays. Two findings:
- **Zero** of the 46 mention zero-knowledge, selective disclosure, or privacy-preserving compliance.
- The RWA projects all do *data* (get price/rent/risk on-chain). **None do compliance** — the legal gate on who may hold. Writ is in an empty lane in a crowded field.

**Vs. the obvious ERC-3643 / T-REX playbook.** A vanilla compliant-token implementation gates transfers against a public identity registry. Writ adds the three things that playbook lacks: **privacy** (no PII custody, eligibility proven in ZK), **continuity** (autonomous runtime re-screening, not point-in-time), and an **autonomous operator** (the agent runs it). Writ is effectively *the ERC-3643-equivalent for Casper, shipped ahead of the protocol* (Casper's native compliance/identity stack is 2026 H2 roadmap; its compliant-privacy stack is 2027).

**Vs. zk-KYC prior art.** zk-identity/credential schemes exist in the wider market, but they are overwhelmingly **point-in-time credential issuance**. Writ is **runtime** (the agent re-evaluates the whole holder base against changing rules), **no-custody** (the verifier never sees PII either), **on-chain-enforced** (a real CEP-78 transfer filter, not just a credential), and **agent-operated**. That synthesis is the wedge.

**The CEP-78 gap.** Casper's NFT standard (CEP-78) is *recipient-blind* on transfer — its filter hook can't see the recipient (proven empirically, §6). Writ's compliance token is a patched CEP-78 that *can* gate recipients. That's a concrete gap in Casper's standards that Writ fills.

---

## 5. Architecture

**Keystone constraint (proven):** on-chain SNARK verification on Casper is not cost-viable. There is no native EC-pairing host function on live testnet (`vm_casper_v2 = false`); a pure-wasm Groth16 verify costs ~1000 CSPR / ~62% of a block. Per-transfer on-chain verification is infeasible. **Therefore: verify off-chain, commit on-chain.**

```
OFF-CHAIN                                          ON-CHAIN (casper-test, vm_casper_v1)

Investor ──proof + public inputs──┐
 (PII + claims from KYC issuer)    │              ┌──────────────────────────────┐
                                   ▼              │ Writ Credential Registry      │
                          ┌──────────────────┐    │  credential{commit, nullifier,│
                          │ Verifier Quorum  │sign,│   flag, expiry, quorum sigs}  │
                          │ (N-of-M agents)  │tx   │  published proof (challenge)  │
                          │ ark-groth16 verify─────▶│  bonds · RBAC · nullifier set │
                          │ + screen(OFAC    │    └───────────────┬──────────────┘
                          │   SDN)           │                    │ reads state
                          └────────┬─────────┘                    ▼
                                   │ fetch SDN        ┌──────────────────────────────┐
                    OFAC SDN (live)                   │ Writ Token (patched CEP-78,  │
Challenger ──challenge + bond────────────────────────▶│  Transferable + recipient    │
 (anyone)     triggers on-chain Groth16 verify        │  -aware filter + mint gate)  │
                                                      │  transfer ▶ Proceed / Deny   │
Compliance Officer ──freeze/override (M-of-N key)────▶ └──────────────────────────────┘
 (human)
Regulator ◀──selective disclosure (off-chain)──────── + on-chain commitment to verify against
```

- **Off-chain:** investor PII, ZK proof generation, the quorum's proof verification, live sanctions screening, regulator disclosure, the re-screen scheduler.
- **On-chain:** the Writ Token (patched CEP-78), the Credential Registry (commitments, flags, expiries, quorum signatures, published proofs, bonds, nullifier set), RBAC, officer override authority.
- **The agent** is the orchestrator: verifies proofs, screens via OFAC SDN, signs credentials, submits transactions (via `put-deploy`, see §17), drives re-screening.

---

## 6. Enforcement model (substrate proven live on testnet)

Two complementary controls — CEP-78's filter fires on transfer but **not on mint** (proven), so issuance needs its own gate.

- **Mint gate** — only `ACTIVE`-credentialed accounts can be minted to / registered as owners (mint-side RBAC / `register_owner` control). Gates issuance and initial holders.
- **Transfer filter (patched, recipient-aware)** — on every transfer:
  ```
  1. asset FROZEN                        → DENY
  2. sender is REVOKED or FROZEN         → DENY   (sanctioned holder can't move assets)
  3. credential(recipient) == ACTIVE     → else DENY
  4. transfer rules pass  [v2]           → else DENY
  5. PROCEED                              any error / filter unreachable → DENY (fail-safe)
  ```

**Live-testnet validation (real txs, node 2.2.1):**
- Patched 441KB CEP-78 wasm installs live (557 CSPR, no error) — closes "live deploy unverified."
- Transfer to eligible recipient → PROCEED (on-chain state confirms the token moved). Transfer to ineligible recipient → DENY (revert 159). **Recipient-gating works on real testnet with the one-line recipient patch.**
- Mint to a denied recipient → PROCEED (confirms filter does not gate mint → mint gate required).
- Panic-mode filter → DENY (revert 9001), token never moves. **Fail-safe holds.**
- Per-transfer cost ≈ 0.87 CSPR; the filter read itself is negligible.

**Writ's token = patched CEP-78 fork** (recipient read moved before the filter call; real recipient passed as `ARG_TARGET_KEY`). Forking the base token to add transfer restrictions is the security-token pattern — exactly what ERC-3643/T-REX do to ERC-20.

---

## 7. Trust model

Off-chain verification means the chain checks the agent's signature, not the proof — so the agent is an oracle. We minimize that trust with a dial:

- **Threshold verification (baseline, shipped):** N-of-M independent verifiers each run the proof + screens and co-sign only on agreement. Forging a credential requires compromising a quorum. In production these are *named, accountable* parties (issuer compliance + independent KYC provider + auditor); the demo runs the mechanism with 2-of-3 instances.
- **Optimistic on-chain fraud proofs (shipped):** the proof is published on-chain (safe — a ZK proof leaks nothing about the witness) and *not* verified in-contract on the happy path. Anyone can challenge by running the on-chain Groth16 verifier on that specific proof; a false attestation slashes the quorum's bond, a griefing challenge slashes the challenger's. The ~1000 CSPR pairing cost is paid **only in a dispute**, never per transfer.

**Trust vs. privacy are orthogonal.** On-chain verify would be trustless; off-chain is oracle-trust — *ZK does not change this*. What ZK buys is **privacy**: the verifier learns only the boolean + nullifier, never the identity, on-chain or off. So the keystone cost us trustlessness but kept the honeypot flip intact: the agent is trusted to *verify*, never trusted *with the PII*.

**Honest security assumption:** *security = quorum honesty OR ≥1 honest watcher during the challenge window.* The natural watcher is the issuer (motivated to catch fraud against its own asset) — Writ ships an issuer watcher by default. Asymmetry by design: *granting* eligibility passes through the optimistic window before it can transact; *revocation* is immediate, because denying is always fail-safe.

---

## 8. ZK component

- **Proving (off-chain):** Circom v2 + snarkjs, Groth16 on BN254 (~128B constant proof, 3 pairings, maximal tooling reuse).
- **Verifying (off-chain):** arkworks `ark-groth16` + `ark-bn254` (<10ms, no gas).
- **Predicate:** holder's claims satisfy the asset's eligibility rule (accredited ∧ allowed-jurisdiction ∧ not-sanctioned), revealing nothing else.
- **Capability demo:** ship a one-off on-chain Groth16 verify (Shroud-pattern, free testnet CSPR) to prove on-chain verification *is possible*, then run the off-chain path for the real loop — honest about the cost tradeoff rather than hiding it.

**The exact honest claim — never deviate:** *"Eligibility proven in zero-knowledge, verified by a threshold of autonomous agents; the chain stores signed credentials, enforces compliance at every transfer via a native CEP-78 filter, and exposes published proofs for on-chain fraud challenge, with off-chain selective disclosure to regulators."* **Never** "on-chain SNARK verification."

---

## 9. Credential state machine

**Enforcement rule:** `can_transfer` proceeds only when the recipient credential is `ACTIVE`; every other state denies.

States: `NONE · PENDING · ATTESTED (in challenge window, not yet transactable) · ACTIVE · CHALLENGED · EXPIRED · REVOKED · FROZEN`

| From → To | Event | Guard |
|---|---|---|
| NONE → PENDING | investor submits proof | well-formed, unused nullifier |
| PENDING → ATTESTED | quorum verifies | N-of-M agree: proof valid ∧ screens clean → co-sign, publish proof |
| PENDING → NONE | quorum rejects | invalid proof ∨ screen flag ∨ no consensus → notify |
| ATTESTED → ACTIVE | window elapses | no successful challenge |
| ATTESTED/ACTIVE → CHALLENGED | challenge raised | challenger bond posted |
| CHALLENGED → ACTIVE | on-chain verify = VALID | attestation honest → slash challenger |
| CHALLENGED → REVOKED | on-chain verify = INVALID | attestation false → slash quorum, void |
| ACTIVE → EXPIRED | freshness window reached | now ≥ expiry |
| EXPIRED → PENDING | holder re-proves | new proof |
| {ATTESTED, ACTIVE, EXPIRED} → REVOKED | re-screen hit ∨ officer revoke | sanctions match (immediate) ∨ officer |
| {any live} → FROZEN | officer freeze | M-of-N officer key |
| FROZEN → ACTIVE/REVOKED | officer unfreeze/revoke | M-of-N officer key |
| REVOKED → PENDING | holder re-proves | issue resolved + new proof |

**Challenge / fraud-proof flow:** `ATTESTED/ACTIVE` --challenge+bond--> run on-chain Groth16 on published proof → VALID: continue, challenger slashed · INVALID: REVOKE, quorum slashed → challenger reward + treasury.

---

## 10. Failure handling

| # | Failure | Response | Property |
|---|---|---|---|
| 1 | Proof invalid | quorum rejects at PENDING, notify | off-chain, free |
| 2 | Quorum can't reach N-of-M | credential withheld, flag for officer | conservative |
| 3 | Sanctions hit mid-hold | re-screen → immediate REVOKE, future transfers DENY | fail-safe, no window |
| 4 | Credential expired | EXPIRED → transfers DENY until re-proof | fail-safe |
| 5 | False attestation (quorum compromised) | challenger → on-chain verify INVALID → slash, REVOKE | trust backstop |
| 6 | Griefing challenge | on-chain verify VALID → slash challenger | anti-grief |
| 7 | Data source (OFAC SDN) down | do not grant; live creds expire at freshness | never act on stale data |
| 8 | Quorum offline | onboarding stalls; live creds run to expiry then DENY | fail-safe, no extension |
| 9 | Transfer to ineligible recipient | filter DENY | working as designed |
| 10 | Officer key compromised | officer authority behind M-of-N human multisig | accountability |
| 11 | Filter unreachable / bug | DENY-on-failure (proven: panic → token never moves) | fail-safe |
| 12 | Proof / identity replay | nullifier set rejects reuse (incl. revoked-identity reuse) | soundness |
| 13 | Disclosure payload tampered | on-chain commitment lets regulator detect mismatch | auditability |

---

## 11. Institutional layers

- **ERC-3643 / T-REX semantic alignment** — Writ speaks the institutional security-token model (identity + claims + compliance rules + transfer restrictions). Casper's native version is roadmap; Writ ships the equivalent now. Not a snowflake.
- **Bounded autonomy + human override** — the agent acts autonomously within its mandate; the compliance officer holds a high-weight Casper key (behind M-of-N human multisig) that can freeze, override, or force-disclose. Uses Casper's native weighted-action-threshold model — the protocol-level differentiator — and answers the "can a human stop it?" question every CCO asks, without undercutting "agentic" (bounded autonomy is more sophisticated than no-human autonomy).
- **Selective disclosure** — prove holder #X was eligible at time T to a regulator, off-chain, with an on-chain commitment to verify against, without exposing the rest of the book.

---

## 12. Real integrations (zero mocks)

- **OFAC / OpenSanctions SDN** — the agent screens holder accounts directly against the real OFAC SDN / OpenSanctions sanctions list: free, authoritative, ecosystem-neutral. The genuine sanctions source (the actual SDN list), not a proxy or a custom allowlist.
- **CSPR.cloud MCP** — chain reads, balances, contract state for the agent (full testnet parity).

x402-paid OFAC was evaluated and dropped: real x402 OFAC services settle in USDC on Base/Solana, and no OFAC service sits behind the Casper x402 facilitator, so an autonomous WCSPR-settled OFAC screen on Casper isn't a reachable endpoint. Screening goes directly against the authoritative SDN list rather than contorting the product around x402. (If x402 is wanted for Casper-alignment, the clean path is metering Writ itself — issuers pay WCSPR per compliance check — not OFAC-via-x402.)

---

## 13. Honest limitations (own them in the pitch)

- **Sybil resistance is bounded by the KYC issuer** — Writ resists re-entry under the same identity, but a sanctioned person onboarding with a fresh identity is only stoppable if the KYC issuer enforces one-person-one-identity. ZK can't fix this alone.
- **Optimistic security needs a watcher** (mitigated by the issuer-as-watchtower default).
- **Revocation latency = re-screen cadence** — for institutional grade, near-real-time on sanctions-list updates (scheduled floor + event-driven).
- **Trusted, not trustless, on-chain** — enforced by an accountable verifier quorum with on-chain fraud proofs, not by in-contract math.

---

## 14. Scope

**v1 (Buildathon):** eligibility + sanctions gating · single reference asset (tokenized bond) · patched recipient-aware CEP-78 + mint gate · threshold (2-of-3) verification · optimistic on-chain fraud proofs · autonomous runtime re-screening (OFAC SDN) · selective disclosure · officer override · capability-demo on-chain verify.

**v2 (post-Buildathon):** ownership-concentration caps + holding periods (need aggregate balance/lot tracking) · multi-asset shared identity layer (prove once, reuse across compatible assets) · forced-redemption-to-custody for sanctioned holdings · signature aggregation at institutional M · compliant distributions.

Build *order*, not scope cut — the v1 spine is what wins the demo; v2 layers harden it.

---

## 15. Demo screenplay (lead with the visceral, not the architecture)

1. **Onboard, privately.** An investor proves accreditation + jurisdiction + clean-sanctions in ZK — uploads no document to the platform. Writ's quorum verifies off-chain, posts a credential. They can now hold the bond. *Show: no PII anywhere on-chain or in the platform.*
2. **Gated transfer.** Transfer to an eligible holder → PROCEEDS on-chain (real tx). Transfer to a non-credentialed wallet → DENIED on-chain (real tx, revert 159). The asset is gated.
3. **The kicker — autonomous sanctions block.** A current holder hits a sanctions list; the re-screen flags them; Writ's agent REVOKES the credential autonomously. Their next attempt to move the bond → DENIED on-chain, in real time. *Their name never appeared anywhere.*
4. **The trust flex — "watch me cheat."** Push a false eligibility attestation. A challenger triggers the on-chain Groth16 verify on the published proof → invalid → the attestor's bond is slashed on-chain. *"You can't lie to Writ. Here's the proof, verified by anyone."*
5. **Regulator.** A regulator asks "prove holder #X was eligible at time T." Writ produces a selective-disclosure proof for that one fact — without revealing who #X is or exposing the book.

Tagline beat (LICTOR discipline): *"The sanctioned wallet tried to receive the bond. Writ blocked it on-chain. Nobody ever saw their name."*

---

## 16. Build plan (sequenced, on the proven substrate)

1. **Writ Token** — finalize the patched CEP-78 fork (recipient-aware filter wired to read the Registry; mint gate). *Substrate already proven.*
2. **Credential Registry (Odra)** — credential storage (commit/nullifier/flag/expiry/sigs), native `verify_signature` check of quorum sigs, RBAC, nullifier set, published-proof storage + pruning.
3. **ZK circuit** — Circom eligibility predicate; snarkjs prover; arkworks verifier in the agent.
4. **Verifier quorum agent** — proof verify + OFAC SDN screening + threshold co-sign + `put-deploy` submission + re-screen scheduler (delta-screening). On Railway.
5. **Optimistic challenge path** — on-chain Groth16 verifier (Shroud-pattern) + challenge/bond/slash logic.
6. **Officer override** — Casper weighted-multisig authority for freeze/override/disclose.
7. **Selective disclosure** — off-chain disclosure payload + on-chain commitment.
8. **Frontend (Anu)** — issuer dashboard (holder roster, rule sets, revocations), investor proving flow, regulator disclosure view.
9. **Capability demo + live tx capture** — real testnet deploys, demo video.

Each component built and verified before the next. Production-grade, real on-chain, no mocks.

---

## 17. Operational notes (from live derisking — do not relearn these)

- **Use `put-deploy`, not `put-transaction`.** casper-client 5.0.1 TransactionV1 mis-delivers `Option<Key>`/`Key` named args to `vm_casper_v1` contracts (cep78 install reverted 156). Legacy `put-deploy` with a plain `Key` arg works. All contract calls use `put-deploy` until the TransactionV1 Key-arg issue is resolved.
- **Keep `--payment-amount` tight.** `payment_limited` pricing holds the full payment up front with delayed (~24h) gas-hold release; a failed 500 CSPR install cost ~125 CSPR net. Entrypoint calls are <1 CSPR; budget accordingly.
- **Build on the patched cep-78 fork**, pinned `nightly-2025-02-04` (`-Z build-std`, `-C target-cpu=mvp`). 441KB wasm fits the `install_upgrade_lane` (max 750KB, 1000 CSPR, 1/block).
- **Faucet is browser/CAPTCHA only** — fund keys manually.
- `vm_casper_v2 = false` on testnet — BN254 pairing host functions remain unreachable (re-confirms the off-chain-verify architecture).

---

## 18. Tech stack

Contracts: **Odra 2.8.x** + **patched CEP-78** (Casper 2.0, `vm_casper_v1`). ZK: **Circom v2 / snarkjs / Groth16-BN254** prover, **arkworks** verifier. Agent: **Railway**, MCP-driven (CSPR.cloud), OFAC SDN sanctions screening. Infra: casper-client 5.0.1 (`put-deploy`), CSPR.cloud (REST/streaming/Node-RPC, testnet parity), testnet.cspr.live explorer.

---

## 19. Judging & distribution alignment

**Two scoring functions — win both.**

- **Community vote (CSPR.fans):** top 3 advance without judging. Lead with the one-sentence hook (§0). Mobilize the build-in-public audience to earn fan points and vote.
- **Merit (jury + Association discretionary advancement):** institutional depth, real-world applicability, dead-center on Casper's RWA + compliant-privacy + agent thesis.

**Final-round criteria mapping:** Technical execution (real ZK + patched on-chain enforcement, proven live) · Innovation (only ZK-compliance entry in the field) · Agentic systems (autonomous runtime compliance officer as the spine) · Real-world applicability (the #1 RWA blocker) · UX (issuer/regulator dashboards) · Working smart contracts (live testnet, real txs) · Long-term plans (fundable B2B; ERC-3643-for-Casper) · Long-term impact (the compliance primitive every RWA vertical needs).

---

## 20. Long-term vision — Writ as a primitive

Writ is not a feature; it's the compliance layer the RWA agent economy builds on. Every autonomous agent that touches a tokenized real-world asset needs compliant counterparties — and Writ is what they call:

- A **rebalancing agent** moving a portfolio of tokenized RWAs passes Writ's gate on every trade.
- A **distribution / payroll agent** paying coupons or redemptions routes recipients through Writ's eligibility check.
- An **RWA fund or oracle agent** verifies holders and provenance against Writ's credential layer.

None of these are screens or features *inside* Writ — folding them in is the failure mode that kills focus. They are the **demand side**: the ecosystem that makes Writ the primitive everyone integrates. This is the "long-term impact" story and the path from Buildathon entry to a fundable, standards-defining company — the ERC-3643-plus-privacy layer the agentic RWA economy routes through.

---

## 21. Submission checklist

- [x] Transaction-producing on-chain component on Casper Testnet — real txs captured (install, mint, gated transfer, fail-safe deny).
- [ ] Open-source GitHub repo + README (documentation + usage).
- [ ] Public demo video (the §15 screenplay).
- [ ] CSPR.fans listing + community mobilization.
- [ ] Final live deploy of the full Writ stack with captured tx hashes.

---

*Status: architecture locked, substrate proven on live testnet, all design decisions resolved. Next: sequenced build, component by component.*

---

## Live v4 proof points (Casper testnet — copy-paste)

Explorer: `https://testnet.cspr.live/deploy/<hash>`

- Sanctioned sender's transfer reverts on-chain (kicker):
  `3448182cb432dd4278551dc378a8485c7ee9cb09b3c619101ea37efb34a17b1d`
- Fraudulent attestation slashed, 110 CSPR burned (fraud slash):
  `0ae7aecdf9510e34db2e6a2f392630843bbd11176f067124d01f2012d0e00c83`
- Post-fraud transfer reverts (RevokedFraud holder):
  `8922e979320ba28f38cab32b107893a5f868ec07281c9790c8b57d2b2c5786f9`
- Regulated holder attest (genuine Poseidon commitment):
  `f3fd7cbba19ef1195d70df72bc3ea073da4b6f78899c261ffadbc305d7a86645`