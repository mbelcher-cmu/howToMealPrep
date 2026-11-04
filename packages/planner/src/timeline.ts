import type { Recipe } from "@prep-cart/catalog";

export interface Batch { recipe: Recipe; servings: number; /** servings per container */ portion: number }
export interface TimelineStep {
  /** minutes from the start of the session */
  at: number;
  minutes: number;
  recipeId: string | null;
  kind: "handsOn" | "waiting" | "pack";
  text: string;
}
export interface Timeline { steps: TimelineStep[]; totalMinutes: number; handsOnMinutes: number; containers: number }

/** Hands-on time grows with batch size, but less than linearly (chopping 2 onions is not twice the work). */
export function scaledActive(r: Recipe, servings: number): number {
  const scale = servings / r.servings;
  return Math.max(2, Math.round(r.activeMinutes * (0.6 + 0.4 * scale)));
}

/**
 * Order a cook session so the person is never idle while something could be cooking:
 * recipes with the longest unattended time (oven, slow cooker, simmering) start first,
 * and each next recipe's hands-on work happens while the earlier ones cook.
 */
export function prepTimeline(batches: Batch[]): Timeline {
  const items = batches
    .filter((b) => b.servings > 0)
    .map((b) => ({ ...b, active: scaledActive(b.recipe, b.servings), waiting: Math.max(0, b.recipe.totalMinutes - b.recipe.activeMinutes) }))
    .sort((a, b) => b.waiting - a.waiting || b.active - a.active);
  const steps: TimelineStep[] = [];
  let busyUntil = 0;
  let doneAt = 0;
  for (const it of items) {
    const start = busyUntil;
    steps.push({ at: start, minutes: it.active, recipeId: it.recipe.id, kind: "handsOn", text: `Start ${it.recipe.name} (${batchWord(it)})` });
    busyUntil = start + it.active;
    if (it.waiting > 0) steps.push({ at: busyUntil, minutes: it.waiting, recipeId: it.recipe.id, kind: "waiting", text: `${it.recipe.name} cooks on its own` });
    doneAt = Math.max(doneAt, busyUntil + it.waiting);
  }
  const containers = items.reduce((a, it) => a + Math.max(1, Math.round(it.servings / Math.max(0.25, it.portion))), 0);
  const packAt = Math.max(doneAt, busyUntil);
  const packMinutes = items.length ? 5 + containers : 0;
  if (items.length) steps.push({ at: packAt, minutes: packMinutes, recipeId: null, kind: "pack", text: `Cool, portion and label ${containers} containers` });
  steps.sort((a, b) => a.at - b.at || (a.kind === "handsOn" ? -1 : 1));
  const handsOn = items.reduce((a, it) => a + it.active, 0) + packMinutes;
  return { steps, totalMinutes: packAt + packMinutes, handsOnMinutes: handsOn, containers };
}

const batchWord = (it: { recipe: Recipe; servings: number }) => {
  const scale = Math.round((it.servings / it.recipe.servings) * 100) / 100;
  return scale === 1 ? "as written" : `${scale}× batch`;
};

/** Containers needed for a whole plan, split by fridge and freezer. */
export function containerCounts(meals: { recipeId: string; freezer: boolean }[]): { fridge: number; freezer: number } {
  return meals.reduce((a, m) => (m.freezer ? { ...a, freezer: a.freezer + 1 } : { ...a, fridge: a.fridge + 1 }), { fridge: 0, freezer: 0 });
}
