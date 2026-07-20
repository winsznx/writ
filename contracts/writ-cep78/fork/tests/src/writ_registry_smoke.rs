// End-to-end test for the SHIPPING Writ compliance stack (audit finding M-5):
// patched CEP-78 -> writ_registry_filter (the production filter, raw wasm) -> the
// REAL Odra CredentialRegistry (prebuilt CredentialRegistry.wasm), all running on
// the Casper 2.0 execution engine.
//
// Proven here:
//   (1) mint to an eligible (Active-credential) recipient proceeds
//   (2) mint to an ineligible recipient reverts 159, no token created
//   (3) transfer to an eligible recipient proceeds
//   (4) transfer to an ineligible recipient reverts 159, token stays
//   (5) transfer FROM a revoked sender reverts 159, token stays
//   (6) expired credential (sender or recipient side) reverts 159 after the
//       block time passes expiry, token stays
//   (7) missing registry fails CLOSED: a filter bound to a nonexistent registry
//       package makes mint/can_transfer/transfer revert (never proceed)
//   (8) operator approval cannot bypass the gate: the filter check runs BEFORE
//       the owner/approved/operator auth check in the patched transfer()

use casper_engine_test_support::{ExecuteRequestBuilder, LmdbWasmTestBuilder, DEFAULT_ACCOUNT_ADDR};
use casper_types::{
    bytesrepr::{Bytes, ToBytes},
    crypto, runtime_args, AddressableEntityHash, Key, PackageHash, PublicKey, SecretKey,
};

use cep78::constants::{
    ARG_APPROVE_ALL, ARG_COLLECTION_NAME, ARG_OPERATOR, ARG_SOURCE_KEY, ARG_TARGET_KEY,
    ARG_TOKEN_ID, ARG_TOKEN_META_DATA, ARG_TOKEN_OWNER, ENTRY_POINT_REGISTER_OWNER,
    ENTRY_POINT_SET_APPROVALL_FOR_ALL, TOKEN_OWNERS,
};

use crate::utility::{
    constants::{
        ACCOUNT_1_ADDR, ACCOUNT_1_KEY, ACCOUNT_2_KEY, ACCOUNT_3_ADDR, ACCOUNT_3_KEY,
        ARG_NFT_CONTRACT_HASH, DEFAULT_ACCOUNT_KEY, MINT_SESSION_WASM, NFT_CONTRACT_WASM,
        NFT_TEST_COLLECTION, NFT_TEST_SYMBOL, TEST_PRETTY_721_META_DATA, TRANSFER_SESSION_WASM,
    },
    installer_request_builder::{InstallerRequestBuilder, MintingMode, OwnershipMode},
    support::{self, genesis, get_dictionary_value_from_key},
};

const REGISTRY_WASM: &str = "CredentialRegistry.wasm";
const REGISTRY_FILTER_WASM: &str = "writ_registry_filter.wasm";
// odra_cfg_package_hash_key_name -> the installer account named key holding the
// registry PACKAGE hash.
const REGISTRY_PKG_KEY_NAME: &str = "writ_registry_test";
// Named key the raw filter's call() puts on the installer account.
const FILTER_HASH_NAME: &str = "writ_registry_filter_contract_hash";

const ASSET: &str = "writ-bond-001";
const SECOND_COLLECTION: &str = "nft-test2";

// Registry expiry is in SECONDS (odra get_block_time_secs = block_time_millis / 1000).
// Genesis/default exec block time is 0 ms == 0 s.
const FAR_FUTURE_SECS: u64 = 32_503_680_000;
const SHORT_EXPIRY_SECS: u64 = 1_000;
const PAST_EXPIRY_MILLIS: u64 = 2_000_000; // 2000 s > SHORT_EXPIRY_SECS

fn quorum_secret_keys() -> Vec<SecretKey> {
    [[11u8; 32], [12u8; 32], [13u8; 32]]
        .iter()
        .map(|seed| SecretKey::ed25519_from_bytes(seed).expect("valid ed25519 seed"))
        .collect()
}

