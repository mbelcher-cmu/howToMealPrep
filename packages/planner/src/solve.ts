import { CHAINS, INGREDIENTS, type ChainId, type MealType, type Recipe } from "@prep-cart/catalog";
import { splitTargets } from "@prep-cart/nutrition";
import { LpModel } from "./lp";
import { candidatePool, preferenceFit, servingCost, slotTypeFor } from "./filters";
import type { CartLine, DayNutrition, PlanRequest, PlanResult, PlannedRecipe, Weights } from "./types";

/** Minimal shape of the HiGHS solver object we use. */
export interface HighsLike {
  solve(model: string, options?: Record<string, unknown>): {
    Status: string;
    ObjectiveValue?: number;
    Columns: Record<string, unknown>;
  };
}

const SLOTS: MealType[] = ["breakfast", "main", "snack"];
const POOL_SIZE: Record<MealType, number> = { breakfast: 6, main: 12, snack: 5 };
const MIN_PORTION_Q = 2; // 0.5 serving, in quarter servings
const MAX_PORTION_Q = 10; // 2.5 servings

const DEFAULT_WEIGHTS: Weights = { costVsMacros: 0.5, extraStopCost: 4 };

/**
 * Build the week. In single-store mode each store is solved on its own (small, fast models) and
 * the best plan wins; in any-store mode one model also decides which stores to visit.
 */
export function plan(req: PlanRequest, highs: HighsLike): PlanResult {
  const t0 = Date.now();
  const stores = req.stores.filter((s) => CHAINS.some((c) => c.id === s));
  if (req.storeMode === "any" || stores.length <= 1) {
    const r = planFor(req, highs, stores);
    return { ...r.result, solveMs: Date.now() - t0 };
  }
  let best: { result: PlanResult; objective: number } | null = null;
  const perStore = Math.max(0.5, (req.timeLimit ?? 2) / stores.length);
  for (const s of stores) {
    const r = planFor({ ...req, timeLimit: perStore }, highs, [s]);
    if (r.result.status === "no_recipes" && !r.result.recipes.length) { if (!best) best = { ...r, objective: Infinity }; continue; }
    if (!best || r.objective < best.objective) best = r;
  }
  return { ...best!.result, solveMs: Date.now() - t0 };
}

