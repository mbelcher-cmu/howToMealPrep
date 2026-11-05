import { describe, expect, it } from "vitest";
import { RECIPES } from "@prep-cart/catalog";
import { plan, preferenceFit, rankBonus, rankingChoices } from "../src";
import { baseRequest, highsPromise } from "./fixtures";

describe("meal rankings from setup", async () => {
  const highs = await highsPromise;

  it("offers up to 10 varied options per meal that pass the person's rules", () => {
    const prefs = baseRequest().prefs;
    const mains = rankingChoices("main", prefs);
    expect(mains).toHaveLength(10);
    expect(new Set(mains.map((r) => r.id)).size).toBe(10);
    expect(new Set(mains.flatMap((r) => r.cuisines)).size).toBeGreaterThanOrEqual(8);
    expect(rankingChoices("breakfast", prefs).length).toBeGreaterThanOrEqual(8);
    const veg = rankingChoices("main", { ...prefs, diets: ["vegetarian"] });
    expect(veg.length).toBeGreaterThan(0);
    for (const r of veg) expect(r.diets).toContain("vegetarian");
  });

  it("scores higher-ranked picks higher, and the top pick above a 5-star rating", () => {
    expect(rankBonus(1)).toBeGreaterThan(rankBonus(2));
    expect(rankBonus(10)).toBeGreaterThan(0);
    const r = RECIPES.find((x) => x.mealType === "main")!;
    const prefs = baseRequest().prefs;
    const top = preferenceFit(r, { ...prefs, rankings: { [r.id]: 1 } });
    const starred = preferenceFit(r, { ...prefs, ratings: { [r.id]: 5 } });
    expect(top.fit).toBeGreaterThan(starred.fit);
    expect(top.reasons[0]).toBe("your top pick");
  });

  it("puts the person's top lunch-and-dinner picks in the week", () => {
    const base = baseRequest();
    const unranked = plan(base, highs);
    const mainsBefore = new Set(unranked.recipes.filter((p) => p.slot === "main").map((p) => p.recipe.id));
    // rank options the plan didn't already choose, to show the ranking is what moves them in
    const picks = rankingChoices("main", base.prefs).filter((r) => !mainsBefore.has(r.id)).slice(0, 3).map((r) => r.id);
    const rankings = Object.fromEntries(picks.map((id, i) => [id, i + 1]));
    const r = plan({ ...base, prefs: { ...base.prefs, rankings }, timeLimit: 6 }, highs);
    expect(r.status).not.toBe("no_recipes");
    const chosen = r.recipes.filter((p) => p.slot === "main").map((p) => p.recipe.id);
    expect(chosen.some((id) => picks.includes(id)), JSON.stringify({ picks, chosen })).toBe(true);
  });
});
