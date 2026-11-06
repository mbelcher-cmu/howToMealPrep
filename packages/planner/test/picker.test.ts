import { describe, expect, it } from "vitest";
import { PREP_PACKS, RECIPES, RECIPES_BY_ID } from "@prep-cart/catalog";
import { defaultOccasions, targetsFromSplit, SPLIT_PRESETS } from "@prep-cart/nutrition";
import { bestPortion, nextTarget, pickedDay, pickerGoals, pickerRows, surprisePick, type PickerInput } from "../src";
import { baseRequest } from "./fixtures";

const targets = targetsFromSplit(2400, SPLIT_PRESETS.highProtein.split);
const occasions = defaultOccasions(3, 1);
const goals = pickerGoals(targets, occasions, { breakfast: 1, main: 2, snack: 1 });
const input = (over: Partial<PickerInput> = {}): PickerInput => ({
  goals, picks: {}, slot: "breakfast", prefs: baseRequest().prefs, ratings: {}, rankings: {}, affinity: {}, stats: [],
  featured: PREP_PACKS.flatMap((p) => [p.breakfast, ...p.mains, p.snack]), ...over,
});

describe("meal picker", () => {
  it("has a goal for breakfast, lunch and dinner, and snacks that adds up to the prepped day", () => {
    expect(goals.map((g) => g.slot)).toEqual(["breakfast", "main", "snack"]);
    const main = goals.find((g) => g.slot === "main")!;
    expect(main.perDay).toBe(2);
    expect(main.picks).toBe(2);
    const kcal = goals.reduce((t, g) => t + g.perDay * g.perMeal.kcal, 0);
    expect(kcal).toBeGreaterThan(2000);
    expect(kcal).toBeLessThanOrEqual(2400 + 1);
  });

  it("scales a recipe's portion toward the meal's calories", () => {
    const r = RECIPES.find((x) => x.mealType === "main")!;
    const small = bestPortion(r, { kcal: r.perServing.kcal * 0.75, protein: r.perServing.protein * 0.75, carbs: r.perServing.carbs * 0.75, fat: r.perServing.fat * 0.75 });
    expect(small.portion).toBe(0.75);
    expect(small.fit).toBeGreaterThan(0.95);
    const big = bestPortion(r, { kcal: r.perServing.kcal * 9, protein: 1, carbs: 1, fat: 1 });
    expect(big.portion).toBeLessThanOrEqual(2.5);
  });

  it("aims the next meal at what the earlier picks left over", () => {
    const main = goals.find((g) => g.slot === "main")!;
    const before = nextTarget(goals, {}, "main", RECIPES_BY_ID);
    expect(before.protein).toBeCloseTo(main.perMeal.protein, 5);
    // a low-protein breakfast leaves more protein for lunch and dinner
    const breakfasts = RECIPES.filter((r) => r.mealType === "breakfast");
    const lowP = [...breakfasts].sort((a, b) => a.perServing.protein / a.perServing.kcal - b.perServing.protein / b.perServing.kcal)[0]!;
    const after = nextTarget(goals, { breakfast: [lowP.id] }, "main", RECIPES_BY_ID);
    expect(after.protein).toBeGreaterThan(before.protein);
    // and the second main makes up for the first
    const mains = RECIPES.filter((r) => r.mealType === "main");
    const fatty = [...mains].sort((a, b) => b.perServing.fat / b.perServing.kcal - a.perServing.fat / a.perServing.kcal)[0]!;
    const second = nextTarget(goals, { main: [fatty.id] }, "main", RECIPES_BY_ID);
    expect(second.fat).toBeLessThan(before.fat);
  });

  it("builds the rows: favorites first-class, recommendations without repeats, featured preps until the community grows", () => {
    const favs = RECIPES.filter((r) => r.mealType === "breakfast").slice(0, 2).map((r) => r.id);
    const rows = pickerRows(input({ ratings: { [favs[0]!]: 5 }, rankings: { [favs[1]!]: 1 } }));
    expect(rows.favorites.map((c) => c.id).sort()).toEqual([...favs].sort());
    expect(rows.recommended.some((c) => favs.includes(c.id))).toBe(false);
    expect(rows.recommended.length).toBeGreaterThan(3);
    expect(rows.communitySource).toBe("featured");
    expect(rows.community.every((c) => RECIPES_BY_ID[c.id]!.mealType === "breakfast")).toBe(true);
    for (const c of rows.recommended) expect(c.portion.portion).toBeGreaterThanOrEqual(0.5);
  });

  it("uses real community ratings once there are enough, and never shows a picked recipe again", () => {
    const mains = RECIPES.filter((r) => r.mealType === "main").slice(0, 5);
    const stats = mains.map((r) => ({ id: r.id, avg: 4.6, n: 30 }));
    const rows = pickerRows(input({ slot: "main", stats, picks: { main: [mains[0]!.id] } }));
    expect(rows.communitySource).toBe("ratings");
    expect(rows.community.map((c) => c.id)).not.toContain(mains[0]!.id);
    expect(rows.community.length).toBe(4);
  });

  it("surprises with something that fits and isn't disliked", () => {
    let seed = 1;
    const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 10; i++) {
      const s = surprisePick(input({ slot: "snack" }), rand)!;
      expect(RECIPES_BY_ID[s.id]!.mealType).toBe("snack");
      expect(s.portion.fit).toBeGreaterThanOrEqual(0.35);
    }
  });

  it("reports the picked day against the target", () => {
    const rows = pickerRows(input());
    const b = rows.recommended[0]!.id;
    const day = pickedDay(goals, { breakfast: [b] }, RECIPES_BY_ID);
    expect(day.got.kcal).toBeGreaterThan(0);
    expect(day.want.kcal).toBeGreaterThan(day.got.kcal);
  });
});