// Mirror of registry.rs::canonical_message:
// bytesrepr(asset_id) ++ bytesrepr(holder) ++ commitment[32] ++ nullifier[32] ++ bytesrepr(expiry)
fn canonical_message(
    asset_id: &str,
    holder: &Key,
    commitment: &[u8; 32],
    nullifier: &[u8; 32],
    expiry: u64,
) -> Vec<u8> {
    let mut msg: Vec<u8> = Vec::new();
    msg.extend_from_slice(&asset_id.to_string().to_bytes().unwrap());
    msg.extend_from_slice(&holder.to_bytes().unwrap());
    msg.extend_from_slice(commitment);
    msg.extend_from_slice(nullifier);
    msg.extend_from_slice(&expiry.to_bytes().unwrap());
    msg
}

fn get_registry_package(builder: &LmdbWasmTestBuilder) -> PackageHash {
    let key = builder
        .get_entity_with_named_keys_by_account_hash(*DEFAULT_ACCOUNT_ADDR)
        .unwrap()
        .named_keys()
        .get(REGISTRY_PKG_KEY_NAME)
        .expect("must have registry package named key")
        .to_owned();
    PackageHash::new(
        key.into_package_addr()
            .unwrap_or_else(|| panic!("unexpected registry package key variant: {key:?}")),
    )
}

fn get_account_named_entity_hash(builder: &LmdbWasmTestBuilder, name: &str) -> AddressableEntityHash {
    builder
        .get_entity_with_named_keys_by_account_hash(*DEFAULT_ACCOUNT_ADDR)
        .unwrap()
        .named_keys()
        .get(name)
        .unwrap_or_else(|| panic!("must have named key {name}"))
        .into_entity_hash()
        .expect("must get entity hash")
}

fn registry_call(
    builder: &mut LmdbWasmTestBuilder,
    registry_pkg: PackageHash,
    entry_point: &str,
    args: casper_types::RuntimeArgs,
) {
    let req = ExecuteRequestBuilder::versioned_contract_call_by_hash(
        *DEFAULT_ACCOUNT_ADDR,
        registry_pkg,
        None,
        entry_point,
        args,
    )
    .build();
    builder.exec(req).expect_success().commit();
}

// Quorum-signed attest through the EE with REAL ed25519 signatures over the
// canonical payload. Signatures are bytesrepr(Signature) = 01-tag + 64 raw bytes,
// exactly what the registry's env.verify_signature -> Signature::from_bytes expects.
fn attest(
    builder: &mut LmdbWasmTestBuilder,
    registry_pkg: PackageHash,
    quorum: &[SecretKey],
    holder: Key,
    commitment: [u8; 32],
    nullifier: [u8; 32],
    expiry: u64,
) {
    let msg = canonical_message(ASSET, &holder, &commitment, &nullifier, expiry);
    let mut signers: Vec<PublicKey> = Vec::new();
    let mut signatures: Vec<Bytes> = Vec::new();
    for sk in quorum.iter().take(2) {
        let pk = PublicKey::from(sk);
        let sig = crypto::sign(&msg, sk, &pk);
        signatures.push(Bytes::from(sig.to_bytes().unwrap()));
        signers.push(pk);
    }
    // public_inputs must be 192 bytes with [0..32]==nullifier, [32..64]==commitment
    // (the registry's binding check); the proof is stored, not verified, on attest.
    let mut public_inputs: Vec<u8> = Vec::with_capacity(192);
    public_inputs.extend_from_slice(&nullifier);
    public_inputs.extend_from_slice(&commitment);
    public_inputs.extend_from_slice(&[0u8; 128]);

    registry_call(
        builder,
        registry_pkg,
        "attest",
        runtime_args! {
            "asset_id" => ASSET.to_string(),
            "holder" => holder,
            "commitment" => commitment,
            "nullifier" => nullifier,
            "expiry" => expiry,
            "proof" => Bytes::from(vec![0u8; 256]),
            "public_inputs" => Bytes::from(public_inputs),
            "signers" => signers,
            "signatures" => signatures,
        },
    );
}

