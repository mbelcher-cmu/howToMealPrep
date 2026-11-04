import { describe, expect, it } from "vitest";
import { adherence, defaultOccasions } from "@prep-cart/nutrition";
import { plan, schedule } from "../src";
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
});
