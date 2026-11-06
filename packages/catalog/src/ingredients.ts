import type { Allergen, Animal } from "./taxonomy";

/**
 * Canonical ingredients. Nutrition per 100 g as purchased (raw unless named otherwise), approximated
 * from USDA FoodData Central values. Calories are not stored: the app derives them as 4P + 4C + 9F so
 * every calorie figure agrees with its macros.
 *
 * Packages are typical sizes in Pittsburgh-area stores. Prices are estimates (Nov 2026) for the
 * proof of concept; live and receipt prices replace them later. null = the chain doesn't carry it.
 */
export type ChainId = "aldi" | "gianteagle" | "walmart" | "traderjoes" | "costco" | "samsclub";
/** Warehouse clubs: big packs, a membership, and one trip that covers several weeks. */
export const BULK_CHAINS: ReadonlySet<ChainId> = new Set<ChainId>(["costco", "samsclub"]);
export const isBulkChain = (c: ChainId) => BULK_CHAINS.has(c);

export interface Ingredient {
  id: string;
  name: string;
  aisle: Aisle;
  per100g: { protein: number; carbs: number; fat: number; fiber: number; sodiumMg: number };
  animal: Animal | null;
  allergens: Allergen[];
  /** containsGluten covers wheat plus barley and rye */
  gluten: boolean;
  pkg: { grams: number; label: string };
  /** the warehouse-club pack (Costco, Sam's Club), when they carry it; prices for it are in estPrice */
  bulkPkg?: { grams: number; label: string };
  estPrice: Record<ChainId, number | null>;
  /** weight of one natural unit (an egg, a tortilla, a can) for friendly display */
  each?: { grams: number; one: string; many: string };
  /** true for staples most kitchens keep (oil, soy sauce); pre-ticked in the pantry */
  staple?: boolean;
  /** how far the item is from its natural state; see Processing */
  processing: Processing;
}

/**
 * Processing level, loosely after the NOVA groups. "whole": as it grows or is raised, maybe frozen,
 * dried or cut (NOVA 1). "simple": a few recognizable ingredients made into a pantry food, such as
 * oil, cheese, canned beans, whole-grain bread or soy sauce (NOVA 2 and 3). "processed": what a
 * whole-foods eater skips, such as processed meats, refined grains, snack foods and sauces with added
 * sugar, starches or gums (NOVA 3 and 4). Whole foods plans use only the first two.
 */
export type Processing = "whole" | "simple" | "processed";
export const PROCESSING_LABELS: Record<Processing, string> = { whole: "Whole food", simple: "Simply made", processed: "Processed" };

export type Aisle = "Produce" | "Meat and seafood" | "Dairy and eggs" | "Bakery" | "Grains and pasta" | "Canned and jarred" | "Sauces and condiments" | "Oils and nuts" | "Frozen" | "Deli";

type Row = [
  name: string, aisle: Aisle, p: number, c: number, f: number, fiber: number, sodium: number,
  animal: Animal | "", allergens: string, pkgG: number, pkgLabel: string,
  prices: [aldi: number | null, gianteagle: number | null, walmart: number | null, traderjoes: number | null],
  each?: [grams: number, one: string, many: string], staple?: boolean,
];

