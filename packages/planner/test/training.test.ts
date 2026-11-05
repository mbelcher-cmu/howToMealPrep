import { describe, expect, it } from "vitest";
import { dayPortionScales, targetsFromSplit, trainingDayTargets } from "@prep-cart/nutrition";
import { plan, schedule, scalePortions } from "../src";
import { baseRequest, highsPromise } from "./fixtures";

describe("training day portions", async () => {
  const highs = await highsPromise;

  it("are bigger on training days and every recipe still adds up to what was cooked", () => {
    const req = baseRequest({ budget: 95 });
    const r = plan(req, highs);
    expect(r.status, r.message).toBe("ok");
    const s = schedule(r, req.occasions, 7);
    const week = [[{ type: "pt" as const, minutes: 60 }], [], [{ type: "run" as const, minutes: 60 }], [{ type: "ruck" as const, minutes: 120 }], [], [], []];
    const tp = trainingDayTargets(targetsFromSplit(req.targets.kcal, { protein: 0.3, carbs: 0.4, fat: 0.3 }), week, { weightKg: 80 });
    const scales = dayPortionScales(tp, 0, 7);
    const out = scalePortions(s, scales);
    const total = (x: typeof s, id: string) => x.days.reduce((a, d) => a + d.meals.filter((m) => m.recipeId === id).reduce((b, m) => b + m.portion, 0), 0);
    for (const p of r.recipes) expect(Math.abs(total(out, p.recipe.id) - total(s, p.recipe.id))).toBeLessThanOrEqual(0.05 * 7);
    const dayFood = (x: typeof s, d: number) => x.days[d]!.meals.reduce((a, m) => a + m.portion, 0);
    expect(dayFood(out, 3)).toBeGreaterThan(dayFood(out, 5));
    // sessions and batches are untouched
    expect(out.sessions).toEqual(s.sessions);
  });

  it("leave a plan alone when every day is the same", () => {
    const req = baseRequest({});
    const r = plan(req, highs);
    const s = schedule(r, req.occasions, 7);
    expect(scalePortions(s, [1, 1, 1, 1, 1, 1, 1])).toBe(s);
  });
});
