#![no_std]
#![no_main]

#[cfg(not(target_arch = "wasm32"))]
compile_error!("target arch should be wasm32");

extern crate alloc;

use casper_contract::{contract_api::{account, runtime}, unwrap_or_revert::UnwrapOrRevert};
use casper_types::account::{AccountHash, ActionType, Weight};

// Configure the calling account as an M-of-N weighted multisig: add two associated
// keys (weight 1 each) and raise the Deployment + KeyManagement action thresholds to
// `threshold`. Run by the officer multisig's initial key; afterwards officer ops
// require `threshold` of the 3 keys to sign (native Casper enforcement).
#[no_mangle]
pub extern "C" fn call() {
    let key2: AccountHash = runtime::get_named_arg("key2");
    let key3: AccountHash = runtime::get_named_arg("key3");
    let threshold: u8 = runtime::get_named_arg("threshold");
    account::add_associated_key(key2, Weight::new(1)).unwrap_or_revert();
    account::add_associated_key(key3, Weight::new(1)).unwrap_or_revert();
    account::set_action_threshold(ActionType::KeyManagement, Weight::new(threshold)).unwrap_or_revert();
    account::set_action_threshold(ActionType::Deployment, Weight::new(threshold)).unwrap_or_revert();
}
