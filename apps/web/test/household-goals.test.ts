import { describe, expect, it } from "vitest";
import { memberGoals, memberRequest } from "../src/lib/household";
import type { Member } from "../src/lib/store";

const sam: Member = { id: "m1", name: " Sam ", sex: "male", ageYears: 35, heightCm: 180, weightKg: 85, activity: "moderate", goal: "maintain", kcal: 2400 };

describe("household member goals", () => {
  it("keeps calories exact at 4/4/9 and estimates protein when not set", () => {
    const g = memberGoals(sam);
    expect(g.kcal).toBe(2400);
    expect(g.protein).toBe(g.estimatedProtein);
    expect(Math.abs(g.protein * 4 + g.carbs * 4 + g.fat * 9 - 2400)).toBeLessThanOrEqual(6);
  });

  it("uses the person's own protein, capped at 40% of calories", () => {
    expect(memberGoals({ ...sam, protein: 180 }).protein).toBe(180);
    expect(memberGoals({ ...sam, protein: 400 }).protein).toBe(240);
  });

  it("sends only calories with own goals off, and macros plus diet with them on", () => {
    expect(memberRequest({ ...sam, diets: ["vegetarian"] }, false)).toEqual({ id: "m1", name: "Sam", kcal: 2400 });
    const on = memberRequest({ ...sam, diets: ["vegetarian"], allergens: ["peanut"] }, true);
    expect(on).toMatchObject({ kcal: 2400, diets: ["vegetarian"], allergens: ["peanut"] });
    expect(on.protein).toBeGreaterThan(0);
    // older saves have no diet fields
    expect(memberRequest(sam, true)).toMatchObject({ diets: [], allergens: [] });
  });
});
