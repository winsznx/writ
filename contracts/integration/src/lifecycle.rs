//! The full Writ lifecycle as ONE chained integration test, wired against a
//! single registry instance, asserting token movement at each step against the
//! live registry the token reads through the filter.

use challenge::challenge::{Challenge, ChallengeHostRef, ChallengeInitArgs, Challenged, Resolved};
use credential_registry::registry::{
    canonical_message, CredentialAttested, CredentialRegistry, CredentialRegistryHostRef,
    CredentialRegistryInitArgs, CredentialRevoked, OfficerAction, Status,
};
use groth16_verifier::verifier::Groth16Verifier;
use odra::casper_types::bytesrepr::Bytes;
use odra::casper_types::{Key, PublicKey, U512};
use odra::host::{Deployer, HostEnv, HostRef, NoArgs};
use odra::prelude::Addressable;
use transfer_filter::filter::{TransferFilter, TransferFilterHostRef, TransferFilterInitArgs};
use writ_token::token::{WritToken, WritTokenHostRef, WritTokenInitArgs};

const ASSET: &str = "writ-bond-001";
const COOLDOWN: u64 = 100;
const FAR: u64 = 32_503_680_000;
const DEMO_BOND_CSPR: u64 = 250;
const CHALLENGER_BOND_CSPR: u64 = 250;
const REASON: [u8; 32] = [0xAB; 32];

// The proven verifier fixtures (the exact bytes the verifier embeds/checks).
const PROOF: &[u8] = include_bytes!("../../groth16-verifier/fixtures/proof.bin");
const INPUTS: &[u8] = include_bytes!("../../groth16-verifier/fixtures/inputs.bin");
const INPUTS_TAMPERED: &[u8] = include_bytes!("../../groth16-verifier/fixtures/inputs_tampered.bin");

fn cspr(n: u64) -> U512 {
    U512::from(n) * U512::from(1_000_000_000u64)
}
fn first32(b: &[u8]) -> [u8; 32] {
    let mut a = [0u8; 32];
    a.copy_from_slice(&b[0..32]);
    a
}
fn second32(b: &[u8]) -> [u8; 32] {
    let mut a = [0u8; 32];
    a.copy_from_slice(&b[32..64]);
    a
}
fn dummy_inputs(null: [u8; 32], commit: [u8; 32]) -> Vec<u8> {
    let mut v = Vec::with_capacity(192);
    v.extend_from_slice(&null);
    v.extend_from_slice(&commit);
    v.extend_from_slice(&[0u8; 128]);
    v
}
fn pk(env: &HostEnv, i: usize) -> PublicKey {
    env.public_key(&env.get_account(i))
}
fn key_of(env: &HostEnv, i: usize) -> Key {
    Key::Account(pk(env, i).to_account_hash())
}

struct World {
    env: HostEnv,
    registry: CredentialRegistryHostRef,
    challenge: ChallengeHostRef,
    #[allow(dead_code)]
    filter: TransferFilterHostRef,
    token: WritTokenHostRef,
}

/// Install the canonical set against ONE registry and wire them — the exact
/// sequence scripts/deploy/wire_writ.sh runs on testnet (grant_challenge,
/// grant_officer, filter -> registry+asset, bond the 2-of-3 attestors).
fn setup() -> World {
    let env = odra_test::env();
    env.set_caller(env.get_account(0));

    let verifier = Groth16Verifier::deploy(&env, NoArgs);
    let mut registry = CredentialRegistry::deploy(
        &env,
        CredentialRegistryInitArgs {
            quorum_keys: vec![pk(&env, 0), pk(&env, 1), pk(&env, 2)],
            threshold: 2,
            window_secs: 0, // registry-v3 setting: Attested is immediately live
            officer: key_of(&env, 3),
        },
    );
    let mut challenge = Challenge::deploy(
        &env,
        ChallengeInitArgs {
            registry: registry.address(),
            verifier: verifier.address(),
            treasury: env.get_account(8),
            cooldown_secs: COOLDOWN,
            attestor_bond: cspr(DEMO_BOND_CSPR),
        },
    );
    let filter = TransferFilter::deploy(
        &env,
        TransferFilterInitArgs {
            registry: registry.address(),
            asset_id: ASSET.to_string(),
        },
    );
    let token = WritToken::deploy(
        &env,
        WritTokenInitArgs {
            filter: filter.address(),
        },
    );

    // wire roles
    env.set_caller(env.get_account(0));
    registry.grant_challenge(challenge.address());
    registry.grant_officer(key_of(&env, 3)); // the multisig account (also set at init)

    // bond the 2-of-3 attestors with the demo bond
    for i in 0..3 {
        env.set_caller(env.get_account(i));
        challenge
            .with_tokens(cspr(DEMO_BOND_CSPR))
            .bond(pk(&env, i));
    }

    World {
        env,
        registry,
        challenge,
        filter,
        token,
    }
}