const ROWS: Record<string, Row> = {
  // Poultry
  chicken_breast: ["Boneless skinless chicken breast", "Meat and seafood", 22.5, 0, 2.6, 0, 45, "poultry", "", 1361, "3 lb pack", [8.97, 11.97, 9.27, 13.47]],
  chicken_thigh: ["Boneless skinless chicken thighs", "Meat and seafood", 19, 0, 7.5, 0, 85, "poultry", "", 907, "2 lb pack", [5.98, 7.98, 6.27, 7.49]],
  ground_turkey: ["Ground turkey, 93% lean", "Meat and seafood", 18.7, 0, 8.3, 0, 70, "poultry", "", 454, "1 lb pack", [4.29, 5.99, 4.48, 4.99]],
  ground_chicken: ["Ground chicken", "Meat and seafood", 17.4, 0, 8.1, 0, 60, "poultry", "", 454, "1 lb pack", [3.99, 5.49, 4.24, 4.49]],
  chicken_sausage: ["Cooked chicken sausage", "Meat and seafood", 14, 4, 9, 0, 700, "poultry", "", 340, "12 oz pack", [3.49, 5.49, 3.97, 3.99], [85, "link", "links"]],
  deli_turkey: ["Sliced deli turkey", "Deli", 17, 2, 1.5, 0, 1000, "poultry", "", 255, "9 oz pack", [2.99, 4.99, 3.27, 3.99]],
  // Beef and pork
  ground_beef: ["Ground beef, 90% lean", "Meat and seafood", 20, 0, 10, 0, 66, "beef", "", 454, "1 lb pack", [5.49, 6.99, 5.97, 6.49]],
  sirloin: ["Top sirloin steak", "Meat and seafood", 21, 0, 6, 0, 55, "beef", "", 454, "1 lb pack", [7.99, 9.99, 8.47, 9.99]],
  pork_tenderloin: ["Pork tenderloin", "Meat and seafood", 21, 0, 3.5, 0, 50, "pork", "", 567, "1.25 lb pack", [4.49, 6.49, 5.12, 5.99]],
  ground_pork: ["Ground pork", "Meat and seafood", 17, 0, 21, 0, 56, "pork", "", 454, "1 lb pack", [3.99, 4.99, 3.97, 4.49]],
  bacon: ["Bacon", "Meat and seafood", 12, 1.4, 42, 0, 800, "pork", "", 340, "12 oz pack", [4.49, 6.49, 4.97, 5.49]],
  // Fish and seafood
  salmon: ["Frozen salmon fillets", "Frozen", 20, 0, 13, 0, 59, "fish", "fish", 454, "1 lb bag", [7.49, 9.99, 7.97, 8.99]],
  cod: ["Frozen cod fillets", "Frozen", 18, 0, 0.7, 0, 54, "fish", "fish", 454, "1 lb bag", [6.49, 8.99, 6.47, 7.99]],
  tilapia: ["Frozen tilapia fillets", "Frozen", 20, 0, 1.7, 0, 52, "fish", "fish", 454, "1 lb bag", [4.99, 6.99, 4.97, 5.99]],
  tuna: ["Canned chunk light tuna in water", "Canned and jarred", 25.5, 0, 0.8, 0, 250, "fish", "fish", 142, "5 oz can", [1.09, 1.49, 0.98, 1.29], [142, "can", "cans"]],
  shrimp: ["Frozen raw shrimp, peeled", "Frozen", 20, 0, 0.5, 0, 119, "shellfish", "shellfish", 454, "1 lb bag", [6.99, 9.99, 6.97, 8.99]],
  // Eggs and dairy
  eggs: ["Large eggs", "Dairy and eggs", 12.6, 0.7, 9.5, 0, 142, "egg", "egg", 600, "1 dozen", [2.79, 3.49, 2.97, 3.29], [50, "egg", "eggs"]],
  egg_whites: ["Liquid egg whites", "Dairy and eggs", 11, 0.7, 0.2, 0, 166, "egg", "egg", 454, "16 oz carton", [2.79, 3.99, 2.98, 3.49]],
  greek_yogurt: ["Plain nonfat Greek yogurt", "Dairy and eggs", 10.3, 3.6, 0.4, 0, 36, "dairy", "milk", 907, "32 oz tub", [3.99, 5.49, 4.47, 4.99]],
  cottage_cheese: ["Low-fat cottage cheese", "Dairy and eggs", 11, 4.3, 2.3, 0, 360, "dairy", "milk", 680, "24 oz tub", [2.99, 3.99, 3.27, 3.49]],
  milk: ["2% milk", "Dairy and eggs", 3.3, 4.8, 2, 0, 44, "dairy", "milk", 3785, "1 gallon", [2.89, 3.69, 3.12, 3.79]],
  cheddar: ["Shredded cheddar", "Dairy and eggs", 23, 3.1, 33, 0, 620, "dairy", "milk", 227, "8 oz bag", [2.19, 3.49, 2.42, 3.49]],
  mozzarella: ["Shredded part-skim mozzarella", "Dairy and eggs", 24, 2.8, 16, 0, 620, "dairy", "milk", 227, "8 oz bag", [2.19, 3.29, 2.42, 3.29]],
  feta: ["Crumbled feta", "Dairy and eggs", 14, 4, 21, 0, 1100, "dairy", "milk", 170, "6 oz tub", [2.49, 3.99, 2.98, 3.49]],
  parmesan: ["Grated parmesan", "Dairy and eggs", 35, 3.2, 26, 0, 1600, "dairy", "milk", 142, "5 oz tub", [2.49, 4.49, 2.98, 3.99]],
  string_cheese: ["Part-skim string cheese", "Dairy and eggs", 25, 3, 16, 0, 700, "dairy", "milk", 336, "12 count", [3.99, 5.49, 4.24, 4.49], [28, "stick", "sticks"]],
  butter: ["Butter", "Dairy and eggs", 0.9, 0.1, 81, 0, 11, "dairy", "milk", 454, "1 lb", [3.49, 4.99, 3.84, 4.49], undefined, true],
  sour_cream: ["Light sour cream", "Dairy and eggs", 7, 7, 6, 0, 70, "dairy", "milk", 454, "16 oz tub", [1.69, 2.79, 1.88, 2.49]],
  // Plant proteins
  tofu: ["Extra-firm tofu", "Produce", 17.3, 2.8, 8.7, 2, 14, "", "soy", 397, "14 oz block", [1.99, 2.79, 2.12, 2.29], [397, "block", "blocks"]],
  tempeh: ["Tempeh", "Produce", 20, 7.6, 11, 5, 9, "", "soy", 227, "8 oz pack", [null, 3.99, 3.48, 2.29]],
  edamame: ["Frozen shelled edamame", "Frozen", 11.9, 8.9, 5.2, 5.2, 6, "", "soy", 340, "12 oz bag", [1.99, 2.99, 2.18, 2.49]],
  black_beans: ["Canned black beans", "Canned and jarred", 8.9, 23.7, 0.5, 8.7, 240, "", "", 255, "15 oz can (drained)", [0.79, 1.19, 0.82, 0.99], [255, "can", "cans"]],
  chickpeas: ["Canned chickpeas", "Canned and jarred", 8.9, 27.4, 2.6, 7.6, 240, "", "", 255, "15 oz can (drained)", [0.79, 1.29, 0.84, 0.99], [255, "can", "cans"]],
  pinto_beans: ["Canned pinto beans", "Canned and jarred", 9, 26, 0.6, 9, 240, "", "", 255, "15 oz can (drained)", [0.79, 1.19, 0.82, 0.99], [255, "can", "cans"]],
  kidney_beans: ["Canned kidney beans", "Canned and jarred", 8.7, 22.8, 0.5, 7.4, 240, "", "", 255, "15 oz can (drained)", [0.79, 1.19, 0.82, 0.99], [255, "can", "cans"]],
  lentils: ["Dry green lentils", "Grains and pasta", 24.6, 63, 1.1, 10.7, 6, "", "", 454, "1 lb bag", [1.49, 2.29, 1.38, 2.49]],
  red_lentils: ["Dry red lentils", "Grains and pasta", 24, 60, 1.3, 11, 7, "", "", 454, "1 lb bag", [null, 2.49, 1.98, null]],
  // Grains, bread, starches
  rice: ["Long-grain white rice", "Grains and pasta", 7.1, 80, 0.7, 1.3, 5, "", "", 907, "2 lb bag", [1.79, 2.49, 1.92, 2.49]],
  jasmine_rice: ["Jasmine rice", "Grains and pasta", 7, 79, 0.6, 1, 5, "", "", 907, "2 lb bag", [2.49, 3.49, 2.47, 2.99]],
  brown_rice: ["Brown rice", "Grains and pasta", 7.5, 76, 2.7, 3.4, 7, "", "", 907, "2 lb bag", [1.99, 2.79, 2.17, 2.99]],
  oats: ["Old-fashioned rolled oats", "Grains and pasta", 13, 68, 6.5, 10, 6, "", "", 1190, "42 oz canister", [3.29, 4.99, 3.64, 3.99]],
  pasta: ["Whole wheat pasta", "Grains and pasta", 14, 72, 2.5, 8, 6, "", "wheat", 454, "1 lb box", [1.29, 1.99, 1.34, 1.49]],
  pasta_white: ["Pasta", "Grains and pasta", 13, 75, 1.5, 3, 6, "", "wheat", 454, "1 lb box", [0.95, 1.49, 1.08, 0.99]],
  egg_noodles: ["Egg noodles", "Grains and pasta", 14, 71, 4.4, 3, 21, "egg", "wheat,egg", 340, "12 oz bag", [1.29, 1.99, 1.42, null]],
  rice_noodles: ["Rice noodles", "Grains and pasta", 6, 80, 0.6, 1.6, 180, "", "", 397, "14 oz pack", [null, 2.99, 2.48, 1.99]],
  quinoa: ["Quinoa", "Grains and pasta", 14.1, 64, 6.1, 7, 5, "", "", 454, "1 lb bag", [3.49, 4.99, 3.68, 3.99]],
  couscous: ["Couscous", "Grains and pasta", 12.8, 77, 0.6, 5, 10, "", "wheat", 283, "10 oz box", [1.79, 2.99, 1.98, 1.99]],
  tortillas: ["Whole wheat tortillas", "Bakery", 8, 48, 7, 6, 600, "", "wheat", 360, "8 count", [1.99, 3.29, 2.28, 2.49], [45, "tortilla", "tortillas"]],
  corn_tortillas: ["Corn tortillas", "Bakery", 5.7, 45, 2.9, 6.3, 45, "", "", 780, "30 count", [1.99, 2.99, 2.18, 2.49], [26, "tortilla", "tortillas"]],
  pita: ["Whole wheat pita", "Bakery", 9.8, 55, 1.7, 7.4, 500, "", "wheat", 340, "6 count", [1.99, 2.99, 2.24, 1.99], [57, "pita", "pitas"]],
  bread: ["Whole wheat bread", "Bakery", 13, 41, 3.4, 6, 450, "", "wheat", 567, "20 oz loaf", [1.49, 2.99, 1.68, 2.99], [28, "slice", "slices"]],
  potatoes: ["Russet potatoes", "Produce", 2, 17.5, 0.1, 2.2, 5, "", "", 2268, "5 lb bag", [3.49, 4.99, 3.97, 4.49]],
  sweet_potato: ["Sweet potatoes", "Produce", 1.6, 20, 0.1, 3, 55, "", "", 1361, "3 lb bag", [2.99, 3.99, 3.47, 3.99]],
  pierogies: ["Frozen potato and cheese pierogies", "Frozen", 6, 33, 5, 1.5, 400, "dairy", "wheat,milk", 454, "16 oz box", [2.49, 3.49, 2.62, null], [38, "pierogi", "pierogies"]],
  granola: ["Granola", "Grains and pasta", 10, 64, 20, 7, 30, "", "wheat,treenut", 340, "12 oz bag", [2.29, 3.99, 2.68, 3.49]],
  // Vegetables and fruit
  broccoli: ["Frozen broccoli florets", "Frozen", 2.8, 7, 0.4, 2.6, 30, "", "", 340, "12 oz bag", [1.15, 1.99, 1.08, 1.99]],
  green_beans: ["Frozen green beans", "Frozen", 1.8, 7, 0.1, 3, 6, "", "", 340, "12 oz bag", [1.09, 1.79, 1.08, 1.99]],
  stirfry_veg: ["Frozen stir-fry vegetables", "Frozen", 1.5, 6.5, 0.2, 2.2, 30, "", "", 454, "16 oz bag", [1.29, 2.29, 1.38, 1.99]],
  corn: ["Frozen sweet corn", "Frozen", 2.7, 18, 1, 2, 3, "", "", 340, "12 oz bag", [0.99, 1.79, 1.08, 1.49]],
  peas: ["Frozen peas", "Frozen", 5.4, 14, 0.4, 5, 108, "", "", 340, "12 oz bag", [0.99, 1.79, 1.08, 1.49]],
  berries: ["Frozen mixed berries", "Frozen", 0.7, 12, 0.3, 3, 1, "", "", 454, "16 oz bag", [2.69, 3.99, 2.97, 2.99]],
  spinach: ["Baby spinach", "Produce", 2.9, 3.6, 0.4, 2.2, 79, "", "", 142, "5 oz box", [1.99, 3.49, 2.24, 1.99]],
  kale: ["Chopped kale", "Produce", 2.9, 8.8, 1.5, 3.6, 38, "", "", 283, "10 oz bag", [1.99, 2.99, 2.24, 1.99]],
  lettuce: ["Romaine hearts", "Produce", 1.2, 3.3, 0.3, 2.1, 8, "", "", 510, "3 count", [2.49, 3.99, 2.97, 2.99]],
  coleslaw_mix: ["Coleslaw mix", "Produce", 1.3, 5.8, 0.1, 2.5, 18, "", "", 397, "14 oz bag", [1.49, 2.29, 1.62, 1.99]],
  bell_pepper: ["Bell peppers", "Produce", 1, 6, 0.3, 2.1, 4, "", "", 450, "3 pack", [2.99, 4.49, 3.42, 2.99], [150, "pepper", "peppers"]],
  onion: ["Yellow onions", "Produce", 1.1, 9.3, 0.1, 1.7, 4, "", "", 1361, "3 lb bag", [2.49, 3.49, 2.47, 2.99], [150, "onion", "onions"]],
  garlic: ["Garlic", "Produce", 6.4, 33, 0.5, 2.1, 17, "", "", 150, "3 heads", [1.49, 1.99, 1.47, 1.99], [5, "clove", "cloves"], true],
  ginger: ["Fresh ginger", "Produce", 1.8, 18, 0.8, 2, 13, "", "", 85, "1 piece", [0.79, 1.29, 0.85, 1.29]],
  green_onion: ["Green onions", "Produce", 1.8, 7.3, 0.2, 2.6, 16, "", "", 100, "1 bunch", [0.69, 0.99, 0.58, 0.99]],
  cilantro: ["Cilantro", "Produce", 2.1, 3.7, 0.5, 2.8, 46, "", "", 50, "1 bunch", [0.69, 0.99, 0.68, 1.99]],
  limes: ["Limes", "Produce", 0.7, 10.5, 0.2, 2.8, 2, "", "", 454, "1 lb bag", [1.99, 2.99, 2.24, 2.49], [67, "lime", "limes"]],
  lemons: ["Lemons", "Produce", 1.1, 9.3, 0.3, 2.8, 2, "", "", 907, "2 lb bag", [2.99, 4.49, 3.47, 3.99], [100, "lemon", "lemons"]],
  carrots: ["Carrots", "Produce", 0.9, 9.6, 0.2, 2.8, 69, "", "", 907, "2 lb bag", [1.39, 1.99, 1.34, 1.49]],
  cucumber: ["Cucumbers", "Produce", 0.7, 3.6, 0.1, 0.5, 2, "", "", 300, "1 each", [0.69, 0.99, 0.72, 0.79], [300, "cucumber", "cucumbers"]],
  tomatoes: ["Roma tomatoes", "Produce", 0.9, 3.9, 0.2, 1.2, 5, "", "", 454, "1 lb", [1.29, 1.99, 1.37, 1.99], [62, "tomato", "tomatoes"]],
  zucchini: ["Zucchini", "Produce", 1.2, 3.1, 0.3, 1, 8, "", "", 454, "1 lb", [1.49, 2.49, 1.68, 1.99]],
  mushrooms: ["White mushrooms", "Produce", 3.1, 3.3, 0.3, 1, 5, "", "", 227, "8 oz pack", [1.79, 2.99, 1.98, 1.99]],
  bananas: ["Bananas", "Produce", 1.1, 23, 0.3, 2.6, 1, "", "", 708, "6 count", [1.49, 2.29, 1.62, 1.14], [118, "banana", "bananas"]],
  apples: ["Apples", "Produce", 0.3, 14, 0.2, 2.4, 1, "", "", 1361, "3 lb bag", [3.49, 4.99, 3.97, 3.99], [182, "apple", "apples"]],
  avocado: ["Avocados", "Produce", 2, 8.5, 14.7, 6.7, 7, "", "", 540, "4 count bag", [2.99, 4.99, 3.47, 3.99], [135, "avocado", "avocados"]],
  pineapple: ["Canned pineapple chunks in juice", "Canned and jarred", 0.4, 14, 0.1, 0.8, 1, "", "", 567, "20 oz can", [1.29, 1.99, 1.42, 1.79]],
  // Canned, jarred, sauces
  diced_tomatoes: ["Canned diced tomatoes", "Canned and jarred", 1, 4.2, 0.2, 1.9, 180, "", "", 411, "14.5 oz can", [0.85, 1.29, 0.92, 1.19], [411, "can", "cans"]],
  marinara: ["Marinara sauce", "Sauces and condiments", 1.5, 8, 1.5, 2, 400, "", "", 680, "24 oz jar", [1.99, 2.99, 2.12, 2.49]],
  salsa: ["Salsa", "Sauces and condiments", 1.5, 7, 0.2, 1.8, 600, "", "", 454, "16 oz jar", [1.89, 2.99, 1.98, 2.49]],
  enchilada_sauce: ["Red enchilada sauce", "Sauces and condiments", 1, 7, 2, 1.5, 600, "", "", 283, "10 oz can", [0.99, 1.99, 1.18, 1.99]],
  coconut_milk: ["Light coconut milk", "Canned and jarred", 0.7, 1.7, 7, 0, 15, "", "", 400, "13.5 oz can", [1.49, 2.29, 1.62, 1.49], [400, "can", "cans"]],
  curry_paste: ["Red curry paste", "Sauces and condiments", 2, 15, 5, 4, 2700, "", "", 113, "4 oz jar", [2.49, 3.99, 2.98, 2.99]],
  chicken_broth: ["Low-sodium chicken broth", "Canned and jarred", 0.6, 0.4, 0.2, 0, 60, "poultry", "", 907, "32 oz carton", [1.49, 2.49, 1.68, 2.29]],
  veg_broth: ["Low-sodium vegetable broth", "Canned and jarred", 0.2, 1.5, 0.1, 0, 60, "", "", 907, "32 oz carton", [1.49, 2.49, 1.68, 2.29]],
  hummus: ["Hummus", "Deli", 7.9, 14, 9.6, 6, 400, "", "sesame", 283, "10 oz tub", [2.49, 3.99, 2.98, 2.99]],
  pesto: ["Basil pesto", "Sauces and condiments", 5, 7, 42, 1.5, 800, "dairy", "milk,treenut", 190, "6.7 oz jar", [2.99, 4.49, 3.24, 3.29]],
  soy_sauce: ["Soy sauce", "Sauces and condiments", 8, 4.9, 0.6, 0.8, 5500, "", "soy,wheat", 444, "15 oz bottle", [1.69, 2.79, 1.94, 2.29], undefined, true],
  teriyaki_sauce: ["Teriyaki sauce", "Sauces and condiments", 5.9, 15.6, 0, 0.1, 3800, "", "soy,wheat", 296, "10 oz bottle", [1.89, 2.99, 1.98, 2.49]],
  gochujang: ["Gochujang", "Sauces and condiments", 4.9, 46, 1.6, 2, 3000, "", "soy,wheat", 283, "10 oz tub", [null, 4.99, 4.47, 3.29]],
  bbq_sauce: ["Barbecue sauce", "Sauces and condiments", 0.8, 41, 0.6, 0.9, 1000, "", "", 510, "18 oz bottle", [1.29, 2.29, 1.38, 2.49]],
  honey: ["Honey", "Sauces and condiments", 0.3, 82, 0, 0.2, 4, "", "", 340, "12 oz bottle", [3.49, 5.49, 3.48, 4.49]],
  taco_seasoning: ["Taco seasoning", "Sauces and condiments", 7, 50, 5, 8, 6000, "", "", 28, "1 oz packet", [0.49, 1.09, 0.62, null]],
  peanut_butter: ["Peanut butter", "Oils and nuts", 25, 20, 50, 6, 400, "", "peanut", 454, "16 oz jar", [1.99, 3.29, 2.12, 2.99]],
  almonds: ["Whole almonds", "Oils and nuts", 21, 22, 50, 12.5, 1, "", "treenut", 454, "16 oz bag", [4.99, 7.99, 5.48, 5.99]],
  olive_oil: ["Olive oil", "Oils and nuts", 0, 0, 100, 0, 2, "", "", 460, "17 oz bottle", [4.99, 7.99, 5.48, 6.99], undefined, true],
  sesame_oil: ["Toasted sesame oil", "Oils and nuts", 0, 0, 100, 0, 0, "", "sesame", 207, "7 oz bottle", [2.49, 4.49, 2.98, 2.99]],
  // Added Nov 2026 for the larger recipe book. Every item is stocked at Walmart (and most at Aldi), so
  // recipes plan anywhere in the US, not just Pittsburgh.
  pork_chops: ["Boneless pork loin chops", "Meat and seafood", 21.5, 0, 6, 0, 50, "pork", "", 680, "1.5 lb pack", [4.99, 6.99, 5.24, 6.49]],
  ricotta: ["Part-skim ricotta", "Dairy and eggs", 11.4, 5.1, 7.9, 0, 99, "dairy", "milk", 425, "15 oz tub", [2.49, 3.79, 2.72, 3.49]],
  cannellini: ["Canned cannellini beans", "Canned and jarred", 7.3, 21.9, 0.3, 6.3, 240, "", "", 255, "15 oz can (drained)", [0.79, 1.29, 0.88, 0.99], [255, "can", "cans"]],
  refried_beans: ["Canned fat-free refried beans", "Canned and jarred", 5.5, 15, 0.5, 5, 400, "", "", 454, "16 oz can", [0.99, 1.49, 1.08, 1.69], [454, "can", "cans"]],
  english_muffins: ["Whole wheat English muffins", "Bakery", 8.8, 40, 2, 6.7, 420, "", "wheat", 342, "6 count", [1.69, 2.99, 1.98, 2.49], [57, "muffin", "muffins"]],
  cabbage: ["Green cabbage", "Produce", 1.3, 5.8, 0.1, 2.5, 18, "", "", 900, "1 head", [1.29, 1.99, 1.38, null]],
  cauliflower: ["Frozen cauliflower florets", "Frozen", 1.6, 3.7, 0.3, 2, 30, "", "", 340, "12 oz bag", [1.29, 1.99, 1.24, 1.99]],
  cauliflower_rice: ["Frozen riced cauliflower", "Frozen", 1.9, 4, 0.3, 2, 25, "", "", 340, "12 oz bag", [1.79, 2.99, 1.97, 2.29]],
  frozen_spinach: ["Frozen chopped spinach", "Frozen", 3.6, 4.2, 0.6, 3, 75, "", "", 340, "12 oz bag", [1.19, 1.79, 1.24, 1.79]],
  eggplant: ["Eggplant", "Produce", 1, 5.9, 0.2, 3, 2, "", "", 450, "1 each", [1.49, 1.99, 1.57, 1.79], [450, "eggplant", "eggplants"]],
  plantains: ["Plantains", "Produce", 1.3, 32, 0.4, 2.3, 4, "", "", 681, "3 count", [null, 1.99, 1.29, null], [227, "plantain", "plantains"]],
  parsley: ["Flat-leaf parsley", "Produce", 3, 6.3, 0.8, 3.3, 56, "", "", 60, "1 bunch", [0.89, 1.29, 0.88, 1.99]],
  mango: ["Frozen mango chunks", "Frozen", 0.8, 15, 0.4, 1.6, 1, "", "", 454, "16 oz bag", [2.49, 3.99, 2.72, 2.99]],
  sauerkraut: ["Sauerkraut", "Canned and jarred", 0.9, 4.3, 0.1, 2.9, 660, "", "", 907, "32 oz jar", [1.79, 2.99, 1.98, null]],
  chia: ["Chia seeds", "Oils and nuts", 16.5, 42, 31, 34, 16, "", "", 340, "12 oz bag", [3.99, 5.99, 4.48, 4.49]],
  cashews: ["Unsalted cashews", "Oils and nuts", 18, 30, 44, 3.3, 12, "", "treenut", 283, "10 oz bag", [4.29, 6.99, 4.98, 5.49]],
  // Added Nov 2026 so imported recipes match more of what they call for. Walmart carries each one.
  protein_powder: ["Whey protein powder", "Oils and nuts", 75, 10, 5, 0, 300, "dairy", "milk", 907, "2 lb tub", [16.99, 29.99, 18.98, null]],
  almond_milk: ["Unsweetened almond milk", "Dairy and eggs", 0.6, 0.6, 1.1, 0.3, 70, "", "treenut", 1893, "half gallon", [2.49, 3.49, 2.68, 2.99]],
  cream_cheese: ["Cream cheese", "Dairy and eggs", 6, 5.5, 34, 0, 320, "dairy", "milk", 227, "8 oz block", [1.29, 2.49, 1.34, 1.99]],
  mayo: ["Mayonnaise", "Sauces and condiments", 1, 0.6, 75, 0, 630, "egg", "egg", 850, "30 oz jar", [2.89, 4.49, 3.18, 3.49]],
  flour: ["All-purpose flour", "Grains and pasta", 10, 76, 1, 2.7, 2, "", "wheat", 2268, "5 lb bag", [1.89, 2.99, 2.12, 2.99]],
  sugar: ["Granulated sugar", "Grains and pasta", 0, 100, 0, 0, 1, "", "", 1814, "4 lb bag", [2.49, 3.99, 2.88, 3.49]],
  jalapeno: ["Jalapeño peppers", "Produce", 0.9, 6.5, 0.4, 2.8, 3, "", "", 454, "1 lb", [1.49, 2.49, 1.58, null]],
};

