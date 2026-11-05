import { describe, expect, it } from "vitest";
import { mergeSaved } from "../src/lib/sanitize";

const defaults = {
  onboarded: false,
  budget: { amount: 75, period: "week" },
  profile: { units: "us", heightCm: 175 },
  stores: ["aldi", "walmart"],
  checked: {} as Record<string, boolean>,
  current: null as null | { id: string },
  days: 7,
  setX: () => {},
};

describe("loading a saved state", () => {
  it("keeps good values", () => {
    const s = mergeSaved({ onboarded: true, days: 5, stores: ["aldi"], current: { id: "p1" }, checked: { a: true } }, defaults);
    expect(s).toMatchObject({ onboarded: true, days: 5, stores: ["aldi"], current: { id: "p1" }, checked: { a: true } });
  });
  it("drops values of the wrong shape and uses the default", () => {
    const s = mergeSaved({ onboarded: true, budget: null, stores: "aldi", checked: [], days: "7" }, defaults);
    expect(s.onboarded).toBe(true);
    expect(s.budget).toEqual(defaults.budget);
    expect(s.stores).toEqual(defaults.stores);
    expect(s.checked).toEqual({});
    expect(s.days).toBe(7);
  });
  it("fills fields a newer release added inside saved objects", () => {
    const s = mergeSaved({ profile: { units: "metric" } }, defaults);
    expect(s.profile).toEqual({ units: "metric", heightCm: 175 });
  });
  it("drops a NaN number and keeps the actions", () => {
    const s = mergeSaved({ days: Number.NaN }, defaults);
    expect(s.days).toBe(7);
    expect(typeof s.setX).toBe("function");
  });
  it("ignores a save that isn't an object", () => {
    expect(mergeSaved("junk", defaults)).toBe(defaults);
    expect(mergeSaved(null, defaults)).toBe(defaults);
  });
});