/// 2-of-3 attest of `holder` with the given published proof/public-inputs.
#[allow(clippy::too_many_arguments)]
fn attest(
    w: &mut World,
    holder: Key,
    expiry: u64,
    proof: &[u8],
    inputs: &[u8],
    commit: [u8; 32],
    null: [u8; 32],
) {
    w.env.set_caller(w.env.get_account(0));
    let msg = canonical_message(ASSET, &holder, &commit, &null, expiry);
    let signers = vec![pk(&w.env, 0), pk(&w.env, 1)];
    let sigs = vec![
        w.env.sign_message(&msg, &w.env.get_account(0)),
        w.env.sign_message(&msg, &w.env.get_account(1)),
    ];
    w.registry.attest(
        ASSET.into(),
        holder,
        commit,
        null,
        expiry,
        Bytes::from(proof.to_vec()),
        Bytes::from(inputs.to_vec()),
        signers,
        sigs,
    );
}

/// Token movement assertion (PROCEEDS): mint a fresh `id` to holder `h_idx`, then
/// the holder transfers it to `to`; the gate must permit it and the asset moves.
fn transfer_proceeds(w: &mut World, h_idx: usize, id: u64, to: Key) {
    w.env.set_caller(w.env.get_account(0));
    w.token.mint(key_of(&w.env, h_idx), id);
    w.env.set_caller(w.env.get_account(h_idx));
    w.token.transfer(id, to);
    assert_eq!(w.token.owner_of(id), Some(to), "transfer should PROCEED");
}

/// Token movement assertion (DENIED): mint a fresh `id` to holder `h_idx`, the
/// holder attempts to transfer it; the gate denies and the asset does NOT move.
fn transfer_denied(w: &mut World, h_idx: usize, id: u64, to: Key) {
    let owner = key_of(&w.env, h_idx);
    w.env.set_caller(w.env.get_account(0));
    w.token.mint(owner, id);
    w.env.set_caller(w.env.get_account(h_idx));
    assert!(
        w.token.try_transfer(id, to).is_err(),
        "transfer should be DENIED"
    );
    assert_eq!(w.token.owner_of(id), Some(owner), "asset must not move");
}

