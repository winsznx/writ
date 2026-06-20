# contracts/

On-chain Casper components (Odra + Casper 2.0, `vm_casper_v1`), added in the backend phase:

- **Writ Token** — patched CEP-78 fork with a *recipient-aware* transfer filter (the real recipient is passed to `can_transfer`) plus a mint gate. Substrate already proven on live testnet.
- **Credential Registry** — Odra contract storing credentials (commitment / nullifier / flag / expiry / quorum signatures), native `verify_signature` checks, RBAC, the nullifier set, and published proofs for on-chain fraud challenge.

See [docs/PRD.md](../docs/PRD.md) §5–§9, §16.
