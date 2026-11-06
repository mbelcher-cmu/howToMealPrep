import { RECIPES, type MealType, type Recipe } from "@prep-cart/catalog";
import { splitTargets, type EatingOccasion, type Targets } from "@prep-cart/nutrition";
import { hardRejection, slotTypeFor } from "./filters";
import type { Preferences, Variety } from "./types";

/**
 * The meal picker: choose the week's recipes one at a time, Netflix style. After each pick the
 * macros that recipe will deliver (at the portion that fits best) are known, so the next pick is
 * aimed at what's left of the day: a light breakfast leaves a bigger lunch, a fatty lunch asks for
 * a leaner dinner. Recipes are the unit; portions do the fine-tuning (0.5 to 2.5 servings, quarter
 * steps, the same limits as the planner).
 */

export interface Macro4 { kcal: number; protein: number; carbs: number; fat: number }
export interface SlotGoal {
  slot: MealType;
  /** eating occasions of this kind a day (prepped only) */
  perDay: number;
  /** what one of those occasions should deliver */
  perMeal: Macro4;
  /** recipes to pick for it this week */
  picks: number;
}
export interface Portion extends Macro4 { portion: number; fit: number }

export const PICK_ORDER: MealType[] = ["breakfast", "main", "snack"];
const MIN_PORTION = 0.5;
const MAX_PORTION = 2.5;
const KEYS = ["kcal", "protein", "carbs", "fat"] as const;
/** how much each macro's miss counts: calories and protein matter most */
const MISS_WEIGHT: Macro4 = { kcal: 1, protein: 1.3, carbs: 0.6, fat: 0.6 };

const zero = (): Macro4 => ({ kcal: 0, protein: 0, carbs: 0, fat: 0 });

/** One goal per kind of prepped meal: per-meal macros and how many recipes to pick. */
export function pickerGoals(targets: Targets, occasions: EatingOccasion[], variety: Variety): SlotGoal[] {
  const parts = splitTargets(targets, occasions);
  const acc = new Map<MealType, { n: number; sum: Macro4 }>();
  occasions.forEach((o, i) => {
    if (!o.prepped) return;
    const slot = slotTypeFor(o);
    const a = acc.get(slot) ?? { n: 0, sum: zero() };
    a.n++;
    for (const k of KEYS) a.sum[k] += parts[i]![k];
    acc.set(slot, a);
  });
  return PICK_ORDER.filter((s) => acc.has(s)).map((slot) => {
    const a = acc.get(slot)!;
    const perMeal = Object.fromEntries(KEYS.map((k) => [k, a.sum[k] / a.n])) as unknown as Macro4;
    return { slot, perDay: a.n, perMeal, picks: Math.max(1, Math.min(4, variety[slot] || 1)) };
  });
}

/**
 * The portion of a recipe that comes closest to a meal's target, rounded to a quarter serving, and
 * how good the fit is (1 = spot on, 0 = far off).
 */
export function bestPortion(r: Recipe, target: Macro4): Portion {
  const n = r.perServing;
  // least squares on relative misses: minimise sum w * (p * n_k / t_k - 1)^2
  let num = 0; let den = 0;
  for (const k of KEYS) {
    const t = Math.max(target[k], k === "kcal" ? 50 : 3);
    const a = n[k] / t;
    num += MISS_WEIGHT[k] * a; den += MISS_WEIGHT[k] * a * a;
  }
  const raw = den > 0 ? num / den : 1;
  const portion = Math.min(MAX_PORTION, Math.max(MIN_PORTION, Math.round(raw * 4) / 4));
  let miss = 0; let wsum = 0;
  for (const k of KEYS) {
    const t = Math.max(target[k], k === "kcal" ? 50 : 3);
    miss += MISS_WEIGHT[k] * Math.min(1, ((portion * n[k] - target[k]) / t) ** 2);
    wsum += MISS_WEIGHT[k];
  }
  const fit = Math.max(0, 1 - Math.sqrt(miss / wsum) * 1.6);
  return { portion, fit, kcal: n.kcal * portion, protein: n.protein * portion, carbs: n.carbs * portion, fat: n.fat * portion };
}

export type Picks = Partial<Record<MealType, string[]>>;

/**
 * What the next recipe for `slot` should deliver per meal, given everything picked so far.
 * Misses from earlier kinds of meal (breakfast came in light) are spread over this kind and the
 * kinds still to pick, by their share of the day's calories; within a kind, the next recipe makes
 * up for the ones already picked, since they take turns through the week.
 */