#[test]
fn full_lifecycle() {
    let mut w = setup();
    let h = key_of(&w.env, 7); // main holder (real proof)
    let f = key_of(&w.env, 4); // fraud holder (proof valid for different inputs)
    let r = key_of(&w.env, 6); // eligible recipient (far-future)
    let x = key_of(&w.env, 5); // never-onboarded recipient
    let (n_real, c_real) = (first32(INPUTS), second32(INPUTS));
    let (n_tamp, c_tamp) = (first32(INPUTS_TAMPERED), second32(INPUTS_TAMPERED));

    // eligible recipient R (dummy proof — R is never challenged)
    attest(
        &mut w,
        r,
        FAR,
        PROOF,
        &dummy_inputs([0x99; 32], [1u8; 32]),
        [1u8; 32],
        [0x99; 32],
    );
    assert!(w.registry.is_active(ASSET.into(), r));

    // 1. ONBOARD: 2-of-3 attest (real proof) -> Active
    attest(&mut w, h, FAR, PROOF, INPUTS, c_real, n_real);
    assert!(w.registry.is_active(ASSET.into(), h));

    // 2. GATED TRANSFER: eligible holder PROCEEDS; ineligible recipient DENIED
    transfer_proceeds(&mut w, 7, 1, r);
    transfer_denied(&mut w, 7, 2, x);

    // 3. AUTONOMOUS REVOKE: OFAC hit -> Revoked -> transfer DENIED
    w.env.set_caller(w.env.get_account(0)); // agent (quorum)
    w.registry.revoke(ASSET.into(), h);
    assert!(!w.registry.is_active(ASSET.into(), h));
    transfer_denied(&mut w, 7, 3, r);

    // 4. REFRESH: re-screened clean -> same-slot re-attest -> Active -> PROCEEDS
    attest(&mut w, h, FAR + 1000, PROOF, INPUTS, c_real, n_real);
    assert!(w.registry.is_active(ASSET.into(), h));
    transfer_proceeds(&mut w, 7, 4, r);

    // 5. FRAUD: onboard F (proof fails its own stored inputs) -> challenge ->
    //    resolve FALSE -> RevokedFraud + slash -> F's transfer DENIED
    attest(&mut w, f, FAR, PROOF, INPUTS_TAMPERED, c_tamp, n_tamp);
    assert!(w.registry.is_active(ASSET.into(), f));
    w.env.set_caller(w.env.get_account(9)); // challenger
    w.challenge
        .with_tokens(cspr(CHALLENGER_BOND_CSPR))
        .challenge(ASSET.into(), f);
    w.env.set_caller(w.env.get_account(9));
    w.challenge.resolve(ASSET.into(), f);
    assert_eq!(
        w.registry.get_credential(ASSET.into(), f).unwrap().status,
        Status::RevokedFraud
    );
    transfer_denied(&mut w, 4, 5, r);

    // 6. FRIVOLOUS: challenge H (valid) -> resolve TRUE -> unfreeze -> Active -> PROCEEDS
    w.env.set_caller(w.env.get_account(9));
    w.challenge
        .with_tokens(cspr(CHALLENGER_BOND_CSPR))
        .challenge(ASSET.into(), h);
    assert!(!w.registry.is_active(ASSET.into(), h)); // frozen during dispute
    w.env.set_caller(w.env.get_account(9));
    w.challenge.resolve(ASSET.into(), h);
    assert!(w.registry.is_active(ASSET.into(), h));
    transfer_proceeds(&mut w, 7, 6, r);

    // 7. OFFICER OVERRIDES on H
    w.env.set_caller(w.env.get_account(3)); // officer (multisig account)
    let officer_ts = w.env.block_time_secs();
    w.registry.officer_revoke(ASSET.into(), h, REASON);
    // attribution: the officer action records the multisig account hash + reason_hash
    assert!(
        w.env.emitted_event(
            &w.registry,
            OfficerAction {
                action: "officer_revoke".to_string(),
                asset_id: ASSET.to_string(),
                holder: h.to_formatted_string(),
                officer: w.env.get_account(3),
                ts: officer_ts,
                reason_hash: REASON,
            }
        ),
        "OfficerAction(revoke) with multisig officer + reason_hash"
    );
    transfer_denied(&mut w, 7, 7, r);
    w.env.set_caller(w.env.get_account(3));
    w.registry.officer_reinstate(ASSET.into(), h, REASON);
    transfer_proceeds(&mut w, 7, 8, r);
    w.env.set_caller(w.env.get_account(3));
    w.registry.officer_freeze(ASSET.into(), h, REASON);
    transfer_denied(&mut w, 7, 9, r);
    w.env.set_caller(w.env.get_account(3));
    w.registry.officer_unfreeze(ASSET.into(), h, REASON);
    transfer_proceeds(&mut w, 7, 10, r);

    // 8. BOUNDARIES
    // officer_reinstate on a RevokedFraud credential REJECTED
    w.env.set_caller(w.env.get_account(3));
    assert!(w
        .registry
        .try_officer_reinstate(ASSET.into(), f, REASON)
        .is_err());
    // officer_unfreeze on a challenge-frozen credential REJECTED
    w.env.set_caller(w.env.get_account(9));
    w.challenge
        .with_tokens(cspr(CHALLENGER_BOND_CSPR))
        .challenge(ASSET.into(), h); // challenge-freeze H
    w.env.set_caller(w.env.get_account(3));
    assert!(w
        .registry
        .try_officer_unfreeze(ASSET.into(), h, REASON)
        .is_err());

    // ATTRIBUTION TRAIL (ACTION 3): the regulator-facing per-credential history is
    // complete + correct across the whole chain (asserted end-to-end, not just unit).
    // attest + same-slot refresh (H):
    assert!(
        w.env.emitted_event(
            &w.registry,
            CredentialAttested {
                asset_id: ASSET.to_string(),
                holder: h.to_formatted_string(),
                commitment: c_real,
                nullifier: n_real,
                expiry: FAR,
                refresh: false,
            }
        ),
        "trail: onboard attested"
    );
    assert!(
        w.env.emitted_event(
            &w.registry,
            CredentialAttested {
                asset_id: ASSET.to_string(),
                holder: h.to_formatted_string(),
                commitment: c_real,
                nullifier: n_real,
                expiry: FAR + 1000,
                refresh: true,
            }
        ),
        "trail: refresh attested"
    );
    // the RevokedFraud-vs-sanctions-Revoked distinction in the trail:
    assert!(
        w.env.emitted_event(
            &w.registry,
            CredentialRevoked {
                asset_id: ASSET.to_string(),
                holder: h.to_formatted_string(),
                fraud: false,
            }
        ),
        "trail: sanctions Revoked (reinstatable)"
    );
    assert!(
        w.env.emitted_event(
            &w.registry,
            CredentialRevoked {
                asset_id: ASSET.to_string(),
                holder: f.to_formatted_string(),
                fraud: true,
            }
        ),
        "trail: RevokedFraud (terminal, distinct)"
    );
    // challenge + resolve (fraud F, frivolous H):
    assert!(
        w.env.emitted_event(
            &w.challenge,
            Challenged {
                asset_id: ASSET.to_string(),
                holder: f.to_formatted_string(),
                challenger: w.env.get_account(9),
            }
        ),
        "trail: challenge opened"
    );
    assert!(
        w.env.emitted_event(
            &w.challenge,
            Resolved {
                asset_id: ASSET.to_string(),
                holder: f.to_formatted_string(),
                fraud: true,
            }
        ),
        "trail: fraud resolution"
    );
    assert!(
        w.env.emitted_event(
            &w.challenge,
            Resolved {
                asset_id: ASSET.to_string(),
                holder: h.to_formatted_string(),
                fraud: false,
            }
        ),
        "trail: frivolous resolution"
    );

    println!("GAS_REPORT[integration]:\n{}", w.env.gas_report());
}
