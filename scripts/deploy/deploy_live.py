#!/usr/bin/env python3
"""Writ canonical clean-deploy driver (put-deploy only) — completes wire_writ.sh:
installs all SIX contracts against ONE registry in dependency order
(verifier, registry, challenge, filter -> cep78, token), wires grant_challenge +
grant_officer, and records every deploy_hash + resolved package/contract hash to a
manifest. Resumable: re-running skips contracts already in the manifest.

  odra contracts (verifier/registry/challenge/filter/token): odra_cfg + ctor args.
  cep-78 (the patched casper NFT): its own install args; transfer_filter_contract
  is the FILTER's CONTRACT hash (cep-78 calls it directly).
"""
import json, re, subprocess, sys, time, os
import pathlib
REPO_ROOT = str(pathlib.Path(__file__).resolve().parents[2])

NODE = "https://node.testnet.casper.network/rpc"
CHAIN = "casper-test"
KEY = "/tmp/writ-keys/funded_secret_key.pem"
C = f"{REPO_ROOT}/contracts"
ASSET = "writ-bond-001"
DEPLOYER = "account-hash-f4a01d6b72731c6885e3b4ccdd535a5927b7dec344ed9ebb2b3f705b291a433a"
TREASURY = DEPLOYER
OFFICER = DEPLOYER
MANIFEST = "/tmp/writ-keys/manifest_live.json"

def q(n):
    return open(f"/tmp/writ-keys/q{n}/public_key_hex").read().strip()

def odra_cfg(keyname):
    return [
        {"name": "odra_cfg_package_hash_key_name", "type": "String", "value": keyname},
        {"name": "odra_cfg_allow_key_override", "type": "Bool", "value": True},
        {"name": "odra_cfg_is_upgradable", "type": "Bool", "value": False},
        {"name": "odra_cfg_is_upgrade", "type": "Bool", "value": False},
    ]

def load_manifest():
    if os.path.exists(MANIFEST):
        return json.load(open(MANIFEST))
    return {}

def save_manifest(m):
    json.dump(m, open(MANIFEST, "w"), indent=2)

def put_deploy(wasm, payment, args_json):
    out = subprocess.run(
        ["casper-client", "put-deploy", "--node-address", NODE, "--chain-name", CHAIN,
         "--secret-key", KEY, "--session-path", wasm, "--payment-amount", str(payment),
         "--session-args-json", json.dumps(args_json)],
        capture_output=True, text=True)
    m = re.search(r'"deploy_hash":\s*"([a-f0-9]{64})"', out.stdout)
    if not m:
        print("SUBMIT FAILED:\n", out.stdout[-800:], out.stderr[-800:]); sys.exit(1)
    return m.group(1)

def call_pkg(pkg_hash, entry, args_json, payment):
    out = subprocess.run(
        ["casper-client", "put-deploy", "--node-address", NODE, "--chain-name", CHAIN,
         "--secret-key", KEY, "--session-package-hash", pkg_hash, "--session-entry-point", entry,
         "--payment-amount", str(payment), "--session-args-json", json.dumps(args_json)],
        capture_output=True, text=True)
    m = re.search(r'"deploy_hash":\s*"([a-f0-9]{64})"', out.stdout)
    if not m:
        print("CALL SUBMIT FAILED:\n", out.stdout[-800:], out.stderr[-800:]); sys.exit(1)
    return m.group(1)

def wait(dh, label):
    for _ in range(60):
        r = subprocess.run(["casper-client", "get-deploy", "--node-address", NODE, dh],
                           capture_output=True, text=True)
        try:
            d = json.loads(r.stdout)
        except Exception:
            time.sleep(8); continue
        ei = d.get("result", {}).get("execution_info")
        if ei and ei.get("execution_result"):
            v2 = ei["execution_result"].get("Version2", {})
            err = v2.get("error_message")
            s = json.dumps(ei)
            pkg = re.search(r'(?:contract-package|package)-([a-f0-9]{64})', s)
            con = re.search(r'entity-contract-([a-f0-9]{64})', s)
            res = {"deploy": dh, "consumed": v2.get("consumed"), "cost": v2.get("cost"),
                   "refund": v2.get("refund"), "error": err,
                   "package": "hash-" + pkg.group(1) if pkg else None,
                   "contract": "hash-" + con.group(1) if con else None}
            status = "FAILURE: " + err if err else "SUCCESS"
            print(f"  {label:28s} {dh}  {status}  consumed={v2.get('consumed')} cost={v2.get('cost')} refund={v2.get('refund')}")
            if err:
                print("  -> aborting on failure"); sys.exit(1)
            return res
        time.sleep(8)
    print(f"  {label}: TIMEOUT {dh}"); sys.exit(1)

