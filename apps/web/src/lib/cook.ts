"use client";
import { RECIPES_BY_ID } from "@prep-cart/catalog";
import type { Batch } from "@prep-cart/planner";
import type { SavedPlan } from "./store";
import { safeStorage } from "./storage";

/** The batches cooked in each prep session, with one container per person per meal. */
export function sessionBatches(plan: SavedPlan): Batch[][] {
  const hh = plan.result.household ?? { people: 1, factor: 1 };
  return plan.schedule.sessions.map((sess) => sess.batches.flatMap((b) => {
    const recipe = RECIPES_BY_ID[b.recipeId];
    const p = plan.result.recipes.find((x) => x.recipe.id === b.recipeId);
    const portion = p?.portion ?? 1;
    // one container per person per meal: average container size across the household
    const each = p?.household?.totalMeals ? p.servings / p.household.totalMeals : (portion * hh.factor) / hh.people;
    return recipe ? [{ recipe, servings: b.servings, portion: each }] : [];
  }));
}

/** Clock time for a step that starts `plus` minutes after `start` ("15:00"). */
export const clockAt = (start: string, plus: number) => {
  const [h, m] = start.split(":").map(Number);
  const d = new Date(2000, 0, 1, h ?? 0, (m ?? 0) + plus);
  return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
};

export const minutesWord = (n: number) => (n >= 60 ? `${Math.floor(n / 60)} h${n % 60 ? ` ${n % 60} min` : ""}` : `${n} min`);

/** Progress through a cook session on this device: which steps are done and when each timer ends. */
export interface CookProgress { done: string[]; timers: Record<string, number> }
const key = (planId: string, session: number) => `prep-cart-cook:${planId}:${session}`;

export function loadProgress(planId: string, session: number): CookProgress {
  try {
    const raw = JSON.parse(safeStorage.getItem(key(planId, session)) ?? "null") as Partial<CookProgress> | null;
    return {
      done: Array.isArray(raw?.done) ? raw!.done.filter((x): x is string => typeof x === "string") : [],
      timers: raw?.timers && typeof raw.timers === "object" ? Object.fromEntries(Object.entries(raw.timers).filter(([, v]) => typeof v === "number")) : {},
    };
  } catch { return { done: [], timers: {} }; }
}
export function saveProgress(planId: string, session: number, p: CookProgress) {
  safeStorage.setItem(key(planId, session), JSON.stringify(p));
}
export function clearProgress(planId: string, session: number) {
  safeStorage.removeItem(key(planId, session));
}
