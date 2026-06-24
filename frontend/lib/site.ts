export const SITE = {
  name: "Writ",
  domain: "writ.finance",
  url: "https://writ.finance",
  tagline: "Compliance that never touches investor PII.",
  description:
    "Writ keeps a tokenized real-world asset compliant for life — every holder provably eligible, continuously re-screened, blocked on-chain the moment they're not — without the issuer ever touching a single piece of investor PII.",
  oneLiner:
    "Keep your tokenized asset compliant for life — every holder provably eligible, continuously re-screened, blocked on-chain the moment they're not. Your firm never touches a single piece of investor PII.",
  github: "https://github.com/winsznx/writ",
  csprFans: "https://cspr.fans",
  explorer: "https://testnet.cspr.live",
} as const;

export const NAV_LINKS = [
  { label: "Docs", href: "/docs" },
  { label: "GitHub", href: SITE.github, external: true },
] as const;

export const APP_SURFACES = [
  { key: "issuer", label: "Issuer", href: "/app/issuer", blurb: "Compliance control room" },
  { key: "investor", label: "Investor", href: "/app/investor", blurb: "Prove eligibility privately" },
  { key: "regulator", label: "Regulator", href: "/app/regulator", blurb: "Verify disclosures" },
] as const;

export type SurfaceKey = (typeof APP_SURFACES)[number]["key"];
