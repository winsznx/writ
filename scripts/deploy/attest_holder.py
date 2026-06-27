#!/usr/bin/env python3
"""Attest an arbitrary holder with a real proof fixture set.
usage: attest_holder.py <holder-account-hash-hex> <fixtures-dir> [expiry]
fixtures-dir holds inputs.bin (192B: pi[0:32]=nullifier, pi[32:64]=commitment) + proof.bin.
"""
import json, re, subprocess, sys, time

NODE = "https://node.testnet.casper.network/rpc"; CHAIN = "casper-test"
KEY = "/tmp/writ-keys/funded_secret_key.pem"
SIGNER = "/tmp/writ-signer/target/release/writ-signer"
REG = json.load(open("/tmp/writ-keys/manifest_live.json"))["registry"]["package"]
ASSET = "writ-bond-001"

HOLDER_HEX = sys.argv[1]
FX = sys.argv[2]
EXPIRY = int(sys.argv[3]) if len(sys.argv) > 3 else 4000000000

pi = open(f"{FX}/inputs.bin", "rb").read()
proof = open(f"{FX}/proof.bin", "rb").read()
assert len(pi) == 192
NULL_HEX, COMMIT_HEX = pi[0:32].hex(), pi[32:64].hex()

def qsign(keypath):
    out = subprocess.run([SIGNER, ASSET, HOLDER_HEX, COMMIT_HEX, NULL_HEX, str(EXPIRY), keypath],
                         capture_output=True, text=True).stdout
    return (json.loads(re.search(r'SIGNERS_JSON=(\[.*\])', out).group(1))[0],
            json.loads(re.search(r'SIGNATURES_JSON=(\[.*\])', out).group(1))[0])

p1, s1 = qsign("/tmp/writ-keys/q1/secret_key.pem")
p2, s2 = qsign("/tmp/writ-keys/q2/secret_key.pem")
args = [
    {"name": "asset_id", "type": "String", "value": ASSET},
    {"name": "holder", "type": "Key", "value": "account-hash-" + HOLDER_HEX},
    {"name": "commitment", "type": {"ByteArray": 32}, "value": COMMIT_HEX},
    {"name": "nullifier", "type": {"ByteArray": 32}, "value": NULL_HEX},
    {"name": "expiry", "type": "U64", "value": EXPIRY},
    {"name": "proof", "type": {"List": "U8"}, "value": proof.hex()},
    {"name": "public_inputs", "type": {"List": "U8"}, "value": pi.hex()},
    {"name": "signers", "type": {"List": "PublicKey"}, "value": [p1, p2]},
    {"name": "signatures", "type": {"List": {"List": "U8"}}, "value": [s1, s2]},
]
out = subprocess.run(["casper-client", "put-deploy", "--node-address", NODE, "--chain-name", CHAIN,
    "--secret-key", KEY, "--session-package-hash", REG, "--session-entry-point", "attest",
    "--session-args-json", json.dumps(args), "--payment-amount", "90000000000"], capture_output=True, text=True)
dh = re.search(r'"deploy_hash":\s*"([a-f0-9]{64})"', out.stdout).group(1)
print(f"attest {HOLDER_HEX[:12]}.. deploy:", dh)
for _ in range(60):
    r = subprocess.run(["casper-client", "get-deploy", "--node-address", NODE, dh], capture_output=True, text=True)
    try: d = json.loads(r.stdout)
    except Exception: time.sleep(8); continue
    ei = d.get("result", {}).get("execution_info")
    if ei and ei.get("execution_result"):
        v2 = ei["execution_result"]["Version2"]; err = v2.get("error_message")
        print("  ", "FAILURE " + err if err else "SUCCESS", "consumed=", round(int(v2["consumed"])/1e9, 2))
        sys.exit(1 if err else 0)
    time.sleep(8)
print("TIMEOUT"); sys.exit(1)