fn owner_of(builder: &LmdbWasmTestBuilder, nft_contract_key: &Key, token_id: u64) -> Key {
    get_dictionary_value_from_key::<Key>(builder, nft_contract_key, TOKEN_OWNERS, &token_id.to_string())
}

// Fallible owner read: None when the token was never minted (a denied mint must
// leave no ownership entry behind).
fn try_owner_of(builder: &LmdbWasmTestBuilder, nft_contract_key: &Key, token_id: u64) -> Option<Key> {
    let entity_hash = nft_contract_key.into_entity_hash()?;
    let entity = builder.get_entity_with_named_keys_by_entity_hash(entity_hash)?;
    let seed_uref = entity.named_keys().get(TOKEN_OWNERS)?.into_uref()?;
    builder
        .query_dictionary_item(None, seed_uref, &token_id.to_string())
        .ok()?
        .as_cl_value()?
        .to_owned()
        .into_t::<Key>()
        .ok()
}

fn mint_request(nft_contract_key: Key, owner: Key, collection: &str) -> ExecuteRequestBuilder {
    ExecuteRequestBuilder::standard(
        *DEFAULT_ACCOUNT_ADDR,
        MINT_SESSION_WASM,
        runtime_args! {
            ARG_NFT_CONTRACT_HASH => nft_contract_key,
            ARG_TOKEN_OWNER => owner,
            ARG_TOKEN_META_DATA => TEST_PRETTY_721_META_DATA.to_string(),
            ARG_COLLECTION_NAME => collection.to_string(),
        },
    )
}

fn transfer_request(
    sender: casper_types::account::AccountHash,
    nft_contract_key: Key,
    token_id: u64,
    source: Key,
    target: Key,
) -> ExecuteRequestBuilder {
    ExecuteRequestBuilder::standard(
        sender,
        TRANSFER_SESSION_WASM,
        runtime_args! {
            ARG_NFT_CONTRACT_HASH => nft_contract_key,
            ARG_TOKEN_ID => token_id,
            ARG_SOURCE_KEY => source,
            ARG_TARGET_KEY => target,
        },
    )
}