def step(man, name, wasm, payment, args):
    if name in man and man[name].get("error") is None:
        print(f"  {name:28s} (cached) package={man[name].get('package')} contract={man[name].get('contract')}")
        return man[name]
    print(f">> install {name}")
    dh = put_deploy(wasm, payment, args)
    res = wait(dh, name)
    man[name] = res; save_manifest(man)
    return res

def main():
    man = load_manifest()
    Q = [q(1), q(2), q(3)]

    # 1. verifier (odra, NoArgs)
    v = step(man, "verifier", f"{C}/groth16-verifier/wasm/Groth16Verifier.wasm", 600000000000,
             odra_cfg("writ_verifier_live"))

    # 2. registry (odra) — quorum 2-of-3, window 0, officer = deployer
    r = step(man, "registry", f"{C}/credential-registry/wasm/CredentialRegistry.wasm", 480000000000,
             odra_cfg("writ_registry_live") + [
                 {"name": "quorum_keys", "type": {"List": "PublicKey"}, "value": Q},
                 {"name": "threshold", "type": "U8", "value": 2},
                 {"name": "window_secs", "type": "U64", "value": 0},
                 {"name": "officer", "type": "Key", "value": OFFICER},
             ])

    # 3. challenge (odra) — registry/verifier as hash-<package>, treasury account
    ch = step(man, "challenge", f"{C}/challenge/wasm/Challenge.wasm", 400000000000,
              odra_cfg("writ_challenge_live") + [
                  {"name": "registry", "type": "Key", "value": r["package"]},
                  {"name": "verifier", "type": "Key", "value": v["package"]},
                  {"name": "treasury", "type": "Key", "value": TREASURY},
                  {"name": "cooldown_secs", "type": "U64", "value": 86400},
                  {"name": "attestor_bond", "type": "U512", "value": "250000000000"},
              ])

    # 4. filter (odra) — registry package + asset
    f = step(man, "filter", f"{C}/transfer-filter/wasm/TransferFilter.wasm", 300000000000,
             odra_cfg("writ_filter_live") + [
                 {"name": "registry", "type": "Key", "value": r["package"]},
                 {"name": "asset_id", "type": "String", "value": ASSET},
             ])

    # 5. cep-78 — transfer_filter_contract = filter CONTRACT hash
    cep_args = [
        {"name": "collection_name", "type": "String", "value": "writ-rwa-bond-live"},
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
        {"name": "transfer_filter_contract", "type": "Key", "value": f["contract"]},
    ]
    cep = step(man, "cep78", f"{C}/writ-cep78/wasm/cep78.wasm", 600000000000, cep_args)

    # 6. writ-token (odra) — filter package
    tok = step(man, "token", f"{C}/writ-token/wasm/WritToken.wasm", 250000000000,
               odra_cfg("writ_token_live") + [
                   {"name": "filter", "type": "Key", "value": f["package"]},
               ])

    # wiring: grant_challenge + grant_officer
    if man.get("grant_challenge", {}).get("error") is not None or "grant_challenge" not in man:
        print(">> grant_challenge")
        dh = call_pkg(r["package"], "grant_challenge",
                      [{"name": "challenge", "type": "Key", "value": ch["package"]}], 5000000000)
        man["grant_challenge"] = wait(dh, "grant_challenge"); save_manifest(man)
    if man.get("grant_officer", {}).get("error") is not None or "grant_officer" not in man:
        print(">> grant_officer")
        dh = call_pkg(r["package"], "grant_officer",
                      [{"name": "officer", "type": "Key", "value": OFFICER}], 5000000000)
        man["grant_officer"] = wait(dh, "grant_officer"); save_manifest(man)

    save_manifest(man)
    print("\n=== MANIFEST ===")
    for k in ["verifier","registry","challenge","filter","cep78","token","grant_challenge","grant_officer"]:
        e = man.get(k, {})
        print(f"{k:16s} pkg={e.get('package')} contract={e.get('contract')} deploy={e.get('deploy')}")

if __name__ == "__main__":
    main()
