import { describe, expect, it } from "vitest";
import { adherence } from "@prep-cart/nutrition";
import { hasOwnGoals, plan } from "../src";
import { baseRequest, highsPromise } from "./fixtures";

describe("household plans", async () => {
  const highs = await highsPromise;

  it("cooks for two people with different calories from one shared cart", () => {
    const solo = baseRequest({ budget: 200 });
    const one = plan(solo, highs);
    const req = baseRequest({ budget: 200, household: [{ id: "p2", name: "Sam", kcal: Math.round(solo.targets.kcal * 0.7) }] });
    const r = plan(req, highs);
    expect(r.status).toBe("ok");
    expect(r.household.people).toBe(2);
    expect(r.household.factor).toBeCloseTo(1.7, 1);
    // the main person's nutrition still hits their own targets
    expect(adherence(r.daily, req.targets).pass, JSON.stringify(r.daily)).toBe(true);
    // the other person gets about 70% of the prepped food
    expect(r.household.members[0]!.daily.kcal / r.daily.kcal).toBeGreaterThan(0.6);
    // cooked servings cover both people, and the cart costs more than one person's
    for (const p of r.recipes) expect(p.servings).toBeGreaterThanOrEqual(p.portion * p.meals * 1.6);
    expect(r.cost).toBeGreaterThan(one.cost);
    expect(r.cost).toBeLessThanOrEqual(200);
  });

  it("ignores members with impossible calories", () => {
    const r = plan(baseRequest({ household: [{ id: "x", name: "X", kcal: 100 }] }), highs);
    expect(r.household.people).toBe(1);
  });
});

describe("household members with their own goals", async () => {
  const highs = await highsPromise;

  it("shares recipes and sizes each person's portions to their own calories and protein", () => {
    const solo = baseRequest({ budget: 220 });
    const kcal = Math.round(solo.targets.kcal * 0.75);
    const req = baseRequest({ budget: 220, household: [{ id: "p2", name: "Sam", kcal, protein: 110 }] });
    const r = plan(req, highs);
    expect(r.status).toBe("ok");
    expect(r.household.people).toBe(2);
    expect(adherence(r.daily, req.targets).pass, JSON.stringify(r.daily)).toBe(true);
    const sam = r.household.members[0]!;
    expect(sam.target).toBeDefined();
    // within 10% of their prepped calories, protein close to their goal
    expect(Math.abs(sam.daily.kcal - sam.target!.kcal) / sam.target!.kcal).toBeLessThan(0.1);
    expect(sam.daily.protein).toBeGreaterThan(sam.target!.protein * 0.8);
    // no diet difference: every recipe is shared
    expect(sam.sharedMeals).toBe(sam.meals);
    expect(r.recipes.every((p) => p.household?.mine)).toBe(true);
    // cooked servings cover both people
    for (const p of r.recipes) {
      const theirs = p.household!.eaters.reduce((t, e) => t + e.meals * e.portion, 0);
      expect(p.servings).toBeCloseTo(p.portion * p.meals + theirs, 0);
    }
  });

  it("cooks a separate recipe for a vegetarian only where the shared ones have meat", () => {
    const req = baseRequest({ budget: 260, prefs: { ...baseRequest().prefs, proteins: { chicken: "must" } }, household: [{ id: "v", name: "Ana", kcal: 1800, diets: ["vegetarian"] }] });
    const r = plan(req, highs);
    expect(r.status).toBe("ok");
    const ana = r.household.members.find((m) => m.id === "v")!;
    expect(ana.meals).toBeGreaterThan(0);
    // everything Ana eats is vegetarian
    for (const p of r.recipes) for (const e of p.household?.eaters ?? []) if (e.id === "v") expect(p.recipe.diets).toContain("vegetarian");
    // some lunches and dinners are cooked only for Ana, and the main person's macros still hold
    expect(r.recipes.some((p) => p.household && !p.household.mine)).toBe(true);
    expect(adherence(r.daily, req.targets).pass, JSON.stringify(r.daily)).toBe(true);
    // the cart covers both and stays inside one shared budget
    expect(r.cost).toBeLessThanOrEqual(260);
  });

  it("shares a recipe that suits everyone instead of cooking twice", () => {
    const req = baseRequest({ budget: 220, household: [{ id: "v", name: "Ana", kcal: 1800, diets: ["vegetarian"] }] });
    const r = plan(req, highs);
    expect(r.status).toBe("ok");
    const ana = r.household.members[0]!;
    // most of Ana's meals come from recipes the main person eats too
    expect(ana.sharedMeals! / ana.meals!).toBeGreaterThan(0.5);
  });

  it("explains when nothing suits a member's diet", () => {
    const r = plan(baseRequest({ prefs: { ...baseRequest().prefs, maxActiveMinutes: 5 }, household: [{ id: "k", name: "Kay", kcal: 1800, diets: ["vegan", "keto"] }] }), highs);
    expect(r.status).toBe("no_recipes");
  });

  it("people with only calories still use the simple scaled model", () => {
    expect(hasOwnGoals({ id: "a", name: "A", kcal: 2000 })).toBe(false);
    expect(hasOwnGoals({ id: "a", name: "A", kcal: 2000, diets: ["omnivore"] })).toBe(false);
    expect(hasOwnGoals({ id: "a", name: "A", kcal: 2000, allergens: ["peanut"] })).toBe(true);
  });
});