/** Not wheat, but not safe for a gluten-free diet unless certified (cross-contact). */
const GLUTEN_RISK = new Set(["oats", "granola"]);
/**
 * Processed or refined ingredients a whole-foods eater skips: processed meats, refined grains,
 * snack foods and sauces with added sugar, starches or gums. Whole-grain breads, plain dairy, canned
 * beans and tomatoes, and simple condiments still count as whole foods here ("simple").
 */
export const PROCESSED = new Set([
  "chicken_sausage", "deli_turkey", "bacon", "string_cheese", "pasta_white", "egg_noodles", "rice", "jasmine_rice",
  "rice_noodles", "couscous", "pierogies", "granola", "protein_powder", "mayo", "flour", "sugar", "teriyaki_sauce", "bbq_sauce", "enchilada_sauce", "taco_seasoning", "curry_paste",
  // corn syrup in most store brands; thickeners in light sour cream
  "gochujang", "sour_cream",
  // gums and added vitamins in store almond milk
  "almond_milk",
]);
/** Made from a few recognizable ingredients: fine for whole foods, but not as found in nature. */
const SIMPLE = new Set([
  // dairy made from milk, plus pressed or fermented soy
  "cheddar", "mozzarella", "feta", "parmesan", "butter", "ricotta", "cottage_cheese", "greek_yogurt", "cream_cheese", "tofu", "tempeh",
  // whole-grain breads and pasta
  "pasta", "tortillas", "corn_tortillas", "pita", "bread", "english_muffins",
  // canned and jarred basics
  "tuna", "black_beans", "chickpeas", "pinto_beans", "kidney_beans", "cannellini", "refried_beans", "diced_tomatoes", "pineapple",
  "marinara", "salsa", "coconut_milk", "chicken_broth", "veg_broth", "hummus", "pesto", "sauerkraut", "egg_whites",
  // oils, nut butters and condiments
  "olive_oil", "sesame_oil", "peanut_butter", "soy_sauce", "honey",
]);

