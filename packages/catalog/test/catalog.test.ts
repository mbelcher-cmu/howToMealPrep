import { describe, expect, it } from "vitest";
import { INGREDIENTS, RECIPES, formatAmount, CUISINES, MOODS } from "../src";

describe("catalog", () => {
  it("loads every recipe with valid ingredients and tags", () => {
    expect(RECIPES.length).toBeGreaterThanOrEqual(130);
    expect(new Set(RECIPES.map((r) => r.id)).size).toBe(RECIPES.length);
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
  it("has a real vegetarian choice in every meal slot and a vegan one for every slot", () => {
    const count = (m: string, d: string) => RECIPES.filter((r) => r.mealType === m && r.diets.includes(d as never)).length;
    expect(count("main", "vegetarian")).toBeGreaterThanOrEqual(30);
    expect(count("breakfast", "vegetarian")).toBeGreaterThanOrEqual(10);
    expect(count("snack", "vegetarian")).toBeGreaterThanOrEqual(10);
    for (const m of ["breakfast", "main", "snack"]) expect(count(m, "vegan"), m).toBeGreaterThanOrEqual(3);
  });
  it("covers every mood", () => {
    const used = new Set(RECIPES.flatMap((r) => r.moods));
    expect(Object.keys(MOODS).filter((m) => !used.has(m as never))).toEqual([]);
  });
  it("ingredient nutrition is physically possible (protein + carbs + fat + fiber fit in 100 g)", () => {
    for (const ing of Object.values(INGREDIENTS)) {
      const { protein, carbs, fat, fiber } = ing.per100g;
      expect(protein + carbs + fat, ing.id).toBeLessThanOrEqual(100);
      expect(fiber, ing.id).toBeLessThanOrEqual(carbs);
    }
  });
  it("every recipe can be bought at Walmart, so plans work outside Pittsburgh", () => {
    // Testers outside Pittsburgh shop Walmart and Aldi; Walmart must carry every ingredient.
    for (const ing of Object.values(INGREDIENTS)) expect(ing.estPrice.walmart, ing.id).not.toBeNull();
    const aldiShort = RECIPES.filter((r) => r.lines.some((l) => INGREDIENTS[l.ingredientId]!.estPrice.aldi == null)).length;
    expect(aldiShort / RECIPES.length).toBeLessThan(0.15);
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
