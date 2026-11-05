import { describe, expect, it } from "vitest";
import {
  ALLERGENS, CHAINS, CUISINES, DIETS, INGREDIENTS, MENU_ITEMS, MOODS, PREP_PACKS, RECIPES, RECIPES_BY_ID, RESTAURANTS, RESTAURANTS_BY_ID,
  menuFit, packDay, packRecipes, shelfLifeDays,
} from "../src";

/** Data checks: a typo in the catalog should fail here, not on someone's shopping list. */
describe("catalog integrity", () => {
  it("has unique ids", () => {
    const dupes = (ids: string[]) => ids.filter((id, i) => ids.indexOf(id) !== i);
    expect(dupes(RECIPES.map((r) => r.id))).toEqual([]);
    expect(dupes(Object.values(INGREDIENTS).map((i) => i.id))).toEqual([]);
    expect(dupes(MENU_ITEMS.map((m) => m.id))).toEqual([]);
    expect(dupes(PREP_PACKS.map((p) => p.id))).toEqual([]);
  });

  it("only uses ingredients that exist, in positive amounts", () => {
    const bad = RECIPES.flatMap((r) => r.lines.filter((l) => !INGREDIENTS[l.ingredientId] || !(l.grams > 0)).map((l) => `${r.id}: ${l.ingredientId} ${l.grams}`));
    expect(bad).toEqual([]);
  });

  it("gives every recipe steps, servings and sane times", () => {
    for (const r of RECIPES) {
      expect(r.steps.length, r.id).toBeGreaterThan(0);
      expect(r.servings, r.id).toBeGreaterThan(0);
      expect(r.activeMinutes, r.id).toBeGreaterThan(0);
      expect(r.totalMinutes, r.id).toBeGreaterThanOrEqual(r.activeMinutes);
      expect(r.fridgeDays, r.id).toBeGreaterThanOrEqual(1);
      // cooked food keeps a week at most; shelf-stable snacks (nut packs) can say longer
      expect(r.fridgeDays, r.id).toBeLessThanOrEqual(r.mealType === "snack" ? 90 : 7);
      expect(RECIPES_BY_ID[r.id]).toBe(r);
    }
  });

  it("tags recipes only with known cuisines, moods, diets and allergens", () => {
    for (const r of RECIPES) {
      for (const c of r.cuisines) expect(CUISINES, `${r.id} cuisine ${c}`).toHaveProperty(c);
      for (const m of r.moods) expect(MOODS, `${r.id} mood ${m}`).toHaveProperty(m);
      for (const d of r.diets) expect(DIETS, `${r.id} diet ${d}`).toHaveProperty(d);
      for (const a of r.allergens) expect(Object.keys(ALLERGENS), `${r.id} allergen ${a}`).toContain(a);
    }
  });

  it("never calls a recipe vegan or vegetarian when an ingredient comes from an animal", () => {
    for (const r of RECIPES) {
      const animals = r.lines.map((l) => INGREDIENTS[l.ingredientId]!.animal).filter(Boolean);
      if (r.diets.includes("vegan")) expect(animals, r.id).toEqual([]);
      if (r.diets.includes("vegetarian")) expect(animals.filter((a) => !["dairy", "egg", "honey"].includes(a!)), r.id).toEqual([]);
    }
  });

  it("lists an allergen on the recipe whenever an ingredient has it", () => {
    for (const r of RECIPES) {
      const fromLines = new Set(r.lines.flatMap((l) => INGREDIENTS[l.ingredientId]!.allergens));
      for (const a of fromLines) expect(r.allergens, `${r.id} should list ${a}`).toContain(a);
    }
  });

  it("prices ingredients positively and in a real package size", () => {
    const chains = CHAINS.map((c) => c.id);
    for (const ing of Object.values(INGREDIENTS)) {
      expect(ing.pkg.grams, ing.id).toBeGreaterThan(0);
      for (const ch of chains) {
        const p = ing.estPrice[ch];
        if (p != null) { expect(p, `${ing.id} at ${ch}`).toBeGreaterThan(0); expect(p, `${ing.id} at ${ch}`).toBeLessThan(60); }
      }
      expect(shelfLifeDays(ing.id), ing.id).toBeGreaterThan(0);
      const m = ing.per100g;
      expect(4 * m.protein + 4 * m.carbs + 9 * m.fat, `${ing.id} is denser than pure fat`).toBeLessThanOrEqual(900 + 1);
    }
  });

  it("builds every featured meal prep from real recipes in the right slots", () => {
    for (const p of PREP_PACKS) {
      const rs = packRecipes(p);
      expect(rs, p.id).toHaveLength(4);
      expect(RECIPES_BY_ID[p.breakfast]!.mealType, p.id).toBe("breakfast");
      for (const m of p.mains) expect(RECIPES_BY_ID[m]!.mealType, `${p.id} ${m}`).toBe("main");
      expect(RECIPES_BY_ID[p.snack]!.mealType, p.id).toBe("snack");
      const day = packDay(p);
      expect(day.kcal, p.id).toBeGreaterThan(900);
      // each macro is rounded on its own, so the shown grams can differ from the calories by rounding only (at most 8.5)
      expect(Math.abs(day.kcal - (4 * day.protein + 4 * day.carbs + 9 * day.fat)), p.id).toBeLessThanOrEqual(8.5);
    }
  });

});

