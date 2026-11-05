import type { Allergen, ChainId, Cuisine, Diet, Equipment, Flavor, MealType, Mood, ProteinSource, Recipe } from "@prep-cart/catalog";
import type { EatingOccasion, Targets } from "@prep-cart/nutrition";

export type Wish = "must" | "nice" | "avoid";

export interface Preferences {
  /** every listed diet must be satisfied */
  diets: Diet[];
  allergens: Allergen[];
  /** ingredient ids never to use */
  dislikes: string[];
  /** equipment the user does NOT have */
  missingEquipment: Equipment[];
  cuisines: Partial<Record<Cuisine, Wish>>;
  moods: Partial<Record<Mood, Wish>>;
  flavors: Partial<Record<Flavor, Wish>>;
  proteins: Partial<Record<ProteinSource, Wish>>;
  /** hands-on minutes allowed per recipe */
  maxActiveMinutes: number;
  /** recipe ids to skip this week */
  excludeRecipes?: string[];
  /** the person's own star ratings, 1 to 5. 1 star means never plan it */
  ratings?: Record<string, number>;
  /** the person's favorites from setup: recipe id -> place in their ranking for that meal (1 = top pick) */
  rankings?: Record<string, number>;
  /** predicted taste for recipes the person hasn't rated, from recommend(): affinity -1..1 and the liked recipe behind it */
  recommended?: Record<string, { affinity: number; because?: string }>;
}

export interface Variety {
  breakfast: number;
  main: number;
  snack: number;
  /** how lunch and dinner recipes spread over the days: mixed through the week, or one block then the next */
  rotation?: "mix" | "blocks";
}

export interface PriceQuote {
  price: number;
  source: "estimate" | "receipt" | "manual" | "live" | "sale";
  /** for a sale: the price it is usually */
  regular?: number;
  observedAt?: string;
}
/** ingredientId -> chain -> quote (null when the chain doesn't carry it) */
export type PriceTable = Record<string, Partial<Record<ChainId, PriceQuote | null>>>;

export interface PantryItem {
  ingredientId: string;
  /** grams on hand; Infinity for staples you never run out of */
  grams: number;
  /** days left before it spoils, counted from the plan's first day; the planner tries to use it up first */
  daysLeft?: number;
}

export interface Weights {
  /** 0..1 slider: 0 = closest to macros, 1 = cheapest */
  costVsMacros: number;
  /** dollars of "inconvenience" per extra store visited */
  extraStopCost: number;
}

/** A takeout meal placed on one day's eating occasion. Days count from 0. */
/** Someone else eating the plan. Portions scale by kcal against the main person's calories. */
export interface HouseholdMember { id: string; name: string; kcal: number }

export interface EatOut {
  day: number; occasionId: string; itemId: string;
  /** just this week: dropped when the next week starts (otherwise takeout repeats every week) */
  once?: boolean;
}

export interface PlanRequest {
  days: number;
  targets: Targets;
  occasions: EatingOccasion[];
  /** grocery budget for the whole period, dollars */
  budget: number;
  prefs: Preferences;
  variety: Variety;
  stores: ChainId[];
  /** "one" forces a single store; "any" lets the planner split the cart if it's worth the extra stop */
  storeMode: "one" | "any";
  prices: PriceTable;
  pantry: PantryItem[];
  weights?: Partial<Weights>;
  /** recipe ids that must appear (locked by the user) */
  lockedRecipes?: string[];
  /** recipe ids to keep when the plan still works with them (soft), e.g. the rest of the week after a swap */
  preferRecipes?: string[];
  /** recipe sets already shown; the solver must differ from each by at least one recipe */
  avoidSets?: string[][];
  /** solver time limit in seconds */
  timeLimit?: number;
  /** takeout meals that replace prepped ones; their cost comes out of the budget */
  eatingOut?: EatOut[];
  /** other people who eat the same prepped meals, each with their own daily calories */
  household?: HouseholdMember[];
}

export interface PlannedRecipe {
  recipe: Recipe;
  slot: MealType;
  /** how many eating occasions this recipe fills over the period */
  meals: number;
  /** total servings to cook (multiples of 0.25) */
  servings: number;
  /** servings per meal */
  portion: number;
  reasons: string[];
}

export interface CartLine {
  ingredientId: string;
  chain: ChainId;
  packages: number;
  unitPrice: number;
  cost: number;
  priceSource: PriceQuote["source"];
  /** grams the plan uses */
  needGrams: number;
  /** grams left over after the plan (goes to the pantry) */
  leftoverGrams: number;
}

export interface PantryUse { ingredientId: string; grams: number }

export interface DayNutrition { kcal: number; protein: number; carbs: number; fat: number; fiber: number; sodiumMg: number }

export interface PlanResult {
  status: "ok" | "over_budget" | "no_recipes";
  message?: string;
  recipes: PlannedRecipe[];
  /** average per day across the period, prepped food only */
  daily: DayNutrition;
  /** calories reserved for unprepped occasions, per day */
  allowanceKcal: number;
  cart: CartLine[];
  pantryUsed: PantryUse[];
  cost: number;
  stores: ChainId[];
  budget: number;
  /** takeout meals the plan accounted for (invalid ones are dropped) */
  takeout: { meals: EatOut[]; cost: number };
  /** everyone the food is cooked for. servings and the cart already include them */
  household: { people: number; factor: number; members: { id: string; name: string; scale: number; daily: DayNutrition }[] };
  solveMs: number;
}
