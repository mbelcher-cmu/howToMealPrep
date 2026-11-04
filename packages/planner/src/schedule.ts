import type { EatingOccasion } from "@prep-cart/nutrition";
import { slotTypeFor } from "./filters";
import type { PlanResult, PlannedRecipe } from "./types";

export interface ScheduledMeal { occasionId: string; occasionName: string; recipeId: string; portion: number; fromSession: number }
export interface ScheduledTakeout { occasionId: string; occasionName: string; itemId: string }
export interface ScheduledDay { day: number; meals: ScheduledMeal[]; takeout: ScheduledTakeout[] }
export interface PrepSession {
  index: number;
  /** cook the evening before this day index (0 = before day 1) */
  beforeDay: number;
  batches: { recipeId: string; servings: number }[];
}
export interface FreezerNote { recipeId: string; portions: number; thawBeforeDay: number }
export interface Schedule { days: ScheduledDay[]; sessions: PrepSession[]; freezer: FreezerNote[] }

/** Days a recipe is good for after cooking (freezer-friendly recipes can wait in the freezer). */
const lifeKey = (p: PlannedRecipe) => (p.recipe.freezerFriendly ? 100 + p.recipe.fridgeDays : p.recipe.fridgeDays);

/**
 * Lay a plan onto a calendar. Short-lived recipes are eaten first, the same recipe is kept off two
 * occasions on one day where possible, and anything eaten past its fridge life gets a second cook
 * session (or a freezer note, when it freezes well).
 */
export function schedule(plan: PlanResult, occasions: EatingOccasion[], days: number): Schedule {
  const prepped = occasions.filter((o) => o.prepped);
  const remaining = new Map(plan.recipes.map((p) => [p.recipe.id, p.meals]));
  const byId = new Map(plan.recipes.map((p) => [p.recipe.id, p]));
  const out: ScheduledDay[] = Array.from({ length: days }, (_, d) => ({ day: d, meals: [], takeout: [] }));
  for (const e of plan.takeout?.meals ?? []) {
    const o = occasions.find((x) => x.id === e.occasionId);
    if (o && out[e.day]) out[e.day]!.takeout.push({ occasionId: o.id, occasionName: o.name, itemId: e.itemId });
  }

  for (let d = 0; d < days; d++) {
    for (const o of prepped) {
      if (out[d]!.takeout.some((t) => t.occasionId === o.id)) continue;
      const slot = slotTypeFor(o);
      const options = plan.recipes.filter((p) => p.slot === slot && (remaining.get(p.recipe.id) ?? 0) > 0);
      if (!options.length) continue;
      const usedToday = new Set(out[d]!.meals.map((m) => m.recipeId));
      options.sort((a, b) =>
        Number(usedToday.has(a.recipe.id)) - Number(usedToday.has(b.recipe.id)) ||
        // a recipe that would otherwise run past its life goes first
        lifeKey(a) - lifeKey(b) ||
        (remaining.get(b.recipe.id)! - remaining.get(a.recipe.id)!),
      );
      const pick = options[0]!;
      remaining.set(pick.recipe.id, remaining.get(pick.recipe.id)! - 1);
      out[d]!.meals.push({ occasionId: o.id, occasionName: o.name, recipeId: pick.recipe.id, portion: pick.portion, fromSession: 0 });
    }
  }

  // second session for meals past their fridge life (eating on day d is d+1 days after cooking)
  const late = new Map<string, { firstDay: number; portions: number }>();
  const freezer: FreezerNote[] = [];
  const frozen = new Map<string, FreezerNote>();
  for (const day of out) for (const m of day.meals) {
    const r = byId.get(m.recipeId)!.recipe;
    if (day.day + 1 <= r.fridgeDays) continue;
    if (r.freezerFriendly) {
      const f = frozen.get(r.id) ?? { recipeId: r.id, portions: 0, thawBeforeDay: day.day };
      f.portions += 1;
      f.thawBeforeDay = Math.min(f.thawBeforeDay, day.day);
      frozen.set(r.id, f);
      continue;
    }
    const l = late.get(r.id) ?? { firstDay: day.day, portions: 0 };
    l.portions += m.portion;
    late.set(r.id, l);
  }
  freezer.push(...frozen.values());

  const sessions: PrepSession[] = [{ index: 0, beforeDay: 0, batches: [] }];
  const secondDay = late.size ? Math.min(...[...late.values()].map((l) => l.firstDay)) : -1;
  if (late.size) sessions.push({ index: 1, beforeDay: secondDay, batches: [] });
  for (const p of plan.recipes) {
    const l = late.get(p.recipe.id);
    const second = l ? Math.round(l.portions * 4) / 4 : 0;
    if (p.servings - second > 0) sessions[0]!.batches.push({ recipeId: p.recipe.id, servings: Math.round((p.servings - second) * 4) / 4 });
    if (second > 0) sessions[1]!.batches.push({ recipeId: p.recipe.id, servings: second });
  }
  if (late.size) for (const day of out) for (const m of day.meals) {
    if (late.has(m.recipeId) && day.day >= secondDay) m.fromSession = 1;
  }
  return { days: out, sessions, freezer };
}
