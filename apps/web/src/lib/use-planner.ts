"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PlanResult, Schedule } from "@prep-cart/planner";
import { daysUntil, isoDay, periodBudget, useApp, type AppState } from "./store";
import { memberKcal } from "@/components/household";
import { reportError, track } from "./telemetry";
import { styledOccasions } from "./meal-styles";

export type PlannerStatus = "idle" | "solving" | "error";

/** Favorites per meal, best first, as recipe id -> place (1 = top pick). */
export function rankingsOf(favorites: AppState["favorites"] | undefined): Record<string, number> {
  const out: Record<string, number> = {};
  for (const list of Object.values(favorites ?? {})) (list ?? []).forEach((id, i) => { out[id] = i + 1; });
  return out;
}

function requestFrom(s: AppState, avoidSets: string[][] = []) {
  const resting = (s.resting ?? []).filter((id) => !s.locked.includes(id));
  return {
    days: s.days,
    targets: s.targets,
    occasions: styledOccasions(s.occasions),
    budget: periodBudget(s),
    prefs: { ...s.prefs, ratings: s.ratings, rankings: rankingsOf(s.favorites), ...(resting.length ? { excludeRecipes: [...(s.prefs.excludeRecipes ?? []), ...resting] } : {}) },
    customRecipes: s.customRecipes,
    variety: s.variety,
    stores: s.stores,
    storeMode: s.storeMode,
    // drop spoiled food; tell the planner what spoils soon
    pantry: (s.pantryForPlan ?? s.pantry).filter((p) => !p.useBy || daysUntil(p.useBy) >= 0).map(({ useBy, ...p }) => (useBy ? { ...p, daysLeft: daysUntil(useBy) } : p)),
    weights: { costVsMacros: s.costVsMacros },
    lockedRecipes: s.locked,
    preferRecipes: (s.held ?? []).filter((id) => !(s.prefs.excludeRecipes ?? []).includes(id)),
    avoidSets,
    priceOverrides: s.priceOverrides,
    deals: s.deals.filter((d) => d.endsOn >= isoDay()).map(({ ingredientId, chain, price, endsOn }) => ({ ingredientId, chain, price, endsOn })),
    today: isoDay(),
    timeLimit: 2,
    household: (s.household ?? []).map((m) => ({ id: m.id, name: m.name.trim() || "Someone", kcal: memberKcal(m) })),
    eatingOut: s.eatingOut.filter((e) => e.day < s.days && s.occasions.some((o) => o.id === e.occasionId)),
  };
}
type Req = ReturnType<typeof requestFrom>;
const keyOf = (r: Req) => JSON.stringify({ ...r, avoidSets: undefined, preferRecipes: undefined }, (_k, v) => (v === Infinity ? "inf" : v));

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
  if (r.ok && r.result?.status === "no_recipes" && useApp.getState().resting?.length) {
    // resting last week's recipes left nothing that fits: let them back in (the sync re-plans) rather than show an empty week
    useApp.getState().set({ resting: [] });
    if (!useApp.getState().onboarded) setShared({ status: "idle" });
    return;
  }
  if (!r.ok || !r.result || !r.schedule) { setShared({ status: "error", error: r.error ?? "The planner stopped unexpectedly." }); reportError(new Error(r.error ?? "planner failed"), { where: "planner" }); return; }
  setShared({ status: "idle", error: null });
  const s = useApp.getState();
  s.savePlan({ id: `${Date.now()}`, key: keyOf(requestFrom(s)), createdAt: new Date().toISOString(), days: s.days, result: r.result, schedule: r.schedule });
  track("plan_built", { status: r.result.status, recipes: r.result.recipes.length, days: s.days, under_budget: r.result.cost <= r.result.budget, people: r.result.household?.people ?? 1, solve_ms: r.result.solveMs, another: avoid.length > 0 });
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
    const app = useApp.getState();
    const cur = app.current;
    // "try another" wants a fresh menu, so stop holding the week from the last swap (not part of the plan key)
    if (app.held?.length) app.set({ held: [] });
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
