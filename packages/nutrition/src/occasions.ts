import { KCAL_PER_GRAM, kcalFromMacros, MACROS, type MacroGrams, type MacroKey } from "./energy";
import { editCaloriesWithLocks, editMacroWithLocks, fiberFor, type Targets } from "./targets";

export type OccasionKind = "meal" | "snack";

export interface EatingOccasion {
  id: string;
  kind: OccasionKind;
  name: string;
  /** relative share of the day's calories; normalized across occasions */
  weight: number;
  /** true when this occasion comes from the prepped batch; false keeps an allowance for eating out or cooking fresh */
  prepped: boolean;
  /** fixed grams for this occasion; the others share what is left of the day */
  macros?: MacroGrams;
  /** how this meal leans (more protein, lighter...); the day's totals never change, other meals rebalance */
  style?: MealStyle;
}

/**
 * Meal styles: a simple way to shape one meal without typing grams. `kcal` scales the meal's
 * share of the day's calories; `tilt` leans its macro mix. The day still adds up exactly: what
 * one meal takes, the others give back.
 */
export const MEAL_STYLES = {
  balanced: { label: "Balanced", detail: "Its fair share of the day.", kcal: 1, tilt: { protein: 1, carbs: 1, fat: 1 } },
  protein: { label: "High protein", detail: "More protein here, a bit less in your other meals.", kcal: 1, tilt: { protein: 1.6, carbs: 0.8, fat: 0.8 } },
  light: { label: "Lighter", detail: "About a quarter fewer calories; your other meals get them.", kcal: 0.75, tilt: { protein: 1, carbs: 1, fat: 1 } },
  hearty: { label: "Bigger", detail: "About a quarter more calories, taken from your other meals.", kcal: 1.25, tilt: { protein: 1, carbs: 1, fat: 1 } },
  lowCarb: { label: "Low carb", detail: "Fewer carbs here; they move to your other meals.", kcal: 1, tilt: { protein: 1.3, carbs: 0.3, fat: 1.5 } },
} as const satisfies Record<string, { label: string; detail: string; kcal: number; tilt: Record<MacroKey, number> }>;
export type MealStyle = keyof typeof MEAL_STYLES;

const styleOf = (o: EatingOccasion) => MEAL_STYLES[o.style ?? "balanced"] ?? MEAL_STYLES.balanced;
const isStyled = (o: EatingOccasion) => !o.macros && !!o.style && o.style !== "balanced" && o.style in MEAL_STYLES;

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
  // occasions with their own macros keep them; the rest share what is left of the day
  const fixed = (k: keyof MacroGrams) => occasions.reduce((a, o) => a + (o.macros ? Math.max(0, Math.round(o.macros[k])) : 0), 0);
  const left: MacroGrams = { protein: Math.max(0, t.protein - fixed("protein")), carbs: Math.max(0, t.carbs - fixed("carbs")), fat: Math.max(0, t.fat - fixed("fat")) };
  const shares = occasions.some(isStyled) ? styledWeights(left, occasions) : null;
  const w = occasions.map((o) => (o.macros ? 0 : Math.max(0, o.weight)));
  const p = apportion(left.protein, shares ? shares.protein : w);
  const c = apportion(left.carbs, shares ? shares.carbs : w);
  const f = apportion(left.fat, shares ? shares.fat : w);
  return occasions.map((o, i) => {
    const g = o.macros
      ? { protein: Math.max(0, Math.round(o.macros.protein)), carbs: Math.max(0, Math.round(o.macros.carbs)), fat: Math.max(0, Math.round(o.macros.fat)) }
      : { protein: p[i]!, carbs: c[i]!, fat: f[i]! };
    return { occasionId: o.id, ...g, kcal: kcalFromMacros(g) };
  });
}

/**
 * How much of each macro each occasion gets when some meals have a style. Each meal's calorie
 * budget is its weight times its style's calorie factor; its macro mix starts as the day's mix
 * leaned by the style's tilt. Then rows (meal calories) and columns (the day's grams of each
 * macro) are scaled in turn until both add up (iterative proportional fitting), so what one meal
 * takes the others give back and nothing about the day changes.
 */
