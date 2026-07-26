#!/usr/bin/env python3
"""V5 live demo matrix — the CEP-78 gated mint/transfer beats against the fresh
canonical set, plus the fraud-challenge cycle.

Beats captured (each a real testnet deploy hash):
  1. mint to eligible F                          -> PROCEED
  2. mint to ineligible I                        -> DENY   (filter error 159)
  3. transfer F -> eligible E                    -> PROCEED
  4. transfer F -> ineligible I                  -> DENY   (recipient-aware gate)
  5. officer_revoke F (sanctions)                -> PROCEED
  6. transfer F -> E from revoked sender         -> DENY   (the "kicker")
  7. challenge X (fraud fixture: donor proof)    -> PROCEED (payable, 250 CSPR)
  8. resolve X -> on-chain Groth16 FALSE -> slash-> PROCEED
  9. transfer F -> X (RevokedFraud recipient)    -> DENY

usage: matrix_v5.py [beats]     (default: all; e.g. `matrix_v5.py 1 2 3 4`)
"""
import json, re, subprocess, sys, time, os, pathlib

REPO_ROOT = str(pathlib.Path(__file__).resolve().parents[2])
NODE = os.environ.get("CASPER_NODE", "https://node.testnet.casper.network/rpc")
CHAIN = "casper-test"
KEY = os.environ.get("DEPLOY_KEY", f"{REPO_ROOT}/internal/v4-keys/q1/secret_key.pem")
MAN = json.load(open(f"{REPO_ROOT}/internal/v5-keys/manifest_v5.json"))
HOLDERS = json.load(open(f"{REPO_ROOT}/internal/v5-keys/holders_v5.json"))["holders"]
OUT_PATH = f"{REPO_ROOT}/internal/v5-keys/matrix_v5.json"
REG = MAN["registry"]["package"]
CEP = MAN["cep78"]["package"]
CHALLENGE = MAN["challenge"]["package"]
ASSET = "writ-bond-001"
META = '{"name":"Writ RWA Bond","symbol":"WRIT","token_uri":"https://writ.finance/bond/1"}'

F = "account-hash-" + HOLDERS["F"]["account"]
E = "account-hash-" + HOLDERS["E"]["account"]
X = "account-hash-" + HOLDERS["X"]["account"]
# Never attested -> not Active -> the registry's default-deny path.
I = "account-hash-00000000000000000000000000000000000000000000000000000000deadbeef"

results = json.load(open(OUT_PATH)) if os.path.exists(OUT_PATH) else {}


def submit(pkg, entry, args, payment, key=KEY):
    out = subprocess.run(
        ["casper-client", "put-deploy", "--node-address", NODE, "--chain-name", CHAIN,
         "--secret-key", key, "--session-package-hash", pkg, "--session-entry-point", entry,
         "--payment-amount", str(payment), "--session-args-json", json.dumps(args)],
        capture_output=True, text=True)
    m = re.search(r'"deploy_hash":\s*"([a-f0-9]{64})"', out.stdout)
    if not m:
        print("SUBMIT FAIL", out.stdout[-400:], out.stderr[-300:]); sys.exit(1)
    return m.group(1)


def wait(dh, label, expect):
    for _ in range(40):
        r = subprocess.run(["casper-client", "get-deploy", "--node-address", NODE, dh],
                           capture_output=True, text=True)
        try:
            d = json.loads(r.stdout)
        except Exception:
            time.sleep(7); continue
        ei = d.get("result", {}).get("execution_info")
        if ei and ei.get("execution_result"):
            v2 = ei["execution_result"]["Version2"]
            err = v2.get("error_message")
            got = "DENY" if err else "PROCEED"
            ok = "OK " if got == expect else "MISMATCH"
            print(f"  [{ok}] {label:42s} {got:8s} {dh}  {err or ''}")
            results[label] = {"deploy": dh, "outcome": got, "expected": expect,
                              "error": err, "consumed": v2.get("consumed")}
            json.dump(results, open(OUT_PATH, "w"), indent=2)
            return got == expect
        time.sleep(7)
    print("TIMEOUT", label); return False


