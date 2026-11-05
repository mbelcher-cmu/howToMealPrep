import { describe, expect, it } from "vitest";
import { RECIPES, RECIPES_BY_ID } from "@prep-cart/catalog";
import { defaultOccasions } from "@prep-cart/nutrition";
import { applyDeals, buildPriceTable, candidatePool, cheapestPrice, hardRejection, preferenceFit, servingCost, slotTypeFor, type Preferences } from "../src";

const prefs = (over: Partial<Preferences> = {}): Preferences => ({
  diets: [], allergens: [], dislikes: [], missingEquipment: [], cuisines: {}, moods: {}, flavors: {}, proteins: {}, maxActiveMinutes: 120, ...over,
});

describe("recipe filters", () => {
  it("maps eating occasions to recipe types", () => {
    const [b, l, d, s] = defaultOccasions(3, 1);
    expect(slotTypeFor(b!)).toBe("breakfast");
    expect(slotTypeFor(l!)).toBe("main");
    expect(slotTypeFor(d!)).toBe("main");
    expect(slotTypeFor(s!)).toBe("snack");
  });

  it("rejects recipes that break a diet, allergy, dislike, time limit, skip or 1-star rating", () => {
    const tikka = RECIPES_BY_ID.chicken_tikka!;
    expect(hardRejection(tikka, prefs())).toBeNull();
    expect(hardRejection(tikka, prefs({ diets: ["vegetarian"] }))).toBe("not vegetarian");
    expect(hardRejection(tikka, prefs({ dislikes: [tikka.lines[0]!.ingredientId] }))).toMatch(/^contains /);
    expect(hardRejection(tikka, prefs({ maxActiveMinutes: tikka.activeMinutes - 1 }))).toMatch(/minutes hands-on/);
    expect(hardRejection(tikka, prefs({ excludeRecipes: [tikka.id] }))).toBe("skipped this week");
    expect(hardRejection(tikka, prefs({ ratings: { [tikka.id]: 1 } }))).toBe("you rated it 1 star");
    const withAllergen = RECIPES.find((r) => r.allergens.length > 0)!;
    expect(hardRejection(withAllergen, prefs({ allergens: [withAllergen.allergens[0]!] }))).toBe(`contains ${withAllergen.allergens[0]}`);
  });

  it("never lets a filtered pool contain a recipe that breaks the rules", () => {
    const p = prefs({ diets: ["vegan"], allergens: ["soy"], maxActiveMinutes: 30 });
    for (const slot of ["breakfast", "main", "snack"] as const) {
      const { ok, rejected } = candidatePool(slot, p);
      for (const r of ok) {
        expect(r.mealType).toBe(slot);
        expect(r.diets).toContain("vegan");
        expect(r.allergens).not.toContain("soy");
        expect(r.activeMinutes).toBeLessThanOrEqual(30);
      }
      expect(ok.length + rejected.length).toBe(RECIPES.filter((r) => r.mealType === slot).length);
    }
  });

  it("ranks a must-have cuisine above one that misses it, and an avoided one lowest", () => {
    const tikka = RECIPES_BY_ID.chicken_tikka!;
    const cuisine = tikka.cuisines[0]!;
    const other = RECIPES.find((r) => r.mealType === "main" && !r.cuisines.includes(cuisine))!;
    const must = prefs({ cuisines: { [cuisine]: "must" } });
    expect(preferenceFit(tikka, must).fit).toBeGreaterThan(preferenceFit(other, must).fit);
    expect(preferenceFit(tikka, prefs({ cuisines: { [cuisine]: "avoid" } })).fit).toBeLessThan(preferenceFit(tikka, prefs()).fit);
    expect(preferenceFit(tikka, prefs({ ratings: { [tikka.id]: 5 } })).reasons[0]).toBe("you rated it 5 stars");
  });
});

describe("prices", () => {
  it("lets the person's own prices replace estimates", () => {
    const t = buildPriceTable({ eggs: { aldi: { price: 9.99, source: "receipt" }, walmart: null } });
    expect(t.eggs!.aldi).toEqual({ price: 9.99, source: "receipt" });
    expect(t.eggs!.walmart).toBeNull();
    expect(t.eggs!.gianteagle?.source).toBe("estimate");
  });

  it("finds the cheapest selected store and ignores stores not selected", () => {
    const t = buildPriceTable({ rice: { aldi: { price: 1, source: "manual" }, walmart: { price: 0.5, source: "manual" } } });
    expect(cheapestPrice(t, "rice", ["aldi", "walmart"])).toBe(0.5);
    expect(cheapestPrice(t, "rice", ["aldi"])).toBe(1);
    expect(cheapestPrice(t, "rice", [])).toBeNull();
  });

  it("counts free (pantry) ingredients as costing nothing", () => {
    const r = RECIPES_BY_ID.chicken_tikka!;
    const t = buildPriceTable();
    const all = servingCost(r, t, ["aldi"], new Set());
    const less = servingCost(r, t, ["aldi"], new Set([r.lines[0]!.ingredientId]));
    expect(all).toBeGreaterThan(0);
    expect(less).toBeLessThan(all);
    expect(servingCost(r, t, ["aldi"], new Set(r.lines.map((l) => l.ingredientId)))).toBe(0);
  });

  it("applies only sales that are running and cheaper than usual", () => {
    const t = buildPriceTable({ eggs: { aldi: { price: 3, source: "estimate" } } });
    const today = "2026-11-05";
    expect(applyDeals(t, [{ ingredientId: "eggs", chain: "aldi", price: 2, endsOn: "2026-11-04" }], today).eggs!.aldi!.price).toBe(3);
    expect(applyDeals(t, [{ ingredientId: "eggs", chain: "aldi", price: 3.5, endsOn: today }], today).eggs!.aldi!.price).toBe(3);
    expect(applyDeals(t, [{ ingredientId: "eggs", chain: "aldi", price: 0, endsOn: today }], today).eggs!.aldi!.price).toBe(3);
    const on = applyDeals(t, [{ ingredientId: "eggs", chain: "aldi", price: 2, endsOn: today }], today).eggs!.aldi!;
    expect(on).toMatchObject({ price: 2, source: "sale", regular: 3, observedAt: today });
    expect(t.eggs!.aldi!.price, "the original table is untouched").toBe(3);
  });
});
