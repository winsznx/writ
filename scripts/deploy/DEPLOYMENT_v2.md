> **ARCHIVED — superseded by [DEPLOYMENT.md](./DEPLOYMENT.md) (the canonical V4 manifest).** Kept for development history; hashes below refer to earlier, non-canonical deployments.

# Writ — live testnet deployment manifest

Network: **casper-test** · node `https://node.testnet.casper.network/rpc` · explorer https://testnet.cspr.live
Deployer: `account-hash-f4a01d6b72731c6885e3b4ccdd535a5927b7dec344ed9ebb2b3f705b291a433a`
Installed via `scripts/deploy/deploy_live.py` (put-deploy). One registry, canonical set.

## Funding
| what | from | tx |
| --- | --- | --- |
| +4,000 CSPR top-up | `account-hash-50f4e6e8…1058bf6` | `d02be5426e88cd41b613ae52ac755b8636ae4b27d1e3f03804eaa74e5005b459` |

## Canonical contract set (all SUCCESS)
| contract | package hash | contract hash | install tx | consumed (CSPR) |
| --- | --- | --- | --- | --- |
| groth16-verifier | `hash-62039f4b…711b98` | `hash-d11979c5…931ce0` | `3bca3382b4d56fbb48fcf65cde609d93c0196b79dc1dca5f6d15487aadfa4b43` | 563.9 |
| credential-registry | `hash-75e453a0…45a526` | `hash-d41c37c2…442049` | `f3829a440a2db280ffdd3feb6163037f3a8497a765dcf4338e059a2bd6d3f691` | 376.6 |
| challenge | `hash-64915674…61cdf9` | `hash-0a3176fb…cd851c` | `3b4aaf1e7c5fd488da57b8b977ef03b02f97194a420dd0643ee2415d1ff05f6c` | 334.0 |
| transfer-filter | `hash-e14ed6ae…5ad054` | `hash-b9029271…2196ee` | `4d395864cac9dde85543d93ac462632ef845638f7a09e603208cc2487393ce1b` | 225.8 |
| writ-cep78 | `hash-2a7723ef…ae17c6` | `hash-29cba459…ba1ed3` | `635fc78a48d59e741fa87b64e63424c563e8886aa39fb8de83babee5e98cf7ed` | 560.6 |
| writ-token | `hash-162f6ef3…758c76` | `hash-ceb42200…e330bf` | `4c77a2dd99887f843477e087dd3cbfe05ae85c63bf3653a42d7f9fadf4934186` | 225.7 |

Registry: quorum = q1/q2/q3, threshold 2-of-3, window 0, officer = deployer.
CEP-78: collection `writ-rwa-bond-live`, transfer_filter_contract → transfer-filter contract hash.

## Wiring (all SUCCESS)
| call | tx |
| --- | --- |
| registry.grant_challenge(challenge) | `16498fb0084136942aaf888a11e5f8e8502e1fd6b26d890e798a8834943d5211` |
| registry.grant_officer(deployer) | `1d033d76bf61de17a0c6b60dc11fc927045dd3ce439a8d56e7f46f96088e9437` |

Net install+wire spend: **2,375.3 CSPR**. Gas tracks the EE/June-22 numbers (verifier 564, registry 377, filter 226, cep78 557).

## Live lifecycle proven on this fresh registry (real on-chain calls)
Regulated holder **R** = `account-hash-85d28e05…002697b`, attested with the REAL circuit
proof + public_inputs (192-byte binding); on-chain commitment = field
`15035811943906462549644406659753770806807655073452689440271661979350158729388`.
Quorum q1/q2 bonded (admin `set_bonded` after granting CHALLENGE_ROLE to the deployer).