export function nextTarget(goals: SlotGoal[], picks: Picks, slot: MealType, recipes: Record<string, Recipe>): Macro4 {
  const at = goals.findIndex((g) => g.slot === slot);
  const goal = goals[at];
  if (!goal) return zero();
  const carry = zero();
  for (const g of goals.slice(0, at)) {
    const chosen = (picks[g.slot] ?? []).map((id) => recipes[id]).filter((r): r is Recipe => !!r);
    if (!chosen.length) continue;
    const got = chosen.map((r) => bestPortion(r, g.perMeal));
    for (const k of KEYS) carry[k] += g.perDay * (g.perMeal[k] - got.reduce((t, p) => t + p[k], 0) / got.length);
  }
  // this kind and the later ones not started yet share the carry by calories
  const sharers = goals.slice(at).filter((g, i) => i === 0 || !(picks[g.slot] ?? []).length);
  const totalKcal = sharers.reduce((t, g) => t + g.perDay * g.perMeal.kcal, 0) || 1;
  const share = (goal.perDay * goal.perMeal.kcal) / totalKcal;
  const adj = zero();
  for (const k of KEYS) adj[k] = goal.perMeal[k] + (carry[k] * share) / goal.perDay;

  const chosen = (picks[slot] ?? []).map((id) => recipes[id]).filter((r): r is Recipe => !!r);
  const left = goal.picks - chosen.length;
  const out = zero();
  for (const k of KEYS) {
    const v = left > 0 ? (goal.picks * adj[k] - chosen.reduce((t, r) => t + bestPortion(r, adj)[k], 0)) / left : adj[k];
    // never aim somewhere silly because of one odd pick
    out[k] = Math.max(goal.perMeal[k] * 0.5, Math.min(goal.perMeal[k] * 1.6, v));
  }
  return out;
}

/** What a day of the picked recipes delivers, against the day's prepped target. */
export function pickedDay(goals: SlotGoal[], picks: Picks, recipes: Record<string, Recipe>): { got: Macro4; want: Macro4 } {
  const got = zero(); const want = zero();
  for (const g of goals) {
    for (const k of KEYS) want[k] += g.perDay * g.perMeal[k];
    const chosen = (picks[g.slot] ?? []).map((id) => recipes[id]).filter((r): r is Recipe => !!r);
    if (!chosen.length) continue;
    // each pick is sized for its own turn, the same way the picker aimed it
    const sized: Portion[] = [];
    chosen.forEach((r, i) => sized.push(bestPortion(r, nextTarget(goals, { ...picks, [g.slot]: chosen.slice(0, i).map((x) => x.id) }, g.slot, recipes))));
    for (const k of KEYS) got[k] += g.perDay * (g.perDay ? sized.reduce((t, p) => t + p[k], 0) / sized.length : 0);
  }
  return { got, want };
}

export interface PickCard { id: string; portion: Portion; taste: number; score: number; /** what this meal costs at that portion, when known */ cost?: number | null; /** cost over the remaining budget for a meal like this */ overBudget?: boolean }
export interface BudgetLeft {
  /** the whole period's grocery budget */
  total: number;
  /** what the picks so far are expected to cost over the period */
  spent: number;
  left: number;
  /** prepped meals not covered by a pick yet */
  mealsLeft: number;
  /** what the next meal of the current kind can cost, given what's left */
  perMeal: number;
}
export interface PickerRows {
  recommended: PickCard[];
  favorites: PickCard[];
  community: PickCard[];
  /** where the community picks came from: real ratings, or the featured meal preps until there are enough */
  communitySource: "ratings" | "featured";
  /** the target the cards are sized for */
  target: Macro4;
  /** the money left once the picks so far are paid for, when the budget is known */
  budget: BudgetLeft | null;
}

export interface PickerInput {
  goals: SlotGoal[];
  picks: Picks;
  slot: MealType;
  prefs: Preferences;
  ratings: Record<string, number>;
  /** setup favorites: recipe id -> place (1 = top) */
  rankings: Record<string, number>;
  /** predicted taste for unrated recipes, -1..1 */
  affinity: Record<string, number>;
  /** community averages (3+ raters) */
  stats: { id: string; avg: number; n: number }[];
  /** recipes from the featured meal preps, the fallback for community picks */
  featured: string[];
  recipes?: readonly Recipe[];
  /** cost of one serving, when known */
  servingCost?: (r: Recipe) => number | null;
  /** dollars per meal the budget allows, used when `budget` isn't given */
  mealBudget?: number;
  /** the period's grocery budget and its length in days: cards are then priced against what's left after the picks so far */
  budget?: { total: number; days: number };
}