/**
 * Warehouse-club packs (Nov 2026 estimates, Pittsburgh-area Costco and Sam's Club): grams, label,
 * Costco price, Sam's Club price. null = that club doesn't carry it. Anything not listed is not
 * sold in a club-size pack, so the plan buys it at a regular store.
 */
const BULK: Record<string, [grams: number, label: string, costco: number | null, samsclub: number | null]> = {
  chicken_breast: [2948, "6.5 lb pack", 16.99, 15.98],
  chicken_thigh: [2722, "6 lb pack", 15.99, 14.98],
  ground_turkey: [1814, "4 × 1 lb pack", 14.99, 13.98],
  ground_beef: [2268, "5 lb pack", 23.99, 22.98],
  sirloin: [1361, "3 lb pack", 20.99, 19.98],
  pork_tenderloin: [1814, "4 lb (2 loins)", 11.99, 11.98],
  pork_chops: [2268, "5 lb pack", 13.99, 13.98],
  bacon: [1361, "4 × 12 oz pack", 15.99, 14.98],
  chicken_sausage: [1134, "2.5 lb pack", 9.99, 9.98],
  salmon: [1361, "3 lb bag", 19.99, 18.98],
  shrimp: [907, "2 lb bag", 11.99, 11.98],
  tilapia: [1814, "4 lb bag", 15.99, 14.98],
  cod: [1134, "2.5 lb bag", 13.99, null],
  tuna: [1136, "8 × 5 oz cans", 6.99, 5.98],
  eggs: [3000, "5 dozen", 11.99, 10.98],
  egg_whites: [2724, "6 × 16 oz cartons", 12.99, 11.98],
  greek_yogurt: [2722, "2 × 48 oz tubs", 8.99, 8.98],
  cottage_cheese: [1361, "2 × 24 oz tubs", 4.99, 4.98],
  milk: [7570, "2 × 1 gallon", 4.99, 4.98],
  cheddar: [1134, "2.5 lb bag", 8.99, 8.98],
  mozzarella: [1134, "2.5 lb bag", 8.99, 8.98],
  parmesan: [680, "24 oz tub", 9.99, 9.98],
  feta: [680, "24 oz tub", 7.99, null],
  string_cheese: [1344, "48 count", 12.99, 11.98],
  butter: [1814, "4 lb (16 sticks)", 11.99, 11.98],
  tofu: [1816, "4 × 16 oz blocks", 7.99, null],
  edamame: [1814, "4 lb bag", 8.99, 8.98],
  black_beans: [2040, "8 × 15 oz cans", 4.99, 4.98],
  chickpeas: [2040, "8 × 15 oz cans", 4.99, 4.98],
  kidney_beans: [2040, "8 × 15 oz cans", null, 4.98],
  lentils: [1814, "4 lb bag", 3.99, 3.98],
  rice: [4536, "10 lb bag", 7.99, 6.98],
  jasmine_rice: [4536, "10 lb bag", 10.99, 9.98],
  brown_rice: [2722, "6 lb bag", 4.99, 4.98],
  oats: [4536, "10 lb bag", 10.99, 9.98],
  quinoa: [2041, "4.5 lb bag", 11.99, 10.98],
  pasta: [2722, "6 × 1 lb box", 5.99, 5.98],
  pasta_white: [3629, "8 × 1 lb box", 5.99, 5.98],
  tortillas: [1440, "32 count", 6.99, 5.98],
  bread: [1134, "2 × 20 oz loaves", 2.69, 2.58],
  potatoes: [4536, "10 lb bag", 5.99, 5.98],
  sweet_potato: [2722, "6 lb bag", 4.99, 4.98],
  onion: [4536, "10 lb bag", 6.99, 6.98],
  broccoli: [1814, "4 lb bag", 4.99, 4.98],
  green_beans: [1814, "4 lb bag", 4.99, 4.98],
  stirfry_veg: [2495, "5.5 lb bag", 5.99, 5.98],
  corn: [2268, "5 lb bag", 4.99, 5.48],
  peas: [2268, "5 lb bag", 4.99, 5.48],
  berries: [1814, "4 lb bag", 8.99, 8.98],
  mango: [2268, "5 lb bag", 10.99, 9.98],
  cauliflower_rice: [1814, "4 lb bag", 7.99, 7.98],
  spinach: [454, "1 lb tub", 4.49, 4.28],
  bell_pepper: [1361, "6 pack", 7.99, 7.48],
  bananas: [1360, "3 lb bunch", 1.99, 1.84],
  apples: [2268, "5 lb bag", 4.99, 4.98],
  avocado: [810, "6 count bag", 3.99, 2.98],
  carrots: [2268, "5 lb bag", 2.99, 1.98],
  diced_tomatoes: [3288, "8 × 14.5 oz cans", 5.99, 4.98],
  marinara: [2041, "3 × 24 oz jars", 4.99, 4.98],
  salsa: [1077, "38 oz jar", 3.99, 2.98],
  chicken_broth: [5443, "6 × 32 oz cartons", 7.99, 6.98],
  peanut_butter: [1361, "2 × 24 oz jars", 4.99, 4.98],
  almonds: [1361, "3 lb bag", 12.99, 12.98],
  cashews: [1134, "2.5 lb bag", 14.99, 13.98],
  olive_oil: [2000, "2 L bottle", 18.99, 17.98],
  soy_sauce: [1893, "64 oz bottle", 5.99, 5.98],
  honey: [1361, "3 lb bottle", 11.99, 11.98],
  chia: [907, "2 lb bag", 7.99, 7.48],
  protein_powder: [2268, "5 lb tub", 37.99, 35.98],
  almond_milk: [5678, "6 × 32 oz cartons", 5.99, 5.98],
  hummus: [907, "32 oz tub", 6.99, 5.98],
  flour: [11340, "25 lb bag", 7.99, 7.98],
  sugar: [4536, "10 lb bag", 4.99, 4.98],
  mayo: [1890, "64 oz jar", 4.99, 4.98],
};

