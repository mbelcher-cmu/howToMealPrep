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
    if (p.tags.includes("Low carb")) for (const r of rs) expect(r.diets, r.id).toContain("lowCarb");
    if (p.tags.includes("Keto-friendly")) for (const r of rs) expect(r.diets, r.id).toContain("keto");
    if (p.tags.includes("Freezer-friendly")) for (const r of p.mains.map((id) => rs.find((x) => x.id === id)!)) expect(r.freezerFriendly, r.id).toBe(true);
    if (p.tags.includes("Slow cooker")) expect(rs.some((r) => r.equipment.includes("slowCooker")), p.id).toBe(true);
    if (p.tags.includes("One pan")) for (const id of p.mains) expect(rs.find((x) => x.id === id)!.moods, id).toContain("onePan");
  }
});
it("has no duplicate pack ids and uses each recipe set once", () => {
  expect(new Set(PREP_PACKS.map((p) => p.id)).size).toBe(PREP_PACKS.length);
  expect(new Set(PREP_PACKS.map((p) => [p.breakfast, ...p.mains, p.snack].join())).size).toBe(PREP_PACKS.length);
});
