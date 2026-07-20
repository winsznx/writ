#!/usr/bin/env python3
"""PHASE A acceptance: the CEP-78 NFT gated transfer/mint matrix, LIVE on the fresh
registry through the registry-backed filter. Each case = a real NFT op; DENY = the
op REVERTS (filter 159 or a propagated registry revert = fail-safe). Interleaves
registry state changes on the sender F to drive sender states.
"""
import json, re, subprocess, sys, time
import pathlib
REPO_ROOT = str(pathlib.Path(__file__).resolve().parents[2])

NODE = "https://node.testnet.casper.network/rpc"; CHAIN = "casper-test"
KEY = "/tmp/writ-keys/funded_secret_key.pem"
MAN = json.load(open("/tmp/writ-keys/manifest_live.json"))
REG = MAN["registry"]["package"]
CEP = MAN["cep78_v2"]["package"]
ASSET = "writ-bond-001"
META = '{"name":"Writ Bond","symbol":"WRIT","token_uri":"https://writ.example/b"}'
F  = "account-hash-f4a01d6b72731c6885e3b4ccdd535a5927b7dec344ed9ebb2b3f705b291a433a"
R  = "account-hash-85d28e05f316f6468b1e96e319df620a0c2270bde6f876144ec441145002697b"
I  = "account-hash-0dab73fdcf8e876ee3b1853c4e158fb9e5dcc01fa2a4313dcb639c5a599e642d"
RH = "6f66666963657264656d6f0000000000000000000000000000000000000000aa"
BEATS = []

def submit(pkg, ep, args, pay):
    out = subprocess.run(["casper-client","put-deploy","--node-address",NODE,"--chain-name",CHAIN,
        "--secret-key",KEY,"--session-package-hash",pkg,"--session-entry-point",ep,
        "--session-args-json",json.dumps(args),"--payment-amount",str(pay)], capture_output=True, text=True)
    m = re.search(r'"deploy_hash":\s*"([a-f0-9]{64})"', out.stdout)
    if not m: print("SUBMIT FAIL", out.stdout[-300:], out.stderr[-300:]); sys.exit(1)
    return m.group(1)

def wait(dh, label, expect):
    for _ in range(60):
        r = subprocess.run(["casper-client","get-deploy","--node-address",NODE,dh], capture_output=True, text=True)
        try: d = json.loads(r.stdout)
        except Exception: time.sleep(8); continue
        ei = d.get("result", {}).get("execution_info")
        if ei and ei.get("execution_result"):
            v2 = ei["execution_result"]["Version2"]; err = v2.get("error_message")
            outcome = "DENY" if err else "PROCEED"
            ok = (outcome == expect)
            print(f"  {'OK ' if ok else '!! '}{label:36s}| {dh} | {outcome:7s}(want {expect}) {('<'+err+'>') if err else ''}")
            BEATS.append({"beat":label,"deploy":dh,"outcome":outcome,"expect":expect,"ok":ok,"error":err,"consumed":v2.get("consumed")})
            return ok
        time.sleep(8)
    print(f"  {label} TIMEOUT {dh}"); BEATS.append({"beat":label,"deploy":dh,"outcome":"TIMEOUT"}); return False

def mint(owner, label, expect):
    a=[{"name":"token_owner","type":"Key","value":owner},{"name":"token_meta_data","type":"String","value":META}]
    return wait(submit(CEP,"mint",a,30000000000), label, expect)
def xfer(tid, src, tgt, label, expect):
    a=[{"name":"token_id","type":"U64","value":tid},{"name":"source_key","type":"Key","value":src},{"name":"target_key","type":"Key","value":tgt}]
    return wait(submit(CEP,"transfer",a,30000000000), label, expect)
def reg_call(ep, args, label):
    return wait(submit(REG, ep, args, 12000000000), label, "PROCEED")
def revoke(h,label): return reg_call("revoke",[{"name":"asset_id","type":"String","value":ASSET},{"name":"holder","type":"Key","value":h}],label)
def officer(ep,h,label): return reg_call(ep,[{"name":"asset_id","type":"String","value":ASSET},{"name":"holder","type":"Key","value":h},{"name":"reason_hash","type":{"ByteArray":32},"value":RH}],label)
def reattest_F():
    print("  (re-attest F -> Active)")
    subprocess.run(["python3",f"{REPO_ROOT}/scripts/deploy/attest_holder.py",
        "f4a01d6b72731c6885e3b4ccdd535a5927b7dec344ed9ebb2b3f705b291a433a",f"{REPO_ROOT}/circuits/build/fixtures_F"], check=True)

def main():
    print(f"cep78_v2={CEP}  filter={MAN['cep78_v2']['filter']}")
    print("== MINT gate ==")
    mint(F, "mint_to_ELIGIBLE_F(owner)", "PROCEED")
    mint(I, "mint_to_INELIGIBLE_I", "DENY")
    mint(F, "setup_mint_token1_to_F", "PROCEED")
    mint(F, "setup_mint_token2_to_F", "PROCEED")
    print("== TRANSFER gate (F=sender) ==")
    xfer(0, F, R, "transfer_to_ELIGIBLE_R", "PROCEED")
    xfer(1, F, I, "transfer_to_INELIGIBLE_recipient", "DENY")
    revoke(F, "revoke_F(sanctions)")
    xfer(1, F, R, "transfer_from_SANCTIONED_sender_KICKER", "DENY")
    reattest_F()
    xfer(1, F, R, "transfer_after_REFRESH", "PROCEED")
    officer("officer_freeze", F, "officer_freeze_F")
    xfer(2, F, R, "transfer_from_OFFICER_FROZEN_sender", "DENY")
    officer("officer_unfreeze", F, "officer_unfreeze_F")
    xfer(2, F, R, "transfer_after_UNFREEZE", "PROCEED")
    json.dump(BEATS, open("/tmp/writ-keys/matrix_beats.json","w"), indent=2)
    npass = sum(1 for b in BEATS if b.get("ok"))
    print(f"\n{npass}/{len(BEATS)} NFT gate cases matched expectation")

if __name__ == "__main__":
    main()
