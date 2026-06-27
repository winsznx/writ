#![no_std]
#![no_main]

#[cfg(not(target_arch = "wasm32"))]
compile_error!("target arch should be wasm32: compile with '--target wasm32-unknown-unknown'");

extern crate alloc;

use alloc::string::String;

use casper_contract::{
    contract_api::{account, runtime, system},
    unwrap_or_revert::UnwrapOrRevert,
};
use casper_types::{contracts::ContractPackageHash, runtime_args, ApiError, Key, PublicKey, U512};

// put-deploy-native payable caller for odra entrypoints: create a cargo purse, fund
// it from the signer's main purse, then call the target passing `cargo_purse` (which
// odra's handle_attached_value pulls into the contract = the attached value). The
// signer of THIS deploy is the contract's caller (so `bond` runs as the attestor).

const ERR_NOT_PACKAGE: u16 = 1;
const ERR_BAD_MODE: u16 = 2;

#[no_mangle]
pub extern "C" fn call() {
    let amount: U512 = runtime::get_named_arg("cspr_amount");
    let pkg_key: Key = runtime::get_named_arg("challenge_pkg");
    let pkg = match pkg_key {
        Key::Hash(h) => ContractPackageHash::new(h),
        _ => runtime::revert(ApiError::User(ERR_NOT_PACKAGE)),
    };
    let mode: String = runtime::get_named_arg("mode");

    if mode == "mkpurse" {
        // Create a cargo purse and publish its URef as a named key, WITHOUT moving
        // any CSPR (no session main-purse spend). It is then funded by a NATIVE
        // transfer (which may leave the main purse) and handed to the payable call.
        let cargo = system::create_purse();
        runtime::put_key("writ_cargo_purse", cargo.into());
        return;
    }

    let cargo = system::create_purse();
    let main = account::get_main_purse();
    system::transfer_from_purse_to_purse(main, cargo, amount, None).unwrap_or_revert();

    if mode == "fund" {
        // diagnostic: main->cargo above is the spending-limited op; return it so the
        // probe is net-zero (only gas lost). Deposits back to main are unlimited.
        system::transfer_from_purse_to_purse(cargo, main, amount, None).unwrap_or_revert();
        return;
    } else if mode == "bond" {
        let attestor: PublicKey = runtime::get_named_arg("attestor");
        runtime::call_versioned_contract::<()>(
            pkg,
            None,
            "bond",
            runtime_args! { "attestor" => attestor, "cargo_purse" => cargo },
        );
    } else if mode == "challenge" {
        let asset_id: String = runtime::get_named_arg("asset_id");
        let holder: Key = runtime::get_named_arg("holder");
        runtime::call_versioned_contract::<()>(
            pkg,
            None,
            "challenge",
            runtime_args! { "asset_id" => asset_id, "holder" => holder, "cargo_purse" => cargo },
        );
    } else {
        runtime::revert(ApiError::User(ERR_BAD_MODE));
    }
}
