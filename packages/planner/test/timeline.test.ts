import { describe, expect, it } from "vitest";
import { RECIPES } from "@prep-cart/catalog";
import { prepTimeline } from "../src";

describe("prep timeline", () => {
  const slow = RECIPES.reduce((a, b) => (b.totalMinutes - b.activeMinutes > a.totalMinutes - a.activeMinutes ? b : a));
  const quick = RECIPES.find((r) => r.totalMinutes === r.activeMinutes && r.id !== slow.id)!;
  it("starts the longest unattended recipe first and works on the rest while it cooks", () => {
    const t = prepTimeline([{ recipe: quick, servings: quick.servings, portion: 1 }, { recipe: slow, servings: slow.servings, portion: 1 }]);
    expect(t.steps[0]!.recipeId).toBe(slow.id);
    const quickStart = t.steps.find((s) => s.recipeId === quick.id && s.kind === "handsOn")!;
    expect(quickStart.at).toBe(t.steps[0]!.minutes);
    // the session is shorter than doing them one after the other
    expect(t.totalMinutes).toBeLessThan(slow.totalMinutes + quick.totalMinutes + 5 + t.containers);
  });
  it("counts containers from servings and portion size", () => {
    const t = prepTimeline([{ recipe: quick, servings: 6, portion: 1.5 }]);
    expect(t.containers).toBe(4);
    expect(t.steps.at(-1)!.kind).toBe("pack");
  });
  it("is empty for an empty session", () => {
    expect(prepTimeline([])).toMatchObject({ steps: [], totalMinutes: 0, containers: 0 });
  });
});
