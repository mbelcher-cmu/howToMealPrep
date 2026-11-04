import { KCAL_PER_GRAM, kcalFromMacros, type MacroGrams, type MacroKey } from "./energy";
import { type ActivityLevel, type BodyStats, maintenanceKcal } from "./energy-needs";
import { kgToLb } from "./units";

/**
 * Daily targets. Invariant: kcal === 4*protein + 4*carbs + 9*fat exactly.
 * Grams are whole numbers; calories are always derived from them.
 */
export interface Targets extends MacroGrams {
  kcal: number;
  fiber: number;
}

export type Goal = "lose" | "maintain" | "gain";
export const GOAL_ADJUSTMENT: Record<Goal, number> = { lose: -0.2, maintain: 0, gain: 0.1 };

/** Minimum daily calories the app will plan for without a clinician-set target. */
export const KCAL_FLOOR = { male: 1500, female: 1200 } as const;
export const KCAL_CEILING = 6000;

export interface Split {
  protein: number;
  carbs: number;
  fat: number;
}

export const SPLIT_PRESETS = {
  highProtein: { label: "High protein", split: { protein: 0.3, carbs: 0.4, fat: 0.3 } },
  balanced: { label: "Balanced", split: { protein: 0.2, carbs: 0.5, fat: 0.3 } },
  lowerCarb: { label: "Lower carb", split: { protein: 0.35, carbs: 0.25, fat: 0.4 } },
  endurance: { label: "Endurance", split: { protein: 0.2, carbs: 0.55, fat: 0.25 } },
} as const satisfies Record<string, { label: string; split: Split }>;
export type SplitPreset = keyof typeof SPLIT_PRESETS;

/** 14 g fiber per 1,000 kcal (Dietary Guidelines for Americans). */
export const fiberFor = (kcal: number) => Math.round((kcal / 1000) * 14);

function finalize(m: MacroGrams): Targets {
  const g = { protein: Math.max(0, Math.round(m.protein)), carbs: Math.max(0, Math.round(m.carbs)), fat: Math.max(0, Math.round(m.fat)) };
  const kcal = kcalFromMacros(g);
  return { ...g, kcal, fiber: fiberFor(kcal) };
}

/**
 * Integer grams for a calorie goal and a split. Searches nearby gram values so the derived
 * kcal lands as close as possible to the requested kcal (always within 4 kcal).
 */
export function targetsFromSplit(kcal: number, split: Split): Targets {
  const sum = split.protein + split.carbs + split.fat;
  if (!(sum > 0)) throw new RangeError("Split must have a positive total.");
  const s = { protein: split.protein / sum, carbs: split.carbs / sum, fat: split.fat / sum };
  const p = Math.round((kcal * s.protein) / KCAL_PER_GRAM.protein);
  const f = Math.round((kcal * s.fat) / KCAL_PER_GRAM.fat);
  // carbs absorb the remainder so the total lands on target
  const c = Math.max(0, Math.round((kcal - p * 4 - f * 9) / 4));
  return finalize({ protein: p, carbs: c, fat: f });
}

export interface SuggestInput {
  stats: BodyStats;
  activity: ActivityLevel;
  goal: Goal;
  /** grams of protein per lb of body weight; default by goal */
  proteinPerLb?: number;
  /** share of calories from fat; default 0.3 */
  fatShare?: number;
}

export interface Suggestion {
  targets: Targets;
  maintenanceKcal: number;
  goalKcal: number;
  /** true when the floor raised the calorie goal */
  flooredAtMinimum: boolean;
}

/** Suggested daily targets: protein by body weight, fat by share, carbs fill the rest. */
export function suggestTargets(input: SuggestInput): Suggestion {
  const maint = maintenanceKcal(input.stats, input.activity);
  let goalKcal = maint * (1 + GOAL_ADJUSTMENT[input.goal]);
  const floor = KCAL_FLOOR[input.stats.sex];
  const flooredAtMinimum = goalKcal < floor;
  goalKcal = Math.min(KCAL_CEILING, Math.max(floor, goalKcal));
  goalKcal = Math.round(goalKcal / 10) * 10;

  const perLb = input.proteinPerLb ?? (input.goal === "maintain" ? 0.7 : 0.9);
  const fatShare = input.fatShare ?? 0.3;
  let protein = Math.round(kgToLb(input.stats.weightKg) * perLb);
  // keep protein at or below 40% of calories so carbs and fat stay sensible
  protein = Math.min(protein, Math.round((goalKcal * 0.4) / 4));
  const fat = Math.round((goalKcal * fatShare) / 9);
  const carbs = Math.max(0, Math.round((goalKcal - protein * 4 - fat * 9) / 4));
  return { targets: finalize({ protein, carbs, fat }), maintenanceKcal: Math.round(maint), goalKcal, flooredAtMinimum };
}

export type Balancer = MacroKey;

export interface EditResult {
  targets: Targets;
  /** true when the requested value could not be honored and was clamped */
  clamped: boolean;
}

/**
 * Calories-locked editing: change one macro's grams and move the balancer macro so that
 * calories stay (as close as integer grams allow) the same. If the balancer would go below
 * zero, the edited macro is clamped to the largest value that fits.
 */
