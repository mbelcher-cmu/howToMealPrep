import { RECIPES_BY_ID } from "./recipes";
import type { Recipe } from "./recipe-types";

/**
 * Featured meal preps: four recipes that make a full day (breakfast, two mains, a snack) and prep together
 * in one session. Hand-picked for now; once accounts exist these can be ranked by community ratings.
 */
export interface PrepPack { id: string; name: string; tagline: string; tags: string[]; breakfast: string; mains: [string, string]; snack: string }

export const PREP_PACKS: PrepPack[] = [
  { id: "chicken-rice", name: "Chicken and rice classic", tagline: "The gym-bro staple, with enough sauce to stay interesting.", tags: ["High protein", "Gluten-free options"], breakfast: "egg_muffins", mains: ["chicken_burrito_bowls", "garlic_soy_chicken"], snack: "yogurt_cups" },
  { id: "lean-cut", name: "Lean cut", tagline: "Big volume and lots of protein for a calorie deficit.", tags: ["High protein", "Lower calorie"], breakfast: "egg_muffins", mains: ["steak_broccoli", "white_chicken_chili"], snack: "cottage_cucumber" },
  { id: "budget-veg", name: "Budget vegetarian", tagline: "Lentils and oats do the heavy lifting for a few dollars a day.", tags: ["Vegetarian", "Cheap"], breakfast: "overnight_oats", mains: ["lentil_chili", "red_lentil_dal"], snack: "edamame_cups" },
  { id: "plant-power", name: "Plant-powered", tagline: "Fully vegan and still past 120 g of protein.", tags: ["Vegan", "High protein"], breakfast: "tofu_scramble_wraps", mains: ["gochujang_tofu", "chickpea_curry"], snack: "edamame_cups" },
  { id: "pittsburgh", name: "Pittsburgh comfort", tagline: "Fries on the salad, pierogies in the skillet. Prepped, though.", tags: ["Comfort food", "Local favorite"], breakfast: "bacon_potato_bowls", mains: ["pittsburgh_salad", "pierogi_skillet"], snack: "turkey_rollups" },
  { id: "mediterranean", name: "Mediterranean week", tagline: "Sheet pans, herbs and hummus. Bright food that keeps well.", tags: ["Fresh", "Whole foods"], breakfast: "shakshuka", mains: ["greek_sheet_pan", "turkey_meatball_bowls"], snack: "eggs_hummus" },
  { id: "takeout-fakeout", name: "Takeout fake-out", tagline: "Your usual order, made for a fraction of the delivery fee.", tags: ["Asian flavors", "High protein"], breakfast: "turkey_hash", mains: ["korean_beef_bowls", "chicken_lo_mein"], snack: "edamame_cups" },
  { id: "low-carb", name: "Low carb", tagline: "Keto-friendly mains and snacks without missing the flavor.", tags: ["Low carb", "Keto-friendly"], breakfast: "egg_muffins", mains: ["egg_roll_bowl", "steak_broccoli"], snack: "turkey_rollups" },
  { id: "seafood", name: "Seafood week", tagline: "Salmon bowls and garlicky shrimp, ready in under an hour of cooking.", tags: ["Pescatarian", "Omega-3s"], breakfast: "cottage_bowls", mains: ["salmon_rice_bowls", "shrimp_scampi"], snack: "yogurt_cups" },
];

export function packRecipes(p: PrepPack): Recipe[] {
  return [p.breakfast, ...p.mains, p.snack].map((id) => RECIPES_BY_ID[id]).filter((r): r is Recipe => !!r);
}

/** One day of the pack: a serving of each recipe. */
export function packDay(p: PrepPack) {
  const rs = packRecipes(p);
  const sum = (k: "kcal" | "protein" | "carbs" | "fat") => Math.round(rs.reduce((a, r) => a + r.perServing[k], 0));
  return { kcal: sum("kcal"), protein: sum("protein"), carbs: sum("carbs"), fat: sum("fat"), activeMinutes: rs.reduce((a, r) => a + r.activeMinutes, 0) };
}
