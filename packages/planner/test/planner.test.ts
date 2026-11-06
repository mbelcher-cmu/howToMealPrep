import { describe, expect, it } from "vitest";
import { adherence, targetsFromSplit, SPLIT_PRESETS } from "@prep-cart/nutrition";
import { RECIPES } from "@prep-cart/catalog";
import { hardRejection, plan, schedule } from "../src";
import { baseRequest, highsPromise } from "./fixtures";

describe("planner", async () => {
  const highs = await highsPromise;

  it("hits targets within tolerance under budget at one store", () => {
    const req = baseRequest();
    const r = plan(req, highs);
    expect(r.status).toBe("ok");
    expect(r.cost).toBeLessThanOrEqual(75);
    expect(r.stores).toHaveLength(1);
    const a = adherence(r.daily, req.targets);
    expect(a.pass, JSON.stringify({ daily: r.daily, t: req.targets })).toBe(true);
    expect(r.recipes.filter((p) => p.slot === "main")).toHaveLength(2);
    expect(r.recipes.reduce((s, p) => s + p.meals, 0)).toBe(35);
    expect(r.solveMs).toBeLessThan(5000);
  });

  it("respects vegetarian and allergen rules", () => {
    const r = plan(baseRequest({ prefs: { ...baseRequest().prefs, diets: ["vegetarian"], allergens: ["peanut"] } }), highs);
    expect(r.recipes.length).toBeGreaterThan(0);
    for (const p of r.recipes) {
      expect(p.recipe.diets).toContain("vegetarian");
      expect(p.recipe.allergens).not.toContain("peanut");
    }
  });

  it("follows a must-have cuisine", () => {
    const r = plan(baseRequest({ prefs: { ...baseRequest().prefs, cuisines: { korean: "must", thai: "must" } } }), highs);
    const mains = r.recipes.filter((p) => p.slot === "main");
    expect(mains.every((p) => p.recipe.cuisines.some((c) => c === "korean" || c === "thai"))).toBe(true);
  });

  it("supports many meals and no breakfast", () => {
    const occ = [
      { id: "m1", kind: "meal" as const, name: "Meal 1", weight: 0.25, prepped: true },
      { id: "m2", kind: "meal" as const, name: "Meal 2", weight: 0.25, prepped: true },
      { id: "m3", kind: "meal" as const, name: "Meal 3", weight: 0.25, prepped: true },
      { id: "m4", kind: "meal" as const, name: "Meal 4", weight: 0.25, prepped: false },
    ];
    const req = baseRequest({ occasions: occ, variety: { breakfast: 1, main: 3, snack: 1 } });
    const r = plan(req, highs);
    expect(r.allowanceKcal).toBeGreaterThan(400);
    expect(r.recipes.every((p) => p.slot === "main")).toBe(true);
    expect(r.recipes.reduce((s, p) => s + p.meals, 0)).toBe(21);
  });

  it("explains when nothing fits", () => {
    const r = plan(baseRequest({ prefs: { ...baseRequest().prefs, diets: ["vegan", "keto"] } }), highs);
    expect(r.status).toBe("no_recipes");
    expect(r.message).toMatch(/recipes fit your rules/);
  });

  it("reports when the budget is too small", () => {
    const r = plan(baseRequest({ budget: 25 }), highs);
    expect(r.status).toBe("over_budget");
    expect(r.message).toMatch(/more than your budget/);
  });

  it("finds a different plan when asked", () => {
    const first = plan(baseRequest(), highs);
    const ids = first.recipes.map((p) => p.recipe.id);
    const second = plan(baseRequest({ avoidSets: [ids] }), highs);
    expect(second.recipes.map((p) => p.recipe.id).sort()).not.toEqual([...ids].sort());
  });

  it("keeps locked recipes", () => {
    const r = plan(baseRequest({ lockedRecipes: ["jerk_chicken"] }), highs);
    expect(r.recipes.map((p) => p.recipe.id)).toContain("jerk_chicken");
  });

  it("a swap changes only the swapped recipe when the rest of the week still fits", () => {
    let checked = 0;
    for (const kcal of [1800, 2200, 2500, 2800]) {
      const req = baseRequest({ targets: targetsFromSplit(kcal, SPLIT_PRESETS.highProtein.split) });
      const before = plan(req, highs).recipes;
      for (const out of before) {
        const to = RECIPES.find((x) => x.mealType === out.slot && !before.some((p) => p.recipe.id === x.id) && !hardRejection(x, req.prefs));
        if (!to) continue;
        const rest = before.filter((p) => p !== out).map((p) => p.recipe.id);
        const swapReq = { ...req, prefs: { ...req.prefs, excludeRecipes: [out.recipe.id] }, lockedRecipes: [to.id] };
        // if the old week plus the new recipe breaks the budget, the planner may change more: that's fine
        const kept = plan({ ...swapReq, lockedRecipes: [to.id, ...rest] }, highs);
        if (kept.status !== "ok") continue;
        // same for a real macro miss (over 12% off a target), which may move one more recipe
        if ((["protein", "carbs", "fat"] as const).some((k) => Math.abs(kept.daily[k] - req.targets[k]) > 0.12 * req.targets[k])) continue;
        checked++;
        const after = plan({ ...swapReq, preferRecipes: rest }, highs);
        expect(after.recipes.map((p) => p.recipe.id).sort()).toEqual([...rest, to.id].sort());
      }
    }
    expect(checked).toBeGreaterThan(4);
  });

  it("buys whole packages that cover what the plan uses", () => {
    const r = plan(baseRequest(), highs);
    for (const l of r.cart) expect(l.leftoverGrams).toBeGreaterThanOrEqual(0);
    expect(Math.abs(r.cart.reduce((s, l) => s + l.cost, 0) - r.cost)).toBeLessThan(0.02);
  });

  it("schedules every meal and adds a second cook day for short-lived food", () => {
    const req = baseRequest({ lockedRecipes: ["shrimp_fried_rice"] });
    const r = plan(req, highs);
    const s = schedule(r, req.occasions, req.days);
    const scheduled = s.days.reduce((n, d) => n + d.meals.length, 0);
    expect(scheduled).toBe(35);
    // shrimp fried rice keeps 3 days, so days 4+ come from a second session
    const late = s.days.filter((d) => d.day >= 3).flatMap((d) => d.meals).filter((m) => m.recipeId === "shrimp_fried_rice");
    if (late.length) expect(s.sessions).toHaveLength(2);
  });
});
