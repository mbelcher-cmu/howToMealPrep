import { INGREDIENTS, type Aisle, type ChainId, type Recipe } from "@prep-cart/catalog";

/**
 * Pantry helpers (pure, tested in test/pantry.test.ts).
 * A pantry row with grams = Infinity is a staple the person always has (oil, salt, spices).
 */
export interface PantryLike { ingredientId: string; grams: number; useBy?: string }

export type Storage = "fridge" | "freezer" | "cupboard";
export const STORAGE_LABEL: Record<Storage, string> = { fridge: "Fridge", freezer: "Freezer", cupboard: "Cupboard" };
export const STORAGE_ORDER: Storage[] = ["fridge", "freezer", "cupboard"];

const FRIDGE_AISLES = new Set<Aisle>(["Meat and seafood", "Dairy and eggs", "Deli"]);
/** Produce that keeps on the counter or in the cupboard rather than the fridge. */
const COUNTER = new Set(["potatoes", "sweet_potato", "onion", "garlic", "bananas", "plantains", "avocado"]);

/** Where an ingredient usually lives at home. */
export function storageOf(id: string): Storage {
  const ing = INGREDIENTS[id];
  if (!ing) return "cupboard";
  if (ing.aisle === "Frozen") return "freezer";
  if (FRIDGE_AISLES.has(ing.aisle)) return "fridge";
  if (ing.aisle === "Produce") return COUNTER.has(id) ? "cupboard" : "fridge";
  return "cupboard";
}

/** Quick amounts for an item, as a share of one package. */
export const QUICK_AMOUNTS = [
  { share: 1, label: "Full" },
  { share: 0.5, label: "Half" },
  { share: 0.2, label: "A little" },
] as const;

/** Which quick amount the grams are closest to, if any is within 10% of a package. */
export function nearestQuick(id: string, grams: number): number | null {
  const pkg = INGREDIENTS[id]?.pkg.grams;
  if (!pkg || grams === Infinity) return null;
  for (const q of QUICK_AMOUNTS) if (Math.abs(grams - q.share * pkg) <= pkg * 0.1) return q.share;
  return null;
}

/** Lowest known price of one package: the person's own price if set, else the cheapest estimate. */
export function packagePrice(id: string, overrides: Record<string, Partial<Record<ChainId, { price: number } | null>>> = {}): number | null {
  const ing = INGREDIENTS[id];
  if (!ing) return null;
  const prices = (Object.keys(ing.estPrice) as ChainId[]).map((c) => {
    const o = overrides[id]?.[c];
    return o === undefined ? ing.estPrice[c] : o?.price ?? null;
  }).filter((p): p is number => p != null && p > 0);
  return prices.length ? Math.min(...prices) : null;
}

/**
 * Roughly what the food taken from the pantry would have cost to buy, in dollars.
 * Staples are left out: nobody buys a bottle of oil for one week.
 */
export function pantrySavings(used: { ingredientId: string; grams: number }[], pantry: PantryLike[], overrides?: Parameters<typeof packagePrice>[1]): number {
  const staples = new Set(pantry.filter((p) => p.grams === Infinity).map((p) => p.ingredientId));
  let total = 0;
  for (const u of used) {
    if (staples.has(u.ingredientId)) continue;
    const ing = INGREDIENTS[u.ingredientId];
    const price = packagePrice(u.ingredientId, overrides);
    if (!ing || price == null) continue;
    total += (u.grams / ing.pkg.grams) * price;
  }
  return Math.round(total * 100) / 100;
}

export interface PantryMatch {
  recipe: Recipe;
  /** ingredients you have enough of (staples left out) */
  have: string[];
  /** ingredients you'd still need to buy */
  missing: string[];
  /** pantry items about to go off that this recipe uses */
  usesSoon: string[];
}

/**
 * Recipes ranked by how much of them the pantry already covers. An ingredient counts when the
 * pantry holds at least half of what one batch uses. Staples count as had but don't add to the score,
 * so a recipe is not ranked high just for using oil and salt.
 */
export function cookFromPantry(pantry: PantryLike[], recipes: Recipe[], opts: { soonIds?: Set<string>; limit?: number } = {}): PantryMatch[] {
  const grams = new Map(pantry.map((p) => [p.ingredientId, p.grams]));
  const soon = opts.soonIds ?? new Set<string>();
  const out: PantryMatch[] = [];
  for (const r of recipes) {
    const have: string[] = [];
    const missing: string[] = [];
    for (const l of r.lines) {
      const g = grams.get(l.ingredientId) ?? 0;
      if (g === Infinity) continue;
      if (g >= l.grams * 0.5) have.push(l.ingredientId); else missing.push(l.ingredientId);
    }
    if (!have.length) continue;
    out.push({ recipe: r, have, missing, usesSoon: have.filter((id) => soon.has(id)) });
  }
  const share = (m: PantryMatch) => m.have.length / (m.have.length + m.missing.length);
  out.sort((a, b) => b.usesSoon.length - a.usesSoon.length || share(b) - share(a) || b.have.length - a.have.length || a.recipe.name.localeCompare(b.recipe.name));
  return out.slice(0, opts.limit ?? 3);
}
