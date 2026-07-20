#!/usr/bin/env bash
# Re-verify every claim in scripts/deploy/DEPLOYMENT.md against the public testnet
# node. Needs only curl + python3 — no keys, no local state. Exit 0 = every claimed
# transaction exists on casper-test with the claimed outcome.
set -euo pipefail

NODE="${CASPER_NODE:-https://node.testnet.casper.network/rpc}"

# hash | label | expected error ("-" = SUCCESS, otherwise substring of error_message)
CHECKS=$(cat <<'EOF'
109c1d211085ecd1452de371b03df00221fb9713915136efa4b0a0aed729082c|registry install|-
60e3ad20e9ca8caa5f6fe19182f3f876a1668b3ddce5055025d870648375509f|challenge install|-
a738e2bacd35ff9899943d5c66a5556d48f3c1d272af78b5239ee76b08b6267b|writ_registry_filter install|-
cecb05196c3b764d493eeb0698a72209262a4cef8ebcc0d0954d21c0b5778bd2|transfer-filter install|-
947bfd49be5be57cf3df4bae60c68e5cbfd2a5233dd83474e84551da972ce5d0|writ-cep78 install|-
a39e60dc52aff4f0c98550e31a3babbc235f52aa47c98dee9450cfcfb9d6e53c|writ-token install|-
2a399d0570d25cc39e4f383fa389e29902edd187879fb19ced60c7ee18de7a18|grant_challenge|-
c7fbc8a87814071e18dafb70a770278fd75b7702fa7e12e31ae0e43fb4d7b925|grant_officer|-
f3fd7cbba19ef1195d70df72bc3ea073da4b6f78899c261ffadbc305d7a86645|attest (real proof stored)|-
3448182cb432dd4278551dc378a8485c7ee9cb09b3c619101ea37efb34a17b1d|sanctioned-sender transfer revert|User error: 159
ce0f1a3a03131a4de663d04d60243aa4c261a9f0eab24acf55a4f5af9a26a2ad|ineligible-recipient transfer revert|User error: 159
0ae7aecdf9510e34db2e6a2f392630843bbd11176f067124d01f2012d0e00c83|fraud slash resolve|-
8922e979320ba28f38cab32b107893a5f868ec07281c9790c8b57d2b2c5786f9|post-fraud transfer revert|User error: 159
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
  -d '{"jsonrpc":"2.0","id":1,"method":"info_get_deploy","params":{"deploy_hash":"0ae7aecdf9510e34db2e6a2f392630843bbd11176f067124d01f2012d0e00c83"}}')
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
