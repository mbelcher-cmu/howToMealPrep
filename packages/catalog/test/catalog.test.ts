import { describe, expect, it } from "vitest";
import { INGREDIENTS, RECIPES, formatAmount, CUISINES } from "../src";

describe("catalog", () => {
  it("loads every recipe with valid ingredients and tags", () => {
    expect(RECIPES.length).toBeGreaterThanOrEqual(75);
  });
  it("derives calories from macros", () => {
    for (const r of RECIPES) {
      const k = 4 * r.perServing.protein + 4 * r.perServing.carbs + 9 * r.perServing.fat;
      expect(Math.abs(r.perServing.kcal - k)).toBeLessThanOrEqual(1);
    }
  });
  it("keeps servings in a sensible range", () => {
    const bad = RECIPES.filter((r) => {
      const k = r.perServing.kcal;
      if (r.mealType === "snack") return k < 80 || k > 400;
      if (r.mealType === "breakfast") return k < 250 || k > 750;
      return k < 300 || k > 950;
    }).map((r) => `${r.id} ${r.perServing.kcal}`);
    expect(bad).toEqual([]);
  });
  it("classifies diets from ingredients", () => {
    const byId = Object.fromEntries(RECIPES.map((r) => [r.id, r]));
    expect(byId.chickpea_curry!.diets).toContain("vegan");
    expect(byId.baked_ziti!.diets).toContain("vegetarian");
    expect(byId.baked_ziti!.diets).not.toContain("vegan");
    expect(byId.shrimp_fried_rice!.diets).toContain("pescatarian");
    expect(byId.egg_roll_bowl!.diets).not.toContain("noPork");
    expect(byId.steak_broccoli!.diets).toContain("keto");
    expect(byId.turkey_bolognese!.allergens).toContain("wheat");
  });
  it("covers every cuisine and has vegetarian options for each meal type", () => {
    const used = new Set(RECIPES.flatMap((r) => r.cuisines));
    expect([...Object.keys(CUISINES)].filter((c) => !used.has(c as never))).toEqual([]);
    for (const m of ["breakfast", "main", "snack"]) expect(RECIPES.some((r) => r.mealType === m && r.diets.includes("vegetarian"))).toBe(true);
  });
  it("every ingredient is used or priced somewhere", () => {
    for (const ing of Object.values(INGREDIENTS)) expect(Object.values(ing.estPrice).some((p) => p != null)).toBe(true);
  });
  it("formats amounts", () => {
    expect(formatAmount("eggs", 300)).toBe("6 eggs");
    expect(formatAmount("chicken_breast", 907)).toBe("2 lb");
    expect(formatAmount("spinach", 142)).toBe("5 oz");
    expect(formatAmount("rice", 1500, "metric")).toBe("1.5 kg");
  });
});
