import { describe, expect, it } from "vitest";
import { defaultOccasions } from "@prep-cart/nutrition";
import { cookStarts, plan, schedule } from "../src";
import { baseRequest, highsPromise } from "./fixtures";

describe("cook days and fresh breakfasts", async () => {
  const highs = await highsPromise;

  it("splits a period into even cook stretches", () => {
    expect(cookStarts(7, 1)).toEqual([0]);
    expect(cookStarts(7, 2)).toEqual([0, 4]);
    expect(cookStarts(6, 2)).toEqual([0, 3]);
    expect(cookStarts(7, 3)).toEqual([0, 2, 5]);
    expect(cookStarts(2, 3)).toEqual([0, 1]);
  });

  it("cooks each stretch at its start, so nothing sits longer than one stretch", () => {
    const req = baseRequest({ cookDays: 2, variety: { breakfast: 2, main: 2, snack: 1, rotation: "blocks" }, budget: 100 });
    const r = plan(req, highs);
    expect(r.status, r.message).toBe("ok");
    const s = schedule(r, req.occasions, 7, "blocks", req.targets, { cookDays: 2 });
    expect(s.sessions.map((x) => x.beforeDay)).toEqual([0, 4]);
    for (const day of s.days) for (const m of day.meals) {
      const start = s.sessions[m.fromSession]!.beforeDay;
      expect(day.day - start).toBeLessThan(4);
    }
    // what's cooked adds up to what the plan buys for
    for (const p of r.recipes) {
      const cooked = s.sessions.flatMap((x) => x.batches).filter((b) => b.recipeId === p.recipe.id).reduce((a, b) => a + b.servings, 0);
      expect(cooked).toBeCloseTo(p.servings, 5);
    }
    // each stretch has its own lunch-and-dinner recipe
    const mains = new Set(r.recipes.filter((p) => p.slot === "main").map((p) => p.recipe.id));
    const firstHalf = new Set(s.days.slice(0, 3).flatMap((d) => d.meals.filter((m) => mains.has(m.recipeId)).map((m) => m.recipeId)));
    const secondHalf = new Set(s.days.slice(4).flatMap((d) => d.meals.filter((m) => mains.has(m.recipeId)).map((m) => m.recipeId)));
    expect([...firstHalf].some((id) => secondHalf.has(id))).toBe(false);
  });

  it("plans a made-fresh breakfast that is bought for but not batch-cooked", () => {
    const occasions = defaultOccasions(3, 1).map((o) => (o.name === "Breakfast" ? { ...o, fresh: true } : o));
    const req = baseRequest({ occasions, budget: 90 });
    const r = plan(req, highs);
    expect(r.status, r.message).toBe("ok");
    const bf = r.recipes.filter((p) => p.slot === "breakfast");
    expect(bf.length).toBeGreaterThan(0);
    for (const p of bf) expect(p.recipe.cookFresh).toBe(true);
    for (const p of r.recipes.filter((x) => x.slot !== "breakfast")) expect(p.recipe.cookFresh).toBe(false);
    // its groceries are on the list
    const eggsOrBread = r.cart.some((l) => bf.some((p) => p.recipe.lines.some((x) => x.ingredientId === l.ingredientId)));
    expect(eggsOrBread).toBe(true);
    const s = schedule(r, req.occasions, 7, "mix", req.targets);
    const bfMeals = s.days.flatMap((d) => d.meals.filter((m) => m.occasionName === "Breakfast"));
    expect(bfMeals).toHaveLength(7);
    for (const m of bfMeals) expect(m.fresh).toBe(true);
    for (const sess of s.sessions) for (const b of sess.batches) expect(bf.some((p) => p.recipe.id === b.recipeId)).toBe(false);
  });

  it("never puts a made-fresh recipe into a prepped breakfast", () => {
    const req = baseRequest({ budget: 90 });
    const r = plan(req, highs);
    for (const p of r.recipes) expect(p.recipe.cookFresh).toBe(false);
  });
});
