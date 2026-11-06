import { CHAINS, INGREDIENTS, isBulkChain, MENU_BY_ID, pkgAt, shelfLifeDays, type ChainId, type MealType, type Recipe } from "@prep-cart/catalog";
import { splitTargets } from "@prep-cart/nutrition";
import { LpModel } from "./lp";
import { candidatePool, preferenceFit, servingCost, slotTypeFor } from "./filters";
import type { CartLine, DayNutrition, EatOut, HouseholdMember, HouseholdResult, PantryUse, PlanRequest, PlanResult, PlannedRecipe, Weights } from "./types";

/** Minimal shape of the HiGHS solver object we use. */
export interface HighsLike {
  solve(model: string, options?: Record<string, unknown>): {
    Status: string;
    ObjectiveValue?: number;
    Columns: Record<string, unknown>;
  };
}

const SLOTS: MealType[] = ["breakfast", "main", "snack"];
const PREFER_BONUS = 40;
const POOL_SIZE: Record<MealType, number> = { breakfast: 6, main: 12, snack: 5 };
const MIN_PORTION_Q = 2; // 0.5 serving, in quarter servings
const MAX_PORTION_Q = 10; // 2.5 servings
/** recipes added per slot for a household member whose diet the shared ones may not suit */
const EXTRA_POOL: Record<MealType, number> = { breakfast: 2, main: 4, snack: 2 };
/** objective cost of cooking a recipe only someone else eats: a shared recipe wins unless this one fits far better */
const EXTRA_COST = 6;
/** raw meat and fish bought in a club pack go in the freezer: days they keep there */
export const FREEZER_DAYS = 90;
/** how far one meal's calories may stray from an even share of its kind */
const MEAL_BAND = 0.2;
const MACROS = ["kcal", "protein", "carbs", "fat"] as const;

