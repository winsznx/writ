//! Writ integration — composes all five contracts (groth16-verifier,
//! credential-registry, challenge, transfer-filter, writ-token) against ONE
//! registry and proves the full compliance lifecycle end-to-end, asserting real
//! token movement at each step. Tests only.
#[cfg(test)]
mod lifecycle;
