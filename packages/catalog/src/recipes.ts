import { kcalFromMacros } from "@prep-cart/nutrition";
import { INGREDIENTS, PROCESSED } from "./ingredients";
import { RECIPE_SEEDS } from "./recipes.data";
import type { Nutrition, Recipe, RecipeSeed } from "./recipe-types";
import { ALLERGENS, CUISINES, EQUIPMENT, FLAVORS, MOODS, PROTEIN_SOURCES, type Allergen, type Diet, type MealType } from "./taxonomy";

const words = (s: string) => s.split(/\s+/).filter(Boolean);

function checkTags<T extends string>(recipeId: string, field: string, values: string[], allowed: Record<string, unknown>): T[] {
  for (const v of values) if (!(v in allowed)) throw new Error(`Recipe ${recipeId}: unknown ${field} "${v}"`);
  return values as T[];
}

export function nutritionOf(lines: { ingredientId: string; grams: number }[], servings: number): Nutrition {
  const t = { protein: 0, carbs: 0, fat: 0, fiber: 0, sodiumMg: 0 };
  for (const l of lines) {
    const ing = INGREDIENTS[l.ingredientId];
    if (!ing) throw new Error(`Unknown ingredient ${l.ingredientId}`);
    const k = l.grams / 100;
    t.protein += ing.per100g.protein * k; t.carbs += ing.per100g.carbs * k; t.fat += ing.per100g.fat * k;
    t.fiber += ing.per100g.fiber * k; t.sodiumMg += ing.per100g.sodiumMg * k;
  }
  const per = {
    protein: round1(t.protein / servings), carbs: round1(t.carbs / servings), fat: round1(t.fat / servings),
    fiber: round1(t.fiber / servings), sodiumMg: Math.round(t.sodiumMg / servings),
  };
  return { ...per, kcal: Math.round(kcalFromMacros(per)) };
}
const round1 = (n: number) => Math.round(n * 10) / 10;

function dietsFor(lines: { ingredientId: string }[], allergens: Set<Allergen>, per: Nutrition): Diet[] {
  const animals = new Set(lines.map((l) => INGREDIENTS[l.ingredientId]!.animal).filter(Boolean));
  const meat = animals.has("poultry") || animals.has("beef") || animals.has("pork");
  const sea = animals.has("fish") || animals.has("shellfish");
  const gluten = lines.some((l) => INGREDIENTS[l.ingredientId]!.gluten);
  const out: Diet[] = ["omnivore"];
  if (!meat) out.push("pescatarian");
  if (!meat && !sea) out.push("vegetarian");
  if (!meat && !sea && !animals.has("dairy") && !animals.has("egg") && !lines.some((l) => l.ingredientId === "honey")) out.push("vegan");
  if (!gluten) out.push("glutenFree");
  if (!allergens.has("milk")) out.push("dairyFree");
  if (!animals.has("pork")) out.push("noPork");
  if (per.carbs <= 25) out.push("lowCarb");
  if (per.carbs - per.fiber <= 10) out.push("keto");
  if (!lines.some((l) => PROCESSED.has(l.ingredientId))) out.push("wholeFoods");
  return out;
}

/** The processed ingredients in a recipe (empty when it fits a whole-foods plan). */
export function processedIn(r: { lines: { ingredientId: string }[] }): string[] {
  return [...new Set(r.lines.map((l) => l.ingredientId).filter((id) => PROCESSED.has(id)))];
}

export function buildRecipe(s: RecipeSeed): Recipe {
  if (!["breakfast", "main", "snack"].includes(s.meal)) throw new Error(`Recipe ${s.id}: bad meal type ${s.meal}`);
  const lines = s.items.map(([ingredientId, grams]) => {
    if (!INGREDIENTS[ingredientId]) throw new Error(`Recipe ${s.id}: unknown ingredient ${ingredientId}`);
    if (!(grams > 0)) throw new Error(`Recipe ${s.id}: bad amount for ${ingredientId}`);
    return { ingredientId, grams };
  });
  const perServing = nutritionOf(lines, s.meta.serv);
  const allergens = new Set<Allergen>(lines.flatMap((l) => INGREDIENTS[l.ingredientId]!.allergens));
  for (const a of allergens) if (!(a in ALLERGENS)) throw new Error(`Recipe ${s.id}: unknown allergen ${a}`);
  return {
    id: s.id, name: s.name, mealType: s.meal as MealType,
    cuisines: checkTags(s.id, "cuisine", words(s.cuisines), CUISINES),
    moods: checkTags(s.id, "mood", words(s.moods), MOODS),
    flavors: checkTags(s.id, "flavor", words(s.flavors), FLAVORS),
    proteins: checkTags(s.id, "protein", words(s.protein), PROTEIN_SOURCES),
    equipment: checkTags(s.id, "equipment", words(s.equipment), EQUIPMENT),
    skill: s.meta.skill ?? (s.meta.active > 25 ? "intermediate" : "beginner"),
    servings: s.meta.serv, activeMinutes: s.meta.active, totalMinutes: s.meta.total,
    fridgeDays: s.meta.fridge, freezerFriendly: !!s.meta.freezer, reheat: s.meta.reheat ?? null, cookFresh: !!s.meta.fresh,
    lines, steps: s.steps, perServing, allergens: [...allergens].sort(), diets: dietsFor(lines, allergens, perServing),
  };
}

export const RECIPES: Recipe[] = RECIPE_SEEDS.map(buildRecipe);
export const RECIPES_BY_ID: Record<string, Recipe> = Object.fromEntries(RECIPES.map((r) => [r.id, r]));

/** Add the person's own recipes (ids start with "custom_") to the library, replacing earlier ones. */
export function registerRecipes(list: Recipe[]): void {
  for (let i = RECIPES.length - 1; i >= 0; i--) if (RECIPES[i]!.id.startsWith("custom_")) { delete RECIPES_BY_ID[RECIPES[i]!.id]; RECIPES.splice(i, 1); }
  for (const r of list) { if (!r.id.startsWith("custom_")) continue; RECIPES.push(r); RECIPES_BY_ID[r.id] = r; }
}