| beat | entrypoint | tx | result |
| --- | --- | --- | --- |
| onboard (real proof) | attest | `ad6db8da4e2a1d751fdb874027e2ef4440114c10adc5dac6659df75b4c45b4e7` | Active |
| officer freeze | officer_freeze | `86a4bdef295d41ffcb37e6a7c92b064d37d2db0c518fe665cc312fa079a8bcd4` | Frozen |
| officer unfreeze | officer_unfreeze | `a11a5b9f615299421bf2ef303062dadb5ed4711b1ad249f0c2d9f1b8d9501de8` | Active |
| sanctions revoke | revoke | `70d0fa7ddf88c80868326a4afd2d59af616ff22ead2c73c497f7d5ca9a03f509` | Revoked |
| refresh (re-attest) | attest | `0291a6ff6e1fcc9cb5b5557386dab84069c3a5ee56788ffcfe65f5d6e2a50694` | Active |
| officer revoke | officer_revoke | `c0394949727f8fe2fde18b4809603f58d6e1621f9c2fe9f845b3181b9c7f7309` | Revoked |
| officer reinstate | officer_reinstate | `a863aed4ce955677890088d6f3894016409ba3def814cb493ad5e50f407a735b` | Active |
| gate-reason revoke | revoke | `d956927522eefe47a5245bc716ada0527703991007833812ad0b8998003959bc` | Revoked |

Gate read live (gasless query) via `bin/livenet_read`:
- Active → `transfer_allowed=true`, `transfer_check=Allowed`.
- after revoke → `is_active=false`, `transfer_allowed=false`, `transfer_check=SenderRevokedSanctions`.

Selective disclosure: `disclosure/` suite 14/14, recompute Poseidon(claims) == R's LIVE on-chain
commitment (byte-for-byte), tamper → false; verdict carries live status + trail.

## Not reproduced on the fresh registry
(historical note — both items below were addressed/scoped in the Phase A/B follow-up.)

## PHASE A — CEP-78 NFT gating reconstructed + proven LIVE on the fresh registry
The repo `transfer-filter` (e14ed6ae) is a writ-token adapter (`is_transfer_allowed`/`is_active`),
NOT the CEP-78 filter (which calls `can_transfer`+`mint_allowed`). Reconstructed a registry-backed
filter and re-wired CEP-78:

| component | hash | install tx |
| --- | --- | --- |
| writ_registry_filter (recipient-aware, fail-safe deny) | contract `hash-f0152303…` (pkg `d1ee4085…`) | `8b190484…` |
| writ-cep78 v2 (→ filter f0152303) | pkg `hash-31ef406e…` contract `hash-0f21cc0a…` | `bbe82a4f…` |

Gated matrix LIVE (13/13), tx per case (DENY = the NFT op REVERTS, filter error 159):

| beat | tx | result |
| --- | --- | --- |
| mint to eligible (F) | `739dbc78…` | PROCEED |
| mint to ineligible (I) | `86e3acfb…` | **REVERT 159** |
| transfer to eligible (R) | `ca151b11…` | PROCEED |
| transfer to ineligible recipient | `798debbd…` | **REVERT 159** (recipient-aware) |
| revoke sender F | `d3ef3c8e…` | Revoked |
| **transfer from SANCTIONED sender (KICKER)** | `7b5d54c5…` | **REVERT 159** |
| transfer after refresh | `d89f61e9…` | PROCEED |
| officer-freeze sender | `1ff690f4…` | **REVERT 159** |
| transfer after unfreeze | `64c0f3cf…` | PROCEED |

Holders staged with REAL circuit proofs (R commitment `15035…`, F `15952…`). Install gas 88.2 (filter)
/ 560.6 (cep78), filtered-transfer ~1.3 consumed — tracks the live-proven numbers.

## PHASE B — real economic fraud slash: BLOCKED by put-deploy × odra-payable on Casper 2.0
`challenge.bond` and `challenge.challenge` are odra `#[payable]`. odra funds the attached CSPR by
having a session transfer it from the caller's main purse into a cargo purse. On Casper 2.0 a
**put-deploy session cannot transfer from the main purse** — even a 1-CSPR transfer reverts with
mint error 21 (`UnapprovedSpendingAmount`); the legacy-Deploy session spending limit is effectively
zero. Proven via a minimal diagnostic (`11448abc…`). odra's own livenet path uses **put-transaction**
(which violates "put-deploy only") and was additionally rejected by the node for "invalid pricing
mode". Net: the payable bond/challenge **cannot be done under "put-deploy only"** on this node.

Built toward it (ready when put-transaction is permitted): `payable_caller.wasm` (cargo-purse session),
`bin/livenet_challenge` (odra livenet bond/challenge/resolve), fraud holder Z with a REAL **tampered**
proof (`fixtures_Z_fraud`: real inputs + invalid proof → `resolve` verifies FALSE → fraud). The
challenge/slash logic itself is EE-proven (49/49). Decision needed: permit put-transaction for the two
payable calls to complete the live slash.
