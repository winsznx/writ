//! Writ token — a filter-gated asset: the in-repo, EE-testable model of the
//! patched recipient-aware CEP-78 used on testnet.
//!
//! The full patched CEP-78 (a ~440 KB fork proven live in the substrate smoke
//! test + wiring) is not reconstructed here; this token captures the ONE property
//! the integration cares about: every transfer consults the configured transfer
//! filter, which delegates to the live Credential Registry gate. A transfer
//! to/from a non-eligible party is denied on-chain. Issuance (mint) is the
//! issuer's action (gated at mint against recipient eligibility in production).

use odra::casper_types::Key;
use odra::prelude::*;
use odra::ContractRef;

#[odra::external_contract]
pub trait Filter {
    fn is_transfer_allowed(&self, from: Key, to: Key) -> bool;
}

#[odra::odra_error]
pub enum TokenError {
    NotConfigured = 1,
    NotOwned = 2,
    NotOwner = 3,
    TransferDenied = 4,
}

#[odra::module]
pub struct WritToken {
    filter: Var<Address>,
    owners: Mapping<u64, Key>,
}

#[odra::module]
impl WritToken {
    pub fn init(&mut self, filter: Address) {
        self.filter.set(filter);
    }

    /// Issue token `id` to `to`.
    pub fn mint(&mut self, to: Key, id: u64) {
        self.owners.set(&id, to);
    }

    pub fn owner_of(&self, id: u64) -> Option<Key> {
        self.owners.get(&id)
    }

    /// Move token `id` to `to`. The caller must be the current owner, and the
    /// transfer filter (=> the registry compliance gate) must permit `from`->`to`,
    /// else the transfer reverts and the asset does not move.
    pub fn transfer(&mut self, id: u64, to: Key) {
        let env = self.env();
        let from = self
            .owners
            .get(&id)
            .unwrap_or_revert_with(&env, TokenError::NotOwned);
        let owner_addr =
            Address::try_from(from).unwrap_or_revert_with(&env, TokenError::NotOwner);
        if env.caller() != owner_addr {
            env.revert(TokenError::NotOwner);
        }
        let allowed = FilterContractRef::new(self.env(), self.filter_addr())
            .is_transfer_allowed(from, to);
        if !allowed {
            env.revert(TokenError::TransferDenied);
        }
        self.owners.set(&id, to);
    }

    fn filter_addr(&self) -> Address {
        self.filter
            .get()
            .unwrap_or_revert_with(&self.env(), TokenError::NotConfigured)
    }
}
