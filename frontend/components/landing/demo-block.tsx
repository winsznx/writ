"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  animate,
  AnimatePresence,
  motion,
  useMotionValue,
  useReducedMotion,
  useTransform,
  type AnimationPlaybackControls,
} from "motion/react";
import { buttonClass } from "@/components/ui";
import { cn } from "@/lib/cn";

type Phase = "idle" | "typing" | "running" | "done";
type Tone = "dim" | "default" | "good" | "bad";
type Line = { text: string; tone: Tone; indent?: boolean };
type Outcome = "allowed" | "denied";

type Scene = {
  command: string;
  logs: Line[];
  outcome: Outcome;
  banner: string;
  code: string;
  caption: { lead: string; rest: string };
  cta: string;
};

const SCENES: Scene[] = [
  {
    command: "writ tx transfer WRIT-001 --to 0x4c2d…7b8a",
    logs: [
      { text: "submitting deploy → casper-test rpc", tone: "dim" },
      { text: "filter ▸ asset frozen?  false", tone: "default" },
      { text: "filter ▸ sender revoked / frozen?  false", tone: "default" },
      { text: "filter ▸ recipient credential = ACTIVE?  ACTIVE", tone: "good" },
      { text: "└─ proof fresh · in-jurisdiction · not sanctioned", tone: "good", indent: true },
      { text: "✓ transfer settled · 1 block", tone: "good" },
    ],
    outcome: "allowed",
    banner: "TRANSFER SETTLED ON-CHAIN",
    code: "ok",
    caption: {
      lead: "An eligible holder, a compliant transfer.",
      rest: "Settled on-chain in one block, and the issuer never touched a passport.",
    },
    cta: "Send a compliant transfer",
  },
  {
    command: "writ tx transfer WRIT-001 --to 0x9f0b…a3e1",
    logs: [
      { text: "submitting deploy → casper-test rpc", tone: "dim" },
      { text: "filter ▸ asset frozen?  false", tone: "default" },
      { text: "filter ▸ sender revoked / frozen?  false", tone: "default" },
      { text: "filter ▸ recipient credential = ACTIVE?  REVOKED", tone: "bad" },
      { text: "└─ sanctions match on re-screen · credential void", tone: "bad", indent: true },
      { text: "✗ execution reverted · user error 159", tone: "bad" },
    ],
    outcome: "denied",
    banner: "TRANSFER DENIED ON-CHAIN",
    code: "revert 159",
    caption: {
      lead: "The holder's name appears nowhere.",
      rest: "The chain enforced eligibility against a signed credential, never PII.",
    },
    cta: "Send to a sanctioned wallet",
  },
];

const GENESIS_HEIGHT = 2_481_937;
const GENESIS_TS = Date.now();
const BLOCK_MS = 1600;
const CHAR_MS = 26;
const STAGGER_S = 0.5;
const SETTLE_S = 0.5;
const HOLD_MS = 2600;

const currentHeight = () => GENESIS_HEIGHT + Math.floor((Date.now() - GENESIS_TS) / BLOCK_MS);
const fmt = (d: Date) => d.toLocaleTimeString("en-GB", { hour12: false });

