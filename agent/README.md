# agent/

The autonomous operator (the spine: perceive → decide → act), added in the backend phase. Runs on Railway, MCP-driven.

- **Verifier quorum** — N-of-M independent agents each verify the Groth16 proof (arkworks) and run live OFAC SDN sanctions screening (the blocking gate), co-signing a credential only on agreement.
- **Re-screening agent** — re-screens the holder base against live sanctions data (delta on list update + full-sweep floor when RUN as a daemon; the shipped web demo screens at onboarding/refresh only) and revokes on change; submits transactions via `put-deploy`.

See [docs/PRD.md](../docs/PRD.md) §7, §12, §16, §17.
