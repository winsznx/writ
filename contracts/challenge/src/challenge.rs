//! Writ Challenge contract — the optimistic fraud-proof layer.
//!
//! Attestations are accepted optimistically (the quorum signs; the proof is
//! *published* on the credential but not verified at attest time). A watcher who
//! believes an attestation is fraudulent posts a bond and `challenge`s it; that
//! freezes the credential (suspending its expiry) so the fraudster cannot refresh
//! or transfer out of the dispute. Anyone then calls `resolve`, which re-verifies
//! the credential's OWN published proof on-chain via the Groth16 verifier and:
//!   - proof INVALID  -> fraud: the credential is `revoke_fraud`'d, the FULL bond
//!     of every recorded signer is slashed (joint liability), the challenger is
//!     paid a gas allowance + reward and refunded their bond, and the remainder
//!     is burned to the treasury;
//!   - proof VALID    -> frivolous: the credential is unfrozen (back to Active, or
//!     Expired if its expiry elapsed during the freeze) and the challenger's bond
//!     is slashed to the signer(s) as compensation.
//!
//! Bonds are real CSPR held in this contract's purse. A challenge resolves once;
//! a bond slashes once; effects (state flips) precede interactions (CSPR moves).
//!
//! Only BONDED keys may serve as quorum signers (mirrored into the registry at
//! `bond`/`withdraw`), and an attestor cannot `withdraw` their bond while any
//! credential they signed is still challengeable — closing attest-fraud-then-flee.

use odra::casper_types::bytesrepr::Bytes;
use odra::casper_types::{Key, PublicKey, U512};
use odra::prelude::*;
use odra::ContractRef;

const MOTES_PER_CSPR: u64 = 1_000_000_000;
/// Production attestor bond posted per quorum key (CSPR). The live value is a
/// deploy-time constructor argument; this is the documented production default.
#[allow(dead_code)]
const ATTESTOR_BOND_CSPR: u64 = 5000;
/// Reward paid to a successful challenger out of the slashed pool.
const REWARD_CSPR: u64 = 300;
/// Bond a challenger locks when opening a dispute.
const CHALLENGER_BOND_CSPR: u64 = 250;
/// Gas reimbursement paid to a successful challenger, pegged to the measured full
/// `resolve()` gas on the casper EE (89.60 CSPR) and rounded up so the challenger
/// is always made whole on the resolve transaction.
const GAS_ALLOWANCE_CSPR: u64 = 90;

fn cspr(n: u64) -> U512 {
    U512::from(n) * U512::from(MOTES_PER_CSPR)
}

/// Cross-contract interface to the Credential Registry (subset the challenge
/// layer drives). Method names/types match the deployed registry entrypoints.
#[odra::external_contract]
pub trait RegistryIface {
    fn is_active(&self, asset_id: String, holder: Key) -> bool;
    fn freeze(&mut self, asset_id: String, holder: Key);
    fn unfreeze(&mut self, asset_id: String, holder: Key);
    fn revoke_fraud(&mut self, asset_id: String, holder: Key);
    fn set_bonded(&mut self, key: PublicKey, bonded: bool);
    fn cred_signers(&self, asset_id: String, holder: Key) -> Vec<PublicKey>;
    fn cred_proof(&self, asset_id: String, holder: Key) -> Bytes;
    fn cred_public_inputs(&self, asset_id: String, holder: Key) -> Bytes;
    fn attestor_outstanding(&self, key: PublicKey) -> u64;
}

/// Cross-contract interface to the on-chain Groth16 verifier.
#[odra::external_contract]
pub trait VerifierIface {
    fn verify(&self, proof: Bytes, public_inputs: Bytes) -> bool;
}

/// An open (or resolved) dispute over a credential.
#[odra::odra_type]
pub struct Dispute {
    pub challenger: Address,
    pub bond: U512,
    pub ts: u64,
    pub resolved: bool,
}

/// Emitted when a watcher opens a dispute — part of the regulator trail.
#[odra::event]
pub struct Challenged {
    pub asset_id: String,
    pub holder: String,
    pub challenger: Address,
}

/// Emitted when a dispute resolves. `fraud` = the published proof failed on-chain
/// re-verification (RevokedFraud + slash); otherwise the challenge was frivolous.
#[odra::event]
pub struct Resolved {
    pub asset_id: String,
    pub holder: String,
    pub fraud: bool,
}

#[odra::odra_error]
pub enum ChallengeError {
    WrongBondAmount = 1,
    AlreadyBonded = 2,
    NotBondOwner = 3,
    NotBonded = 4,
    HasOutstanding = 5,
    CooldownActive = 6,
    WrongChallengerBond = 7,
    AlreadyChallenged = 8,
    NotChallengeable = 9,
    NoDispute = 10,
    AlreadyResolved = 11,
    NotConfigured = 12,
    InvalidKey = 13,
}

