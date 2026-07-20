# frontend/

The Writ web app. **Anu's PRs land here.** Next.js (App Router, TypeScript, Tailwind), scaffolded so the first PR is features, not boilerplate.

Build against the spec in [docs/FRONTEND.md](../docs/FRONTEND.md). Surfaces (per [docs/PRD.md](../docs/PRD.md) §15-§16):

- **Issuer dashboard**: holder roster, eligibility rule sets, revocations.
- **Investor proving flow**: prove eligibility in ZK, no document upload.
- **Regulator disclosure view**: selective-disclosure verification.

## Develop

```bash
npm install
npm run dev   # http://localhost:3000
npm run build # production build
npm run lint  # eslint
```

## Routes

| Route | What it is |
| --- | --- |
| `/` | Landing: hero, the two pains, how-it-works, the on-chain "DENIED" demo, differentiation, trust flex, verticals, the honest ZK claim, Built-on-Casper, CTA |
| `/app` | Wallet-gated app shell + surface switcher |
| `/app/issuer` | Compliance control room: live pseudonymous holder roster (curation counts disclosed), real rule set, screening scope, officer actions (labeled demo UI), audit trail |
| `/app/investor` | ZK proving stepper: wallet-derived identity secret + witness stay in the browser; demo-issuer claims; linked-ETH sanctions field |
| `/app/regulator` | Selective-disclosure request + verdict |
| `/docs` | Docs index (Mintlify-standard house convention) |
| `/api/og` | Dynamic OG image (`next/og`) |
| `sitemap.ts` · `robots.ts` · `not-found.tsx` · `loading.tsx` · `error.tsx` | SEO + segment states |

## Structure

```
app/
  (marketing)/        landing + docs (shared header/footer)
  app/                wallet-gated dashboards
  api/og/             dynamic share image
components/           ui primitives, header/footer, status badge, surface UIs
lib/                  site config, typed mocks, helpers
app/globals.css       Writ design tokens (Tailwind v4 @theme)
```

## Design tokens

No external token set was supplied with the brief, so a restrained, regulatory-grade system is
defined in `app/globals.css` as CSS custom properties (color, type, spacing, radius, shadow,
motion). A single reserved accent (`enforce`) marks the blocked / denied / revoked moments. The
tokens are override-friendly: a supplied set can replace the `:root` values without touching
components.

## Notes

- The dashboards run on **typed mocks** (`lib/mocks.ts`) for scaffolding during parallel dev. Privacy-by-design: holders are shown as pseudonymous nullifiers, never PII. The shipped demo runs on real on-chain data.
- Wallet connection in `/app` is **simulated** for the walkthrough (persisted in `sessionStorage`); wire CSPR.click when the SDK lands.
- Light-first by decision; dark mode deferred.
