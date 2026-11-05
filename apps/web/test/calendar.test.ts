import { describe, expect, it } from "vitest";
import { shoppingCalendar, type CalendarItem } from "../src/lib/calendar";

const base = { aisle: "x", pkgLabel: "pack", chain: "aldi", onHand: 0 };
const lentils: CalendarItem = { ...base, id: "lentils", name: "Lentils", pkgGrams: 454, price: 1.5, weeklyGrams: 150, keepsDays: 365 };
const rice: CalendarItem = { ...base, id: "rice", name: "Rice", pkgGrams: 907, price: 2, weeklyGrams: 600, keepsDays: 365 };
const cilantro: CalendarItem = { ...base, id: "cilantro", name: "Cilantro", pkgGrams: 60, price: 1, weeklyGrams: 20, keepsDays: 6 };
const chicken: CalendarItem = { ...base, id: "chicken", name: "Chicken", pkgGrams: 1361, price: 9, weeklyGrams: 1000, keepsDays: 3 };
const opts = { weeks: 4, start: "2026-11-09", tripDays: 7 };

describe("shopping calendar", () => {
  it("puts one trip on the first day of each week", () => {
    const c = shoppingCalendar([chicken], opts);
    expect(c.trips.map((t) => t.date)).toEqual(["2026-11-09", "2026-11-16", "2026-11-23", "2026-11-30"]);
  });

  it("buys fresh food every trip and counts what goes off", () => {
    const c = shoppingCalendar([cilantro], opts);
    expect(c.trips.every((t) => t.lines.length === 1)).toBe(true);
    const p = c.items[0]!;
    expect(p.kind).toBe("eachTrip");
    expect(p.wasteGrams).toBe(160);
    expect(p.wasteCost).toBeCloseTo(160 / 60, 2);
  });

  it("stocks up on food that keeps, on the first trip", () => {
    const c = shoppingCalendar([rice], opts);
    // 4 weeks × 600 g = 2400 g = 3 bags of 907 g
    expect(c.trips[0]!.lines[0]).toMatchObject({ packages: 3, stockUp: true });
    expect(c.trips.slice(1).every((t) => t.lines.length === 0)).toBe(true);
    expect(c.items[0]).toMatchObject({ kind: "stockUp", buys: 1, buysWeekly: 3 });
    expect(c.pickupsSaved).toBe(2);
    expect(c.total).toBe(6);
    expect(c.totalWeekly).toBe(6);
  });

  it("a package that already lasts several weeks is not called a stock up", () => {
    const c = shoppingCalendar([lentils], opts);
    expect(c.trips[0]!.lines[0]).toMatchObject({ packages: 2, stockUp: true });
    const one = shoppingCalendar([lentils], { ...opts, weeks: 3 });
    expect(one.trips[0]!.lines[0]).toMatchObject({ packages: 1, stockUp: false });
  });

  it("uses what is already at home first", () => {
    const c = shoppingCalendar([{ ...rice, onHand: 2400 }], opts);
    expect(c.trips.every((t) => t.lines.length === 0)).toBe(true);
    expect(c.items[0]!.kind).toBe("fromHome");
  });

  it("stocking up during a sale saves what later weeks would pay", () => {
    const sale = { ...rice, price: 1.5, regular: 2, saleEndsOn: "2026-11-12" };
    const c = shoppingCalendar([sale], opts);
    expect(c.total).toBe(4.5);
    // one week at a time: 1 bag on sale, then 2 at the usual price
    expect(c.totalWeekly).toBe(5.5);
    expect(c.saved).toBe(1);
  });

  it("can keep a long-keeping item off the stock-up list", () => {
    const c = shoppingCalendar([{ ...chicken, keepsDays: 90, stockUp: false }], opts);
    expect(c.items[0]!.kind).toBe("eachTrip");
    expect(c.items[0]!.wasteGrams).toBe(0);
  });

  it("one week has nothing to stock up for", () => {
    const c = shoppingCalendar([rice], { ...opts, weeks: 1 });
    expect(c.items[0]!.kind).toBe("eachTrip");
    expect(c.trips[0]!.lines[0]!.packages).toBe(1);
  });
});
