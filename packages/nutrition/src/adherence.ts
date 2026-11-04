import type { MacroGrams } from "./energy";
import type { Targets } from "./targets";

export interface Tolerance {
  /** fraction of calories, e.g. 0.05 = ±5% */
  kcalPct: number;
  /** grams below target protein still counted as a pass */
  proteinShortfallG: number;
  /** fraction for carbs and fat */
  carbsPct: number;
  fatPct: number;
}

export const DEFAULT_TOLERANCE: Tolerance = { kcalPct: 0.05, proteinShortfallG: 10, carbsPct: 0.15, fatPct: 0.15 };

export interface Intake extends MacroGrams {
  kcal: number;
}

export type Check = { ok: boolean; actual: number; target: number; delta: number };

export interface Adherence {
  pass: boolean;
  kcal: Check;
  protein: Check;
  carbs: Check;
  fat: Check;
}

const check = (actual: number, target: number, ok: boolean): Check => ({ ok, actual, target, delta: actual - target });

/** Does an average day hit the targets within tolerance? */
export function adherence(actual: Intake, t: Targets, tol: Tolerance = DEFAULT_TOLERANCE): Adherence {
  const kcal = check(actual.kcal, t.kcal, Math.abs(actual.kcal - t.kcal) <= t.kcal * tol.kcalPct);
  const protein = check(actual.protein, t.protein, actual.protein >= t.protein - tol.proteinShortfallG);
  const carbs = check(actual.carbs, t.carbs, t.carbs === 0 ? actual.carbs <= 20 : Math.abs(actual.carbs - t.carbs) <= t.carbs * tol.carbsPct);
  const fat = check(actual.fat, t.fat, t.fat === 0 ? actual.fat <= 10 : Math.abs(actual.fat - t.fat) <= t.fat * tol.fatPct);
  return { pass: kcal.ok && protein.ok && carbs.ok && fat.ok, kcal, protein, carbs, fat };
}
