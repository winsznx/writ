# Writ — Frontend PRD / Build Guide

**For Anu.** Next.js (App Router). **Design tokens are supplied separately** — this document is information architecture, page order, component inventory, copy direction, OG, routes, and frontend practices. Do not invent colors/fonts/spacing; consume the token set.

---

## 0. What we're building

Writ sells **trust to institutions** while also needing **CSPR.fans virality** (the hackathon's community-vote path runs through a Telegram mini-app — much of the audience views on mobile). So the build has two jobs at once: read *credible and regulatory-grade* to a CCO, and *shareable and instantly legible* to a voter scrolling on a phone. Every decision serves both.

Surfaces:
- **Landing** (`/`) — marketing, the conversion + virality surface.
- **App** (`/app/*`) — three wallet-gated dashboards: issuer, investor, regulator.
- **Docs** (`/docs`) — Mintlify-standard.
- **OG** (`/api/og`) — dynamic share image.

---

## 1. Design-language direction (vibe, not tokens)

Register: **precise, restrained, serious — regulatory-grade modern fintech.** Reference the calm of Stripe / Mercury / Linear, not crypto-neon. Trust is the product; the UI must *feel* auditable. Lots of whitespace, strong typographic hierarchy, restrained motion, no gimmicks. Anu's tokens fill in palette/type/spacing; the structure below assumes this register. One accent for the "enforced / blocked" state (the visceral moments) — used sparingly so it lands.

---

## 2. Route map (App Router)

```
/                  → landing (marketing)
/app               → app shell, wallet gate, surface switcher
/app/issuer        → issuer dashboard
/app/investor      → investor proving flow
/app/regulator     → regulator disclosure view
/docs              → Mintlify-standard docs
/api/og            → dynamic OG image (edge)
sitemap.ts, robots.ts, not-found.tsx, loading.tsx, error.tsx
```

---

## 3. Landing page — A → Z (build top to bottom)

Each section: its job, content, the beat. **The hero must land the value in one breath; the demo moment is the conversion beat.**

1. **Nav (sticky, minimal).** Writ wordmark · Docs · GitHub · **Launch app** (primary). During the vote window, a **Vote on CSPR.fans** chip. Mobile: collapse to wordmark + Launch.

2. **Hero.** The one line — *"Keep your tokenized asset compliant for life — every holder provably eligible, screened against live sanctions data, blocked on-chain the moment their credential is revoked. Your firm never custodies investor PII."* One sharp sub-line. Primary CTA (**See it block a transfer** → demo) + secondary (**Launch app**). Visual: the clean "transfer DENIED on-chain" moment or a restrained product shot. No wall of text — this section is the whole pitch in 5 seconds.

3. **The problem (two pains).** *The honeypot* — conventional compliance forces you to custody investor PII, a breach lawsuit waiting to happen. *Point-in-time KYC fails* — sanctions update, accreditation lapses; "pass once, in forever" is what regulators fine. Make a CCO nod.

4. **How it works (3–4 steps, visual).** Prove privately (ZK, wallet-held secret) → gated on-chain (every transfer) → revocable at runtime (screened at onboard/refresh) → provable to regulators (selective disclosure). A clean horizontal/step diagram, not prose.

5. **The demo moment (the conversion beat).** Embed/animate the killer scene: a sanctioned wallet tries to receive the bond → **blocked on-chain in real time → the holder's name appears nowhere.** Video or scripted animation with the real testnet tx visible. This is what converts judges and voters.

6. **Differentiation.** Why Writ vs normal compliance: no-honeypot + continuity + real on-chain enforcement. A tight 3-column or comparison strip (Writ vs "the usual way").

7. **The trust flex.** The fraud-proof angle — every eligibility decision is a published proof anyone can verify, and an attestation whose stored proof is invalid is slashed on-chain. (Scope: the challenge verifies the stored proof; canonical issuer/asset/root pinning is a separate gate — see README §12.) Short, builds credibility for the technical judges and serious buyers.

8. **Who it's for (horizontal).** RWA verticals — tokenized equities, treasuries, corporate debt, real estate, funds. One compliance layer, every vertical. Logos/icons row.

9. **How the ZK works (the honest, credible section).** The precise claim for technical judges + institutional buyers: *"Eligibility proven in zero-knowledge, verified by a threshold of autonomous agents; the chain stores signed credentials, enforces compliance at every transfer via a native CEP-78 filter, and exposes published proofs for on-chain fraud challenge."* Never imply on-chain SNARK verification. Honesty reads as senior.

10. **Built on Casper.** Ecosystem alignment — the ERC-3643-equivalent for Casper, native account model, dead-center on Casper's RWA + compliant-privacy thesis. (Scores the Casper judges.)

11. **CTA + footer.** Launch app · Docs · GitHub · socials · CSPR.fans. Repeat the one-liner.

---

## 4. Issuer dashboard — `/app/issuer`

The control room. **Privacy-by-design display: never render investor PII — only credential status + pseudonym/nullifier.**

- **Asset overview** — the tokenized bond: supply, holder count, contract address (link to testnet.cspr.live). No identities.
- **Holder roster** — table of holders by credential **status** (`Active / Pending / Expired / Revoked / Frozen`), pseudonymous handle/nullifier, credential expiry, last re-screen. The whole point: a compliant book with zero PII on screen.
- **Rule sets** — the eligibility predicate per asset (accredited ∧ jurisdiction ∧ sanctions config). Read + edit (officer-gated).
- **Actions** — freeze / revoke / override (officer authority; demo officer is a single key — buttons are illustrative in the shipped UI), with confirmation + reason.
- **Audit trail** — chronological compliance events, on-chain-anchored, exportable. This is what a regulator examination consumes.
- **Re-screen status** — last sweep, freshness window, current flags, quorum health.

---

## 5. Investor proving flow — `/app/investor`

Minimal, trustworthy, **privacy-forward** — the messaging hammers "you upload nothing."

- **Connect wallet** (CSPR.click Web SDK).
- **Prove eligibility** — step UX: derive wallet-held identity secret → demo issuer signs the claim set → generate ZK proof client-side → submit proof for verification + attestation → watch credential status. Clear "your identity secret and witness stay in this browser" reassurance at each step.
- **Credential status** — Active / expiry countdown / re-prove action.

---

## 6. Regulator disclosure view — `/app/regulator`

Auditor-grade, sparse, verification-focused.

- **Request a disclosure** — pick holder/fact/time ("was holder #X eligible at time T?").
- **Verify** — check the selective-disclosure proof against the on-chain commitment; green/red verdict. No exposure of the rest of the book.

---

## 7. OG image — `/api/og`

Dynamic (`next/og` / `ImageResponse`, edge runtime). Default: Writ wordmark + the one-liner on the design-token background. Built for CSPR.fans/social shareability — must look sharp at small sizes. Optional per-route variants (landing default is enough for v1).

---

## 8. Docs — `/docs`

Mintlify-standard (the house convention). Sections: Quickstart, Architecture (the off-chain-verify + on-chain-credential model), The honest claim, Integration ("how an issuer adds Writ to a tokenized asset"), the agent/MCP surface, FAQ. Docs double as credibility for technical judges.

---

## 9. Frontend practices (the "all other practices")

- **App Router**, server components by default; client components only for wallet/interactive/stateful surfaces.
- **Metadata API** per route — title, description, OG, Twitter card. Don't ship a route without metadata.
- **Performance** — `next/image`, `next/font`, lazy-load the demo media, target a clean Lighthouse pass. The landing must be fast on mobile.
- **Accessibility** — semantic HTML, keyboard nav, focus states, contrast (a11y *is* institutional credibility).
- **SEO** — `sitemap.ts`, `robots.ts`, structured metadata.
- **Responsive, mobile-first** — CSPR.fans voters are on phones; the landing and demo must be flawless on mobile before desktop polish.
- **States** — `loading.tsx` / `error.tsx` / `not-found.tsx` per segment; skeletons over spinners on the dashboards.
- **Wallet** — CSPR.click Web SDK; never expose secrets client-side; all chain reads via CSPR.cloud.
- **Deploy** — Vercel or Railway (house default); clean env handling; preview deploys for Anu's PRs.

---

## 10. Build order (A → Z for Anu)

1. Scaffold Next.js + consume design tokens + layout shell (nav + footer).
2. **Landing**, section by section, hero first → down (§3). Ship this first — it's the conversion + vote surface.
3. OG route (`/api/og`).
4. `/docs` scaffold (Mintlify).
5. App shell + wallet gate + surface switcher (`/app`).
6. **Investor proving flow** (`/app/investor`) — simplest app surface, build first.
7. **Issuer dashboard** (`/app/issuer`).
8. **Regulator view** (`/app/regulator`).
9. Polish pass — metadata, responsive, a11y, perf, loading/error states.
10. Deploy + preview links per PR.

Backend contracts/agent are tracked separately; during parallel dev the dashboards used typed mocks, since replaced: the shipped issuer roster/trail read live on-chain data (with disclosed curation counts), the landing terminal is labeled a scripted replay, and remaining demo fixtures (e.g. the regulator walkthrough preimage) are labeled in the UI.

---

*Scope: the focused Writ — three app surfaces + landing. No rebalancing/payroll/oracle surfaces; those are downstream products that build on Writ, not screens in it.*