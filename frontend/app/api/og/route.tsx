import { ImageResponse } from "next/og";
import { SITE } from "@/lib/site";

export const runtime = "edge";

export function GET() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          backgroundColor: "#fbfcfd",
          padding: "72px",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div
            style={{
              width: 48,
              height: 48,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: "#0b1521",
              color: "#ffffff",
              borderRadius: 12,
              fontSize: 28,
              fontWeight: 700,
            }}
          >
            W
          </div>
          <div style={{ fontSize: 34, fontWeight: 600, color: "#0b1521" }}>Writ</div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <div
            style={{
              fontSize: 60,
              fontWeight: 600,
              lineHeight: 1.1,
              letterSpacing: "-0.02em",
              color: "#0b1521",
              maxWidth: 980,
            }}
          >
            Keep your tokenized asset compliant for life — without touching investor PII.
          </div>
          <div style={{ fontSize: 28, color: "#4a5567", maxWidth: 900 }}>
            Provably eligible · continuously re-screened · blocked on-chain.
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: "#1a48e0" }} />
            <div style={{ fontSize: 22, color: "#8a94a6" }}>{SITE.domain}</div>
          </div>
          <div style={{ fontSize: 22, color: "#8a94a6" }}>Built on Casper</div>
        </div>
      </div>
    ),
    { width: 1200, height: 630 },
  );
}
