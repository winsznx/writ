//! Writ Credential Registry — the on-chain heart of Writ's compliance layer.
//!
//! Stores per-holder eligibility credentials (commitment + nullifier + status +
//! expiry + attested_at + the quorum signers + the published proof and public
//! inputs), enforces the credential state machine, and serves the read
//! (`is_active`) that the patched CEP-78 transfer filter consumes on every
//! transfer. Verification of the ZK proof happens OFF-CHAIN in the agent quorum
//! at attest time; the on-chain RE-verification (fraud adjudication) is performed
//! by the Challenge contract against the *published* proof stored here. This
//! contract checks the quorum's threshold of native signatures over a canonical
//! payload — it never sees PII.
//!
//! Challenge-layer support: each credential records WHICH bonded quorum keys
//! signed it (so a fraud slash knows whose bonds to take), an `outstanding`
//! counter per signer (so an attestor cannot withdraw a bond while any of their
//! credentials is still challengeable), a `bonded` mirror (only bonded keys may
//! sign), a `Frozen` state that suspends expiry during a live dispute, and a
//! `RevokedFraud` terminal state distinct from a sanctions `Revoked`.

use odra::casper_types::account::AccountHash;
use odra::casper_types::bytesrepr::{Bytes, ToBytes};
use odra::casper_types::{Key, PublicKey};
use odra::prelude::*;
use odra_modules::access::{AccessControl, Role, DEFAULT_ADMIN_ROLE};

/// The `from` value the mint path supplies — the sender check is skipped for it.
pub fn mint_sentinel() -> Key {
    Key::Account(AccountHash::new([0u8; 32]))
}

/// May `attest` and `revoke` — held by the agent operator account(s) that submit
/// quorum-signed credentials. Distinct from `quorum_keys` (the *signing* set).
pub const QUORUM_ROLE: Role = *b"writ::credential::role::quorum01";
/// May `freeze`, `unfreeze` and `revoke` — held by the human compliance officer.
pub const OFFICER_ROLE: Role = *b"writ::credential::role::officer1";
/// May `freeze`, `unfreeze`, `revoke_fraud` and `set_bonded` — held by the
/// Challenge contract so the fraud-proof layer can act on credentials/bonds.
pub const CHALLENGE_ROLE: Role = *b"writ::credential::role::challen1";

/// Credential lifecycle states. `RevokedFraud` is the terminal state a proven
/// fraudulent attestation lands in — distinct from a sanctions `Revoked` so the
/// audit trail tells the two apart.
#[odra::odra_type]
#[derive(Default)]
pub enum Status {
    #[default]
    Pending,
    Attested,
    Active,
    Revoked,
    Expired,
    Frozen,
    RevokedFraud,
}

/// True while a credential can still be challenged (and thus still ties up its
/// signers' bonds): live (Attested/Active) or in a live dispute (Frozen).
pub fn is_challengeable(status: &Status) -> bool {
    matches!(status, Status::Attested | Status::Active | Status::Frozen)
}

/// A holder's eligibility credential. No PII — only commitments, a nullifier, the
/// bonded signer set, and the published proof material the challenge layer
/// re-verifies.
#[odra::odra_type]
pub struct Credential {
    pub status: Status,
    pub commitment: [u8; 32],
    pub nullifier: [u8; 32],
    pub expiry: u64,
    pub attested_at: u64,
    /// The bonded quorum keys that signed this credential (joint liability).
    pub signers: Vec<PublicKey>,
    /// The published Groth16 proof (arkworks canonical-uncompressed bytes).
    pub proof: Bytes,
    /// The 6 public inputs, 32 bytes each, canonical order
    /// [nullifier, commitment, issuerAx, issuerAy, assetId, allowedRoot].
    pub public_inputs: Bytes,
    /// When `Frozen`, whether the freeze was opened by the Challenge layer (an
    /// in-flight dispute) rather than a human officer hold. The officer may NOT
    /// unfreeze a challenge-frozen credential — a dispute resolves via the
    /// verifier, never officer fiat.
    pub frozen_by_challenge: bool,
}

/// The (asset, holder) slot a nullifier is first bound to. Re-attesting the same
/// nullifier is allowed only for this exact slot (refresh); any other slot is a
/// replay / Sybil attempt and is rejected.
#[odra::odra_type]
pub struct NullifierBinding {
    pub asset_id: String,
    pub holder: Key,
}

#[odra::odra_error]
pub enum RegistryError {
    NotAuthorized = 1,
    InvalidThreshold = 2,
    ExpiryInPast = 3,
    NullifierReused = 4,
    UnknownSigner = 5,
    DuplicateSigner = 6,
    ThresholdNotMet = 7,
    CredentialNotFound = 8,
    SignerSignatureCountMismatch = 9,
    InvalidOfficerKey = 10,
    /// A presented quorum signer has not posted an attestor bond.
    SignerNotBonded = 11,
    /// The published public inputs do not bind to the signed nullifier/commitment.
    PublicInputBindingMismatch = 12,
    /// Refresh attempted on a frozen (disputed) or terminal credential.
    NotRefreshable = 13,
    /// Freeze/unfreeze attempted from a state that does not allow it.
    NotFreezable = 14,
    /// `settle_expired` on a credential that is not a live, past-expiry one.
    NotExpired = 15,
    /// `grant_challenge` given a non-contract / invalid address.
    InvalidChallengeKey = 16,
    /// `officer_revoke` on a credential that is not live (Active/Attested).
    NotRevocable = 17,
    /// `officer_reinstate` on anything other than a non-expired `Revoked`
    /// credential — in particular a `RevokedFraud` can never be reinstated.
    NotReinstatable = 18,
    /// `officer_unfreeze` on a credential frozen by an in-flight challenge.
    ChallengePending = 19,
    /// Public inputs [2..6] (issuer key, asset id, allowed root) do not match the
    /// canonical values pinned on-chain via `set_canonical_inputs`.
    CanonicalInputMismatch = 20,
    /// The asset id string exceeds 31 bytes and cannot encode as one field element.
    AssetIdTooLong = 21,
}

/// Emitted on every human officer override so the regulator trail distinguishes
/// human overrides from autonomous agent / fraud-layer actions. `officer` is the
/// multisig account hash that sent the deploy; the individual signing keys are
/// that account's own associated-keys record. `reason_hash` commits to the
/// off-chain justification without putting it (or any PII) on-chain.
#[odra::event]
pub struct OfficerAction {
    pub action: String,
    pub asset_id: String,
    /// The holder credential's formatted key (e.g. "account-hash-…").
    pub holder: String,
    pub officer: Address,
    pub ts: u64,
    pub reason_hash: [u8; 32],
}

/// Emitted when a credential is attested (or refreshed). The regulator trail's
/// per-credential history starts here — only commitments, never PII.
#[odra::event]
pub struct CredentialAttested {
    pub asset_id: String,
    pub holder: String,
    pub commitment: [u8; 32],
    pub nullifier: [u8; 32],
    pub expiry: u64,
    pub refresh: bool,
}

/// Emitted when a credential is revoked. `fraud` distinguishes a proven
/// fraudulent attestation (RevokedFraud, irreversible) from a sanctions/manual
/// revoke (Revoked, reinstatable) — the distinction the regulator trail must show.
#[odra::event]
pub struct CredentialRevoked {
    pub asset_id: String,
    pub holder: String,
    pub fraud: bool,
}

/// The CANONICAL signing payload. The off-chain quorum and this contract MUST
/// produce identical bytes. Layout (concatenation, no separators):
///
/// ```text
///   bytesrepr(asset_id : String)   // u32-LE length prefix + UTF-8 bytes
/// ++ bytesrepr(holder   : Key)      // 1 tag byte + variant bytes (33 for Account/Hash)
/// ++ commitment[32]                 // 32 raw bytes
/// ++ nullifier[32]                  // 32 raw bytes
/// ++ bytesrepr(expiry   : u64)      // 8 LE bytes
/// ```
pub fn canonical_message(
    asset_id: &str,
    holder: &Key,
    commitment: &[u8; 32],
    nullifier: &[u8; 32],
    expiry: u64,
) -> Bytes {
    let mut msg: Vec<u8> = Vec::new();
    msg.extend_from_slice(&asset_id.to_bytes().unwrap_or_default());
    msg.extend_from_slice(&holder.to_bytes().unwrap_or_default());
    msg.extend_from_slice(commitment);
    msg.extend_from_slice(nullifier);
    msg.extend_from_slice(&expiry.to_bytes().unwrap_or_default());
    Bytes::from(msg)
}

/// The exact reason `transfer_check` reports for a would-be transfer — the
/// diagnostic twin of `transfer_allowed`'s bool, for the issuer dashboard's "why
/// denied". `RecipientNotActive(reason)` is expressed as explicit `Recipient*`
/// variants (flat, for clean serialization + an unambiguous dashboard label).
#[odra::odra_type]
pub enum TransferReason {
    Allowed,
    AssetFrozen,
    SenderRevokedFraud,
    SenderRevokedSanctions,
    SenderFrozenByChallenge,
    SenderFrozenByOfficer,
    SenderExpired,
    SenderNotActive,
    RecipientRevokedFraud,
    RecipientRevokedSanctions,
    RecipientFrozenByChallenge,
    RecipientFrozenByOfficer,
    RecipientExpired,
    RecipientNotActive,
}

/// Why a single credential is not live (internal; mapped to a Sender*/Recipient*
/// `TransferReason`). `None` from `not_live_kind` means live (== is_active true).
enum NotLive {
    RevokedSanctions,
    RevokedFraud,
    FrozenByChallenge,
    FrozenByOfficer,
    Expired,
    NotActive,
}

/// Canonical circuit public values pinned on-chain (all 32-byte little-endian
/// field encodings, matching the `public_inputs` layout). Once set by the admin,
/// `attest` rejects any credential whose public inputs [2..6] differ — closing
/// the "malicious QUORUM_ROLE caller attests a proof for a forged issuer /
/// foreign asset / attacker-controlled jurisdiction root" gap on-chain.
#[odra::odra_type]
pub struct CanonicalInputs {
    pub issuer_ax: [u8; 32],
    pub issuer_ay: [u8; 32],
    pub allowed_root: [u8; 32],
}

/// The asset id string as the circuit encodes it: the UTF-8 bytes read as a
/// big-endian integer, emitted as a 32-byte little-endian field element. Only
/// defined for asset ids of at most 31 bytes (always below the BN254 modulus).
fn asset_id_le32(asset_id: &str) -> Option<[u8; 32]> {
    let bytes = asset_id.as_bytes();
    if bytes.is_empty() || bytes.len() > 31 {
        return None;
    }
    let mut out = [0u8; 32];
    for (i, b) in bytes.iter().rev().enumerate() {
        out[i] = *b;
    }
    Some(out)
}

