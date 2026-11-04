import { kcalFromMacros } from "@prep-cart/nutrition";
import type { MealType } from "./taxonomy";

/**
 * Takeout options for mixing into a prep week. Macros are approximations of each chain's
 * published nutrition for a standard build; calories are derived from the macros (4/4/9) so
 * they add up the same way as recipes. Prices are Pittsburgh-area estimates before tax and tip.
 */
export interface Restaurant { id: string; name: string; note: string; url: string }
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
  { id: "chipotle", name: "Chipotle", note: "Bowls you can build to your macros", url: "https://www.chipotle.com/nutrition-calculator" },
  { id: "chickfila", name: "Chick-fil-A", note: "Grilled options are high protein", url: "https://www.chick-fil-a.com/nutrition-allergens" },
  { id: "panera", name: "Panera Bread", note: "Bowls, salads and soups", url: "https://www.panerabread.com/en-us/menu-categories/nutrition.html" },
  { id: "subway", name: "Subway", note: "Sandwiches you can size up or down", url: "https://www.subway.com/en-US/MenuNutrition/Nutrition" },
  { id: "cava", name: "CAVA", note: "Mediterranean bowls", url: "https://cava.com/nutrition" },
  { id: "tacobell", name: "Taco Bell", note: "Cheap, with a protein bowl", url: "https://www.tacobell.com/nutrition/info" },
  { id: "fiveguys", name: "Five Guys", note: "Burgers; the little sizes are single patties", url: "https://www.fiveguys.com/menu" },
  { id: "starbucks", name: "Starbucks", note: "Breakfast on the go", url: "https://www.starbucks.com/menu" },
  { id: "mcdonalds", name: "McDonald's", note: "Breakfast staples", url: "https://www.mcdonalds.com/us/en-us/about-our-food/nutrition-calculator.html" },
  { id: "primanti", name: "Primanti Bros.", note: "Pittsburgh classic; nutrition is our estimate", url: "https://primantibros.com/menu" },
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
