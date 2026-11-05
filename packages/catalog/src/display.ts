import { INGREDIENTS } from "./ingredients";

export type UnitSystem = "us" | "metric";

/** Friendly amount for a quantity of an ingredient: "3 eggs", "1.5 lb", "6 oz", "250 g". */
export function formatAmount(ingredientId: string, grams: number, units: UnitSystem = "us"): string {
  const ing = INGREDIENTS[ingredientId];
  if (ing?.each) {
    const n = Math.max(0.5, Math.round((grams / ing.each.grams) * 2) / 2);
    return `${fmt(n)} ${n === 1 ? ing.each.one : ing.each.many}`;
  }
  if (units === "metric") return grams >= 1000 ? `${fmt(Math.round(grams / 100) / 10)} kg` : `${Math.round(grams)} g`;
  if (grams >= 454) return `${fmt(Math.round((grams / 453.6) * 10) / 10)} lb`;
  if (grams >= 14) return `${fmt(Math.round((grams / 28.35) * 2) / 2)} oz`;
  return `${Math.round(grams)} g`;
}
const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1).replace(/\.0$/, ""));

/**
 * "Recipes use" and "left over" for a shopping line, rounded so the two add up to what was bought.
 * Counted items round to the half (9 blocks bought: use 8½, ½ left), so each side is not rounded on its own
 * (which could show "use 9, ½ left" from 9). Leftovers too small to matter come back as null.
 */
export function formatUseAndLeftover(ingredientId: string, needGrams: number, leftoverGrams: number, units: UnitSystem = "us"): { use: string; left: string | null } {
  const ing = INGREDIENTS[ingredientId];
  if (ing?.each) {
    const half = (g: number) => Math.round((g / ing.each!.grams) * 2) / 2;
    const total = half(needGrams + leftoverGrams);
    const used = Math.min(total, Math.max(needGrams > 0 ? 0.5 : 0, half(needGrams)));
    const left = total - used;
    const say = (n: number) => `${fmt(n)} ${n === 1 ? ing.each!.one : ing.each!.many}`;
    return { use: say(used), left: left >= 0.5 ? say(left) : null };
  }
  return { use: formatAmount(ingredientId, needGrams, units), left: leftoverGrams >= 10 ? formatAmount(ingredientId, leftoverGrams, units) : null };
}
