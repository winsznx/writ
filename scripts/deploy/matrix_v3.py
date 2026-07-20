#!/usr/bin/env python3
"""Core gated NFT matrix on the V3 canonical instance (cep78 v3 -> writ_registry_filter
-> role-revocable registry). Sender F = deployer/key3 (the cep78 minter). Officer
beats are run separately (post multisig config). Tx + outcome per beat."""
import json, re, subprocess, sys, time
import pathlib
REPO_ROOT = str(pathlib.Path(__file__).resolve().parents[2])

NODE = "https://node.testnet.casper.network/rpc"; CHAIN = "casper-test"
KEY = "/tmp/writ-keys2/deployer_secret_key.pem"
M = json.load(open("/tmp/writ-keys2/manifest_v3.json"))
REG = M["registry"]["package"]; CEP = M["cep78"]["package"]
ASSET = "writ-bond-001"
META = '{"name":"Writ Bond","symbol":"WRIT","token_uri":"https://writ.example/b"}'
F = "account-hash-9711698476d5a4f529ad4c2bcc0232ba23d0725b029e482df69075d076b44b3b"  # key3 sender
R = "account-hash-85d28e05f316f6468b1e96e319df620a0c2270bde6f876144ec441145002697b"  # eligible
I = "account-hash-0dab73fdcf8e876ee3b1853c4e158fb9e5dcc01fa2a4313dcb639c5a599e642d"  # ineligible
BEATS = []

def submit(pkg, ep, args, pay):
    out = subprocess.run(["casper-client","put-deploy","--node-address",NODE,"--chain-name",CHAIN,
        "--secret-key",KEY,"--session-package-hash",pkg,"--session-entry-point",ep,
        "--session-args-json",json.dumps(args),"--payment-amount",str(pay)], capture_output=True, text=True)
    return re.search(r'"deploy_hash":\s*"([a-f0-9]{64})"', out.stdout).group(1)

def wait(dh, label, expect):
    for _ in range(60):
        r = subprocess.run(["casper-client","get-deploy","--node-address",NODE,dh], capture_output=True, text=True)
        try: d = json.loads(r.stdout)
        except Exception: time.sleep(8); continue
        ei = d.get("result", {}).get("execution_info")
        if ei and ei.get("execution_result"):
            v2 = ei["execution_result"]["Version2"]; err = v2.get("error_message")
            outcome = "DENY" if err else "PROCEED"; ok = (outcome == expect)
            print(f"  {'OK ' if ok else '!! '}{label:34s}| {dh} | {outcome:7s}(want {expect}) {('<'+err+'>') if err else ''}")
            BEATS.append({"beat":label,"deploy":dh,"outcome":outcome,"ok":ok,"error":err}); return ok
        time.sleep(8)
    print(f"  {label} TIMEOUT"); return False

def mint(o,l,e): return wait(submit(CEP,"mint",[{"name":"token_owner","type":"Key","value":o},{"name":"token_meta_data","type":"String","value":META}],30000000000),l,e)
def xfer(t,s,g,l,e): return wait(submit(CEP,"transfer",[{"name":"token_id","type":"U64","value":t},{"name":"source_key","type":"Key","value":s},{"name":"target_key","type":"Key","value":g}],30000000000),l,e)
def revoke(h,l): return wait(submit(REG,"revoke",[{"name":"asset_id","type":"String","value":ASSET},{"name":"holder","type":"Key","value":h}],12000000000),l,"PROCEED")
def reattest_F():
    print("  (re-attest F -> Active)")
    subprocess.run(["python3",f"{REPO_ROOT}/scripts/deploy/attest_v3.py","9711698476d5a4f529ad4c2bcc0232ba23d0725b029e482df69075d076b44b3b",f"{REPO_ROOT}/circuits/build/fixtures_F"],check=True)

def main():
    print(f"cep78_v3={CEP}")
    print("== MINT gate ==")
    mint(F,"mint_to_ELIGIBLE_F",  "PROCEED")
    mint(I,"mint_to_INELIGIBLE_I","DENY")
    mint(F,"setup_mint_token1_F", "PROCEED")
    mint(F,"setup_mint_token2_F", "PROCEED")
    print("== TRANSFER gate ==")
    xfer(0,F,R,"transfer_to_ELIGIBLE_R","PROCEED")
    xfer(1,F,I,"transfer_to_INELIGIBLE_recipient","DENY")
    revoke(F,"revoke_F(OFAC)")
    xfer(1,F,R,"transfer_from_SANCTIONED_sender_KICKER","DENY")
    reattest_F()
    xfer(1,F,R,"transfer_after_REFRESH","PROCEED")
    json.dump(BEATS, open("/tmp/writ-keys2/matrix_v3_beats.json","w"), indent=2)
    print(f"\n{sum(1 for b in BEATS if b.get('ok'))}/{len(BEATS)} beats matched")

if __name__ == "__main__":
    main()
