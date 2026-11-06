import { describe, expect, it } from "vitest";
import { defaultOccasions, targetsFromSplit, SPLIT_PRESETS } from "@prep-cart/nutrition";
import { RECIPES_BY_ID } from "@prep-cart/catalog";
import { plan, schedule, type PlanRequest } from "../src";
import { baseRequest, highsPromise } from "./fixtures";

/** calories eaten on each day of a scheduled plan */
function dayKcal(req: PlanRequest, rotation: "mix" | "blocks" = "mix") {
  const r = plan(req, highs0!);
  expect(r.status, r.message).toBe("ok");
  const s = schedule(r, req.occasions, req.days, rotation, req.targets, { cookDays: req.cookDays });
  return { r, kcal: s.days.map((d) => d.meals.reduce((a, m) => a + RECIPES_BY_ID[m.recipeId]!.perServing.kcal * m.portion, 0)) };
}
let highs0: Awaited<typeof highsPromise> | null = null;

const fresh = (o: ReturnType<typeof defaultOccasions>) => o.map((x) => (x.name === "Breakfast" ? { ...x, fresh: true } : x));
const cases: [string, Partial<PlanRequest>, ("mix" | "blocks")?][] = [
  ["fresh breakfast, 2450 kcal, Walmart", { targets: targetsFromSplit(2450, SPLIT_PRESETS.balanced.split), occasions: fresh(defaultOccasions(3, 1)), stores: ["walmart"] }],
  ["prepped breakfast, 2 snacks", {}],
  ["fresh breakfasts, two cook days, different food each", { targets: targetsFromSplit(2450, SPLIT_PRESETS.balanced.split), occasions: fresh(defaultOccasions(3, 1)), stores: ["walmart"], cookDays: 2, variety: { breakfast: 2, main: 2, snack: 1, rotation: "blocks" } }, "blocks"],
  ["two cook days, split week", { cookDays: 2, variety: { breakfast: 1, main: 2, snack: 1, rotation: "blocks" }, budget: 90 }, "blocks"],
  ["4 days, fresh breakfast, Aldi", { days: 4, occasions: fresh(defaultOccasions(3, 1)), stores: ["aldi"], budget: 50 }],
  ["breakfast skipped, 3 days", { days: 3, occasions: defaultOccasions(2, 1), budget: 40 }],
  ["tighter budget", { budget: 60, stores: ["walmart"] }],
];

describe("every day of the plan is close to the calorie target", async () => {
  highs0 = await highsPromise;
  for (const [name, over, rot] of cases) {
    it(name, () => {
      const req = baseRequest(over);
      const { kcal } = dayKcal(req, rot);
      for (const k of kcal) expect(Math.abs(k - req.targets.kcal) / req.targets.kcal, `${name}: ${kcal.map(Math.round).join(", ")}`).toBeLessThan(0.15);
    });
  }
});
