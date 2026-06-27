// Selective disclosure — every path, asserted. Uses the REAL onboarded claims
// (circuits/build/input_eligible.json) and the REAL on-chain commitment
// (circuits/build/elig2_public.json[1] == the verifier fixture commitment).
const fs = require("fs");
const path = require("path");
const nacl = require("tweetnacl");
const D = require("./disclosure");

const CIRC = path.join(__dirname, "../../circuits/build");
const input = JSON.parse(fs.readFileSync(path.join(CIRC, "input_eligible.json")));
// public inputs order: [nullifier, commitment, issuerAx, issuerAy, assetId, allowedRoot]
const ONCHAIN_COMMITMENT = JSON.parse(fs.readFileSync(path.join(CIRC, "elig2_public.json")))[1];
const ASSET = "writ-bond-001";
const HOLDER = "account-hash-85d28e05f316f6468b1e96e319df620a0c2270bde6f876144ec441145002697b";

const claims = {
  accredited: input.accredited,
  jurisdictionCode: input.jurisdictionCode,
  sanctioned: input.sanctioned,
  identitySecret: input.identitySecret,
  salt: input.salt,
};
const realPkg = {
  asset_id: ASSET,
  holder: HOLDER,
  commitment: ONCHAIN_COMMITMENT,
  revealed: { ...claims },
};

let pass = 0,
  fail = 0;
function ok(name, cond) {
  if (cond) {
    pass++;
    console.log("  ok   -", name);
  } else {
    fail++;
    console.log("  FAIL -", name);
  }
}

async function main() {
  console.log("== STEP 1: verify primitive ==");
  ok("real disclosure -> true", await D.verifyDisclosure(realPkg, ONCHAIN_COMMITMENT));
  ok(
    "tampered accredited (1->0) -> false",
    !(await D.verifyDisclosure(
      { ...realPkg, revealed: { ...claims, accredited: "0" } },
      ONCHAIN_COMMITMENT
    ))
  );
  ok(
    "tampered jurisdiction (840->826) -> false",
    !(await D.verifyDisclosure(
      { ...realPkg, revealed: { ...claims, jurisdictionCode: "826" } },
      ONCHAIN_COMMITMENT
    ))
  );
  ok(
    "tampered salt -> false",
    !(await D.verifyDisclosure(
      { ...realPkg, revealed: { ...claims, salt: (BigInt(claims.salt) + 1n).toString() } },
      ONCHAIN_COMMITMENT
    ))
  );

  console.log("== STEP 2: holder-initiated disclosure ==");
  const built = D.buildDisclosure({ asset_id: ASSET, holder: HOLDER, commitment: ONCHAIN_COMMITMENT, claims });
  ok("buildDisclosure references the on-chain credential", built.asset_id === ASSET && built.commitment === ONCHAIN_COMMITMENT);
  ok("built package round-trips verify -> true", await D.verifyDisclosure(built, ONCHAIN_COMMITMENT));

  console.log("== STEP 3: holder-consented escrow (compelled) ==");
  const reg = D.regulatorKeypair();
  const preimage = { ...claims };
  const ciphertext = D.escrowEncrypt(preimage, reg.publicKey);
  const bindings = { asset_id: ASSET, holder: HOLDER, commitment: ONCHAIN_COMMITMENT };
  const recovered = D.compelledDisclose(ciphertext, reg.secretKey, bindings);
  ok("regulator decrypt equals preimage", JSON.stringify(recovered.revealed) === JSON.stringify(preimage));
  ok("compelled package verifies -> true", await D.verifyDisclosure(recovered, ONCHAIN_COMMITMENT));

  const wrong = nacl.box.keyPair();
  ok("wrong regulator key fails to decrypt -> null", D.compelledDisclose(ciphertext, wrong.secretKey, bindings) === null);

  // issuer-side store holds ONLY ciphertext — never plaintext
  const store = new D.DisclosureStore();
  store.putCiphertext(ASSET, HOLDER, ciphertext);
  const persisted = store.entries();
  const blob = JSON.stringify(persisted);
  ok("store holds the ciphertext", Buffer.compare(store.getCiphertext(ASSET, HOLDER), ciphertext) === 0);
  ok(
    "NO plaintext persisted (no claim/salt leaks into the store)",
    !blob.includes(claims.identitySecret) &&
      !blob.includes(claims.salt) &&
      !blob.toLowerCase().includes("accredited")
  );

  console.log("== STEP 4: regulator verdict ==");
  const attested = { event: "CredentialAttested", asset_id: ASSET, holder: HOLDER, refresh: false };

  const vActive = await D.assembleVerdict(
    { asset_id: ASSET, holder: HOLDER, commitment: ONCHAIN_COMMITMENT, status: "Active", history: [attested] },
    realPkg
  );
  ok("Active: claims_verified true + status Active + history present",
    vActive.claims_verified === true && vActive.current_status === "Active" && vActive.history.length >= 1);

  const vFraud = await D.assembleVerdict(
    {
      asset_id: ASSET, holder: HOLDER, commitment: ONCHAIN_COMMITMENT, status: "RevokedFraud",
      history: [attested, { event: "Challenged", challenger: "account-hash-aa" }, { event: "Resolved", fraud: true }, { event: "CredentialRevoked", fraud: true }],
    },
    realPkg
  );
  ok("RevokedFraud: status distinct from Revoked + Resolved{fraud:true} in history",
    vFraud.current_status === "RevokedFraud" &&
      vFraud.history.some((e) => e.event === "Resolved" && e.fraud === true));

  const vSanctions = await D.assembleVerdict(
    {
      asset_id: ASSET, holder: HOLDER, commitment: ONCHAIN_COMMITMENT, status: "Revoked",
      history: [attested, { event: "CredentialRevoked", fraud: false }],
    },
    realPkg
  );
  ok("sanctions Revoked: status distinct from RevokedFraud + OFAC revoke (fraud:false) in history",
    vSanctions.current_status === "Revoked" &&
      vSanctions.current_status !== vFraud.current_status &&
      vSanctions.history.some((e) => e.event === "CredentialRevoked" && e.fraud === false));

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
