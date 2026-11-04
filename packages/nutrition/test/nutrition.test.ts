import { describe, expect, it } from "vitest";
import fc from "fast-check";
import {
  adherence, defaultOccasions, editCalories, editMacroFree, editMacroKeepingCalories, kcalFromMacros,
  lbToKg, feetInchesToCm, cmToFeetInches, maintenanceKcal, preppedShare, restingKcal, splitTargets,
  suggestTargets, targetsFromSplit, SPLIT_PRESETS, type Targets, type MacroKey,
} from "../src";

const consistent = (t: Targets) => t.kcal === 4 * t.protein + 4 * t.carbs + 9 * t.fat;

describe("energy needs", () => {
  it("matches the Mifflin-St Jeor equation", () => {
    // 30-year-old man, 180 cm, 80 kg: 10*80 + 6.25*180 - 5*30 + 5 = 1780
    expect(restingKcal({ sex: "male", ageYears: 30, heightCm: 180, weightKg: 80 })).toBe(1780);
    // 30-year-old woman, 165 cm, 60 kg: 600 + 1031.25 - 150 - 161 = 1320.25
    expect(restingKcal({ sex: "female", ageYears: 30, heightCm: 165, weightKg: 60 })).toBeCloseTo(1320.25);
    expect(maintenanceKcal({ sex: "male", ageYears: 30, heightCm: 180, weightKg: 80 }, "moderate")).toBeCloseTo(2759);
  });
  it("rejects impossible stats", () => {
    expect(() => restingKcal({ sex: "male", ageYears: 8, heightCm: 180, weightKg: 80 })).toThrow(RangeError);
  });
  it("converts units", () => {
    expect(lbToKg(220.462)).toBeCloseTo(100, 2);
    expect(feetInchesToCm(5, 10)).toBeCloseTo(177.8);
    expect(cmToFeetInches(177.8)).toEqual({ feet: 5, inches: 10 });
  });
});

describe("targets", () => {
  it("suggests targets whose calories match the macros", () => {
    const s = suggestTargets({ stats: { sex: "male", ageYears: 30, heightCm: 180, weightKg: 80 }, activity: "moderate", goal: "lose" });
    expect(consistent(s.targets)).toBe(true);
    expect(Math.abs(s.targets.kcal - s.goalKcal)).toBeLessThanOrEqual(10);
    expect(s.targets.protein).toBe(Math.round(80 * 2.2046226218 * 0.9)); // 159 g
  });
  it("never goes below the calorie floor", () => {
    const s = suggestTargets({ stats: { sex: "female", ageYears: 70, heightCm: 150, weightKg: 42 }, activity: "sedentary", goal: "lose" });
    expect(s.flooredAtMinimum).toBe(true);
    expect(s.goalKcal).toBe(1200);
  });
  it("builds integer grams from a split, landing within 2 kcal", () => {
    const t = targetsFromSplit(2200, SPLIT_PRESETS.highProtein.split);
    expect(t).toMatchObject({ protein: 165, fat: 73, carbs: 221 });
    expect(consistent(t)).toBe(true);
    expect(Math.abs(t.kcal - 2200)).toBeLessThanOrEqual(2);
  });
  it("keeps calories when one macro is edited", () => {
    const t = targetsFromSplit(2200, SPLIT_PRESETS.highProtein.split);
    const r = editMacroKeepingCalories(t, "protein", 200, "carbs");
    expect(r.targets.protein).toBe(200);
    expect(r.targets.fat).toBe(t.fat);
    expect(r.targets.carbs).toBe(t.carbs - 35);
    expect(r.targets.kcal).toBe(t.kcal);
    expect(r.clamped).toBe(false);
  });
  it("clamps an edit that would push the balancer below zero", () => {
    const t = targetsFromSplit(2000, SPLIT_PRESETS.balanced.split);
    const r = editMacroKeepingCalories(t, "protein", 900, "carbs");
    expect(r.clamped).toBe(true);
    expect(r.targets.carbs).toBe(0);
    expect(consistent(r.targets)).toBe(true);
    expect(Math.abs(r.targets.kcal - t.kcal)).toBeLessThanOrEqual(4);
  });
  it("lets calories follow grams in grams mode", () => {
    const t = editMacroFree(targetsFromSplit(2000, SPLIT_PRESETS.balanced.split), "fat", 100);
    expect(consistent(t)).toBe(true);
  });
  it("holds protein when calories change", () => {
    const t = targetsFromSplit(2200, SPLIT_PRESETS.highProtein.split);
    const r = editCalories(t, 1800);
    expect(r.targets.protein).toBe(t.protein);
    expect(Math.abs(r.targets.kcal - 1800)).toBeLessThanOrEqual(5);
  });
});

