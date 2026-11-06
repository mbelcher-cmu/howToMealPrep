import { describe, expect, it } from "vitest";
import type { CartLine } from "@prep-cart/planner";
import { addPaid, leftoverPerGram, linePkgLabel, lineCounted, plannerStores, usesClub, visibleChains } from "../src/lib/bulk";
import { shoppingCalendar, type CalendarItem } from "../src/lib/calendar";

const clubLine: CartLine = {
  ingredientId: "chicken_breast", chain: "costco", packages: 1, unitPrice: 16.99, cost: 16.99, priceSource: "estimate",
  needGrams: 1000, leftoverGrams: 1948, pkg: { grams: 2948, label: "6.5 lb pack" }, countedCost: 5.76,
};

describe("warehouse clubs in the app", () => {
  it("hides Costco and Sam's Club while the flag is off", () => {
    expect(visibleChains(false).map((c) => c.id)).not.toContain("costco");
    expect(visibleChains(true).map((c) => c.id)).toEqual(expect.arrayContaining(["costco", "samsclub"]));
    expect(plannerStores(["aldi", "costco"], false)).toEqual(["aldi"]);
    expect(plannerStores(["aldi", "costco"], true)).toEqual(["aldi", "costco"]);
    expect(usesClub(["aldi", "samsclub"], true)).toBe(true);
    expect(usesClub(["aldi", "samsclub"], false)).toBe(false);
  });

  it("labels club lines with the club pack and counts only their share", () => {
    expect(linePkgLabel(clubLine)).toBe("6.5 lb pack");
    expect(linePkgLabel({ ingredientId: "chicken_breast" })).toBe("3 lb pack");
    expect(lineCounted(clubLine)).toBe(5.76);
    expect(lineCounted({ cost: 4 })).toBe(4);
  });

  it("carries the uncounted part of a club pack's price into the pantry", () => {
    // $16.99 paid, $5.76 counted this week: $11.23 spread over the 1948 g left
    expect(leftoverPerGram(clubLine)! * 1948).toBeCloseTo(11.23, 2);
    expect(leftoverPerGram({ ...clubLine, countedCost: undefined })).toBeNull();
    expect(leftoverPerGram({ ...clubLine, leftoverGrams: 0 })).toBeNull();
  });

  it("averages paid and unpaid food in a pantry row", () => {
    expect(addPaid(undefined, 1000, 0.01)).toEqual({ grams: 1000, costPerGram: 0.01 });
    const r = addPaid({ ingredientId: "x", grams: 1000, costPerGram: 0.01 }, 1000, null);
    expect(r.grams).toBe(2000);
    expect(r.costPerGram).toBeCloseTo(0.005, 6);
    expect(addPaid({ ingredientId: "x", grams: 500 }, 500, null)).toEqual({ grams: 1000 });
    expect(addPaid({ ingredientId: "x", grams: Infinity }, 500, 0.01)).toEqual({ grams: Infinity });
  });

  it("buys a club pack of meat once and freezes it for the next weeks", () => {
    const meat: CalendarItem = { id: "chicken_breast", name: "Chicken", aisle: "Meat and seafood", pkgGrams: 2948, pkgLabel: "6.5 lb pack", chain: "costco", price: 16.99, weeklyGrams: 700, onHand: 0, keepsDays: 90, stockUp: true };
    const c = shoppingCalendar([meat], { weeks: 4, start: "2026-11-08", tripDays: 7 });
    expect(c.trips[0]!.lines[0]).toMatchObject({ packages: 1 });
    expect(c.trips.slice(1).every((t) => t.lines.length === 0)).toBe(true);
    expect(c.items[0]!.kind).toBe("stockUp");
    expect(c.items[0]!.wasteGrams).toBe(0);
  });
});