export function DemoBlock() {
  const reduce = useReducedMotion();
  const [phase, setPhase] = useState<Phase>("idle");
  const [scene, setScene] = useState(0);
  const [height, setHeight] = useState(GENESIS_HEIGHT);
  const [runId, setRunId] = useState(0);
  const [stamps, setStamps] = useState<string[]>([]);
  const [inView, setInView] = useState(false);

  const sc = SCENES[scene];

  const count = useMotionValue(0);
  const typed = useTransform(count, (v) => sc.command.slice(0, Math.round(v)));
  const anim = useRef<AnimationPlaybackControls | null>(null);
  const timers = useRef<number[]>([]);
  const started = useRef(false);
  const playRef = useRef<(idx: number) => void>(() => {});
  const scrollBody = useRef<HTMLDivElement>(null);
  const root = useRef<HTMLDivElement>(null);

  const clearTimers = useCallback(() => {
    timers.current.forEach((t) => window.clearTimeout(t));
    timers.current = [];
  }, []);

  const play = useCallback(
    (idx: number) => {
      clearTimers();
      anim.current?.stop();

      const s = SCENES[idx];
      const now = Date.now();
      setScene(idx);
      setStamps(s.logs.map((_, i) => fmt(new Date(now + i * 130))));
      setRunId((n) => n + 1);
      setPhase("typing");
      count.set(0);

      if (reduce) {
        count.set(s.command.length);
        setPhase("done");
        return;
      }

      const typeMs = s.command.length * CHAR_MS;
      anim.current = animate(count, s.command.length, {
        duration: typeMs / 1000,
        ease: "easeInOut",
      });

      const logsMs = (0.15 + s.logs.length * STAGGER_S + SETTLE_S) * 1000;
      const push = (fn: () => void, at: number) =>
        timers.current.push(window.setTimeout(fn, at));

      push(() => setPhase("running"), typeMs);
      push(() => setPhase("done"), typeMs + logsMs);
      push(() => playRef.current((idx + 1) % SCENES.length), typeMs + logsMs + HOLD_MS);
    },
    [clearTimers, count, reduce],
  );

  useEffect(() => {
    playRef.current = play;
  }, [play]);

  useEffect(() => {
    const id = setInterval(() => setHeight(currentHeight()), BLOCK_MS);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => setInView(entry.isIntersecting),
      { threshold: 0.4 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!inView || started.current) return;
    started.current = true;
    const id = window.setTimeout(() => play(reduce ? 1 : 0), reduce ? 0 : 500);
    timers.current.push(id);
  }, [inView, reduce, play]);

  useEffect(() => {
    if (phase !== "running") return;
    const id = setInterval(() => {
      const el = scrollBody.current;
      if (el) el.scrollTop = el.scrollHeight;
    }, 120);
    return () => clearInterval(id);
  }, [phase]);

  useEffect(
    () => () => {
      anim.current?.stop();
      clearTimers();
    },
    [clearTimers],
  );

  const busy = phase === "typing" || phase === "running";
  const done = phase === "done";
  const allowed = sc.outcome === "allowed";

  return (
    <div
      ref={root}
      className="overflow-hidden rounded-xl border border-border bg-surface shadow-[var(--shadow-card)]"
    >
      <div className="flex items-center justify-between border-b border-border bg-surface-muted px-4 py-2.5">
        <div className="flex items-center gap-2">
          <span className="flex gap-1.5" aria-hidden>
            <span className="h-2.5 w-2.5 rounded-full bg-enforce/60" />
            <span className="h-2.5 w-2.5 rounded-full bg-pending/60" />
            <span className="h-2.5 w-2.5 rounded-full bg-active/60" />
          </span>
          <span className="ml-1 font-mono text-xs text-ink-subtle">writ@casper-test · filter</span>
        </div>
        <div className="flex items-center gap-3 font-mono text-xs text-ink-subtle">
          <span className="hidden tabular-nums sm:inline">#{height.toLocaleString()}</span>
          <span className="flex items-center gap-1.5">
            <span aria-hidden className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full rounded-full bg-active animate-[writ-pulse-ring_1.6s_ease-out_infinite]" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-active" />
            </span>
            LIVE
          </span>
        </div>
      </div>

      <div
        ref={scrollBody}
        className="h-52 overflow-y-auto bg-ink px-4 py-3 font-mono text-[12.5px] leading-relaxed sm:h-56"
        aria-live="polite"
      >
        <div className="flex gap-2 text-white">
          <span aria-hidden className="select-none text-active">$</span>
          <span className="break-all">
            <motion.span>{typed}</motion.span>
            {(phase === "idle" || phase === "typing") && (
              <motion.span
                aria-hidden
                className="ml-0.5 inline-block h-[1.05em] w-[0.55em] translate-y-[0.18em] bg-white align-baseline"
                animate={{ opacity: [1, 1, 0, 0] }}
                transition={{ duration: 1.05, times: [0, 0.5, 0.5, 1], repeat: Infinity }}
              />
            )}
          </span>
        </div>

        {phase === "idle" && (
          <p className="mt-2 text-white/35">
            <span className="text-active/70">●</span> watching mempool for WRIT-001 transfers…
          </p>
        )}

        <AnimatePresence mode="wait">
          {(phase === "running" || done) && (
            <motion.ul
              key={runId}
              className="mt-1 space-y-0.5"
              initial="hidden"
              animate="show"
              variants={{
                hidden: {},
                show: { transition: { staggerChildren: reduce ? 0 : STAGGER_S, delayChildren: 0.15 } },
              }}
            >
              {sc.logs.map((line, i) => (
                <motion.li
                  key={line.text}
                  variants={{
                    hidden: { opacity: 0, y: 6 },
                    show: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 520, damping: 34 } },
                  }}
                  className={cn(
                    "flex gap-2",
                    line.indent && "pl-4",
                    line.tone === "bad" && "text-enforce",
                    line.tone === "good" && "text-active",
                    line.tone === "dim" && "text-white/40",
                    line.tone === "default" && "text-white/75",
                  )}
                >
                  {!line.indent && (
                    <span className="shrink-0 text-white/25 tabular-nums">{stamps[i]}</span>
                  )}
                  <span className="break-all">{line.text}</span>
                </motion.li>
              ))}
            </motion.ul>
          )}
        </AnimatePresence>

        {phase === "running" && (
          <p className="mt-1 flex items-center gap-2 text-white/55">
            <motion.span
              aria-hidden
              className="inline-block h-3 w-3 rounded-full border border-white/25 border-t-active"
              animate={{ rotate: 360 }}
              transition={{ duration: 0.8, ease: "linear", repeat: Infinity }}
            />
            awaiting on-chain decision…
          </p>
        )}

        <AnimatePresence>
          {done && (
            <motion.div
              className={cn(
                "mt-2 flex items-center justify-between rounded-md px-3 py-2 text-white",
                allowed ? "bg-active" : "bg-enforce",
              )}
              initial={{ scale: 0.92, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: "spring", stiffness: 600, damping: 22 }}
            >
              <span className="font-semibold tracking-tight">{sc.banner}</span>
              <span className="font-mono text-xs">{sc.code}</span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="space-y-3 border-t border-border p-4 sm:p-5">
        <motion.p
          className="text-sm"
          initial={false}
          animate={{ opacity: done ? 1 : 0 }}
          transition={{ duration: 0.4 }}
        >
          <span className="font-medium text-ink">{sc.caption.lead}</span>{" "}
          <span className="text-ink-muted">{sc.caption.rest}</span>
        </motion.p>

        <motion.button
          type="button"
          onClick={() => play(scene)}
          disabled={busy}
          className={buttonClass(done ? "secondary" : "primary", "md", "w-full")}
          whileHover={busy ? undefined : { scale: 1.02 }}
          whileTap={busy ? undefined : { scale: 0.97 }}
        >
          {busy ? "Broadcasting…" : done ? "Replay" : sc.cta}
        </motion.button>
      </div>
    </div>
  );
}
