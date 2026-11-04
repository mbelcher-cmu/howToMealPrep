"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PlanResult, Schedule } from "@prep-cart/planner";
import { periodBudget, useApp, type AppState } from "./store";

export type PlannerStatus = "idle" | "solving" | "error";

function requestFrom(s: AppState, avoidSets: string[][] = []) {
  return {
    days: s.days,
    targets: s.targets,
    occasions: s.occasions,
    budget: periodBudget(s),
    prefs: s.prefs,
    variety: s.variety,
    stores: s.stores,
    storeMode: s.storeMode,
    pantry: s.pantry,
    weights: { costVsMacros: s.costVsMacros },
    lockedRecipes: s.locked,
    avoidSets,
    priceOverrides: s.priceOverrides,
    timeLimit: 2,
  };
}
type Req = ReturnType<typeof requestFrom>;
const keyOf = (r: Req) => JSON.stringify({ ...r, avoidSets: undefined }, (_k, v) => (v === Infinity ? "inf" : v));

type Reply = { ok: boolean; result?: PlanResult; schedule?: Schedule; error?: string };
let worker: Worker | null = null;
let seq = 0;
const pending = new Map<number, (m: Reply) => void>();
function getWorker(): Worker {
  if (worker) return worker;
  worker = new Worker(new URL("./planner.worker.ts", import.meta.url));
  worker.onmessage = (e) => { const cb = pending.get(e.data.id); pending.delete(e.data.id); cb?.(e.data); };
  worker.onerror = () => { for (const [, cb] of pending) cb({ ok: false, error: "The planner failed to load." }); pending.clear(); worker = null; };
  return worker;
}
const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

function solve(req: Req) {
  const id = ++seq;
  return new Promise<Reply>((resolve) => {
    pending.set(id, resolve);
    getWorker().postMessage({ id, base: `${location.origin}${BASE}`, req });
  });
}

/** Module-level so every page shares one solving state. */
let shownSets: string[][] = [];
let ticketSeq = 0;
const listeners = new Set<(s: { status: PlannerStatus; error: string | null }) => void>();
let shared: { status: PlannerStatus; error: string | null } = { status: "idle", error: null };
function setShared(s: Partial<typeof shared>) { shared = { ...shared, ...s }; for (const l of listeners) l(shared); }

async function run(avoid: string[][] = []) {
  const ticket = ++ticketSeq;
  setShared({ status: "solving" });
  const r = await solve(requestFrom(useApp.getState(), avoid));
  if (ticket !== ticketSeq) return; // a newer request is on its way
  if (!r.ok || !r.result || !r.schedule) { setShared({ status: "error", error: r.error ?? "The planner stopped unexpectedly." }); return; }
  setShared({ status: "idle", error: null });
  const s = useApp.getState();
  s.savePlan({ id: `${Date.now()}`, key: keyOf(requestFrom(s)), createdAt: new Date().toISOString(), days: s.days, result: r.result, schedule: r.schedule });
}

/**
 * Keeps the current plan in sync with every input. Re-plans 400 ms after the last change and
 * drops results a newer change has already superseded. Mount it once (in the app shell).
 */
export function usePlannerSync() {
  const state = useApp();
  const key = useMemo(() => keyOf(requestFrom(state)), [state]);
  const hydrated = useHydrated();
  useEffect(() => {
    if (!hydrated || !state.onboarded) return;
    if (state.current?.key === key) return;
    const t = setTimeout(() => { shownSets = []; void run(); }, 400);
    return () => clearTimeout(t);
  }, [hydrated, key, state.onboarded, state.current?.key]);
}

/** Read the planner's status anywhere, plus the plan and "try another". */
export function usePlanner() {
  const [s, setS] = useState(shared);
  useEffect(() => { listeners.add(setS); setS(shared); return () => { listeners.delete(setS); }; }, []);
  const state = useApp();
  const key = useMemo(() => keyOf(requestFrom(state)), [state]);
  const tryAnother = useCallback(() => {
    const cur = useApp.getState().current;
    if (cur) shownSets.push(cur.result.recipes.map((p) => p.recipe.id));
    void run(shownSets.slice(-6));
  }, []);
  return { status: s.status, error: s.error, plan: state.current, stale: !!state.current && state.current.key !== key, replan: () => void run(), tryAnother };
}

/** True after the persisted store has loaded in the browser. */
export function useHydrated() {
  const [h, setH] = useState(false);
  const ref = useRef(false);
  useEffect(() => {
    if (ref.current) return;
    ref.current = true;
    if (useApp.persist.hasHydrated()) setH(true);
    const un = useApp.persist.onFinishHydration(() => setH(true));
    return un;
  }, []);
  return h;
}
