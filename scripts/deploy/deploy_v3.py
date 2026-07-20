#!/usr/bin/env python3
"""V3 canonical clean-deploy: the role-revocable registry as THE demo instance.
New deployer (key3). put-deploy. Installs verifier, registry(role-revocable),
challenge, writ_registry_filter(cep78 filter, raw), transfer-filter(odra, for
writ-token), cep78(->writ_registry_filter), writ-token(->transfer-filter); wires
grant_challenge(challenge package=the CONTRACT) + grant_officer(multisig acct).
"""
import json, re, subprocess, sys, time, os
import pathlib
REPO_ROOT = str(pathlib.Path(__file__).resolve().parents[2])

NODE = "https://node.testnet.casper.network/rpc"; CHAIN = "casper-test"
KEY = "/tmp/writ-keys2/deployer_secret_key.pem"
C = f"{REPO_ROOT}/contracts"
ASSET = "writ-bond-001"
OFFICER = "account-hash-ba4c447b6f9852c9765f0b965a5cc8bfd8318a28b8e2d6b15cec8d7b1e00ad15"
TREASURY = "account-hash-50f4e6e85014d95f48678abbdb27c89b78da7119ec1f857bee562f24c1058bf6"
FILTER_RAW = f"{C}/writ-cep78/fork/target/wasm32-unknown-unknown/release/writ_registry_filter.wasm"
MANIFEST = "/tmp/writ-keys2/manifest_v3.json"

def q(n): return open(f"/tmp/writ-keys/q{n}/public_key_hex").read().strip()
def odra_cfg(k): return [
    {"name": "odra_cfg_package_hash_key_name", "type": "String", "value": k},
    {"name": "odra_cfg_allow_key_override", "type": "Bool", "value": True},
    {"name": "odra_cfg_is_upgradable", "type": "Bool", "value": False},
    {"name": "odra_cfg_is_upgrade", "type": "Bool", "value": False}]

def load(): return json.load(open(MANIFEST)) if os.path.exists(MANIFEST) else {}
def save(m): json.dump(m, open(MANIFEST, "w"), indent=2)

def srh():
    out = subprocess.run(["casper-client", "get-state-root-hash", "--node-address", NODE], capture_output=True, text=True).stdout
    return re.search(r'[a-f0-9]{64}', out).group(0)

def install(wasm, payment, args):
    out = subprocess.run(["casper-client", "put-deploy", "--node-address", NODE, "--chain-name", CHAIN,
        "--secret-key", KEY, "--session-path", wasm, "--payment-amount", str(payment),
        "--session-args-json", json.dumps(args)], capture_output=True, text=True)
    m = re.search(r'"deploy_hash":\s*"([a-f0-9]{64})"', out.stdout)
    if not m: print("SUBMIT FAIL", out.stdout[-500:], out.stderr[-400:]); sys.exit(1)
    return m.group(1)

def call(pkg, ep, args, payment):
    out = subprocess.run(["casper-client", "put-deploy", "--node-address", NODE, "--chain-name", CHAIN,
        "--secret-key", KEY, "--session-package-hash", pkg, "--session-entry-point", ep,
        "--payment-amount", str(payment), "--session-args-json", json.dumps(args)], capture_output=True, text=True)
    return re.search(r'"deploy_hash":\s*"([a-f0-9]{64})"', out.stdout).group(1)

def wait(dh, label):
    for _ in range(60):
        r = subprocess.run(["casper-client", "get-deploy", "--node-address", NODE, dh], capture_output=True, text=True)
        try: d = json.loads(r.stdout)
        except Exception: time.sleep(8); continue
        ei = d.get("result", {}).get("execution_info")
        if ei and ei.get("execution_result"):
            v2 = ei["execution_result"]["Version2"]; err = v2.get("error_message"); s = json.dumps(ei)
            pkg = re.search(r'(?:contract-package|package)-([a-f0-9]{64})', s)
            con = re.search(r'entity-contract-([a-f0-9]{64})', s)
            print(f"  {label:24s} {dh}  {'SUCCESS' if not err else 'FAIL '+err}  consumed={round(int(v2['consumed'])/1e9,1)}")
            if err: sys.exit(1)
            return {"deploy": dh, "package": "hash-"+pkg.group(1) if pkg else None,
                    "contract": "hash-"+con.group(1) if con else None, "consumed": v2.get("consumed")}
        time.sleep(8)
    print("TIMEOUT", label); sys.exit(1)