#[odra::module(errors = ChallengeError, events = [Challenged, Resolved])]
pub struct Challenge {
    registry: Var<Address>,
    verifier: Var<Address>,
    treasury: Var<Address>,
    /// Minimum time a bond must sit before it can be withdrawn.
    cooldown_secs: Var<u64>,
    /// The required attestor bond (motes) — a deploy-time parameter so the demo
    /// can bond cheaply (250 CSPR) while production uses the full 5000 CSPR.
    attestor_bond: Var<U512>,
    /// attestor key -> locked attestor bond (motes).
    bonds: Mapping<PublicKey, U512>,
    /// attestor key -> block time the bond was posted (for the cooldown).
    bonded_at: Mapping<PublicKey, u64>,
    /// (asset_id, holder) -> dispute.
    disputes: Mapping<(String, Key), Dispute>,
}

#[odra::module]
impl Challenge {
    pub fn init(
        &mut self,
        registry: Address,
        verifier: Address,
        treasury: Address,
        cooldown_secs: u64,
        attestor_bond: U512,
    ) {
        self.registry.set(registry);
        self.verifier.set(verifier);
        self.treasury.set(treasury);
        self.cooldown_secs.set(cooldown_secs);
        self.attestor_bond.set(attestor_bond);
    }

    /// The configured attestor bond (motes).
    pub fn attestor_bond(&self) -> U512 {
        self.attestor_bond.get_or_default()
    }

    /// Post an attestor bond for `attestor` (the caller must be that key's
    /// account). Marks the key bonded in the registry so it may serve as a quorum
    /// signer. Exactly `ATTESTOR_BOND` must be attached.
    #[odra(payable)]
    pub fn bond(&mut self, attestor: PublicKey) {
        let env = self.env();
        if env.caller() != self.addr_of(&attestor) {
            env.revert(ChallengeError::NotBondOwner);
        }
        if env.attached_value() != self.attestor_bond.get_or_default() {
            env.revert(ChallengeError::WrongBondAmount);
        }
        if self.bonds.get(&attestor).unwrap_or_default() > U512::zero() {
            env.revert(ChallengeError::AlreadyBonded);
        }
        self.bonds.set(&attestor, env.attached_value());
        self.bonded_at.set(&attestor, env.get_block_time_secs());
        RegistryIfaceContractRef::new(self.env(), self.reg_addr()).set_bonded(attestor.clone(), true);
    }

    /// Withdraw an attestor bond. Allowed only when the key has NO still-
    /// challengeable credential (registry `attestor_outstanding == 0`) and the
    /// cooldown has elapsed. Returns the bond to the attestor's account.
    pub fn withdraw(&mut self, attestor: PublicKey) {
        let env = self.env();
        if env.caller() != self.addr_of(&attestor) {
            env.revert(ChallengeError::NotBondOwner);
        }
        let bond = self.bonds.get(&attestor).unwrap_or_default();
        if bond == U512::zero() {
            env.revert(ChallengeError::NotBonded);
        }
        if RegistryIfaceContractRef::new(self.env(), self.reg_addr())
            .attestor_outstanding(attestor.clone())
            > 0
        {
            env.revert(ChallengeError::HasOutstanding);
        }
        let bonded_at = self.bonded_at.get(&attestor).unwrap_or_default();
        if env.get_block_time_secs() < bonded_at + self.cooldown_secs.get_or_default() {
            env.revert(ChallengeError::CooldownActive);
        }
        // effects before interactions
        let to = self.addr_of(&attestor);
        self.bonds.set(&attestor, U512::zero());
        RegistryIfaceContractRef::new(self.env(), self.reg_addr()).set_bonded(attestor.clone(), false);
        env.transfer_tokens(&to, &bond);
    }

    /// Open a dispute over a live credential. Requires it to be active (rejecting
    /// frozen/revoked/expired), and no other open dispute (first-challenge-wins).
    /// Locks `CHALLENGER_BOND` and freezes the credential (suspending its expiry).
    #[odra(payable)]
    pub fn challenge(&mut self, asset_id: String, holder: Key) {
        let env = self.env();
        if env.attached_value() != cspr(CHALLENGER_BOND_CSPR) {
            env.revert(ChallengeError::WrongChallengerBond);
        }
        if let Some(d) = self.disputes.get(&(asset_id.clone(), holder)) {
            if !d.resolved {
                env.revert(ChallengeError::AlreadyChallenged);
            }
        }
        if !RegistryIfaceContractRef::new(self.env(), self.reg_addr())
            .is_active(asset_id.clone(), holder)
        {
            env.revert(ChallengeError::NotChallengeable);
        }
        RegistryIfaceContractRef::new(self.env(), self.reg_addr()).freeze(asset_id.clone(), holder);
        let challenger = env.caller();
        self.disputes.set(
            &(asset_id.clone(), holder),
            Dispute {
                challenger,
                bond: env.attached_value(),
                ts: env.get_block_time_secs(),
                resolved: false,
            },
        );
        env.emit_event(Challenged {
            asset_id,
            holder: holder.to_formatted_string(),
            challenger,
        });
    }

