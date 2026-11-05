import { kcalFromMacros } from "@prep-cart/nutrition";
import type { MealType } from "./taxonomy";

/**
 * Takeout options for mixing into a prep week. Macros are approximations of each chain's
 * published nutrition for a standard build; calories are derived from the macros (4/4/9) so
 * they add up the same way as recipes. Prices are Pittsburgh-area estimates before tax and tip.
 */
export interface Restaurant {
  id: string; name: string; note: string; url: string;
  /** matches the chain's brand or name in OpenStreetMap, to tell which chains are near the person */
  match: RegExp;
}
export interface MenuItem {
  id: string;
  restaurantId: string;
  name: string;
  mealType: MealType;
  protein: number; carbs: number; fat: number;
  kcal: number;
  price: number;
  vegetarian: boolean; vegan: boolean; glutenFree: boolean;
  /** true when the chain publishes no nutrition and we estimated it from similar dishes */
  estimated: boolean;
}

export const RESTAURANTS: Restaurant[] = [
  { id: "chipotle", name: "Chipotle", note: "Bowls you can build to your macros", url: "https://www.chipotle.com/nutrition-calculator", match: /chipotle/i },
  { id: "chickfila", name: "Chick-fil-A", note: "Grilled options are high protein", url: "https://www.chick-fil-a.com/nutrition-allergens", match: /chick-?fil-?a/i },
  { id: "panera", name: "Panera Bread", note: "Bowls, salads and soups", url: "https://www.panerabread.com/en-us/menu-categories/nutrition.html", match: /panera/i },
  { id: "subway", name: "Subway", note: "Sandwiches you can size up or down", url: "https://www.subway.com/en-US/MenuNutrition/Nutrition", match: /\bsubway\b/i },
  { id: "cava", name: "CAVA", note: "Mediterranean bowls", url: "https://cava.com/nutrition", match: /\bcava\b/i },
  { id: "tacobell", name: "Taco Bell", note: "Cheap, with a protein bowl", url: "https://www.tacobell.com/nutrition/info", match: /taco bell/i },
  { id: "fiveguys", name: "Five Guys", note: "Burgers; the little sizes are single patties", url: "https://www.fiveguys.com/menu", match: /five guys/i },
  { id: "starbucks", name: "Starbucks", note: "Breakfast on the go", url: "https://www.starbucks.com/menu", match: /starbucks/i },
  { id: "mcdonalds", name: "McDonald's", note: "Breakfast staples", url: "https://www.mcdonalds.com/us/en-us/about-our-food/nutrition-calculator.html", match: /mc ?donald/i },
  { id: "primanti", name: "Primanti Bros.", note: "Pittsburgh classic; nutrition is our estimate", url: "https://primantibros.com/menu", match: /primanti/i },
  { id: "wendys", name: "Wendy's", note: "Chili and a grilled chicken sandwich", url: "https://www.wendys.com/nutrition-info", match: /wendy/i },
  { id: "panda", name: "Panda Express", note: "Swap rice for super greens to save carbs", url: "https://www.pandaexpress.com/nutritioncalculator", match: /panda express/i },
  { id: "qdoba", name: "Qdoba", note: "Bowls with a high protein option", url: "https://www.qdoba.com/nutrition", match: /qdoba/i },
  { id: "sweetgreen", name: "Sweetgreen", note: "Salads and warm bowls", url: "https://www.sweetgreen.com/menu", match: /sweetgreen/i },
  { id: "jerseymikes", name: "Jersey Mike's", note: "Any sub comes as a low carb tub", url: "https://www.jerseymikes.com/nutrition", match: /jersey mike/i },
  { id: "canes", name: "Raising Cane's", note: "Chicken fingers; skip the fries to save carbs", url: "https://www.raisingcanes.com/menu", match: /raising cane|\bcane'?s\b/i },
  { id: "zaxbys", name: "Zaxby's", note: "Grilled salads and fingers", url: "https://www.zaxbys.com/menu/nutrition", match: /zaxby/i },
  { id: "whataburger", name: "Whataburger", note: "Grilled chicken and breakfast all day", url: "https://whataburger.com/nutrition", match: /whataburger/i },
  { id: "burgerking", name: "Burger King", note: "Has a plant-based Whopper", url: "https://www.bk.com/nutrition-explorer", match: /burger king/i },
  { id: "dunkin", name: "Dunkin'", note: "Quick breakfasts", url: "https://www.dunkindonuts.com/en/menu/nutrition", match: /dunkin/i },
];

type Row = [id: string, restaurantId: string, name: string, meal: MealType, p: number, c: number, f: number, price: number, flags?: string];
const ROWS: Row[] = [
  ["chipotle_chicken_bowl", "chipotle", "Chicken burrito bowl (rice, black beans, fajita veggies, salsa, lettuce)", "main", 51, 70, 17, 10.95, "gf"],
  ["chipotle_double_chicken_salad", "chipotle", "Double chicken salad bowl (fajita veggies, black beans, salsa)", "main", 76, 32, 21, 14.25, "gf"],
  ["chipotle_steak_salad", "chipotle", "Steak salad bowl (fajita veggies, black beans, salsa, cheese)", "main", 42, 30, 22, 11.75, "gf"],
  ["chipotle_sofritas_bowl", "chipotle", "Sofritas bowl (rice, black beans, fajita veggies, salsa)", "main", 22, 85, 22, 10.5, "veg,vegan,gf"],
  ["chipotle_chicken_burrito", "chipotle", "Chicken burrito (rice, beans, salsa, cheese)", "main", 55, 120, 30, 10.95],
  ["cfa_grilled_sandwich", "chickfila", "Grilled chicken sandwich", "main", 28, 41, 12, 6.79],
  ["cfa_grilled_nuggets_12", "chickfila", "Grilled nuggets, 12 count", "main", 38, 2, 5, 6.45, "gf"],
  ["cfa_cool_wrap", "chickfila", "Grilled cool wrap (no dressing)", "main", 42, 30, 14, 8.55],
  ["cfa_chicken_sandwich", "chickfila", "Chick-fil-A chicken sandwich", "main", 29, 41, 17, 5.29],
  ["cfa_egg_white_grill", "chickfila", "Egg white grill", "breakfast", 27, 30, 8, 5.19],
  ["panera_med_bowl_chicken", "panera", "Mediterranean bowl with chicken", "main", 33, 54, 26, 11.49, "gf"],
  ["panera_cobb_chicken", "panera", "Green goddess cobb salad with chicken", "main", 41, 26, 29, 11.99, "gf"],
  ["panera_broc_cheddar_bowl", "panera", "Broccoli cheddar soup, bowl", "main", 13, 26, 21, 7.49, "veg"],
  ["subway_turkey_6", "subway", "6-inch turkey on multigrain, veggies", "main", 18, 41, 4, 6.49],
  ["subway_rotisserie_12", "subway", "Footlong rotisserie-style chicken, veggies", "main", 56, 84, 12, 11.49],
  ["subway_veggie_12", "subway", "Footlong Veggie Delite", "main", 18, 80, 6, 8.49, "veg,vegan"],
  ["cava_chicken_rice", "cava", "Chicken and rice bowl (greens, hummus, veggies)", "main", 42, 60, 30, 13.25, "gf"],
  ["cava_falafel", "cava", "Falafel crunch bowl", "main", 18, 70, 38, 12.45, "veg,vegan"],
  ["tacobell_power_bowl", "tacobell", "Cantina chicken power bowl", "main", 26, 50, 19, 6.99, "gf"],
  ["tacobell_bean_burrito", "tacobell", "Bean burrito", "main", 13, 55, 9, 2.49, "veg"],
  ["fiveguys_little_burger", "fiveguys", "Little hamburger, all the way", "main", 23, 39, 26, 8.99],
  ["sbux_egg_bites", "starbucks", "Egg white and roasted red pepper egg bites", "breakfast", 12, 11, 8, 4.95, "veg,gf"],
  ["sbux_spinach_wrap", "starbucks", "Spinach, feta and egg white wrap", "breakfast", 20, 34, 8, 5.25, "veg"],
  ["sbux_protein_box", "starbucks", "Eggs and cheddar protein box", "snack", 23, 37, 24, 6.75, "veg"],
  ["mcd_egg_mcmuffin", "mcdonalds", "Egg McMuffin", "breakfast", 17, 30, 13, 4.79],
  ["primanti_cheesesteak", "primanti", "Pitts-burger cheesesteak sandwich", "main", 45, 95, 45, 12.99, "est"],
  ["primanti_turkey", "primanti", "Turkey and cheese sandwich", "main", 38, 90, 32, 11.99, "est"],
  ["primanti_chicken_salad", "primanti", "Grilled chicken salad with fries on top", "main", 38, 45, 35, 12.99, "est"],
  ["chipotle_double_chicken_bowl", "chipotle", "Double chicken burrito bowl (rice, black beans, fajita veggies, salsa)", "main", 83, 70, 24, 14.25, "gf"],
  ["chipotle_barbacoa_bowl", "chipotle", "Barbacoa bowl (rice, pinto beans, salsa, lettuce)", "main", 44, 72, 18, 11.75, "gf"],
  ["chipotle_chips_guac", "chipotle", "Chips and guacamole", "snack", 8, 65, 44, 5.7, "veg,vegan,gf"],
  ["cfa_grilled_nuggets_8", "chickfila", "Grilled nuggets, 8 count", "snack", 25, 1, 3, 4.65, "gf"],
  ["cfa_nuggets_8", "chickfila", "Chick-fil-A nuggets, 8 count", "main", 27, 11, 11, 4.99],
  ["cfa_market_salad", "chickfila", "Market salad with grilled chicken (no dressing)", "main", 28, 26, 14, 10.39, "gf"],
  ["cfa_spicy_sw_salad", "chickfila", "Spicy southwest salad with grilled chicken", "main", 33, 26, 20, 10.39],
  ["cfa_scramble_bowl", "chickfila", "Hash brown scramble bowl, grilled", "breakfast", 29, 19, 30, 5.79, "gf"],
  ["cfa_chicken_biscuit", "chickfila", "Chicken biscuit", "breakfast", 19, 48, 21, 4.49],
  ["cfa_parfait", "chickfila", "Greek yogurt parfait", "snack", 13, 36, 9, 4.65, "veg"],
  ["cfa_fruit_cup", "chickfila", "Fruit cup, medium", "snack", 1, 16, 0, 3.65, "veg,vegan,gf"],
  ["subway_teriyaki_6", "subway", "6-inch sweet onion chicken teriyaki", "main", 25, 51, 5, 7.49],
  ["subway_tuna_6", "subway", "6-inch tuna, veggies", "main", 19, 38, 25, 6.99],
  ["subway_protein_bowl", "subway", "Rotisserie-style chicken protein bowl", "main", 40, 10, 14, 10.49, "gf"],
  ["subway_egg_flatbread", "subway", "6-inch egg and cheese flatbread", "breakfast", 19, 35, 13, 4.99, "veg"],
  ["panera_teriyaki_bowl", "panera", "Teriyaki chicken and broccoli bowl", "main", 34, 92, 13, 11.49],
  ["panera_turkey_blt", "panera", "Toasted turkey, avocado and bacon sandwich", "main", 38, 68, 32, 12.29],
  ["panera_steel_oats", "panera", "Steel-cut oatmeal with strawberries and pecans", "breakfast", 8, 58, 12, 4.99, "veg"],
  ["panera_egg_white_flat", "panera", "Avocado, egg white and spinach breakfast sandwich", "breakfast", 20, 40, 13, 6.79, "veg"],
  ["cava_steak_harissa", "cava", "Steak and harissa avocado bowl", "main", 40, 45, 40, 15.25, "gf"],
  ["cava_greens_grains", "cava", "Greens and grains bowl with chicken", "main", 39, 45, 28, 13.25, "gf"],
  ["cava_lentil_bowl", "cava", "Lentil and avocado bowl", "main", 14, 60, 35, 12.45, "veg,vegan,gf"],
  ["tacobell_quesadilla", "tacobell", "Chicken quesadilla", "main", 27, 37, 26, 5.79],
  ["tacobell_crunchy_taco", "tacobell", "Crunchy taco", "snack", 8, 13, 9, 1.99, "gf"],
  ["tacobell_veggie_bowl", "tacobell", "Veggie power bowl", "main", 13, 62, 16, 6.49, "veg,gf"],
  ["tacobell_breakfast_crunchwrap", "tacobell", "Breakfast crunchwrap, sausage", "breakfast", 21, 51, 34, 3.99],
  ["fiveguys_hamburger", "fiveguys", "Hamburger, all the way", "main", 40, 39, 43, 11.99],
  ["fiveguys_veggie", "fiveguys", "Veggie sandwich", "main", 16, 60, 15, 6.99, "veg"],
  ["sbux_turkey_bacon", "starbucks", "Turkey bacon, cheddar and egg white sandwich", "breakfast", 17, 26, 6, 5.45],
  ["sbux_oatmeal", "starbucks", "Rolled and steel-cut oatmeal", "breakfast", 5, 43, 3, 3.95, "veg,vegan"],
  ["sbux_impossible", "starbucks", "Impossible breakfast sandwich", "breakfast", 22, 34, 22, 6.45],
  ["sbux_bacon_bites", "starbucks", "Bacon and gruyere egg bites", "breakfast", 19, 9, 20, 5.25, "gf"],
  ["mcd_qpc", "mcdonalds", "Quarter Pounder with cheese", "main", 30, 42, 26, 7.29],
  ["mcd_nuggets_10", "mcdonalds", "Chicken McNuggets, 10 piece", "main", 23, 25, 24, 6.49],
  ["mcd_sausage_mcmuffin", "mcdonalds", "Sausage McMuffin with egg", "breakfast", 21, 30, 27, 5.29],
  ["mcd_oatmeal", "mcdonalds", "Fruit and maple oatmeal", "breakfast", 6, 64, 4, 3.59, "veg"],
  ["wendys_grilled_chicken", "wendys", "Grilled chicken sandwich", "main", 34, 38, 10, 7.29],
  ["wendys_chili_large", "wendys", "Chili, large", "main", 23, 31, 9, 4.19, "gf"],
  ["wendys_chili_small", "wendys", "Chili, small", "snack", 16, 23, 6, 3.19, "gf"],
  ["wendys_daves_single", "wendys", "Dave's Single", "main", 30, 42, 39, 7.49],
  ["wendys_apple_pecan", "wendys", "Apple pecan salad with chicken (no dressing)", "main", 37, 34, 22, 9.99, "gf"],
  ["panda_teriyaki_greens", "panda", "Grilled teriyaki chicken with super greens", "main", 42, 18, 16, 10.4],
  ["panda_orange_rice", "panda", "Orange chicken with fried rice", "main", 25, 138, 31, 10.4],
  ["panda_beef_brown_rice", "panda", "Broccoli beef with brown rice", "main", 18, 99, 11, 10.4],
  ["panda_kungpao_greens", "panda", "Kung pao chicken with super greens", "main", 23, 25, 24, 10.4],
  ["qdoba_chicken_bowl", "qdoba", "Grilled chicken bowl (rice, black beans, pico, lettuce)", "main", 46, 64, 20, 11.25, "gf"],
  ["qdoba_protein_bowl", "qdoba", "High protein bowl, double chicken", "main", 69, 42, 24, 13.95, "gf"],
  ["qdoba_impossible_bowl", "qdoba", "Impossible bowl (rice, black beans, fajita veggies)", "main", 22, 70, 24, 11.25, "veg,vegan,gf"],
  ["sg_harvest_bowl", "sweetgreen", "Harvest bowl", "main", 37, 55, 36, 15.95, "gf"],
  ["sg_kale_caesar", "sweetgreen", "Kale Caesar with chicken", "main", 40, 22, 31, 14.45],
  ["sg_chicken_pesto", "sweetgreen", "Chicken pesto parm bowl", "main", 47, 59, 40, 15.45],
  ["jm_turkey_regular", "jerseymikes", "Regular turkey and provolone, Mike's way", "main", 34, 56, 22, 10.45],
  ["jm_chicken_philly", "jerseymikes", "Regular chicken Philly cheesesteak", "main", 46, 57, 23, 11.95],
  ["jm_turkey_tub", "jerseymikes", "Turkey and provolone in a tub (no bread)", "main", 30, 8, 22, 10.45, "gf"],
  ["canes_box", "canes", "Box combo (4 fingers, fries, toast, slaw)", "main", 47, 135, 72, 12.79],
  ["canes_3_fingers", "canes", "3 chicken fingers, no sides", "main", 39, 12, 18, 6.49],
  ["zaxbys_house_zalad", "zaxbys", "Grilled house zalad (no dressing)", "main", 38, 14, 26, 10.29, "gf"],
  ["zaxbys_fingerz_5", "zaxbys", "Chicken fingerz, 5 piece, no sides", "main", 48, 36, 30, 9.79],
  ["wb_grilled_chicken", "whataburger", "Grilled chicken sandwich", "main", 37, 53, 14, 8.49],
  ["wb_whataburger", "whataburger", "Whataburger", "main", 29, 61, 37, 7.29],
  ["wb_breakfast_bun", "whataburger", "Breakfast on a bun, bacon", "breakfast", 17, 28, 24, 4.49],
  ["bk_whopper_jr", "burgerking", "Whopper Jr.", "main", 13, 31, 19, 3.49],
  ["bk_whopper", "burgerking", "Whopper", "main", 31, 51, 40, 7.49],
  ["bk_impossible", "burgerking", "Impossible Whopper", "main", 25, 58, 34, 8.49, "veg"],
  ["dunkin_wakeup_wrap", "dunkin", "Egg and cheese wake-up wrap", "snack", 7, 14, 10, 2.49, "veg"],
  ["dunkin_turkey_sausage", "dunkin", "Turkey sausage, egg and cheese on an English muffin", "breakfast", 25, 30, 17, 5.29],
  ["dunkin_avocado_toast", "dunkin", "Avocado toast", "breakfast", 6, 29, 11, 3.99, "veg,vegan"],
];

export const MENU_ITEMS: MenuItem[] = ROWS.map(([id, restaurantId, name, mealType, protein, carbs, fat, price, flags = ""]) => {
  const f = new Set(flags.split(",").filter(Boolean));
  return {
    id, restaurantId, name, mealType, protein, carbs, fat, kcal: kcalFromMacros({ protein, carbs, fat }), price,
    vegetarian: f.has("veg") || f.has("vegan"), vegan: f.has("vegan"), glutenFree: f.has("gf"), estimated: f.has("est"),
  };
});
export const MENU_BY_ID: Record<string, MenuItem> = Object.fromEntries(MENU_ITEMS.map((m) => [m.id, m]));
export const RESTAURANTS_BY_ID: Record<string, Restaurant> = Object.fromEntries(RESTAURANTS.map((r) => [r.id, r]));

/**
 * How well an item fits a meal's targets: 0 is perfect, larger is worse. Protein short of
 * target counts double; calories and the other macros count by their relative miss.
 */
export function menuFit(item: MenuItem, t: { kcal: number; protein: number; carbs: number; fat: number }): number {
  const rel = (a: number, b: number) => (b > 0 ? Math.abs(a - b) / b : a > 0 ? 1 : 0);
  const proteinShort = t.protein > 0 ? Math.max(0, t.protein - item.protein) / t.protein : 0;
  return rel(item.kcal, t.kcal) * 1.5 + proteinShort * 2 + rel(item.carbs, t.carbs) * 0.4 + rel(item.fat, t.fat) * 0.4;
}