#[test]
fn writ_registry_filter_e2e() {
    let mut builder = genesis();
    let quorum = quorum_secret_keys();
    let quorum_pubkeys: Vec<PublicKey> = quorum.iter().map(PublicKey::from).collect();

    // ---------- install the REAL Odra CredentialRegistry ----------
    let registry_install = ExecuteRequestBuilder::standard(
        *DEFAULT_ACCOUNT_ADDR,
        REGISTRY_WASM,
        runtime_args! {
            "odra_cfg_package_hash_key_name" => REGISTRY_PKG_KEY_NAME.to_string(),
            "odra_cfg_allow_key_override" => true,
            "odra_cfg_is_upgradable" => false,
            "odra_cfg_is_upgrade" => false,
            "quorum_keys" => quorum_pubkeys.clone(),
            "threshold" => 2u8,
            "window_secs" => 0u64,
            "officer" => *DEFAULT_ACCOUNT_KEY,
        },
    )
    .build();
    builder.exec(registry_install).expect_success().commit();
    let registry_pkg = get_registry_package(&builder);
    println!("WRIT_REGISTRY_E2E registry installed, package = {registry_pkg:?}");

    // Deployer holds DEFAULT_ADMIN_ROLE + QUORUM_ROLE. Attest requires BONDED
    // signers; set_bonded needs CHALLENGE_ROLE -> grant it to the deployer.
    registry_call(
        &mut builder,
        registry_pkg,
        "grant_challenge",
        runtime_args! { "challenge" => *DEFAULT_ACCOUNT_KEY },
    );
    for pk in &quorum_pubkeys {
        registry_call(
            &mut builder,
            registry_pkg,
            "set_bonded",
            runtime_args! { "key" => pk.clone(), "bonded" => true },
        );
    }

    // Credentials (window_secs = 0 -> Attested is active immediately):
    //   DEFAULT   Active, far-future expiry (owner / minter)
    //   ACCOUNT_1 Active, far-future expiry (later REVOKED for case 5)
    //   ACCOUNT_3 Active, SHORT expiry (expiry cases)
    //   ACCOUNT_2 NO credential (the ineligible party)
    attest(&mut builder, registry_pkg, &quorum, *DEFAULT_ACCOUNT_KEY, [1u8; 32], [2u8; 32], FAR_FUTURE_SECS);
    attest(&mut builder, registry_pkg, &quorum, *ACCOUNT_1_KEY, [3u8; 32], [4u8; 32], FAR_FUTURE_SECS);
    attest(&mut builder, registry_pkg, &quorum, *ACCOUNT_3_KEY, [5u8; 32], [6u8; 32], SHORT_EXPIRY_SECS);
    println!("WRIT_REGISTRY_E2E attested: DEFAULT + ACCOUNT_1 (far future), ACCOUNT_3 (short expiry); ACCOUNT_2 has NO credential");

    // ---------- install the PRODUCTION filter bound to the real registry ----------
    let filter_install = ExecuteRequestBuilder::standard(
        *DEFAULT_ACCOUNT_ADDR,
        REGISTRY_FILTER_WASM,
        runtime_args! {
            "registry_package" => Key::Hash(registry_pkg.value()),
            "asset_id" => ASSET.to_string(),
        },
    )
    .build();
    builder.exec(filter_install).expect_success().commit();
    let filter_hash = get_account_named_entity_hash(&builder, FILTER_HASH_NAME);

    // ---------- install the PATCHED CEP-78, gated by the filter ----------
    let install = InstallerRequestBuilder::new(*DEFAULT_ACCOUNT_ADDR, NFT_CONTRACT_WASM)
        .with_collection_name(NFT_TEST_COLLECTION.to_string())
        .with_collection_symbol(NFT_TEST_SYMBOL.to_string())
        .with_total_token_supply(10u64)
        .with_ownership_mode(OwnershipMode::Transferable)
        .with_minting_mode(MintingMode::Installer)
        .with_transfer_filter_contract(Key::Hash(filter_hash.value()))
        .build();
    builder.exec(install).expect_success().commit();
    let nft_contract_hash = support::get_nft_contract_hash(&builder);
    let nft_contract_key: Key = support::get_nft_contract_hash_key(&builder);

    for receiver in [*ACCOUNT_1_KEY, *ACCOUNT_2_KEY, *ACCOUNT_3_KEY] {
        let reg = ExecuteRequestBuilder::contract_call_by_hash(
            *DEFAULT_ACCOUNT_ADDR,
            nft_contract_hash,
            ENTRY_POINT_REGISTER_OWNER,
            runtime_args! { ARG_TOKEN_OWNER => receiver },
        )
        .build();
        builder.exec(reg).expect_success().commit();
    }

    // ---------- (1) mint to ELIGIBLE recipient proceeds ----------
    for token_id in 0..4u64 {
        let mint = mint_request(nft_contract_key, *DEFAULT_ACCOUNT_KEY, NFT_TEST_COLLECTION).build();
        builder.exec(mint).expect_success().commit();
        assert_eq!(owner_of(&builder, &nft_contract_key, token_id), *DEFAULT_ACCOUNT_KEY);
    }
    println!("WRIT_REGISTRY_E2E (1) mint to ELIGIBLE recipient (DEFAULT, Active credential) PROCEEDED (tokens 0..3)");

    // ---------- (2) mint to INELIGIBLE recipient reverts 159 ----------
    let mint_denied = mint_request(nft_contract_key, *ACCOUNT_2_KEY, NFT_TEST_COLLECTION).build();
    builder.exec(mint_denied).expect_failure().commit();
    let err = builder.get_error().expect("must have error");
    support::assert_expected_error(err, 159u16, "mint to INELIGIBLE recipient -> 159");
    assert_eq!(try_owner_of(&builder, &nft_contract_key, 4), None, "denied mint must not create a token");
    println!("WRIT_REGISTRY_E2E (2) mint to INELIGIBLE recipient (ACCOUNT_2, no credential) REVERTED 159, no token created");

    // ---------- (3) transfer to ELIGIBLE recipient proceeds ----------
    let t = transfer_request(*DEFAULT_ACCOUNT_ADDR, nft_contract_key, 0, *DEFAULT_ACCOUNT_KEY, *ACCOUNT_1_KEY).build();
    builder.exec(t).expect_success().commit();
    assert_eq!(owner_of(&builder, &nft_contract_key, 0), *ACCOUNT_1_KEY);
    println!("WRIT_REGISTRY_E2E (3) transfer to ELIGIBLE recipient (ACCOUNT_1, Active) PROCEEDED (token 0)");

    // ---------- (4) transfer to INELIGIBLE recipient reverts 159 ----------
    let t = transfer_request(*DEFAULT_ACCOUNT_ADDR, nft_contract_key, 1, *DEFAULT_ACCOUNT_KEY, *ACCOUNT_2_KEY).build();
    builder.exec(t).expect_failure().commit();
    let err = builder.get_error().expect("must have error");
    support::assert_expected_error(err, 159u16, "transfer to INELIGIBLE recipient -> 159");
    assert_eq!(owner_of(&builder, &nft_contract_key, 1), *DEFAULT_ACCOUNT_KEY, "denied transfer must not move token");
    println!("WRIT_REGISTRY_E2E (4) transfer to INELIGIBLE recipient (ACCOUNT_2) REVERTED 159, token 1 stayed");

    // ---------- (5) transfer FROM a REVOKED sender reverts 159 ----------
    registry_call(
        &mut builder,
        registry_pkg,
        "revoke",
        runtime_args! { "asset_id" => ASSET.to_string(), "holder" => *ACCOUNT_1_KEY },
    );
    let t = transfer_request(*ACCOUNT_1_ADDR, nft_contract_key, 0, *ACCOUNT_1_KEY, *DEFAULT_ACCOUNT_KEY).build();
    builder.exec(t).expect_failure().commit();
    let err = builder.get_error().expect("must have error");
    support::assert_expected_error(err, 159u16, "transfer FROM revoked sender -> 159");
    assert_eq!(owner_of(&builder, &nft_contract_key, 0), *ACCOUNT_1_KEY, "revoked sender must not move token");
    println!("WRIT_REGISTRY_E2E (5) transfer FROM REVOKED sender (ACCOUNT_1, registry.revoke) REVERTED 159, token 0 stayed");

    // ---------- (6) EXPIRED credential reverts 159 (both directions) ----------
    // Before expiry (block time 0 s < 1000 s): transfer TO ACCOUNT_3 proceeds.
    let t = transfer_request(*DEFAULT_ACCOUNT_ADDR, nft_contract_key, 2, *DEFAULT_ACCOUNT_KEY, *ACCOUNT_3_KEY).build();
    builder.exec(t).expect_success().commit();
    assert_eq!(owner_of(&builder, &nft_contract_key, 2), *ACCOUNT_3_KEY);

    // After expiry (block time 2000 s): EXPIRED SENDER is denied...
    let t = transfer_request(*ACCOUNT_3_ADDR, nft_contract_key, 2, *ACCOUNT_3_KEY, *DEFAULT_ACCOUNT_KEY)
        .with_block_time(PAST_EXPIRY_MILLIS)
        .build();
    builder.exec(t).expect_failure().commit();
    let err = builder.get_error().expect("must have error");
    support::assert_expected_error(err, 159u16, "transfer FROM expired sender -> 159");
    assert_eq!(owner_of(&builder, &nft_contract_key, 2), *ACCOUNT_3_KEY, "expired sender must not move token");

    // ...and so is an EXPIRED RECIPIENT.
    let t = transfer_request(*DEFAULT_ACCOUNT_ADDR, nft_contract_key, 3, *DEFAULT_ACCOUNT_KEY, *ACCOUNT_3_KEY)
        .with_block_time(PAST_EXPIRY_MILLIS)
        .build();
    builder.exec(t).expect_failure().commit();
    let err = builder.get_error().expect("must have error");
    support::assert_expected_error(err, 159u16, "transfer TO expired recipient -> 159");
    assert_eq!(owner_of(&builder, &nft_contract_key, 3), *DEFAULT_ACCOUNT_KEY, "expired recipient must not receive token");
    println!("WRIT_REGISTRY_E2E (6) EXPIRED credential (ACCOUNT_3, expiry {SHORT_EXPIRY_SECS}s, block time advanced to 2000s) REVERTED 159 both as sender and as recipient");

    // ---------- (8) operator/approval cannot bypass the gate ----------
    // DEFAULT approves ACCOUNT_1 as operator for all its tokens.
    let approve_all = ExecuteRequestBuilder::contract_call_by_hash(
        *DEFAULT_ACCOUNT_ADDR,
        nft_contract_hash,
        ENTRY_POINT_SET_APPROVALL_FOR_ALL,
        runtime_args! {
            ARG_APPROVE_ALL => true,
            ARG_OPERATOR => *ACCOUNT_1_KEY,
        },
    )
    .build();
    builder.exec(approve_all).expect_success().commit();

    // The authorized operator attempts a transfer to an INELIGIBLE recipient: the
    // filter denies with 159 BEFORE the auth check even matters.
    let t = transfer_request(*ACCOUNT_1_ADDR, nft_contract_key, 3, *DEFAULT_ACCOUNT_KEY, *ACCOUNT_2_KEY).build();
    builder.exec(t).expect_failure().commit();
    let err = builder.get_error().expect("must have error");
    support::assert_expected_error(err, 159u16, "operator transfer to INELIGIBLE recipient -> 159");
    assert_eq!(owner_of(&builder, &nft_contract_key, 3), *DEFAULT_ACCOUNT_KEY, "operator must not move token to ineligible recipient");

    // Ordering proof: a caller with NO approval at all also gets 159 (not
    // InvalidTokenOwner) -> the filter fires BEFORE the owner/operator auth check.
    let t = transfer_request(*ACCOUNT_3_ADDR, nft_contract_key, 3, *DEFAULT_ACCOUNT_KEY, *ACCOUNT_2_KEY).build();
    builder.exec(t).expect_failure().commit();
    let err = builder.get_error().expect("must have error");
    support::assert_expected_error(err, 159u16, "unauthorized caller to ineligible recipient -> 159 (filter precedes auth)");
    assert_eq!(owner_of(&builder, &nft_contract_key, 3), *DEFAULT_ACCOUNT_KEY);

    // The approval itself is real: the same operator CAN move the token to an
    // ELIGIBLE recipient (block time 0 -> ACCOUNT_3 not yet expired).
    let t = transfer_request(*ACCOUNT_1_ADDR, nft_contract_key, 3, *DEFAULT_ACCOUNT_KEY, *ACCOUNT_3_KEY).build();
    builder.exec(t).expect_success().commit();
    assert_eq!(owner_of(&builder, &nft_contract_key, 3), *ACCOUNT_3_KEY);
    println!("WRIT_REGISTRY_E2E (8) OPERATOR transfer to INELIGIBLE recipient REVERTED 159 (gate fires before auth; unapproved caller also got 159, and the operator DID move token 3 to an eligible recipient)");

    // ---------- (7) missing registry fails CLOSED ----------
    // A second filter bound to a NONEXISTENT registry package + a second CEP-78
    // wired to it: nothing may proceed.
    let bogus_registry = Key::Hash([0xEEu8; 32]);
    let filter2_install = ExecuteRequestBuilder::standard(
        *DEFAULT_ACCOUNT_ADDR,
        REGISTRY_FILTER_WASM,
        runtime_args! {
            "registry_package" => bogus_registry,
            "asset_id" => ASSET.to_string(),
        },
    )
    .build();
    builder.exec(filter2_install).expect_success().commit();
    let filter2_hash = get_account_named_entity_hash(&builder, FILTER_HASH_NAME);
    assert_ne!(filter2_hash, filter_hash, "second filter must be a distinct contract");

    let install2 = InstallerRequestBuilder::new(*DEFAULT_ACCOUNT_ADDR, NFT_CONTRACT_WASM)
        .with_collection_name(SECOND_COLLECTION.to_string())
        .with_collection_symbol(NFT_TEST_SYMBOL.to_string())
        .with_total_token_supply(3u64)
        .with_ownership_mode(OwnershipMode::Transferable)
        .with_minting_mode(MintingMode::Installer)
        .with_transfer_filter_contract(Key::Hash(filter2_hash.value()))
        .build();
    builder.exec(install2).expect_success().commit();
    let nft2_contract_hash =
        get_account_named_entity_hash(&builder, &format!("cep78_contract_hash_{SECOND_COLLECTION}"));
    let nft2_contract_key = Key::Hash(casper_types::contracts::ContractHash::from(nft2_contract_hash).value());

    // mint on the broken-registry collection REVERTS (fail-closed, not 159 -- the
    // registry call itself aborts; any revert means the op cannot proceed).
    let mint2 = mint_request(nft2_contract_key, *DEFAULT_ACCOUNT_KEY, SECOND_COLLECTION).build();
    builder.exec(mint2).expect_failure().commit();
    let mint2_err = builder.get_error().expect("must have error");
    assert_eq!(try_owner_of(&builder, &nft2_contract_key, 0), None, "fail-closed mint must not create a token");
    println!("WRIT_REGISTRY_E2E (7a) mint with MISSING registry REVERTED (fail-closed). error = {mint2_err:?}");

    // The transfer gate itself fails closed: can_transfer on the broken filter reverts.
    let can_transfer_direct = ExecuteRequestBuilder::contract_call_by_hash(
        *DEFAULT_ACCOUNT_ADDR,
        filter2_hash,
        "can_transfer",
        runtime_args! {
            ARG_SOURCE_KEY => *DEFAULT_ACCOUNT_KEY,
            ARG_TARGET_KEY => *ACCOUNT_1_KEY,
        },
    )
    .build();
    builder.exec(can_transfer_direct).expect_failure().commit();
    let ct_err = builder.get_error().expect("must have error");
    println!("WRIT_REGISTRY_E2E (7b) can_transfer with MISSING registry REVERTED (fail-closed). error = {ct_err:?}");

    // And a transfer on that collection cannot proceed either (nothing was ever
    // mintable; the attempt reverts).
    let t = transfer_request(*DEFAULT_ACCOUNT_ADDR, nft2_contract_key, 0, *DEFAULT_ACCOUNT_KEY, *ACCOUNT_1_KEY).build();
    builder.exec(t).expect_failure().commit();
    let transfer2_err = builder.get_error().expect("must have error");
    assert_eq!(try_owner_of(&builder, &nft2_contract_key, 0), None, "fail-closed collection must hold no tokens");
    println!("WRIT_REGISTRY_E2E (7c) transfer on the broken-registry collection REVERTED. error = {transfer2_err:?}");

    println!("WRIT_REGISTRY_E2E DONE: patched CEP-78 -> writ_registry_filter -> REAL Odra CredentialRegistry proven end-to-end on the Casper 2.0 execution engine");
}
