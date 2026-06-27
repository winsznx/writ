#!/usr/bin/env python3
"""Attest the regulated holder R against the fresh registry with the REAL proof
artifacts. public_inputs = the verifier fixture inputs.bin (192 bytes, 6 field
elements LE); the registry binds pi[0:32]==nullifier and pi[32:64]==commitment, so
the nullifier/commitment args ARE those slices. proof = proof.bin. Quorum-signs
(q1,q2) over the canonical payload via the project's writ-signer.
"""
import json, re, subprocess, sys, time

NODE = "https://node.testnet.casper.network/rpc"
CHAIN = "casper-test"
KEY = "/tmp/writ-keys/funded_secret_key.pem"
SIGNER = "/tmp/writ-signer/target/release/writ-signer"
REG = json.load(open("/tmp/writ-keys/manifest_live.json"))["registry"]["package"]
ASSET = "writ-bond-001"
HOLDER_HEX = "85d28e05f316f6468b1e96e319df620a0c2270bde6f876144ec441145002697b"
EXPIRY = 4000000000

pi = open("/Users/mac/writ/contracts/groth16-verifier/fixtures/inputs.bin", "rb").read()
proof = open("/Users/mac/writ/contracts/groth16-verifier/fixtures/proof.bin", "rb").read()
assert len(pi) == 192, len(pi)
NULL_HEX = pi[0:32].hex()
COMMIT_HEX = pi[32:64].hex()

def qsign(keypath):
    out = subprocess.run([SIGNER, ASSET, HOLDER_HEX, COMMIT_HEX, NULL_HEX, str(EXPIRY), keypath],
                         capture_output=True, text=True).stdout
    signers = json.loads(re.search(r'SIGNERS_JSON=(\[.*\])', out).group(1))
    sigs = json.loads(re.search(r'SIGNATURES_JSON=(\[.*\])', out).group(1))
    return signers[0], sigs[0]

def main():
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
    out = subprocess.run(
        ["casper-client", "put-deploy", "--node-address", NODE, "--chain-name", CHAIN,
         "--secret-key", KEY, "--session-package-hash", REG, "--session-entry-point", "attest",
         "--session-args-json", json.dumps(args), "--payment-amount", "90000000000"],
        capture_output=True, text=True)
    m = re.search(r'"deploy_hash":\s*"([a-f0-9]{64})"', out.stdout)
    if not m:
        print("SUBMIT FAIL:", out.stdout[-500:], out.stderr[-500:]); sys.exit(1)
    dh = m.group(1)
    print("attest_R deploy:", dh)
    print("  commitment(LE hex):", COMMIT_HEX, "= field", int.from_bytes(pi[32:64], "little"))
    for _ in range(60):
        r = subprocess.run(["casper-client", "get-deploy", "--node-address", NODE, dh],
                           capture_output=True, text=True)
        try: d = json.loads(r.stdout)
        except Exception: time.sleep(8); continue
        ei = d.get("result", {}).get("execution_info")
        if ei and ei.get("execution_result"):
            v2 = ei["execution_result"]["Version2"]
            err = v2.get("error_message")
            print("attest_R:", "FAILURE " + err if err else "SUCCESS", "consumed=", v2.get("consumed"))
            json.dump({"holder": "account-hash-" + HOLDER_HEX, "commitment_le_hex": COMMIT_HEX,
                       "commitment_field": str(int.from_bytes(pi[32:64], "little")),
                       "deploy": dh, "error": err}, open("/tmp/writ-keys/attest_R.json", "w"), indent=2)
            sys.exit(1 if err else 0)
        time.sleep(8)
    print("TIMEOUT"); sys.exit(1)

if __name__ == "__main__":
    main()
