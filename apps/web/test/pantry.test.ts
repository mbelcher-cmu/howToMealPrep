import { describe, expect, it } from "vitest";
import { INGREDIENTS, RECIPES, type Recipe } from "@prep-cart/catalog";
import { cookFromPantry, nearestQuick, packagePrice, pantrySavings, storageOf } from "../src/lib/pantry";

const recipe = (id: string, lines: [string, number][]): Recipe => ({ ...RECIPES[0]!, id, name: id, lines: lines.map(([ingredientId, grams]) => ({ ingredientId, grams })) });

describe("pantry storage", () => {
  it("puts frozen, chilled and shelf food in the right place", () => {
    expect(storageOf("salmon")).toBe("freezer");
    expect(storageOf("chicken_breast")).toBe("fridge");
    expect(storageOf("eggs")).toBe("fridge");
    expect(storageOf("spinach")).toBe("fridge");
    expect(storageOf("onion")).toBe("cupboard");
    expect(storageOf("tuna")).toBe("cupboard");
    expect(storageOf("not_a_thing")).toBe("cupboard");
  });
});

describe("quick amounts", () => {
  it("snaps to full, half or a little of a package", () => {
    const pkg = INGREDIENTS.chicken_breast!.pkg.grams;
    expect(nearestQuick("chicken_breast", pkg)).toBe(1);
    expect(nearestQuick("chicken_breast", pkg * 0.52)).toBe(0.5);
    expect(nearestQuick("chicken_breast", pkg * 0.2)).toBe(0.2);
    expect(nearestQuick("chicken_breast", pkg * 0.75)).toBeNull();
    expect(nearestQuick("chicken_breast", Infinity)).toBeNull();
  });
});

describe("pantry savings", () => {
  it("prices what the plan takes from the pantry at the cheapest store", () => {
    const ing = INGREDIENTS.chicken_breast!;
    const cheapest = Math.min(...Object.values(ing.estPrice).filter((p): p is number => p != null));
    expect(packagePrice("chicken_breast")).toBe(cheapest);
    expect(pantrySavings([{ ingredientId: "chicken_breast", grams: ing.pkg.grams / 2 }], [])).toBeCloseTo(cheapest / 2, 2);
  });

  it("uses the person's own price when they set one", () => {
    expect(packagePrice("chicken_breast", { chicken_breast: { aldi: { price: 1 } } })).toBe(1);
  });

  it("leaves staples out", () => {
    const staples = [{ ingredientId: "olive_oil", grams: Infinity }];
    expect(pantrySavings([{ ingredientId: "olive_oil", grams: 30 }], staples)).toBe(0);
  });
});

describe("cook from pantry", () => {
  const a = recipe("a", [["chicken_breast", 600], ["rice", 300], ["olive_oil", 20]]);
  const b = recipe("b", [["chicken_breast", 600], ["broccoli", 400], ["rice", 300], ["salsa", 200]]);
  const c = recipe("c", [["ground_beef", 454]]);

  it("ranks recipes by how much of them you already have, ignoring staples", () => {
    const pantry = [{ ingredientId: "chicken_breast", grams: 700 }, { ingredientId: "rice", grams: 900 }, { ingredientId: "olive_oil", grams: Infinity }];
    const m = cookFromPantry(pantry, [b, c, a]);
    expect(m.map((x) => x.recipe.id)).toEqual(["a", "b"]);
    expect(m[0]).toMatchObject({ have: ["chicken_breast", "rice"], missing: [] });
    expect(m[1]!.missing).toEqual(["broccoli", "salsa"]);
  });

  it("needs at least half a batch's worth to count an ingredient", () => {
    const m = cookFromPantry([{ ingredientId: "chicken_breast", grams: 200 }], [a]);
    expect(m).toEqual([]);
  });

  it("puts recipes that use up food about to go off first", () => {
    const pantry = [{ ingredientId: "chicken_breast", grams: 700 }, { ingredientId: "rice", grams: 900 }, { ingredientId: "broccoli", grams: 400 }];
    const m = cookFromPantry(pantry, [a, b], { soonIds: new Set(["broccoli"]) });
    expect(m[0]!.recipe.id).toBe("b");
    expect(m[0]!.usesSoon).toEqual(["broccoli"]);
  });
});