/** How much the person should like a recipe, -1..1: their rating if they gave one, else the prediction. */
export function tasteOf(id: string, ratings: Record<string, number>, rankings: Record<string, number>, affinity: Record<string, number>): number {
  const stars = ratings[id];
  if (stars) return Math.max(-1, Math.min(1, (stars - 3) / 2));
  const place = rankings[id];
  if (place) return Math.max(0.4, 1 - 0.06 * (place - 1));
  return affinity[id] ?? 0;
}

/**
 * What's left of the budget once the picks so far are bought. Each pick covers its share of that kind
 * of meal over the period (two lunch-and-dinner picks over 7 days with 2 a day: 7 meals each), at the
 * portion that fits. The next meal's allowance is the money left over the meals left, scaled by how
 * big this kind of meal is (a snack gets less than a dinner).
 */
export function budgetLeft(goals: SlotGoal[], picks: Picks, slot: MealType, recipes: Record<string, Recipe>, servingCost: (r: Recipe) => number | null, budget: { total: number; days: number }): BudgetLeft {
  const days = Math.max(1, budget.days);
  let spent = 0; let mealsLeft = 0; let mealsAll = 0; let kcalAll = 0;
  for (const g of goals) {
    const meals = g.perDay * days;
    mealsAll += meals; kcalAll += meals * g.perMeal.kcal;
    const chosen = (picks[g.slot] ?? []).map((id) => recipes[id]).filter((r): r is Recipe => !!r).slice(0, g.picks);
    for (const r of chosen) {
      const c = servingCost(r);
      if (c != null && Number.isFinite(c)) spent += c * bestPortion(r, g.perMeal).portion * (meals / g.picks);
    }
    mealsLeft += meals * (1 - chosen.length / g.picks);
  }
  const left = budget.total - spent;
  const avgKcal = kcalAll / Math.max(1, mealsAll) || 1;
  const goal = goals.find((g) => g.slot === slot);
  const size = goal ? goal.perMeal.kcal / avgKcal : 1;
  const perMeal = mealsLeft > 0.01 ? (Math.max(0, left) / mealsLeft) * size : 0;
  return { total: budget.total, spent, left, mealsLeft: Math.round(mealsLeft), perMeal };
}

/**
 * The person's predicted preference for a recipe as a meal right now, the order every row is sorted
 * by: how much they should like it comes first, then how well a portion fits the macros left, then
 * the price against what's left of the budget (over it sinks hard, under it rises a little).
 */
export function pickScore(taste: number, fit: number, cost: number | null | undefined, mealBudget: number | undefined): number {
  let money = 0;
  if (cost != null && mealBudget != null) {
    const ratio = mealBudget > 0 ? cost / mealBudget : 3;
    money = ratio > 1 ? -0.45 * Math.min(1.5, ratio - 1) : 0.08 * (1 - ratio);
  }
  return 0.6 * ((taste + 1) / 2) + 0.4 * fit + money;
}

interface Pool { target: Macro4; budget: BudgetLeft | null; cards: PickCard[]; byId: Record<string, Recipe> }

/** Every recipe that could be this pick, scored and priced. */
function scoredPool(input: PickerInput): Pool {
  const recipes = input.recipes ?? RECIPES;
  const byId = Object.fromEntries(recipes.map((r) => [r.id, r]));
  const target = nextTarget(input.goals, input.picks, input.slot, byId);
  const budget = input.budget && input.servingCost ? budgetLeft(input.goals, input.picks, input.slot, byId, input.servingCost, input.budget) : null;
  const mealBudget = budget ? budget.perMeal : input.mealBudget;
  const taken = new Set(Object.values(input.picks).flat());
  const pool = recipes.filter((r) => r.mealType === input.slot && !taken.has(r.id) && !hardRejection(r, { ...input.prefs, ratings: input.ratings }));
  const cards = pool.map((r): PickCard => {
    const portion = bestPortion(r, target);
    const taste = tasteOf(r.id, input.ratings, input.rankings, input.affinity);
    const per = input.servingCost?.(r);
    const cost = per != null && Number.isFinite(per) ? per * portion.portion : null;
    return { id: r.id, portion, taste, cost, overBudget: cost != null && mealBudget != null && cost > mealBudget * 1.05, score: pickScore(taste, portion.fit, cost, mealBudget) };
  });
  return { target, budget, cards, byId };
}

