import highsLoader from "highs";
import { defaultOccasions, targetsFromSplit, SPLIT_PRESETS } from "@prep-cart/nutrition";
import { INGREDIENTS } from "@prep-cart/catalog";
import { buildPriceTable, type PlanRequest } from "../src";

export const highsPromise = highsLoader();

export function baseRequest(over: Partial<PlanRequest> = {}): PlanRequest {
  return {
    days: 7,
    targets: targetsFromSplit(2200, SPLIT_PRESETS.highProtein.split),
    occasions: defaultOccasions(3, 2),
    budget: 75,
    prefs: { diets: [], allergens: [], dislikes: [], missingEquipment: [], cuisines: {}, moods: {}, flavors: {}, proteins: {}, maxActiveMinutes: 60 },
    variety: { breakfast: 1, main: 2, snack: 1 },
    stores: ["aldi", "gianteagle", "walmart", "traderjoes"],
    storeMode: "one",
    prices: buildPriceTable(),
    pantry: Object.values(INGREDIENTS).filter((i) => i.staple).map((i) => ({ ingredientId: i.id, grams: Infinity })),
    ...over,
  };
}
