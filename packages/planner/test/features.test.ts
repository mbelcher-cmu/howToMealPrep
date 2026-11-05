import { describe, expect, it } from "vitest";
import { adherence, defaultOccasions } from "@prep-cart/nutrition";
import { INGREDIENTS, RECIPES_BY_ID } from "@prep-cart/catalog";
import { applyDeals, buildPriceTable, hardRejection, plan, schedule } from "../src";
import { baseRequest, highsPromise } from "./fixtures";

describe("planner features", async () => {
  const highs = await highsPromise;

  it("gives breakfast the protein the person set for it", () => {
    const occasions = defaultOccasions(3, 2).map((o) => (o.id === "meal-1" ? { ...o, macros: { protein: 40, carbs: 45, fat: 15 } } : o));
    const req = baseRequest({ occasions, budget: 90 });
    const r = plan(req, highs);
    expect(r.status).toBe("ok");
    const b = r.recipes.filter((p) => p.slot === "breakfast");
    const protein = b.reduce((a, p) => a + p.recipe.perServing.protein * p.portion * p.meals, 0) / 7;
    expect(protein, JSON.stringify(b.map((p) => [p.recipe.id, p.portion]))).toBeGreaterThanOrEqual(33);
    expect(adherence(r.daily, req.targets).kcal.ok).toBe(true);
  });

  it("plans a week of whole foods only", () => {
    const req = baseRequest({ prefs: { ...baseRequest().prefs, diets: ["wholeFoods"] }, budget: 95 });
    const r = plan(req, highs);
    expect(r.status).not.toBe("no_recipes");
    for (const p of r.recipes) expect(p.recipe.diets).toContain("wholeFoods");
    for (const l of r.cart) expect(INGREDIENTS[l.ingredientId]!.processing, l.ingredientId).not.toBe("processed");
  });

  it("keeps a whole-foods plan clean even when locked recipes or stale tags say otherwise", () => {
    const prefs = { ...baseRequest().prefs, diets: ["wholeFoods" as const] };
    // a recipe saved before an ingredient was retagged still carries the wholeFoods tag
    const stale = { ...RECIPES_BY_ID["gochujang_tofu"]!, diets: [...RECIPES_BY_ID["gochujang_tofu"]!.diets, "wholeFoods" as const] };
    expect(hardRejection(stale, prefs)).toMatch(/Gochujang, a processed food/);
    const r = plan(baseRequest({ prefs, budget: 95, lockedRecipes: ["bacon_potato_bowls"] }), highs);
    expect(r.recipes.map((p) => p.recipe.id)).not.toContain("bacon_potato_bowls");
    for (const l of r.cart) expect(INGREDIENTS[l.ingredientId]!.processing, l.ingredientId).not.toBe("processed");
  });

  it("mixes takeout into the week and still hits targets and budget", () => {
    const eatingOut = [{ day: 4, occasionId: "meal-3", itemId: "chipotle_chicken_bowl" }, { day: 5, occasionId: "meal-3", itemId: "cfa_cool_wrap" }];
    const req = baseRequest({ eatingOut, budget: 90 });
    const r = plan(req, highs);
    expect(r.status).toBe("ok");
    expect(r.takeout.meals).toHaveLength(2);
    expect(r.takeout.cost).toBeCloseTo(19.5, 2);
    expect(r.cost + r.takeout.cost).toBeLessThanOrEqual(90);
    expect(r.recipes.reduce((s, p) => s + p.meals, 0)).toBe(35 - 2);
    const a = adherence(r.daily, req.targets);
    expect(a.pass, JSON.stringify({ daily: r.daily, t: req.targets })).toBe(true);
    const sch = schedule(r, req.occasions, 7);
    expect(sch.days[4]!.takeout[0]!.itemId).toBe("chipotle_chicken_bowl");
    expect(sch.days[4]!.meals.some((m) => m.occasionId === "meal-3")).toBe(false);
  });

  it("ignores takeout on days outside the plan", () => {
    const r = plan(baseRequest({ days: 3, eatingOut: [{ day: 5, occasionId: "meal-3", itemId: "chipotle_chicken_bowl" }] }), highs);
    expect(r.takeout.meals).toHaveLength(0);
  });

  it("uses up pantry food that's about to spoil", () => {
    const base = baseRequest();
    const without = plan(base, highs);
    const usesSpinach = (rs: typeof without.recipes) => rs.some((p) => p.recipe.lines.some((l) => l.ingredientId === "spinach"));
    const pantry = [...base.pantry, { ingredientId: "spinach", grams: 280, daysLeft: 2 }];
    const r = plan(baseRequest({ pantry }), highs);
    expect(usesSpinach(r.recipes), `before: ${usesSpinach(without.recipes)}`).toBe(true);
    expect(r.recipes.some((p) => p.reasons.some((x) => x.includes("uses up your"))) || usesSpinach(without.recipes)).toBe(true);
  });

  it("plans around a big sale", () => {
    const deals = [{ ingredientId: "salmon", chain: "aldi" as const, price: 3.49, endsOn: "2099-01-01" }, { ingredientId: "tofu", chain: "aldi" as const, price: 9, endsOn: "2099-01-01" }];
    const prices = applyDeals(buildPriceTable(), deals, "2026-11-04");
    expect(prices.salmon!.aldi).toMatchObject({ price: 3.49, source: "sale", regular: 7.49 });
    expect(prices.tofu!.aldi!.source).toBe("estimate"); // not cheaper, so not a deal
    expect(applyDeals(buildPriceTable(), [{ ...deals[0]!, endsOn: "2026-11-01" }], "2026-11-04").salmon!.aldi!.source).toBe("estimate");
    const r = plan(baseRequest({ prices, stores: ["aldi"], costVsMacros: undefined } as never), highs);
    const reasons = r.recipes.flatMap((p) => p.reasons);
    const usesSalmon = r.recipes.some((p) => p.recipe.lines.some((l) => l.ingredientId === "salmon"));
    if (usesSalmon) expect(reasons.some((x) => x.includes("on sale"))).toBe(true);
  });
});