    /// Adjudicate a dispute by re-verifying the credential's OWN published proof
    /// on-chain. Idempotent. Effects (state flips) precede interactions (CSPR).
    pub fn resolve(&mut self, asset_id: String, holder: Key) {
        let env = self.env();
        let mut dispute = self
            .disputes
            .get(&(asset_id.clone(), holder))
            .unwrap_or_revert_with(&env, ChallengeError::NoDispute);
        if dispute.resolved {
            env.revert(ChallengeError::AlreadyResolved);
        }

        // Read the credential's OWN stored proof/public-inputs/signers — never
        // caller-supplied. The verify therefore binds to THIS credential.
        let reg_addr = self.reg_addr();
        let proof = RegistryIfaceContractRef::new(self.env(), reg_addr)
            .cred_proof(asset_id.clone(), holder);
        let public_inputs = RegistryIfaceContractRef::new(self.env(), reg_addr)
            .cred_public_inputs(asset_id.clone(), holder);
        let signers = RegistryIfaceContractRef::new(self.env(), reg_addr)
            .cred_signers(asset_id.clone(), holder);

        let valid = VerifierIfaceContractRef::new(self.env(), self.ver_addr())
            .verify(proof, public_inputs);

        // EFFECT: lock the dispute as resolved before any money moves.
        dispute.resolved = true;
        self.disputes
            .set(&(asset_id.clone(), holder), dispute.clone());
        env.emit_event(Resolved {
            asset_id: asset_id.clone(),
            holder: holder.to_formatted_string(),
            fraud: !valid,
        });

        if !valid {
            self.settle_fraud(&asset_id, holder, &signers, &dispute);
        } else {
            self.settle_frivolous(&asset_id, holder, &signers, &dispute);
        }
    }

    // ---- internal settlement (effects, then interactions) ----

    fn settle_fraud(
        &mut self,
        asset_id: &str,
        holder: Key,
        signers: &[PublicKey],
        dispute: &Dispute,
    ) {
        let env = self.env();
        // EFFECTS: fraud-revoke the credential and zero/unbond every signer.
        RegistryIfaceContractRef::new(self.env(), self.reg_addr())
            .revoke_fraud(asset_id.into(), holder);
        let mut slashed = U512::zero();
        for s in signers {
            let b = self.bonds.get(s).unwrap_or_default();
            if b > U512::zero() {
                self.bonds.set(s, U512::zero());
                RegistryIfaceContractRef::new(self.env(), self.reg_addr()).set_bonded(s.clone(), false);
                slashed += b;
            }
        }

        // INTERACTIONS: pay challenger (gas+reward capped at the slashed pool) and
        // refund their bond; burn the remainder to the treasury.
        let reward = cspr(GAS_ALLOWANCE_CSPR) + cspr(REWARD_CSPR);
        let from_pool = if reward < slashed { reward } else { slashed };
        env.transfer_tokens(&dispute.challenger, &(from_pool + dispute.bond));
        let remainder = slashed.saturating_sub(from_pool);
        if remainder > U512::zero() {
            env.transfer_tokens(&self.treasury_addr(), &remainder);
        }
    }

    fn settle_frivolous(
        &mut self,
        asset_id: &str,
        holder: Key,
        signers: &[PublicKey],
        dispute: &Dispute,
    ) {
        let env = self.env();
        // EFFECT: unfreeze (-> Active, or Expired if expiry elapsed under freeze).
        RegistryIfaceContractRef::new(self.env(), self.reg_addr())
            .unfreeze(asset_id.into(), holder);
        // INTERACTIONS: the challenger's bond compensates the signer(s) equally;
        // any rounding remainder is burned to the treasury.
        let n = signers.len() as u64;
        if n == 0 {
            env.transfer_tokens(&self.treasury_addr(), &dispute.bond);
            return;
        }
        let share = dispute.bond / U512::from(n);
        let mut paid = U512::zero();
        for s in signers {
            env.transfer_tokens(&self.addr_of(s), &share);
            paid += share;
        }
        let remainder = dispute.bond.saturating_sub(paid);
        if remainder > U512::zero() {
            env.transfer_tokens(&self.treasury_addr(), &remainder);
        }
    }

