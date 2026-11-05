import { describe, expect, it } from "vitest";
import { amountFor, buildRecipe, draftFromRecipeNode, draftLine, draftToSeed, matchIngredient, parseLine, parseRecipe, registerRecipes, RECIPES_BY_ID, seedToDraft, suggestIngredients } from "../src";

describe("recipe import", () => {
  it("matches ingredient lines and converts amounts", () => {
    expect(matchIngredient("2 boneless skinless chicken breasts")).toBe("chicken_breast");
    expect(matchIngredient("1 cup brown rice")).toBe("brown_rice");
    expect(matchIngredient("3 green onions, sliced")).toBe("green_onion");
    expect(parseLine("1 ½ lb ground turkey")).toMatchObject({ ingredientId: "ground_turkey", grams: 680, sure: true });
    expect(parseLine("2 cups cooked rice")).toMatchObject({ ingredientId: "rice", grams: 370 });
    expect(parseLine("1 (15 oz) can black beans, drained")).toMatchObject({ ingredientId: "black_beans", grams: 425, sure: true });
    expect(parseLine("2 tbsp olive oil")).toMatchObject({ ingredientId: "olive_oil", grams: 27 });
    expect(parseLine("1 tsp salt")).toBe("skip");
    expect(parseLine("1 tsp ground cumin")).toBe("skip");
    expect(parseLine("3 cloves garlic, minced")).toMatchObject({ ingredientId: "garlic", grams: 15 });
  });

  it("reads schema.org JSON-LD from a recipe page", () => {
    const html = `<html><head><script type="application/ld+json">${JSON.stringify({ "@context": "https://schema.org", "@graph": [{ "@type": "WebPage" }, {
      "@type": "Recipe", name: "Turkey Taco Rice Bowls", recipeYield: ["4", "4 servings"], prepTime: "PT15M", cookTime: "PT25M",
      recipeIngredient: ["1 lb ground turkey", "1 cup jasmine rice", "1 can black beans", "1 cup salsa", "1 tsp chili powder", "1 bunch saffron threads"],
      recipeInstructions: [{ "@type": "HowToStep", text: "Cook the rice." }, { "@type": "HowToStep", text: "Brown the turkey in a skillet." }],
    }] })}</script></head></html>`;
    const d = parseRecipe(html);
    expect(d.name).toBe("Turkey Taco Rice Bowls");
    expect(d.servings).toBe(4);
    expect(d.totalMinutes).toBe(40);
    expect(d.steps).toHaveLength(2);
    expect(d.equipment).toContain("stovetop");
    expect(d.proteins).toEqual(expect.arrayContaining(["turkey", "legumes"]));
    expect(d.lines.filter((l) => l.ingredientId).map((l) => l.ingredientId)).toEqual(["ground_turkey", "jasmine_rice", "black_beans", "salsa"]);
    expect(d.lines.some((l) => !l.ingredientId && /saffron/.test(l.raw))).toBe(true);
    expect(d.skipped).toContain("1 tsp chili powder");
  });

  it("reads pasted text and builds a usable recipe", () => {
    const text = `Greek Chicken Meal Prep\nServes 4\nPrep time: 20 min\nTotal time: 45 min\nIngredients\n1.5 lb chicken breast\n1 cup quinoa\n1 cucumber\n2 tomatoes\n1/2 cup feta\nInstructions\n1. Bake the chicken at 425°F for 20 minutes.\n2. Cook the quinoa in a pot.\n3. Chop the vegetables and portion everything.`;
    const d = parseRecipe(text);
    expect(d.name).toBe("Greek Chicken Meal Prep");
    expect(d.servings).toBe(4);
    expect(d.activeMinutes).toBe(20);
    expect(d.totalMinutes).toBe(45);
    expect(d.steps[0]).toMatch(/^Bake/);
    expect(d.equipment).toEqual(expect.arrayContaining(["oven", "stovetop"]));
    const r = buildRecipe(draftToSeed(d, "custom_greek", "greek"));
    expect(r.perServing.protein).toBeGreaterThan(40);
    registerRecipes([r]);
    expect(RECIPES_BY_ID.custom_greek?.name).toBe("Greek Chicken Meal Prep");
    registerRecipes([]);
    expect(RECIPES_BY_ID.custom_greek).toBeUndefined();
  });

  describe("v2 matching", () => {
    const v2 = { v2: true };
    it("doesn't mistake a different product for the food in its name", () => {
      expect(matchIngredient("1 tbsp rice vinegar", v2)).toBeNull();
      expect(matchIngredient("1 cup unsweetened almond milk", v2)).toBe("almond_milk");
      expect(matchIngredient("1 cup low-sodium chicken broth", v2)).toBe("chicken_broth");
      expect(matchIngredient("1 cup beef broth", v2)).toBeNull();
      expect(matchIngredient("1/2 cup shredded cheddar cheese", v2)).toBe("cheddar");
      expect(matchIngredient("1 tsp toasted sesame oil", v2)).toBe("sesame_oil");
      expect(parseLine("1 tsp garlic powder", v2)).toBe("skip");
      expect(parseLine("1 tbsp rice vinegar", v2)).toBe("skip");
    });
    it("reads amounts anywhere in the line, and slices and scoops", () => {
      expect(parseLine("Chicken breast, 2 lb", v2)).toMatchObject({ ingredientId: "chicken_breast", grams: 907, sure: true });
      expect(parseLine("juice of 1 lime", v2)).toMatchObject({ ingredientId: "limes", grams: 67 });
      expect(parseLine("4 slices bacon", v2)).toMatchObject({ ingredientId: "bacon", grams: 100, sure: true });
      expect(parseLine("1 scoop vanilla protein powder", v2)).toMatchObject({ ingredientId: "protein_powder", grams: 30, sure: true });
      expect(parseLine("1 jalapeño, seeded", v2)).toMatchObject({ ingredientId: "jalapeno", grams: 14 });
    });
    it("suggests close items for lines it can't match", () => {
      expect(suggestIngredients("1 head brocoli")[0]).toBe("broccoli");
      expect(suggestIngredients("Mozarella 100 g")[0]).toBe("mozzarella");
      expect(suggestIngredients("1 lb ground lamb")).toEqual(expect.arrayContaining(["ground_beef", "ground_turkey"]));
      expect(draftLine("4 oz chorizo", v2)).toMatchObject({ ingredientId: null });
      const line = draftLine("Mozarella 100 g", v2);
      expect(line).toMatchObject({ ingredientId: null, suggestions: ["mozzarella"] });
      expect(amountFor("Mozarella 100 g", "mozzarella", v2)).toEqual({ grams: 100, sure: true });
    });
    it("reads a recipe object sent by the bookmark", () => {
      const d = draftFromRecipeNode({ name: "Sheet Pan Fajitas", recipeYield: "6 servings", totalTime: "PT35M", recipeIngredient: ["2 lb chicken breast", "3 bell peppers", "1 onion", "12 flour tortillas"], recipeInstructions: [{ "@type": "HowToSection", itemListElement: [{ "@type": "HowToStep", text: "Roast at 425°F for 20 minutes." }] }] }, "https://example.com/fajitas", v2);
      expect(d).toMatchObject({ name: "Sheet Pan Fajitas", servings: 6, totalMinutes: 35, source: "https://example.com/fajitas" });
      expect(d.lines.map((l) => l.ingredientId)).toEqual(["chicken_breast", "bell_pepper", "onion", "tortillas"]);
      expect(d.equipment).toContain("oven");
    });
    it("turns a saved recipe back into a draft that saves the same", () => {
      const d = parseRecipe("Turkey Chili\nServes 6\nIngredients\n2 lb ground turkey\n2 cans kidney beans\n1 onion\nInstructions\n1. Simmer everything in a pot for 30 minutes.", undefined, v2);
      const seed = draftToSeed(d, "custom_chili", "american", 4, true);
      expect(draftToSeed(seedToDraft(seed), "custom_chili", "american", 4, true)).toEqual(seed);
    });
  });
});
