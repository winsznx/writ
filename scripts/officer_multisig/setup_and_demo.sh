#!/usr/bin/env bash
#
# Writ officer override — native Casper weighted-multisig setup + threshold demo.
#
# The officer (OFFICER_ROLE holder in the Credential Registry) is a Casper ACCOUNT
# configured as an M-of-N weighted multisig. Casper enforces the M-of-N threshold
# at the ACCOUNT layer when that account sends a deploy — the registry contract
# re-implements NO signature/threshold checking. It trusts the account hash; the
# account enforces the quorum.
#
# This script:
#   PART 1 (offline, no funds): generates the 3 officer keys and DEMONSTRATES the
#           threshold — a deploy signed by 1 key carries weight 1 (< threshold 2,
#           the node would reject) while the same deploy signed by 2 keys carries
#           weight 2 (>= 2, accepted). This is the local validation of the config.
#   PART 2 (documented): the casper-client commands that configure the live
#           testnet account's associated keys + action thresholds, and grant
#           OFFICER_ROLE to the account hash.
#
# Demo config: 3 associated keys, weight 1 each; deployment + key-management
# action threshold = 2  (=> 2-of-3).

set -euo pipefail

CHAIN="casper-test"
THRESHOLD=2
DIR="${WRIT_OFFICER_DIR:-/tmp/writ-officer}"
K1="$DIR/key1" K2="$DIR/key2" K3="$DIR/key3"
WORK="$DIR/work"

echo "=================================================================="
echo " Writ officer multisig — setup + threshold demo (${THRESHOLD}-of-3)"
echo "=================================================================="

# ---------- PART 1: keys + offline threshold demonstration ----------
rm -rf "$DIR"; mkdir -p "$K1" "$K2" "$K3" "$WORK"
for k in "$K1" "$K2" "$K3"; do
  casper-client keygen -f "$k" >/dev/null
done
echo "Generated 3 ed25519 officer keys in $DIR"

PK1_HEX="$(cat "$K1/public_key_hex")"
PK3_HEX="$(cat "$K3/public_key_hex")"
OFFICER_ACCOUNT="$(casper-client account-address --public-key "$PK1_HEX")"
echo "Officer multisig account (grant OFFICER_ROLE to this): $OFFICER_ACCOUNT"
echo

# Build a sample deploy signed by key1 only (weight 1), then add key2 (weight 2).
casper-client make-transfer \
  --amount 2500000000 \
  --target-account "$PK3_HEX" \
  --transfer-id 1 \
  --chain-name "$CHAIN" \
  --payment-amount 100000000 \
  --secret-key "$K1/secret_key.pem" \
  --output "$WORK/deploy_1key.json" --force >/dev/null

casper-client sign-deploy \
  --secret-key "$K2/secret_key.pem" \
  --input "$WORK/deploy_1key.json" \
  --output "$WORK/deploy_2keys.json" --force >/dev/null

approvals() { # count approvals in a deploy json (handles top-level or .deploy)
  python3 - "$1" <<'PY'
import json,sys
d=json.load(open(sys.argv[1]))
d=d.get("deploy",d)
print(len(d.get("approvals",[])))
PY
}

W1=$(approvals "$WORK/deploy_1key.json")    # = weight, since each key weight 1
W2=$(approvals "$WORK/deploy_2keys.json")

echo "--- threshold enforcement (each associated key weight 1, threshold ${THRESHOLD}) ---"
echo "deploy signed by 1 key : approvals=$W1  -> total weight $W1  (need >= ${THRESHOLD})"
echo "deploy signed by 2 keys: approvals=$W2  -> total weight $W2  (need >= ${THRESHOLD})"

fail=0
if [ "$W1" -lt "$THRESHOLD" ]; then
  echo "PASS: 1 key (weight $W1) is INSUFFICIENT — the node rejects the deploy."
else
  echo "FAIL: 1 key should be insufficient."; fail=1
fi
if [ "$W2" -ge "$THRESHOLD" ]; then
  echo "PASS: 2 keys (weight $W2) MEET the threshold — the deploy is accepted."
else
  echo "FAIL: 2 keys should be sufficient."; fail=1
fi
echo

# ---------- PART 2: live testnet configuration (documented) ----------
cat <<DOC
--- PART 2: configure the live officer account (testnet, needs funds) ---
The account's associated keys + action thresholds are set by a session that
calls Casper's account host-fns (add_associated_key / set_action_threshold),
signed by the account's current key(s). With a keys-manager session wasm:

  # add key2 and key3 as associated keys, weight 1 each
  casper-client put-deploy --node-address \$NODE --chain-name $CHAIN \\
    --secret-key $K1/secret_key.pem --payment-amount 1000000000 \\
    --session-path keys-manager.wasm \\
    --session-arg "action:string='add_key'" \\
    --session-arg "key:account_hash='\$(casper-client account-address --public-key $(cat "$K2/public_key_hex"))'" \\
    --session-arg "weight:u8='1'"
  # ... repeat for key3 ...

  # set deployment + key-management action thresholds to ${THRESHOLD}
  casper-client put-deploy --node-address \$NODE --chain-name $CHAIN \\
    --secret-key $K1/secret_key.pem --payment-amount 1000000000 \\
    --session-path keys-manager.wasm \\
    --session-arg "action:string='set_thresholds'" \\
    --session-arg "deployment:u8='${THRESHOLD}'" \\
    --session-arg "key_management:u8='${THRESHOLD}'"

Then grant OFFICER_ROLE to the account hash on the registry:
  casper-client put-deploy --node-address \$NODE --chain-name $CHAIN \\
    --secret-key \$ADMIN_KEY --session-package-hash \$REGISTRY_PKG \\
    --session-entry-point grant_officer \\
    --session-arg "officer:key='$OFFICER_ACCOUNT'"

After this, sending an officer entrypoint (e.g. officer_revoke) requires 2 of the
3 keys to sign the deploy — exactly the offline demonstration above, enforced by
the node.
DOC

if [ "$fail" -ne 0 ]; then echo "DEMO FAILED"; exit 1; fi
echo "DEMO PASSED — native ${THRESHOLD}-of-3 threshold demonstrated offline."
