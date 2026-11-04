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