#[odra::module(errors = RegistryError, events = [OfficerAction, CredentialAttested, CredentialRevoked])]
pub struct CredentialRegistry {
    /// Public keys whose signatures count toward the threshold.
    quorum_keys: Var<Vec<PublicKey>>,
    /// Minimum number of distinct valid quorum signatures required to attest.
    threshold: Var<u8>,
    /// Optimistic challenge window (seconds). An Attested credential becomes
    /// effectively Active once this elapses — evaluated at read time, no keeper.
    window_secs: Var<u64>,
    /// (asset_id, holder) -> Credential.
    credentials: Mapping<(String, Key), Credential>,
    /// nullifier -> the (asset, holder) slot it is bound to.
    nullifier_owner: Mapping<[u8; 32], NullifierBinding>,
    /// asset_id -> frozen flag (asset-level halt).
    frozen_assets: Mapping<String, bool>,
    /// quorum key -> has an attestor bond posted (mirrored from the Challenge
    /// contract). Only bonded keys may serve as signers at attest.
    bonded: Mapping<PublicKey, bool>,
    /// quorum key -> count of still-challengeable credentials it signed. The
    /// Challenge contract's withdraw guard requires this to be zero.
    outstanding: Mapping<PublicKey, u64>,
    /// Canonical issuer key / allowed root pinned on-chain (unset = legacy
    /// behavior: only nullifier/commitment are bound at attest).
    canonical_inputs: Var<CanonicalInputs>,
    access: SubModule<AccessControl>,
}

#[odra::module]
impl CredentialRegistry {
    /// Constructor. `officer` is a Casper `Key` (account) granted the officer role.
    pub fn init(
        &mut self,
        quorum_keys: Vec<PublicKey>,
        threshold: u8,
        window_secs: u64,
        officer: Key,
    ) {
        let env = self.env();
        if threshold == 0 || threshold as usize > quorum_keys.len() {
            env.revert(RegistryError::InvalidThreshold);
        }
        self.quorum_keys.set(quorum_keys);
        self.threshold.set(threshold);
        self.window_secs.set(window_secs);

        let deployer = env.caller();
        self.access.unchecked_grant_role(&DEFAULT_ADMIN_ROLE, &deployer);
        self.access.unchecked_grant_role(&QUORUM_ROLE, &deployer);

        let officer_addr =
            Address::try_from(officer).unwrap_or_revert_with(&env, RegistryError::InvalidOfficerKey);
        self.access.unchecked_grant_role(&OFFICER_ROLE, &officer_addr);
    }

    /// Write a quorum-attested credential. Requires QUORUM_ROLE; >= threshold
    /// distinct valid signatures from `quorum_keys` over the canonical payload,
    /// each signer BONDED; a fresh nullifier (or same-slot refresh of a non-frozen
    /// credential); a future expiry; and published `public_inputs` that bind to
    /// the signed `nullifier`/`commitment`. Persists the signer set and the
    /// published proof for later fraud adjudication.
    #[allow(clippy::too_many_arguments)]
    pub fn attest(
        &mut self,
        asset_id: String,
        holder: Key,
        commitment: [u8; 32],
        nullifier: [u8; 32],
        expiry: u64,
        proof: Bytes,
        public_inputs: Bytes,
        signers: Vec<PublicKey>,
        signatures: Vec<Bytes>,
    ) {
        let env = self.env();
        self.access.check_role(&QUORUM_ROLE, &env.caller());

        if signers.len() != signatures.len() {
            env.revert(RegistryError::SignerSignatureCountMismatch);
        }
        let now = env.get_block_time_secs();
        if expiry <= now {
            env.revert(RegistryError::ExpiryInPast);
        }

        // Published inputs must bind to the signed nullifier/commitment: the first
        // two of the six public inputs ARE the nullifier and commitment.
        let pi = public_inputs.as_slice();
        if pi.len() != 192 || pi[0..32] != nullifier[..] || pi[32..64] != commitment[..] {
            env.revert(RegistryError::PublicInputBindingMismatch);
        }

        // When canonical inputs are pinned, the remaining four public inputs must
        // match them exactly: issuer key, this asset's field encoding, and the
        // allowed-jurisdiction root. A proof for a forged issuer, a different
        // asset, or an attacker-chosen root is rejected ON-CHAIN even if a
        // QUORUM_ROLE caller signs it.
        if let Some(canon) = self.canonical_inputs.get() {
            let asset_le = asset_id_le32(&asset_id)
                .unwrap_or_else(|| env.revert(RegistryError::AssetIdTooLong));
            if pi[64..96] != canon.issuer_ax[..]
                || pi[96..128] != canon.issuer_ay[..]
                || pi[128..160] != asset_le[..]
                || pi[160..192] != canon.allowed_root[..]
            {
                env.revert(RegistryError::CanonicalInputMismatch);
            }
        }

        // Same-slot refresh is allowed; reuse by a different (asset, holder) is a
        // replay/Sybil attempt and is rejected.
        if let Some(b) = self.nullifier_owner.get(&nullifier) {
            if b.asset_id != asset_id || b.holder != holder {
                env.revert(RegistryError::NullifierReused);
            }
        }

        let message = canonical_message(&asset_id, &holder, &commitment, &nullifier, expiry);
        let quorum = self.quorum_keys.get_or_default();
        let threshold = self.threshold.get_or_default();

        let mut counted = vec![false; quorum.len()];
        let mut valid: u8 = 0;
        for i in 0..signers.len() {
            let signer = &signers[i];
            let qi = match quorum.iter().position(|k| k == signer) {
                Some(x) => x,
                None => env.revert(RegistryError::UnknownSigner),
            };
            if counted[qi] {
                env.revert(RegistryError::DuplicateSigner);
            }
            counted[qi] = true;
            if !self.bonded.get(signer).unwrap_or(false) {
                env.revert(RegistryError::SignerNotBonded);
            }
            if env.verify_signature(&message, &signatures[i], signer) {
                valid += 1;
            }
        }
        if valid < threshold {
            env.revert(RegistryError::ThresholdNotMet);
        }

        // Refresh: Frozen (in dispute) and RevokedFraud (terminal proven fraud)
        // can NOT be refreshed out of their state. A sanctions/manual Revoked IS
        // refreshable — the agent re-screens the holder clean and re-attests (the
        // OFAC re-onboard flow proven live on registry-v3). Only the fraud layer
        // is irreversible. The old signer set is released from the outstanding
        // count only if it was still counted; a Revoked/Expired old slot was
        // already released at revoke/settle time.
        let is_refresh = if let Some(old) = self.credentials.get(&(asset_id.clone(), holder)) {
            match old.status {
                Status::Frozen | Status::RevokedFraud => {
                    env.revert(RegistryError::NotRefreshable)
                }
                _ => {}
            }
            if is_challengeable(&old.status) {
                self.adjust_outstanding(&old.signers, false);
            }
            true
        } else {
            false
        };
        self.adjust_outstanding(&signers, true);

        self.nullifier_owner.set(
            &nullifier,
            NullifierBinding { asset_id: asset_id.clone(), holder },
        );
        self.credentials.set(
            &(asset_id.clone(), holder),
            Credential {
                status: Status::Attested,
                commitment,
                nullifier,
                expiry,
                attested_at: now,
                signers,
                proof,
                public_inputs,
                frozen_by_challenge: false,
            },
        );
        env.emit_event(CredentialAttested {
            asset_id,
            holder: holder.to_formatted_string(),
            commitment,
            nullifier,
            expiry,
            refresh: is_refresh,
        });
    }

    /// Immediate, fail-safe SANCTIONS revocation. Callable by quorum or officer.
    pub fn revoke(&mut self, asset_id: String, holder: Key) {
        let env = self.env();
        let caller = env.caller();
        let authorized = self.access.has_role(&QUORUM_ROLE, &caller)
            || self.access.has_role(&OFFICER_ROLE, &caller);
        if !authorized {
            env.revert(RegistryError::NotAuthorized);
        }
        let mut cred = self
            .credentials
            .get(&(asset_id.clone(), holder))
            .unwrap_or_revert_with(&env, RegistryError::CredentialNotFound);
        if is_challengeable(&cred.status) {
            self.adjust_outstanding(&cred.signers, false);
        }
        cred.status = Status::Revoked;
        self.credentials.set(&(asset_id.clone(), holder), cred);
        env.emit_event(CredentialRevoked {
            asset_id,
            holder: holder.to_formatted_string(),
            fraud: false,
        });
    }

    /// FRAUD revocation — the terminal state of a proven fraudulent attestation.
    /// CHALLENGE_ROLE ONLY: only the fraud-proof layer can produce `RevokedFraud`.
    /// The officer has no authority to produce, alter, or clear it (the fraud
    /// layer is orthogonal to officer authority).
    pub fn revoke_fraud(&mut self, asset_id: String, holder: Key) {
        let env = self.env();
        self.access.check_role(&CHALLENGE_ROLE, &env.caller());
        let mut cred = self
            .credentials
            .get(&(asset_id.clone(), holder))
            .unwrap_or_revert_with(&env, RegistryError::CredentialNotFound);
        if is_challengeable(&cred.status) {
            self.adjust_outstanding(&cred.signers, false);
        }
        cred.status = Status::RevokedFraud;
        self.credentials.set(&(asset_id.clone(), holder), cred);
        env.emit_event(CredentialRevoked {
            asset_id,
            holder: holder.to_formatted_string(),
            fraud: true,
        });
    }

    /// Freeze a live credential for a CHALLENGE dispute. CHALLENGE_ROLE ONLY —
    /// the officer's hold path is `officer_freeze`. Suspends expiry and transfers;
    /// only a live (Active/Attested) credential may be frozen (this also enforces
    /// first-challenge-wins at the registry). Marks the freeze as challenge-owned
    /// so the officer cannot unfreeze it out of the dispute.
    pub fn freeze(&mut self, asset_id: String, holder: Key) {
        let env = self.env();
        self.access.check_role(&CHALLENGE_ROLE, &env.caller());
        let mut cred = self
            .credentials
            .get(&(asset_id.clone(), holder))
            .unwrap_or_revert_with(&env, RegistryError::CredentialNotFound);
        match cred.status {
            Status::Active | Status::Attested => {}
            _ => env.revert(RegistryError::NotFreezable),
        }
        cred.status = Status::Frozen;
        cred.frozen_by_challenge = true;
        self.credentials.set(&(asset_id, holder), cred);
    }

    /// Unfreeze a CHALLENGE-frozen credential as a dispute resolves. CHALLENGE_ROLE
    /// ONLY (the resolver). Returns it to Active, OR to Expired if the original
    /// expiry elapsed while it was frozen (freeze suspends, never extends, expiry).
    pub fn unfreeze(&mut self, asset_id: String, holder: Key) {
        let env = self.env();
        self.access.check_role(&CHALLENGE_ROLE, &env.caller());
        let mut cred = self
            .credentials
            .get(&(asset_id.clone(), holder))
            .unwrap_or_revert_with(&env, RegistryError::CredentialNotFound);
        if cred.status != Status::Frozen {
            env.revert(RegistryError::NotFreezable);
        }
        let now = env.get_block_time_secs();
        if now >= cred.expiry {
            cred.status = Status::Expired;
            self.adjust_outstanding(&cred.signers, false);
        } else {
            cred.status = Status::Active;
        }
        cred.frozen_by_challenge = false;
        self.credentials.set(&(asset_id, holder), cred);
    }

    // ---- officer override (human-in-the-loop, OFFICER_ROLE) ----
    //
    // The OFFICER_ROLE holder is a Casper account configured as a weighted
    // multisig (M-of-N associated keys). Casper enforces the M-of-N threshold at
    // the ACCOUNT layer when that account sends a deploy — this contract does NOT
    // re-implement any signature/threshold checking. It trusts the account; the
    // account enforces the quorum. Every action emits an `OfficerAction` for the
    // regulator trail.

