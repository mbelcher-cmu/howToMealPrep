import { describe, expect, it } from "vitest";
import { adherence } from "@prep-cart/nutrition";
import { plan } from "../src";
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
