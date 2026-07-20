#!/usr/bin/env python3
"""Redeploy CEP-78 pointing transfer_filter_contract at the registry-backed filter
(f0152303...). Fresh collection name to avoid the upgrade-path collision. Captures
the new package/contract hash into the manifest under cep78_v2.
"""
import json, re, subprocess, sys, time
import pathlib
REPO_ROOT = str(pathlib.Path(__file__).resolve().parents[2])

NODE = "https://node.testnet.casper.network/rpc"; CHAIN = "casper-test"
KEY = "/tmp/writ-keys/funded_secret_key.pem"
CEP_WASM = f"{REPO_ROOT}/contracts/writ-cep78/wasm/cep78.wasm"
FILTER_CONTRACT = "hash-f0152303b34bd5afacccd49a66946785f5c49154b1db398aaf607471c17103cc"

args = [
    {"name": "collection_name", "type": "String", "value": "writ-rwa-bond-live2"},
    {"name": "collection_symbol", "type": "String", "value": "WRIT"},
    {"name": "total_token_supply", "type": "U64", "value": 20},
    {"name": "allow_minting", "type": "Bool", "value": True},
    {"name": "minting_mode", "type": "U8", "value": 0},
    {"name": "ownership_mode", "type": "U8", "value": 2},
    {"name": "nft_kind", "type": "U8", "value": 0},
    {"name": "holder_mode", "type": "U8", "value": 2},
    {"name": "whitelist_mode", "type": "U8", "value": 0},
    {"name": "acl_whitelist", "type": {"List": "Key"}, "value": []},
    {"name": "acl_package_mode", "type": "Bool", "value": False},
    {"name": "nft_metadata_kind", "type": "U8", "value": 1},
    {"name": "optional_metadata", "type": {"List": "U8"}, "value": []},
    {"name": "additional_required_metadata", "type": {"List": "U8"}, "value": []},
    {"name": "json_schema", "type": "String", "value": ""},
    {"name": "identifier_mode", "type": "U8", "value": 0},
    {"name": "metadata_mutability", "type": "U8", "value": 1},
    {"name": "burn_mode", "type": "U8", "value": 0},
    {"name": "owner_lookup_mode", "type": "U8", "value": 0},
    {"name": "events_mode", "type": "U8", "value": 0},
    {"name": "named_key_convention", "type": "U8", "value": 0},
    {"name": "transfer_filter_contract", "type": "Key", "value": FILTER_CONTRACT},
]
out = subprocess.run(["casper-client", "put-deploy", "--node-address", NODE, "--chain-name", CHAIN,
    "--secret-key", KEY, "--session-path", CEP_WASM, "--payment-amount", "650000000000",
    "--session-args-json", json.dumps(args)], capture_output=True, text=True)
dh = re.search(r'"deploy_hash":\s*"([a-f0-9]{64})"', out.stdout).group(1)
print("cep78_v2 install:", dh)
for _ in range(60):
    r = subprocess.run(["casper-client", "get-deploy", "--node-address", NODE, dh], capture_output=True, text=True)
    try: d = json.loads(r.stdout)
    except Exception: time.sleep(8); continue
    ei = d.get("result", {}).get("execution_info")
    if ei and ei.get("execution_result"):
        v2 = ei["execution_result"]["Version2"]; err = v2.get("error_message"); s = json.dumps(ei)
        pkg = re.search(r'(?:contract-package|package)-([a-f0-9]{64})', s)
        con = re.search(r'entity-contract-([a-f0-9]{64})', s)
        print("result:", "FAIL " + err if err else "SUCCESS", "consumed=", round(int(v2["consumed"])/1e9, 1))
        print("package:", "hash-" + pkg.group(1) if pkg else None)
        print("contract:", "hash-" + con.group(1) if con else None)
        if not err:
            man = json.load(open("/tmp/writ-keys/manifest_live.json"))
            man["cep78_v2"] = {"deploy": dh, "package": "hash-" + pkg.group(1) if pkg else None,
                               "contract": "hash-" + con.group(1) if con else None, "filter": FILTER_CONTRACT}
            json.dump(man, open("/tmp/writ-keys/manifest_live.json", "w"), indent=2)
        sys.exit(1 if err else 0)
    time.sleep(8)
print("TIMEOUT"); sys.exit(1)
