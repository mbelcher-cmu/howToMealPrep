import { describe, expect, it } from "vitest";
import { plan, schedule } from "../src";
import { baseRequest, highsPromise } from "./fixtures";

describe("lunch and dinner rotation", async () => {
  const highs = await highsPromise;

  it("splits the week into two even blocks with a fresh cook before the second", () => {
    const req = baseRequest({ variety: { breakfast: 1, main: 2, snack: 1, rotation: "blocks" }, budget: 95 });
    const r = plan(req, highs);
    expect(r.status, r.message).toBe("ok");
    const mains = r.recipes.filter((p) => p.slot === "main");
    expect(mains).toHaveLength(2);
    const [a, b] = mains.map((p) => p.meals).sort((x, y) => x - y);
    expect(b! - a!).toBeLessThanOrEqual(1);
    expect(mains[0]!.recipe.proteins[0]).not.toBe(mains[1]!.recipe.proteins[0]);
    const s = schedule(r, req.occasions, 7, "blocks");
    // each main is eaten on consecutive days, one block after the other
    const mainIds = new Set(mains.map((p) => p.recipe.id));
    const seq = s.days.flatMap((d) => d.meals.filter((m) => mainIds.has(m.recipeId)).map((m) => m.recipeId));
    const switches = seq.filter((id, i) => i > 0 && id !== seq[i - 1]).length;
    expect(switches).toBe(1);
    // the second block is cooked fresh mid-week
    const second = seq[seq.length - 1]!;
    const firstDay = s.days.findIndex((d) => d.meals.some((m) => m.recipeId === second));
    expect(firstDay).toBeGreaterThanOrEqual(3);
    expect(s.sessions.some((x) => x.beforeDay === firstDay && x.batches.some((bt) => bt.recipeId === second))).toBe(true);
    expect(s.sessions[0]!.batches.some((bt) => bt.recipeId === second)).toBe(false);
  });

  it("gives every chosen main a fair share when mixed", () => {
    const req = baseRequest({ variety: { breakfast: 1, main: 2, snack: 1 }, budget: 95 });
    const r = plan(req, highs);
    for (const p of r.recipes.filter((x) => x.slot === "main")) expect(p.meals).toBeGreaterThanOrEqual(4);
  });
});
