import { INGREDIENTS, type Aisle, type Recipe } from "@prep-cart/catalog";

/**
 * Food images. For now every item and recipe uses a 3D food illustration (Microsoft Fluent Emoji, MIT),
 * served from /food/<code>.webp. A real product photo replaces the illustration wherever one is known:
 * add it to PHOTOS (or, later, pass the photo a store's product feed returns) and every screen picks it up.
 */
export interface FoodImage { src: string; alt: string; kind: "illustration" | "photo" }

const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const art = (code: string) => `${BASE}/food/${code}.webp`;

/** ingredient id → real product photo URL. Empty until store product images are connected. */
export const PHOTOS: Record<string, string> = {};

const ITEM_ART: Record<string, string> = {
  chicken_breast: "1f357", chicken_thigh: "1f357", ground_chicken: "1f357", ground_turkey: "1f983", deli_turkey: "1f96a", chicken_sausage: "1f32d",
  ground_beef: "1f969", sirloin: "1f969", pork_tenderloin: "1f969", ground_pork: "1f969", bacon: "1f953",
  salmon: "1f41f", cod: "1f41f", tilapia: "1f41f", tuna: "1f96b", shrimp: "1f990",
  eggs: "1f95a", egg_whites: "1f95a", greek_yogurt: "1f963", cottage_cheese: "1f963", sour_cream: "1f963", milk: "1f95b",
  cheddar: "1f9c0", mozzarella: "1f9c0", feta: "1f9c0", parmesan: "1f9c0", string_cheese: "1f9c0", butter: "1f9c8",
  tofu: "1f9c8", tempeh: "1fad8", edamame: "1fadb", black_beans: "1fad8", chickpeas: "1fad8", pinto_beans: "1fad8", kidney_beans: "1fad8", lentils: "1fad8", red_lentils: "1fad8",
  rice: "1f35a", jasmine_rice: "1f35a", brown_rice: "1f35a", oats: "1f963", granola: "1f963", quinoa: "1f33e", couscous: "1f33e",
  pasta: "1f35d", pasta_white: "1f35d", egg_noodles: "1f35c", rice_noodles: "1f35c",
  tortillas: "1fad3", corn_tortillas: "1fad3", pita: "1fad3", bread: "1f35e", potatoes: "1f954", sweet_potato: "1f360", pierogies: "1f95f",
  broccoli: "1f966", green_beans: "1fadb", stirfry_veg: "1f966", corn: "1f33d", peas: "1fadb", berries: "1fad0",
  spinach: "1f96c", kale: "1f96c", lettuce: "1f96c", coleslaw_mix: "1f957", bell_pepper: "1fad1", onion: "1f9c5", garlic: "1f9c4", ginger: "1fada",
  green_onion: "1f33f", cilantro: "1f33f", limes: "1f34b", lemons: "1f34b", carrots: "1f955", cucumber: "1f952", tomatoes: "1f345", zucchini: "1f952",
  mushrooms: "1f344", bananas: "1f34c", apples: "1f34e", avocado: "1f951", pineapple: "1f34d",
  diced_tomatoes: "1f96b", marinara: "1f345", salsa: "1f336", enchilada_sauce: "1f336", coconut_milk: "1f965", curry_paste: "1f35b",
  chicken_broth: "1f96b", veg_broth: "1f96b", hummus: "1fad8", pesto: "1f33f", soy_sauce: "1f376", teriyaki_sauce: "1f376", gochujang: "1f336",
  bbq_sauce: "1f96b", honey: "1f36f", taco_seasoning: "1f9c2", peanut_butter: "1f95c", almonds: "1f95c", olive_oil: "1fad2", sesame_oil: "1fad2",
  pork_chops: "1f356", ricotta: "1f9c0", cannellini: "1fad8", refried_beans: "1fad8", english_muffins: "1f35e", cabbage: "1f96c",
  cauliflower: "1f966", cauliflower_rice: "1f966", frozen_spinach: "1f96c", eggplant: "1f346", plantains: "1f34c", parsley: "1f33f",
  mango: "1f96d", sauerkraut: "1fad9", chia: "1fad9", cashews: "1f95c",
};
const AISLE_ART: Record<Aisle, string> = {
  Produce: "1f96c", "Meat and seafood": "1f969", "Dairy and eggs": "1f95b", Bakery: "1f35e", "Grains and pasta": "1f33e",
  "Canned and jarred": "1f96b", "Sauces and condiments": "1f96b", "Oils and nuts": "1fad2", Frozen: "1f9ca", Deli: "1f96a",
};

