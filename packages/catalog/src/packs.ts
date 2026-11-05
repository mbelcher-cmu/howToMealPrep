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
  { id: "high-protein-veg", name: "High-protein vegetarian", tagline: "Tofu, eggs and Greek yogurt get a meatless day past 130 g of protein.", tags: ["Vegetarian", "High protein"], breakfast: "mango_chia_pudding", mains: ["veg_mapo_tofu", "tofu_bibimbap"], snack: "cottage_veggie_dip" },
  { id: "vegan-budget", name: "Vegan on a budget", tagline: "Beans, potatoes and spices. Hearty, cheap and fully plant-based.", tags: ["Vegan", "Cheap"], breakfast: "tofu_chickpea_hash", mains: ["red_beans_rice", "aloo_gobi_chana"], snack: "roasted_chickpeas" },
  { id: "keto", name: "Keto week", tagline: "Blackened chicken, cauliflower everything, and snacks that keep carbs near zero.", tags: ["Keto-friendly", "Low carb"], breakfast: "spinach_mushroom_frittata", mains: ["blackened_chicken_cauli", "cauli_burrito_bowls"], snack: "deviled_eggs" },
  { id: "grab-and-go", name: "Grab and go", tagline: "Sandwiches, pitas and a pasta salad. Everything travels and most of it eats cold.", tags: ["Easy to pack", "High protein"], breakfast: "breakfast_sandwiches", mains: ["chicken_caesar_pasta_salad", "beef_kofta_pitas"], snack: "tuna_cucumber_bites" },
  { id: "big-salads", name: "Big salad week", tagline: "Crunchy, filling salads with real protein, dressed the day you eat them.", tags: ["Fresh", "No reheating"], breakfast: "mango_chia_pudding", mains: ["greek_chicken_salad", "french_lentil_salad"], snack: "tuna_cucumber_bites" },
  { id: "one-pan", name: "One-pan week", tagline: "Two sheet-pan dinners and egg bites. Fewer dishes, same macros.", tags: ["One pan", "Less cleanup"], breakfast: "spinach_feta_egg_bites", mains: ["chicken_provencal", "spanish_garlic_shrimp"], snack: "yogurt_berry_bark" },
  { id: "comfort-classics", name: "Sunday comfort", tagline: "Meatloaf and mash, butter chicken and a skillet breakfast, all portioned.", tags: ["Comfort food", "High protein"], breakfast: "farmers_breakfast", mains: ["turkey_meatloaf", "butter_chicken"], snack: "deviled_eggs" },
  { id: "world-tour", name: "Around the world", tagline: "Congee, nasi goreng, Turkish eggplant stew and onigiri. A passport week.", tags: ["Adventurous", "Bold flavors"], breakfast: "chicken_congee", mains: ["nasi_goreng", "turkish_eggplant_chickpeas"], snack: "tuna_onigiri" },
  { id: "west-african", name: "West African spice", tagline: "Smoky jollof rice and a creamy peanut stew that tastes better on day three.", tags: ["Bold flavors", "Freezer-friendly"], breakfast: "plantain_bean_bowls", mains: ["jollof_chicken", "peanut_stew"], snack: "roasted_chickpeas" },
  { id: "meatless-mexican", name: "Meatless Mexican", tagline: "Chilaquiles, enchiladas and stuffed peppers with plenty of cheese and beans.", tags: ["Vegetarian", "Comfort food"], breakfast: "chilaquiles_bake", mains: ["black_bean_enchiladas", "quinoa_stuffed_peppers"], snack: "mango_lassi_cups" },
  { id: "hands-off", name: "Set it and forget it", tagline: "Slow-cooker pork, a pot of chili and no-cook breakfasts and snacks.", tags: ["Hands-off", "Slow cooker"], breakfast: "overnight_oats", mains: ["kalua_pork_bowls", "white_chicken_chili"], snack: "yogurt_cups" },
  { id: "plant-world", name: "Veggie world tour", tagline: "Gado-gado, falafel pitas and Jamaican curried chickpeas.", tags: ["Vegetarian", "Fiber-rich"], breakfast: "tofu_bhurji", mains: ["gado_gado", "baked_falafel_pitas"], snack: "hummus_snack_box" },
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
