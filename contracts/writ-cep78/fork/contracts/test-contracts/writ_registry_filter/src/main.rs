#![no_std]
#![no_main]

#[cfg(not(target_arch = "wasm32"))]
compile_error!("target arch should be wasm32: compile with '--target wasm32-unknown-unknown'");

extern crate alloc;

use alloc::string::{String, ToString};
use alloc::vec;

use casper_contract::{
    contract_api::{
        runtime::{self, call_versioned_contract, ret},
        storage,
    },
    unwrap_or_revert::UnwrapOrRevert,
};
use casper_types::{
    contracts::{ContractHash, ContractPackageHash, ContractVersion},
    runtime_args, ApiError, CLType, CLValue, EntityEntryPoint as EntryPoint, EntryPointAccess,
    EntryPointPayment, EntryPointType, EntryPoints, Key, NamedKeys, Parameter,
};

// The PRODUCTION cep-78 compliance filter: recipient-aware can_transfer + separate
// mint_allowed, both delegating to the live Credential Registry. Holds no policy of
// its own; bound to ONE registry package + ONE asset_id at install. FAIL-SAFE: any
// registry revert propagates and aborts the whole NFT op (deny) — a sanctioned party
// cannot trigger an error path to pass.

const CONTRACT_NAME: &str = "writ_registry_filter_contract_hash";
const CONTRACT_VERSION: &str = "writ_registry_filter_contract_version";
const HASH_KEY_NAME: &str = "writ_registry_filter_package_hash";
const ACCESS_KEY_NAME: &str = "writ_registry_filter_access_uref";

const KEY_REGISTRY: &str = "writ_registry_pkg";
const KEY_ASSET: &str = "writ_asset_id";

const ARG_SOURCE_KEY: &str = "source_key";
const ARG_TARGET_KEY: &str = "target_key";
const ARG_REGISTRY: &str = "registry_package";
const ARG_ASSET: &str = "asset_id";

// registry entrypoints + their arg names (odra-generated; must match exactly).
const EP_TRANSFER_ALLOWED: &str = "transfer_allowed";
const EP_IS_ACTIVE: &str = "is_active";
const RARG_ASSET_ID: &str = "asset_id";
const RARG_FROM: &str = "from";
const RARG_TO: &str = "to";
const RARG_HOLDER: &str = "holder";

const DENY_TRANSFER: u8 = 0;
const PROCEED_TRANSFER: u8 = 1;

const ERR_MISSING_REGISTRY: u16 = 9101;
const ERR_MISSING_ASSET: u16 = 9102;

fn registry_pkg() -> ContractPackageHash {
    let uref = runtime::get_key(KEY_REGISTRY)
        .unwrap_or_revert_with(ApiError::User(ERR_MISSING_REGISTRY))
        .into_uref()
        .unwrap_or_revert_with(ApiError::User(ERR_MISSING_REGISTRY));
    let bytes: [u8; 32] = storage::read(uref)
        .unwrap_or_revert()
        .unwrap_or_revert_with(ApiError::User(ERR_MISSING_REGISTRY));
    ContractPackageHash::new(bytes)
}

fn asset_id() -> String {
    let uref = runtime::get_key(KEY_ASSET)
        .unwrap_or_revert_with(ApiError::User(ERR_MISSING_ASSET))
        .into_uref()
        .unwrap_or_revert_with(ApiError::User(ERR_MISSING_ASSET));
    storage::read(uref)
        .unwrap_or_revert()
        .unwrap_or_revert_with(ApiError::User(ERR_MISSING_ASSET))
}

#[no_mangle]
pub extern "C" fn can_transfer() {
    // recipient-aware: gate on the REAL recipient (target_key), never the owner.
    let source: Key = runtime::get_named_arg(ARG_SOURCE_KEY);
    let target: Key = runtime::get_named_arg(ARG_TARGET_KEY);
    // A revert in the registry call aborts the whole transfer (fail-safe deny).
    let allowed: bool = call_versioned_contract(
        registry_pkg(),
        None,
        EP_TRANSFER_ALLOWED,
        runtime_args! { RARG_ASSET_ID => asset_id(), RARG_FROM => source, RARG_TO => target },
    );
    let result = if allowed { PROCEED_TRANSFER } else { DENY_TRANSFER };
    ret(CLValue::from_t(result).unwrap_or_revert());
}

#[no_mangle]
pub extern "C" fn mint_allowed() {
    // mint gated SEPARATELY: the recipient must be is_active in the registry.
    let target: Key = runtime::get_named_arg(ARG_TARGET_KEY);
    let active: bool = call_versioned_contract(
        registry_pkg(),
        None,
        EP_IS_ACTIVE,
        runtime_args! { RARG_ASSET_ID => asset_id(), RARG_HOLDER => target },
    );
    ret(CLValue::from_t(active).unwrap_or_revert());
}

fn install() -> (ContractHash, ContractVersion) {
    let can_transfer_ep = EntryPoint::new(
        "can_transfer",
        vec![
            Parameter::new(ARG_SOURCE_KEY, CLType::Key),
            Parameter::new(ARG_TARGET_KEY, CLType::Key),
        ],
        CLType::U8,
        EntryPointAccess::Public,
        EntryPointType::Called,
        EntryPointPayment::Caller,
    );
    let mint_allowed_ep = EntryPoint::new(
        "mint_allowed",
        vec![Parameter::new(ARG_TARGET_KEY, CLType::Key)],
        CLType::Bool,
        EntryPointAccess::Public,
        EntryPointType::Called,
        EntryPointPayment::Caller,
    );

    let mut entry_points = EntryPoints::new();
    entry_points.add_entry_point(can_transfer_ep);
    entry_points.add_entry_point(mint_allowed_ep);

    let registry_key: Key = runtime::get_named_arg(ARG_REGISTRY);
    let registry_bytes: [u8; 32] = match registry_key {
        Key::Hash(h) => h,
        _ => runtime::revert(ApiError::User(ERR_MISSING_REGISTRY)),
    };
    let asset: String = runtime::get_named_arg(ARG_ASSET);

    let mut named_keys = NamedKeys::new();
    named_keys.insert(KEY_REGISTRY.to_string(), storage::new_uref(registry_bytes).into());
    named_keys.insert(KEY_ASSET.to_string(), storage::new_uref(asset).into());

    storage::new_contract(
        entry_points,
        Some(named_keys),
        Some(HASH_KEY_NAME.to_string()),
        Some(ACCESS_KEY_NAME.to_string()),
        None,
    )
}

#[no_mangle]
pub extern "C" fn call() {
    let (contract_hash, contract_version) = install();
    runtime::put_key(CONTRACT_NAME, Key::Hash(contract_hash.value()));
    runtime::put_key(CONTRACT_VERSION, storage::new_uref(contract_version).into());
}
