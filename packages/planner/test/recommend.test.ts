import { describe, expect, it } from "vitest";
import { RECIPES, type Recipe } from "@prep-cart/catalog";
import { communityFromRatings, contentSimilarity, matchPercent, plan, preferenceFit, recommend, topPicks } from "../src";
import { baseRequest, highsPromise } from "./fixtures";

const mains = RECIPES.filter((r) => r.mealType === "main" && !r.id.startsWith("custom_"));
const byCuisine = (c: string) => mains.filter((r) => r.cuisines.includes(c as never));

describe("recipe recommendations", async () => {
  const highs = await highsPromise;

  it("rates a recipe most like itself and like-for-like recipes above unrelated ones", () => {
    const [m1, m2] = byCuisine("mexican");
    const other = mains.find((r) => !r.cuisines.some((c) => m1!.cuisines.includes(c)) && !r.proteins.some((p) => m1!.proteins.includes(p)))!;
    expect(contentSimilarity(m1!, m1!)).toBe(1);
    expect(contentSimilarity(m1!, m2!)).toBeGreaterThan(contentSimilarity(m1!, other));
    expect(contentSimilarity(m1!, m2!)).toBe(contentSimilarity(m2!, m1!));
  });

  it("gives nothing before any ratings, and never re-recommends a rated recipe", () => {
    expect(recommend({})).toEqual({});
    const liked = byCuisine("mexican")[0]!;
    const recs = recommend({ [liked.id]: 5 });
    expect(recs[liked.id]).toBeUndefined();
    expect(Object.keys(recs).length).toBeGreaterThan(5);
  });

  it("from your own ratings alone, leans toward what you loved and away from what you didn't", () => {
    const mex = byCuisine("mexican");
    const ind = byCuisine("indian");
    expect(mex.length).toBeGreaterThanOrEqual(3);
    expect(ind.length).toBeGreaterThanOrEqual(3);
    const recs = recommend({ [mex[0]!.id]: 5, [mex[1]!.id]: 5, [ind[0]!.id]: 2, [ind[1]!.id]: 1 });
    const mexNew = mex.slice(2).filter((r) => !r.cuisines.includes("indian"));
    const indNew = ind.slice(2).filter((r) => !r.cuisines.includes("mexican"));
    const avg = (rs: Recipe[]) => rs.reduce((t, r) => t + (recs[r.id]?.affinity ?? 0), 0) / rs.length;
    expect(avg(mexNew)).toBeGreaterThan(0.1);
    expect(avg(indNew)).toBeLessThan(0);
    const best = recs[mexNew[0]!.id]!;
    expect([mex[0]!.id, mex[1]!.id]).toContain(best.because);
    expect(best.match).toBeGreaterThan(50);
  });

  it("learns from people with the same taste even when the recipes look nothing alike", () => {
    // two camps: one loves A1..A3 and dislikes B1..B3, the other the reverse. The recipes are picked
    // to share no cuisine or protein, so only the community can link them.
    const picked: Recipe[] = [];
    for (const r of mains) {
      if (picked.every((p) => !p.cuisines.some((c) => r.cuisines.includes(c)) && !p.proteins.some((x) => r.proteins.includes(x)))) picked.push(r);
      if (picked.length === 6) break;
    }
    expect(picked).toHaveLength(6);
    const [a1, a2, a3, b1, b2, b3] = picked.map((r) => r.id) as [string, string, string, string, string, string];
    const rows: { user: string; recipe: string; stars: number }[] = [];
    for (let u = 0; u < 12; u++) {
      const likesA = u % 2 === 0;
      for (const id of [a1, a2, a3]) rows.push({ user: `u${u}`, recipe: id, stars: likesA ? 5 : 2 });
      for (const id of [b1, b2, b3]) rows.push({ user: `u${u}`, recipe: id, stars: likesA ? 2 : 5 });
    }
    const community = communityFromRatings(rows);
    expect(community.neighbors.find((n) => [n.a, n.b].sort().join() === [a1, a2].sort().join())!.sim).toBeCloseTo(1, 5);
    // someone new who rated two recipes from camp A
    const recs = recommend({ [a1]: 5, [b1]: 2 }, community);
    expect(recs[a2]!.affinity).toBeGreaterThan(0.3);
    expect(recs[b2]!.affinity).toBeLessThan(-0.3);
    expect(recs[a2]!.source).toBe("community");
    expect(recs[a2]!.because).toBe(a1);
    const picks = topPicks(recs, 5).map((p) => p.id);
    expect(picks.slice(0, 2).sort()).toEqual([a2, a3].sort());
  });

  it("keeps any one person's ratings out of the community numbers", () => {
    const [x, y] = mains;
    const two = communityFromRatings([
      { user: "u1", recipe: x!.id, stars: 5 }, { user: "u1", recipe: y!.id, stars: 1 },
      { user: "u2", recipe: x!.id, stars: 4 }, { user: "u2", recipe: y!.id, stars: 2 },
    ]);
    expect(two.neighbors).toEqual([]);
    expect(two.stats).toEqual([]);
  });

  it("suggests well-loved recipes to someone with no ratings of their own", () => {
    const r = mains[3]!;
    const recs = recommend({}, { neighbors: [], stats: [{ id: r.id, avg: 4.8, n: 40 }] });
    expect(recs[r.id]!.affinity).toBeGreaterThan(0.2);
    expect(recs[r.id]!.source).toBe("popular");
    expect(recs[r.id]!.because).toBeUndefined();
  });

  it("maps affinity to a Netflix-style match", () => {
    expect(matchPercent(0)).toBe(50);
    expect(matchPercent(1)).toBe(99);
    expect(matchPercent(-1)).toBe(1);
  });

  it("scores a strong recommendation like a 5-star rating and says why", () => {
    const [liked, other] = byCuisine("mexican");
    const prefs = baseRequest().prefs;
    const plain = preferenceFit(other!, prefs);
    const fit = preferenceFit(other!, { ...prefs, recommended: { [other!.id]: { affinity: 1, because: liked!.id } } });
    expect(fit.fit - plain.fit).toBeCloseTo(2, 5);
    expect(fit.reasons[0]).toBe(`because you liked ${liked!.name}`);
    // your own rating wins over a prediction
    const rated = preferenceFit(other!, { ...prefs, ratings: { [other!.id]: 4 }, recommended: { [other!.id]: { affinity: 1 } } });
    expect(rated.reasons[0]).toBe("you rated it 4 stars");
  });

  it("brings recommended recipes into the week", () => {
    const base = baseRequest();
    const before = plan(base, highs);
    const inPlan = new Set(before.recipes.map((p) => p.recipe.id));
    const outside = mains.filter((r) => !inPlan.has(r.id)).slice(0, 12);
    const recommended = Object.fromEntries(outside.map((r) => [r.id, { affinity: 1 }]));
    const after = plan({ ...base, prefs: { ...base.prefs, recommended }, timeLimit: 6 }, highs);
    expect(after.status).not.toBe("no_recipes");
    expect(after.recipes.some((p) => recommended[p.recipe.id])).toBe(true);
  });
});
