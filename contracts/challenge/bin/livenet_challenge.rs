//! Livenet driver for the PAYABLE challenge cycle on casper-test (bond/challenge/
//! resolve). The caller is the account behind ODRA_CASPER_LIVENET_SECRET_KEY_PATH:
//! run `bond` as the attestor (q1), `challenge`/`resolve` as the challenger. odra's
//! `with_tokens` attaches the CSPR bond via the proxy-caller (raw casper-client
//! cannot attach value to an odra payable entrypoint).
//!
//! usage: livenet_challenge <bond|challenge|resolve> <challenge-pkg> <arg3> [holder]

use challenge::challenge::Challenge;
use odra::casper_types::bytesrepr::FromBytes;
use odra::casper_types::{Key, PublicKey, U512};
use odra::host::{HostRef, HostRefLoader};
use odra::prelude::Address;
use std::str::FromStr;

const MOTES: u64 = 1_000_000_000;

fn hexdec(s: &str) -> Vec<u8> {
    (0..s.len())
        .step_by(2)
        .map(|i| u8::from_str_radix(&s[i..i + 2], 16).expect("hex"))
        .collect()
}

fn main() {
    let a: Vec<String> = std::env::args().collect();
    let mode = a[1].as_str();
    let pkg = if a[2].starts_with("hash-") { a[2].clone() } else { format!("hash-{}", a[2]) };
    let env = odra_casper_livenet_env::env();
    let mut ch = Challenge::load(&env, Address::from_str(&pkg).expect("challenge address"));

    match mode {
        "bond" => {
            let (pk, _) = PublicKey::from_bytes(&hexdec(&a[3])).expect("attestor pubkey");
            env.set_gas(40 * MOTES);
            ch.with_tokens(U512::from(250u64 * MOTES)).bond(pk);
            println!("BONDED attestor {}", a[3]);
        }
        "challenge" => {
            let holder = Key::from_formatted_str(&a[4]).expect("holder key");
            env.set_gas(40 * MOTES);
            ch.with_tokens(U512::from(250u64 * MOTES)).challenge(a[3].clone(), holder);
            println!("CHALLENGED {} {}", a[3], a[4]);
        }
        "resolve" => {
            let holder = Key::from_formatted_str(&a[4]).expect("holder key");
            env.set_gas(90 * MOTES);
            ch.resolve(a[3].clone(), holder);
            println!("RESOLVED {} {}", a[3], a[4]);
        }
        _ => panic!("mode must be bond|challenge|resolve"),
    }
}
