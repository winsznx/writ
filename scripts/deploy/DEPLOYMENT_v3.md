# Writ V3 — the canonical demo instance (role-revocable, admin renounced)

Network **casper-test** · node `https://node.testnet.casper.network` · explorer https://testnet.cspr.live
Deployer (key3, admin → **renounced**): `account-hash-9711698476d5a4f529ad4c2bcc0232ba23d0725b029e482df69075d076b44b3b`
Officer multisig (2-of-3): `account-hash-ba4c447b6f9852c9765f0b965a5cc8bfd8318a28b8e2d6b15cec8d7b1e00ad15`
Treasury (burn sink): `account-hash-50f4e6e8…1058bf6`

## Canonical set (put-deploy)
| contract | package | install tx |
| --- | --- | --- |
| groth16-verifier | `hash-2bc9a855…` | `a2632655…` |
| credential-registry (role-revocable) | `hash-af87da4e…` | `2d6b1b44…` |
| challenge | `hash-28e4bc44…` | `e57ac902…` |
| writ_registry_filter (cep78 filter, recipient-aware, fail-safe) | contract `hash-63fa4d6b…` (pkg `4202c9d1…`) | `ab42b67f…` |
| transfer-filter (writ-token) | `hash-76755981…` | `ccaf931d…` |
| writ-cep78 (→ filter 63fa4d6b) | `hash-4c6c1fcf…` | `3694c3f4…` |
| writ-token | `hash-a1b4613a…` | `9af6e405…` |

Wiring: `grant_challenge(challenge contract)` `f0359764…` · `grant_officer(multisig)` `0cbed3ed…`.

## Payable mechanism (the unlock)
Node config: `pricing_handling = payment_limited`, `enable_addressable_entity = false`.
Sessions cannot move CSPR from the account main purse (mint err 21 UnapprovedSpendingAmount),
which defeats odra's cargo-purse funding by put-deploy AND put-transaction. **Recipe that works
(all put-deploy except step 2):** (1) a session creates a cargo purse [no spend]; (2) a NATIVE
transfer funds it [native transfers may leave main]; (3) the payable entrypoint is called with
`cargo_purse`, which odra's `handle_attached_value` pulls in. `scripts/deploy/payable_via_cargo.py`.

## Real bonds (distinct parties)
| who | bond tx |
| --- | --- |
| attestor q1 (250) | `83dcfef9…` |
| attestor q2 (250) | `11e93c00…` |

## Lifecycle matrix (real proofs; holders key3=sender, R=eligible, I/Z=ineligible)
| beat | tx |
| --- | --- |
| onboard key3 (real proof → 2-of-3 attest) | `c833ee62…` |
| mint → eligible / **ineligible REVERT 159** | `3cda1ec5…` / `6744fdc5…` |
| transfer → eligible R | `a58c40d0…` |
| transfer → ineligible recipient REVERT 159 | `42be8f5a…` |
| revoke key3 (OFAC) | `4a38f3a0…` |
| **transfer from SANCTIONED sender REVERT 159 (KICKER)** | `dd703e48…` |
| refresh → Active → transfer PROCEEDS | re-attest + xfer (beats json) |

## REAL economic fraud slash (adversarial, burning)
Fraud holder Z attested with a **tampered** proof (`98efc564…`).
| step | tx |
| --- | --- |
| challenger key4 bond (250) → Z FROZEN | `ad96ade9…` |
| resolve → on-chain verify FALSE → fraud | `f0550884…` |
| post-fraud NFT transfer → Z REVERT 159 | `ffc08ca3…` |

CSPR movement: q1+q2 bonds (500) slashed → challenger paid **640** (reward 390 + bond refund 250),
**BURN 110** to treasury (4.6 → **114.6**). Z status = **RevokedFraud**. Effects (state) preceded
interactions (CSPR).

## Officer multisig (native 2-of-3)
account-config `d1798129…` (3 keys, thresholds {deployment:2, key_management:2}).
1-key officer op → **rejected (Invalid)**; 2-key officer_freeze(R) → `5b067ee3…` SUCCESS.

## Finalize — renounce, institutional-grade final state
- `renounce_role(DEFAULT_ADMIN_ROLE)` `7ba73f34…`; post-renounce `grant_challenge` → **REVERT 20003**.
- Post-renounce lifecycle (nothing bricked): officer_unfreeze via multisig `cbb09df3…`; gated
  transfer `1583691a…`; re-bond q1/q2 (`98e2bdcd…`/`d74f65f1…`) + re-attest `f4c7c469…`.
- Final roles: **no key holds admin or challenge**; CHALLENGE_ROLE = challenge contract,
  OFFICER_ROLE = 2-of-3 multisig, QUORUM_ROLE = deployer (coordinator, runtime-required — kept).
