# frontend/

The Writ web app — **Anu's PRs land here.** Next.js (App Router, TypeScript, Tailwind), scaffolded so the first PR is features, not boilerplate.

Build against the spec in [docs/FRONTEND.md](../docs/FRONTEND.md). Surfaces (per [docs/PRD.md](../docs/PRD.md) §15–§16):

- **Issuer dashboard** — holder roster, eligibility rule sets, revocations.
- **Investor proving flow** — prove eligibility in ZK, no document upload.
- **Regulator disclosure view** — selective-disclosure verification.

## Develop

```bash
npm install
npm run dev   # http://localhost:3000
```
