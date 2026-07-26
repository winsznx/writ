#!/usr/bin/env python3
"""V5 hardened redeploy — the full canonical set rebuilt from the hardened wasms.

Differences from V4:
  * groth16-verifier is DEPLOYED from the hardened wasm (checked deserialization)
    instead of reusing the v3 instance.
  * registry.set_canonical_inputs pins issuer Ax/Ay + allowed_root ON-CHAIN after
    install (attest then rejects wrong issuer / asset / root at admission).

Funding preflight: the deployer needs ~2,500 CSPR liquid (install payment caps are
covered upfront; unspent is refunded). The script refuses to start below
MIN_BALANCE so it cannot strand a half-deployed set.

Inputs (env-overridable):
  DEPLOY_KEY        deployer secret pem   (default internal/v4-keys/q1/secret_key.pem)
  ISSUER_PUB_FILE   issuer Ax/Ay decimals (default internal/issuer_pubkey.txt,
                    lines "issuerAx = <dec>" / "issuerAy = <dec>")
Manifest: internal/v5-keys/manifest_v5.json (created; re-run resumes from it).
"""
import json, re, subprocess, sys, time, os, pathlib

REPO_ROOT = str(pathlib.Path(__file__).resolve().parents[2])
NODE = os.environ.get("CASPER_NODE", "https://node.testnet.casper.network/rpc")
CHAIN = "casper-test"
KEY = os.environ.get("DEPLOY_KEY", f"{REPO_ROOT}/internal/v4-keys/q1/secret_key.pem")
C = f"{REPO_ROOT}/contracts"
ASSET = "writ-bond-001"
OFFICER = "account-hash-8580ff20c447444a38539c8ea92c9392e6240c0d4b8aee0264188ca09ebab6a4"
TREASURY = "account-hash-50f4e6e85014d95f48678abbdb27c89b78da7119ec1f857bee562f24c1058bf6"
FILTER_RAW = f"{C}/writ-cep78/fork/target/wasm32-unknown-unknown/release/writ_registry_filter.wasm"
MANIFEST = f"{REPO_ROOT}/internal/v5-keys/manifest_v5.json"
ISSUER_PUB_FILE = os.environ.get("ISSUER_PUB_FILE", f"{REPO_ROOT}/internal/issuer_pubkey.txt")
ALLOWED_ROOT_DEC = "19848524443592487087673442952670162607638248908752257044177040082176667047235"
MIN_BALANCE_CSPR = 2500

def q(n): return open(f"{REPO_ROOT}/internal/v4-keys/q{n}/public_key_hex").read().strip()

def issuer_pub():
    txt = open(ISSUER_PUB_FILE).read()
    ax = re.search(r"issuerAx\s*=\s*(\d+)", txt).group(1)
    ay = re.search(r"issuerAy\s*=\s*(\d+)", txt).group(1)
    return ax, ay

def le32_hex(decimal_str):
    v = int(decimal_str)
    return v.to_bytes(32, "little").hex()

def odra_cfg(k): return [
    {"name": "odra_cfg_package_hash_key_name", "type": "String", "value": k},
    {"name": "odra_cfg_allow_key_override", "type": "Bool", "value": True},
    {"name": "odra_cfg_is_upgradable", "type": "Bool", "value": False},
    {"name": "odra_cfg_is_upgrade", "type": "Bool", "value": False}]

def load(): return json.load(open(MANIFEST)) if os.path.exists(MANIFEST) else {}
def save(m):
    os.makedirs(os.path.dirname(MANIFEST), exist_ok=True)
    json.dump(m, open(MANIFEST, "w"), indent=2)

def deployer_account():
    out = subprocess.run(["casper-client", "account-address", "--public-key",
        KEY.replace("secret_key.pem", "public_key.pem")], capture_output=True, text=True).stdout.strip()
    return out

def balance_cspr(purse_id):
    out = subprocess.run(["casper-client", "query-balance", "--node-address", NODE,
        "--purse-identifier", purse_id], capture_output=True, text=True).stdout
    try: return int(json.loads(out)["result"]["balance"]) / 1e9
    except Exception: return 0.0

def srh():
    out = subprocess.run(["casper-client", "get-state-root-hash", "--node-address", NODE],
        capture_output=True, text=True).stdout
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
        "--payment-amount", str(payment), "--session-args-json", json.dumps(args)],
        capture_output=True, text=True)
    return re.search(r'"deploy_hash":\s*"([a-f0-9]{64})"', out.stdout).group(1)

