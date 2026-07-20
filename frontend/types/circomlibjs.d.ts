declare module "circomlibjs" {
  export function buildPoseidon(): Promise<{
    (inputs: unknown[]): unknown;
    F: { toString(x: unknown): string; e(x: unknown): unknown };
  }>;
  export function buildEddsa(): Promise<{
    prv2pub(prv: Uint8Array): unknown[];
    signPoseidon(prv: Uint8Array, msg: unknown): { R8: unknown[]; S: bigint };
    verifyPoseidon(msg: unknown, sig: { R8: unknown[]; S: bigint }, pub: unknown[]): boolean;
  }>;
}
