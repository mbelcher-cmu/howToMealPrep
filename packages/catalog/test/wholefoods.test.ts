import { describe, expect, it } from "vitest";
import { INGREDIENTS, PREP_PACKS, PROCESSED, packFits, processedIn, RECIPES, RECIPES_BY_ID } from "../src";

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

  it("tags every ingredient with a processing level", () => {
    for (const i of Object.values(INGREDIENTS)) {
      expect(["whole", "simple", "processed"]).toContain(i.processing);
      expect(i.processing === "processed").toBe(PROCESSED.has(i.id));
    }
    for (const id of PROCESSED) expect(INGREDIENTS[id], id).toBeDefined();
    expect(INGREDIENTS.chicken_breast!.processing).toBe("whole");
    expect(INGREDIENTS.cheddar!.processing).toBe("simple");
    expect(INGREDIENTS.gochujang!.processing).toBe("processed");
  });
  it("keeps a Walmart price on every whole-foods ingredient", () => {
    for (const i of Object.values(INGREDIENTS)) if (i.processing !== "processed") expect(i.estPrice.walmart, i.id).not.toBeNull();
  });
  it("names the processed items in a recipe", () => {
    expect(processedIn(RECIPES_BY_ID.korean_beef_bowls!)).toContain("gochujang");
    expect(processedIn(RECIPES_BY_ID.lentil_chili!)).toEqual([]);
  });
  it("shows only the meal preps that fit a diet, and some fit whole foods", () => {
    const fits = PREP_PACKS.filter((p) => packFits(p, ["wholeFoods"]));
    console.log("whole-foods preps", fits.map((p) => p.id));
    expect(fits.length).toBeGreaterThanOrEqual(3);
    expect(packFits(PREP_PACKS.find((p) => p.id === "pittsburgh")!, ["wholeFoods"])).toBe(false);
    expect(PREP_PACKS.every((p) => packFits(p, []))).toBe(true);
  });
});
