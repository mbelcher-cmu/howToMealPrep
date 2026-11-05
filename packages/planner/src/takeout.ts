import { menuFit, type MealType, type MenuItem } from "@prep-cart/catalog";
import type { EatOut } from "./types";

type Macros = { kcal: number; protein: number; carbs: number; fat: number };

/** One meal of the day that takeout may fill, with that meal's share of the day's targets. */
export interface TakeoutSlot { occasionId: string; kind: MealType; target: Macros }

export interface TakeoutRequest {
  /** days in the plan */
  days: number;
  /** the meals takeout may replace, e.g. just dinner */
  slots: TakeoutSlot[];
  /** how many takeout meals to add */
  count: number;
  /** most to spend on the new meals together, dollars */
  maxSpend: number;
  /** menu items the person can order (already filtered by diet and by what's nearby) */
  items: MenuItem[];
  /** takeout already in the week: those meals stay as they are and their days count as busy */
  taken?: EatOut[];
}

export interface TakeoutSuggestion {
  meals: EatOut[];
  cost: number;
  /** how many of the asked-for meals didn't fit the spend cap or the free meals */
  short: number;
}

/**
 * Picks takeout meals for the week. Each pick is the menu item that best fits that meal's
 * targets (menuFit), nudged toward cheaper items, spread across the week, and varied: a day that
 * already has takeout, a day next to one, a chain used before, or the same item again all cost a
 * little. Greedy, so it's instant; the planner then rebalances the cooking around the picks.
 */
export function suggestTakeout(req: TakeoutRequest): TakeoutSuggestion {
  const taken = req.taken ?? [];
  const busy = new Set(taken.map((e) => `${e.day}:${e.occasionId}`));
  const outDays = new Set(taken.map((e) => e.day));
  const chainUses = new Map<string, number>();
  const itemUses = new Map<string, number>();
  const chosen: EatOut[] = [];
  let budget = Math.max(0, req.maxSpend);
  let cost = 0;

  // best few items for each slot; the same list serves every day
  const ranked = req.slots.map((slot) => ({
    slot,
    options: req.items
      .filter((m) => m.mealType === slot.kind)
      .map((m) => ({ m, fit: menuFit(m, slot.target) }))
      .sort((a, b) => a.fit - b.fit)
      .slice(0, 12),
  }));
  const avgPrice = req.items.length ? req.items.reduce((a, m) => a + m.price, 0) / req.items.length : 10;

  for (let n = 0; n < req.count; n++) {
    let best: { e: EatOut; m: MenuItem; score: number } | null = null;
    for (let day = 0; day < req.days; day++) {
      const nearest = [...outDays].reduce((d, x) => Math.min(d, Math.abs(x - day)), Infinity);
      const dayPenalty = nearest === 0 ? 1.2 : nearest === Infinity ? 0 : 0.6 / (1 + nearest);
      for (const { slot, options } of ranked) {
        if (busy.has(`${day}:${slot.occasionId}`)) continue;
        for (const { m, fit } of options) {
          if (m.price > budget + 1e-9) continue;
          const score = fit + 0.15 * (m.price / avgPrice) + dayPenalty
            + 0.25 * (chainUses.get(m.restaurantId) ?? 0) + 0.5 * (itemUses.get(m.id) ?? 0)
            // a hair later in the week on ties, where eating out is more common
            - day * 1e-4;
          if (!best || score < best.score) best = { e: { day, occasionId: slot.occasionId, itemId: m.id }, m, score };
        }
      }
    }
    if (!best) break;
    chosen.push(best.e);
    busy.add(`${best.e.day}:${best.e.occasionId}`);
    outDays.add(best.e.day);
    chainUses.set(best.m.restaurantId, (chainUses.get(best.m.restaurantId) ?? 0) + 1);
    itemUses.set(best.m.id, (itemUses.get(best.m.id) ?? 0) + 1);
    budget -= best.m.price;
    cost += best.m.price;
  }
  return { meals: chosen.sort((a, b) => a.day - b.day), cost: Math.round(cost * 100) / 100, short: req.count - chosen.length };
}

/**
 * What a prepped meal costs per person on average this week, so takeout can be compared to it.
 * Grocery cost spread over every prepped meal for everyone eating; 0 when nothing is prepped.
 */
export function cookedMealCost(r: { cost: number; recipes: { meals: number }[]; household: { factor: number } }): number {
  const meals = r.recipes.reduce((a, p) => a + p.meals, 0) * Math.max(1, r.household.factor);
  return meals > 0 ? Math.round((r.cost / meals) * 100) / 100 : 0;
}