const CHAIN_ORDER: ChainId[] = ["aldi", "gianteagle", "walmart", "traderjoes"];

export const INGREDIENTS: Record<string, Ingredient> = Object.fromEntries(
  Object.entries(ROWS).map(([id, r]) => {
    const [name, aisle, p, c, f, fiber, sodium, animal, allergens, pkgG, pkgLabel, prices, each, staple] = r;
    const allergenList = allergens ? (allergens.split(",") as Allergen[]) : [];
    const ing: Ingredient = {
      id, name, aisle,
      per100g: { protein: p, carbs: c, fat: f, fiber, sodiumMg: sodium },
      animal: animal || null,
      allergens: allergenList,
      gluten: allergenList.includes("wheat") || GLUTEN_RISK.has(id),
      pkg: { grams: pkgG, label: pkgLabel },
      estPrice: { ...Object.fromEntries(CHAIN_ORDER.map((ch, i) => [ch, prices[i] ?? null])), costco: BULK[id]?.[2] ?? null, samsclub: BULK[id]?.[3] ?? null } as Record<ChainId, number | null>,
      ...(BULK[id] ? { bulkPkg: { grams: BULK[id]![0], label: BULK[id]![1] } } : {}),
      ...(each ? { each: { grams: each[0], one: each[1], many: each[2] } } : {}),
      ...(staple ? { staple } : {}),
      processing: PROCESSED.has(id) ? "processed" : SIMPLE.has(id) ? "simple" : "whole",
    };
    return [id, ing];
  }),
);

