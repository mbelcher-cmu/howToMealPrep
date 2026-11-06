import { describe, expect, it } from "vitest";
import { RECIPES, type Recipe } from "@prep-cart/catalog";
import { buildTasteModel, communityFromRatings, contentSimilarity, recommend, tasteModelFor, tastePredict, tasteWeights, topEigen } from "../src";

const mains = RECIPES.filter((r) => r.mealType === "main" && !r.id.startsWith("custom_"));

describe("hidden taste factors", () => {
  it("finds the eigenvectors of a small symmetric matrix", () => {
    const m = [[2, 1, 0], [1, 2, 0], [0, 0, 0.5]].map((r) => Float64Array.from(r));
    const { values, vectors } = topEigen(m, 2);
    expect(values[0]).toBeCloseTo(3, 4);
    expect(values[1]).toBeCloseTo(1, 4);
    expect(Math.abs(vectors[0]![0]!)).toBeCloseTo(Math.SQRT1_2, 3);
  });

  it("recovers two taste camps from pooled numbers alone, with recipe traits switched off", () => {
    const six = mains.slice(0, 6);
    const [a1, a2, a3, b1, b2, b3] = six.map((r) => r.id) as [string, string, string, string, string, string];
    const rows: { user: string; recipe: string; stars: number }[] = [];
    for (let u = 0; u < 20; u++) {
      const likesA = u % 2 === 0;
      for (const id of [a1, a2, a3]) rows.push({ user: `u${u}`, recipe: id, stars: likesA ? 5 : 2 });
      for (const id of [b1, b2, b3]) rows.push({ user: `u${u}`, recipe: id, stars: likesA ? 2 : 5 });
    }
    const community = communityFromRatings(rows);
    const model = buildTasteModel(six, community.neighbors, () => 0);
    const w = tasteWeights(model, { [a1]: 0.8 });
    expect(tastePredict(model, w, a2)).toBeGreaterThan(0.25);
    expect(tastePredict(model, w, a3)).toBeGreaterThan(0.25);
    expect(tastePredict(model, w, b2)).toBeLessThan(-0.25);
    expect(model.communityShare).toBe(1);
  });

  it("handles sparse data: with no community yet, recipe traits stand in", () => {
    const model = tasteModelFor(null);
    expect(model.strength.length).toBeGreaterThan(2);
    expect(model.communityShare).toBe(0);
    const mex = mains.filter((r) => r.cuisines.includes("mexican"));
    const w = tasteWeights(model, { [mex[0]!.id]: 1, [mex[1]!.id]: 1 });
    const unrelated = mains.filter((r) => contentSimilarity(r, mex[0]!) < 0.05);
    const avg = (rs: Recipe[]) => rs.reduce((t, r) => t + tastePredict(model, w, r.id), 0) / rs.length;
    expect(avg(mex.slice(2))).toBeGreaterThan(avg(unrelated));
  });

  it("feeds the blended recommendations", () => {
    const mex = mains.filter((r) => r.cuisines.includes("mexican"));
    const recs = recommend({ [mex[0]!.id]: 5 });
    expect(recs[mex[1]!.id]!.affinity).toBeGreaterThan(0);
  });
});
