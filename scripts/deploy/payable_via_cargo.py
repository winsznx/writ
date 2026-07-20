#!/usr/bin/env python3
"""Fund an odra #[payable] call on a node that forbids session main-purse spending
(enable_addressable_entity=false). Recipe: (1) a put-deploy session creates a cargo
purse [no spend]; (2) a NATIVE transfer funds it [native transfers may leave main];
(3) a put-deploy call passes cargo_purse so odra's handle_attached_value pulls it.
Only step 2 is put-transaction (the permitted exception, part of the payable call).

usage: payable_via_cargo.py <bond|challenge> <secret-key> <challenge-pkg> <amount-cspr> <attestor-hex|holder-acct> [asset]
"""
import json, re, subprocess, sys, time
import pathlib
REPO_ROOT = str(pathlib.Path(__file__).resolve().parents[2])

NODE = "https://node.testnet.casper.network/rpc"; CHAIN = "casper-test"
WASM = f"{REPO_ROOT}/contracts/writ-cep78/fork/target/wasm32-unknown-unknown/release/payable_caller.wasm"
mode, key, chalpkg, amt_cspr, party = sys.argv[1:6]
asset = sys.argv[6] if len(sys.argv) > 6 else "writ-bond-001"
chalpkg = chalpkg if chalpkg.startswith("hash-") else "hash-" + chalpkg
amt = int(amt_cspr) * 1_000_000_000

def pubkey_hex():
    return open(key.replace("secret_key.pem", "public_key_hex")).read().strip() if key.endswith("public_key_hex") else None

def sh(cmd):
    return subprocess.run(cmd, capture_output=True, text=True)

def acct():
    # derive account hash from the key via dry transfer header
    sh(["casper-client", "make-transfer", "--amount", "1000000000", "--target-account", "01"+"0"*64,
        "--transfer-id", "1", "--chain-name", CHAIN, "--payment-amount", "100000000",
        "--secret-key", key, "--output", "/tmp/kk.json", "--force"])
    pk = json.load(open("/tmp/kk.json"))["header"]["account"]
    return subprocess.run(["casper-client", "account-address", "--public-key", pk], capture_output=True, text=True).stdout.strip()

def wait_deploy(dh):
    for _ in range(45):
        r = sh(["casper-client", "get-deploy", "--node-address", NODE, dh])
        if "execution_result" in r.stdout:
            v = json.loads(r.stdout)["result"]["execution_info"]["execution_result"]["Version2"]
            return v.get("error_message")
        time.sleep(7)
    return "TIMEOUT"

def wait_txn(th):
    for _ in range(45):
        r = sh(["casper-client", "get-transaction", "--node-address", NODE, th])
        if "execution_result" in r.stdout:
            v = json.loads(r.stdout)["result"]["execution_info"]["execution_result"]["Version2"]
            return v.get("error_message")
        time.sleep(7)
    return "TIMEOUT"

# 1. mkpurse
out = sh(["casper-client", "put-deploy", "--node-address", NODE, "--chain-name", CHAIN, "--secret-key", key,
    "--session-path", WASM, "--payment-amount", "5000000000",
    "--session-arg", "cspr_amount:u512='0'", "--session-arg", f"challenge_pkg:key='{chalpkg}'",
    "--session-arg", "mode:string='mkpurse'"])
dh = re.search(r'[a-f0-9]{64}', out.stdout).group(0)
err = wait_deploy(dh)
if err: print("mkpurse FAIL", err); sys.exit(1)
print(f"  mkpurse {dh} OK")

# read cargo uref
a = acct()
srh = re.search(r'[a-f0-9]{64}', sh(["casper-client", "get-state-root-hash", "--node-address", NODE]).stdout).group(0)
gs = sh(["casper-client", "query-global-state", "--node-address", NODE, "--state-root-hash", srh, "--key", a]).stdout
# pick the writ_cargo_purse uref (not main_purse)
m = re.search(r'"writ_cargo_purse"[^}]*?"(uref-[a-f0-9]{64}-[0-9]{3})"', gs.replace("\n", " "))
uref = m.group(1)
print(f"  cargo uref {uref}")

# 2. native transfer -> cargo
out = sh(["casper-client", "put-transaction", "transfer", "--node-address", NODE, "--chain-name", CHAIN,
    "--secret-key", key, "--target", uref, "--transfer-amount", str(amt),
    "--pricing-mode", "classic", "--payment-amount", "3000000000", "--standard-payment", "true",
    "--gas-price-tolerance", "1"])
th = re.search(r'[a-f0-9]{64}', out.stdout).group(0)
err = wait_txn(th)
if err: print("native-fund FAIL", err); sys.exit(1)
print(f"  native-fund {th} OK ({amt_cspr} CSPR -> cargo)")

# 3. payable call
if mode == "bond":
    args = ["--session-arg", f"attestor:public_key='{party}'", "--session-arg", f"cargo_purse:uref='{uref}'"]
    ep = "bond"
else:  # challenge
    holder = party if party.startswith("account-hash-") else "account-hash-" + party
    args = ["--session-arg", f"asset_id:string='{asset}'", "--session-arg", f"holder:key='{holder}'",
            "--session-arg", f"cargo_purse:uref='{uref}'"]
    ep = "challenge"
out = sh(["casper-client", "put-deploy", "--node-address", NODE, "--chain-name", CHAIN, "--secret-key", key,
    "--session-package-hash", chalpkg, "--session-entry-point", ep, "--payment-amount", "40000000000"] + args)
dh = re.search(r'[a-f0-9]{64}', out.stdout).group(0)
err = wait_deploy(dh)
print(f"  {ep} {dh} {'OK' if not err else 'FAIL '+str(err)}")
sys.exit(1 if err else 0)