export function editMacroKeepingCalories(t: Targets, macro: MacroKey, grams: number, balancer: Balancer): EditResult {
  if (macro === balancer) throw new Error("The edited macro and the balancer must differ.");
  const target = Math.max(0, Math.round(grams));
  const kcal = t.kcal;
  const third = (["protein", "carbs", "fat"] as const).find((k) => k !== macro && k !== balancer)!;
  const fixedKcal = t[third] * KCAL_PER_GRAM[third];
  const maxEdited = Math.floor((kcal - fixedKcal) / KCAL_PER_GRAM[macro]);
  const value = Math.min(target, Math.max(0, maxEdited));
  const remaining = kcal - fixedKcal - value * KCAL_PER_GRAM[macro];
  const balancerGrams = Math.max(0, Math.round(remaining / KCAL_PER_GRAM[balancer]));
  const next = { protein: t.protein, carbs: t.carbs, fat: t.fat, [macro]: value, [balancer]: balancerGrams } as MacroGrams;
  return { targets: finalize(next), clamped: value !== target };
}

const MACROS = ["protein", "carbs", "fat"] as const;

/**
 * Lock-aware editing. Locked macros never move. Changing one macro moves the other unlocked
 * macros (in proportion to the calories they carry now) so total calories stay the same. With
 * every other macro locked there is nothing to rebalance, so calories follow the edit instead.
 */
export function editMacroWithLocks(t: Targets, macro: MacroKey, grams: number, locked: readonly MacroKey[]): EditResult & { kcalChanged: boolean } {
  const target = Math.max(0, Math.round(grams));
  const free = MACROS.filter((k) => k !== macro && !locked.includes(k));
  if (!free.length) return { targets: editMacroFree(t, macro, target), clamped: false, kcalChanged: true };
  const fixedKcal = MACROS.filter((k) => k !== macro && locked.includes(k)).reduce((a, k) => a + t[k] * KCAL_PER_GRAM[k], 0);
  const room = Math.max(0, t.kcal - fixedKcal);
  const value = Math.min(target, Math.floor(room / KCAL_PER_GRAM[macro]));
  const next = { protein: t.protein, carbs: t.carbs, fat: t.fat, [macro]: value } as MacroGrams;
  Object.assign(next, spread(room - value * KCAL_PER_GRAM[macro], free, t));
  return { targets: finalize(next), clamped: value !== target, kcalChanged: false };
}

/** Share kcal among macros in proportion to the calories each carries now (evenly when none do). */
function spread(kcal: number, keys: readonly MacroKey[], t: MacroGrams): Partial<MacroGrams> {
  const cur = keys.map((k) => t[k] * KCAL_PER_GRAM[k]);
  const sum = cur.reduce((a, b) => a + b, 0);
  const out: Partial<MacroGrams> = {};
  let left = kcal;
  keys.forEach((k, i) => {
    const share = i === keys.length - 1 ? left : sum > 0 ? (kcal * cur[i]!) / sum : kcal / keys.length;
    const g = Math.max(0, Math.round(share / KCAL_PER_GRAM[k]));
    out[k] = g;
    left -= g * KCAL_PER_GRAM[k];
  });
  return out;
}

/** Change calories while holding every locked macro; the unlocked ones scale to fit. */
export function editCaloriesWithLocks(t: Targets, kcal: number, locked: readonly MacroKey[]): EditResult {
  const want = Math.max(0, Math.round(kcal));
  const free = MACROS.filter((k) => !locked.includes(k));
  if (!free.length) return { targets: t, clamped: want !== t.kcal };
  const fixedKcal = MACROS.filter((k) => locked.includes(k)).reduce((a, k) => a + t[k] * KCAL_PER_GRAM[k], 0);
  const room = want - fixedKcal;
  const next = { protein: t.protein, carbs: t.carbs, fat: t.fat, ...spread(Math.max(0, room), free, t) } as MacroGrams;
  return { targets: finalize(next), clamped: room < 0 };
}

/** Grams mode: set any macro freely; calories follow. */
export function editMacroFree(t: Targets, macro: MacroKey, grams: number): Targets {
  return finalize({ protein: t.protein, carbs: t.carbs, fat: t.fat, [macro]: grams } as MacroGrams);
}

/**
 * Change calories. "keepProtein" holds protein grams and rescales carbs and fat in their
 * current proportion (what most lifters want); "keepSplit" keeps every macro's share.
 */
export function editCalories(t: Targets, kcal: number, mode: "keepProtein" | "keepSplit" = "keepProtein"): EditResult {
  const want = Math.round(kcal);
  if (mode === "keepSplit" || t.kcal === 0) {
    const cur = kcalFromMacros(t) || 1;
    const split = t.kcal === 0 ? SPLIT_PRESETS.balanced.split : { protein: (t.protein * 4) / cur, carbs: (t.carbs * 4) / cur, fat: (t.fat * 9) / cur };
    return { targets: targetsFromSplit(want, split), clamped: false };
  }
  const proteinKcal = t.protein * 4;
  if (want <= proteinKcal) {
    return { targets: finalize({ protein: Math.floor(want / 4), carbs: 0, fat: 0 }), clamped: true };
  }
  const rest = want - proteinKcal;
  const curRest = t.carbs * 4 + t.fat * 9;
  const fatShareOfRest = curRest > 0 ? (t.fat * 9) / curRest : 0.4;
  const fat = Math.round((rest * fatShareOfRest) / 9);
  const carbs = Math.max(0, Math.round((rest - fat * 9) / 4));
  return { targets: finalize({ protein: t.protein, carbs, fat }), clamped: false };
}