def step(man, name, wasm, payment, args):
    if name in man: print(f"  {name:24s}(cached) {man[name].get('package')}"); return man[name]
    print(f">> {name}")
    res = wait(install(wasm, payment, args), name); man[name] = res; save(man); return res

def raw_filter_contract(pkg_hash):
    out = subprocess.run(["casper-client", "query-global-state", "--node-address", NODE,
        "--state-root-hash", srh(), "--key", pkg_hash], capture_output=True, text=True).stdout
    m = re.search(r'entity-contract-([a-f0-9]{64})', out)
    return "hash-" + m.group(1) if m else None

def main():
    man = load(); Q = [q(1), q(2), q(3)]
    v = step(man, "verifier", f"{C}/groth16-verifier/wasm/Groth16Verifier.wasm", 600000000000, odra_cfg("writ_verifier_v3"))
    r = step(man, "registry", f"{C}/credential-registry/wasm/CredentialRegistry.wasm", 500000000000,
             odra_cfg("writ_registry_v3") + [
                 {"name": "quorum_keys", "type": {"List": "PublicKey"}, "value": Q},
                 {"name": "threshold", "type": "U8", "value": 2},
                 {"name": "window_secs", "type": "U64", "value": 0},
                 {"name": "officer", "type": "Key", "value": OFFICER}])
    ch = step(man, "challenge", f"{C}/challenge/wasm/Challenge.wasm", 400000000000,
              odra_cfg("writ_challenge_v3") + [
                  {"name": "registry", "type": "Key", "value": r["package"]},
                  {"name": "verifier", "type": "Key", "value": v["package"]},
                  {"name": "treasury", "type": "Key", "value": TREASURY},
                  {"name": "cooldown_secs", "type": "U64", "value": 86400},
                  {"name": "attestor_bond", "type": "U512", "value": "250000000000"}])
    # raw cep78 filter (registry-backed, recipient-aware, fail-safe)
    if "filter_cep78" not in man:
        print(">> filter_cep78 (writ_registry_filter, raw)")
        res = wait(install(FILTER_RAW, 150000000000, [
            {"name": "registry_package", "type": "Key", "value": r["package"]},
            {"name": "asset_id", "type": "String", "value": ASSET}]), "filter_cep78")
        res["contract"] = raw_filter_contract(res["package"])
        man["filter_cep78"] = res; save(man)
    fcep = man["filter_cep78"]
    print(f"   filter_cep78 contract = {fcep['contract']}")
    # odra transfer-filter (for writ-token)
    ftok = step(man, "filter_token", f"{C}/transfer-filter/wasm/TransferFilter.wasm", 300000000000,
                odra_cfg("writ_filter_v3") + [
                    {"name": "registry", "type": "Key", "value": r["package"]},
                    {"name": "asset_id", "type": "String", "value": ASSET}])
    # cep78 -> writ_registry_filter contract
    cep = step(man, "cep78", f"{C}/writ-cep78/wasm/cep78.wasm", 650000000000, [
        {"name": "collection_name", "type": "String", "value": "writ-rwa-bond-v3"},
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
        {"name": "transfer_filter_contract", "type": "Key", "value": fcep["contract"]}])
    tok = step(man, "token", f"{C}/writ-token/wasm/WritToken.wasm", 250000000000,
               odra_cfg("writ_token_v3") + [{"name": "filter", "type": "Key", "value": ftok["package"]}])
    if "grant_challenge" not in man:
        print(">> grant_challenge(challenge contract)")
        man["grant_challenge"] = wait(call(r["package"], "grant_challenge",
            [{"name": "challenge", "type": "Key", "value": ch["package"]}], 5000000000), "grant_challenge"); save(man)
    if "grant_officer" not in man:
        print(">> grant_officer(multisig)")
        man["grant_officer"] = wait(call(r["package"], "grant_officer",
            [{"name": "officer", "type": "Key", "value": OFFICER}], 5000000000), "grant_officer"); save(man)
    save(man)
    print("\n=== V3 MANIFEST ===")
    for k in ["verifier","registry","challenge","filter_cep78","filter_token","cep78","token","grant_challenge","grant_officer"]:
        e = man.get(k, {}); print(f"{k:14s} pkg={e.get('package')} contract={e.get('contract')} tx={e.get('deploy')}")

if __name__ == "__main__":
    main()
