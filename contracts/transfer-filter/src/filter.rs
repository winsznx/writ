//! Writ transfer filter — the cep-78 transfer-filter hook adapter.
//!
//! The patched CEP-78 token is configured with this contract as its
//! `transfer_filter_contract`. On every transfer the token calls
//! `is_transfer_allowed(from, to)`, which delegates the decision to the live
//! Credential Registry's `transfer_allowed(asset_id, from, to)` gate — the single
//! source of truth for who may hold or receive the asset. The filter holds no
//! policy of its own; it binds the token to one registry + one asset_id at wiring
//! time so the token and the compliance layer can never drift apart.

use odra::casper_types::Key;
use odra::prelude::*;
use odra::ContractRef;

/// The subset of the registry the filter reads. Names/types match the deployed
/// registry entrypoints.
#[odra::external_contract]
pub trait RegistryGate {
    fn transfer_allowed(&self, asset_id: String, from: Key, to: Key) -> bool;
    fn is_active(&self, asset_id: String, holder: Key) -> bool;
}

#[odra::odra_error]
pub enum FilterError {
    NotConfigured = 1,
}

#[odra::module]
pub struct TransferFilter {
    registry: Var<Address>,
    asset_id: Var<String>,
}

#[odra::module]
impl TransferFilter {
    pub fn init(&mut self, registry: Address, asset_id: String) {
        self.registry.set(registry);
        self.asset_id.set(asset_id);
    }

    /// The cep-78 hook: whether moving the asset from `from` to `to` is permitted.
    /// Pure delegation to the registry gate for this filter's bound asset.
    pub fn is_transfer_allowed(&self, from: Key, to: Key) -> bool {
        RegistryGateContractRef::new(self.env(), self.reg())
            .transfer_allowed(self.asset(), from, to)
    }

    /// Convenience read mirroring the recipient eligibility the gate enforces.
    pub fn is_active(&self, holder: Key) -> bool {
        RegistryGateContractRef::new(self.env(), self.reg()).is_active(self.asset(), holder)
    }

    pub fn registry(&self) -> Address {
        self.reg()
    }
    pub fn asset(&self) -> String {
        self.asset_id
            .get()
            .unwrap_or_revert_with(&self.env(), FilterError::NotConfigured)
    }

    fn reg(&self) -> Address {
        self.registry
            .get()
            .unwrap_or_revert_with(&self.env(), FilterError::NotConfigured)
    }
}