function styledWeights(left: MacroGrams, occasions: EatingOccasion[]): Record<MacroKey, number[]> {
  const colKcal = MACROS.map((k) => left[k] * KCAL_PER_GRAM[k]);
  const dayKcal = colKcal.reduce((a, b) => a + b, 0);
  const rowW = occasions.map((o) => (o.macros ? 0 : Math.max(0, o.weight) * styleOf(o).kcal));
  const rowSum = rowW.reduce((a, b) => a + b, 0);
  const zero = { protein: occasions.map(() => 0), carbs: occasions.map(() => 0), fat: occasions.map(() => 0) };
  if (dayKcal <= 0 || rowSum <= 0) return zero;
  const rowKcal = rowW.map((x) => (dayKcal * x) / rowSum);
  const X = occasions.map((o, i) => MACROS.map((k, j) => (rowKcal[i]! > 0 ? rowKcal[i]! * (colKcal[j]! / dayKcal) * styleOf(o).tilt[k] : 0)));
  for (let it = 0; it < 200; it++) {
    let worst = 0;
    MACROS.forEach((_, j) => {
      const sum = X.reduce((a, r) => a + r[j]!, 0);
      if (sum > 0) for (const r of X) r[j]! *= colKcal[j]! / sum;
    });
    X.forEach((r, i) => {
      const sum = r.reduce((a, b) => a + b, 0);
      if (sum > 0) { worst = Math.max(worst, Math.abs(sum - rowKcal[i]!)); for (let j = 0; j < 3; j++) r[j]! *= rowKcal[i]! / sum; }
    });
    if (worst < 0.01) break;
  }
  return { protein: X.map((r) => r[0]!), carbs: X.map((r) => r[1]!), fat: X.map((r) => r[2]!) };
}

/**
 * Change one macro of a single meal and keep that meal's calories: editing protein moves carbs
 * and fat together; editing carbs or fat holds protein and moves the other one. The rest of the
 * day rebalances through splitTargets.
 */
export function editMealMacro(part: MacroGrams, macro: MacroKey, grams: number): { macros: MacroGrams; clamped: boolean } {
  const g = { protein: Math.max(0, Math.round(part.protein)), carbs: Math.max(0, Math.round(part.carbs)), fat: Math.max(0, Math.round(part.fat)) };
  const kcal = kcalFromMacros(g);
  const r = editMacroWithLocks({ ...g, kcal, fiber: fiberFor(kcal) }, macro, grams, macro === "protein" ? [] : ["protein"]);
  return { macros: { protein: r.targets.protein, carbs: r.targets.carbs, fat: r.targets.fat }, clamped: r.clamped };
}

/** Change one meal's calories, holding its protein; carbs and fat scale to fit. */
export function editMealCalories(part: MacroGrams, kcal: number): { macros: MacroGrams; clamped: boolean } {
  const g = { protein: Math.max(0, Math.round(part.protein)), carbs: Math.max(0, Math.round(part.carbs)), fat: Math.max(0, Math.round(part.fat)) };
  const cur = kcalFromMacros(g);
  const r = editCaloriesWithLocks({ ...g, kcal: cur, fiber: fiberFor(cur) }, kcal, ["protein"]);
  return { macros: { protein: r.targets.protein, carbs: r.targets.carbs, fat: r.targets.fat }, clamped: r.clamped };
}

/** Grams of each macro that custom occasions take beyond the day's target (0 when they fit). */
export function customOverflow(t: Targets, occasions: EatingOccasion[]): MacroGrams {
  const sum = (k: keyof MacroGrams) => occasions.reduce((a, o) => a + (o.macros ? o.macros[k] : 0), 0);
  return { protein: Math.max(0, sum("protein") - t.protein), carbs: Math.max(0, sum("carbs") - t.carbs), fat: Math.max(0, sum("fat") - t.fat) };
}

/** What the prepped batch must cover per day, and the allowance left for unprepped occasions. */
export function preppedShare(t: Targets, occasions: EatingOccasion[]): { prepped: OccasionTargets[]; allowanceKcal: number } {
  const all = splitTargets(t, occasions);
  const prepped = all.filter((_, i) => occasions[i]!.prepped);
  const allowanceKcal = all.filter((_, i) => !occasions[i]!.prepped).reduce((a, o) => a + o.kcal, 0);
  return { prepped, allowanceKcal };
}