function planFor(req: PlanRequest, highs: HighsLike, stores: ChainId[]): { result: PlanResult; objective: number } {
  const t0 = Date.now();
  const days = req.days;
  const weights = { ...DEFAULT_WEIGHTS, ...req.weights };
  const wrap = (result: PlanResult, objective = Infinity) => ({ result, objective });
  const empty = (status: PlanResult["status"], message: string): PlanResult => ({
    status, message, recipes: [], daily: { kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, sodiumMg: 0 }, allowanceKcal: 0,
    cart: [], pantryUsed: [], cost: 0, stores: [], budget: req.budget, solveMs: Date.now() - t0,
  });
  if (!stores.length) return wrap(empty("no_recipes", "Pick at least one store."));
  if (!(days >= 1 && days <= 7)) return wrap(empty("no_recipes", "Plan between 1 and 7 days."));

  // ── Targets per slot type (prepped occasions only) ──
  const parts = splitTargets(req.targets, req.occasions);
  const slotCount: Record<MealType, number> = { breakfast: 0, main: 0, snack: 0 };
  const slotKcal: Record<MealType, number> = { breakfast: 0, main: 0, snack: 0 };
  const slotMacros: Record<MealType, { protein: number; carbs: number; fat: number; custom: boolean }> = {
    breakfast: { protein: 0, carbs: 0, fat: 0, custom: false }, main: { protein: 0, carbs: 0, fat: 0, custom: false }, snack: { protein: 0, carbs: 0, fat: 0, custom: false },
  };
  const dayTarget = { kcal: 0, protein: 0, carbs: 0, fat: 0 };
  let allowanceKcal = 0;
  req.occasions.forEach((o, i) => {
    const part = parts[i]!;
    if (!o.prepped) { allowanceKcal += part.kcal; return; }
    const t = slotTypeFor(o);
    slotCount[t] += 1;
    slotKcal[t] += part.kcal;
    slotMacros[t].protein += part.protein; slotMacros[t].carbs += part.carbs; slotMacros[t].fat += part.fat;
    if (o.macros) slotMacros[t].custom = true;
    dayTarget.kcal += part.kcal; dayTarget.protein += part.protein; dayTarget.carbs += part.carbs; dayTarget.fat += part.fat;
  });
  const totalMeals = SLOTS.reduce((a, s) => a + slotCount[s], 0);
  if (!totalMeals) return wrap(empty("no_recipes", "Mark at least one meal or snack as prepped."));

  // ── Free ingredients (pantry staples) and pantry amounts ──
  const pantryGrams = new Map<string, number>();
  for (const p of req.pantry) pantryGrams.set(p.ingredientId, (pantryGrams.get(p.ingredientId) ?? 0) + p.grams);
  const freeIds = new Set([...pantryGrams].filter(([, g]) => g === Infinity).map(([id]) => id));

  // ── Candidate pools ──
  const pools: Record<MealType, { r: Recipe; fit: number; reasons: string[]; cost: number }[]> = { breakfast: [], main: [], snack: [] };
  const variety: Record<MealType, number> = { breakfast: 0, main: 0, snack: 0 };
  for (const slot of SLOTS) {
    const meals = slotCount[slot] * days;
    if (!meals) continue;
    const { ok, rejected } = candidatePool(slot, req.prefs);
    if (!ok.length) {
      const top = summarizeRejections(rejected.map((r) => r.reason));
      return wrap(empty("no_recipes", `No ${slot === "main" ? "lunch or dinner" : slot} recipes fit your rules (${top}). Loosen a diet, allergy or time limit.`));
    }
    const scored = ok.map((r) => {
      const { fit, reasons } = preferenceFit(r, req.prefs);
      const cost = servingCost(r, req.prices, stores, freeIds);
      const proteinShare = (r.perServing.protein * 4) / Math.max(1, r.perServing.kcal);
      const targetShare = (dayTarget.protein * 4) / Math.max(1, dayTarget.kcal);
      const proteinMatch = -Math.abs(proteinShare - targetShare) * 10;
      return { r, fit, reasons, cost, rank: fit * 2 + proteinMatch - cost * (0.3 + weights.costVsMacros) };
    });
    const locked = new Set(req.lockedRecipes ?? []);
    // "must" wishes become hard rules for lunch and dinner when enough recipes qualify
    if (slot === "main") {
      for (const [field, wishes] of [["cuisines", req.prefs.cuisines], ["moods", req.prefs.moods], ["proteins", req.prefs.proteins]] as const) {
        const musts = Object.entries(wishes).filter(([, w]) => w === "must").map(([k]) => k);
        if (!musts.length) continue;
        const keep = scored.filter((x) => locked.has(x.r.id) || (x.r[field] as readonly string[]).some((t) => musts.includes(t)));
        if (keep.length >= Math.min(req.variety.main, meals)) scored.splice(0, scored.length, ...keep);
      }
    }
    scored.sort((a, b) => Number(locked.has(b.r.id)) - Number(locked.has(a.r.id)) || b.rank - a.rank);
    pools[slot] = scored.slice(0, Math.max(POOL_SIZE[slot], scored.filter((s) => locked.has(s.r.id)).length));
    variety[slot] = Math.max(1, Math.min(req.variety[slot], pools[slot].length, meals));
  }

  // ── Model ──
  const m = new LpModel();
  const macroW = 1.8 - 1.6 * weights.costVsMacros;
  const costW = 0.2 + 1.8 * weights.costVsMacros;
  const all: { key: string; slot: MealType; r: Recipe; fit: number; reasons: string[]; cost: number }[] = [];
  for (const slot of SLOTS) pools[slot].forEach((c, i) => all.push({ key: `${slot[0]}${i}`, slot, ...c }));

  for (const slot of SLOTS) {
    const N = slotCount[slot] * days;
    if (!N) continue;
    const members = all.filter((a) => a.slot === slot);
    m.addRow(members.map((a) => [1, `y_${a.key}`]), "=", variety[slot], `var_${slot}`);
    m.addRow(members.map((a) => [1, `n_${a.key}`]), "=", N, `meals_${slot}`);
    for (const a of members) {
      m.binary(`y_${a.key}`);
      m.integer(`n_${a.key}`); m.bound(`n_${a.key}`, 0, N);
      m.integer(`s_${a.key}`); m.bound(`s_${a.key}`, 0, MAX_PORTION_Q * N);
      m.addRow([[1, `n_${a.key}`], [-N, `y_${a.key}`]], "<=", 0);
      m.addRow([[1, `n_${a.key}`], [-1, `y_${a.key}`]], ">=", 0);
      m.addRow([[1, `s_${a.key}`], [-MIN_PORTION_Q, `n_${a.key}`]], ">=", 0);
      m.addRow([[1, `s_${a.key}`], [-MAX_PORTION_Q, `n_${a.key}`]], "<=", 0);
      // preference fit is a reward for choosing the recipe
      m.addObjective(`y_${a.key}`, -1.0 * a.fit);
      // food safety: recipes that don't keep the whole period and can't be frozen are less attractive
      if (a.r.fridgeDays < days && !a.r.freezerFriendly) m.addObjective(`y_${a.key}`, 1.5 * (days - a.r.fridgeDays));
    }
    // calories per slot type (keeps breakfast breakfast-sized)
    const tk = slotKcal[slot] * days;
    m.addRow([...members.map((a): [number, string] => [a.r.perServing.kcal / 4, `s_${a.key}`]), [-1, `kp_${slot}`], [1, `kn_${slot}`]], "=", tk);
    m.addObjective(`kp_${slot}`, 0.004 * macroW);
    m.addObjective(`kn_${slot}`, 0.004 * macroW);
    // per-meal macros the person set by hand are honored per slot, not just across the day
    if (slotMacros[slot].custom) {
      for (const k of ["protein", "carbs", "fat"] as const) {
        const v = `${k[0]}${slot}`;
        m.addRow([...members.map((a): [number, string] => [a.r.perServing[k] / 4, `s_${a.key}`]), [-1, `${v}_p`], [1, `${v}_n`]], "=", slotMacros[slot][k] * days);
        const w = (k === "fat" ? 0.12 : 0.05) * macroW;
        m.addObjective(`${v}_p`, w); m.addObjective(`${v}_n`, k === "protein" ? w * 3 : w);
      }
    }
  }
  for (const id of req.lockedRecipes ?? []) {
    const a = all.find((x) => x.r.id === id);
    if (a) m.addRow([[1, `y_${a.key}`]], "=", 1);
  }
  for (const set of req.avoidSets ?? []) {
    const keys = set.map((id) => all.find((x) => x.r.id === id)?.key);
    if (keys.every(Boolean)) m.addRow(keys.map((k) => [1, `y_${k}`]), "<=", set.length - 1);
  }

  // nutrition: two-tier deviation (inside the tolerance band is cheap, outside is expensive)
  const macroRows: { key: "kcal" | "protein" | "carbs" | "fat"; inPos: number; inNeg: number; wInPos: number; wOutPos: number; wInNeg: number; wOutNeg: number }[] = [
    { key: "kcal", inPos: 0.05, inNeg: 0.05, wInPos: 0.003, wOutPos: 0.1, wInNeg: 0.003, wOutNeg: 0.1 },
    { key: "protein", inPos: 0.25, inNeg: 0, wInPos: 0.005, wOutPos: 0.1, wInNeg: 0.08, wOutNeg: 1 },
    { key: "carbs", inPos: 0.12, inNeg: 0.12, wInPos: 0.01, wOutPos: 0.25, wInNeg: 0.01, wOutNeg: 0.25 },
    { key: "fat", inPos: 0.12, inNeg: 0.12, wInPos: 0.02, wOutPos: 0.5, wInNeg: 0.02, wOutNeg: 0.5 },
  ];
  for (const mr of macroRows) {
    const T = dayTarget[mr.key] * days;
    const bandNeg = mr.key === "protein" ? 10 * days : mr.inNeg * T;
    const v = (s: string) => `${mr.key}_${s}`;
    m.addRow([...all.map((a): [number, string] => [a.r.perServing[mr.key] / 4, `s_${a.key}`]), [-1, v("pi")], [-1, v("po")], [1, v("ni")], [1, v("no")]], "=", T);
    m.bound(v("pi"), 0, mr.inPos * T); m.bound(v("ni"), 0, bandNeg);
    m.addObjective(v("pi"), mr.wInPos * macroW); m.addObjective(v("po"), mr.wOutPos * macroW);
    m.addObjective(v("ni"), mr.wInNeg * macroW); m.addObjective(v("no"), mr.wOutNeg * macroW);
  }

  // groceries: whole packages at chosen stores cover what the plan uses beyond the pantry
  const ingredientIds = new Set(all.flatMap((a) => a.r.lines.map((l) => l.ingredientId)));
  const costTerms: [number, string][] = [];
  const buyVars: { id: string; chain: ChainId; v: string; price: number }[] = [];
  let ii = 0;
  for (const id of ingredientIds) {
    if (freeIds.has(id)) continue;
    const ing = INGREDIENTS[id]!;
    const useTerms: [number, string][] = [];
    let maxNeed = 0;
    for (const a of all) for (const l of a.r.lines) if (l.ingredientId === id) {
      const coef = l.grams / a.r.servings / 4;
      useTerms.push([-coef, `s_${a.key}`]);
      maxNeed += coef * MAX_PORTION_Q * slotCount[a.slot] * days;
    }
    const maxPk = Math.max(1, Math.ceil(maxNeed / ing.pkg.grams));
    const buyTerms: [number, string][] = [];
    for (const c of stores) {
      const q = req.prices[id]?.[c];
      if (!q) continue;
      const v = `x_${ii}_${c}`;
      m.integer(v); m.bound(v, 0, maxPk);
      if (stores.length > 1) m.addRow([[1, v], [-maxPk, `z_${c}`]], "<=", 0);
      buyTerms.push([ing.pkg.grams, v]);
      costTerms.push([q.price, v]);
      buyVars.push({ id, chain: c, v, price: q.price });
    }
    const have = pantryGrams.get(id) ?? 0;
    if (!buyTerms.length) {
      // nobody carries it: recipes that need it beyond the pantry are not possible
      m.addRow(useTerms, ">=", -have);
    } else {
      m.addRow([...buyTerms, ...useTerms], ">=", -have);
    }
    ii++;
  }
  if (stores.length > 1) {
    for (const c of stores) { m.binary(`z_${c}`); m.addObjective(`z_${c}`, weights.extraStopCost); }
    m.addRow(stores.map((c) => [1, `z_${c}`]), req.storeMode === "one" ? "=" : ">=", 1);
  }
  // cost and budget
  m.addRow([...costTerms, [-1, "cost"]], "=", 0);
  m.bound("cost", 0, null);
  m.addRow([[1, "cost"], [-1, "over"]], "<=", req.budget);
  m.bound("over", 0, null);
  m.addObjective("cost", costW);
  m.addObjective("over", 6);

  const lp = m.toString();
  const limit = req.timeLimit ?? 2;
  let sol = highs.solve(lp, { time_limit: limit, mip_rel_gap: 0.02, output_flag: false });
  // a slow or busy device can run out of time before the first feasible plan: try once more, longer
  if (sol.Status === "Time limit reached" && !(sol.Columns && sol.Columns["cost"])) {
    sol = highs.solve(lp, { time_limit: limit * 3, mip_rel_gap: 0.05, output_flag: false });
  }
  if (!sol.Columns || !["Optimal", "Time limit reached", "Solution limit reached"].includes(sol.Status) || !sol.Columns["cost"]) {
    return wrap(empty("no_recipes", `The planner couldn't find a plan (${sol.Status}). Try more stores or fewer restrictions.`));
  }
  const val = (v: string) => Math.round((sol.Columns[v] as { Primal?: number } | undefined)?.Primal ?? 0);

  // ── Read the solution ──
  const recipes: PlannedRecipe[] = [];
  for (const a of all) {
    if (val(`y_${a.key}`) !== 1) continue;
    const n = val(`n_${a.key}`);
    const q = val(`s_${a.key}`);
    if (!n) continue;
    const servings = q / 4;
    const reasons = [...a.reasons];
    reasons.push(`${Math.round(a.r.perServing.protein)} g protein a serving`);
    reasons.push(`about $${a.cost.toFixed(2)} a serving`);
    recipes.push({ recipe: a.r, slot: a.slot, meals: n, servings, portion: Math.round((servings / n) * 100) / 100, reasons });
  }
  const daily: DayNutrition = { kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, sodiumMg: 0 };
  for (const p of recipes) for (const k of Object.keys(daily) as (keyof DayNutrition)[]) daily[k] += (p.recipe.perServing[k] * p.servings) / days;
  for (const k of Object.keys(daily) as (keyof DayNutrition)[]) daily[k] = Math.round(daily[k] * 10) / 10;

  // groceries actually needed by the chosen plan
  const need = new Map<string, number>();
  for (const p of recipes) for (const l of p.recipe.lines) need.set(l.ingredientId, (need.get(l.ingredientId) ?? 0) + (l.grams / p.recipe.servings) * p.servings);
  const cart: CartLine[] = [];
  const pantryUsed: { ingredientId: string; grams: number }[] = [];
  for (const [id, g] of need) {
    const have = pantryGrams.get(id) ?? 0;
    if (have > 0) pantryUsed.push({ ingredientId: id, grams: Math.min(have, g) });
    const lines = buyVars.filter((b) => b.id === id && val(b.v) > 0);
    const bought = lines.reduce((s, b) => s + val(b.v) * INGREDIENTS[id]!.pkg.grams, 0);
    for (const b of lines) {
      const k = val(b.v);
      const q = req.prices[id]![b.chain]!;
      cart.push({ ingredientId: id, chain: b.chain, packages: k, unitPrice: b.price, cost: Math.round(k * b.price * 100) / 100, priceSource: q.source, needGrams: Math.round(Math.max(0, g - Math.min(have, g))), leftoverGrams: Math.max(0, Math.round(bought + Math.min(have, g) - g)) });
    }
  }
  const cost = Math.round(cart.reduce((s, l) => s + l.cost, 0) * 100) / 100;
  const usedStores = stores.filter((c) => cart.some((l) => l.chain === c));
  const over = cost > req.budget + 0.005;
  return wrap({
    status: over ? "over_budget" : "ok",
    ...(over ? { message: `This plan costs $${(cost - req.budget).toFixed(2)} more than your budget. Raise the budget, lower protein, or allow more stores.` } : {}),
    recipes: recipes.sort((a, b) => SLOTS.indexOf(a.slot) - SLOTS.indexOf(b.slot)),
    daily, allowanceKcal, cart, pantryUsed, cost, stores: usedStores, budget: req.budget, solveMs: Date.now() - t0,
  }, sol.ObjectiveValue ?? Infinity);
}

function summarizeRejections(reasons: string[]): string {
  const counts = new Map<string, number>();
  for (const r of reasons) counts.set(r, (counts.get(r) ?? 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1]).slice(0, 2).map(([r]) => r).join(", ") || "none match";
}
