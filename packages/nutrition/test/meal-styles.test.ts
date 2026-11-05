import { describe, expect, it } from "vitest";
import fc from "fast-check";
import {
  defaultOccasions, editMealCalories, editMealMacro, kcalFromMacros, MAX_MEALS, MAX_SNACKS, MEAL_STYLES, splitTargets, SPLIT_PRESETS, targetsFromSplit,
  type MacroKey, type MealStyle,
} from "../src";

const styles = Object.keys(MEAL_STYLES) as MealStyle[];

describe("meal styles", () => {
  it("never changes the day: every macro still adds up exactly, at 4/4/9", () => {
    fc.assert(fc.property(
      fc.integer({ min: 1200, max: 5000 }), fc.integer({ min: 1, max: MAX_MEALS }), fc.integer({ min: 0, max: MAX_SNACKS }),
      fc.constantFrom(...Object.values(SPLIT_PRESETS).map((p) => p.split)),
      fc.array(fc.constantFrom(...styles), { minLength: MAX_MEALS + MAX_SNACKS, maxLength: MAX_MEALS + MAX_SNACKS }),
      (kcal, meals, snacks, split, picks) => {
        const t = targetsFromSplit(kcal, split);
        const occ = defaultOccasions(meals, snacks).map((o, i) => ({ ...o, style: picks[i]! }));
        const parts = splitTargets(t, occ);
        for (const k of ["protein", "carbs", "fat"] as const) expect(parts.reduce((a, p) => a + p[k], 0)).toBe(t[k]);
        for (const p of parts) { expect(p.kcal).toBe(kcalFromMacros(p)); expect(Math.min(p.protein, p.carbs, p.fat)).toBeGreaterThanOrEqual(0); }
        expect(parts.reduce((a, p) => a + p.kcal, 0)).toBe(t.kcal);
      },
    ), { numRuns: 200 });
  });

  it("all balanced gives the same split as no styles at all", () => {
    const t = targetsFromSplit(2300, SPLIT_PRESETS.highProtein.split);
    const plain = defaultOccasions(3, 2);
    expect(splitTargets(t, plain.map((o) => ({ ...o, style: "balanced" as const })))).toEqual(splitTargets(t, plain));
  });

  it("a high-protein breakfast gets more protein and its calories stay about the same; lunch and dinner give protein back", () => {
    const t = targetsFromSplit(2400, SPLIT_PRESETS.balanced.split);
    const plain = splitTargets(t, defaultOccasions(3, 0));
    const occ = defaultOccasions(3, 0).map((o) => (o.id === "meal-1" ? { ...o, style: "protein" as const } : o));
    const styled = splitTargets(t, occ);
    expect(styled[0]!.protein).toBeGreaterThan(plain[0]!.protein * 1.3);
    expect(Math.abs(styled[0]!.kcal - plain[0]!.kcal)).toBeLessThanOrEqual(12);
    expect(styled[1]!.protein).toBeLessThan(plain[1]!.protein);
    expect(styled[2]!.carbs).toBeGreaterThan(plain[2]!.carbs);
  });

  it("a lighter dinner has about a quarter fewer calories and the other meals absorb them", () => {
    const t = targetsFromSplit(2400, SPLIT_PRESETS.balanced.split);
    const plain = splitTargets(t, defaultOccasions(3, 0));
    const styled = splitTargets(t, defaultOccasions(3, 0).map((o) => (o.id === "meal-3" ? { ...o, style: "light" as const } : o)));
    const ratio = styled[2]!.kcal / plain[2]!.kcal;
    expect(ratio).toBeGreaterThan(0.75);
    expect(ratio).toBeLessThan(0.85); // the day's total is fixed, so the others grow to make room
    expect(styled[0]!.kcal).toBeGreaterThan(plain[0]!.kcal);
  });

  it("a low-carb lunch moves carbs to the other meals", () => {
    const t = targetsFromSplit(2000, SPLIT_PRESETS.balanced.split);
    const plain = splitTargets(t, defaultOccasions(3, 1));
    const styled = splitTargets(t, defaultOccasions(3, 1).map((o) => (o.id === "meal-2" ? { ...o, style: "lowCarb" as const } : o)));
    expect(styled[1]!.carbs).toBeLessThan(plain[1]!.carbs * 0.6);
    expect(styled[0]!.carbs).toBeGreaterThan(plain[0]!.carbs);
  });

  it("custom grams win over a style and the styled meals share the rest", () => {
    const t = targetsFromSplit(2400, SPLIT_PRESETS.highProtein.split);
    const occ = defaultOccasions(3, 0).map((o) =>
      o.id === "meal-1" ? { ...o, style: "light" as const, macros: { protein: 40, carbs: 40, fat: 10 } } : o.id === "meal-3" ? { ...o, style: "hearty" as const } : o);
    const [b, l, d] = splitTargets(t, occ);
    expect(b).toMatchObject({ protein: 40, carbs: 40, fat: 10 });
    expect(l!.protein + d!.protein).toBe(t.protein - 40);
    expect(d!.kcal).toBeGreaterThan(l!.kcal);
  });

  it("ignores a style name it doesn't know (old or damaged saves)", () => {
    const t = targetsFromSplit(2000, SPLIT_PRESETS.balanced.split);
    const occ = defaultOccasions(2, 0).map((o) => ({ ...o, style: "mystery" as unknown as MealStyle }));
    expect(splitTargets(t, occ)).toEqual(splitTargets(t, defaultOccasions(2, 0)));
  });
});

describe("editing one meal's macros", () => {
  const part = { protein: 40, carbs: 70, fat: 20 };
  const macro = fc.constantFrom<MacroKey>("protein", "carbs", "fat");
  it("keeps the meal's calories (within a gram of rounding)", () => {
    fc.assert(fc.property(macro, fc.integer({ min: 0, max: 150 }), (m, g) => {
      const r = editMealMacro(part, m, g);
      expect(Math.abs(kcalFromMacros(r.macros) - kcalFromMacros(part))).toBeLessThanOrEqual(9);
      if (!r.clamped) expect(r.macros[m]).toBe(g);
    }));
  });
  it("holds protein when carbs or fat change", () => {
    expect(editMealMacro(part, "carbs", 50).macros).toEqual({ protein: 40, carbs: 50, fat: 29 });
    expect(editMealMacro(part, "fat", 11).macros.protein).toBe(40);
  });
  it("moves carbs and fat together when protein changes", () => {
    const r = editMealMacro(part, "protein", 60).macros;
    expect(r.protein).toBe(60);
    expect(r.carbs).toBeLessThan(70);
    expect(r.fat).toBeLessThan(20);
  });
  it("clamps protein that would need more calories than the meal has", () => {
    const r = editMealMacro(part, "protein", 400);
    expect(r.clamped).toBe(true);
    expect(r.macros.protein * 4).toBeLessThanOrEqual(kcalFromMacros(part));
  });
  it("changing calories keeps protein and scales carbs and fat", () => {
    const r = editMealCalories(part, 800).macros;
    expect(r.protein).toBe(40);
    expect(Math.abs(kcalFromMacros(r) - 800)).toBeLessThanOrEqual(9);
    expect(editMealCalories(part, 100).clamped).toBe(true);
  });
});
