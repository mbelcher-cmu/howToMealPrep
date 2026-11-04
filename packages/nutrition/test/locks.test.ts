import { describe, expect, it } from "vitest";
import fc from "fast-check";
import {
  customOverflow, defaultOccasions, editCaloriesWithLocks, editMacroWithLocks, kcalFromMacros, splitTargets, targetsFromSplit,
  type MacroKey,
} from "../src";

const macro = fc.constantFrom<MacroKey>("protein", "carbs", "fat");
const targets = fc.integer({ min: 1200, max: 4500 }).map((k) => targetsFromSplit(k, { protein: 0.3, carbs: 0.4, fat: 0.3 }));

describe("editMacroWithLocks", () => {
  it("keeps calories and locked macros, and moves only unlocked ones", () => {
    fc.assert(fc.property(targets, macro, fc.integer({ min: 0, max: 400 }), fc.subarray<MacroKey>(["protein", "carbs", "fat"]), (t, m, g, locks) => {
      const locked = locks.filter((k) => k !== m);
      const r = editMacroWithLocks(t, m, g, locked);
      for (const k of locked) expect(r.targets[k]).toBe(t[k]);
      expect(r.targets.kcal).toBe(kcalFromMacros(r.targets));
      if (r.kcalChanged) { expect(r.targets[m]).toBe(g); return; }
      // integer grams: within one gram of fat either way
      expect(Math.abs(r.targets.kcal - t.kcal)).toBeLessThanOrEqual(9);
      if (!r.clamped) expect(r.targets[m]).toBe(g);
    }));
  });
  it("with protein locked, raising carbs takes from fat", () => {
    const t = targetsFromSplit(2000, { protein: 0.3, carbs: 0.4, fat: 0.3 });
    const r = editMacroWithLocks(t, "carbs", t.carbs + 45, ["protein"]);
    expect(r.targets.protein).toBe(t.protein);
    expect(r.targets.fat).toBe(t.fat - 20);
  });
  it("with nothing locked, the change is shared by the other two", () => {
    const t = targetsFromSplit(2000, { protein: 0.3, carbs: 0.4, fat: 0.3 });
    const r = editMacroWithLocks(t, "protein", t.protein + 50, []);
    expect(r.targets.carbs).toBeLessThan(t.carbs);
    expect(r.targets.fat).toBeLessThan(t.fat);
  });
  it("with both others locked, calories follow the edit", () => {
    const t = targetsFromSplit(2000, { protein: 0.3, carbs: 0.4, fat: 0.3 });
    const r = editMacroWithLocks(t, "fat", t.fat + 10, ["protein", "carbs"]);
    expect(r.kcalChanged).toBe(true);
    expect(r.targets.kcal).toBe(t.kcal + 90);
  });
});

describe("editCaloriesWithLocks", () => {
  it("holds locked macros and lands on the new calories", () => {
    fc.assert(fc.property(targets, fc.integer({ min: 1200, max: 5000 }), fc.subarray<MacroKey>(["protein", "carbs", "fat"], { maxLength: 2 }), (t, k, locked) => {
      const r = editCaloriesWithLocks(t, k, locked);
      for (const m of locked) expect(r.targets[m]).toBe(t[m]);
      if (!r.clamped) expect(Math.abs(r.targets.kcal - k)).toBeLessThanOrEqual(9);
    }));
  });
});

describe("per-meal macros", () => {
  it("custom meals keep their grams and the rest share what's left", () => {
    const t = targetsFromSplit(2400, { protein: 0.3, carbs: 0.4, fat: 0.3 });
    const occ = defaultOccasions(3, 1).map((o) => (o.id === "meal-1" ? { ...o, macros: { protein: 40, carbs: 30, fat: 10 } } : o));
    const parts = splitTargets(t, occ);
    expect(parts[0]).toMatchObject({ protein: 40, carbs: 30, fat: 10, kcal: 370 });
    expect(parts.reduce((a, p) => a + p.protein, 0)).toBe(t.protein);
    expect(parts.reduce((a, p) => a + p.carbs, 0)).toBe(t.carbs);
    expect(customOverflow(t, occ)).toEqual({ protein: 0, carbs: 0, fat: 0 });
  });
  it("reports overflow when custom meals ask for more than the day", () => {
    const t = targetsFromSplit(1500, { protein: 0.3, carbs: 0.4, fat: 0.3 });
    const occ = defaultOccasions(2, 0).map((o) => ({ ...o, macros: { protein: 100, carbs: 50, fat: 20 } }));
    expect(customOverflow(t, occ).protein).toBe(200 - t.protein);
  });
});
