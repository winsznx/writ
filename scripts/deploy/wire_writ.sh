#!/usr/bin/env bash
#
# Writ clean-deploy + wiring — install the canonical contract set against ONE
# registry and wire them into a single live system. This is the exact sequence
# the EE integration test (contracts/integration) runs in-process; here it is the
# real testnet deploy via `put-deploy` (NOT put-transaction). Run once, funded,
# at submission. The funded key is read from $FUNDED_KEY and never committed.
#
# Canonical set (install order — dependents reference their dependencies):
#   1. groth16-verifier   (NoArgs)
#   2. credential-registry (quorum 2-of-3, window 0, officer = multisig account)
#   3. challenge           (registry, verifier, treasury, cooldown, attestor_bond)
#   4. transfer-filter     (registry, asset_id)
#   5. writ-token          (filter)
# Wiring:
#   registry.grant_challenge(challenge_pkg) ; registry.grant_officer(multisig)
#   bond the 2-of-3 attestors (each attaches the demo attestor_bond)
#
# Demo attestor_bond = 250 CSPR (keeps the live demo affordable); PRODUCTION = 5000.

set -euo pipefail

NODE="${NODE:-https://node.testnet.casper.network/rpc}"
CHAIN="casper-test"
SK="${FUNDED_KEY:?set FUNDED_KEY=/path/to/funded secret_key.pem}"
WASM_DIR="${WASM_DIR:-$(cd "$(dirname "$0")/../.." && pwd)/contracts}"
ASSET="${ASSET:-writ-bond-001}"
DEMO_BOND_MOTES="${DEMO_BOND_MOTES:-250000000000}"      # 250 CSPR
PROD_BOND_MOTES="5000000000000"                          # 5000 CSPR (documented)
THRESHOLD=2
WINDOW=0
COOLDOWN=86400                                           # 1 day

# Quorum signing keys (the 2-of-3 attestors) and the officer multisig account
# hash (from scripts/officer_multisig/setup_and_demo.sh). Set these before running.
Q1_HEX="${Q1_HEX:?set Q1_HEX (attestor 1 public key hex)}"
Q2_HEX="${Q2_HEX:?set Q2_HEX}"
Q3_HEX="${Q3_HEX:?set Q3_HEX}"
OFFICER_ACCOUNT="${OFFICER_ACCOUNT:?set OFFICER_ACCOUNT (account-hash-… of the multisig)}"
TREASURY="${TREASURY:?set TREASURY (account-hash-… for burns)}"

deployer_account() { casper-client account-address --public-key "$(dirname "$SK")/public_key_hex" 2>/dev/null; }
ACCOUNT="$(deployer_account)"

put() { # entry-point install/call helper: $1=descr, rest=casper-client args
  local descr="$1"; shift
  echo ">> $descr" >&2
  local hash
  hash="$(casper-client put-deploy --node-address "$NODE" --chain-name "$CHAIN" \
    --secret-key "$SK" "$@" 2>/dev/null | grep -oE '"deploy_hash": "[a-f0-9]{64}"' | grep -oE '[a-f0-9]{64}')"
  echo "   deploy: $hash" >&2
  for _ in $(seq 1 40); do
    local res; res="$(casper-client get-deploy --node-address "$NODE" "$hash" 2>/dev/null)"
    if echo "$res" | grep -q '"Success"'; then echo "   OK" >&2; return 0; fi
    if echo "$res" | grep -q '"Failure"'; then echo "   FAILED"; echo "$res" | tail -5; exit 1; fi
    sleep 7
  done; echo "   TIMEOUT"; exit 1
}

pkg_hash() { # read a package hash from the deployer account's named keys
  casper-client query-global-state --node-address "$NODE" \
    --state-root-hash "$(casper-client get-state-root-hash --node-address "$NODE" | grep -oE '[a-f0-9]{64}' | head -1)" \
    --key "$ACCOUNT" 2>/dev/null | grep -A2 "\"$1\"" | grep -oE 'hash-[a-f0-9]{64}' | head -1
}

