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
export function schedule(plan: PlanResult, occasions: EatingOccasion[], days: number, rotation: "mix" | "blocks" = "mix"): Schedule {
  const prepped = occasions.filter((o) => o.prepped);
  const remaining = new Map(plan.recipes.map((p) => [p.recipe.id, p.meals]));
  const byId = new Map(plan.recipes.map((p) => [p.recipe.id, p]));
  const out: ScheduledDay[] = Array.from({ length: days }, (_, d) => ({ day: d, meals: [], takeout: [] }));
  for (const e of plan.takeout?.meals ?? []) {
    const o = occasions.find((x) => x.id === e.occasionId);
    if (o && out[e.day]) out[e.day]!.takeout.push({ occasionId: o.id, occasionName: o.name, itemId: e.itemId });
  }
  // blocks: lunches and dinners run one recipe after another, the one that keeps least first
  const blocks = rotation === "blocks";
  const blockOrder = new Map(plan.recipes.filter((p) => p.slot === "main").sort((a, b) => lifeKey(a) - lifeKey(b) || b.meals - a.meals).map((p, i) => [p.recipe.id, i]));

  for (let d = 0; d < days; d++) {
    for (const o of prepped) {
      if (out[d]!.takeout.some((t) => t.occasionId === o.id)) continue;
      const slot = slotTypeFor(o);
      const options = plan.recipes.filter((p) => p.slot === slot && (remaining.get(p.recipe.id) ?? 0) > 0);
      if (!options.length) continue;
      const usedToday = new Set(out[d]!.meals.map((m) => m.recipeId));
      if (blocks && slot === "main") options.sort((a, b) => blockOrder.get(a.recipe.id)! - blockOrder.get(b.recipe.id)!);
      else options.sort((a, b) =>
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

  // when each recipe is cooked: day 0, or (blocks) fresh just before its block starts
  const cookDay = new Map<string, number>();
  for (const day of out) for (const m of day.meals) if (!cookDay.has(m.recipeId)) cookDay.set(m.recipeId, blocks && byId.get(m.recipeId)!.slot === "main" ? day.day : 0);

  // a later top-up for meals past their fridge life (eating on day d is d - cook + 1 days after cooking)
  const late = new Map<string, { firstDay: number; lastDay: number; portions: number; cook?: number }>();
  const frozen = new Map<string, FreezerNote>();
  for (const day of out) for (const m of day.meals) {
    const r = byId.get(m.recipeId)!.recipe;
    if (day.day - (cookDay.get(r.id) ?? 0) + 1 <= r.fridgeDays) continue;
    if (r.freezerFriendly) {
      const f = frozen.get(r.id) ?? { recipeId: r.id, portions: 0, thawBeforeDay: day.day };
      f.portions += 1;
      f.thawBeforeDay = Math.min(f.thawBeforeDay, day.day);
      frozen.set(r.id, f);
      continue;
    }
    const l = late.get(r.id) ?? { firstDay: day.day, lastDay: day.day, portions: 0 };
    l.portions += m.portion;
    l.lastDay = day.day;
    late.set(r.id, l);
  }
  const freezer: FreezerNote[] = [...frozen.values()];

  // sessions: one per distinct cook day. Late meals join an existing later cook when it keeps them fresh,
  // otherwise one top-up session is added
  const cookDays = [...new Set([0, ...cookDay.values()])];
  let topUp = -1;
  for (const [id, l] of late) {
    const life = byId.get(id)!.recipe.fridgeDays;
    const fits = cookDays.filter((d) => d <= l.firstDay && d > (cookDay.get(id) ?? 0) && l.lastDay - d + 1 <= life);
    l.cook = fits.length ? Math.max(...fits) : undefined;
  }
  const loose = [...late.values()].filter((l) => l.cook == null);
  if (loose.length) { topUp = Math.min(...loose.map((l) => l.firstDay)); for (const l of loose) l.cook = topUp; }
  const sessionDays = [...new Set([...cookDays, ...(topUp >= 0 ? [topUp] : [])])].sort((a, b) => a - b);
  const sessions: PrepSession[] = sessionDays.map((d, index) => ({ index, beforeDay: d, batches: [] }));
  const at = (d: number) => sessions.find((x) => x.beforeDay === d)!;
  const q = (n: number) => Math.round(n * 4) / 4;
  for (const p of plan.recipes) {
    const l = late.get(p.recipe.id);
    const second = l ? q(l.portions) : 0;
    const first = at(cookDay.get(p.recipe.id) ?? 0);
    if (p.servings - second > 0) first.batches.push({ recipeId: p.recipe.id, servings: q(p.servings - second) });
    if (second > 0) at(l!.cook!).batches.push({ recipeId: p.recipe.id, servings: second });
  }
  for (const day of out) for (const m of day.meals) {
    const l = late.get(m.recipeId);
    const d = l && day.day >= l.firstDay ? l.cook! : cookDay.get(m.recipeId) ?? 0;
    m.fromSession = at(d).index;
  }
  // a session left with nothing to cook (all its food came from elsewhere) is dropped
  const kept = sessions.filter((x) => x.batches.length);
  const remap = new Map(kept.map((x, i) => [x.index, i]));
  for (const day of out) for (const m of day.meals) m.fromSession = remap.get(m.fromSession) ?? 0;
  kept.forEach((x, i) => (x.index = i));
  return { days: out, sessions: kept.length ? kept : [{ index: 0, beforeDay: 0, batches: [] }], freezer };
}

/**
 * Bigger portions on training days and smaller ones on rest days. Each recipe keeps the total it
 * was cooked for: its portions follow the day scales, then are rescaled so they add up to the same
 * amount as before. Portions round to 0.05 of a serving.
 * @param scales one multiplier per plan day (1 = the plan's average day)
 */
export function scalePortions(s: Schedule, scales: readonly number[]): Schedule {
  if (!scales.length || scales.every((x) => Math.abs(x - 1) < 0.005)) return s;
  const plain = new Map<string, number>();
  const scaled = new Map<string, number>();
  for (const day of s.days) for (const m of day.meals) {
    const k = scales[day.day] ?? 1;
    plain.set(m.recipeId, (plain.get(m.recipeId) ?? 0) + m.portion);
    scaled.set(m.recipeId, (scaled.get(m.recipeId) ?? 0) + m.portion * k);
  }
  const r = (n: number) => Math.round(n * 20) / 20;
  return {
    ...s,
    days: s.days.map((day) => ({
      ...day,
      meals: day.meals.map((m) => {
        const norm = (plain.get(m.recipeId) ?? 0) / Math.max(1e-9, scaled.get(m.recipeId) ?? 0);
        return { ...m, portion: r(m.portion * (scales[day.day] ?? 1) * norm) };
      }),
    })),
  };
}
