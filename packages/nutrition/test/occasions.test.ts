import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { adherence, customOverflow, defaultOccasions, kcalFromMacros, MAX_MEALS, MAX_SNACKS, preppedShare, splitTargets, targetsFromSplit, SPLIT_PRESETS, cmToFeetInches, feetInchesToCm, kgToLb, lbToKg } from "../src";

describe("eating occasions", () => {
  it("rejects impossible meal and snack counts", () => {
    expect(() => defaultOccasions(0, 1)).toThrow(RangeError);
    expect(() => defaultOccasions(MAX_MEALS + 1, 0)).toThrow(RangeError);
    expect(() => defaultOccasions(3, -1)).toThrow(RangeError);
    expect(() => defaultOccasions(3, MAX_SNACKS + 1)).toThrow(RangeError);
    expect(() => defaultOccasions(2.5, 0)).toThrow(RangeError);
  });

  it("names meals the way people say them", () => {
    expect(defaultOccasions(1, 0).map((o) => o.name)).toEqual(["Main meal"]);
    expect(defaultOccasions(2, 1).map((o) => o.name)).toEqual(["Lunch", "Dinner", "Snack"]);
    expect(defaultOccasions(3, 2).map((o) => o.name)).toEqual(["Breakfast", "Lunch", "Dinner", "Snack 1", "Snack 2"]);
    expect(defaultOccasions(5, 0).at(-1)!.name).toBe("Meal 5");
  });

  it("splits any day so every macro adds up exactly and each part's calories match its grams", () => {
    fc.assert(fc.property(
      fc.integer({ min: 1200, max: 5000 }), fc.integer({ min: 1, max: MAX_MEALS }), fc.integer({ min: 0, max: MAX_SNACKS }),
      fc.constantFrom(...Object.values(SPLIT_PRESETS).map((p) => p.split)),
      (kcal, meals, snacks, split) => {
        const t = targetsFromSplit(kcal, split);
        const parts = splitTargets(t, defaultOccasions(meals, snacks));
        expect(parts).toHaveLength(meals + snacks);
        for (const k of ["protein", "carbs", "fat"] as const) expect(parts.reduce((a, p) => a + p[k], 0)).toBe(t[k]);
        for (const p of parts) { expect(p.kcal).toBe(kcalFromMacros(p)); expect(Math.min(p.protein, p.carbs, p.fat)).toBeGreaterThanOrEqual(0); }
        expect(parts.reduce((a, p) => a + p.kcal, 0)).toBe(t.kcal);
      },
    ), { numRuns: 200 });
  });

  it("keeps a meal's own macros and shares the rest of the day", () => {
    const t = targetsFromSplit(2400, SPLIT_PRESETS.highProtein.split);
    const occ = defaultOccasions(3, 0).map((o) => (o.id === "meal-1" ? { ...o, macros: { protein: 40, carbs: 50, fat: 15 } } : o));
    const [b, l, d] = splitTargets(t, occ);
    expect(b).toMatchObject({ protein: 40, carbs: 50, fat: 15 });
    expect(l!.protein + d!.protein).toBe(t.protein - 40);
    expect(customOverflow(t, occ)).toEqual({ protein: 0, carbs: 0, fat: 0 });
    const greedy = occ.map((o) => (o.id === "meal-1" ? { ...o, macros: { protein: t.protein + 10, carbs: 0, fat: 0 } } : o));
    expect(customOverflow(t, greedy).protein).toBe(10);
  });

  it("leaves a calorie allowance for meals that aren't prepped", () => {
    const t = targetsFromSplit(2000, SPLIT_PRESETS.balanced.split);
    const occ = defaultOccasions(3, 1).map((o) => (o.id === "meal-3" ? { ...o, prepped: false } : o));
    const { prepped, allowanceKcal } = preppedShare(t, occ);
    expect(prepped.map((p) => p.occasionId)).not.toContain("meal-3");
    expect(prepped.reduce((a, p) => a + p.kcal, 0) + allowanceKcal).toBe(t.kcal);
    expect(allowanceKcal).toBeGreaterThan(400);
  });
});

describe("adherence edge cases", () => {
  const t = targetsFromSplit(2000, SPLIT_PRESETS.balanced.split);
  it("passes a day that is exactly on target and fails one 10% over", () => {
    expect(adherence({ ...t }, t).pass).toBe(true);
    expect(adherence({ ...t, kcal: t.kcal * 1.1 }, t).kcal.ok).toBe(false);
  });
  it("forgives extra protein but not a big shortfall", () => {
    expect(adherence({ ...t, protein: t.protein + 40 }, t).protein.ok).toBe(true);
    expect(adherence({ ...t, protein: t.protein - 11 }, t).protein.ok).toBe(false);
  });
  it("treats a zero-carb target as 'under 20 g'", () => {
    const keto = { ...t, carbs: 0 };
    expect(adherence({ ...keto, carbs: 15 }, keto).carbs.ok).toBe(true);
    expect(adherence({ ...keto, carbs: 25 }, keto).carbs.ok).toBe(false);
  });
});

describe("units", () => {
  it("round-trips pounds and kilograms", () => {
    fc.assert(fc.property(fc.double({ min: 30, max: 300, noNaN: true }), (kg) => { expect(lbToKg(kgToLb(kg))).toBeCloseTo(kg, 9); }));
  });
  it("round-trips feet and inches through centimeters", () => {
    fc.assert(fc.property(fc.integer({ min: 4, max: 7 }), fc.integer({ min: 0, max: 11 }), (feet, inches) => {
      expect(cmToFeetInches(feetInchesToCm(feet, inches))).toEqual({ feet, inches });
    }));
  });
});