export function itemImage(ingredientId: string): FoodImage {
  const ing = INGREDIENTS[ingredientId];
  const name = ing?.name ?? ingredientId;
  if (PHOTOS[ingredientId]) return { src: PHOTOS[ingredientId], alt: name, kind: "photo" };
  return { src: art(ITEM_ART[ingredientId] ?? (ing ? AISLE_ART[ing.aisle] : "1f6d2")), alt: "", kind: "illustration" };
}

// only dishes whose illustration reads clearly; everything else shows its main ingredient
const DISH_RULES: [RegExp, string][] = [
  [/falafel/i, "1f9c6"], [/overnight|chia|parfait/i, "1fad9"], [/onigiri|rice ball/i, "1f359"],
  [/soup|stew|chili\b|gumbo|stroganoff|goulash|lentils|congee|pho\b/i, "1f372"], [/curry|curried|masala|\bdal\b|tikka|korma|butter chicken|aloo gobi/i, "1f35b"], [/pasta|spaghetti|penne|ziti|lasagna|\bmac\b|alfredo|orzo/i, "1f35d"],
  [/noodle|ramen|lo mein|pad thai|soba|udon/i, "1f35c"], [/taco/i, "1f32e"], [/burrito|wrap|quesadilla|enchilada/i, "1f32f"], [/salad|slaw/i, "1f957"],
  [/oat|porridge/i, "1f963"], [/waffle/i, "1f9c7"], [/pancake|french toast/i, "1f95e"], [/fried rice|nasi goreng|jollof|mujadara/i, "1f35a"], [/pork chop|schnitzel/i, "1f356"], [/eggplant/i, "1f346"], [/frittata|omelet|scramble|shakshuka|egg muffin|egg bowl|, egg/i, "1f373"],
  [/sandwich|\bsub\b|panini/i, "1f96a"], [/pizza|flatbread/i, "1f355"], [/burger|slider/i, "1f354"], [/stir.?fry|fajita/i, "1f958"],
  [/sushi|poke/i, "1f363"], [/dumpling|pierog/i, "1f95f"], [/kebab|skewer|souvlaki/i, "1f362"], [/pita|gyro|kofta/i, "1f959"], [/smoothie|shake/i, "1f964"],
];

/** The dish illustration for a recipe (or its main protein), plus two prominent ingredients as small badges. */
export function recipeImage(r: Recipe): FoodImage & { badges: FoodImage[] } {
  const photo = PHOTOS[`recipe:${r.id}`];
  const byWeight = [...r.lines].sort((a, b) => b.grams - a.grams).map((l) => l.ingredientId).filter((id) => ITEM_ART[id]);
  const protein = [...r.lines].filter((l) => ITEM_ART[l.ingredientId]).sort((a, b) => b.grams * (INGREDIENTS[b.ingredientId]?.per100g.protein ?? 0) - a.grams * (INGREDIENTS[a.ingredientId]?.per100g.protein ?? 0))[0]?.ingredientId;
  const hero = DISH_RULES.find(([re]) => re.test(r.name))?.[1] ?? (protein ? ITEM_ART[protein]! : byWeight[0] ? ITEM_ART[byWeight[0]]! : "1f37d");
  const uniq = [...new Set(byWeight.map((id) => ITEM_ART[id]!))].filter((c) => c !== hero).slice(0, 2);
  return { src: photo ?? art(hero), alt: "", kind: photo ? "photo" : "illustration", badges: uniq.map((c) => ({ src: art(c), alt: "", kind: "illustration" })) };
}

/** Every illustration code the app can show, for copying assets at build time. */
export const ART_CODES = [...new Set([...Object.values(ITEM_ART), ...Object.values(AISLE_ART), ...DISH_RULES.map(([, c]) => c), "1f37d", "1f6d2"])];