odra_cfg() { # standard odra install cfg args for package key name $1
  echo "--session-arg odra_cfg_package_hash_key_name:string='$1' \
        --session-arg odra_cfg_allow_key_override:bool='true' \
        --session-arg odra_cfg_is_upgradable:bool='false' \
        --session-arg odra_cfg_is_upgrade:bool='false'"
}

# 1. verifier ---------------------------------------------------------------
put "install groth16-verifier" --payment-amount 700000000000 \
  --session-path "$WASM_DIR/groth16-verifier/wasm/Groth16Verifier.wasm" \
  $(odra_cfg writ_verifier_pkg)
VERIFIER="$(pkg_hash writ_verifier_pkg)"

# 2. registry (officer = the multisig account) ------------------------------
put "install credential-registry" --payment-amount 450000000000 \
  --session-path "$WASM_DIR/credential-registry/wasm/CredentialRegistry.wasm" \
  $(odra_cfg writ_registry_pkg) \
  --session-arg "quorum_keys:public_key='$Q1_HEX',public_key='$Q2_HEX',public_key='$Q3_HEX'" \
  --session-arg "threshold:u8='$THRESHOLD'" \
  --session-arg "window_secs:u64='$WINDOW'" \
  --session-arg "officer:key='$OFFICER_ACCOUNT'"
REGISTRY="$(pkg_hash writ_registry_pkg)"

# 3. challenge --------------------------------------------------------------
put "install challenge" --payment-amount 400000000000 \
  --session-path "$WASM_DIR/challenge/wasm/Challenge.wasm" \
  $(odra_cfg writ_challenge_pkg) \
  --session-arg "registry:key='$REGISTRY'" \
  --session-arg "verifier:key='$VERIFIER'" \
  --session-arg "treasury:key='$TREASURY'" \
  --session-arg "cooldown_secs:u64='$COOLDOWN'" \
  --session-arg "attestor_bond:u512='$DEMO_BOND_MOTES'"
CHALLENGE="$(pkg_hash writ_challenge_pkg)"

# 4. transfer-filter (bound to the registry + asset) ------------------------
put "install transfer-filter" --payment-amount 120000000000 \
  --session-path "$WASM_DIR/transfer-filter/wasm/TransferFilter.wasm" \
  $(odra_cfg writ_filter_pkg) \
  --session-arg "registry:key='$REGISTRY'" \
  --session-arg "asset_id:string='$ASSET'"
FILTER="$(pkg_hash writ_filter_pkg)"

# 5. writ-token (gated by the filter) ---------------------------------------
put "install writ-token" --payment-amount 120000000000 \
  --session-path "$WASM_DIR/writ-token/wasm/WritToken.wasm" \
  $(odra_cfg writ_token_pkg) \
  --session-arg "filter:key='$FILTER'"
TOKEN="$(pkg_hash writ_token_pkg)"

# wire: grant roles ---------------------------------------------------------
put "grant_challenge -> challenge" --payment-amount 3000000000 \
  --session-package-hash "$REGISTRY" --session-entry-point grant_challenge \
  --session-arg "challenge:key='$CHALLENGE'"
put "grant_officer -> multisig" --payment-amount 3000000000 \
  --session-package-hash "$REGISTRY" --session-entry-point grant_officer \
  --session-arg "officer:key='$OFFICER_ACCOUNT'"

# bond the 2-of-3 attestors (each attaches the demo bond; signed by that key) --
for KH in "$Q1_HEX" "$Q2_HEX" "$Q3_HEX"; do
  echo "NOTE: attestor $KH must run: casper-client put-deploy --session-package-hash $CHALLENGE \\"
  echo "  --session-entry-point bond --session-arg \"attestor:public_key='$KH'\" \\"
  echo "  --payment-amount $DEMO_BOND_MOTES --secret-key <that attestor's key>  (caller must be the bond owner)"
done

cat <<SUMMARY
=== wired Writ system (one registry) ===
verifier  = $VERIFIER
registry  = $REGISTRY   (officer = $OFFICER_ACCOUNT)
challenge = $CHALLENGE  (attestor_bond = $DEMO_BOND_MOTES motes ; prod $PROD_BOND_MOTES)
filter    = $FILTER     -> registry + asset '$ASSET'
token     = $TOKEN      -> filter
SUMMARY
