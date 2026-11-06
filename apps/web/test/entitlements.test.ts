import { describe, expect, it } from "vitest";
import { CORE_FREE, FEATURES, FREE_SUB, PLUS_PRICE, canAddMore, entitled, limitFor, startTestPlus, yearlySavings, type FeatureId } from "../src/lib/entitlements";
import { FLAG_DEFAULTS } from "../src/lib/flags";

const ids = Object.keys(FEATURES) as FeatureId[];

describe("entitlements", () => {
  it("keeps planning, swaps, the shopping list and the cart free", () => {
    for (const f of CORE_FREE) {
      expect(FEATURES[f].tier).toBe("free");
      expect(entitled(f, "free")).toBe(true);
      expect(limitFor(f, "free")).toBe(Infinity);
    }
    expect(CORE_FREE).toEqual(expect.arrayContaining(["planning", "swaps", "groceries", "inStore"]));
  });

  it("gates Plus-only features for free accounts and opens them with Plus", () => {
    expect(entitled("fitnessSync", "free")).toBe(false);
    expect(entitled("fitnessSync", "plus")).toBe(true);
    for (const f of ids) expect(entitled(f, "plus")).toBe(true);
  });

  it("gives free accounts an allowance on counted features", () => {
    expect(limitFor("household", "free")).toBe(1);
    expect(canAddMore("household", 0, "free")).toBe(true);
    expect(canAddMore("household", 1, "free")).toBe(false);
    expect(canAddMore("household", 1, "plus")).toBe(true);
    expect(limitFor("recipeImport", "free")).toBe(3);
    expect(canAddMore("recipeImport", 3, "free")).toBe(false);
    expect(entitled("recipeImport", "free")).toBe(true);
  });

  it("gates nothing when the plusTier flag is off", () => {
    for (const f of ids) {
      expect(entitled(f, "free", false)).toBe(true);
      expect(limitFor(f, "free", false)).toBe(Infinity);
    }
  });

  it("is on in production, staging and development (turned on Nov 6 2026)", () => {
    expect(FLAG_DEFAULTS.plusTier).toEqual({ production: true, staging: true, development: true });
  });

  it("starts and ends test-mode Plus without a payment", () => {
    const sub = startTestPlus("year", new Date("2026-11-05T12:00:00Z"));
    expect(sub).toEqual({ tier: "plus", interval: "year", source: "test", since: "2026-11-05" });
    expect(FREE_SUB.tier).toBe("free");
  });

  it("prices yearly below twelve months", () => {
    expect(PLUS_PRICE.placeholder).toBe(true);
    expect(PLUS_PRICE.year).toBeLessThan(PLUS_PRICE.month * 12);
    expect(yearlySavings()).toBeGreaterThan(0);
  });
});