def wait(dh, label):
    for _ in range(60):
        r = subprocess.run(["casper-client", "get-deploy", "--node-address", NODE, dh],
            capture_output=True, text=True)
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
    acct = deployer_account()
    bal = balance_cspr(acct)
    print(f"deployer {acct} balance {bal} CSPR")
    if bal < MIN_BALANCE_CSPR:
        print(f"ABORT: need >= {MIN_BALANCE_CSPR} CSPR liquid to redeploy the full set.")
        print("Fund the deployer via the testnet faucet, then re-run. Nothing was submitted.")
        sys.exit(2)

    man = load(); Q = [q(1), q(2), q(3)]
    v = step(man, "verifier", f"{C}/groth16-verifier/wasm/Groth16Verifier.wasm", 400000000000,
             odra_cfg("writ_verifier_v5"))
    r = step(man, "registry", f"{C}/credential-registry/wasm/CredentialRegistry.wasm", 500000000000,
             odra_cfg("writ_registry_v5") + [
                 {"name": "quorum_keys", "type": {"List": "PublicKey"}, "value": Q},
                 {"name": "threshold", "type": "U8", "value": 2},
                 {"name": "window_secs", "type": "U64", "value": 0},
                 {"name": "officer", "type": "Key", "value": OFFICER}])
    # pin canonical public inputs ON-CHAIN (the V5 hardening)
    if "canonical" not in man:
        ax, ay = issuer_pub()
        print(">> set_canonical_inputs")
        dh = call(r["package"], "set_canonical_inputs", [
            {"name": "issuer_ax", "type": {"ByteArray": 32}, "value": le32_hex(ax)},
            {"name": "issuer_ay", "type": {"ByteArray": 32}, "value": le32_hex(ay)},
            {"name": "allowed_root", "type": {"ByteArray": 32}, "value": le32_hex(ALLOWED_ROOT_DEC)}],
            8000000000)
        man["canonical"] = wait(dh, "set_canonical_inputs"); save(man)
    ch = step(man, "challenge", f"{C}/challenge/wasm/Challenge.wasm", 400000000000,
              odra_cfg("writ_challenge_v5") + [
                  {"name": "registry", "type": "Key", "value": r["package"]},
                  {"name": "verifier", "type": "Key", "value": v["package"]},
                  {"name": "treasury", "type": "Key", "value": TREASURY},
                  {"name": "cooldown_secs", "type": "U64", "value": 86400},
                  {"name": "attestor_bond", "type": "U512", "value": "250000000000"}])
    if "filter_cep78" not in man:
        print(">> filter_cep78 (writ_registry_filter, raw)")
        res = wait(install(FILTER_RAW, 150000000000, [
            {"name": "registry_package", "type": "Key", "value": r["package"]},
            {"name": "asset_id", "type": "String", "value": ASSET}]), "filter_cep78")
        res["contract"] = raw_filter_contract(res["package"])
        man["filter_cep78"] = res; save(man)
    fcep = man["filter_cep78"]
    print(f"   filter_cep78 contract = {fcep['contract']}")
    ftok = step(man, "filter_token", f"{C}/transfer-filter/wasm/TransferFilter.wasm", 300000000000,
                odra_cfg("writ_filter_v5") + [
                    {"name": "registry", "type": "Key", "value": r["package"]},
                    {"name": "asset_id", "type": "String", "value": ASSET}])
    cep = step(man, "cep78", f"{C}/writ-cep78/wasm/cep78.wasm", 650000000000, [
        {"name": "collection_name", "type": "String", "value": "writ-rwa-bond-v5"},
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
        {"name": "operator_burn_mode", "type": "Bool", "value": False},
        {"name": "events_mode", "type": "U8", "value": 2},
        {"name": "transfer_filter_contract", "type": "Key", "value": fcep["contract"]},
        {"name": "transfer_filter_method", "type": "String", "value": "can_transfer"}])
    tok = step(man, "token", f"{C}/writ-token/wasm/WritToken.wasm", 300000000000,
               odra_cfg("writ_token_v5") + [
                   {"name": "filter", "type": "Key", "value": ftok["package"]}])
    # wiring
    if "grant_challenge" not in man:
        man["grant_challenge"] = wait(call(r["package"], "grant_challenge",
            [{"name": "who", "type": "Key", "value": ch["contract"]}], 6000000000), "grant_challenge"); save(man)
    if "grant_officer" not in man:
        man["grant_officer"] = wait(call(r["package"], "grant_officer",
            [{"name": "who", "type": "Key", "value": OFFICER}], 6000000000), "grant_officer"); save(man)
    print("\nNEXT (manual, documented in DEPLOYMENT.md):")
    print("  1. bond the two attestors via payable_via_cargo.py (odra #[payable])")
    print("  2. attest holder R with a REAL proof (attest_real.py or the live app)")
    print("  3. regenerate the demo tx matrix (matrix_live.py) + fraud cycle")
    print("  4. update frontend/lib/chain.ts, README tables, verify_live.sh, Railway REGISTRY_PKG")
    print(json.dumps({k: {kk: vv for kk, vv in val.items() if kk in ("package", "contract")}
                      for k, val in man.items() if isinstance(val, dict)}, indent=2))

if __name__ == "__main__":
    main()
