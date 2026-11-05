import { describe, expect, it } from "vitest";
import { applyDeals, buildPriceTable, cartSavings, dealHint, plan, priceInsight, recordTrip, type PriceObs } from "../src";
import { baseRequest, highsPromise } from "./fixtures";

const today = "2026-11-05";
const obs = (on: string, price: number, source: PriceObs["source"] = "trip", chain: PriceObs["chain"] = "aldi"): PriceObs => ({ chain, price, on, source });

describe("price history", () => {
  it("uses the regular price when there is no history yet", () => {
    const i = priceInsight(undefined, "aldi", 4, today)!;
    expect(i).toMatchObject({ usual: 4, low: 4, high: 4, trend: "steady", points: [] });
    expect(priceInsight(undefined, "aldi", null, today)).toBeNull();
  });

  it("blends history into the usual price, but sales and other stores don't count", () => {
    const h = [obs("2026-10-01", 5), obs("2026-10-08", 5), obs("2026-10-15", 2.5, "sale"), obs("2026-10-20", 1, "trip", "walmart")];
    const i = priceInsight(h, "aldi", 4, today)!;
    expect(i.usual).toBe(5); // median of 4, 5, 5
    expect(i.low).toBe(2.5);
    expect(i.points).toHaveLength(3);
    expect(i.last).toMatchObject({ price: 2.5, source: "sale" });
  });

  it("forgets prices older than half a year", () => {
    const i = priceInsight([obs("2025-01-01", 9), obs("2025-02-01", 9)], "aldi", 4, today)!;
    expect(i.usual).toBe(4);
  });

  it("tells rising and falling prices from steady ones", () => {
    const up = [obs("2026-08-01", 4), obs("2026-08-15", 4), obs("2026-10-20", 4.6), obs("2026-11-01", 4.6)];
    expect(priceInsight(up, "aldi", null, today)!.trend).toBe("up");
    const down = [obs("2026-08-01", 4), obs("2026-10-20", 3.5)];
    expect(priceInsight(down, "aldi", null, today)!.trend).toBe("down");
    expect(priceInsight([obs("2026-08-01", 4), obs("2026-10-20", 4.1)], "aldi", null, today)!.trend).toBe("steady");
    expect(priceInsight([obs("2026-10-20", 9)], "aldi", null, today)!.trend).toBe("steady"); // nothing older to compare with
  });

  it("only hints at real differences, and says stock up for food that keeps", () => {
    const i = priceInsight(undefined, "aldi", 10, today)!;
    expect(dealHint(9.5, i, 365)).toBeNull(); // 5% off is noise
    expect(dealHint(8, i, 7)).toEqual({ kind: "deal", share: 0.2, usual: 10 });
    expect(dealHint(9, i, 90)).toEqual({ kind: "stockUp", share: 0.1, usual: 10 });
    expect(dealHint(11.5, i, 365)).toEqual({ kind: "up", share: 0.15, usual: 10 });
    expect(dealHint(10.5, i, 365)).toBeNull();
    expect(dealHint(5, null, 365)).toBeNull();
  });

  it("records each trip once, keeps sales as sales, and caps the history", () => {
    const cart = [
      { ingredientId: "rice", chain: "aldi" as const, unitPrice: 2.891, priceSource: "estimate" as const },
      { ingredientId: "salmon", chain: "aldi" as const, unitPrice: 5.99, priceSource: "sale" as const },
      { ingredientId: "tofu", chain: "aldi" as const, unitPrice: 0, priceSource: "estimate" as const },
    ];
    const once = recordTrip({}, cart, today);
    expect(once.rice).toEqual([{ chain: "aldi", price: 2.89, on: today, source: "trip" }]);
    expect(once.salmon![0]!.source).toBe("sale");
    expect(once.tofu).toBeUndefined();
    expect(recordTrip(once, cart, today)).toEqual(once);
    let h = once;
    for (let d = 0; d < 40; d++) h = recordTrip(h, cart, new Date(Date.UTC(2027, 0, 1 + d)).toISOString().slice(0, 10));
    expect(h.rice).toHaveLength(30);
    expect(h.rice!.at(-1)!.on).toBe("2027-02-09");
  });

  it("adds up what deals save against usual prices", () => {
    const i = priceInsight(undefined, "aldi", 10, today)!;
    expect(cartSavings([
      { price: 8, packages: 2, hint: dealHint(8, i, 7) },
      { price: 12, packages: 1, hint: dealHint(12, i, 7) },
      { price: 10, packages: 1, hint: null },
    ])).toBe(4);
  });
});

describe("planning around deals", async () => {
  const highs = await highsPromise;
  const usesSale = (r: ReturnType<typeof plan>) => r.recipes.filter((p) => p.recipe.lines.some((l) => r.cart.some((c) => c.ingredientId === l.ingredientId && c.priceSource === "sale"))).length;

  it("leans harder on sale items when asked to favor deals", () => {
    // modest sales (about 15% off) that price alone barely notices
    const ids = ["cod", "shrimp", "ground_turkey", "black_beans", "sweet_potato"];
    const table = buildPriceTable();
    const deals = ids.map((id) => ({ ingredientId: id, chain: "aldi" as const, price: Math.round(table[id]!.aldi!.price * 85) / 100, endsOn: "2099-01-01" }));
    const prices = applyDeals(table, deals, today);
    const req = baseRequest({ prices, stores: ["aldi"], budget: 90 });
    const plain = plan(req, highs);
    const favored = plan({ ...req, favorDeals: true }, highs);
    expect(favored.status).toBe("ok");
    expect(usesSale(favored)).toBeGreaterThanOrEqual(usesSale(plain));
    expect(usesSale(favored)).toBeGreaterThan(0);
    expect(favored.cost).toBeLessThanOrEqual(req.budget + 0.005);
  });
});
