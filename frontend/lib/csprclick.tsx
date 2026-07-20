"use client";

/*
  CSPR.click wallet — the real connector. Loads the CSPR.click SDK from the CDN and
  exposes connect / active account / signMessage / send (sign + submit). The APP ID is
  PUBLIC by design (the SDK ships it to the browser to identify the app) and is read
  from NEXT_PUBLIC_CSPR_CLICK_APP_ID — never hardcoded, never a server secret.

  The visitor signs as the HOLDER (their own wallet). Quorum attestation stays
  server-side (/api/onboard) — never moved into the browser.
*/

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { blake2b } from "@noble/hashes/blake2b";

const APP_ID = process.env.NEXT_PUBLIC_CSPR_CLICK_APP_ID;
const APP_NAME = process.env.NEXT_PUBLIC_CSPR_CLICK_APP_NAME ?? "Writ";
const SDK_URL = "https://cdn.cspr.click/ui/v2.1.0/csprclick-client-2.1.0.js";

export type ClickAccount = {
  provider: string;
  public_key: string | null;
  cspr_name: string | null;
  balance?: string;
};
type SignResult = { cancelled: boolean; signature: string | null; error: string | null };
type SendResult = {
  cancelled: boolean;
  deployHash: string | null;
  transactionHash: string | null;
  error: string | null;
  status: string | null;
};
interface CsprClickSDK {
  signIn(): void;
  signOut(): void;
  getActiveAccount(): ClickAccount | null;
  send(
    tx: string | object,
    signingPublicKey: string,
    onStatus?: (status: string, data: unknown) => void,
    timeout?: number,
  ): Promise<SendResult | undefined>;
  signMessage(message: string, signingPublicKey: string): Promise<SignResult | undefined>;
  on(event: string, cb: (evt: unknown) => void): void;
}
declare global {
  interface Window {
    csprclick: CsprClickSDK;
    clickSDKOptions?: unknown;
    clickUIOptions?: unknown;
  }
}

/** Casper account hash from a CSPR.click public key (tag 01 = ed25519, 02 = secp256k1). */
export function publicKeyToAccountHash(publicKeyHex: string): string {
  const tag = publicKeyHex.slice(0, 2);
  const algo = tag === "01" ? "ed25519" : "secp256k1";
  const pub = Uint8Array.from(Buffer.from(publicKeyHex.slice(2), "hex"));
  const input = new Uint8Array([...Buffer.from(algo, "utf8"), 0x00, ...pub]);
  return Buffer.from(blake2b(input, { dkLen: 32 })).toString("hex");
}

type ClickContextValue = {
  configured: boolean;
  ready: boolean;
  account: ClickAccount | null;
  connect: () => void;
  disconnect: () => void;
  signMessage: (message: string, publicKey: string) => Promise<SignResult | undefined>;
  sendDeploy: (
    deployJson: string | object,
    publicKey: string,
    onStatus?: (status: string, data: unknown) => void,
  ) => Promise<SendResult | undefined>;
};

const ClickContext = createContext<ClickContextValue | null>(null);

export function CsprClickProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [account, setAccount] = useState<ClickAccount | null>(null);

  useEffect(() => {
    if (!APP_ID || typeof window === "undefined") return;
    if (document.getElementById("csprclick-client")) {
      // SDK script already injected (e.g. fast refresh) — defer the state sync so the
      // effect body stays side-effect-only (react-hooks/set-state-in-effect).
      const id = window.setTimeout(() => setReady(true), 0);
      return () => window.clearTimeout(id);
    }
    window.clickUIOptions = { uiContainer: "csprclick-ui", rootAppElement: "body", defaultTheme: "light" };
    window.clickSDKOptions = {
      appName: APP_NAME,
      appId: APP_ID,
      contentMode: "iframe",
      providers: ["casper-wallet", "ledger", "metamask-snap", "walletconnect"],
    };
    const onLoaded = () => {
      setReady(true);
      const sync = () => setAccount(window.csprclick?.getActiveAccount() ?? null);
      window.csprclick.on("csprclick:signed_in", sync);
      window.csprclick.on("csprclick:switched_account", sync);
      window.csprclick.on("csprclick:signed_out", () => setAccount(null));
      window.csprclick.on("csprclick:disconnected", () => setAccount(null));
      sync();
    };
    window.addEventListener("csprclick:loaded", onLoaded);
    const s = document.createElement("script");
    s.src = SDK_URL;
    s.id = "csprclick-client";
    s.async = true;
    document.head.appendChild(s);
    return () => window.removeEventListener("csprclick:loaded", onLoaded);
  }, []);

  const value: ClickContextValue = {
    configured: Boolean(APP_ID),
    ready,
    account,
    connect: () => window.csprclick?.signIn(),
    disconnect: () => window.csprclick?.signOut(),
    signMessage: (m, pk) => window.csprclick.signMessage(m, pk),
    sendDeploy: (tx, pk, cb) => window.csprclick.send(tx, pk, cb),
  };

  return (
    <ClickContext.Provider value={value}>
      {children}
      <div id="csprclick-ui" />
    </ClickContext.Provider>
  );
}

export function useCsprClick(): ClickContextValue {
  const ctx = useContext(ClickContext);
  if (!ctx) throw new Error("useCsprClick must be used within CsprClickProvider");
  return ctx;
}