/** preference-fit bonus per sale ingredient when the plan favors deals, and its cap */
const DEAL_FIT = 0.5;
const DEAL_FIT_MAX = 1;
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
    cart: [], pantryUsed: [], cost: 0, stores: [], budget: req.budget, takeout: { meals: [], cost: 0 }, household: { people: 1, factor: 1, members: [] }, solveMs: Date.now() - t0,
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
    // hand-set grams or a meal style (high protein, low carb...) shape the recipes picked for that slot
    if (o.macros || (o.style && o.style !== "balanced")) slotMacros[t].custom = true;
    dayTarget.kcal += part.kcal; dayTarget.protein += part.protein; dayTarget.carbs += part.carbs; dayTarget.fat += part.fat;
  });
  const totalMeals = SLOTS.reduce((a, s) => a + slotCount[s], 0);
  if (!totalMeals) return wrap(empty("no_recipes", "Mark at least one meal or snack as prepped."));

  // -- Takeout: each one replaces a prepped meal, and its cost comes out of the grocery budget --
  const takeout: EatOut[] = [];
  const seen = new Set<string>();
  for (const e of req.eatingOut ?? []) {
    const key = e.day + ":" + e.occasionId;
    if (seen.has(key) || e.day < 0 || e.day >= days || !MENU_BY_ID[e.itemId] || !req.occasions.some((o) => o.id === e.occasionId)) continue;
    seen.add(key);
    takeout.push(e);
  }
  const takeoutCost = Math.round(takeout.reduce((a, e) => a + MENU_BY_ID[e.itemId]!.price, 0) * 100) / 100;
  const zero = () => ({ kcal: 0, protein: 0, carbs: 0, fat: 0 });
  const slotTakeout: Record<MealType, number> = { breakfast: 0, main: 0, snack: 0 };
  const replacedSlot: Record<MealType, { kcal: number; protein: number; carbs: number; fat: number }> = { breakfast: zero(), main: zero(), snack: zero() };
  const eaten = zero();
  for (const e of takeout) {
    const i = req.occasions.findIndex((o) => o.id === e.occasionId);
    const o = req.occasions[i]!;
    if (!o.prepped) continue; // eaten from the free allowance: only the cost matters
    const slot = slotTypeFor(o);
    const part = parts[i]!;
    const item = MENU_BY_ID[e.itemId]!;
    slotTakeout[slot] += 1;
    for (const k of ["kcal", "protein", "carbs", "fat"] as const) { replacedSlot[slot][k] += part[k]; eaten[k] += item[k]; }
  }
  const groceryBudget = Math.max(0, req.budget - takeoutCost);

  // -- Household: people with only a calorie number eat the main person's meals, scaled by calories.
  //    People with their own macros, diet or allergies get portions sized for them, their macros are
  //    checked, and a recipe is cooked just for them only when no shared one suits them --
  const valid = (req.household ?? []).filter((p) => p.kcal >= 800 && p.kcal <= 6000);
  const members = valid.filter((p) => !hasOwnGoals(p))
    .map((p) => ({ ...p, scale: Math.round((p.kcal / Math.max(800, req.targets.kcal)) * 100) / 100 }));
  const factor = 1 + members.reduce((a, p) => a + p.scale, 0);
  const owners = valid.filter(hasOwnGoals).map((p, pi) => {
    const kr = p.kcal / Math.max(800, req.targets.kcal);
    const of = (k: "protein" | "carbs" | "fat") => (p[k] != null ? p[k]! / Math.max(1, req.targets[k]) : kr);
    return {
      ...p, pi, scale: Math.round(kr * 100) / 100,
      diets: (p.diets ?? []).filter((d) => d !== "omnivore"), allergens: p.allergens ?? [],
      ratio: { kcal: kr, protein: of("protein"), carbs: of("carbs"), fat: of("fat") },
    };
  });
  const fitsOwner = (r: Recipe, p: (typeof owners)[number]) => p.diets.every((d) => r.diets.includes(d)) && !p.allergens.some((a) => r.allergens.includes(a));

  // ── Free ingredients (pantry staples) and pantry amounts ──
  const pantryGrams = new Map<string, number>();
  for (const p of req.pantry) pantryGrams.set(p.ingredientId, (pantryGrams.get(p.ingredientId) ?? 0) + p.grams);
  const freeIds = new Set([...pantryGrams].filter(([, g]) => g === Infinity).map(([id]) => id));
  // already-paid pantry food (club-pack leftovers): dollars per gram, averaged over the pantry rows
  const paidPerGram = new Map<string, number>();
  for (const id of new Set(req.pantry.filter((p) => (p.costPerGram ?? 0) > 0 && p.grams !== Infinity).map((p) => p.ingredientId))) {
    const rows = req.pantry.filter((p) => p.ingredientId === id && p.grams !== Infinity);
    const g = rows.reduce((a, p) => a + p.grams, 0);
    if (g > 0) paidPerGram.set(id, rows.reduce((a, p) => a + p.grams * (p.costPerGram ?? 0), 0) / g);
  }
  const bulkWeeks = Math.max(1, Math.min(4, Math.round(req.bulkWeeks ?? 1)));
  // pantry food that spoils during the plan: recipes that use it up get a bonus
  const useSoon = new Map(req.pantry.filter((p) => p.grams !== Infinity && p.grams > 0 && p.daysLeft != null && p.daysLeft <= Math.max(days, 4)).map((p) => [p.ingredientId, p.grams]));

  // ── Candidate pools ──
  const prefer = new Set(req.preferRecipes ?? []);
  type Scored = { r: Recipe; fit: number; reasons: string[]; cost: number; rank: number };
  const pools: Record<MealType, Scored[]> = { breakfast: [], main: [], snack: [] };
  const xtraPools: Record<MealType, Scored[]> = { breakfast: [], main: [], snack: [] };
  const variety: Record<MealType, number> = { breakfast: 0, main: 0, snack: 0 };
  const scoreOf = (r: Recipe): Scored => {
      const pf = preferenceFit(r, req.prefs);
      let fit = pf.fit;
      const reasons = [...pf.reasons];
      const saves = r.lines.filter((l) => useSoon.has(l.ingredientId)).map((l) => INGREDIENTS[l.ingredientId]!.name.toLowerCase());
      if (saves.length) { fit += Math.min(3, 1.5 * saves.length); reasons.unshift(`uses up your ${saves.slice(0, 2).join(" and ")}`); }
      const onSale = [...new Set(r.lines.filter((l) => stores.some((c) => req.prices[l.ingredientId]?.[c]?.source === "sale")).map((l) => INGREDIENTS[l.ingredientId]!.name.toLowerCase()))];
      if (onSale.length) reasons.unshift(`${onSale.slice(0, 2).join(" and ")} on sale`);
      // leaning on sales: a recipe built on sale items is worth a bit more than its price alone says
      if (onSale.length && req.favorDeals) fit += Math.min(DEAL_FIT_MAX, DEAL_FIT * onSale.length);
      const cost = servingCost(r, req.prices, stores, freeIds);
      const proteinShare = (r.perServing.protein * 4) / Math.max(1, r.perServing.kcal);
      const targetShare = (dayTarget.protein * 4) / Math.max(1, dayTarget.kcal);
      const proteinMatch = -Math.abs(proteinShare - targetShare) * 10;
      return { r, fit, reasons, cost, rank: fit * 2 + proteinMatch - cost * (0.3 + weights.costVsMacros) };
  };
  for (const slot of SLOTS) {
    const meals = slotCount[slot] * days - slotTakeout[slot];
    if (!meals) continue;
    const all0 = candidatePool(slot, req.prefs);
    // made-fresh recipes (eggs and toast) fill only meals the person makes fresh, and those meals take only them
    const freshSlot = req.occasions.some((o) => o.prepped && o.fresh && slotTypeFor(o) === slot);
    const ok = all0.ok.filter((r) => r.cookFresh === freshSlot);
    const rejected = all0.rejected;
    const slotName = slot === "main" ? "lunch or dinner" : slot;
    if (!ok.length) {
      const top = summarizeRejections(rejected.map((r) => r.reason));
      return wrap(empty("no_recipes", `No ${slotName} recipes fit your rules (${top}). Loosen a diet, allergy or time limit.`));
    }
    const scored = ok.map(scoreOf);
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
    const pool = scored.slice(0, Math.max(POOL_SIZE[slot], scored.filter((s) => locked.has(s.r.id)).length));
    // recipes the person already has in their week stay in the running, so a swap only changes what was swapped
    for (const x of scored) if (prefer.has(x.r.id) && !pool.includes(x)) pool.push(x);
    pools[slot] = pool;
    variety[slot] = Math.max(1, Math.min(req.variety[slot], pools[slot].length, meals));
    // someone with their own diet: a few recipes that suit them, cooked only if no shared one does.
    // The cook's kitchen rules (dislikes, equipment, time, allergies) still apply
    const seenIds = new Set(pool.map((x) => x.r.id));
    for (const p of owners) {
      if (!p.diets.length && !p.allergens.length) continue;
      const fitting = candidatePool(slot, { ...req.prefs, diets: p.diets, allergens: [...new Set([...req.prefs.allergens, ...p.allergens])] }).ok
        .filter((r) => !seenIds.has(r.id) && r.cookFresh === freshSlot).map(scoreOf).sort((a, b) => b.rank - a.rank);
      // the best few, plus any the person kept or still has in their week
      const theirs = fitting.filter((x, i) => i < EXTRA_POOL[slot] || locked.has(x.r.id) || prefer.has(x.r.id));
      for (const x of theirs) { seenIds.add(x.r.id); xtraPools[slot].push(x); }
      if (![...pool, ...xtraPools[slot]].some((x) => fitsOwner(x.r, p))) {
        return wrap(empty("no_recipes", `No ${slotName} recipes fit ${p.name}'s diet and allergies together with your kitchen rules. Loosen a rule for one of you.`));
      }
    }
  }

  // days the food cooked for a meal must keep: the whole period, its own block (split week), or
  // one stretch between cook days
  const cookDays = Math.max(1, Math.min(3, Math.round(req.cookDays ?? 1)));
  const horizonFor = (slot: MealType) => {
    const block = slot === "main" && req.variety.rotation === "blocks" ? Math.ceil(days / Math.max(1, variety.main)) + 1 : days;
    return Math.min(block, Math.ceil(days / cookDays));
  };

  // ── Model ──
  const m = new LpModel();
  const macroW = 1.8 - 1.6 * weights.costVsMacros;
  const costW = 0.2 + 1.8 * weights.costVsMacros;
  const all: { key: string; slot: MealType; r: Recipe; fit: number; reasons: string[]; cost: number }[] = [];
  for (const slot of SLOTS) pools[slot].forEach((c, i) => all.push({ key: `${slot[0]}${i}`, slot, ...c }));

  for (const slot of SLOTS) {
    const N = slotCount[slot] * days - slotTakeout[slot];
    if (!N) continue;
    const members = all.filter((a) => a.slot === slot);
    // each recipe's portion stays near one meal of this kind, so every day adds up and not just the
    // week's average (otherwise a 1,500 kcal dinner makes up for half-portion lunches). A pool with
    // nothing that size keeps the plain limits
    const perMeal = slotKcal[slot] / Math.max(1, slotCount[slot]);
    const near = (a: (typeof members)[number]) => {
      const q = (perMeal * 4) / Math.max(1, a.r.perServing.kcal);
      return [Math.max(MIN_PORTION_Q, Math.ceil(q * (1 - MEAL_BAND))), Math.min(MAX_PORTION_Q, Math.floor(q * (1 + MEAL_BAND)))] as const;
    };
    const fitsMeal = members.filter((a) => { const [lo, hi] = near(a); return lo <= hi; }).length >= variety[slot];
    const keep = new Set(req.lockedRecipes ?? []);
    // a kept recipe that can't be portioned to one meal keeps the plain limits rather than being dropped
    const portionQ = (a: (typeof members)[number]): readonly [number, number] => {
      if (!fitsMeal) return [MIN_PORTION_Q, MAX_PORTION_Q];
      const [lo, hi] = near(a);
      return lo <= hi || !keep.has(a.r.id) ? [lo, hi] : [MIN_PORTION_Q, MAX_PORTION_Q];
    };
    m.addRow(members.map((a) => [1, `y_${a.key}`]), "=", variety[slot], `var_${slot}`);
    m.addRow(members.map((a) => [1, `n_${a.key}`]), "=", N, `meals_${slot}`);
    for (const a of members) {
      m.binary(`y_${a.key}`);
      m.integer(`n_${a.key}`); m.bound(`n_${a.key}`, 0, N);
      m.integer(`s_${a.key}`); m.bound(`s_${a.key}`, 0, MAX_PORTION_Q * N);
      m.addRow([[1, `n_${a.key}`], [-N, `y_${a.key}`]], "<=", 0);
      m.addRow([[1, `n_${a.key}`], [-1, `y_${a.key}`]], ">=", 0);
      const [lo, hi] = portionQ(a);
      if (lo > hi) { m.addRow([[1, `y_${a.key}`]], "=", 0); continue; }
      m.addRow([[1, `s_${a.key}`], [-lo, `n_${a.key}`]], ">=", 0);
      m.addRow([[1, `s_${a.key}`], [-hi, `n_${a.key}`]], "<=", 0);
      // preference fit is a reward for choosing the recipe
      m.addObjective(`y_${a.key}`, -1.0 * a.fit);
      // keeping the rest of the week as it was beats a cheaper or better-fitting reshuffle; only a
      // real budget or macro problem (several dollars over) moves a preferred recipe out
      if (prefer.has(a.r.id)) m.addObjective(`y_${a.key}`, -PREFER_BONUS);
      // food safety: recipes that don't keep the whole period and can't be frozen are less attractive
      // (in blocks, a lunch-and-dinner recipe only has to last its own block, since it's cooked fresh for it)
      if (a.r.fridgeDays < horizonFor(slot) && !a.r.freezerFriendly && !a.r.cookFresh) m.addObjective(`y_${a.key}`, 1.5 * (horizonFor(slot) - a.r.fridgeDays));
    }
    if (slot === "breakfast" && variety.breakfast >= 2 && req.variety.rotation === "blocks") {
      // split-week breakfasts: each one covers its own stretch of days
      const minN = Math.floor(N / variety.breakfast);
      for (const a of members) m.addRow([[1, `n_${a.key}`], [-minN, `y_${a.key}`]], ">=", 0);
    }
    if (slot === "main" && variety.main >= 2) {
      // every chosen main gets a fair share of the meals (blocks: an even split), so no recipe is a 2-meal afterthought
      const minN = req.variety.rotation === "blocks" ? Math.floor(N / variety.main) : Math.ceil(N / (2 * variety.main));
      for (const a of members) m.addRow([[1, `n_${a.key}`], [-minN, `y_${a.key}`]], ">=", 0);
      // and they differ in main protein when the pool allows it (two lentil dishes is not variety)
      const groups = new Map<string, typeof members>();
      for (const a of members) { const k = a.r.proteins[0] ?? a.r.id; groups.set(k, [...(groups.get(k) ?? []), a]); }
      // a soft rule: worth about a recipe's preference fit, so a tight budget can still pick two cheap lentil dishes
      if (groups.size >= variety.main) {
        let gi = 0;
        for (const g of groups.values()) {
          if (g.length < 2) continue;
          const e = `dup_${gi++}`;
          m.bound(e, 0, g.length);
          m.addRow([...g.map((a): [number, string] => [1, `y_${a.key}`]), [-1, e]], "<=", 1);
          m.addObjective(e, 2);
        }
      }
    }
    // calories per slot type (keeps breakfast breakfast-sized)
    const tk = slotKcal[slot] * days - replacedSlot[slot].kcal;
    m.addRow([...members.map((a): [number, string] => [a.r.perServing.kcal / 4, `s_${a.key}`]), [-1, `kp_${slot}`], [1, `kn_${slot}`]], "=", tk);
    m.addObjective(`kp_${slot}`, 0.004 * macroW);
    m.addObjective(`kn_${slot}`, 0.004 * macroW);
    // per-meal macros the person set by hand are honored per slot, not just across the day
    if (slotMacros[slot].custom) {
      for (const k of ["protein", "carbs", "fat"] as const) {
        const v = `${k[0]}${slot}`;
        m.addRow([...members.map((a): [number, string] => [a.r.perServing[k] / 4, `s_${a.key}`]), [-1, `${v}_p`], [1, `${v}_n`]], "=", slotMacros[slot][k] * days - replacedSlot[slot][k]);
        const w = (k === "fat" ? 0.12 : 0.05) * macroW;
        m.addObjective(`${v}_p`, w); m.addObjective(`${v}_n`, k === "protein" ? w * 3 : w);
      }
    }
  }
  for (const set of req.avoidSets ?? []) {
    const keys = set.map((id) => all.find((x) => x.r.id === id)?.key);
    if (keys.every(Boolean)) m.addRow(keys.map((k) => [1, `y_${k}`]), "<=", set.length - 1);
  }

  // ── Household members with their own goals ──
  const xtra: typeof all = [];
  for (const slot of SLOTS) xtraPools[slot].forEach((c, i) => xtra.push({ key: `x${slot[0]}${i}`, slot, ...c }));
  const extraOnly = new Set(xtra.map((a) => a.key));
  const cookable = [...all, ...xtra];
  const ownerVars: { a: (typeof all)[number]; p: (typeof owners)[number]; v: string; portion: number }[] = [];
  const extraVar = new Map<string, string>();
  for (const slot of SLOTS) {
    const N = slotCount[slot] * days - slotTakeout[slot];
    if (!N || !owners.length) continue;
    const perMealKcal = slotKcal[slot] / slotCount[slot];
    const horizon = horizonFor(slot);
    for (const p of owners) {
      const terms: [number, string][] = [];
      for (const a of cookable) {
        if (a.slot !== slot || !fitsOwner(a.r, p)) continue;
        const v = `n_${a.key}_${p.pi}`;
        // their portion of this recipe, sized to their calories for this kind of meal
        const portion = Math.min(MAX_PORTION_Q, Math.max(MIN_PORTION_Q, Math.round((perMealKcal * p.ratio.kcal * 4) / Math.max(1, a.r.perServing.kcal)))) / 4;
        m.integer(v); m.bound(v, 0, N);
        let e = extraVar.get(a.key);
        if (!e) {
          // cooked just for the others (the main person doesn't eat it)
          e = `e_${a.key}`;
          extraVar.set(a.key, e);
          m.binary(e);
          m.addObjective(e, EXTRA_COST - 0.5 * a.fit - (prefer.has(a.r.id) ? PREFER_BONUS : 0));
          if (a.r.fridgeDays < horizon && !a.r.freezerFriendly) m.addObjective(e, 1.5 * (horizon - a.r.fridgeDays));
          if (!extraOnly.has(a.key)) m.addRow([[1, `y_${a.key}`], [1, e]], "<=", 1);
        }
        m.addRow([[1, v], [-N, e], ...(extraOnly.has(a.key) ? [] : [[-N, `y_${a.key}`] as [number, string]])], "<=", 0);
        // variety for them too: past a fair share of lunches and dinners, more of one recipe costs a little
        if (slot === "main" && variety.main >= 2) {
          const over = `${v}_o`;
          m.addRow([[1, v], [-1, over]], "<=", Math.ceil(N / variety.main) + 1);
          m.bound(over, 0, N);
          m.addObjective(over, 1.2);
        }
        terms.push([1, v]);
        ownerVars.push({ a, p, v, portion });
      }
      m.addRow(terms, "=", N);
    }
  }
  // a recipe cooked only for others is worth a batch: at least a few meals
  for (const [key, e] of extraVar) {
    const a = cookable.find((x) => x.key === key)!;
    const N = slotCount[a.slot] * days - slotTakeout[a.slot];
    m.addRow([...ownerVars.filter((o) => o.a.key === key).map((o): [number, string] => [1, o.v]), [-Math.min(N, 3), e]], ">=", 0);
  }
  // a kept recipe is cooked: for the main person, or (when it only suits others) for them
  for (const id of req.lockedRecipes ?? []) {
    const a = cookable.find((x) => x.r.id === id);
    if (!a) continue;
    const e = extraVar.get(a.key);
    m.addRow([...(extraOnly.has(a.key) ? [] : [[1, `y_${a.key}`] as [number, string]]), ...(e ? [[1, e] as [number, string]] : [])], "=", 1);
  }
  // each of them gets close to their own calories and macros (prepped share, like the main person)
  const ownerTarget = (p: (typeof owners)[number], k: (typeof MACROS)[number]) =>
    Math.max(0, (dayTarget[k] * days - SLOTS.reduce((t, sl) => t + replacedSlot[sl][k], 0)) * p.ratio[k]);
  const OWNER_W: Record<(typeof MACROS)[number], [number, number]> = { kcal: [0.002, 0.002], protein: [0.004, 0.08], carbs: [0.008, 0.008], fat: [0.016, 0.016] };
  for (const p of owners) for (const k of MACROS) {
    const mine = ownerVars.filter((o) => o.p === p);
    if (!mine.length) continue;
    const v = `h${p.pi}${k}`;
    m.addRow([...mine.map((o): [number, string] => [o.portion * o.a.r.perServing[k], o.v]), [-1, `${v}_p`], [1, `${v}_n`]], "=", ownerTarget(p, k));
    m.addObjective(`${v}_p`, OWNER_W[k][0] * macroW); m.addObjective(`${v}_n`, OWNER_W[k][1] * macroW);
  }

  // nutrition: two-tier deviation (inside the tolerance band is cheap, outside is expensive)
  const macroRows: { key: "kcal" | "protein" | "carbs" | "fat"; inPos: number; inNeg: number; wInPos: number; wOutPos: number; wInNeg: number; wOutNeg: number }[] = [
    { key: "kcal", inPos: 0.05, inNeg: 0.05, wInPos: 0.003, wOutPos: 0.1, wInNeg: 0.003, wOutNeg: 0.1 },
    { key: "protein", inPos: 0.25, inNeg: 0, wInPos: 0.005, wOutPos: 0.1, wInNeg: 0.08, wOutNeg: 1 },
    { key: "carbs", inPos: 0.12, inNeg: 0.12, wInPos: 0.01, wOutPos: 0.25, wInNeg: 0.01, wOutNeg: 0.25 },
    { key: "fat", inPos: 0.12, inNeg: 0.12, wInPos: 0.02, wOutPos: 0.5, wInNeg: 0.02, wOutNeg: 0.5 },
  ];
  for (const mr of macroRows) {
    // prepped food plus takeout should add up to the week's targets
    const T = Math.max(0, dayTarget[mr.key] * days - eaten[mr.key]);
    const bandNeg = mr.key === "protein" ? 8 * days : mr.inNeg * T;
    const v = (s: string) => `${mr.key}_${s}`;
    m.addRow([...all.map((a): [number, string] => [a.r.perServing[mr.key] / 4, `s_${a.key}`]), [-1, v("pi")], [-1, v("po")], [1, v("ni")], [1, v("no")]], "=", T);
    m.bound(v("pi"), 0, mr.inPos * T); m.bound(v("ni"), 0, bandNeg);
    m.addObjective(v("pi"), mr.wInPos * macroW); m.addObjective(v("po"), mr.wOutPos * macroW);
    m.addObjective(v("ni"), mr.wInNeg * macroW); m.addObjective(v("no"), mr.wOutNeg * macroW);
  }

  // groceries: whole packages at chosen stores cover what the plan uses beyond the pantry
  const ingredientIds = new Set(cookable.flatMap((a) => a.r.lines.map((l) => l.ingredientId)));
  const costTerms: [number, string][] = [];
  const pantryCostTerms: [number, string][] = [];
  const buyVars: { id: string; chain: ChainId; v: string; price: number; pkg: number; club?: { horizon: number; perGram: number } }[] = [];
  let ii = 0;
  for (const id of ingredientIds) {
    if (freeIds.has(id)) continue;
    const ing = INGREDIENTS[id]!;
    const useTerms: [number, string][] = [];
    let maxNeed = 0;
    for (const a of all) for (const l of a.r.lines) if (l.ingredientId === id) {
      const coef = (l.grams / a.r.servings / 4) * factor;
      useTerms.push([-coef, `s_${a.key}`]);
      maxNeed += coef * MAX_PORTION_Q * slotCount[a.slot] * days;
    }
    for (const o of ownerVars) for (const l of o.a.r.lines) if (l.ingredientId === id) {
      const coef = (l.grams / o.a.r.servings) * o.portion;
      useTerms.push([-coef, o.v]);
      maxNeed += coef * slotCount[o.a.slot] * days;
    }
    // weeks a club pack can cover: the bulk window, but no longer than the food keeps (raw meat goes in the freezer)
    const keeps = ing.aisle === "Meat and seafood" ? FREEZER_DAYS : shelfLifeDays(id);
    const horizon = Math.max(1, Math.floor(Math.min(bulkWeeks * 7, keeps) / days));
    const buyTerms: [number, string][] = [];
    for (const c of stores) {
      const q = req.prices[id]?.[c];
      if (!q) continue;
      const pk = pkgAt(id, c).grams;
      const club = isBulkChain(c);
      const maxPk = Math.max(1, Math.ceil((maxNeed * (club ? horizon : 1)) / pk));
      const v = `x_${ii}_${c}`;
      m.integer(v); m.bound(v, 0, maxPk);
      if (stores.length > 1) m.addRow([[1, v], [-maxPk, `z_${c}`]], "<=", 0);
      if (!club) {
        buyTerms.push([pk, v]);
        costTerms.push([q.price, v]);
        buyVars.push({ id, chain: c, v, price: q.price, pkg: pk });
        continue;
      }
      // a club pack counts only what this plan uses (u), plus what won't be used within the horizon (w)
      const u = `u_${ii}_${c}`, w = `w_${ii}_${c}`, perGram = q.price / pk;
      m.bound(u, 0, null); m.bound(w, 0, null);
      m.addRow([[1, u], [-pk, v]], "<=", 0);
      m.addRow([[pk, v], [-horizon, u], [-1, w]], "<=", 0);
      buyTerms.push([1, u]);
      costTerms.push([perGram, u], [perGram, w]);
      buyVars.push({ id, chain: c, v, price: q.price, pkg: pk, club: { horizon, perGram } });
    }
    const have = pantryGrams.get(id) ?? 0;
    const paid = paidPerGram.get(id);
    // already-paid pantry food: how much the plan draws (p) counts toward the budget, not the objective
    const draw: [number, string][] = [];
    if (paid != null && have > 0 && have !== Infinity) {
      const pv = `p_${ii}`;
      m.bound(pv, 0, have);
      draw.push([1, pv]);
      pantryCostTerms.push([paid, pv]);
    }
    const rhs = draw.length ? 0 : -have;
    // nobody carries it: recipes that need it beyond the pantry are not possible
    m.addRow([...buyTerms, ...draw, ...useTerms], ">=", rhs);
    ii++;
  }
  if (stores.length > 1) {
    for (const c of stores) { m.binary(`z_${c}`); m.addObjective(`z_${c}`, weights.extraStopCost); }
    m.addRow(stores.map((c) => [1, `z_${c}`]), req.storeMode === "one" ? "=" : ">=", 1);
  }
  // cost and budget
  m.addRow([...costTerms, [-1, "cost"]], "=", 0);
  m.bound("cost", 0, null);
  if (pantryCostTerms.length) {
    m.addRow([...pantryCostTerms, [-1, "paid"]], "=", 0);
    m.bound("paid", 0, null);
    m.addRow([[1, "cost"], [1, "paid"], [-1, "over"]], "<=", groceryBudget);
  } else {
    m.addRow([[1, "cost"], [-1, "over"]], "<=", groceryBudget);
  }
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
  const ownerMeals = new Map<string, { o: (typeof ownerVars)[number]; n: number }[]>();
  for (const o of ownerVars) {
    const n = val(o.v);
    if (n > 0) ownerMeals.set(o.a.key, [...(ownerMeals.get(o.a.key) ?? []), { o, n }]);
  }
  for (const a of cookable) {
    const n = extraOnly.has(a.key) || val(`y_${a.key}`) !== 1 ? 0 : val(`n_${a.key}`);
    const theirs = ownerMeals.get(a.key) ?? [];
    if (!n && !theirs.length) continue;
    const servings = n ? val(`s_${a.key}`) / 4 : 0;
    const othersServings = theirs.reduce((t, x) => t + x.n * x.o.portion, 0);
    const cook = Math.round((servings * factor + othersServings) * 4) / 4;
    const othersMeals = theirs.reduce((t, x) => t + x.n, 0);
    const portion = Math.round((n ? servings / n : othersServings / othersMeals) * 100) / 100;
    const reasons = [...a.reasons];
    if (!n) reasons.unshift(`for ${theirs.map((x) => x.o.p.name).join(" and ")}`);
    // per meal as you eat it (your portion), matching the numbers shown next to it
    reasons.push(`${Math.round(a.r.perServing.protein * portion)} g protein a meal`);
    reasons.push(`about $${(a.cost * portion).toFixed(2)} a meal`);
    recipes.push({
      recipe: a.r, slot: a.slot, meals: n, servings: cook, portion, reasons,
      ...(owners.length ? { household: { mine: n > 0, eaters: theirs.map((x) => ({ id: x.o.p.id, name: x.o.p.name, meals: x.n, portion: x.o.portion })), totalMeals: n * (1 + members.length) + othersMeals } } : {}),
    });
  }
  const daily: DayNutrition = { kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, sodiumMg: 0 };
  // nutrition is the main person's share of what's cooked
  for (const p of recipes) for (const k of Object.keys(daily) as (keyof DayNutrition)[]) daily[k] += (p.recipe.perServing[k] * p.portion * p.meals) / days;
  const preppedDaily = { ...daily };
  for (const k of ["kcal", "protein", "carbs", "fat"] as const) daily[k] += eaten[k] / days;
  for (const k of Object.keys(daily) as (keyof DayNutrition)[]) daily[k] = Math.round(daily[k] * 10) / 10;
  const mainServings = recipes.reduce((t, p) => t + p.portion * p.meals, 0);
  const cooked = recipes.reduce((t, p) => t + p.servings, 0);
  const household = {
    people: 1 + members.length + owners.length,
    // cooked food over the main person's share (for owners this is an average, not a recipe multiplier)
    factor: Math.round((owners.length && mainServings > 0 ? cooked / mainServings : factor) * 100) / 100,
    members: [
      ...members.map((p): HouseholdResult => ({ id: p.id, name: p.name, scale: p.scale, daily: Object.fromEntries(Object.entries(preppedDaily).map(([k, v]) => [k, Math.round(v * p.scale * 10) / 10])) as unknown as DayNutrition })),
      ...owners.map((p): HouseholdResult => {
        const d: DayNutrition = { kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, sodiumMg: 0 };
        let meals = 0;
        let shared = 0;
        for (const p2 of recipes) for (const e of p2.household?.eaters ?? []) {
          if (e.id !== p.id) continue;
          meals += e.meals;
          if (p2.household!.mine) shared += e.meals;
          for (const k of Object.keys(d) as (keyof DayNutrition)[]) d[k] += (p2.recipe.perServing[k] * e.portion * e.meals) / days;
        }
        for (const k of Object.keys(d) as (keyof DayNutrition)[]) d[k] = Math.round(d[k] * 10) / 10;
        const target = Object.fromEntries(MACROS.map((k) => [k, Math.round(ownerTarget(p, k) / days)])) as HouseholdResult["target"];
        return { id: p.id, name: p.name, scale: p.scale, daily: d, target, meals, sharedMeals: shared };
      }),
    ],
  };

  // groceries actually needed by the chosen plan
  const need = new Map<string, number>();
  for (const p of recipes) for (const l of p.recipe.lines) need.set(l.ingredientId, (need.get(l.ingredientId) ?? 0) + (l.grams / p.recipe.servings) * p.servings);
  const cart: CartLine[] = [];
  const pantryUsed: PantryUse[] = [];
  for (const [id, g] of need) {
    const have = pantryGrams.get(id) ?? 0;
    const paid = paidPerGram.get(id);
    if (have > 0) {
      const used = Math.min(have, g);
      pantryUsed.push({ ingredientId: id, grams: used, ...(paid != null && have !== Infinity ? { cost: Math.round(used * paid * 100) / 100 } : {}) });
    }
    const lines = buyVars.filter((b) => b.id === id && val(b.v) > 0);
    const bought = lines.reduce((s, b) => s + val(b.v) * b.pkg, 0);
    const toBuy = Math.max(0, g - Math.min(have, g));
    // regular packages cover the plan first; club packs supply the rest
    let rest = Math.max(0, toBuy - lines.filter((b) => !b.club).reduce((s, b) => s + val(b.v) * b.pkg, 0));
    for (const b of lines) {
      const k = val(b.v);
      const q = req.prices[id]![b.chain]!;
      const cost = Math.round(k * b.price * 100) / 100;
      const pkg = pkgAt(id, b.chain);
      let club = {};
      if (b.club) {
        // what this plan uses from the pack, plus whatever won't be used before it spoils or the bulk window ends
        const usedG = Math.min(rest, k * b.pkg);
        rest -= usedG;
        const spoilG = Math.max(0, k * b.pkg - b.club.horizon * usedG);
        club = { pkg, countedCost: Math.min(cost, Math.round((usedG + spoilG) * b.club.perGram * 100) / 100) };
      }
      cart.push({ ingredientId: id, chain: b.chain, packages: k, unitPrice: b.price, cost, priceSource: q.source, needGrams: Math.round(toBuy), leftoverGrams: Math.max(0, Math.round(bought + Math.min(have, g) - g)), ...club });
    }
  }
  const registerCost = Math.round(cart.reduce((s, l) => s + l.cost, 0) * 100) / 100;
  const pantryCost = Math.round(pantryUsed.reduce((s, u) => s + (u.cost ?? 0), 0) * 100) / 100;
  const cost = Math.round((cart.reduce((s, l) => s + (l.countedCost ?? l.cost), 0) + pantryCost) * 100) / 100;
  const usedStores = stores.filter((c) => cart.some((l) => l.chain === c));
  const over = cost + takeoutCost > req.budget + 0.005;
  return wrap({
    status: over ? "over_budget" : "ok",
    ...(over ? { message: `Groceries${takeoutCost ? " plus takeout" : ""} cost $${(cost + takeoutCost - req.budget).toFixed(2)} more than your budget. Raise the budget, ${takeoutCost ? "drop a takeout meal, " : ""}lower protein, or allow more stores.` } : {}),
    recipes: recipes.sort((a, b) => SLOTS.indexOf(a.slot) - SLOTS.indexOf(b.slot)),
    daily, allowanceKcal, cart, pantryUsed, cost,
    ...(Math.abs(registerCost - cost) > 0.004 ? { registerCost } : {}), ...(pantryCost > 0 ? { pantryCost } : {}),
    stores: usedStores, budget: req.budget, takeout: { meals: takeout, cost: takeoutCost }, household, solveMs: Date.now() - t0,
  }, sol.ObjectiveValue ?? Infinity);
}

function summarizeRejections(reasons: string[]): string {
  const counts = new Map<string, number>();
  for (const r of reasons) counts.set(r, (counts.get(r) ?? 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1]).slice(0, 2).map(([r]) => r).join(", ") || "none match";
}

/** True when a household member has their own macros, diet or allergies (not just a calorie number). */
export function hasOwnGoals(p: HouseholdMember): boolean {
  return p.protein != null || p.carbs != null || p.fat != null || !!p.diets?.some((d) => d !== "omnivore") || !!p.allergens?.length;
}
