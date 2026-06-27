#!/usr/bin/env python3
"""Drive the gated-transfer lifecycle against the freshly-deployed canonical set
(reads manifest_live.json). Reuses the proven topology:
  F  = funded/deployer (sender, attested Active)
  E  = eligible recipient (attested Active)
  E2 = eligible recipient (attested Active)
  I  = ineligible (NEVER attested -> not Active -> DENY)
Captures every tx hash + PROCEED/DENY per demo beat. DENY surfaces as the filter
rejection 'User error: 159'.
"""
import json, re, subprocess, time, sys

NODE = "https://node.testnet.casper.network/rpc"
CHAIN = "casper-test"
KEY = "/tmp/writ-keys/funded_secret_key.pem"
MAN = json.load(open("/tmp/writ-keys/manifest_live.json"))
REG = MAN["registry"]["package"]      # hash-<pkg>
CEP = MAN["cep78"]["package"]
ASSET = "writ-bond-001"
META = '{"name":"Writ Bond","symbol":"WRIT","token_uri":"https://writ.example/b"}'

F  = "account-hash-f4a01d6b72731c6885e3b4ccdd535a5927b7dec344ed9ebb2b3f705b291a433a"
E  = "account-hash-1a9375317deef1695b401da3859818ed1629993ed1eaad0ea58b4b29f8224c79"
E2 = "account-hash-bc39a4de00162d26d0e7aa431d07dc5517dd0a16b2d033d656ba5e880052ac08"
I  = "account-hash-0dab73fdcf8e876ee3b1853c4e158fb9e5dcc01fa2a4313dcb639c5a599e642d"

BEATS = []

def submit(pkg, entry, args, payment):
    out = subprocess.run(
        ["casper-client", "put-deploy", "--node-address", NODE, "--chain-name", CHAIN,
         "--secret-key", KEY, "--session-package-hash", pkg, "--session-entry-point", entry,
         "--session-args-json", json.dumps(args), "--payment-amount", str(payment)],
        capture_output=True, text=True)
    m = re.search(r'"deploy_hash":\s*"([a-f0-9]{64})"', out.stdout)
    if not m:
        print("SUBMIT FAIL", out.stdout[-400:], out.stderr[-400:]); sys.exit(1)
    return m.group(1)

def wait(dh, label, expect):
    for _ in range(60):
        r = subprocess.run(["casper-client", "get-deploy", "--node-address", NODE, dh],
                           capture_output=True, text=True)
        try: d = json.loads(r.stdout)
        except Exception: time.sleep(8); continue
        ei = d.get("result", {}).get("execution_info")
        if ei and ei.get("execution_result"):
            v2 = ei["execution_result"].get("Version2", {})
            err = v2.get("error_message")
            outcome = "DENY" if err else "PROCEED"
            ok = (outcome == expect)
            mark = "OK " if ok else "!! "
            print(f"  {mark}{label:34s} | {dh} | consumed={v2.get('consumed')} | {outcome} (want {expect}) {'<'+err+'>' if err else ''}")
            BEATS.append({"beat": label, "deploy": dh, "outcome": outcome, "expect": expect,
                          "ok": ok, "consumed": v2.get("consumed"), "error": err})
            return ok
        time.sleep(8)
    print(f"  {label}: TIMEOUT {dh}"); BEATS.append({"beat": label, "deploy": dh, "outcome": "TIMEOUT"})
    return False

def attest(name):
    args = json.load(open(f"/tmp/writ-keys/attest_{name}.json"))
    dh = submit(REG, "attest", args, 80000000000)
    return wait(dh, f"attest_{name}", "PROCEED")

def mint(owner, label, expect):
    args = [{"name": "token_owner", "type": "Key", "value": owner},
            {"name": "token_meta_data", "type": "String", "value": META}]
    return wait(submit(CEP, "mint", args, 30000000000), label, expect)

def xfer(tid, src, tgt, label, expect):
    args = [{"name": "token_id", "type": "U64", "value": tid},
            {"name": "source_key", "type": "Key", "value": src},
            {"name": "target_key", "type": "Key", "value": tgt}]
    return wait(submit(CEP, "transfer", args, 30000000000), label, expect)

def revoke(holder, label):
    args = [{"name": "asset_id", "type": "String", "value": ASSET},
            {"name": "holder", "type": "Key", "value": holder}]
    return wait(submit(REG, "revoke", args, 12000000000), label, "PROCEED")

def assetop(entry, label):
    args = [{"name": "asset_id", "type": "String", "value": ASSET}]
    return wait(submit(REG, entry, args, 12000000000), label, "PROCEED")

def main():
    print(f"registry={REG}  cep78={CEP}")
    print("== attest holders ==")
    for n in ["F", "E", "E2"]:
        attest(n)
    print("== gated transfer matrix ==")
    mint(E, "onboard:mint_to_ELIGIBLE_E", "PROCEED")
    mint(I, "deny:mint_to_INELIGIBLE_I", "DENY")
    mint(F, "setup:mint_token1_to_F", "PROCEED")
    mint(F, "setup:mint_token2_to_F", "PROCEED")
    mint(F, "setup:mint_token3_to_F", "PROCEED")
    xfer(1, F, E,  "transfer_to_ELIGIBLE_E", "PROCEED")
    xfer(2, F, I,  "transfer_to_INELIGIBLE_I", "DENY")
    revoke(E, "revoke_recipient_E")
    xfer(2, F, E,  "transfer_to_REVOKED_recipient", "DENY")
    assetop("freeze_asset", "freeze_asset")
    xfer(2, F, E2, "transfer_while_ASSET_FROZEN", "DENY")
    assetop("unfreeze_asset", "unfreeze_asset")
    xfer(2, F, E2, "transfer_after_UNFREEZE", "PROCEED")
    revoke(F, "revoke_sender_F")
    xfer(3, F, E2, "transfer_from_REVOKED_sender", "DENY")
    json.dump(BEATS, open("/tmp/writ-keys/e2e_beats.json", "w"), indent=2)
    npass = sum(1 for b in BEATS if b.get("ok"))
    print(f"\n{npass}/{len(BEATS)} beats matched expectation")

if __name__ == "__main__":
    main()
