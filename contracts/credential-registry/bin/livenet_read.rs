//! Reads the deployed CredentialRegistry on casper-test via the Odra Livenet
//! env. View calls take the query path (no deploy, no gas), so this observes the
//! real on-chain `get_credential` struct and `is_active` boolean.
//!
//! run: cargo run --bin livenet_read --features livenet -- <pkg-hash> <asset_id> <holder-account-hash>

use credential_registry::registry::CredentialRegistry;
use odra::casper_types::Key;
use odra::host::HostRefLoader;
use odra::prelude::Address;
use std::str::FromStr;

fn main() {
    let a: Vec<String> = std::env::args().collect();
    let pkg = a.get(1).cloned().unwrap_or_else(|| {
        "hash-2a25c38a129b5b5ceb6ec297bed6be5186862b1113e8a9ddfe534e648a567a57".to_string()
    });
    let asset = a
        .get(2)
        .cloned()
        .unwrap_or_else(|| "writ-bond-001".to_string());
    let holder_hash = a.get(3).cloned().unwrap_or_else(|| {
        "account-hash-f4a01d6b72731c6885e3b4ccdd535a5927b7dec344ed9ebb2b3f705b291a433a".to_string()
    });
    let pkg = if pkg.starts_with("hash-") { pkg } else { format!("hash-{pkg}") };
    let holder_hash = if holder_hash.starts_with("account-hash-") {
        holder_hash
    } else {
        format!("account-hash-{holder_hash}")
    };

    let env = odra_casper_livenet_env::env();
    let registry = CredentialRegistry::load(&env, Address::from_str(&pkg).expect("address"));
    let holder = Key::from_formatted_str(&holder_hash).expect("holder key");

    println!("GET_CREDENTIAL = {:?}", registry.get_credential(asset.clone(), holder));
    println!("IS_ACTIVE = {}", registry.is_active(asset.clone(), holder));

    // Optional 4th arg: a counterparty -> show the transfer gate + the exact reason.
    if let Some(to_raw) = a.get(4) {
        let to_fmt = if to_raw.starts_with("account-hash-") { to_raw.clone() } else { format!("account-hash-{to_raw}") };
        let to = Key::from_formatted_str(&to_fmt).expect("to key");
        println!("TRANSFER_ALLOWED({holder_hash} -> {to_fmt}) = {}", registry.transfer_allowed(asset.clone(), holder, to));
        println!("TRANSFER_CHECK({holder_hash} -> {to_fmt}) = {:?}", registry.transfer_check(asset, holder, to));
    }
}
