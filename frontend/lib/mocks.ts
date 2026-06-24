import type { CredentialStatus } from "@/components/status-badge";

/*
  Typed mock data for frontend scaffolding during parallel dev only.
  Privacy-by-design: holders are represented by a pseudonymous nullifier — never PII.
  The shipped demo runs on real on-chain data; these mocks are replaced when the
  Credential Registry + agent endpoints land.
*/

export type Holder = {
  nullifier: string;
  status: CredentialStatus;
  jurisdiction: string;
  credentialExpiry: string;
  lastReScreen: string;
};

export type AuditEvent = {
  id: string;
  at: string;
  kind: "ATTEST" | "REVOKE" | "FREEZE" | "TRANSFER_DENY" | "TRANSFER_OK" | "CHALLENGE";
  detail: string;
  txHash: string;
};

export const ASSET = {
  name: "Acme 2031 Senior Note",
  symbol: "WRIT-001",
  standard: "Patched CEP-78 (recipient-aware)",
  contract: "hash-4f2a…c19b",
  supply: "5,000,000",
  holders: 6,
} as const;

export const HOLDERS: Holder[] = [
  { nullifier: "0x7a3f…91c4", status: "ACTIVE", jurisdiction: "US-Accredited", credentialExpiry: "2026-09-14", lastReScreen: "2026-06-21 02:00 UTC" },
  { nullifier: "0x2c81…44de", status: "ACTIVE", jurisdiction: "EU-Professional", credentialExpiry: "2026-08-02", lastReScreen: "2026-06-21 02:00 UTC" },
  { nullifier: "0x9f0b…a3e1", status: "REVOKED", jurisdiction: "US-Accredited", credentialExpiry: "2026-07-30", lastReScreen: "2026-06-21 02:00 UTC" },
  { nullifier: "0x5d12…7b08", status: "PENDING", jurisdiction: "SG-Accredited", credentialExpiry: "—", lastReScreen: "—" },
  { nullifier: "0xb604…e2f9", status: "EXPIRED", jurisdiction: "EU-Professional", credentialExpiry: "2026-06-10", lastReScreen: "2026-06-09 02:00 UTC" },
  { nullifier: "0x1e77…0caa", status: "FROZEN", jurisdiction: "US-Accredited", credentialExpiry: "2026-10-01", lastReScreen: "2026-06-21 02:00 UTC" },
];

export const RULE_SET = {
  predicate: "accredited ∧ jurisdiction ∈ {US, EU, SG} ∧ ¬sanctioned",
  freshnessWindow: "90 days",
  quorum: "2-of-3 verifiers",
  reScreenCadence: "Daily + event-driven",
} as const;

export const AUDIT_TRAIL: AuditEvent[] = [
  { id: "e6", at: "2026-06-21 02:04 UTC", kind: "TRANSFER_DENY", detail: "Transfer to 0x9f0b…a3e1 denied — recipient REVOKED", txHash: "tx-8c41…02ab" },
  { id: "e5", at: "2026-06-21 02:01 UTC", kind: "REVOKE", detail: "0x9f0b…a3e1 revoked — sanctions match on re-screen", txHash: "tx-77d0…9e15" },
  { id: "e4", at: "2026-06-20 14:22 UTC", kind: "TRANSFER_OK", detail: "Transfer to 0x2c81…44de proceeded", txHash: "tx-1a9f…b3c2" },
  { id: "e3", at: "2026-06-19 09:10 UTC", kind: "FREEZE", detail: "0x1e77…0caa frozen by officer — pending review", txHash: "tx-4b22…7f80" },
  { id: "e2", at: "2026-06-18 11:35 UTC", kind: "ATTEST", detail: "0x2c81…44de attested ACTIVE by quorum", txHash: "tx-9d57…1c44" },
  { id: "e1", at: "2026-06-18 11:30 UTC", kind: "ATTEST", detail: "0x7a3f…91c4 attested ACTIVE by quorum", txHash: "tx-3f80…aa61" },
];

export const RE_SCREEN = {
  lastSweep: "2026-06-21 02:00 UTC",
  freshness: "Within window",
  flags: 1,
  quorumHealth: "3/3 verifiers online",
} as const;

export const PROVING_STEPS = [
  { key: "connect", title: "Connect wallet", body: "Connect with CSPR.click. No documents requested." },
  { key: "claims", title: "Load claims", body: "Pull your accreditation & jurisdiction claims from your KYC issuer — locally, on your device." },
  { key: "prove", title: "Generate proof", body: "A zero-knowledge proof is generated client-side. Your documents never leave your device." },
  { key: "submit", title: "Submit to quorum", body: "Only the proof and public inputs are sent. The quorum verifies and co-signs a credential." },
  { key: "status", title: "Credential active", body: "Your credential is published on-chain. You can now hold the asset." },
] as const;