describe("eating occasions", () => {
  it("builds meals and snacks with snacks at 10% each", () => {
    const occ = defaultOccasions(3, 2);
    expect(occ.map((o) => o.name)).toEqual(["Breakfast", "Lunch", "Dinner", "Snack 1", "Snack 2"]);
    expect(occ[3]!.weight).toBeCloseTo(0.1);
    expect(occ.reduce((a, o) => a + o.weight, 0)).toBeCloseTo(1);
  });
  it("names four or more meals by number", () => {
    expect(defaultOccasions(5, 0).map((o) => o.name)).toEqual(["Meal 1", "Meal 2", "Meal 3", "Meal 4", "Meal 5"]);
  });
  it("rejects out-of-range counts", () => {
    expect(() => defaultOccasions(0, 1)).toThrow();
    expect(() => defaultOccasions(3, 5)).toThrow();
  });
  it("splits targets so occasions add up exactly", () => {
    const t = targetsFromSplit(2350, SPLIT_PRESETS.highProtein.split);
    const parts = splitTargets(t, defaultOccasions(4, 3));
    expect(parts.reduce((a, p) => a + p.protein, 0)).toBe(t.protein);
    expect(parts.reduce((a, p) => a + p.carbs, 0)).toBe(t.carbs);
    expect(parts.reduce((a, p) => a + p.fat, 0)).toBe(t.fat);
    expect(parts.reduce((a, p) => a + p.kcal, 0)).toBe(t.kcal);
  });
  it("reserves an allowance for unprepped occasions", () => {
    const t = targetsFromSplit(2000, SPLIT_PRESETS.balanced.split);
    const occ = defaultOccasions(3, 1).map((o) => (o.name === "Dinner" ? { ...o, prepped: false } : o));
    const { prepped, allowanceKcal } = preppedShare(t, occ);
    expect(prepped).toHaveLength(3);
    expect(allowanceKcal + prepped.reduce((a, p) => a + p.kcal, 0)).toBe(t.kcal);
  });
});

describe("adherence", () => {
  it("passes within tolerance and fails outside it", () => {
    const t = targetsFromSplit(2200, SPLIT_PRESETS.highProtein.split);
    expect(adherence({ kcal: 2150, protein: 160, carbs: 210, fat: 72 }, t).pass).toBe(true);
    const bad = adherence({ kcal: 2400, protein: 140, carbs: 260, fat: 80 }, t);
    expect(bad.pass).toBe(false);
    expect(bad.protein.ok).toBe(false);
  });
});

describe("properties", () => {
  const split = fc.record({ protein: fc.double({ min: 0.05, max: 1, noNaN: true }), carbs: fc.double({ min: 0, max: 1, noNaN: true }), fat: fc.double({ min: 0.05, max: 1, noNaN: true }) });
  it("calories always equal 4P + 4C + 9F", () => {
    fc.assert(fc.property(fc.integer({ min: 1000, max: 6000 }), split, (k, s) => consistent(targetsFromSplit(k, s))));
  });
  it("calorie-locked edits keep calories within 4 kcal", () => {
    fc.assert(fc.property(fc.integer({ min: 1200, max: 5000 }), split, fc.integer({ min: 0, max: 600 }), fc.constantFrom<MacroKey>("protein", "carbs", "fat"), (k, s, g, m) => {
      const t = targetsFromSplit(k, s);
      const balancer: MacroKey = m === "carbs" ? "fat" : "carbs";
      const r = editMacroKeepingCalories(t, m, g, balancer);
      return consistent(r.targets) && Math.abs(r.targets.kcal - t.kcal) <= 4 && Object.values(r.targets).every((v) => v >= 0);
    }));
  });
  it("occasion splits always sum to the day", () => {
    fc.assert(fc.property(fc.integer({ min: 1200, max: 5000 }), fc.integer({ min: 1, max: 6 }), fc.integer({ min: 0, max: 4 }), (k, m, s) => {
      const t = targetsFromSplit(k, SPLIT_PRESETS.balanced.split);
      const parts = splitTargets(t, defaultOccasions(m, s));
      return parts.reduce((a, p) => a + p.kcal, 0) === t.kcal && parts.every((p) => p.kcal === kcalFromMacros(p));
    }));
  });
});
