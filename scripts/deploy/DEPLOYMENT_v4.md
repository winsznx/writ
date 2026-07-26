# Writ V4 deploy manifest (SUPERSEDED by V5 — see DEPLOYMENT.md)

Retained verbatim: these transactions are still on-chain and still verify.
V5 replaced this set to ship checked Groth16 deserialization and on-chain
canonical public-input pinning.

# Writ — canonical V4 testnet deployment manifest

Network: **casper-test** · node `https://node.testnet.casper.network/rpc` · explorer https://testnet.cspr.live
Installed via `scripts/deploy/deploy_v4.py` (put-deploy; Odra packages installed with
`odra_cfg_is_upgradable: false` — **locked**, no upgrade path). This is the deployment
the live app, the README table, and every claimed proof transaction refer to.

Earlier deployments are archived in [DEPLOYMENT_v2.md](./DEPLOYMENT_v2.md) and
[DEPLOYMENT_v3.md](./DEPLOYMENT_v3.md) — historical only, superseded by this manifest.

## Canonical V4 contract set (all SUCCESS)

| contract | package hash (stable address) | contract hash | install tx | consumed (CSPR) |
| --- | --- | --- | --- | --- |
| groth16-verifier | `2bc9a8556c75ee912bab4f7d2cf2622863d1f1e29eb5cf68685a52d6a718ff61` | `c99e443f…bbb076b` | (reused from v3 install, [`3bca3382…`](https://testnet.cspr.live/deploy/3bca3382b4d56fbb48fcf65cde609d93c0196b79dc1dca5f6d15487aadfa4b43)) | 563.9 |
| credential-registry | `2e19e2bfc5383fd51103ee54fb430b53ec7a1a63c83a7841e08f00b188653fca` | `a0f8ddec…04112d2` | [`109c1d21…`](https://testnet.cspr.live/deploy/109c1d211085ecd1452de371b03df00221fb9713915136efa4b0a0aed729082c) | 385.4 |
| challenge | `c1080d67eed0c4945eadd84bc016d3b183a650086e39de60fb9c96cfe59dda34` | `8bbbce35…263c13f4` | [`60e3ad20…`](https://testnet.cspr.live/deploy/60e3ad20e9ca8caa5f6fe19182f3f876a1668b3ddce5055025d870648375509f) | 334.0 |
| writ_registry_filter (CEP-78 hook) | `d84a932187624c1c982ed5c6dcbd1961fe370f732ce02fcbc0fe3e5e28389726` | `a2cc8c3d…bfbdaf933` | [`a738e2ba…`](https://testnet.cspr.live/deploy/a738e2bacd35ff9899943d5c66a5556d48f3c1d272af78b5239ee76b08b6267b) | 88.2 |
| transfer-filter (Odra, writ-token) | `406e90f7646576e2eb252fe1ce5144823c12b09bfe4c21cede18f9333c5f6d8e` | `957deb64…460727e` | [`cecb0519…`](https://testnet.cspr.live/deploy/cecb05196c3b764d493eeb0698a72209262a4cef8ebcc0d0954d21c0b5778bd2) | 225.8 |
| writ-cep78 (RWA bond NFT) | `ad407c6bccbfc13e9fef28a03b75b175b0d186d3205952be684934c8dcb59bbe` | `9fa2af90…bde3906a` | [`947bfd49…`](https://testnet.cspr.live/deploy/947bfd49be5be57cf3df4bae60c68e5cbfd2a5233dd83474e84551da972ce5d0) | 560.6 |
| writ-token (Odra demo token) | `512068de722212ce497cb081049649339f0a8994394328164f3dde52c4ab8a3e` | `18eb2187…8761f13` | [`a39e60dc…`](https://testnet.cspr.live/deploy/a39e60dc52aff4f0c98550e31a3babbc235f52aa47c98dee9450cfcfb9d6e53c) | 225.6 |

Two filters exist by design: `writ_registry_filter` is the **production CEP-78 hook**
(raw Casper contract from the fork tree, `can_transfer` + `mint_allowed`, wired into
writ-cep78 at install); `transfer-filter` is the Odra adapter used by the Odra
writ-token model. The README contract table points at `writ_registry_filter` for
CEP-78 gating.

## Wiring (all SUCCESS)

| call | tx |
| --- | --- |
| registry.grant_challenge(challenge) | [`2a399d05…`](https://testnet.cspr.live/deploy/2a399d0570d25cc39e4f383fa389e29902edd187879fb19ced60c7ee18de7a18) |
| registry.grant_officer(officer) | [`c7fbc8a8…`](https://testnet.cspr.live/deploy/c7fbc8a87814071e18dafb70a770278fd75b7702fa7e12e31ae0e43fb4d7b925) |

Registry config: quorum = q1/q2/q3 (3 registered ed25519 keys), threshold **2**,
window 0, officer = `account-hash-8580ff20…9ebab6a4`.
Challenge config: registry + verifier packages above, treasury =
`account-hash-50f4e6e8…c1058bf6`, attestor_bond = 250 CSPR (demo sizing).

## Proof transactions (each verified by direct node RPC — `info_get_deploy`)

| what it proves | deploy hash | verified execution result |
| --- | --- | --- |
| Regulated holder attest — real Poseidon commitment + real proof bytes stored | [`f3fd7cbb…`](https://testnet.cspr.live/deploy/f3fd7cbba19ef1195d70df72bc3ea073da4b6f78899c261ffadbc305d7a86645) | SUCCESS, block 8320401, `registry.attest` with 192-byte public_inputs + 256-byte proof |
| Transfer from sanctioned (revoked) sender reverts | [`3448182c…`](https://testnet.cspr.live/deploy/3448182cb432dd4278551dc378a8485c7ee9cb09b3c619101ea37efb34a17b1d) | REVERT user error 159, block 8320282, `cep78.transfer` |
| Transfer to ineligible recipient reverts (recipient-aware) | [`ce0f1a3a…`](https://testnet.cspr.live/deploy/ce0f1a3a03131a4de663d04d60243aa4c261a9f0eab24acf55a4f5af9a26a2ad) | REVERT user error 159, block 8320278 |
| **Fraud slash** — `challenge.resolve` → on-chain Groth16 FALSE → slash 500, pay challenger 640, transfer 110 to treasury | [`0ae7aecd…`](https://testnet.cspr.live/deploy/0ae7aecdf9510e34db2e6a2f392630843bbd11176f067124d01f2012d0e00c83) | SUCCESS, block 8321548, consumed ≈80.37 CSPR; transfers: 640 CSPR → challenger `9711698…`, 110 CSPR → treasury `50f4e6e8…` |
| Post-fraud transfer reverts (RevokedFraud holder blocked) | [`8922e979…`](https://testnet.cspr.live/deploy/8922e979320ba28f38cab32b107893a5f868ec07281c9790c8b57d2b2c5786f9) | REVERT user error 159, block 8321555 |

### Honest wording: "treasury transfer", not "burn"

The 110 CSPR remainder of the slashed pool goes to the **treasury account**
(`account-hash-50f4e6e85014d95f48678abbdb27c89b78da7119ec1f857bee562f24c1058bf6`),
a normal spendable Casper account configured at challenge install. It is **not
destroyed and not unspendable**. All docs and UI call this a *treasury transfer*.
(Casper has no canonical zero-address sink for native CSPR; making the remainder
provably unspendable is production roadmap.)

## The payable workaround (how the live slash was executed)

Odra `#[payable]` entrypoints (`challenge.bond`, `challenge.challenge`) fund the
attached CSPR by transferring from the caller's main purse inside a session. On this
Casper 2.0 testnet node a legacy put-deploy session cannot spend from the main purse
(mint error 21, `UnapprovedSpendingAmount`) — documented while it was still blocking
in [DEPLOYMENT_v2.md](./DEPLOYMENT_v2.md) Phase B.

Resolved by `scripts/deploy/payable_via_cargo.py`:

1. a put-deploy session (`payable_caller.wasm`, in the fork tree) creates a named
   **cargo purse** (no spending);
2. a **native transfer** (`put-transaction transfer` — native transfers may leave the
   main purse) funds the cargo purse with the bond amount;
3. a put-deploy call invokes the payable entrypoint passing `cargo_purse`, which
   odra's `handle_attached_value` drains.

`challenge.resolve` itself is not payable — the recorded slash tx `0ae7aecd…` above is
a plain put-deploy. Bond/challenge deploys for the sequence are visible under the
challenge package's deploys tab on
[cspr.live](https://testnet.cspr.live/contract-package/c1080d67eed0c4945eadd84bc016d3b183a650086e39de60fb9c96cfe59dda34).

## Upgrade / admin authority (disclosure)

- Odra packages (verifier, registry, challenge, both filters, token) were installed
  with `odra_cfg_is_upgradable: false` — **locked**; no key can swap their logic.
  The verifier's verifying key is `include_bytes!`-compiled into the wasm.
- **writ-cep78 is an upgradable package** (standard CEP-78 `new_contract` install);
  the installer account (`8580ff20…`, testnet demo key) holds the access URef and
  could add a contract version. Enforcement cannot be silently removed *without that
  key*, and the registry/filter logic it calls is locked. Production would install a
  locked CEP-78 package or transfer the access URef to a multisig. Disclosed in
  README "Trust model".
- `writ_registry_filter` calls the registry package with `version: None` (latest) —
  moot while the registry package is locked, disclosed for completeness.

## Reproduction

- `scripts/deploy/deploy_v4.py` re-runs the install (needs a funded testnet key;
  paths/keys are parameterized via env — see script header).
- `scripts/verify_live.sh` re-verifies every hash in this manifest against the public
  node RPC from any machine — no keys required.
- Committed wasm artifacts: `contracts/credential-registry/wasm/CredentialRegistry.wasm`
  and `contracts/writ-cep78/wasm/cep78.wasm` are the exact deployed binaries, committed
  so the fork's E2E test suite (`make setup-test`) and the deploy script run from a
  clean clone without the Odra build toolchain. Rebuild with `cargo odra build` in the
  respective crate / `make build-contract` in the fork.
