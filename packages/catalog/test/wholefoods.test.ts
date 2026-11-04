import { describe, expect, it } from "vitest";
import { PROCESSED, RECIPES } from "../src";

describe("whole foods", () => {
  const count = (m: string) => RECIPES.filter((r) => r.mealType === m && r.diets.includes("wholeFoods")).length;
  it("never tags a recipe with a processed ingredient", () => {
    for (const r of RECIPES) if (r.diets.includes("wholeFoods")) expect(r.lines.some((l) => PROCESSED.has(l.ingredientId))).toBe(false);
  });
  it("leaves enough recipes of every meal type to plan a week", () => {
    console.log("whole-foods recipes", { breakfast: count("breakfast"), main: count("main"), snack: count("snack") });
    expect(count("breakfast")).toBeGreaterThanOrEqual(4);
    expect(count("main")).toBeGreaterThanOrEqual(20);
    expect(count("snack")).toBeGreaterThanOrEqual(4);
  });
});
