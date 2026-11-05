import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { editTargets, kcalFromMacros, targetsFromSplit, type MacroKey } from "../src";

const field = fc.constantFrom<MacroKey | "kcal">("kcal", "protein", "carbs", "fat");
const targets = fc.integer({ min: 1200, max: 4500 }).map((k) => targetsFromSplit(k, { protein: 0.3, carbs: 0.4, fat: 0.3 }));
const locks = fc.record({ kcal: fc.boolean(), macros: fc.subarray<MacroKey>(["protein", "carbs", "fat"]) });
const base = targetsFromSplit(2000, { protein: 0.3, carbs: 0.4, fat: 0.3 });

describe("editTargets", () => {
  it("never moves a locked value except the one being typed into, and calories always match 4/4/9", () => {
    fc.assert(fc.property(targets, field, fc.integer({ min: 0, max: 4000 }), locks, (t, f, v, l) => {
      const r = editTargets(t, f, f === "kcal" ? v : Math.min(v, 400), l);
      expect(r.targets.kcal).toBe(kcalFromMacros(r.targets));
      for (const k of l.macros) if (k !== f) expect(r.targets[k]).toBe(t[k]);
      // locked calories stay within one gram of fat when a macro is edited
      if (l.kcal && f !== "kcal") expect(Math.abs(r.targets.kcal - t.kcal)).toBeLessThanOrEqual(9);
      if (r.blocked) expect(r.targets).toEqual(t);
    }));
  });
  it("calories locked: raising protein takes from the unlocked carbs and fat", () => {
    const r = editTargets(base, "protein", base.protein + 40, { kcal: true, macros: [] });
    expect(r.targets.protein).toBe(base.protein + 40);
    expect(r.targets.carbs).toBeLessThan(base.carbs);
    expect(r.targets.fat).toBeLessThan(base.fat);
  });
  it("calories and fat locked: raising carbs takes only from protein", () => {
    const r = editTargets(base, "carbs", base.carbs + 20, { kcal: true, macros: ["fat"] });
    expect(r.targets.fat).toBe(base.fat);
    expect(r.targets.protein).toBe(base.protein - 20);
    expect(r.targets.kcal).toBe(base.kcal);
  });
  it("calories and both other macros locked: the edit is refused instead of moving calories", () => {
    const r = editTargets(base, "fat", base.fat + 10, { kcal: true, macros: ["protein", "carbs"] });
    expect(r.blocked).toBe("noRoom");
    expect(r.targets).toEqual(base);
  });
  it("calories unlocked: a macro edit moves only that macro and calories follow", () => {
    const r = editTargets(base, "fat", base.fat + 10, { kcal: false, macros: [] });
    expect(r.targets.protein).toBe(base.protein);
    expect(r.targets.carbs).toBe(base.carbs);
    expect(r.targets.kcal).toBe(base.kcal + 90);
  });
  it("changing calories holds locked protein and scales carbs and fat", () => {
    const r = editTargets(base, "kcal", 2400, { kcal: true, macros: ["protein"] });
    expect(r.targets.protein).toBe(base.protein);
    expect(Math.abs(r.targets.kcal - 2400)).toBeLessThanOrEqual(9);
  });
  it("changing calories with every macro locked is refused", () => {
    expect(editTargets(base, "kcal", 2400, { kcal: false, macros: ["protein", "carbs", "fat"] }).blocked).toBe("noRoom");
  });
});
