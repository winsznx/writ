// Throwaway smoke test for the Writ compliance substrate.
// Runs against the real Casper 2.0 execution engine with the PATCHED cep-78
// (transfer filter now receives the real recipient as ARG_TARGET_KEY) plus the
// custom `writ_filter` (allowed-dict + panic mode).
//
// Core proof: a transfer to a DENIED RECIPIENT now reverts (pre-patch it proceeded,
// because the unpatched hook passed the owner as target_key and was recipient-blind).

use casper_engine_test_support::{ExecuteRequestBuilder, LmdbWasmTestBuilder, DEFAULT_ACCOUNT_ADDR};
use casper_types::{runtime_args, AddressableEntityHash, Key};

use cep78::constants::{
    ARG_COLLECTION_NAME, ARG_SOURCE_KEY, ARG_TARGET_KEY, ARG_TOKEN_ID, ARG_TOKEN_META_DATA,
    ARG_TOKEN_OWNER, ENTRY_POINT_REGISTER_OWNER, TOKEN_OWNERS,
};

use crate::utility::{
    constants::{
        ACCOUNT_1_KEY, ACCOUNT_2_KEY, ARG_NFT_CONTRACT_HASH, DEFAULT_ACCOUNT_KEY, MINT_SESSION_WASM,
        NFT_CONTRACT_WASM, NFT_TEST_COLLECTION, NFT_TEST_SYMBOL, TEST_PRETTY_721_META_DATA,
        TRANSFER_SESSION_WASM,
    },
    installer_request_builder::{InstallerRequestBuilder, MintingMode, OwnershipMode},
    support::{
        self, genesis, get_dictionary_value_from_key, get_nft_contract_hash,
        get_nft_contract_hash_key,
    },
};

const WRIT_FILTER_WASM: &str = "writ_filter.wasm";
const FILTER_HASH_NAME: &str = "writ_filter_contract_hash";

fn get_writ_filter_hash(builder: &LmdbWasmTestBuilder) -> AddressableEntityHash {
    builder
        .get_entity_with_named_keys_by_account_hash(*DEFAULT_ACCOUNT_ADDR)
        .unwrap()
        .named_keys()
        .get(FILTER_HASH_NAME)
        .expect("must have writ_filter hash entry in named keys")
        .into_entity_hash()
        .expect("must get entity hash")
}

fn owner_of(builder: &LmdbWasmTestBuilder, nft_contract_key: &Key, token_id: u64) -> Key {
    get_dictionary_value_from_key::<Key>(builder, nft_contract_key, TOKEN_OWNERS, &token_id.to_string())
}

fn set_allowed(builder: &mut LmdbWasmTestBuilder, filter: AddressableEntityHash, who: Key, allow: bool) {
    let req = ExecuteRequestBuilder::contract_call_by_hash(
        *DEFAULT_ACCOUNT_ADDR,
        filter,
        "set_allowed",
        runtime_args! { "account" => who, "allowed" => allow },
    )
    .build();
    builder.exec(req).expect_success().commit();
}

#[test]
fn probe_filter_key_encoding() {
    use casper_types::bytesrepr::{deserialize, ToBytes};
    use casper_types::{EntityAddr, Key};
    let addr = [0x32u8; 32];
    let variants = [
        ("Hash", Key::Hash(addr)),
        ("AddrEntity-SmartContract", Key::AddressableEntity(EntityAddr::SmartContract(addr))),
    ];
    for (label, k) in variants {
        let kb = k.to_bytes().unwrap();
        let plain: Result<Option<Key>, _> = deserialize(kb.clone());
        let sb = Some(k).to_bytes().unwrap();
        let wrapped: Result<Option<Key>, _> = deserialize(sb.clone());
        println!(
            "PROBE {label}: plainKeyBytes(len={}) as Option<Key> => {:?} | Some(Key)Bytes(len={}) as Option<Key> => {:?}",
            kb.len(),
            plain.map(|o| o.map(|k| format!("{:?}", k))),
            sb.len(),
            wrapped.map(|o| o.map(|k| format!("{:?}", k))),
        );
    }
}

