import { kcalFromMacros, type MacroGrams } from "./energy";
import type { Targets } from "./targets";

export type OccasionKind = "meal" | "snack";

export interface EatingOccasion {
  id: string;
  kind: OccasionKind;
  name: string;
  /** relative share of the day's calories; normalized across occasions */
  weight: number;
  /** true when this occasion comes from the prepped batch; false keeps an allowance for eating out or cooking fresh */
  prepped: boolean;
}

export const MAX_MEALS = 6;
export const MAX_SNACKS = 4;
const MEAL_NAMES = ["Breakfast", "Lunch", "Dinner"];

/** Default structure: snacks get 10% each (capped at 40% total), meals share the rest evenly. */
export function defaultOccasions(meals: number, snacks: number): EatingOccasion[] {
  if (!Number.isInteger(meals) || meals < 1 || meals > MAX_MEALS) throw new RangeError(`Meals per day must be 1 to ${MAX_MEALS}.`);
  if (!Number.isInteger(snacks) || snacks < 0 || snacks > MAX_SNACKS) throw new RangeError(`Snacks per day must be 0 to ${MAX_SNACKS}.`);
  const snackShare = Math.min(0.1 * snacks, 0.4);
  const mealWeight = (1 - snackShare) / meals;
  const names = meals === 1 ? ["Main meal"] : meals === 2 ? ["Lunch", "Dinner"] : meals === 3 ? MEAL_NAMES : Array.from({ length: meals }, (_, i) => `Meal ${i + 1}`);
  const out: EatingOccasion[] = names.map((name, i) => ({ id: `meal-${i + 1}`, kind: "meal", name, weight: mealWeight, prepped: true }));
  for (let i = 0; i < snacks; i++) out.push({ id: `snack-${i + 1}`, kind: "snack", name: snacks === 1 ? "Snack" : `Snack ${i + 1}`, weight: snacks ? snackShare / snacks : 0, prepped: true });
  return out;
}

export interface OccasionTargets extends MacroGrams {
  occasionId: string;
  kcal: number;
}

/** Spread integer grams so the parts add up exactly to the whole (largest remainder). */
function apportion(total: number, weights: number[]): number[] {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (sum <= 0) return weights.map(() => 0);
  const raw = weights.map((w) => (total * w) / sum);
  const floors = raw.map(Math.floor);
  let left = total - floors.reduce((a, b) => a + b, 0);
  const order = raw.map((r, i) => ({ i, frac: r - Math.floor(r) })).sort((a, b) => b.frac - a.frac);
  for (const { i } of order) {
    if (left <= 0) break;
    floors[i]! += 1;
    left--;
  }
  return floors;
}

/**
 * Per-occasion targets. Each macro's grams are apportioned so occasions sum exactly to the
 * daily grams, and each occasion's kcal is derived from its own grams (4/4/9).
 */
export function splitTargets(t: Targets, occasions: EatingOccasion[]): OccasionTargets[] {
  const w = occasions.map((o) => Math.max(0, o.weight));
  const p = apportion(t.protein, w);
  const c = apportion(t.carbs, w);
  const f = apportion(t.fat, w);
  return occasions.map((o, i) => {
    const g = { protein: p[i]!, carbs: c[i]!, fat: f[i]! };
    return { occasionId: o.id, ...g, kcal: kcalFromMacros(g) };
  });
}

/** What the prepped batch must cover per day, and the allowance left for unprepped occasions. */
export function preppedShare(t: Targets, occasions: EatingOccasion[]): { prepped: OccasionTargets[]; allowanceKcal: number } {
  const all = splitTargets(t, occasions);
  const prepped = all.filter((_, i) => occasions[i]!.prepped);
  const allowanceKcal = all.filter((_, i) => !occasions[i]!.prepped).reduce((a, o) => a + o.kcal, 0);
  return { prepped, allowanceKcal };
}