/** Typical days an opened or fresh item keeps in the fridge or cupboard, by aisle. */
export const SHELF_LIFE_DAYS: Record<Aisle, number> = {
  Produce: 6, "Meat and seafood": 3, Deli: 5, "Dairy and eggs": 14, Bakery: 6, "Grains and pasta": 365,
  "Canned and jarred": 365, "Sauces and condiments": 120, "Oils and nuts": 180, Frozen: 120,
};
/** A few items keep much longer or shorter than their aisle. */
const SHELF_OVERRIDES: Record<string, number> = {
  eggs: 28, potatoes: 30, sweet_potato: 30, onion: 30, garlic: 60, apples: 21, carrots: 21, limes: 14, lemons: 14,
  cheddar: 28, parmesan: 60, cabbage: 21, plantains: 7, ricotta: 10, mozzarella: 21, feta: 21, butter: 60, bananas: 5, berries: 4, spinach: 5, avocado: 4, cilantro: 6,
};
export function shelfLifeDays(id: string): number {
  const ing = INGREDIENTS[id];
  if (!ing) return 7;
  return SHELF_OVERRIDES[id] ?? SHELF_LIFE_DAYS[ing.aisle];
}

export const CHAINS: { id: ChainId; name: string; note: string; bulk?: true; search: (q: string) => string }[] = [
  { id: "aldi", name: "Aldi", note: "Lowest prices, smaller selection", search: (q) => `https://www.aldi.us/results?q=${encodeURIComponent(q)}` },
  { id: "gianteagle", name: "Giant Eagle", note: "Widest selection in the Pittsburgh area", search: (q) => `https://www.gianteagle.com/search?q=${encodeURIComponent(q)}` },
  { id: "walmart", name: "Walmart", note: "Low prices, large stores", search: (q) => `https://www.walmart.com/search?q=${encodeURIComponent(q)}` },
  { id: "traderjoes", name: "Trader Joe's", note: "Smaller packages, in-store only", search: (q) => `https://www.traderjoes.com/home/search?q=${encodeURIComponent(q)}&section=products` },
  { id: "costco", name: "Costco", note: "Warehouse packs, membership needed", bulk: true, search: (q) => `https://www.costco.com/CatalogSearch?keyword=${encodeURIComponent(q)}` },
  { id: "samsclub", name: "Sam's Club", note: "Warehouse packs, membership needed", bulk: true, search: (q) => `https://www.samsclub.com/s/${encodeURIComponent(q)}` },
];

/**
 * The package a chain sells: the club pack at Costco and Sam's Club, the usual one everywhere else.
 * Prices in estPrice and in price tables are per this package.
 */
export function pkgAt(id: string, chain: ChainId): { grams: number; label: string } {
  const ing = INGREDIENTS[id];
  if (!ing) return { grams: 1, label: "" };
  return (isBulkChain(chain) && ing.bulkPkg) || ing.pkg;
}
