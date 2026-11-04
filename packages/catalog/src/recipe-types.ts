import type { Cuisine, Diet, Equipment, Flavor, MealType, Mood, ProteinSource, Skill, Allergen } from "./taxonomy";

export interface RecipeSeed {
  id: string; name: string; meal: string; cuisines: string; moods: string; flavors: string; protein: string; equipment: string;
  meta: { serv: number; active: number; total: number; fridge: number; freezer?: boolean; skill?: Skill; reheat?: string };
  items: [string, number][];
  steps: string[];
}

export interface Nutrition {
  kcal: number; protein: number; carbs: number; fat: number; fiber: number; sodiumMg: number;
}

export interface RecipeLine { ingredientId: string; grams: number }

export interface Recipe {
  id: string;
  name: string;
  mealType: MealType;
  cuisines: Cuisine[];
  moods: Mood[];
  flavors: Flavor[];
  proteins: ProteinSource[];
  equipment: Equipment[];
  skill: Skill;
  servings: number;
  activeMinutes: number;
  totalMinutes: number;
  fridgeDays: number;
  freezerFriendly: boolean;
  reheat: string | null;
  lines: RecipeLine[];
  steps: string[];
  /** per serving; kcal derived from macros (4/4/9) */
  perServing: Nutrition;
  allergens: Allergen[];
  /** diets this recipe satisfies */
  diets: Diet[];
}
