# writ-cep78 — the patched, recipient-aware CEP-78

The **real** Writ token: a fork of the Casper **cep-78-enhanced-nft v2.0.0**
standard (`casper-ecosystem/cep-78-enhanced-nft` @ `9a624aa`) with the Writ
recipient-aware patch. This replaces the earlier `contracts/writ-token` reference
model — that was a lightweight Odra harness; **this is the production token**.

- `fork/` — the full patched fork (vendored, minus `target/`/`.git`). Builds with
  `nightly-2025-02-04`: `cd fork && cargo build --release --target wasm32-unknown-unknown -p cep78`.
- `wasm/cep78.wasm` — the proven 443 KB contract wasm (installs live at ~557 CSPR).
- `WRIT_RECIPIENT_AWARE.patch` — the 25-line patch over the standard, as a diff.

Recovered (not recreated): the fork survived at `/tmp/casper-smoke/cep-78` from the
substrate smoke test; the patch is its only working change to
`contracts/contract/src/main.rs`.

## The patch — two gates, both routed to the live registry

The unpatched CEP-78 transfer filter is **recipient-blind**: it passes the current
*owner* as `ARG_TARGET_KEY`, so a filter cannot gate on who is *receiving*. The
patch fixes this and adds the separate mint gate:

1. **Transfer gate (recipient-aware).** `transfer()` reads the real recipient and
   passes it into the filter:
   `filter.can_transfer(source_key, target_key) -> u8` (0 = Deny), where the filter
   delegates to `Registry.transfer_allowed(asset, source, target)`.
2. **Mint gate (separate, at the registry).** The transfer filter does NOT fire on
   mint. Instead `mint()` calls a distinct `filter.mint_allowed(target_key) -> bool`,
   which delegates to `Registry.is_active(asset, recipient)` — so issuance is gated
   on recipient eligibility, separately from transfers.

```
cep-78.transfer ─▶ filter.can_transfer(source, target) ─▶ Registry.transfer_allowed
cep-78.mint     ─▶ filter.mint_allowed(target)         ─▶ Registry.is_active
```

A filter wired to Writ must implement BOTH `can_transfer` and `mint_allowed`. The
standard `transfer_filter_contract` implements only `can_transfer`, so the standard
filter-mode test fails on the patched contract at the mint step — that failure is
the patch working: mint is registry-gated and requires `mint_allowed`.

## Tests (real EE — casper-engine-test-support)

CEP-78 is a **raw Casper contract** (`#![no_std] #![no_main]`, `extern "C"`
entrypoints), so it runs on the **real execution engine** (`casper-engine-test-support`
/ testnet), NOT the Odra mock VM (OdraVM). The Odra contracts
(credential-registry, challenge, integration) run on both backends; the cep-78
real-NFT path is real-EE only — there is no way to execute raw Casper wasm on the
OdraVM mock.

- `fork/contracts/test-contracts/writ_filter/` — a recipient-discriminating filter
  (allowed-dict + `can_transfer` + `mint_allowed`).
- `fork/tests/src/writ_smoke.rs` — installs the patched cep-78 + writ_filter and
  proves through **real NFT transfers** on the real EE (`writ_filter_smoke` — PASS):
  (a) transfer to an eligible recipient PROCEEDS; (b) transfer to a disallowed
  *recipient* REVERTS (159) where the unpatched recipient-blind hook would have
  proceeded; (c) mint to an ineligible recipient REVERTS via `mint_allowed` (mint
  gated separately at the registry); (d) panic mode is fail-safe (token never
  moves). Run: `cd fork && cargo +nightly-2025-02-04 test --release -p tests writ_filter_smoke`.
  The v3 registry states (Revoked / RevokedFraud / officer- & challenge-Frozen /
  Expired) are exercised against `transfer_allowed`/`is_active` in the registry's
  44 EE tests (both backends); the production filter routes those to the NFT here.

The v3-state gate correctness (Revoked / RevokedFraud / officer-Frozen /
challenge-Frozen / Expired all denied; recipient must be `is_active`) is proven at
the registry level in `contracts/credential-registry` (44 EE tests, both backends);
the production wiring routes those decisions to the NFT via the `can_transfer` /
`mint_allowed` filter above.

## Gas
- **Live-proven (testnet):** install ≈ **557 CSPR** · per direct transfer ≈ **0.87 CSPR**.
- **Real EE (`writ_filter_smoke`):** a filtered transfer through the transfer-session
  harness (session wasm + cep-78 transfer + cross-contract filter call) ≈ **4.73 CSPR**.
All well under the 812.5 CSPR block limit. The patch adds exactly one cross-contract
filter call to each transfer and one to each mint.
