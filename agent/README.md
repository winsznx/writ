# agent/

The autonomous operator (the spine: perceive → decide → act), added in the backend phase. Runs on Railway, MCP-driven.

- **Verifier quorum** — N-of-M independent agents each verify the Groth16 proof (arkworks) and run live sanctions screening (Cordon / x402 OFAC), co-signing a credential only on agreement.
- **Re-screening agent** — continuously re-screens the holder base against live sanctions/accreditation/jurisdiction data and revokes on change; submits transactions via `put-deploy`.

See [docs/PRD.md](../docs/PRD.md) §7, §12, §16, §17.
