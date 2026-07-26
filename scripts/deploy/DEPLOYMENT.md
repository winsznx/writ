# Writ V5 — canonical deploy manifest (casper-test)

The current demo instance. Deployed with `scripts/deploy/deploy_v5.py` (resumable,
balance-preflighted). Every hash below is re-checked against the public node by
`./scripts/verify_live.sh` — 27/27 PASS, no keys required.

**What V5 changes vs V4**: the groth16-verifier is deployed from the hardened
source (checked deserialization: off-curve, out-of-subgroup and non-canonical
encodings are rejected), and the registry pins the canonical public inputs
on-chain via `set_canonical_inputs`, so an attest whose proof carries a forged
issuer key or jurisdiction root is rejected at admission.

## Contracts

| Contract | Package hash | Contract hash | Install tx | Gas (CSPR) |
|---|---|---|---|---|
| groth16-verifier (checked deser) | `hash-1785d5a368b2daa41c490dd83059d8ba8a62631b6112f5fed19e693c82d1d0fd` | `hash-e501ca714ece7e9818e861f901c1dd29975bb9ea49f1aa88b0782ea0ddd9caf9` | [`2e418b25`](https://testnet.cspr.live/deploy/2e418b25d19076c16cff94613151c823bdc72edaa0f1210a22844784c3b96b71) | 614.3 |
| credential-registry | `hash-74148da7b68ce51e4dfa822af7106daaea7140862106a7b675057caf9ee404ce` | `hash-4169e95d290b5c80134994ff5e85b8eb335b2df8942ec3ebcb1ec5530ed1ce05` | [`f96b9782`](https://testnet.cspr.live/deploy/f96b9782c0bfe45a691f8dc0d7388f0b0e22c0cd0f50df592911edfd8f857e62) | 396.3 |
| challenge | `hash-8cddad302d2d882070d62f581e6118ab371a24ced22294b81454754c2a5fd07e` | `hash-14ce5c4c13e307f3be4f2588f283c7cf42864a7a548b7e6a09154a70e6f21b0a` | [`c777a874`](https://testnet.cspr.live/deploy/c777a87466732fb0877227f395b26d748eb7e8d4a64d7d4df1b94ee4bfa49e17) | 334.0 |
| writ_registry_filter (CEP-78 hook) | `hash-0b1f806b13712752c6740890cb9fae33aa782d47b1c858564d97248c43407fb5` | `hash-5254fa90d7fae22ae427f96a458370074a55fe86ce15d15810562ffea459a047` | [`8c2766e2`](https://testnet.cspr.live/deploy/8c2766e246c9ef3758c726610964176510b9826ee771af854b57d8ffaa5d7d5b) | 88.2 |
| transfer-filter (Odra) | `hash-30cca9f1242679e7396b9a39ad2c087c7a30b1b4848cfb2324bbd4034976d469` | `hash-f8c6f324fe5a0407aef252f25da54868066d40e12f689d59a0d7a5d7f656b4e2` | [`b9223f83`](https://testnet.cspr.live/deploy/b9223f839cd213b90ce1d0332f3c937953af8cecca877e039ed5ed4eda8fc680) | 225.8 |
| writ-cep78 (RWA bond NFT) | `hash-2ce2ff55ebdeb1e72b85dc0634c77ff7a256fb98086fab6d2969af78386e7c97` | `hash-cfec210f12199b74ecd2ad7bb0847db00aa4d2f745c478f825996472d83879b5` | [`e948e772`](https://testnet.cspr.live/deploy/e948e7720adee512c85f5127ef0d491e8c558a651a8a65035226eca94e27dacf) | 561.8 |
| writ-token | `hash-200cd1830a58a5e6154bf2ab31168523d7e90fe06d166fd9650712aa120c4e1b` | `hash-d6bd8dd3b918c04d304aa5f424a4b93b9fffe1c44263df76449f8e77f901d8f5` | [`fe6c898a`](https://testnet.cspr.live/deploy/fe6c898a0d8cabcf8beb6971fa09a46008ed720a13f1fcfc6976354615c3a860) | 225.6 |

## Configuration & wiring

| Step | Tx | Notes |
|---|---|---|
| `set_canonical_inputs` | [`09975872`](https://testnet.cspr.live/deploy/099758726ffff9a427fe8a0fdf5a34bb242054e9d0fb5e2f6e0758a698ef16a6) | pins issuerAx/issuerAy/allowedRoot on-chain |
| `grant_challenge` | [`8cc68bdd`](https://testnet.cspr.live/deploy/8cc68bdd617efd7eb83cac6389c2caf98f38deead92be3942ef77a520520fff1) | CHALLENGE_ROLE → the challenge **package** (Odra addresses contracts by package hash) |
| `grant_officer` | [`7436d6aa`](https://testnet.cspr.live/deploy/7436d6aabda1ab72438858e36512abcc3792ef70e35e5d238adb3c14c2686b61) | OFFICER_ROLE → the single demo officer key |
| attestor bond q1 | [`818c6763`](https://testnet.cspr.live/deploy/818c6763032bb6a9b8d8a56faabda159db79498bd90ad3664f9ef066a75cc368) | 250 CSPR, payable via cargo-purse recipe |
| attestor bond q2 | [`6e648cdb`](https://testnet.cspr.live/deploy/6e648cdb824af49f0e647cfb156a3c7273f7fe7ea36974a34db8567693a6ee54) | 250 CSPR |

### The payable-call workaround (unchanged from V4, still required)

Odra `#[payable]` entrypoints (`challenge.bond`, `challenge.challenge`) cannot be
funded by a plain `put-deploy` session on a node with
`enable_addressable_entity=false`. `scripts/deploy/payable_via_cargo.py` does:
(1) `put-deploy` session creates a cargo purse (no spend); (2) a **native**
`put-transaction` transfer funds it; (3) `put-deploy` calls the payable entrypoint
with `cargo_purse`. Do not use `payable_tx.py` — it consumes the whole payment limit.

## Demo holders (attested with real proofs against the pinned canon)

| Holder | Account | Attest tx | Commitment |
|---|---|---|---|
| R — regulator demo holder | `88e898ecd83ebbdb…` | [`a2dc0c8a`](https://testnet.cspr.live/deploy/a2dc0c8ad4f90f5b9dd86ada48498a2869c1570d75c5b4bb3f542f6cdb70296b) | `0x02279cc98f1b933e…` |
| F — sender | `552993d159f7d3e3…` | [`a48ca556`](https://testnet.cspr.live/deploy/a48ca556e5b6f8ffbd601c49587b04642287a4511aae2bb8d446f54abae11184) | `0xece90e7a51ed0dcf…` |
| E — eligible recipient | `f89922f2b08e8966…` | [`fdd73bee`](https://testnet.cspr.live/deploy/fdd73bee6a76c2deaf35684a271536af7c32957e10736e58ede57f534da05f3a) | `0xa8f412c96cf1b2f1…` |
| X — fraud fixture | `30996ae4fbd13afa…` | [`9e0a65e7`](https://testnet.cspr.live/deploy/9e0a65e7b83c30f7d80bc61e155291a47ae0f6e8ff03260f7c6a695b62df46a7) | `0xb35b5cdbc14c61b6…` |

Holder X is the fraud fixture: attested with **holder R's valid proof bytes**
against X's own public inputs. The bytes deserialize (the checked verifier accepts
the encoding) but fail the pairing — so `resolve` returns FALSE and slashes.

## Demo matrix (every beat a real tx)

| Beat | Outcome | Tx | Revert code |
|---|---|---|---|
| 1_mint_to_ELIGIBLE_F | PROCEED | [`b742f9a3`](https://testnet.cspr.live/deploy/b742f9a3758778572d15613954fca12cfac3a5e2c9dc40673df7271ebd081075) | — |
| 2_mint_to_INELIGIBLE_I | DENY | [`7f685f23`](https://testnet.cspr.live/deploy/7f685f232d4b12f281e09c3b2abe2d9a8cce260c6f17c1fb437860dd9af3fdf3) | User error: 159 |
| 3_transfer_F_to_ELIGIBLE_E | PROCEED | [`4df6736c`](https://testnet.cspr.live/deploy/4df6736cf34382c6fbbdbffe2dedf1f1b3d72040e6b78ef4721537f73c912105) | — |
| 4a_setup_mint_token1_to_F | PROCEED | [`ddeed82a`](https://testnet.cspr.live/deploy/ddeed82a9f72cbddee9e7a0154f07ce0d7a02bbd1c4c0f551ce90475261abc2d) | — |
| 4_transfer_to_INELIGIBLE_recipient | DENY | [`af706a71`](https://testnet.cspr.live/deploy/af706a71f42e838ea7029785a2b80803798ebb34f61b00d5804119615a1bdf35) | User error: 159 |
| 61_transfer_E_to_R_before_sanctions | PROCEED | [`65d81a5a`](https://testnet.cspr.live/deploy/65d81a5aaf7b5fa09bec9ac0867ee12c8ee1b2a84b5eb0a453161e0022ff1984) | — |
| 62_officer_revoke_E_sanctions | PROCEED | [`29ad4113`](https://testnet.cspr.live/deploy/29ad41132ec153d7f3059750010d502a69abcc3c8a3c95bd642dd47fb4c33f84) | — |
| 63_KICKER_transfer_from_SANCTIONED_sender | DENY | [`1af2d7e6`](https://testnet.cspr.live/deploy/1af2d7e6821159b83819fed115ba072b7f10090c385ca18e1d5c71d288f4e7f3) | User error: 159 |
| 8_resolve_FRAUD_groth16_false_slash | PROCEED | [`79cce54a`](https://testnet.cspr.live/deploy/79cce54a4fbd125ee81c120150c77b8eda66d5acc16331c94790e2c51ad9193f) | — |
| 9_transfer_to_REVOKEDFRAUD_recipient | DENY | [`0013547b`](https://testnet.cspr.live/deploy/0013547bf9a13134d14485db39658c9a0576a9e12580129524443f415a00c056) | User error: 159 |

Fraud challenge filed: [`dcdf20e5`](https://testnet.cspr.live/deploy/dcdf20e5790c67d341f28ef7abb9865598f6e3ddc4f6249c6800179c65ee375b) (250 CSPR bond, payable).

## Slash economics — reconciled against live balances

| Flow | Expected | Observed on-chain |
|---|---|---|
| Attestor bonds slashed | 2 × 250 = 500 | both bonds zeroed |
| Challenger payout | 390 reward cap + 250 bond refund = 640 | challenger purse +640 |
| **Treasury transfer** (NOT a burn) | 500 − 390 = 110 | treasury 224.6 → 334.6 CSPR |
| Resolve gas (on-chain pairing verify) | ~80–95 | 95.1 CSPR consumed |

The treasury is an ordinary spendable account. We call this a treasury transfer
everywhere; nothing is burned.

## Reproduce / verify

```bash
./scripts/verify_live.sh          # 27/27 PASS against the public node, no keys
```

Redeploying from scratch (needs ~2,000 CSPR liquid):

```bash
python3 scripts/deploy/deploy_v5.py                    # resumable; caches to manifest
python3 scripts/deploy/payable_via_cargo.py bond <key> <challenge-pkg> 250 <pubkey>
ISSUER_EDDSA_KEY=$(cat internal/issuer_eddsa_key.hex) node scripts/deploy/attest_v5.mjs R F E X
python3 scripts/deploy/matrix_v5.py                    # the demo beats
```

Superseded manifests: [DEPLOYMENT_v4.md](./DEPLOYMENT_v4.md), [DEPLOYMENT_v3.md](./DEPLOYMENT_v3.md), [DEPLOYMENT_v2.md](./DEPLOYMENT_v2.md).
