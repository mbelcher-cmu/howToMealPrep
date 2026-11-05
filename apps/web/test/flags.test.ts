import { describe, expect, it } from "vitest";
import { FLAG_DEFAULTS, flag, parseFlags } from "../src/lib/flags";

describe("feature flags", () => {
  it("parses on and off and ignores unknown flags", () => {
    expect(parseFlags("accounts=on, plus=off,bogus=on,analytics=maybe")).toEqual({ accounts: true, plus: false });
    expect(parseFlags("")).toEqual({});
    expect(parseFlags(undefined)).toEqual({});
    expect(parseFlags("pricetrends=on,NEXTWEEK=off")).toEqual({ priceTrends: true, nextWeek: false });
  });

  it("reads camelCase flag names in any case", () => {
    expect(parseFlags("eatOutPlus=on,NEXTWEEK=off")).toEqual({ eatOutPlus: true, nextWeek: false });
  });

  it("matches camelCase flag names in any case", () => {
    expect(parseFlags("householdGoals=on,NEXTWEEK=off")).toEqual({ householdGoals: true, nextWeek: false });
    expect(parseFlags("plusTier=on,NEXTWEEK=off")).toEqual({ plusTier: true, nextWeek: false });
  });

  it("falls back to the development defaults outside the browser", () => {
    for (const k of Object.keys(FLAG_DEFAULTS) as (keyof typeof FLAG_DEFAULTS)[]) expect(flag(k)).toBe(FLAG_DEFAULTS[k].development);
  });
});
