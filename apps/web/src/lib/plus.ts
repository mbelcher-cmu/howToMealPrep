import { RECIPES, type Recipe } from "@prep-cart/catalog";
import { hardRejection, type Preferences } from "@prep-cart/planner";

/**
 * Prep Cart Plus, the planned paid tier. Nothing is charged yet: the person can preview Plus on their
 * own device. Each feature says what it runs on today and what it needs before it can launch for real.
 */
export interface PlusFeature { id: string; title: string; body: string; today: string; needs: string }

export const PLUS_FEATURES: PlusFeature[] = [
  { id: "swaps", title: "Smart meal swaps", body: "Swap any recipe for one with nearly the same macros, and the plan rebalances around it.", today: "Works now as a preview, matching recipes by their macros.", needs: "AI-written swaps and new recipes need a paid model API." },
  { id: "live", title: "Live store prices", body: "Prices and stock from your actual store, refreshed every week.", today: "Uses estimates plus the prices and sales you enter.", needs: "A grocery data partner, such as the Instacart Developer Platform." },
  { id: "stores", title: "Every store near you", body: "Plan with Kroger, Target, Safeway, Publix, Wegmans and more, not just four chains.", today: "Stores are found nationwide, but only four chains have prices.", needs: "Price data for more chains (same partner as live prices)." },
  { id: "sync", title: "Sync across devices", body: "Your plans, pantry and household on your phone and laptop, with community ratings on recipes.", today: "Everything stays in this browser. Backups move it by hand.", needs: "Accounts and a small database, which free tiers can cover at first." },
];

/** Recipes closest in macros to this one, for the same meal, that fit the person's rules. */
export function swapSuggestions(r: Recipe, prefs: Preferences, exclude: string[] = [], count = 3): Recipe[] {
  const n = r.perServing;
  const dist = (x: Recipe) => {
    // compare per serving, scaled to the same calories so portion size doesn't decide it
    const k = n.kcal / Math.max(1, x.perServing.kcal);
    const p = x.perServing;
    return Math.abs(p.protein * k - n.protein) * 4 + Math.abs(p.carbs * k - n.carbs) * 4 + Math.abs(p.fat * k - n.fat) * 9;
  };
  return RECIPES.filter((x) => x.mealType === r.mealType && x.id !== r.id && !exclude.includes(x.id) && !hardRejection(x, prefs))
    .sort((a, b) => dist(a) - dist(b))
    .slice(0, count);
}
