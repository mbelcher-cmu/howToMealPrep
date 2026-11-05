import { describe, expect, it } from "vitest";
import { MENU_ITEMS, menuFit, RESTAURANTS } from "@prep-cart/catalog";
import { cookedMealCost, suggestTakeout, type TakeoutSlot } from "../src";

const dinner: TakeoutSlot = { occasionId: "dinner", kind: "main", target: { kcal: 700, protein: 50, carbs: 70, fat: 24 } };
const lunch: TakeoutSlot = { occasionId: "lunch", kind: "main", target: { kcal: 600, protein: 40, carbs: 60, fat: 22 } };
const breakfast: TakeoutSlot = { occasionId: "breakfast", kind: "breakfast", target: { kcal: 450, protein: 30, carbs: 45, fat: 15 } };

describe("suggestTakeout", () => {
  it("places the asked-for number of meals on different, spread-out days", () => {
    const r = suggestTakeout({ days: 7, slots: [dinner], count: 3, maxSpend: 100, items: MENU_ITEMS });
    expect(r.meals).toHaveLength(3);
    expect(r.short).toBe(0);
    const days = r.meals.map((e) => e.day);
    expect(new Set(days).size).toBe(3);
    // no two takeout dinners on back-to-back days when the week has room
    for (let i = 1; i < days.length; i++) expect(days[i]! - days[i - 1]!).toBeGreaterThan(1);
  });

  it("keeps the total under the spend cap and reports what didn't fit", () => {
    const r = suggestTakeout({ days: 7, slots: [dinner], count: 4, maxSpend: 12, items: MENU_ITEMS });
    expect(r.cost).toBeLessThanOrEqual(12);
    expect(r.meals.length + r.short).toBe(4);
    expect(r.short).toBeGreaterThan(0);
  });

  it("only uses items for that kind of meal", () => {
    const r = suggestTakeout({ days: 7, slots: [breakfast], count: 3, maxSpend: 100, items: MENU_ITEMS });
    const byId = new Map(MENU_ITEMS.map((m) => [m.id, m]));
    for (const e of r.meals) expect(byId.get(e.itemId)!.mealType).toBe("breakfast");
  });

  it("varies the chains instead of repeating the single best fit", () => {
    const r = suggestTakeout({ days: 7, slots: [dinner, lunch], count: 4, maxSpend: 200, items: MENU_ITEMS });
    const chains = r.meals.map((e) => MENU_ITEMS.find((m) => m.id === e.itemId)!.restaurantId);
    expect(new Set(chains).size).toBeGreaterThanOrEqual(3);
  });

  it("picks well-fitting items, not just cheap ones", () => {
    const r = suggestTakeout({ days: 7, slots: [dinner], count: 1, maxSpend: 100, items: MENU_ITEMS });
    const picked = MENU_ITEMS.find((m) => m.id === r.meals[0]!.itemId)!;
    const fits = MENU_ITEMS.filter((m) => m.mealType === "main").map((m) => menuFit(m, dinner.target)).sort((a, b) => a - b);
    // within the best ten of the whole menu
    expect(menuFit(picked, dinner.target)).toBeLessThanOrEqual(fits[9]!);
  });

  it("leaves meals that already have takeout alone and avoids those days", () => {
    const taken = [{ day: 4, occasionId: "dinner", itemId: "chipotle_chicken_bowl" }];
    const r = suggestTakeout({ days: 7, slots: [dinner], count: 2, maxSpend: 100, items: MENU_ITEMS, taken });
    expect(r.meals.some((e) => e.day === 4)).toBe(false);
  });

  it("stops when every meal is already takeout", () => {
    const r = suggestTakeout({ days: 2, slots: [dinner], count: 5, maxSpend: 500, items: MENU_ITEMS });
    expect(r.meals).toHaveLength(2);
    expect(r.short).toBe(3);
  });

  it("returns nothing with an empty menu", () => {
    expect(suggestTakeout({ days: 7, slots: [dinner], count: 2, maxSpend: 50, items: [] })).toEqual({ meals: [], cost: 0, short: 2 });
  });
});

describe("cookedMealCost", () => {
  it("spreads the grocery bill over every prepped meal and person", () => {
    expect(cookedMealCost({ cost: 60, recipes: [{ meals: 14 }, { meals: 7 }, { meals: 7 }], household: { factor: 1 } })).toBe(2.14);
    expect(cookedMealCost({ cost: 60, recipes: [{ meals: 14 }], household: { factor: 2 } })).toBe(2.14);
    expect(cookedMealCost({ cost: 60, recipes: [], household: { factor: 1 } })).toBe(0);
  });
});

describe("restaurant data", () => {
  it("has at least two items at every chain", () => {
    for (const r of RESTAURANTS) expect(MENU_ITEMS.filter((m) => m.restaurantId === r.id).length, r.id).toBeGreaterThanOrEqual(2);
  });
});
