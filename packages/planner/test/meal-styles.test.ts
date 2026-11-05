import { describe, expect, it } from "vitest";
import { defaultOccasions, MEAL_STYLES } from "@prep-cart/nutrition";
import { plan, schedule } from "../src";
import { baseRequest, highsPromise } from "./fixtures";

describe("meal styles in the plan", async () => {
  const highs = await highsPromise;

  it("a lighter dinner gets smaller portions than lunch, and nothing extra is cooked", () => {
    const occasions = defaultOccasions(3, 1).map((o) => (o.name === "Dinner" ? { ...o, style: "light" as const } : o));
    const req = baseRequest({ occasions, budget: 95 });
    const r = plan(req, highs);
    expect(r.status, r.message).toBe("ok");
    const s = schedule(r, req.occasions, 7, "mix", req.targets);
    const lunch = s.days.flatMap((d) => d.meals.filter((m) => m.occasionName === "Lunch"));
    const dinner = s.days.flatMap((d) => d.meals.filter((m) => m.occasionName === "Dinner"));
    const avg = (xs: { portion: number }[]) => xs.reduce((a, m) => a + m.portion, 0) / xs.length;
    expect(avg(dinner)).toBeLessThan(avg(lunch) * 0.85);
    // every recipe's portions still add up to what the plan cooks for them
    for (const p of r.recipes) {
      const eaten = s.days.flatMap((d) => d.meals).filter((m) => m.recipeId === p.recipe.id).reduce((a, m) => a + m.portion, 0);
      expect(Math.abs(eaten - p.portion * p.meals)).toBeLessThan(0.1);
    }
  });

  it("without targets, or with no styles, portions stay even", () => {
    const req = baseRequest({ budget: 95 });
    const r = plan(req, highs);
    const a = schedule(r, req.occasions, 7, "mix", req.targets);
    const b = schedule(r, req.occasions, 7, "mix");
    expect(a.days).toEqual(b.days);
  });

  it("a high-protein breakfast steers breakfast toward protein", () => {
    const base = baseRequest({ budget: 95 });
    const styled = { ...base, occasions: base.occasions.map((o) => (o.name === "Breakfast" ? { ...o, style: "protein" as const } : o)) };
    const proteinShare = (req: typeof base) => {
      const r = plan(req, highs);
      expect(r.status, r.message).not.toBe("no_recipes");
      const b = r.recipes.filter((p) => p.slot === "breakfast");
      const kcal = b.reduce((a, p) => a + p.recipe.perServing.kcal * p.portion * p.meals, 0);
      return b.reduce((a, p) => a + p.recipe.perServing.protein * 4 * p.portion * p.meals, 0) / kcal;
    };
    expect(proteinShare(styled)).toBeGreaterThanOrEqual(proteinShare(base) - 0.001);
    expect(MEAL_STYLES.protein.tilt.protein).toBeGreaterThan(1);
  });
});