const byScore = (a: PickCard, b: PickCard) => b.score - a.score;

/**
 * The rows of the picker for one kind of meal. Each recipe shows up in one row only (favorites claim
 * theirs, then community picks, then recommendations), and every row is sorted best first by the
 * person's predicted preference with the remaining budget priced in.
 */
export function pickerRows(input: PickerInput): PickerRows {
  const { cards, target, budget } = scoredPool(input);
  const favorites = cards.filter((c) => (input.ratings[c.id] ?? 0) >= 4 || input.rankings[c.id]).sort(byScore).slice(0, 12);
  const shown = new Set(favorites.map((c) => c.id));
  const stat = new Map(input.stats.filter((s) => s.n >= 3).map((s) => [s.id, s]));
  // Bayesian average: a 5.0 from 3 people counts for less than a 4.7 from 40
  const loved = (id: string) => { const s = stat.get(id)!; return (s.avg * s.n + 3.5 * 5) / (s.n + 5); };
  // the community row holds what cooks love most, in the order this person should like them
  let community = cards.filter((c) => !shown.has(c.id) && stat.has(c.id) && loved(c.id) >= 3.6)
    .sort((a, b) => loved(b.id) - loved(a.id)).slice(0, 12).sort(byScore);
  let communitySource: PickerRows["communitySource"] = "ratings";
  if (community.length < 3) {
    const featured = new Set(input.featured);
    community = cards.filter((c) => !shown.has(c.id) && featured.has(c.id)).sort(byScore).slice(0, 12);
    communitySource = "featured";
  }
  for (const c of community) shown.add(c.id);
  const recommended = cards.filter((c) => !shown.has(c.id) && !input.ratings[c.id] && c.portion.fit >= 0.25).sort(byScore).slice(0, 12);
  return { recommended, favorites, community, communitySource, target, budget };
}

/** Recipes of this kind matching a search (name, ingredient or cuisine), best first. Picked and ruled-out recipes are left out. */
export function searchPicks(input: PickerInput, query: string, limit = 24): PickCard[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const { cards, byId } = scoredPool(input);
  const text = (r: Recipe) => [r.name, ...r.cuisines, ...r.moods, ...r.lines.map((l) => l.ingredientId.replace(/_/g, " "))].join(" ").toLowerCase();
  return cards.filter((c) => { const t = text(byId[c.id]!); return words.every((w) => t.includes(w)); }).sort(byScore).slice(0, limit);
}

/**
 * "Surprise me": a recipe that fits the macros and isn't one you'd dislike, picked at random with
 * better fits more likely. `rand` returns 0..1. Prefers cuisines not picked yet this week.
 */
export function surprisePick(input: PickerInput, rand: () => number = Math.random): PickCard | null {
  const recipes = input.recipes ?? RECIPES;
  const byId = Object.fromEntries(recipes.map((r) => [r.id, r]));
  const target = nextTarget(input.goals, input.picks, input.slot, byId);
  const taken = new Set(Object.values(input.picks).flat());
  const cuisines = new Set([...taken].flatMap((id) => byId[id]?.cuisines ?? []));
  const pool = recipes
    .filter((r) => r.mealType === input.slot && !taken.has(r.id) && !hardRejection(r, { ...input.prefs, ratings: input.ratings }))
    .map((r) => ({ r, p: bestPortion(r, target), taste: tasteOf(r.id, input.ratings, input.rankings, input.affinity) }))
    .filter((x) => x.p.fit >= 0.35 && x.taste > -0.3);
  if (!pool.length) return null;
  const weight = (x: (typeof pool)[number]) => x.p.fit * (x.r.cuisines.some((c) => !cuisines.has(c)) ? 2 : 1) * (1 + Math.max(0, x.taste));
  const total = pool.reduce((t, x) => t + weight(x), 0);
  let roll = rand() * total;
  for (const x of pool) { roll -= weight(x); if (roll <= 0) return { id: x.r.id, portion: x.p, taste: x.taste, score: x.p.fit }; }
  const last = pool[pool.length - 1]!;
  return { id: last.r.id, portion: last.p, taste: last.taste, score: last.p.fit };
}