    /// Officer manual revocation: a live credential -> Revoked (ineligibility the
    /// agent missed). Cannot touch a non-live credential, so it can never produce
    /// or alter `RevokedFraud`.
    pub fn officer_revoke(&mut self, asset_id: String, holder: Key, reason_hash: [u8; 32]) {
        let env = self.env();
        self.access.check_role(&OFFICER_ROLE, &env.caller());
        let mut cred = self
            .credentials
            .get(&(asset_id.clone(), holder))
            .unwrap_or_revert_with(&env, RegistryError::CredentialNotFound);
        match cred.status {
            Status::Active | Status::Attested => {}
            _ => env.revert(RegistryError::NotRevocable),
        }
        self.adjust_outstanding(&cred.signers, false);
        cred.status = Status::Revoked;
        self.credentials.set(&(asset_id.clone(), holder), cred);
        self.emit_officer("officer_revoke", &asset_id, holder, reason_hash);
    }

    /// Officer reinstatement: reverse an agent false-positive. ONLY a non-expired
    /// `Revoked` (sanctions/manual) credential -> Active. HARD BOUNDARY: a
    /// `RevokedFraud` (cryptographically proven fraud) can NEVER be reinstated.
    pub fn officer_reinstate(&mut self, asset_id: String, holder: Key, reason_hash: [u8; 32]) {
        let env = self.env();
        self.access.check_role(&OFFICER_ROLE, &env.caller());
        let mut cred = self
            .credentials
            .get(&(asset_id.clone(), holder))
            .unwrap_or_revert_with(&env, RegistryError::CredentialNotFound);
        // Only a (manual/sanctions) Revoked may be reinstated; RevokedFraud and
        // every other state cannot.
        if cred.status != Status::Revoked {
            env.revert(RegistryError::NotReinstatable);
        }
        if env.get_block_time_secs() >= cred.expiry {
            env.revert(RegistryError::ExpiryInPast);
        }
        self.adjust_outstanding(&cred.signers, true);
        cred.status = Status::Active;
        self.credentials.set(&(asset_id.clone(), holder), cred);
        self.emit_officer("officer_reinstate", &asset_id, holder, reason_hash);
    }

    /// Officer hold: a live credential -> Frozen (human-initiated). Marked as a
    /// NON-challenge freeze so the officer may later unfreeze it.
    pub fn officer_freeze(&mut self, asset_id: String, holder: Key, reason_hash: [u8; 32]) {
        let env = self.env();
        self.access.check_role(&OFFICER_ROLE, &env.caller());
        let mut cred = self
            .credentials
            .get(&(asset_id.clone(), holder))
            .unwrap_or_revert_with(&env, RegistryError::CredentialNotFound);
        match cred.status {
            Status::Active | Status::Attested => {}
            _ => env.revert(RegistryError::NotFreezable),
        }
        cred.status = Status::Frozen;
        cred.frozen_by_challenge = false;
        self.credentials.set(&(asset_id.clone(), holder), cred);
        self.emit_officer("officer_freeze", &asset_id, holder, reason_hash);
    }

    /// Officer release of a human hold -> Active, or Expired if expiry elapsed
    /// under the freeze. HARD BOUNDARY: rejects a credential frozen by an in-flight
    /// challenge — a dispute resolves via the verifier, never officer fiat.
    pub fn officer_unfreeze(&mut self, asset_id: String, holder: Key, reason_hash: [u8; 32]) {
        let env = self.env();
        self.access.check_role(&OFFICER_ROLE, &env.caller());
        let mut cred = self
            .credentials
            .get(&(asset_id.clone(), holder))
            .unwrap_or_revert_with(&env, RegistryError::CredentialNotFound);
        if cred.status != Status::Frozen {
            env.revert(RegistryError::NotFreezable);
        }
        if cred.frozen_by_challenge {
            env.revert(RegistryError::ChallengePending);
        }
        if env.get_block_time_secs() >= cred.expiry {
            cred.status = Status::Expired;
            self.adjust_outstanding(&cred.signers, false);
        } else {
            cred.status = Status::Active;
        }
        self.credentials.set(&(asset_id.clone(), holder), cred);
        self.emit_officer("officer_unfreeze", &asset_id, holder, reason_hash);
    }

    /// Permissionless keeper: materialize a live credential whose expiry has
    /// elapsed into `Expired`, releasing its signers' outstanding count so their
    /// bonds become withdrawable. Frozen credentials are excluded (expiry is
    /// suspended during a dispute).
    pub fn settle_expired(&mut self, asset_id: String, holder: Key) {
        let env = self.env();
        let mut cred = self
            .credentials
            .get(&(asset_id.clone(), holder))
            .unwrap_or_revert_with(&env, RegistryError::CredentialNotFound);
        let now = env.get_block_time_secs();
        let live = matches!(cred.status, Status::Active | Status::Attested);
        if live && now >= cred.expiry {
            self.adjust_outstanding(&cred.signers, false);
            cred.status = Status::Expired;
            self.credentials.set(&(asset_id, holder), cred);
        } else {
            env.revert(RegistryError::NotExpired);
        }
    }

    /// Mark/unmark a quorum key as bonded. Authority of the Challenge contract.
    pub fn set_bonded(&mut self, key: PublicKey, bonded: bool) {
        self.access.check_role(&CHALLENGE_ROLE, &self.env().caller());
        self.bonded.set(&key, bonded);
    }

    /// Grant the Challenge contract the authority to freeze/unfreeze/revoke-fraud
    /// and manage bonds. Admin only.
    pub fn grant_challenge(&mut self, challenge: Address) {
        let env = self.env();
        self.access.check_role(&DEFAULT_ADMIN_ROLE, &env.caller());
        self.access.unchecked_grant_role(&CHALLENGE_ROLE, &challenge);
    }

    /// Grant OFFICER_ROLE to a Casper account (the configured M-of-N multisig).
    /// Admin only. The registry trusts this account hash; the account itself
    /// enforces its weighted-multisig threshold at the protocol layer.
    pub fn grant_officer(&mut self, officer: Key) {
        let env = self.env();
        self.access.check_role(&DEFAULT_ADMIN_ROLE, &env.caller());
        let addr =
            Address::try_from(officer).unwrap_or_revert_with(&env, RegistryError::InvalidOfficerKey);
        self.access.unchecked_grant_role(&OFFICER_ROLE, &addr);
    }

    /// Admin: pin the canonical circuit public values (issuer key + allowed
    /// jurisdiction root, 32-byte LE field encodings). Once set, every `attest`
    /// enforces public inputs [2..6] against them on-chain (the asset id is
    /// derived from the call's own `asset_id` argument). Part of the post-wiring
    /// hardening sequence, alongside role grants.
    pub fn set_canonical_inputs(
        &mut self,
        issuer_ax: [u8; 32],
        issuer_ay: [u8; 32],
        allowed_root: [u8; 32],
    ) {
        let env = self.env();
        self.access.check_role(&DEFAULT_ADMIN_ROLE, &env.caller());
        self.canonical_inputs.set(CanonicalInputs { issuer_ax, issuer_ay, allowed_root });
    }

    /// The pinned canonical inputs, if configured (read path for dashboards/audit).
    pub fn get_canonical_inputs(&self) -> Option<CanonicalInputs> {
        self.canonical_inputs.get()
    }

    /// Admin: claw back any `role` from `account` (e.g. an emergency revoke of
    /// CHALLENGE_ROLE from a compromised challenge contract). The caller must hold
    /// the role's admin (DEFAULT_ADMIN_ROLE for every Writ role).
    pub fn revoke_role(&mut self, role: [u8; 32], account: Key) {
        let env = self.env();
        let addr =
            Address::try_from(account).unwrap_or_revert_with(&env, RegistryError::InvalidOfficerKey);
        self.access.revoke_role(&role, &addr);
    }

    /// Renounce `role` from the CALLER itself — the mechanism by which the deployer
    /// drops deploy-time DEFAULT_ADMIN_ROLE / CHALLENGE_ROLE convenience so no single
    /// key retains that authority once the system is wired (admin → renounced, the
    /// challenge contract keeps CHALLENGE_ROLE, the multisig keeps OFFICER_ROLE).
    /// Runtime-required roles (QUORUM_ROLE coordination) are deliberately NOT
    /// renounced here.
    pub fn renounce_role(&mut self, role: [u8; 32]) {
        let caller = self.env().caller();
        self.access.renounce_role(&role, &caller);
    }

    // ---- reads the Challenge contract and dashboards consume ----

    pub fn is_bonded(&self, key: PublicKey) -> bool {
        self.bonded.get(&key).unwrap_or(false)
    }

    pub fn attestor_outstanding(&self, key: PublicKey) -> u64 {
        self.outstanding.get(&key).unwrap_or(0)
    }

    pub fn cred_signers(&self, asset_id: String, holder: Key) -> Vec<PublicKey> {
        self.credentials
            .get(&(asset_id, holder))
            .map(|c| c.signers)
            .unwrap_or_default()
    }

    pub fn cred_proof(&self, asset_id: String, holder: Key) -> Bytes {
        self.credentials
            .get(&(asset_id, holder))
            .map(|c| c.proof)
            .unwrap_or_default()
    }

    pub fn cred_public_inputs(&self, asset_id: String, holder: Key) -> Bytes {
        self.credentials
            .get(&(asset_id, holder))
            .map(|c| c.public_inputs)
            .unwrap_or_default()
    }

    /// THE read the transfer filter calls. True iff the holder may transact:
    /// status is Active, or Attested with the challenge window elapsed; and not
    /// past expiry; and not Revoked/RevokedFraud/Frozen/Expired/Pending.
    pub fn is_active(&self, asset_id: String, holder: Key) -> bool {
        let cred = match self.credentials.get(&(asset_id, holder)) {
            Some(c) => c,
            None => return false,
        };
        let now = self.env().get_block_time_secs();
        if now >= cred.expiry {
            return false;
        }
        match cred.status {
            Status::Active => true,
            Status::Attested => now >= cred.attested_at + self.window_secs.get_or_default(),
            _ => false,
        }
    }

    /// Dashboard read. Returns `None` when no credential exists (no PII on-chain).
    pub fn get_credential(&self, asset_id: String, holder: Key) -> Option<Credential> {
        self.credentials.get(&(asset_id, holder))
    }

    /// Officer-only: halt all transfers of an asset.
    pub fn freeze_asset(&mut self, asset_id: String) {
        self.access.check_role(&OFFICER_ROLE, &self.env().caller());
        self.frozen_assets.set(&asset_id, true);
    }

    /// Officer-only: lift an asset-level freeze.
    pub fn unfreeze_asset(&mut self, asset_id: String) {
        self.access.check_role(&OFFICER_ROLE, &self.env().caller());
        self.frozen_assets.set(&asset_id, false);
    }

    pub fn asset_frozen(&self, asset_id: String) -> bool {
        self.frozen_assets.get(&asset_id).unwrap_or(false)
    }

