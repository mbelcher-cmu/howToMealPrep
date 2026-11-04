import { describe, expect, it } from "vitest";
import { adherence, defaultOccasions, suggestTargets, type Goal } from "@prep-cart/nutrition";
import type { Diet } from "@prep-cart/catalog";
import { plan } from "../src";
import { baseRequest, highsPromise } from "./fixtures";

/** Fixed profiles that every optimizer change must keep within tolerance. */
const PROFILES: { name: string; sex: "male" | "female"; age: number; cm: number; kg: number; goal: Goal; meals: number; snacks: number; diet: Diet[]; budget: number }[] = [
  { name: "lifter cutting", sex: "male", age: 28, cm: 180, kg: 86, goal: "lose", meals: 3, snacks: 2, diet: [], budget: 80 },
  { name: "lifter bulking", sex: "male", age: 24, cm: 178, kg: 75, goal: "gain", meals: 4, snacks: 2, diet: [], budget: 95 },
  { name: "student on a budget", sex: "female", age: 21, cm: 165, kg: 60, goal: "maintain", meals: 3, snacks: 1, diet: [], budget: 50 },
  { name: "vegetarian maintain", sex: "female", age: 35, cm: 170, kg: 68, goal: "maintain", meals: 3, snacks: 1, diet: ["vegetarian"], budget: 70 },
  { name: "pescatarian cut", sex: "male", age: 40, cm: 175, kg: 90, goal: "lose", meals: 3, snacks: 1, diet: ["pescatarian"], budget: 85 },
  { name: "gluten-free", sex: "female", age: 30, cm: 160, kg: 58, goal: "lose", meals: 3, snacks: 2, diet: ["glutenFree"], budget: 70 },
  { name: "two big meals", sex: "male", age: 33, cm: 183, kg: 82, goal: "maintain", meals: 2, snacks: 1, diet: [], budget: 70 },
  { name: "dairy-free", sex: "male", age: 45, cm: 172, kg: 95, goal: "lose", meals: 3, snacks: 0, diet: ["dairyFree"], budget: 75 },
];

describe("golden profiles", async () => {
  const highs = await highsPromise;
  for (const p of PROFILES) {
    it(p.name, () => {
      const s = suggestTargets({ stats: { sex: p.sex, ageYears: p.age, heightCm: p.cm, weightKg: p.kg }, activity: "moderate", goal: p.goal });
      const base = baseRequest();
      const req = baseRequest({ targets: s.targets, occasions: defaultOccasions(p.meals, p.snacks), budget: p.budget, prefs: { ...base.prefs, diets: p.diet }, timeLimit: 1.2 });
      const r = plan(req, highs);
      const a = adherence(r.daily, req.targets);
      expect(r.status, r.message).toBe("ok");
      expect(a.pass, JSON.stringify({ daily: r.daily, targets: req.targets, cost: r.cost })).toBe(true);
    });
  }
});
