import { describe, expect, it } from "vitest";
import { FLAG_DEFAULTS, flag, parseFlags } from "../src/lib/flags";

describe("feature flags", () => {
  it("parses on and off and ignores unknown flags", () => {
    expect(parseFlags("accounts=on, plus=off,bogus=on,analytics=maybe")).toEqual({ accounts: true, plus: false });
    expect(parseFlags("")).toEqual({});
    expect(parseFlags(undefined)).toEqual({});
    // camelCase flags work in any case (they used to be lowercased and then ignored)
    expect(parseFlags("fitnessSync=on,NEXTWEEK=off")).toEqual({ fitnessSync: true, nextWeek: false });
  });

  it("falls back to the development defaults outside the browser", () => {
    for (const k of Object.keys(FLAG_DEFAULTS) as (keyof typeof FLAG_DEFAULTS)[]) expect(flag(k)).toBe(FLAG_DEFAULTS[k].development);
  });
});
