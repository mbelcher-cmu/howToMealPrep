import { expect, it } from "vitest";
import { packDay, packRecipes, PREP_PACKS } from "../src";
it("every featured prep is a real breakfast, two mains and a snack that fit its tags", () => {
  for (const p of PREP_PACKS) {
    const rs = packRecipes(p);
    expect(rs.map((r) => r.mealType), p.id).toEqual(["breakfast", "main", "main", "snack"]);
    const d = packDay(p);
    expect(d.kcal).toBe(Math.round(rs.reduce((a, r) => a + r.perServing.kcal, 0)));
    if (p.tags.includes("Vegan")) for (const r of rs) expect(r.diets, r.id).toContain("vegan");
    if (p.tags.includes("Vegetarian")) for (const r of rs) expect(r.diets, r.id).toContain("vegetarian");
    if (p.tags.includes("Pescatarian")) for (const r of rs) expect(r.diets, r.id).toContain("pescatarian");
    if (p.tags.includes("High protein")) expect(d.protein, p.id).toBeGreaterThanOrEqual(120);
  }
});