    // ---- reads ----

    pub fn bond_of(&self, attestor: PublicKey) -> U512 {
        self.bonds.get(&attestor).unwrap_or_default()
    }

    pub fn dispute_of(&self, asset_id: String, holder: Key) -> Option<Dispute> {
        self.disputes.get(&(asset_id, holder))
    }

    // ---- helpers ----

    fn reg_addr(&self) -> Address {
        self.registry
            .get()
            .unwrap_or_revert_with(&self.env(), ChallengeError::NotConfigured)
    }
    fn ver_addr(&self) -> Address {
        self.verifier
            .get()
            .unwrap_or_revert_with(&self.env(), ChallengeError::NotConfigured)
    }
    fn treasury_addr(&self) -> Address {
        self.treasury
            .get()
            .unwrap_or_revert_with(&self.env(), ChallengeError::NotConfigured)
    }
    fn addr_of(&self, pk: &PublicKey) -> Address {
        Address::try_from(Key::Account(pk.to_account_hash()))
            .unwrap_or_revert_with(&self.env(), ChallengeError::InvalidKey)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use credential_registry::registry::{
        canonical_message, CredentialRegistry, CredentialRegistryHostRef,
        CredentialRegistryInitArgs, Status,
    };
    use groth16_verifier::verifier::Groth16Verifier;
    use odra::host::{Deployer, HostEnv, HostRef, NoArgs};

    const ASSET: &str = "writ-bond-001";
    const COOLDOWN: u64 = 100;
    const FAR: u64 = 32_503_680_000; // ~year 3000

    // The proven verifier fixtures (same bytes the verifier crate embeds/checks).
    const PROOF: &[u8] = include_bytes!("../../groth16-verifier/fixtures/proof.bin");
    const PROOF_TAMPERED: &[u8] = include_bytes!("../../groth16-verifier/fixtures/proof_tampered.bin");
    const INPUTS: &[u8] = include_bytes!("../../groth16-verifier/fixtures/inputs.bin");
    const INPUTS_TAMPERED: &[u8] = include_bytes!("../../groth16-verifier/fixtures/inputs_tampered.bin");

    fn first32(b: &[u8]) -> [u8; 32] {
        let mut a = [0u8; 32];
        a.copy_from_slice(&b[0..32]);
        a
    }
    fn second32(b: &[u8]) -> [u8; 32] {
        let mut a = [0u8; 32];
        a.copy_from_slice(&b[32..64]);
        a
    }

    fn pk(env: &HostEnv, i: usize) -> PublicKey {
        env.public_key(&env.get_account(i))
    }
    fn key_of(env: &HostEnv, i: usize) -> Key {
        Key::Account(pk(env, i).to_account_hash())
    }
    fn bal(env: &HostEnv, i: usize) -> U512 {
        env.balance_of(&env.get_account(i))
    }
    /// The challenge contract's own purse — gas-independent (only the CALLER pays
    /// gas), so purse-conservation assertions hold on both the OdraVM and the real
    /// casper backend.
    fn cbal(w: &World) -> U512 {
        w.env.balance_of(&w.challenge.address())
    }

    struct World {
        env: HostEnv,
        registry: CredentialRegistryHostRef,
        challenge: ChallengeHostRef,
    }

    /// Deploy verifier + registry (quorum {0,1,2}, threshold 2, officer 3) +
    /// challenge (treasury = account 8); grant the challenge contract authority.
    fn setup(window_secs: u64) -> World {
        let env = odra_test::env();
        env.set_caller(env.get_account(0));
        let verifier = Groth16Verifier::deploy(&env, NoArgs);
        let quorum = vec![pk(&env, 0), pk(&env, 1), pk(&env, 2)];
        let mut registry = CredentialRegistry::deploy(
            &env,
            CredentialRegistryInitArgs {
                quorum_keys: quorum,
                threshold: 2,
                window_secs,
                officer: key_of(&env, 3),
            },
        );
        let challenge = Challenge::deploy(
            &env,
            ChallengeInitArgs {
                registry: registry.address(),
                verifier: verifier.address(),
                treasury: env.get_account(8),
                cooldown_secs: COOLDOWN,
                attestor_bond: cspr(ATTESTOR_BOND_CSPR),
            },
        );
        env.set_caller(env.get_account(0));
        registry.grant_challenge(challenge.address());
        World { env, registry, challenge }
    }

    fn bond_one(w: &mut World, i: usize) {
        w.env.set_caller(w.env.get_account(i));
        w.challenge
            .with_tokens(cspr(ATTESTOR_BOND_CSPR))
            .bond(pk(&w.env, i));
    }
    fn bond_all(w: &mut World) {
        for i in 0..3 {
            bond_one(w, i);
        }
    }

    /// Attest a credential for `holder` signed by accounts {0,1} with the given
    /// published proof/public-inputs and the (commitment, nullifier) they bind to.
    #[allow(clippy::too_many_arguments)]
    fn attest(
        w: &mut World,
        holder: Key,
        expiry: u64,
        proof: &[u8],
        inputs: &[u8],
        commit: [u8; 32],
        null: [u8; 32],
    ) {
        w.env.set_caller(w.env.get_account(0));
        let msg = canonical_message(ASSET, &holder, &commit, &null, expiry);
        let signers = vec![pk(&w.env, 0), pk(&w.env, 1)];
        let sigs = vec![
            w.env.sign_message(&msg, &w.env.get_account(0)),
            w.env.sign_message(&msg, &w.env.get_account(1)),
        ];
        w.registry.attest(
            ASSET.into(),
            holder,
            commit,
            null,
            expiry,
            Bytes::from(proof.to_vec()),
            Bytes::from(inputs.to_vec()),
            signers,
            sigs,
        );
    }

    fn open_challenge(w: &mut World, challenger: usize, holder: Key) {
        w.env.set_caller(w.env.get_account(challenger));
        w.challenge
            .with_tokens(cspr(CHALLENGER_BOND_CSPR))
            .challenge(ASSET.into(), holder);
    }

    // ---------------- bonding ----------------

    #[test]
    fn bond_marks_bonded_and_mirrors_to_registry() {
        let mut w = setup(0);
        bond_one(&mut w, 0);
        assert_eq!(w.challenge.bond_of(pk(&w.env, 0)), cspr(ATTESTOR_BOND_CSPR));
        assert!(w.registry.is_bonded(pk(&w.env, 0)));
        assert!(!w.registry.is_bonded(pk(&w.env, 1)));
    }

    #[test]
    fn bond_wrong_amount_rejected() {
        let mut w = setup(0);
        w.env.set_caller(w.env.get_account(0));
        assert_eq!(
            w.challenge
                .with_tokens(cspr(4999))
                .try_bond(pk(&w.env, 0))
                .unwrap_err(),
            ChallengeError::WrongBondAmount.into()
        );
    }

    #[test]
    fn bond_not_owner_rejected() {
        let mut w = setup(0);
        // account 1 tries to bond account 0's key
        w.env.set_caller(w.env.get_account(1));
        assert_eq!(
            w.challenge
                .with_tokens(cspr(ATTESTOR_BOND_CSPR))
                .try_bond(pk(&w.env, 0))
                .unwrap_err(),
            ChallengeError::NotBondOwner.into()
        );
    }

    #[test]
    fn double_bond_rejected() {
        let mut w = setup(0);
        bond_one(&mut w, 0);
        w.env.set_caller(w.env.get_account(0));
        assert_eq!(
            w.challenge
                .with_tokens(cspr(ATTESTOR_BOND_CSPR))
                .try_bond(pk(&w.env, 0))
                .unwrap_err(),
            ChallengeError::AlreadyBonded.into()
        );
    }

    #[test]
    fn unbonded_key_cannot_sign_attest() {
        let mut w = setup(0);
        // only bond account 0; account 1 stays unbonded
        bond_one(&mut w, 0);
        let holder = key_of(&w.env, 7);
        w.env.set_caller(w.env.get_account(0));
        let msg = canonical_message(ASSET, &holder, &c_real(), &n_real(), FAR);
        let signers = vec![pk(&w.env, 0), pk(&w.env, 1)];
        let sigs = vec![
            w.env.sign_message(&msg, &w.env.get_account(0)),
            w.env.sign_message(&msg, &w.env.get_account(1)),
        ];
        assert!(w
            .registry
            .try_attest(
                ASSET.into(),
                holder,
                c_real(),
                n_real(),
                FAR,
                Bytes::from(PROOF.to_vec()),
                Bytes::from(INPUTS.to_vec()),
                signers,
                sigs
            )
            .is_err());
    }

    // ---------------- withdraw guard ----------------

    #[test]
    fn withdraw_blocked_while_outstanding_then_allowed() {
        let mut w = setup(0);
        bond_all(&mut w);
        let holder = key_of(&w.env, 7);
        attest(&mut w, holder, FAR, PROOF, INPUTS, c_real(), n_real());
        // account 0 signed -> outstanding -> withdraw blocked
        w.env.set_caller(w.env.get_account(0));
        assert_eq!(
            w.challenge.try_withdraw(pk(&w.env, 0)).unwrap_err(),
            ChallengeError::HasOutstanding.into()
        );
        // clear the credential (sanctions revoke) -> outstanding 0
        w.env.set_caller(w.env.get_account(0));
        w.registry.revoke(ASSET.into(), holder);
        // cooldown must still elapse
        w.env.set_caller(w.env.get_account(0));
        assert_eq!(
            w.challenge.try_withdraw(pk(&w.env, 0)).unwrap_err(),
            ChallengeError::CooldownActive.into()
        );
        w.env.advance_block_time((COOLDOWN + 1) * 1000);
        let before = bal(&w.env, 0);
        w.env.set_caller(w.env.get_account(0));
        w.challenge.withdraw(pk(&w.env, 0));
        assert!(bal(&w.env, 0) > before); // bond returned (minus any gas)
        // purse drops by the returned bond (3 bonds -> 2).
        assert_eq!(cbal(&w), cspr(2 * ATTESTOR_BOND_CSPR));
        assert_eq!(w.challenge.bond_of(pk(&w.env, 0)), U512::zero());
        assert!(!w.registry.is_bonded(pk(&w.env, 0)));
    }

    #[test]
    fn withdraw_cooldown_enforced() {
        let mut w = setup(0);
        bond_one(&mut w, 2); // account 2 signs nothing -> no outstanding
        w.env.set_caller(w.env.get_account(2));
        assert_eq!(
            w.challenge.try_withdraw(pk(&w.env, 2)).unwrap_err(),
            ChallengeError::CooldownActive.into()
        );
        w.env.advance_block_time((COOLDOWN + 1) * 1000);
        w.env.set_caller(w.env.get_account(2));
        w.challenge.withdraw(pk(&w.env, 2));
        assert_eq!(w.challenge.bond_of(pk(&w.env, 2)), U512::zero());
    }

    // ---------------- challenge gating ----------------

    #[test]
    fn challenge_rejects_non_active() {
        let mut w = setup(3600); // window not elapsed -> not yet active
        bond_all(&mut w);
        let holder = key_of(&w.env, 7);
        attest(&mut w, holder, FAR, PROOF, INPUTS, c_real(), n_real());
        w.env.set_caller(w.env.get_account(9));
        assert_eq!(
            w.challenge
                .with_tokens(cspr(CHALLENGER_BOND_CSPR))
                .try_challenge(ASSET.into(), holder)
                .unwrap_err(),
            ChallengeError::NotChallengeable.into()
        );
    }

    #[test]
    fn challenge_double_rejected_first_wins() {
        let mut w = setup(0);
        bond_all(&mut w);
        let holder = key_of(&w.env, 7);
        attest(&mut w, holder, FAR, PROOF, INPUTS, c_real(), n_real());
        open_challenge(&mut w, 9, holder);
        // credential now frozen -> not active
        assert!(!w.registry.is_active(ASSET.into(), holder));
        // a second challenger is rejected (first-challenge-wins)
        w.env.set_caller(w.env.get_account(10));
        assert_eq!(
            w.challenge
                .with_tokens(cspr(CHALLENGER_BOND_CSPR))
                .try_challenge(ASSET.into(), holder)
                .unwrap_err(),
            ChallengeError::AlreadyChallenged.into()
        );
    }

    #[test]
    fn challenge_wrong_bond_rejected() {
        let mut w = setup(0);
        bond_all(&mut w);
        let holder = key_of(&w.env, 7);
        attest(&mut w, holder, FAR, PROOF, INPUTS, c_real(), n_real());
        w.env.set_caller(w.env.get_account(9));
        assert_eq!(
            w.challenge
                .with_tokens(cspr(249))
                .try_challenge(ASSET.into(), holder)
                .unwrap_err(),
            ChallengeError::WrongChallengerBond.into()
        );
    }

    // ---------------- resolve: fraud ----------------

    #[test]
    fn resolve_fraud_full_split() {
        let mut w = setup(0);
        bond_all(&mut w);
        let holder = key_of(&w.env, 7);
        // fraudulent: tampered proof against real inputs -> verify FALSE
        attest(&mut w, holder, FAR, PROOF_TAMPERED, INPUTS, c_real(), n_real());
        open_challenge(&mut w, 9, holder);

        let c0 = bal(&w.env, 9);
        let t0 = bal(&w.env, 8);
        w.env.set_caller(w.env.get_account(9));
        w.challenge.resolve(ASSET.into(), holder);

        // credential fraud-revoked
        assert_eq!(
            w.registry.get_credential(ASSET.into(), holder).unwrap().status,
            Status::RevokedFraud
        );
        // both signers' full bonds slashed; the non-signer (acct 2) untouched
        assert_eq!(w.challenge.bond_of(pk(&w.env, 0)), U512::zero());
        assert_eq!(w.challenge.bond_of(pk(&w.env, 1)), U512::zero());
        assert_eq!(w.challenge.bond_of(pk(&w.env, 2)), cspr(ATTESTOR_BOND_CSPR));
        assert!(!w.registry.is_bonded(pk(&w.env, 0)));
        assert!(!w.registry.is_bonded(pk(&w.env, 1)));
        // challenger ends net-positive (reward + gas allowance + bond returned,
        // minus any gas they paid). treasury receives exactly the burned remainder
        // (treasury never calls, so this is gas-independent and exact).
        assert!(bal(&w.env, 9) > c0);
        let slashed = cspr(2 * ATTESTOR_BOND_CSPR);
        let burned = slashed - cspr(GAS_ALLOWANCE_CSPR + REWARD_CSPR);
        assert_eq!(bal(&w.env, 8), t0 + burned);
        // purse conservation: only the non-signer (acct 2) bond remains.
        assert_eq!(cbal(&w), cspr(ATTESTOR_BOND_CSPR));
    }

    // ---------------- resolve: frivolous ----------------

    #[test]
    fn resolve_frivolous_compensates_signers() {
        let mut w = setup(0);
        bond_all(&mut w);
        let holder = key_of(&w.env, 7);
        // valid: real proof + real inputs -> verify TRUE
        attest(&mut w, holder, FAR, PROOF, INPUTS, c_real(), n_real());
        open_challenge(&mut w, 9, holder);

        let c0 = bal(&w.env, 9);
        let s0 = bal(&w.env, 0);
        let s1 = bal(&w.env, 1);
        w.env.set_caller(w.env.get_account(9));
        w.challenge.resolve(ASSET.into(), holder);

        // unfrozen back to Active; signers keep their bonds
        assert_eq!(
            w.registry.get_credential(ASSET.into(), holder).unwrap().status,
            Status::Active
        );
        assert!(w.registry.is_active(ASSET.into(), holder));
        assert_eq!(w.challenge.bond_of(pk(&w.env, 0)), cspr(ATTESTOR_BOND_CSPR));
        // challenger forfeits the bond (no refund); signers split it 125 each
        // (signers don't initiate resolve, so their deltas are gas-independent).
        let share = cspr(CHALLENGER_BOND_CSPR) / U512::from(2u64);
        assert_eq!(bal(&w.env, 0), s0 + share);
        assert_eq!(bal(&w.env, 1), s1 + share);
        // purse still holds all 3 attestor bonds; the challenger bond left it.
        assert_eq!(cbal(&w), cspr(3 * ATTESTOR_BOND_CSPR));
        let _ = c0;
    }

    // ---------------- idempotency ----------------

    #[test]
    fn resolve_idempotent_no_double_slash() {
        let mut w = setup(0);
        bond_all(&mut w);
        let holder = key_of(&w.env, 7);
        attest(&mut w, holder, FAR, PROOF_TAMPERED, INPUTS, c_real(), n_real());
        open_challenge(&mut w, 9, holder);
        w.env.set_caller(w.env.get_account(9));
        w.challenge.resolve(ASSET.into(), holder);
        let t_after = bal(&w.env, 8);
        // re-resolve rejected
        w.env.set_caller(w.env.get_account(9));
        assert_eq!(
            w.challenge.try_resolve(ASSET.into(), holder).unwrap_err(),
            ChallengeError::AlreadyResolved.into()
        );
        // no double-slash / no extra burn
        assert_eq!(bal(&w.env, 8), t_after);
        assert_eq!(w.challenge.bond_of(pk(&w.env, 0)), U512::zero());
    }

    // ---------------- freeze blocks refresh ----------------

    #[test]
    fn challenge_freeze_blocks_refresh() {
        let mut w = setup(0);
        bond_all(&mut w);
        let holder = key_of(&w.env, 7);
        attest(&mut w, holder, FAR, PROOF, INPUTS, c_real(), n_real());
        open_challenge(&mut w, 9, holder); // freezes
        // fraudster attempts to refresh out of the dispute
        w.env.set_caller(w.env.get_account(0));
        let msg = canonical_message(ASSET, &holder, &c_real(), &n_real(), FAR + 1);
        let signers = vec![pk(&w.env, 0), pk(&w.env, 1)];
        let sigs = vec![
            w.env.sign_message(&msg, &w.env.get_account(0)),
            w.env.sign_message(&msg, &w.env.get_account(1)),
        ];
        assert!(w
            .registry
            .try_attest(
                ASSET.into(),
                holder,
                c_real(),
                n_real(),
                FAR + 1,
                Bytes::from(PROOF.to_vec()),
                Bytes::from(INPUTS.to_vec()),
                signers,
                sigs
            )
            .is_err());
    }

    // ---------------- public-input binding ----------------

    #[test]
    fn public_input_binding_fraud() {
        let mut w = setup(0);
        bond_all(&mut w);
        let holder = key_of(&w.env, 7);
        // a proof VALID for INPUTS, but stored against DIFFERENT inputs
        // (INPUTS_TAMPERED). resolve reads the credential's OWN stored inputs ->
        // verify(PROOF, INPUTS_TAMPERED) is FALSE -> fraud.
        attest(
            &mut w,
            holder,
            FAR,
            PROOF,
            INPUTS_TAMPERED,
            c_tamp(),
            n_tamp(),
        );
        open_challenge(&mut w, 9, holder);
        w.env.set_caller(w.env.get_account(9));
        w.challenge.resolve(ASSET.into(), holder);
        assert_eq!(
            w.registry.get_credential(ASSET.into(), holder).unwrap().status,
            Status::RevokedFraud
        );
    }

    // ---------------- expiry under freeze ----------------

    #[test]
    fn expiry_under_freeze_resolves_expired() {
        let mut w = setup(0);
        bond_all(&mut w);
        let holder = key_of(&w.env, 7);
        let near: u64 = 10_000;
        attest(&mut w, holder, near, PROOF, INPUTS, c_real(), n_real());
        open_challenge(&mut w, 9, holder); // freezes, suspends expiry
        w.env.advance_block_time(near * 1000 + 1000); // clock passes expiry while frozen
        w.env.set_caller(w.env.get_account(9));
        w.challenge.resolve(ASSET.into(), holder); // valid -> frivolous -> unfreeze
        assert_eq!(
            w.registry.get_credential(ASSET.into(), holder).unwrap().status,
            Status::Expired
        );
        assert!(!w.registry.is_active(ASSET.into(), holder));
    }

    // ---------------- self-challenge (sockpuppet) net loss ----------------

    #[test]
    fn self_challenge_is_net_negative() {
        let mut w = setup(0);
        let a0_initial = bal(&w.env, 0);
        let a1_initial = bal(&w.env, 1);
        bond_all(&mut w);
        let holder = key_of(&w.env, 7);
        // account 0 (a signer) attests a fraudulent credential, then self-challenges
        attest(&mut w, holder, FAR, PROOF_TAMPERED, INPUTS, c_real(), n_real());
        open_challenge(&mut w, 0, holder); // sockpuppet challenger = signer account 0
        w.env.set_caller(w.env.get_account(0));
        w.challenge.resolve(ASSET.into(), holder);

        // account 0: -5000 bond (slashed) -250 challenge +630 (gas allowance +
        // reward + bond back) = net -(ATTESTOR_BOND - GAS_ALLOWANCE - REWARD)
        // = -4620 CSPR, BEFORE any tx gas. The sockpuppet cannot recover the
        // slashed bond; self-challenging is strictly net-negative.
        let net_loss = cspr(ATTESTOR_BOND_CSPR) - cspr(GAS_ALLOWANCE_CSPR) - cspr(REWARD_CSPR);
        assert!(bal(&w.env, 0) < a0_initial);
        assert!(a0_initial - bal(&w.env, 0) >= net_loss);
        // the co-signer (account 1) also loses its bond with no recovery.
        assert!(bal(&w.env, 1) < a1_initial);
        // both signer bonds are gone; only the non-signer (acct 2) bond remains.
        assert_eq!(w.challenge.bond_of(pk(&w.env, 0)), U512::zero());
        assert_eq!(w.challenge.bond_of(pk(&w.env, 1)), U512::zero());
        assert_eq!(cbal(&w), cspr(ATTESTOR_BOND_CSPR));
        assert!(net_loss > U512::zero());
    }

    // ---------------- gas: full resolve() ----------------

    #[test]
    fn resolve_gas_report() {
        let mut w = setup(0);
        bond_all(&mut w);
        let holder = key_of(&w.env, 7);
        attest(&mut w, holder, FAR, PROOF_TAMPERED, INPUTS, c_real(), n_real());
        open_challenge(&mut w, 9, holder);
        w.env.set_caller(w.env.get_account(9));
        w.challenge.resolve(ASSET.into(), holder);
        println!("GAS_REPORT[challenge-layer]:\n{}", w.env.gas_report());
    }

    // fixture-derived public input components
    fn n_real() -> [u8; 32] {
        first32(INPUTS)
    }
    fn c_real() -> [u8; 32] {
        second32(INPUTS)
    }
    fn n_tamp() -> [u8; 32] {
        first32(INPUTS_TAMPERED)
    }
    fn c_tamp() -> [u8; 32] {
        second32(INPUTS_TAMPERED)
    }
}