    /// The transfer gate the patched cep-78 filter delegates to. Deny if: the
    /// asset is frozen; OR a credentialed `from` is not live; OR `to` is not active.
    ///
    /// The sender side routes EVERY non-live status through deny: a holder whose
    /// credential is Revoked, RevokedFraud, Frozen (officer OR challenge), Expired,
    /// Pending, or still in the challenge window may not move the asset. This is
    /// `!is_active(from)` rather than an explicit denylist, so newly-added statuses
    /// (e.g. RevokedFraud) and lapses (Expired) can never slip through. The mint
    /// sentinel and holders with no credential are not sender-gated; the recipient
    /// must always be active.
    pub fn transfer_allowed(&self, asset_id: String, from: Key, to: Key) -> bool {
        if self.asset_frozen(asset_id.clone()) {
            return false;
        }
        if from != mint_sentinel()
            && self.credentials.get(&(asset_id.clone(), from)).is_some()
            && !self.is_active(asset_id.clone(), from)
        {
            return false;
        }
        self.is_active(asset_id, to)
    }

    /// Read-only diagnostic twin of `transfer_allowed`: returns the EXACT REASON a
    /// would-be transfer is allowed or denied (the issuer dashboard's "why
    /// denied"). It mirrors `transfer_allowed`'s logic exactly — it is a diagnostic,
    /// never a second source of truth: `transfer_check(..) == Allowed` iff
    /// `transfer_allowed(..) == true` for every state. Pure read, no state change.
    pub fn transfer_check(&self, asset_id: String, from: Key, to: Key) -> TransferReason {
        if self.asset_frozen(asset_id.clone()) {
            return TransferReason::AssetFrozen;
        }
        // Sender: only gated when it holds a credential that is not live (a holder
        // with no credential — e.g. the mint sentinel — is not sender-gated).
        if from != mint_sentinel() && self.credentials.get(&(asset_id.clone(), from)).is_some() {
            if let Some(kind) = self.not_live_kind(&asset_id, from) {
                return match kind {
                    NotLive::RevokedFraud => TransferReason::SenderRevokedFraud,
                    NotLive::RevokedSanctions => TransferReason::SenderRevokedSanctions,
                    NotLive::FrozenByChallenge => TransferReason::SenderFrozenByChallenge,
                    NotLive::FrozenByOfficer => TransferReason::SenderFrozenByOfficer,
                    NotLive::Expired => TransferReason::SenderExpired,
                    NotLive::NotActive => TransferReason::SenderNotActive,
                };
            }
        }
        // Recipient: must be live.
        match self.not_live_kind(&asset_id, to) {
            None => TransferReason::Allowed,
            Some(NotLive::RevokedFraud) => TransferReason::RecipientRevokedFraud,
            Some(NotLive::RevokedSanctions) => TransferReason::RecipientRevokedSanctions,
            Some(NotLive::FrozenByChallenge) => TransferReason::RecipientFrozenByChallenge,
            Some(NotLive::FrozenByOfficer) => TransferReason::RecipientFrozenByOfficer,
            Some(NotLive::Expired) => TransferReason::RecipientExpired,
            Some(NotLive::NotActive) => TransferReason::RecipientNotActive,
        }
    }
}

impl CredentialRegistry {
    /// The liveness reason for one credential — `None` iff `is_active` is true, so
    /// `transfer_check` and `transfer_allowed` cannot diverge.
    fn not_live_kind(&self, asset_id: &str, holder: Key) -> Option<NotLive> {
        let cred = match self.credentials.get(&(asset_id.to_string(), holder)) {
            Some(c) => c,
            None => return Some(NotLive::NotActive),
        };
        match cred.status {
            Status::Revoked => return Some(NotLive::RevokedSanctions),
            Status::RevokedFraud => return Some(NotLive::RevokedFraud),
            Status::Frozen => {
                return Some(if cred.frozen_by_challenge {
                    NotLive::FrozenByChallenge
                } else {
                    NotLive::FrozenByOfficer
                })
            }
            Status::Expired => return Some(NotLive::Expired),
            Status::Pending => return Some(NotLive::NotActive),
            Status::Active | Status::Attested => {}
        }
        let now = self.env().get_block_time_secs();
        if now >= cred.expiry {
            return Some(NotLive::Expired);
        }
        match cred.status {
            Status::Active => None,
            Status::Attested if now >= cred.attested_at + self.window_secs.get_or_default() => None,
            _ => Some(NotLive::NotActive),
        }
    }

    fn emit_officer(&self, action: &str, asset_id: &str, holder: Key, reason_hash: [u8; 32]) {
        let env = self.env();
        env.emit_event(OfficerAction {
            action: String::from(action),
            asset_id: String::from(asset_id),
            holder: holder.to_formatted_string(),
            officer: env.caller(),
            ts: env.get_block_time_secs(),
            reason_hash,
        });
    }