#[test]
fn writ_filter_smoke() {
    let mut builder = genesis();

    // install writ_filter (compliance gate)
    let filter_install =
        ExecuteRequestBuilder::standard(*DEFAULT_ACCOUNT_ADDR, WRIT_FILTER_WASM, runtime_args! {}).build();
    builder.exec(filter_install).expect_success().commit();
    let filter_hash = get_writ_filter_hash(&builder);

    // install PATCHED CEP-78 collection, Transferable, gated by writ_filter
    let install = InstallerRequestBuilder::new(*DEFAULT_ACCOUNT_ADDR, NFT_CONTRACT_WASM)
        .with_collection_name(NFT_TEST_COLLECTION.to_string())
        .with_collection_symbol(NFT_TEST_SYMBOL.to_string())
        .with_total_token_supply(3u64)
        .with_ownership_mode(OwnershipMode::Transferable)
        .with_minting_mode(MintingMode::Installer)
        .with_transfer_filter_contract(Key::Hash(filter_hash.value()))
        .build();
    builder.exec(install).expect_success().commit();

    let nft_contract_hash = get_nft_contract_hash(&builder);
    let nft_contract_key: Key = get_nft_contract_hash_key(&builder);
    let owner_key = *DEFAULT_ACCOUNT_KEY;

    for receiver in [*ACCOUNT_1_KEY, *ACCOUNT_2_KEY] {
        let reg = ExecuteRequestBuilder::contract_call_by_hash(
            *DEFAULT_ACCOUNT_ADDR,
            nft_contract_hash,
            ENTRY_POINT_REGISTER_OWNER,
            runtime_args! { ARG_TOKEN_OWNER => receiver },
        )
        .build();
        builder.exec(reg).expect_success().commit();
    }

    // Mint gate (separate from transfer): the recipient of a freshly minted NFT
    // must be eligible. Allow the owner so issuance proceeds; the transfer gate
    // below is what proves recipient-awareness.
    set_allowed(&mut builder, filter_hash, owner_key, true);

    for _ in 0..2u64 {
        let mint = ExecuteRequestBuilder::standard(
            *DEFAULT_ACCOUNT_ADDR,
            MINT_SESSION_WASM,
            runtime_args! {
                ARG_NFT_CONTRACT_HASH => nft_contract_key,
                ARG_TOKEN_OWNER => owner_key,
                ARG_TOKEN_META_DATA => TEST_PRETTY_721_META_DATA.to_string(),
                ARG_COLLECTION_NAME => NFT_TEST_COLLECTION.to_string(),
            },
        )
        .build();
        builder.exec(mint).expect_success().commit();
    }

    // RECIPIENT allowlist: allow ACCOUNT_1, deny ACCOUNT_2. (Owner/sender is NOT allowlisted,
    // proving the gate now keys on the recipient.)
    set_allowed(&mut builder, filter_hash, *ACCOUNT_1_KEY, true);
    set_allowed(&mut builder, filter_hash, *ACCOUNT_2_KEY, false);

    // ---------- CORE PROOF: transfer to DENIED RECIPIENT now REVERTS ----------
    let transfer_denied = ExecuteRequestBuilder::standard(
        *DEFAULT_ACCOUNT_ADDR,
        TRANSFER_SESSION_WASM,
        runtime_args! {
            ARG_NFT_CONTRACT_HASH => nft_contract_key,
            ARG_TOKEN_ID => 1u64,
            ARG_SOURCE_KEY => owner_key,
            ARG_TARGET_KEY => *ACCOUNT_2_KEY,
        },
    )
    .build();
    builder.exec(transfer_denied).expect_failure().commit();
    let deny_err = builder.get_error().expect("must have error");
    support::assert_expected_error(deny_err, 159u16, "denied RECIPIENT -> TransferFilterContractDenied(159)");
    assert_eq!(owner_of(&builder, &nft_contract_key, 1), owner_key, "denied transfer must not move token");
    println!("WRIT_SMOKE (b) DENIED RECIPIENT (ACCOUNT_2) -> transfer REVERTED 159 (patch works; token 1 stayed). PRE-PATCH this PROCEEDED.");

    // ---------- ALLOWED recipient PROCEEDS ----------
    let transfer_allowed = ExecuteRequestBuilder::standard(
        *DEFAULT_ACCOUNT_ADDR,
        TRANSFER_SESSION_WASM,
        runtime_args! {
            ARG_NFT_CONTRACT_HASH => nft_contract_key,
            ARG_TOKEN_ID => 0u64,
            ARG_SOURCE_KEY => owner_key,
            ARG_TARGET_KEY => *ACCOUNT_1_KEY,
        },
    )
    .build();
    builder.exec(transfer_allowed).expect_success().commit();
    let gas = builder.last_exec_gas_consumed();
    assert_eq!(owner_of(&builder, &nft_contract_key, 0), *ACCOUNT_1_KEY);
    println!("WRIT_SMOKE (a) ALLOWED RECIPIENT (ACCOUNT_1) -> transfer PROCEEDED (token 0 now ACCOUNT_1)");
    println!("WRIT_SMOKE (e) successful filtered-transfer gas consumed = {} motes", gas.value());

    // ---------- (c) MINT is gated SEPARATELY at the registry: the transfer filter
    // (can_transfer) does NOT fire on mint, but mint() calls the distinct
    // `mint_allowed` gate -> Registry.is_active(recipient). Minting to an
    // INELIGIBLE recipient REVERTS. ----------
    let mint_denied = ExecuteRequestBuilder::standard(
        *DEFAULT_ACCOUNT_ADDR,
        MINT_SESSION_WASM,
        runtime_args! {
            ARG_NFT_CONTRACT_HASH => nft_contract_key,
            ARG_TOKEN_OWNER => *ACCOUNT_2_KEY,
            ARG_TOKEN_META_DATA => TEST_PRETTY_721_META_DATA.to_string(),
            ARG_COLLECTION_NAME => NFT_TEST_COLLECTION.to_string(),
        },
    )
    .build();
    builder.exec(mint_denied).expect_failure().commit();
    let mint_err = builder.get_error().expect("must have error");
    support::assert_expected_error(
        mint_err,
        159u16,
        "mint to INELIGIBLE recipient -> TransferFilterContractDenied(159) via mint_allowed",
    );
    println!("WRIT_SMOKE (c) MINT to INELIGIBLE recipient -> REVERTED (mint gated separately at the registry via mint_allowed)");

    // ---------- (d) PANIC -> fail-safe ----------
    let set_panic = ExecuteRequestBuilder::contract_call_by_hash(
        *DEFAULT_ACCOUNT_ADDR,
        filter_hash,
        "set_panic",
        runtime_args! { "panic" => true },
    )
    .build();
    builder.exec(set_panic).expect_success().commit();

    // token 1 -> ACCOUNT_1 (an ALLOWED recipient) so only the panic could block it
    let transfer_panic = ExecuteRequestBuilder::standard(
        *DEFAULT_ACCOUNT_ADDR,
        TRANSFER_SESSION_WASM,
        runtime_args! {
            ARG_NFT_CONTRACT_HASH => nft_contract_key,
            ARG_TOKEN_ID => 1u64,
            ARG_SOURCE_KEY => owner_key,
            ARG_TARGET_KEY => *ACCOUNT_1_KEY,
        },
    )
    .build();
    builder.exec(transfer_panic).expect_failure().commit();
    let panic_err = builder.get_error().expect("must have error");
    assert_eq!(owner_of(&builder, &nft_contract_key, 1), owner_key, "panic must block transfer (fail-safe)");
    println!("WRIT_SMOKE (d) PANIC -> transfer FAILED fail-safe (token 1 not moved). error = {:?}", panic_err);

    println!("WRIT_SMOKE DONE: recipient-gating proven on the real Casper 2.0 execution engine");
}