describe("restaurant menu", () => {
  it("belongs to a known restaurant, with calories from macros and a price", () => {
    for (const m of MENU_ITEMS) {
      expect(RESTAURANTS_BY_ID[m.restaurantId], m.id).toBeDefined();
      expect(m.kcal, m.id).toBe(4 * m.protein + 4 * m.carbs + 9 * m.fat);
      expect(m.price, m.id).toBeGreaterThan(0);
      if (m.vegan) expect(m.vegetarian, m.id).toBe(true);
    }
  });

  it("has unique ids, and each chain's map pattern matches its own name only", () => {
    expect(new Set(MENU_ITEMS.map((m) => m.id)).size).toBe(MENU_ITEMS.length);
    for (const r of RESTAURANTS) {
      expect(r.match.test(r.name), r.id).toBe(true);
      for (const o of RESTAURANTS) if (o.id !== r.id) expect(r.match.test(o.name), `${r.id} vs ${o.id}`).toBe(false);
    }
  });

  it("scores a perfect match as 0 and a protein shortfall worse than a surplus", () => {
    const m = MENU_ITEMS.find((x) => x.id === "chipotle_chicken_bowl")!;
    expect(menuFit(m, m)).toBe(0);
    const t = { kcal: m.kcal, protein: m.protein, carbs: m.carbs, fat: m.fat };
    expect(menuFit(m, { ...t, protein: m.protein + 20 })).toBeGreaterThan(menuFit(m, { ...t, protein: m.protein - 20 }));
  });
});

describe("shopping line amounts", () => {
  it("never shows more used plus left over than was bought", async () => {
    const { formatUseAndLeftover } = await import("../src");
    const counted = Object.values(INGREDIENTS).filter((i) => i.each);
    for (const ing of counted) {
      for (const packages of [1, 2, 9]) {
        const bought = ing.pkg.grams * packages;
        for (const need of [bought * 0.03, bought * 0.5, bought * 0.94, bought * 0.97, bought]) {
          const { use, left } = formatUseAndLeftover(ing.id, need, bought - need);
          const n = (s: string | null) => (s ? Number(s.split(" ")[0]) : 0);
          const total = Math.round((bought / ing.each!.grams) * 2) / 2;
          expect(n(use) + n(left), `${ing.id} ${packages} pkg, need ${need}`).toBeCloseTo(total, 5);
        }
      }
    }
  });
  it("hides tiny leftovers by weight", async () => {
    const { formatUseAndLeftover } = await import("../src");
    expect(formatUseAndLeftover("rice", 900, 5).left).toBeNull();
    expect(formatUseAndLeftover("rice", 400, 507).left).toBe("1.1 lb");
  });
});
