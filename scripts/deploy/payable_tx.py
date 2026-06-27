#!/usr/bin/env python3
"""Run an odra #[payable] call (challenge.bond / challenge.challenge) via the
payable_caller session as a put-TRANSACTION (the permitted exception for the two
payable calls only). Fixed pricing mode (the node rejects PaymentLimited) and
--transferred-value sets the session main-purse spending limit so the cargo purse
can be funded.

usage: payable_tx.py <bond|challenge|fund> <secret-key> <challenge-pkg-hash> <amount-cspr> [arg]
  bond:      arg = attestor pubkey hex
  challenge: arg = holder account-hash (asset fixed = writ-bond-001)
"""
import json, re, subprocess, sys, time

NODE = "https://node.testnet.casper.network/rpc"; CHAIN = "casper-test"
WASM = "/Users/mac/writ/contracts/writ-cep78/fork/target/wasm32-unknown-unknown/release/payable_caller.wasm"
ASSET = "writ-bond-001"

mode, key, chal, amt_cspr = sys.argv[1], sys.argv[2], sys.argv[3], int(sys.argv[4])
arg = sys.argv[5] if len(sys.argv) > 5 else None
chal = chal if chal.startswith("hash-") else "hash-" + chal
amt = amt_cspr * 1_000_000_000

args = [
    {"name": "cspr_amount", "type": "U512", "value": str(amt)},
    {"name": "challenge_pkg", "type": "Key", "value": chal},
    {"name": "mode", "type": "String", "value": mode},
]
if mode == "bond":
    args.append({"name": "attestor", "type": "PublicKey", "value": arg})
elif mode == "challenge":
    args.append({"name": "asset_id", "type": "String", "value": ASSET})
    args.append({"name": "holder", "type": "Key", "value": arg if arg.startswith("account-hash-") else "account-hash-" + arg})

# classic (payment_limited) is the node's only accepted mode; under put-transaction
# the session main-purse spending limit = this payment_amount, so it must exceed the
# bond transfer. gas actually charged = gas_used * gas_price(=1); the rest refunds.
PAY = max(amt + 50_000_000_000, 60_000_000_000)
cmd = ["casper-client", "put-transaction", "session", "--node-address", NODE, "--chain-name", CHAIN,
       "--secret-key", key, "--wasm-path", WASM, "--pricing-mode", "classic",
       "--payment-amount", str(PAY), "--standard-payment", "true",
       "--gas-price-tolerance", "1", "--transaction-runtime", "vm-casper-v1",
       "--transferred-value", str(amt), "--session-args-json", json.dumps(args)]
out = subprocess.run(cmd, capture_output=True, text=True)
m = re.search(r'"transaction_hash":\s*\{?\s*"?(?:Version1"?\s*:\s*)?"([a-f0-9]{64})"', out.stdout) or re.search(r'([a-f0-9]{64})', out.stdout)
if not m:
    print("SUBMIT FAIL:\n", out.stdout[-700:], out.stderr[-500:]); sys.exit(1)
th = m.group(1)
print(f"{mode} txn: {th}")
for _ in range(60):
    r = subprocess.run(["casper-client", "get-transaction", "--node-address", NODE, th], capture_output=True, text=True)
    try: d = json.loads(r.stdout)
    except Exception: time.sleep(8); continue
    ei = d.get("result", {}).get("execution_info")
    if ei and ei.get("execution_result"):
        v2 = ei["execution_result"].get("Version2", {})
        err = v2.get("error_message")
        print(f"  {'SUCCESS' if not err else 'FAIL '+str(err)}  consumed={round(int(v2.get('consumed',0))/1e9,2)}  cost={round(int(v2.get('cost',0))/1e9,2)}")
        sys.exit(1 if err else 0)
    time.sleep(8)
print("TIMEOUT"); sys.exit(1)
