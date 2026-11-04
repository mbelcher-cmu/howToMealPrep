import { CUISINES, FLAVORS, INGREDIENTS, MOODS, PROTEIN_SOURCES, RECIPES, type ChainId, type Equipment, type MealType, type Recipe } from "@prep-cart/catalog";
import type { EatingOccasion } from "@prep-cart/nutrition";
import type { Preferences, PriceTable, Wish } from "./types";

/** Equipment a recipe can do without (it names it as one option among several). */
const OPTIONAL_EQUIPMENT = new Set<Equipment>(["grill", "slowCooker", "pressureCooker", "airFryer"]);

export function slotTypeFor(o: EatingOccasion): MealType {
  if (o.kind === "snack") return "snack";
  return /breakfast/i.test(o.name) ? "breakfast" : "main";
}

export interface Rejection { recipeId: string; reason: string }

/** Hard rules: diets, allergens, dislikes, equipment, time. Returns the reason a recipe is out, or null. */
export function hardRejection(r: Recipe, p: Preferences): string | null {
  for (const d of p.diets) if (!r.diets.includes(d)) return `not ${d}`;
  for (const a of p.allergens) if (r.allergens.includes(a)) return `contains ${a}`;
  for (const l of r.lines) if (p.dislikes.includes(l.ingredientId)) return `contains ${INGREDIENTS[l.ingredientId]?.name ?? l.ingredientId}`;
  const needs = r.equipment.filter((e) => !OPTIONAL_EQUIPMENT.has(e));
  for (const e of needs) if (p.missingEquipment.includes(e)) return `needs ${e}`;
  if (r.equipment.every((e) => p.missingEquipment.includes(e))) return "needs equipment you don't have";
  if (r.activeMinutes > p.maxActiveMinutes) return `takes ${r.activeMinutes} minutes hands-on`;
  if (p.excludeRecipes?.includes(r.id)) return "skipped this week";
  if (p.ratings?.[r.id] === 1) return "you rated it 1 star";
  return null;
}

const WISH_SCORE: Record<Wish, number> = { must: 3, nice: 1, avoid: -3 };

/** Soft preference fit, roughly -6..+8. Also returns the human reasons behind it. */
export function preferenceFit(r: Recipe, p: Preferences): { fit: number; reasons: string[] } {
  let fit = 0;
  const reasons: string[] = [];
  const groups: [string, readonly string[], Partial<Record<string, Wish>>, Record<string, string>][] = [
    ["cuisine", r.cuisines, p.cuisines, CUISINES],
    ["mood", r.moods, p.moods, MOODS],
    ["flavor", r.flavors, p.flavors, FLAVORS],
    ["protein", r.proteins, p.proteins, PROTEIN_SOURCES],
  ];
  for (const [kind, tags, wishes, labels] of groups) {
    let best = 0;
    let label = "";
    for (const t of tags) {
      const w = wishes[t];
      if (!w) continue;
      const s = WISH_SCORE[w];
      if (s < 0) { fit += s; continue; }
      if (s > best) { best = s; label = labels[t] ?? t; }
    }
    fit += best;
    if (best > 0) reasons.push(`${label}`);
    // a "must" in this group that the recipe doesn't meet pulls it down
    const musts = Object.entries(wishes).filter(([, w]) => w === "must").map(([k]) => k);
    if (musts.length && !tags.some((t) => musts.includes(t))) fit -= kind === "cuisine" ? 2.5 : 1.5;
  }
  const stars = p.ratings?.[r.id];
  if (stars === 5) { fit += 2; reasons.unshift("you rated it 5 stars"); }
  else if (stars === 4) { fit += 1; reasons.unshift("you rated it 4 stars"); }
  else if (stars === 2) fit -= 1.5;
  if (r.id.startsWith("custom_")) { fit += 0.5; reasons.unshift("your recipe"); }
  return { fit, reasons };
}

export function cheapestPrice(prices: PriceTable, ingredientId: string, stores: ChainId[]): number | null {
  let best: number | null = null;
  for (const s of stores) {
    const q = prices[ingredientId]?.[s];
    if (q && (best == null || q.price < best)) best = q.price;
  }
  return best;
}

/** Estimated cost of one serving at the cheapest selected store (no package rounding). */
export function servingCost(r: Recipe, prices: PriceTable, stores: ChainId[], freeIds: Set<string>): number {
  let c = 0;
  for (const l of r.lines) {
    if (freeIds.has(l.ingredientId)) continue;
    const p = cheapestPrice(prices, l.ingredientId, stores);
    const ing = INGREDIENTS[l.ingredientId]!;
    c += ((p ?? 6) * l.grams) / ing.pkg.grams;
  }
  return c / r.servings;
}

export function candidatePool(slot: MealType, p: Preferences): { ok: Recipe[]; rejected: Rejection[] } {
  const ok: Recipe[] = [];
  const rejected: Rejection[] = [];
  for (const r of RECIPES) {
    if (r.mealType !== slot) continue;
    const why = hardRejection(r, p);
    if (why) rejected.push({ recipeId: r.id, reason: why });
    else ok.push(r);
  }
  return { ok, rejected };
}
