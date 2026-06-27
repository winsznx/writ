#![no_std]
#![no_main]

#[cfg(not(target_arch = "wasm32"))]
compile_error!("target arch should be wasm32: compile with '--target wasm32-unknown-unknown'");

extern crate alloc;

use alloc::string::{String, ToString};
use alloc::vec;

use casper_contract::{
    contract_api::{
        runtime::{self, ret},
        storage,
    },
    unwrap_or_revert::UnwrapOrRevert,
};
use casper_types::{
    contracts::{ContractHash, ContractVersion},
    ApiError, CLType, CLValue, EntityEntryPoint as EntryPoint, EntryPointAccess, EntryPointPayment,
    EntryPointType, EntryPoints, Key, NamedKeys, Parameter,
};

const CONTRACT_NAME: &str = "writ_filter_contract_hash";
const CONTRACT_VERSION: &str = "writ_filter_contract_version";
const HASH_KEY_NAME: &str = "writ_filter_package_hash";
const ACCESS_KEY_NAME: &str = "writ_filter_access_uref";

const DICT_ALLOWED: &str = "allowed";
const KEY_PANIC: &str = "panic";

const ARG_SOURCE_KEY: &str = "source_key";
const ARG_TARGET_KEY: &str = "target_key";
const ARG_ACCOUNT: &str = "account";
const ARG_ALLOWED: &str = "allowed";
const ARG_PANIC: &str = "panic";

const DENY_TRANSFER: u8 = 0;
const PROCEED_TRANSFER: u8 = 1;

const ERR_PANIC_MODE: u16 = 9001;
const ERR_UNSUPPORTED_KEY: u16 = 9002;
const ERR_MISSING_ALLOWED: u16 = 9003;
const ERR_MISSING_PANIC: u16 = 9004;

fn dict_item_key(key: &Key) -> String {
    let bytes: [u8; 32] = match key {
        Key::Account(account_hash) => account_hash.value(),
        Key::Hash(hash_addr) => *hash_addr,
        _ => runtime::revert(ApiError::User(ERR_UNSUPPORTED_KEY)),
    };
    const HEX: &[u8; 16] = b"0123456789abcdef";
    let mut out = String::with_capacity(64);
    for byte in bytes.iter() {
        out.push(HEX[(byte >> 4) as usize] as char);
        out.push(HEX[(byte & 0x0f) as usize] as char);
    }
    out
}

fn allowed_seed_uref() -> casper_types::URef {
    runtime::get_key(DICT_ALLOWED)
        .unwrap_or_revert_with(ApiError::User(ERR_MISSING_ALLOWED))
        .into_uref()
        .unwrap_or_revert_with(ApiError::User(ERR_MISSING_ALLOWED))
}

fn panic_uref() -> casper_types::URef {
    runtime::get_key(KEY_PANIC)
        .unwrap_or_revert_with(ApiError::User(ERR_MISSING_PANIC))
        .into_uref()
        .unwrap_or_revert_with(ApiError::User(ERR_MISSING_PANIC))
}

#[no_mangle]
pub extern "C" fn set_allowed() {
    let account: Key = runtime::get_named_arg(ARG_ACCOUNT);
    let allowed: bool = runtime::get_named_arg(ARG_ALLOWED);
    storage::dictionary_put(allowed_seed_uref(), &dict_item_key(&account), allowed);
}

#[no_mangle]
pub extern "C" fn set_panic() {
    let panic: bool = runtime::get_named_arg(ARG_PANIC);
    storage::write(panic_uref(), panic);
}

#[no_mangle]
pub extern "C" fn can_transfer() {
    if storage::read::<bool>(panic_uref())
        .unwrap_or_revert()
        .unwrap_or(false)
    {
        runtime::revert(ApiError::User(ERR_PANIC_MODE));
    }

    let target_key: Key = runtime::get_named_arg(ARG_TARGET_KEY);
    let is_allowed = storage::dictionary_get::<bool>(allowed_seed_uref(), &dict_item_key(&target_key))
        .unwrap_or_revert()
        .unwrap_or(false);

    let result = if is_allowed { PROCEED_TRANSFER } else { DENY_TRANSFER };
    ret(CLValue::from_t(result).unwrap_or_revert());
}

// The cep-78 mint() hook (separate from can_transfer): the RECIPIENT must be
// eligible. In production this delegates to Registry.is_active(recipient); here
// it mirrors the recipient allowlist, returning a bool.
#[no_mangle]
pub extern "C" fn mint_allowed() {
    let target_key: Key = runtime::get_named_arg(ARG_TARGET_KEY);
    let is_allowed =
        storage::dictionary_get::<bool>(allowed_seed_uref(), &dict_item_key(&target_key))
            .unwrap_or_revert()
            .unwrap_or(false);
    ret(CLValue::from_t(is_allowed).unwrap_or_revert());
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
    let set_allowed_ep = EntryPoint::new(
        "set_allowed",
        vec![
            Parameter::new(ARG_ACCOUNT, CLType::Key),
            Parameter::new(ARG_ALLOWED, CLType::Bool),
        ],
        CLType::Unit,
        EntryPointAccess::Public,
        EntryPointType::Called,
        EntryPointPayment::Caller,
    );
    let set_panic_ep = EntryPoint::new(
        "set_panic",
        vec![Parameter::new(ARG_PANIC, CLType::Bool)],
        CLType::Unit,
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
    entry_points.add_entry_point(set_allowed_ep);
    entry_points.add_entry_point(set_panic_ep);

    let allowed_seed = storage::new_dictionary(DICT_ALLOWED).unwrap_or_revert();
    let mut named_keys = NamedKeys::new();
    named_keys.insert(DICT_ALLOWED.to_string(), allowed_seed.into());
    named_keys.insert(KEY_PANIC.to_string(), storage::new_uref(false).into());

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
