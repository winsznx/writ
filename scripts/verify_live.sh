#!/usr/bin/env bash
# Re-verify every V5 claim in scripts/deploy/DEPLOYMENT.md against the public testnet
# node. Needs only curl + python3 — no keys, no local state. Exit 0 = every claimed
# transaction exists on casper-test with the claimed outcome.
set -euo pipefail

NODE="${CASPER_NODE:-https://node.testnet.casper.network/rpc}"

# hash | label | expected error ("-" = SUCCESS, otherwise substring of error_message)
CHECKS=$(cat <<'EOF'
2e418b25d19076c16cff94613151c823bdc72edaa0f1210a22844784c3b96b71|verifier install (checked deser)|-
f96b9782c0bfe45a691f8dc0d7388f0b0e22c0cd0f50df592911edfd8f857e62|registry install|-
099758726ffff9a427fe8a0fdf5a34bb242054e9d0fb5e2f6e0758a698ef16a6|set_canonical_inputs (on-chain pin)|-
c777a87466732fb0877227f395b26d748eb7e8d4a64d7d4df1b94ee4bfa49e17|challenge install|-
8c2766e246c9ef3758c726610964176510b9826ee771af854b57d8ffaa5d7d5b|writ_registry_filter install|-
b9223f839cd213b90ce1d0332f3c937953af8cecca877e039ed5ed4eda8fc680|transfer-filter install|-
e948e7720adee512c85f5127ef0d491e8c558a651a8a65035226eca94e27dacf|writ-cep78 install|-
fe6c898a0d8cabcf8beb6971fa09a46008ed720a13f1fcfc6976354615c3a860|writ-token install|-
8cc68bdd617efd7eb83cac6389c2caf98f38deead92be3942ef77a520520fff1|grant_challenge|-
7436d6aabda1ab72438858e36512abcc3792ef70e35e5d238adb3c14c2686b61|grant_officer|-
818c6763032bb6a9b8d8a56faabda159db79498bd90ad3664f9ef066a75cc368|attestor bond q1 (payable)|-
a2dc0c8ad4f90f5b9dd86ada48498a2869c1570d75c5b4bb3f542f6cdb70296b|attest R (holder proof stored)|-
a48ca556e5b6f8ffbd601c49587b04642287a4511aae2bb8d446f54abae11184|attest F|-
fdd73bee6a76c2deaf35684a271536af7c32957e10736e58ede57f534da05f3a|attest E|-
9e0a65e7b83c30f7d80bc61e155291a47ae0f6e8ff03260f7c6a695b62df46a7|attest X (fraud fixture)|-
b742f9a3758778572d15613954fca12cfac3a5e2c9dc40673df7271ebd081075|mint to eligible holder|-
7f685f232d4b12f281e09c3b2abe2d9a8cce260c6f17c1fb437860dd9af3fdf3|mint to ineligible DENIED|User error: 159
4df6736cf34382c6fbbdbffe2dedf1f1b3d72040e6b78ef4721537f73c912105|eligible transfer|-
af706a71f42e838ea7029785a2b80803798ebb34f61b00d5804119615a1bdf35|ineligible-recipient revert|User error: 159
65d81a5aaf7b5fa09bec9ac0867ee12c8ee1b2a84b5eb0a453161e0022ff1984|same route BEFORE sanctions|-
29ad41132ec153d7f3059750010d502a69abcc3c8a3c95bd642dd47fb4c33f84|officer sanctions revoke|-
1af2d7e6821159b83819fed115ba072b7f10090c385ca18e1d5c71d288f4e7f3|KICKER sanctioned-sender revert|User error: 159
dcdf20e5790c67d341f28ef7abb9865598f6e3ddc4f6249c6800179c65ee375b|fraud challenge filed (payable)|-
79cce54a4fbd125ee81c120150c77b8eda66d5acc16331c94790e2c51ad9193f|fraud resolve: Groth16 FALSE + slash|-
0013547bf9a13134d14485db39658c9a0576a9e12580129524443f415a00c056|post-fraud recipient revert|User error: 159
930a89f99c25f5cf05cb41148ea83a9ad5ac695c2834334f7d0d875fc6fc5136|LIVE app self-onboard attest|-
EOF
)

fail=0
while IFS='|' read -r hash label expect; do
  [ -z "$hash" ] && continue
  body=$(curl -s -X POST "$NODE" -H 'Content-Type: application/json' \
    -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"info_get_deploy\",\"params\":{\"deploy_hash\":\"$hash\"}}")
  result=$(printf '%s' "$body" | python3 -c '
import json, sys
try:
    d = json.load(sys.stdin)["result"]
    er = d["execution_info"]["execution_result"]["Version2"]
    print(er.get("error_message") or "-")
except Exception as e:
    print(f"RPC-ERROR: {e}")
')
  if [ "$result" = "$expect" ] || { [ "$expect" != "-" ] && case "$result" in *"$expect"*) true;; *) false;; esac; }; then
    printf 'PASS  %-38s %s\n' "$label" "$hash"
  else
    printf 'FAIL  %-38s %s\n      expected [%s] got [%s]\n' "$label" "$hash" "$expect" "$result"
    fail=1
  fi
done <<< "$CHECKS"

# treasury-transfer check on the slash tx: 110 CSPR to the treasury account
slash=$(curl -s -X POST "$NODE" -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"info_get_deploy","params":{"deploy_hash":"79cce54a4fbd125ee81c120150c77b8eda66d5acc16331c94790e2c51ad9193f"}}')
printf '%s' "$slash" | python3 -c '
import json, sys
d = json.load(sys.stdin)["result"]
transfers = d["execution_info"]["execution_result"]["Version2"]["transfers"]
flat = [(t["Version2"]["to"], int(t["Version2"]["amount"])) for t in transfers]
treasury = "account-hash-50f4e6e85014d95f48678abbdb27c89b78da7119ec1f857bee562f24c1058bf6"
ok_t = any(to == treasury and amt == 110_000_000_000 for to, amt in flat)
ok_c = any(amt == 640_000_000_000 for _, amt in flat)
print(("PASS" if ok_t else "FAIL") + "  slash remainder: 110 CSPR -> treasury (spendable account — NOT a burn)")
print(("PASS" if ok_c else "FAIL") + "  challenger payout: 640 CSPR (390 reward cap + 250 bond refund)")
sys.exit(0 if (ok_t and ok_c) else 1)
' || fail=1

exit $fail
