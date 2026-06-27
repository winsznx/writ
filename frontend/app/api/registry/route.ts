/*
  Live registry view — SERVER-SIDE route. Holds the CSPR.cloud key (process.env,
  from .env.local) and calls CSPR.cloud server-side; the browser fetches THIS endpoint
  and never sees the key. Returns the live roster + attribution trail for the v3
  registry + challenge contracts.
*/

import { fetchRegistryView } from "@/lib/cspr-cloud";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(): Promise<Response> {
  const key = process.env.CSPR_CLOUD_KEY;
  if (!key) {
    return Response.json(
      { error: "CSPR_CLOUD_KEY not configured (set it in frontend/.env.local)" },
      { status: 503 },
    );
  }
  try {
    const view = await fetchRegistryView(key);
    return Response.json(view, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "CSPR.cloud read failed" },
      { status: 502 },
    );
  }
}
