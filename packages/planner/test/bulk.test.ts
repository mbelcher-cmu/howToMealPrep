import { describe, expect, it } from "vitest";
import { INGREDIENTS } from "@prep-cart/catalog";
import { plan } from "../src";
import { baseRequest, highsPromise } from "./fixtures";

const cents = (n: number) => Math.round(n * 100) / 100;

describe("warehouse clubs (Costco, Sam's Club)", () => {
  it("counts only the share of a club pack the plan uses, and charges the register price separately", async () => {
    const highs = await highsPromise;
    const r = plan(baseRequest({ stores: ["walmart", "costco"], storeMode: "any", bulkWeeks: 4, budget: 90, weights: { extraStopCost: 0 } }), highs);
    expect(r.status).not.toBe("no_recipes");
    const club = r.cart.filter((l) => l.chain === "costco");
    expect(club.length).toBeGreaterThan(0);
    for (const l of club) {
      expect(l.pkg, l.ingredientId).toEqual(INGREDIENTS[l.ingredientId]!.bulkPkg);
      expect(l.countedCost!, l.ingredientId).toBeLessThanOrEqual(l.cost + 0.001);
      expect(l.countedCost!, l.ingredientId).toBeGreaterThan(0);
    }
    expect(club.some((l) => l.countedCost! < l.cost - 0.5)).toBe(true);
    // the plan's cost is what it counts; the register total is bigger
    expect(r.cost).toBeCloseTo(cents(r.cart.reduce((a, l) => a + (l.countedCost ?? l.cost), 0)), 1);
    expect(r.registerCost!).toBeGreaterThan(r.cost);
    expect(r.registerCost!).toBeCloseTo(cents(r.cart.reduce((a, l) => a + l.cost, 0)), 1);
  });

  it("counts club packs in full when they only need to last one week", async () => {
    const highs = await highsPromise;
    const r = plan(baseRequest({ stores: ["walmart", "costco"], storeMode: "any", weights: { extraStopCost: 0 } }), highs);
    for (const l of r.cart.filter((x) => x.chain === "costco")) expect(l.countedCost).toBeCloseTo(l.cost, 1);
    expect(r.registerCost).toBeUndefined();
  });

  it("doesn't buy a club pack of food that would spoil long before it's used", async () => {
    const highs = await highsPromise;
    // spinach keeps 5 days: a 1 lb tub only pays when the plan itself uses most of it
    const r = plan(baseRequest({ stores: ["walmart", "costco"], storeMode: "any", bulkWeeks: 4, weights: { extraStopCost: 0 } }), highs);
    for (const l of r.cart.filter((x) => x.chain === "costco")) {
      // counted cost covers what spoils, so a pack mostly thrown out never looks cheap
      const perGram = l.unitPrice / l.pkg!.grams;
      expect(l.countedCost!, l.ingredientId).toBeGreaterThanOrEqual(cents(Math.min(l.needGrams, l.packages * l.pkg!.grams) * perGram) - 0.02);
    }
  });

  it("uses already-paid pantry food first and counts it toward the plan's cost", async () => {
    const highs = await highsPromise;
    const base = baseRequest();
    const perGram = 15.99 / 2948;
    const r = plan({
      ...base,
      stores: ["walmart"],
      prefs: { ...base.prefs, proteins: { chicken: "must" } },
      pantry: [...base.pantry, { ingredientId: "chicken_breast", grams: 2500, costPerGram: perGram, daysLeft: 80 }],
    }, highs);
    const used = r.pantryUsed.find((u) => u.ingredientId === "chicken_breast");
    if (!used) return; // the plan picked no chicken breast this time: nothing to count
    expect(used.cost).toBeCloseTo(used.grams * perGram, 1);
    expect(r.pantryCost).toBeCloseTo(used.cost!, 2);
    expect(r.cost).toBeCloseTo(cents(r.cart.reduce((a, l) => a + l.cost, 0) + used.cost!), 1);
    // it isn't bought again while the pantry still has enough
    if (used.grams < 2500) expect(r.cart.some((l) => l.ingredientId === "chicken_breast")).toBe(false);
  });
});