    fn adjust_outstanding(&mut self, signers: &[PublicKey], up: bool) {
        for s in signers {
            let cur = self.outstanding.get(s).unwrap_or(0);
            let next = if up { cur + 1 } else { cur.saturating_sub(1) };
            self.outstanding.set(s, next);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use odra::host::{Deployer, HostEnv};

    const ASSET: &str = "writ-bond-001";
    const WINDOW: u64 = 3600;
    const FAR_FUTURE: u64 = 32_503_680_000; // ~year 3000 (unix seconds)

    fn key_of(env: &HostEnv, idx: usize) -> Key {
        Key::Account(env.public_key(&env.get_account(idx)).to_account_hash())
    }

    /// Published public inputs for a (commitment, nullifier): the first two of the
    /// six are the nullifier and commitment; the remaining four are placeholders
    /// (the registry only binds the first two; the verifier checks all six).
    fn pub_inputs(commit: &[u8; 32], null: &[u8; 32]) -> Bytes {
        let mut v: Vec<u8> = Vec::with_capacity(192);
        v.extend_from_slice(null);
        v.extend_from_slice(commit);
        v.extend_from_slice(&[0u8; 128]);
        Bytes::from(v)
    }
    fn dummy_proof() -> Bytes {
        Bytes::from(vec![0u8; 256])
    }

    /// Deploy with quorum = accounts {0,1,2}, threshold 2, officer = account 3.
    /// Grants account 0 the CHALLENGE_ROLE (in production the Challenge CONTRACT
    /// holds it) so tests can bond the quorum keys, then bonds {0,1,2}.
    fn setup() -> (HostEnv, CredentialRegistryHostRef) {
        let env = odra_test::env();
        env.set_caller(env.get_account(0));
        let quorum_keys = vec![
            env.public_key(&env.get_account(0)),
            env.public_key(&env.get_account(1)),
            env.public_key(&env.get_account(2)),
        ];
        let mut registry = CredentialRegistry::deploy(
            &env,
            CredentialRegistryInitArgs {
                quorum_keys,
                threshold: 2,
                window_secs: WINDOW,
                officer: key_of(&env, 3),
            },
        );
        registry.grant_challenge(env.get_account(0));
        for i in 0..3 {
            registry.set_bonded(env.public_key(&env.get_account(i)), true);
        }
        (env, registry)
    }

    fn sign_with(
        env: &HostEnv,
        accounts: &[usize],
        asset: &str,
        holder: &Key,
        commitment: &[u8; 32],
        nullifier: &[u8; 32],
        expiry: u64,
    ) -> (Vec<PublicKey>, Vec<Bytes>) {
        let msg = canonical_message(asset, holder, commitment, nullifier, expiry);
        let mut signers = Vec::new();
        let mut sigs = Vec::new();
        for &i in accounts {
            let acc = env.get_account(i);
            signers.push(env.public_key(&acc));
            sigs.push(env.sign_message(&msg, &acc));
        }
        (signers, sigs)
    }

    /// Full attest with published proof material bound to (commit, null).
    #[allow(clippy::too_many_arguments)]
    fn do_attest(
        registry: &mut CredentialRegistryHostRef,
        asset: &str,
        holder: Key,
        commit: [u8; 32],
        null: [u8; 32],
        expiry: u64,
        signers: Vec<PublicKey>,
        sigs: Vec<Bytes>,
    ) {
        registry.attest(
            asset.into(),
            holder,
            commit,
            null,
            expiry,
            dummy_proof(),
            pub_inputs(&commit, &null),
            signers,
            sigs,
        );
    }

    // ---- role revocation / renounce: institutional-grade final state ----

    #[test]
    fn renounce_admin_and_challenge_keeps_runtime_working() {
        let (env, mut registry) = setup();
        let deployer = env.get_account(0);
        let challenge_contract = env.get_account(8); // stand-in for the Challenge CONTRACT
        let officer = env.get_account(3);

        // Production wiring: CHALLENGE_ROLE -> the challenge contract (not the deployer).
        registry.grant_challenge(challenge_contract);

        // Deployer drops deploy-time convenience: CHALLENGE_ROLE, then DEFAULT_ADMIN_ROLE.
        registry.renounce_role(CHALLENGE_ROLE);
        registry.renounce_role(DEFAULT_ADMIN_ROLE);

        // (1) attest STILL works — the deployer keeps QUORUM_ROLE (the coordinator the
        // runtime needs); renounce removed only admin/challenge convenience.
        let holder = key_of(&env, 7);
        let (commit, null) = ([5u8; 32], [6u8; 32]);
        let (signers, sigs) = sign_with(&env, &[0, 1], ASSET, &holder, &commit, &null, FAR_FUTURE);
        do_attest(&mut registry, ASSET, holder, commit, null, FAR_FUTURE, signers, sigs);
        env.advance_block_time((WINDOW + 1) * 1000);
        assert!(registry.is_active(ASSET.into(), holder), "attest works post-renounce");

        // (2) the challenge CONTRACT still freezes/unfreezes (CHALLENGE_ROLE intact there).
        env.set_caller(challenge_contract);
        registry.freeze(ASSET.into(), holder);
        assert!(!registry.is_active(ASSET.into(), holder));
        registry.unfreeze(ASSET.into(), holder);
        assert!(registry.is_active(ASSET.into(), holder));

        // (3) the officer (multisig acct) still revokes/reinstates (OFFICER_ROLE intact).
        env.set_caller(officer);
        registry.officer_revoke(ASSET.into(), holder, [0u8; 32]);
        assert_eq!(
            registry.get_credential(ASSET.into(), holder).unwrap().status,
            Status::Revoked
        );
        registry.officer_reinstate(ASSET.into(), holder, [0u8; 32]);
        assert!(registry.is_active(ASSET.into(), holder));

        // (4) the deployer (admin + challenge renounced) can NO LONGER grant or bond.
        env.set_caller(deployer);
        assert!(
            registry.try_grant_challenge(env.get_account(9)).is_err(),
            "admin renounced -> grant_challenge reverts"
        );
        assert!(
            registry
                .try_set_bonded(env.public_key(&env.get_account(0)), false)
                .is_err(),
            "CHALLENGE_ROLE renounced -> set_bonded reverts"
        );
    }

    #[test]
    fn admin_revokes_challenge_role_from_a_holder() {
        let (env, mut registry) = setup();
        let challenge_contract = env.get_account(8);
        registry.grant_challenge(challenge_contract);
        // Admin claws CHALLENGE_ROLE back from the contract.
        registry.revoke_role(CHALLENGE_ROLE, challenge_contract.into());
        // The contract can no longer freeze.
        env.set_caller(challenge_contract);
        let holder = key_of(&env, 7);
        assert!(
            registry.try_freeze(ASSET.into(), holder).is_err(),
            "revoked CHALLENGE_ROLE -> freeze reverts"
        );
    }

    #[test]
    fn non_admin_cannot_revoke_role() {
        let (env, mut registry) = setup();
        env.set_caller(env.get_account(5)); // a nobody
        assert!(
            registry
                .try_revoke_role(OFFICER_ROLE, key_of(&env, 3))
                .is_err(),
            "non-admin revoke_role reverts"
        );
    }

    #[test]
    fn attest_then_active_after_window() {
        let (env, mut registry) = setup();
        let holder = key_of(&env, 7);
        let (commit, null) = ([1u8; 32], [2u8; 32]);
        let (signers, sigs) = sign_with(&env, &[0, 1], ASSET, &holder, &commit, &null, FAR_FUTURE);
        do_attest(&mut registry, ASSET, holder, commit, null, FAR_FUTURE, signers, sigs);

        let cred = registry.get_credential(ASSET.into(), holder).unwrap();
        assert_eq!(cred.status, Status::Attested);
        assert!(!registry.is_active(ASSET.into(), holder));
        env.advance_block_time((WINDOW + 1) * 1000);
        assert!(registry.is_active(ASSET.into(), holder));
    }

    #[test]
    fn signers_persisted_on_credential() {
        let (env, mut registry) = setup();
        let holder = key_of(&env, 7);
        let (commit, null) = ([1u8; 32], [0x30; 32]);
        let (signers, sigs) = sign_with(&env, &[0, 2], ASSET, &holder, &commit, &null, FAR_FUTURE);
        do_attest(&mut registry, ASSET, holder, commit, null, FAR_FUTURE, signers, sigs);
        let cred = registry.get_credential(ASSET.into(), holder).unwrap();
        assert_eq!(
            cred.signers,
            vec![
                env.public_key(&env.get_account(0)),
                env.public_key(&env.get_account(2))
            ]
        );
        assert_eq!(registry.cred_signers(ASSET.into(), holder).len(), 2);
        // each signer now has one outstanding (challengeable) credential
        assert_eq!(
            registry.attestor_outstanding(env.public_key(&env.get_account(0))),
            1
        );
        assert_eq!(
            registry.attestor_outstanding(env.public_key(&env.get_account(2))),
            1
        );
    }

    #[test]
    fn unbonded_signer_rejected() {
        let (env, mut registry) = setup();
        // un-bond account 1
        registry.set_bonded(env.public_key(&env.get_account(1)), false);
        let holder = key_of(&env, 7);
        let (commit, null) = ([1u8; 32], [0x31; 32]);
        let (signers, sigs) = sign_with(&env, &[0, 1], ASSET, &holder, &commit, &null, FAR_FUTURE);
        assert_eq!(
            registry
                .try_attest(
                    ASSET.into(),
                    holder,
                    commit,
                    null,
                    FAR_FUTURE,
                    dummy_proof(),
                    pub_inputs(&commit, &null),
                    signers,
                    sigs
                )
                .unwrap_err(),
            RegistryError::SignerNotBonded.into()
        );
    }

    #[test]
    fn public_input_binding_enforced() {
        let (env, mut registry) = setup();
        let holder = key_of(&env, 7);
        let (commit, null) = ([1u8; 32], [0x32; 32]);
        let (signers, sigs) = sign_with(&env, &[0, 1], ASSET, &holder, &commit, &null, FAR_FUTURE);
        // public inputs whose first 32 bytes are NOT the nullifier
        let bad = pub_inputs(&commit, &[0xAB; 32]);
        assert_eq!(
            registry
                .try_attest(
                    ASSET.into(),
                    holder,
                    commit,
                    null,
                    FAR_FUTURE,
                    dummy_proof(),
                    bad,
                    signers,
                    sigs
                )
                .unwrap_err(),
            RegistryError::PublicInputBindingMismatch.into()
        );
    }

    #[test]
    fn bad_signature_does_not_count() {
        let (env, mut registry) = setup();
        let holder = key_of(&env, 7);
        let (commit, null) = ([3u8; 32], [4u8; 32]);
        let good = canonical_message(ASSET, &holder, &commit, &null, FAR_FUTURE);
        let tampered = canonical_message(ASSET, &holder, &commit, &[9u8; 32], FAR_FUTURE);
        let signers = vec![
            env.public_key(&env.get_account(0)),
            env.public_key(&env.get_account(1)),
        ];
        let sigs = vec![
            env.sign_message(&good, &env.get_account(0)),
            env.sign_message(&tampered, &env.get_account(1)),
        ];
        assert_eq!(
            registry
                .try_attest(
                    ASSET.into(),
                    holder,
                    commit,
                    null,
                    FAR_FUTURE,
                    dummy_proof(),
                    pub_inputs(&commit, &null),
                    signers,
                    sigs
                )
                .unwrap_err(),
            RegistryError::ThresholdNotMet.into()
        );
    }

    #[test]
    fn sub_threshold_rejected() {
        let (env, mut registry) = setup();
        let holder = key_of(&env, 7);
        let (commit, null) = ([5u8; 32], [6u8; 32]);
        let (signers, sigs) = sign_with(&env, &[0], ASSET, &holder, &commit, &null, FAR_FUTURE);
        assert_eq!(
            registry
                .try_attest(
                    ASSET.into(),
                    holder,
                    commit,
                    null,
                    FAR_FUTURE,
                    dummy_proof(),
                    pub_inputs(&commit, &null),
                    signers,
                    sigs
                )
                .unwrap_err(),
            RegistryError::ThresholdNotMet.into()
        );
    }

    #[test]
    fn unknown_signer_rejected() {
        let (env, mut registry) = setup();
        let holder = key_of(&env, 7);
        let (commit, null) = ([7u8; 32], [8u8; 32]);
        let (signers, sigs) = sign_with(&env, &[0, 5], ASSET, &holder, &commit, &null, FAR_FUTURE);
        assert_eq!(
            registry
                .try_attest(
                    ASSET.into(),
                    holder,
                    commit,
                    null,
                    FAR_FUTURE,
                    dummy_proof(),
                    pub_inputs(&commit, &null),
                    signers,
                    sigs
                )
                .unwrap_err(),
            RegistryError::UnknownSigner.into()
        );
    }

    #[test]
    fn duplicate_signer_rejected() {
        let (env, mut registry) = setup();
        let holder = key_of(&env, 7);
        let (commit, null) = ([10u8; 32], [11u8; 32]);
        let (signers, sigs) = sign_with(&env, &[0, 0], ASSET, &holder, &commit, &null, FAR_FUTURE);
        assert_eq!(
            registry
                .try_attest(
                    ASSET.into(),
                    holder,
                    commit,
                    null,
                    FAR_FUTURE,
                    dummy_proof(),
                    pub_inputs(&commit, &null),
                    signers,
                    sigs
                )
                .unwrap_err(),
            RegistryError::DuplicateSigner.into()
        );
    }

    #[test]
    fn reused_nullifier_rejected() {
        let (env, mut registry) = setup();
        let holder = key_of(&env, 7);
        let null = [12u8; 32];
        let (s1, g1) = sign_with(&env, &[0, 1], ASSET, &holder, &[1u8; 32], &null, FAR_FUTURE);
        do_attest(&mut registry, ASSET, holder, [1u8; 32], null, FAR_FUTURE, s1, g1);
        let holder2 = key_of(&env, 8);
        let (s2, g2) = sign_with(&env, &[0, 1], ASSET, &holder2, &[1u8; 32], &null, FAR_FUTURE);
        assert_eq!(
            registry
                .try_attest(
                    ASSET.into(),
                    holder2,
                    [1u8; 32],
                    null,
                    FAR_FUTURE,
                    dummy_proof(),
                    pub_inputs(&[1u8; 32], &null),
                    s2,
                    g2
                )
                .unwrap_err(),
            RegistryError::NullifierReused.into()
        );
    }

    #[test]
    fn same_slot_refresh_allowed() {
        let (env, mut registry) = setup();
        let holder = key_of(&env, 7);
        let null = [20u8; 32];
        let (s1, g1) = sign_with(&env, &[0, 1], ASSET, &holder, &[1u8; 32], &null, FAR_FUTURE);
        do_attest(&mut registry, ASSET, holder, [1u8; 32], null, FAR_FUTURE, s1, g1);
        let new_expiry = FAR_FUTURE + 1000;
        let (s2, g2) = sign_with(&env, &[0, 1], ASSET, &holder, &[1u8; 32], &null, new_expiry);
        do_attest(&mut registry, ASSET, holder, [1u8; 32], null, new_expiry, s2, g2);
        assert_eq!(
            registry.get_credential(ASSET.into(), holder).unwrap().expiry,
            new_expiry
        );
        // refresh must NOT double-count outstanding (same signer set)
        assert_eq!(
            registry.attestor_outstanding(env.public_key(&env.get_account(0))),
            1
        );
    }

    #[test]
    fn cross_asset_replay_rejected() {
        let (env, mut registry) = setup();
        let holder = key_of(&env, 7);
        let null = [21u8; 32];
        let (s1, g1) = sign_with(&env, &[0, 1], ASSET, &holder, &[1u8; 32], &null, FAR_FUTURE);
        do_attest(&mut registry, ASSET, holder, [1u8; 32], null, FAR_FUTURE, s1, g1);
        let other = "writ-other-asset";
        let (s2, g2) = sign_with(&env, &[0, 1], other, &holder, &[1u8; 32], &null, FAR_FUTURE);
        assert_eq!(
            registry
                .try_attest(
                    other.into(),
                    holder,
                    [1u8; 32],
                    null,
                    FAR_FUTURE,
                    dummy_proof(),
                    pub_inputs(&[1u8; 32], &null),
                    s2,
                    g2
                )
                .unwrap_err(),
            RegistryError::NullifierReused.into()
        );
    }

    #[test]
    fn expired_expiry_rejected() {
        let (env, mut registry) = setup();
        env.advance_block_time(5_000);
        let holder = key_of(&env, 7);
        let (commit, null) = ([1u8; 32], [13u8; 32]);
        let (signers, sigs) = sign_with(&env, &[0, 1], ASSET, &holder, &commit, &null, 1);
        assert_eq!(
            registry
                .try_attest(
                    ASSET.into(),
                    holder,
                    commit,
                    null,
                    1,
                    dummy_proof(),
                    pub_inputs(&commit, &null),
                    signers,
                    sigs
                )
                .unwrap_err(),
            RegistryError::ExpiryInPast.into()
        );
    }

    #[test]
    fn revoke_blocks_active_and_clears_outstanding() {
        let (env, mut registry) = setup();
        let holder = key_of(&env, 7);
        let (commit, null) = ([1u8; 32], [14u8; 32]);
        let (signers, sigs) = sign_with(&env, &[0, 1], ASSET, &holder, &commit, &null, FAR_FUTURE);
        do_attest(&mut registry, ASSET, holder, commit, null, FAR_FUTURE, signers, sigs);
        env.advance_block_time((WINDOW + 1) * 1000);
        assert!(registry.is_active(ASSET.into(), holder));
        registry.revoke(ASSET.into(), holder);
        assert!(!registry.is_active(ASSET.into(), holder));
        assert_eq!(
            registry.get_credential(ASSET.into(), holder).unwrap().status,
            Status::Revoked
        );
        assert_eq!(
            registry.attestor_outstanding(env.public_key(&env.get_account(0))),
            0
        );
    }

    #[test]
    fn revoke_fraud_status_distinct() {
        let (env, mut registry) = setup();
        let holder = key_of(&env, 7);
        let (commit, null) = ([1u8; 32], [0x33; 32]);
        let (signers, sigs) = sign_with(&env, &[0, 1], ASSET, &holder, &commit, &null, FAR_FUTURE);
        do_attest(&mut registry, ASSET, holder, commit, null, FAR_FUTURE, signers, sigs);
        // account 0 holds CHALLENGE_ROLE in tests
        registry.revoke_fraud(ASSET.into(), holder);
        assert_eq!(
            registry.get_credential(ASSET.into(), holder).unwrap().status,
            Status::RevokedFraud
        );
        assert!(!registry.is_active(ASSET.into(), holder));
        assert_eq!(
            registry.attestor_outstanding(env.public_key(&env.get_account(0))),
            0
        );
    }

    #[test]
    fn refresh_rejected_when_frozen() {
        let (env, mut registry) = setup();
        let holder = key_of(&env, 7);
        let null = [0x34; 32];
        let (s1, g1) = sign_with(&env, &[0, 1], ASSET, &holder, &[1u8; 32], &null, FAR_FUTURE);
        do_attest(&mut registry, ASSET, holder, [1u8; 32], null, FAR_FUTURE, s1, g1);
        registry.freeze(ASSET.into(), holder); // account 0 has CHALLENGE_ROLE
        let (s2, g2) = sign_with(&env, &[0, 1], ASSET, &holder, &[1u8; 32], &null, FAR_FUTURE + 1);
        assert_eq!(
            registry
                .try_attest(
                    ASSET.into(),
                    holder,
                    [1u8; 32],
                    null,
                    FAR_FUTURE + 1,
                    dummy_proof(),
                    pub_inputs(&[1u8; 32], &null),
                    s2,
                    g2
                )
                .unwrap_err(),
            RegistryError::NotRefreshable.into()
        );
    }

    /// The OFAC re-onboard flow: a sanctions Revoked credential IS refreshable —
    /// the agent re-screens the holder clean and re-attests the same slot, which
    /// brings it back to Active. (RevokedFraud is NOT refreshable — next test.)
    #[test]
    fn refresh_from_revoked_reonboards() {
        let (env, mut registry) = setup();
        let holder = key_of(&env, 7);
        let null = [0x37; 32];
        let (s1, g1) = sign_with(&env, &[0, 1], ASSET, &holder, &[1u8; 32], &null, FAR_FUTURE);
        do_attest(&mut registry, ASSET, holder, [1u8; 32], null, FAR_FUTURE, s1, g1);
        registry.revoke(ASSET.into(), holder); // OFAC hit (account 0 = quorum)
        assert_eq!(
            registry.get_credential(ASSET.into(), holder).unwrap().status,
            Status::Revoked
        );
        assert_eq!(
            registry.attestor_outstanding(env.public_key(&env.get_account(0))),
            0
        );
        // re-screened clean -> re-attest the same slot
        let (s2, g2) = sign_with(&env, &[0, 1], ASSET, &holder, &[1u8; 32], &null, FAR_FUTURE + 1);
        do_attest(&mut registry, ASSET, holder, [1u8; 32], null, FAR_FUTURE + 1, s2, g2);
        assert_eq!(
            registry.get_credential(ASSET.into(), holder).unwrap().status,
            Status::Attested
        );
        // outstanding re-incremented exactly once (not double-counted)
        assert_eq!(
            registry.attestor_outstanding(env.public_key(&env.get_account(0))),
            1
        );
        env.advance_block_time((WINDOW + 1) * 1000); // window elapses -> active
        assert!(registry.is_active(ASSET.into(), holder));
    }

    #[test]
    fn refresh_rejected_when_fraud() {
        let (env, mut registry) = setup();
        let holder = key_of(&env, 7);
        let null = [0x38; 32];
        let (s1, g1) = sign_with(&env, &[0, 1], ASSET, &holder, &[1u8; 32], &null, FAR_FUTURE);
        do_attest(&mut registry, ASSET, holder, [1u8; 32], null, FAR_FUTURE, s1, g1);
        registry.revoke_fraud(ASSET.into(), holder); // account 0 = CHALLENGE_ROLE
        let (s2, g2) = sign_with(&env, &[0, 1], ASSET, &holder, &[1u8; 32], &null, FAR_FUTURE + 1);
        assert_eq!(
            registry
                .try_attest(
                    ASSET.into(),
                    holder,
                    [1u8; 32],
                    null,
                    FAR_FUTURE + 1,
                    dummy_proof(),
                    pub_inputs(&[1u8; 32], &null),
                    s2,
                    g2
                )
                .unwrap_err(),
            RegistryError::NotRefreshable.into()
        );
    }

    #[test]
    fn freeze_blocks_then_unfreeze_restores() {
        let (env, mut registry) = setup();
        let holder = key_of(&env, 7);
        let (commit, null) = ([1u8; 32], [15u8; 32]);
        let (signers, sigs) = sign_with(&env, &[0, 1], ASSET, &holder, &commit, &null, FAR_FUTURE);
        do_attest(&mut registry, ASSET, holder, commit, null, FAR_FUTURE, signers, sigs);
        env.advance_block_time((WINDOW + 1) * 1000);
        assert!(registry.is_active(ASSET.into(), holder));

        env.set_caller(env.get_account(0)); // challenge role
        registry.freeze(ASSET.into(), holder);
        assert!(!registry.is_active(ASSET.into(), holder));
        registry.unfreeze(ASSET.into(), holder);
        assert!(registry.is_active(ASSET.into(), holder));
        assert_eq!(
            registry.get_credential(ASSET.into(), holder).unwrap().status,
            Status::Active
        );
    }

    #[test]
    fn expiry_under_freeze_lands_expired() {
        let (env, mut registry) = setup();
        let holder = key_of(&env, 7);
        let near: u64 = 10_000; // 10_000s expiry
        let (commit, null) = ([1u8; 32], [0x35; 32]);
        let (signers, sigs) = sign_with(&env, &[0, 1], ASSET, &holder, &commit, &null, near);
        do_attest(&mut registry, ASSET, holder, commit, null, near, signers, sigs);
        env.set_caller(env.get_account(0)); // challenge role freezes while live
        registry.freeze(ASSET.into(), holder);
        // clock elapses PAST expiry while frozen
        env.advance_block_time(near * 1000 + 1000);
        registry.unfreeze(ASSET.into(), holder);
        assert_eq!(
            registry.get_credential(ASSET.into(), holder).unwrap().status,
            Status::Expired
        );
        assert!(!registry.is_active(ASSET.into(), holder));
    }

    #[test]
    fn settle_expired_decrements_outstanding() {
        let (env, mut registry) = setup();
        let holder = key_of(&env, 7);
        let near: u64 = 10_000;
        let (commit, null) = ([1u8; 32], [0x36; 32]);
        let (signers, sigs) = sign_with(&env, &[0, 1], ASSET, &holder, &commit, &null, near);
        do_attest(&mut registry, ASSET, holder, commit, null, near, signers, sigs);
        assert_eq!(
            registry.attestor_outstanding(env.public_key(&env.get_account(0))),
            1
        );
        env.advance_block_time(near * 1000 + 1000);
        registry.settle_expired(ASSET.into(), holder);
        assert_eq!(
            registry.get_credential(ASSET.into(), holder).unwrap().status,
            Status::Expired
        );
        assert_eq!(
            registry.attestor_outstanding(env.public_key(&env.get_account(0))),
            0
        );
    }

    #[test]
    fn rbac_non_quorum_cannot_attest() {
        let (env, mut registry) = setup();
        let holder = key_of(&env, 7);
        let (commit, null) = ([1u8; 32], [16u8; 32]);
        let (signers, sigs) = sign_with(&env, &[0, 1], ASSET, &holder, &commit, &null, FAR_FUTURE);
        env.set_caller(env.get_account(9));
        assert!(registry
            .try_attest(
                ASSET.into(),
                holder,
                commit,
                null,
                FAR_FUTURE,
                dummy_proof(),
                pub_inputs(&commit, &null),
                signers,
                sigs
            )
            .is_err());
    }

    #[test]
    fn rbac_non_officer_cannot_freeze() {
        let (env, mut registry) = setup();
        let holder = key_of(&env, 7);
        let (commit, null) = ([1u8; 32], [17u8; 32]);
        let (signers, sigs) = sign_with(&env, &[0, 1], ASSET, &holder, &commit, &null, FAR_FUTURE);
        do_attest(&mut registry, ASSET, holder, commit, null, FAR_FUTURE, signers, sigs);
        env.set_caller(env.get_account(9));
        assert!(registry.try_freeze(ASSET.into(), holder).is_err());
    }

    #[test]
    fn grant_challenge_requires_admin() {
        let (env, mut registry) = setup();
        env.set_caller(env.get_account(9));
        assert!(registry.try_grant_challenge(env.get_account(9)).is_err());
    }

    fn attest_holder(
        env: &HostEnv,
        registry: &mut CredentialRegistryHostRef,
        holder: Key,
        null: [u8; 32],
    ) {
        let (s, g) = sign_with(env, &[0, 1], ASSET, &holder, &[1u8; 32], &null, FAR_FUTURE);
        do_attest(registry, ASSET, holder, [1u8; 32], null, FAR_FUTURE, s, g);
    }

    #[test]
    fn transfer_allowed_all_clear() {
        let (env, mut registry) = setup();
        let (to, from) = (key_of(&env, 7), key_of(&env, 8));
        attest_holder(&env, &mut registry, to, [0x40; 32]);
        env.advance_block_time((WINDOW + 1) * 1000);
        assert!(registry.transfer_allowed(ASSET.into(), from, to));
    }

    #[test]
    fn transfer_allowed_recipient_inactive() {
        let (env, registry) = setup();
        let (to, from) = (key_of(&env, 7), key_of(&env, 8));
        assert!(!registry.transfer_allowed(ASSET.into(), from, to));
    }

    #[test]
    fn transfer_allowed_sender_revoked() {
        let (env, mut registry) = setup();
        let (to, from) = (key_of(&env, 7), key_of(&env, 8));
        attest_holder(&env, &mut registry, to, [0x41; 32]);
        attest_holder(&env, &mut registry, from, [0x42; 32]);
        registry.revoke(ASSET.into(), from);
        env.advance_block_time((WINDOW + 1) * 1000);
        assert!(registry.is_active(ASSET.into(), to));
        assert!(!registry.transfer_allowed(ASSET.into(), from, to));
    }

    #[test]
    fn transfer_allowed_sender_fraud_revoked() {
        let (env, mut registry) = setup();
        let (to, from) = (key_of(&env, 7), key_of(&env, 8));
        attest_holder(&env, &mut registry, to, [0x47; 32]);
        attest_holder(&env, &mut registry, from, [0x48; 32]);
        registry.revoke_fraud(ASSET.into(), from);
        env.advance_block_time((WINDOW + 1) * 1000);
        assert!(!registry.transfer_allowed(ASSET.into(), from, to));
    }

    #[test]
    fn transfer_allowed_sender_challenge_frozen() {
        let (env, mut registry) = setup();
        let (to, from) = (key_of(&env, 7), key_of(&env, 8));
        attest_holder(&env, &mut registry, to, [0x43; 32]);
        attest_holder(&env, &mut registry, from, [0x44; 32]);
        env.set_caller(env.get_account(0)); // challenge-path freeze
        registry.freeze(ASSET.into(), from);
        env.advance_block_time((WINDOW + 1) * 1000);
        assert!(!registry.transfer_allowed(ASSET.into(), from, to));
    }

    #[test]
    fn transfer_allowed_sender_officer_frozen() {
        let (env, mut registry) = setup();
        let (to, from) = (key_of(&env, 7), key_of(&env, 8));
        attest_holder(&env, &mut registry, to, [0x49; 32]);
        attest_holder(&env, &mut registry, from, [0x4A; 32]);
        env.set_caller(env.get_account(3)); // officer hold
        registry.officer_freeze(ASSET.into(), from, [0u8; 32]);
        env.advance_block_time((WINDOW + 1) * 1000);
        assert!(!registry.transfer_allowed(ASSET.into(), from, to));
    }

    /// The v3 gate fix: a sender whose credential has EXPIRED is denied (the old
    /// status denylist missed Expired; `!is_active` catches it).
    #[test]
    fn transfer_allowed_sender_expired() {
        let (env, mut registry) = setup();
        let (to, from) = (key_of(&env, 7), key_of(&env, 8));
        attest_holder(&env, &mut registry, to, [0x4B; 32]); // to: far-future
        let near: u64 = 10_000;
        let (s, g) = sign_with(&env, &[0, 1], ASSET, &from, &[1u8; 32], &[0x4C; 32], near);
        do_attest(&mut registry, ASSET, from, [1u8; 32], [0x4C; 32], near, s, g);
        env.advance_block_time(near * 1000 + 1000); // sender `from` expires
        assert!(registry.is_active(ASSET.into(), to));
        assert!(!registry.is_active(ASSET.into(), from)); // expired
        assert!(!registry.transfer_allowed(ASSET.into(), from, to));
    }

    /// Recipient in a non-live v3 state (RevokedFraud) is denied (recipient must
    /// be is_active).
    #[test]
    fn transfer_allowed_recipient_revoked_fraud() {
        let (env, mut registry) = setup();
        let (to, from) = (key_of(&env, 7), key_of(&env, 8));
        attest_holder(&env, &mut registry, to, [0x4D; 32]);
        registry.revoke_fraud(ASSET.into(), to); // account 0 holds CHALLENGE_ROLE
        env.advance_block_time((WINDOW + 1) * 1000);
        assert!(!registry.transfer_allowed(ASSET.into(), from, to));
    }

    #[test]
    fn transfer_allowed_asset_frozen() {
        let (env, mut registry) = setup();
        let (to, from) = (key_of(&env, 7), key_of(&env, 8));
        attest_holder(&env, &mut registry, to, [0x45; 32]);
        env.advance_block_time((WINDOW + 1) * 1000);
        assert!(registry.transfer_allowed(ASSET.into(), from, to));
        env.set_caller(env.get_account(3));
        registry.freeze_asset(ASSET.into());
        assert!(!registry.transfer_allowed(ASSET.into(), from, to));
        registry.unfreeze_asset(ASSET.into());
        assert!(registry.transfer_allowed(ASSET.into(), from, to));
    }

    #[test]
    fn transfer_allowed_mint_sentinel_skips_sender_check() {
        let (env, mut registry) = setup();
        let to = key_of(&env, 7);
        attest_holder(&env, &mut registry, to, [0x46; 32]);
        env.advance_block_time((WINDOW + 1) * 1000);
        assert!(registry.transfer_allowed(ASSET.into(), mint_sentinel(), to));
        let inactive = key_of(&env, 9);
        assert!(!registry.transfer_allowed(ASSET.into(), mint_sentinel(), inactive));
    }

    // ---------------- transfer_check: the diagnostic twin (exact reason) ----------

    /// Asserts the exact reason AND that transfer_check agrees with transfer_allowed
    /// (Allowed iff allowed==true) — it is a diagnostic, never a second verdict.
    fn check_agree(
        registry: &CredentialRegistryHostRef,
        from: Key,
        to: Key,
        expected: TransferReason,
    ) {
        let reason = registry.transfer_check(ASSET.into(), from, to);
        let allowed = registry.transfer_allowed(ASSET.into(), from, to);
        assert_eq!(
            allowed,
            matches!(reason, TransferReason::Allowed),
            "transfer_check and transfer_allowed must agree on allow/deny"
        );
        assert_eq!(reason, expected);
    }

    #[test]
    fn transfer_check_allowed() {
        let (env, mut registry) = setup();
        let (to, from) = (key_of(&env, 7), key_of(&env, 8)); // from: no credential
        attest_holder(&env, &mut registry, to, [0x60; 32]);
        env.advance_block_time((WINDOW + 1) * 1000);
        check_agree(&registry, from, to, TransferReason::Allowed);
    }

    #[test]
    fn transfer_check_asset_frozen() {
        let (env, mut registry) = setup();
        let (to, from) = (key_of(&env, 7), key_of(&env, 8));
        attest_holder(&env, &mut registry, to, [0x61; 32]);
        env.advance_block_time((WINDOW + 1) * 1000);
        env.set_caller(env.get_account(3)); // officer
        registry.freeze_asset(ASSET.into());
        check_agree(&registry, from, to, TransferReason::AssetFrozen);
    }

    #[test]
    fn transfer_check_sender_reasons() {
        let (env, mut registry) = setup();
        let to = key_of(&env, 7);
        attest_holder(&env, &mut registry, to, [0x62; 32]);
        // sanctions Revoked
        let s1 = key_of(&env, 8);
        attest_holder(&env, &mut registry, s1, [0x63; 32]);
        registry.revoke(ASSET.into(), s1);
        // RevokedFraud
        let s2 = key_of(&env, 9);
        attest_holder(&env, &mut registry, s2, [0x64; 32]);
        registry.revoke_fraud(ASSET.into(), s2);
        // challenge-frozen
        let s3 = key_of(&env, 10);
        attest_holder(&env, &mut registry, s3, [0x65; 32]);
        env.set_caller(env.get_account(0)); // challenge role
        registry.freeze(ASSET.into(), s3);
        // officer-frozen
        let s4 = key_of(&env, 11);
        attest_holder(&env, &mut registry, s4, [0x66; 32]);
        env.set_caller(env.get_account(3)); // officer
        registry.officer_freeze(ASSET.into(), s4, [0u8; 32]);
        env.advance_block_time((WINDOW + 1) * 1000);

        check_agree(&registry, s1, to, TransferReason::SenderRevokedSanctions);
        check_agree(&registry, s2, to, TransferReason::SenderRevokedFraud);
        check_agree(&registry, s3, to, TransferReason::SenderFrozenByChallenge);
        check_agree(&registry, s4, to, TransferReason::SenderFrozenByOfficer);
    }

    #[test]
    fn transfer_check_sender_expired() {
        let (env, mut registry) = setup();
        let to = key_of(&env, 7);
        attest_holder(&env, &mut registry, to, [0x67; 32]); // far-future recipient
        let from = key_of(&env, 8);
        let near: u64 = 10_000;
        let (s, g) = sign_with(&env, &[0, 1], ASSET, &from, &[1u8; 32], &[0x68; 32], near);
        do_attest(&mut registry, ASSET, from, [1u8; 32], [0x68; 32], near, s, g);
        env.advance_block_time(near * 1000 + 1000); // sender expires
        check_agree(&registry, from, to, TransferReason::SenderExpired);
    }

    #[test]
    fn transfer_check_recipient_reasons() {
        let (env, mut registry) = setup();
        let from = key_of(&env, 8); // no credential -> not sender-gated
        // recipient with no credential
        let r0 = key_of(&env, 7);
        check_agree(&registry, from, r0, TransferReason::RecipientNotActive);
        // recipient RevokedFraud
        let r1 = key_of(&env, 9);
        attest_holder(&env, &mut registry, r1, [0x69; 32]);
        registry.revoke_fraud(ASSET.into(), r1);
        env.advance_block_time((WINDOW + 1) * 1000);
        check_agree(&registry, from, r1, TransferReason::RecipientRevokedFraud);
    }

    // ---------------- officer override (OFFICER_ROLE = the multisig account) ----

    const REASON: [u8; 32] = [0xAB; 32];

    #[test]
    fn officer_revoke_active_to_revoked() {
        let (env, mut registry) = setup();
        let holder = key_of(&env, 7);
        attest_holder(&env, &mut registry, holder, [0x50; 32]);
        env.set_caller(env.get_account(3)); // officer
        registry.officer_revoke(ASSET.into(), holder, REASON);
        assert_eq!(
            registry.get_credential(ASSET.into(), holder).unwrap().status,
            Status::Revoked
        );
        assert!(!registry.is_active(ASSET.into(), holder));
        assert_eq!(
            registry.attestor_outstanding(env.public_key(&env.get_account(0))),
            0
        );
    }

    #[test]
    fn officer_reinstate_revoked_to_active() {
        let (env, mut registry) = setup();
        let holder = key_of(&env, 7);
        attest_holder(&env, &mut registry, holder, [0x51; 32]);
        env.set_caller(env.get_account(3));
        registry.officer_revoke(ASSET.into(), holder, REASON);
        registry.officer_reinstate(ASSET.into(), holder, REASON);
        assert_eq!(
            registry.get_credential(ASSET.into(), holder).unwrap().status,
            Status::Active
        );
        // outstanding restored (credential is challengeable again)
        assert_eq!(
            registry.attestor_outstanding(env.public_key(&env.get_account(0))),
            1
        );
    }

    /// HARD BOUNDARY: a human cannot rescue cryptographically-proven fraud.
    #[test]
    fn officer_reinstate_rejects_fraud() {
        let (env, mut registry) = setup();
        let holder = key_of(&env, 7);
        attest_holder(&env, &mut registry, holder, [0x52; 32]);
        env.set_caller(env.get_account(0)); // challenge role fraud-revokes
        registry.revoke_fraud(ASSET.into(), holder);
        env.set_caller(env.get_account(3)); // officer
        assert_eq!(
            registry
                .try_officer_reinstate(ASSET.into(), holder, REASON)
                .unwrap_err(),
            RegistryError::NotReinstatable.into()
        );
        assert_eq!(
            registry.get_credential(ASSET.into(), holder).unwrap().status,
            Status::RevokedFraud
        );
    }

    #[test]
    fn officer_reinstate_rejects_expired() {
        let (env, mut registry) = setup();
        let holder = key_of(&env, 7);
        let near: u64 = 10_000;
        let (s, g) = sign_with(&env, &[0, 1], ASSET, &holder, &[1u8; 32], &[0x53; 32], near);
        do_attest(&mut registry, ASSET, holder, [1u8; 32], [0x53; 32], near, s, g);
        env.set_caller(env.get_account(3));
        registry.officer_revoke(ASSET.into(), holder, REASON);
        env.advance_block_time(near * 1000 + 1000); // expiry passes
        assert_eq!(
            registry
                .try_officer_reinstate(ASSET.into(), holder, REASON)
                .unwrap_err(),
            RegistryError::ExpiryInPast.into()
        );
    }

    #[test]
    fn officer_freeze_unfreeze_active_frozen() {
        let (env, mut registry) = setup();
        let holder = key_of(&env, 7);
        attest_holder(&env, &mut registry, holder, [0x54; 32]);
        env.advance_block_time((WINDOW + 1) * 1000);
        assert!(registry.is_active(ASSET.into(), holder));
        env.set_caller(env.get_account(3)); // officer
        registry.officer_freeze(ASSET.into(), holder, REASON);
        assert_eq!(
            registry.get_credential(ASSET.into(), holder).unwrap().status,
            Status::Frozen
        );
        assert!(!registry.is_active(ASSET.into(), holder));
        registry.officer_unfreeze(ASSET.into(), holder, REASON);
        assert_eq!(
            registry.get_credential(ASSET.into(), holder).unwrap().status,
            Status::Active
        );
        assert!(registry.is_active(ASSET.into(), holder));
    }

    /// HARD BOUNDARY: an in-flight challenge resolves via the verifier, not fiat.
    #[test]
    fn officer_unfreeze_rejects_challenge_pending() {
        let (env, mut registry) = setup();
        let holder = key_of(&env, 7);
        attest_holder(&env, &mut registry, holder, [0x55; 32]);
        env.set_caller(env.get_account(0)); // challenge-path freeze (frozen_by_challenge)
        registry.freeze(ASSET.into(), holder);
        env.set_caller(env.get_account(3)); // officer
        assert_eq!(
            registry
                .try_officer_unfreeze(ASSET.into(), holder, REASON)
                .unwrap_err(),
            RegistryError::ChallengePending.into()
        );
        assert_eq!(
            registry.get_credential(ASSET.into(), holder).unwrap().status,
            Status::Frozen
        );
    }

    #[test]
    fn officer_unfreeze_expiry_under_freeze() {
        let (env, mut registry) = setup();
        let holder = key_of(&env, 7);
        let near: u64 = 10_000;
        let (s, g) = sign_with(&env, &[0, 1], ASSET, &holder, &[1u8; 32], &[0x56; 32], near);
        do_attest(&mut registry, ASSET, holder, [1u8; 32], [0x56; 32], near, s, g);
        env.set_caller(env.get_account(3)); // officer hold while live
        registry.officer_freeze(ASSET.into(), holder, REASON);
        env.advance_block_time(near * 1000 + 1000); // expiry elapses under the hold
        registry.officer_unfreeze(ASSET.into(), holder, REASON);
        assert_eq!(
            registry.get_credential(ASSET.into(), holder).unwrap().status,
            Status::Expired
        );
        assert!(!registry.is_active(ASSET.into(), holder));
    }

    #[test]
    fn officer_entrypoints_reject_non_officer() {
        let (env, mut registry) = setup();
        let holder = key_of(&env, 7);
        attest_holder(&env, &mut registry, holder, [0x57; 32]);
        env.set_caller(env.get_account(9)); // no role
        assert!(registry
            .try_officer_revoke(ASSET.into(), holder, REASON)
            .is_err());
        assert!(registry
            .try_officer_reinstate(ASSET.into(), holder, REASON)
            .is_err());
        assert!(registry
            .try_officer_freeze(ASSET.into(), holder, REASON)
            .is_err());
        assert!(registry
            .try_officer_unfreeze(ASSET.into(), holder, REASON)
            .is_err());
    }

    #[test]
    fn officer_action_emits_attribution_event() {
        let (env, mut registry) = setup();
        let holder = key_of(&env, 7);
        attest_holder(&env, &mut registry, holder, [0x58; 32]);
        env.set_caller(env.get_account(3));
        let ts = env.block_time_secs();
        registry.officer_revoke(ASSET.into(), holder, REASON);
        assert!(env.emitted_event(
            &registry,
            OfficerAction {
                action: "officer_revoke".to_string(),
                asset_id: ASSET.to_string(),
                holder: holder.to_formatted_string(),
                officer: env.get_account(3),
                ts,
                reason_hash: REASON,
            }
        ));
    }

    #[test]
    fn officer_gas_report() {
        let (env, mut registry) = setup();
        let holder = key_of(&env, 7);
        attest_holder(&env, &mut registry, holder, [0x5A; 32]);
        env.advance_block_time((WINDOW + 1) * 1000);
        env.set_caller(env.get_account(3));
        registry.officer_freeze(ASSET.into(), holder, REASON);
        registry.officer_unfreeze(ASSET.into(), holder, REASON);
        registry.officer_revoke(ASSET.into(), holder, REASON);
        registry.officer_reinstate(ASSET.into(), holder, REASON);
        println!("GAS_REPORT[officer]:\n{}", env.gas_report());
    }

    #[test]
    fn grant_officer_admin_only_then_grantee_can_act() {
        let (env, mut registry) = setup();
        let holder = key_of(&env, 7);
        attest_holder(&env, &mut registry, holder, [0x59; 32]);
        // a non-admin cannot grant OFFICER_ROLE
        env.set_caller(env.get_account(9));
        assert!(registry.try_grant_officer(key_of(&env, 5)).is_err());
        // the admin (account 0) grants OFFICER_ROLE to account 5
        env.set_caller(env.get_account(0));
        registry.grant_officer(key_of(&env, 5));
        // account 5 can now act as the officer
        env.set_caller(env.get_account(5));
        registry.officer_revoke(ASSET.into(), holder, REASON);
        assert_eq!(
            registry.get_credential(ASSET.into(), holder).unwrap().status,
            Status::Revoked
        );
    }

    // ---- canonical public-input pinning (on-chain issuer/asset/root binding) ----

    const CANON_AX: [u8; 32] = [0xA1; 32];
    const CANON_AY: [u8; 32] = [0xB2; 32];
    const CANON_ROOT: [u8; 32] = [0xC3; 32];

    fn full_pub_inputs(
        commit: &[u8; 32],
        null: &[u8; 32],
        ax: &[u8; 32],
        ay: &[u8; 32],
        asset: &str,
        root: &[u8; 32],
    ) -> Bytes {
        let mut v: Vec<u8> = Vec::with_capacity(192);
        v.extend_from_slice(null);
        v.extend_from_slice(commit);
        v.extend_from_slice(ax);
        v.extend_from_slice(ay);
        v.extend_from_slice(&asset_id_le32(asset).unwrap());
        v.extend_from_slice(root);
        Bytes::from(v)
    }

    #[allow(clippy::too_many_arguments)]
    fn try_attest_with_inputs(
        env: &HostEnv,
        registry: &mut CredentialRegistryHostRef,
        holder_idx: usize,
        null: [u8; 32],
        inputs: Bytes,
    ) -> Result<(), OdraError> {
        let holder = key_of(env, holder_idx);
        let commit = [0x11u8; 32];
        let (signers, sigs) = sign_with(env, &[0, 1], ASSET, &holder, &commit, &null, FAR_FUTURE);
        registry
            .try_attest(
                ASSET.into(),
                holder,
                commit,
                null,
                FAR_FUTURE,
                dummy_proof(),
                inputs,
                signers,
                sigs,
            )
            .map(|_| ())
    }

    #[test]
    fn canonical_binding_accepts_matching_inputs() {
        let (env, mut registry) = setup();
        registry.set_canonical_inputs(CANON_AX, CANON_AY, CANON_ROOT);
        assert!(registry.get_canonical_inputs().is_some());
        let commit = [0x11u8; 32];
        let inputs = full_pub_inputs(&commit, &[0x21u8; 32], &CANON_AX, &CANON_AY, ASSET, &CANON_ROOT);
        try_attest_with_inputs(&env, &mut registry, 7, [0x21u8; 32], inputs)
            .expect("matching canonical inputs must attest");
        env.advance_block_time((WINDOW + 1) * 1000);
        assert!(registry.is_active(ASSET.into(), key_of(&env, 7)));
    }

    #[test]
    fn canonical_wrong_issuer_rejected_on_chain() {
        let (env, mut registry) = setup();
        registry.set_canonical_inputs(CANON_AX, CANON_AY, CANON_ROOT);
        // a QUORUM_ROLE caller signs a credential whose proof names a forged issuer
        let inputs =
            full_pub_inputs(&[0x11u8; 32], &[0x22u8; 32], &[0xEE; 32], &CANON_AY, ASSET, &CANON_ROOT);
        assert_eq!(
            try_attest_with_inputs(&env, &mut registry, 7, [0x22u8; 32], inputs).unwrap_err(),
            RegistryError::CanonicalInputMismatch.into()
        );
    }

    #[test]
    fn canonical_wrong_asset_rejected_on_chain() {
        let (env, mut registry) = setup();
        registry.set_canonical_inputs(CANON_AX, CANON_AY, CANON_ROOT);
        // public inputs carry ANOTHER asset's field encoding — a proof for one
        // asset cannot activate a credential slot for this one
        let inputs = full_pub_inputs(
            &[0x11u8; 32], &[0x23u8; 32], &CANON_AX, &CANON_AY, "some-other-asset", &CANON_ROOT,
        );
        assert_eq!(
            try_attest_with_inputs(&env, &mut registry, 7, [0x23u8; 32], inputs).unwrap_err(),
            RegistryError::CanonicalInputMismatch.into()
        );
    }

    #[test]
    fn canonical_wrong_root_rejected_on_chain() {
        let (env, mut registry) = setup();
        registry.set_canonical_inputs(CANON_AX, CANON_AY, CANON_ROOT);
        // attacker-controlled jurisdiction root
        let inputs =
            full_pub_inputs(&[0x11u8; 32], &[0x24u8; 32], &CANON_AX, &CANON_AY, ASSET, &[0xDD; 32]);
        assert_eq!(
            try_attest_with_inputs(&env, &mut registry, 7, [0x24u8; 32], inputs).unwrap_err(),
            RegistryError::CanonicalInputMismatch.into()
        );
    }

    #[test]
    fn set_canonical_inputs_admin_only_and_unset_keeps_legacy_behavior() {
        let (env, mut registry) = setup();
        // unset config -> legacy behavior: placeholder inputs [2..6] still attest
        let holder = key_of(&env, 7);
        attest_holder(&env, &mut registry, holder, [0x58; 32]);
        // non-admin cannot pin canonical inputs
        env.set_caller(env.get_account(9));
        assert!(registry
            .try_set_canonical_inputs(CANON_AX, CANON_AY, CANON_ROOT)
            .is_err());
        // admin can
        env.set_caller(env.get_account(0));
        registry.set_canonical_inputs(CANON_AX, CANON_AY, CANON_ROOT);
        // and from then on placeholder inputs are rejected
        let inputs = pub_inputs(&[0x11u8; 32], &[0x25u8; 32]);
        assert_eq!(
            try_attest_with_inputs(&env, &mut registry, 8, [0x25u8; 32], inputs).unwrap_err(),
            RegistryError::CanonicalInputMismatch.into()
        );
    }
}