def mint(owner, label, expect):
    args = [{"name": "token_owner", "type": "Key", "value": owner},
            {"name": "token_meta_data", "type": "String", "value": META}]
    return wait(submit(CEP, "mint", args, 30000000000), label, expect)


# CEP-78 requires the token OWNER (or an approved operator) to sign the transfer,
# so every transfer beat is signed with the sending holder's own key.
HOLDER_KEYS = {
    "account-hash-" + HOLDERS[h]["account"]: f"{REPO_ROOT}/internal/v5-keys/holders/{h}/secret_key.pem"
    for h in HOLDERS
}


def xfer(tid, src, tgt, label, expect):
    args = [{"name": "token_id", "type": "U64", "value": tid},
            {"name": "source_key", "type": "Key", "value": src},
            {"name": "target_key", "type": "Key", "value": tgt}]
    return wait(submit(CEP, "transfer", args, 30000000000, key=HOLDER_KEYS.get(src, KEY)), label, expect)


BEATS = sys.argv[1:] or [str(i) for i in range(1, 10)]
run = lambda n: str(n) in BEATS

if run(1): mint(F, "1_mint_to_ELIGIBLE_F", "PROCEED")
if run(2): mint(I, "2_mint_to_INELIGIBLE_I", "DENY")
if run(3): xfer(0, F, E, "3_transfer_F_to_ELIGIBLE_E", "PROCEED")
if run(4):
    mint(F, "4a_setup_mint_token1_to_F", "PROCEED")
    xfer(1, F, I, "4_transfer_to_INELIGIBLE_recipient", "DENY")
if run(5):
    # reason_hash: the on-chain attribution field (sha256 of the officer's reason).
    args = [{"name": "asset_id", "type": "String", "value": ASSET},
            {"name": "holder", "type": "Key", "value": F},
            {"name": "reason_hash", "type": {"ByteArray": 32},
             "value": "cdb5447451148fa42c1596e5e998a1f30bdd8a472b0d50b4d75bf4f71a8680a5"}]
    wait(submit(REG, "officer_revoke", args, 12000000000), "5_officer_revoke_F_sanctions", "PROCEED")
if run(6): xfer(1, F, E, "6_KICKER_transfer_from_REVOKED_sender", "DENY")
if run(61):
    # The kicker, staged on E (holder of tokens 0/1 after beat 3): a live transfer
    # first PROCEEDS, then the same route DENIES once E is sanctions-revoked.
    R = "account-hash-" + HOLDERS["R"]["account"]
    xfer(0, E, R, "61_transfer_E_to_R_before_sanctions", "PROCEED")
    args = [{"name": "asset_id", "type": "String", "value": ASSET},
            {"name": "holder", "type": "Key", "value": E},
            {"name": "reason_hash", "type": {"ByteArray": 32}, "value": "cdb5447451148fa42c1596e5e998a1f30bdd8a472b0d50b4d75bf4f71a8680a5"}]
    wait(submit(REG, "officer_revoke", args, 12000000000), "62_officer_revoke_E_sanctions", "PROCEED")
    xfer(1, E, R, "63_KICKER_transfer_from_SANCTIONED_sender", "DENY")

if run(7):
    print("  (beat 7: challenge is payable — run payable_via_cargo.py challenge)")
if run(8):
    args = [{"name": "asset_id", "type": "String", "value": ASSET},
            {"name": "holder", "type": "Key", "value": X}]
    wait(submit(CHALLENGE, "resolve", args, 100000000000), "8_resolve_FRAUD_groth16_false_slash", "PROCEED")
if run(9):
    # R (Active) holds token 0 after beat 61; X is RevokedFraud after the slash.
    R = "account-hash-" + HOLDERS["R"]["account"]
    xfer(0, R, X, "9_transfer_to_REVOKEDFRAUD_recipient", "DENY")

print("\n" + json.dumps(results, indent=2))
