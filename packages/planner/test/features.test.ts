import { describe, expect, it } from "vitest";
import { adherence, defaultOccasions } from "@prep-cart/nutrition";
import { plan } from "../src";
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
  });
});
