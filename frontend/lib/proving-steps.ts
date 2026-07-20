/*
  Investor onboarding walkthrough copy. Every sentence here must stay true to the
  implemented flow (components/investor-proving.tsx + the /api routes): wallet-derived
  secret, demo issuer, in-browser proving, single-trust-domain attestation.
*/

export const PROVING_STEPS = [
  {
    key: "connect",
    title: "Connect wallet",
    body: "Connect with CSPR.click. No documents are requested — eligibility claims come from the demo issuer, not an external KYC provider.",
  },
  {
    key: "claims",
    title: "Derive identity + load claims",
    body: "Your wallet signs a derivation message; the identity secret is derived from that signature in this browser and never leaves it. The demo issuer signs your claim set against Poseidon(identitySecret) only.",
  },
  {
    key: "prove",
    title: "Generate proof",
    body: "A Groth16 proof is generated client-side with snarkjs. Only the proof and its six public signals are submitted.",
  },
  {
    key: "submit",
    title: "Verify + attest",
    body: "The server verifies the proof, binds all public inputs to the pinned issuer/asset/root, runs sanctions screening (fail-closed), and co-signs with two server-held demo keys — a single trust domain, verified 2-of-3 on-chain.",
  },
  {
    key: "status",
    title: "Credential active",
    body: "Your credential — commitment, nullifier, expiry, and your own proof bytes — is on-chain. Every CEP-78 transfer is now gated against the registry.",
  },
] as const;
