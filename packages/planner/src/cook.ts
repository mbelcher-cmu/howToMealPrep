import type { Equipment, Recipe } from "@prep-cart/catalog";
import { scaledActive, type Batch } from "./timeline";

/**
 * Prep-day scheduler that knows about the kitchen: one cook, a two-rack oven, four burners and one of
 * each small appliance. Hands-on work is done one recipe at a time; cooking that runs on its own
 * (roasting, simmering, slow cooking) happens in parallel as long as the appliance has room.
 */

/** Where a step happens. "counter" is hands-on work that needs no appliance. */
export type Station = "counter" | "oven" | "stovetop" | "slowCooker" | "pressureCooker" | "airFryer" | "grill" | "microwave" | "fridge";
export type Kitchen = Partial<Record<Exclude<Station, "counter" | "fridge">, number>>;
/** A typical home kitchen: two oven racks, four burners, one of everything else. */
export const DEFAULT_KITCHEN: Required<Kitchen> = { oven: 2, stovetop: 4, slowCooker: 1, pressureCooker: 1, airFryer: 1, grill: 1, microwave: 1 };

export const STATION_LABEL: Record<Station, string> = {
  counter: "Counter", oven: "Oven", stovetop: "Stovetop", slowCooker: "Slow cooker", pressureCooker: "Pressure cooker",
  airFryer: "Air fryer", grill: "Grill", microwave: "Microwave", fridge: "Fridge",
};

/** Minutes an oven needs to heat up. */
export const PREHEAT_MINUTES = 12;

export interface CookStep {
  id: string;
  /** minutes from the start of the session */
  at: number;
  minutes: number;
  recipeId: string | null;
  /** handsOn and pack need the cook; waiting runs on its own and has a timer */
  kind: "handsOn" | "waiting" | "pack" | "preheat";
  station: Station;
  text: string;
  /** for waiting steps: what to do when the timer goes off */
  whenDone?: string;
}

export interface CookPlan {
  steps: CookStep[];
  totalMinutes: number;
  handsOnMinutes: number;
  /** minutes it would take doing each recipe start to finish, one after another */
  oneAtATimeMinutes: number;
  containers: number;
  /** stations used, in the order they first come up */
  stations: Station[];
}

const COOK_PRIORITY: Equipment[] = ["slowCooker", "pressureCooker", "oven", "airFryer", "grill", "stovetop", "microwave"];

/** The appliance a recipe's unattended time runs on. Recipes with no cooking set in the fridge. */
export function cookStation(r: Recipe): Station {
  const hit = COOK_PRIORITY.find((e) => r.equipment.includes(e));
  return (hit as Station | undefined) ?? "fridge";
}

/** Hands-on work happens at the stove when the recipe uses one, otherwise on the counter. */
export function handsOnStation(r: Recipe): Station {
  return r.equipment.includes("stovetop") ? "stovetop" : "counter";
}

const WAIT_TEXT: Record<Station, (n: string) => string> = {
  counter: (n) => `${n} resting`,
  oven: (n) => `${n} in the oven`,
  stovetop: (n) => `${n} simmering on the stove`,
  slowCooker: (n) => `${n} in the slow cooker`,
  pressureCooker: (n) => `${n} under pressure`,
  airFryer: (n) => `${n} in the air fryer`,
  grill: (n) => `${n} on the grill`,
  microwave: (n) => `${n} in the microwave`,
  fridge: (n) => `${n} setting in the fridge`,
};
const DONE_TEXT: Record<Station, string> = {
  counter: "Move on to portioning.",
  oven: "Take it out of the oven and let it cool on the counter.",
  stovetop: "Turn off the burner and let it cool, uncovered.",
  slowCooker: "Switch the slow cooker off and let it cool.",
  pressureCooker: "Release the pressure, open the lid and let it cool.",
  airFryer: "Take it out of the air fryer and let it cool.",
  grill: "Take it off the grill and let it rest.",
  microwave: "Take it out and stir.",
  fridge: "It's ready to portion.",
};

interface Item extends Batch { active: number; waiting: number; cook: Station; hands: Station }
interface Busy { station: Station; from: number; to: number }

const capacity = (k: Required<Kitchen>, s: Station) => (s === "counter" || s === "fridge" ? Infinity : Math.max(1, k[s]));

/** Is there room on the station for the whole interval? */
function fits(busy: Busy[], k: Required<Kitchen>, s: Station, from: number, to: number): boolean {
  if (to <= from) return true;
  const cap = capacity(k, s);
  if (cap === Infinity) return true;
  // the peak overlap inside [from, to) happens at one of the interval starts
  const points = [from, ...busy.filter((b) => b.station === s && b.from > from && b.from < to).map((b) => b.from)];
  return points.every((p) => busy.filter((b) => b.station === s && b.from <= p && b.to > p).length < cap);
}

/** The earliest time from `t` the item can start without overfilling its stations. */
function earliestStart(it: Item, t: number, busy: Busy[], k: Required<Kitchen>, ovenReady: number): number {
  const candidates = [t, ...busy.map((b) => b.to), ...busy.map((b) => b.to - it.active)].filter((x) => x >= t).sort((a, b) => a - b);
  for (const c of candidates) {
    const start = it.cook === "oven" && it.waiting > 0 ? Math.max(c, ovenReady - it.active) : c;
    const handsOk = it.hands === "counter" || fits(busy, k, it.hands, start, start + it.active + (it.cook === it.hands ? it.waiting : 0));
    const cookOk = it.waiting === 0 || it.cook === it.hands || fits(busy, k, it.cook, start + it.active, start + it.active + it.waiting);
    if (handsOk && cookOk) return start;
  }
  return Math.max(t, ...busy.map((b) => b.to));
}

export function batchWord(recipe: Recipe, servings: number): string {
  const scale = Math.round((servings / recipe.servings) * 4) / 4;
  const whole = Math.floor(scale);
  const frac = ["", "¼", "½", "¾"][Math.round((scale - whole) * 4)]!;
  return scale === 1 ? "as written" : `${whole === 0 && frac ? frac : `${whole}${frac}`}× batch`;
}

/**
 * Plan a cook session. At each point the cook picks, among the recipes left, the one that can start
 * soonest, preferring the one with the longest unattended time so the oven and stove are working
 * while the cook chops.
 */
export function cookPlan(batches: Batch[], kitchen: Kitchen = {}): CookPlan {
  const k = { ...DEFAULT_KITCHEN, ...kitchen };
  const items: Item[] = batches
    .filter((b) => b.servings > 0)
    .map((b) => ({ ...b, active: scaledActive(b.recipe, b.servings), waiting: Math.max(0, b.recipe.totalMinutes - b.recipe.activeMinutes), cook: cookStation(b.recipe), hands: handsOnStation(b.recipe) }))
    .sort((a, b) => b.waiting - a.waiting || b.active - a.active || a.recipe.id.localeCompare(b.recipe.id));
  const steps: CookStep[] = [];
  const busy: Busy[] = [];
  let cookFree = 0;
  let doneAt = 0;
  let ovenReady = Infinity;
  if (items.some((it) => it.cook === "oven" && it.waiting > 0)) {
    steps.push({ id: "preheat", at: 0, minutes: 1, recipeId: null, kind: "preheat", station: "oven", text: "Turn the oven on to preheat", whenDone: "The oven is hot." });
    cookFree = 1;
    ovenReady = PREHEAT_MINUTES;
  }
  const left = [...items];
  while (left.length) {
    let best = 0;
    let bestAt = Infinity;
    left.forEach((it, i) => {
      const at = earliestStart(it, cookFree, busy, k, ovenReady);
      if (at < bestAt) { best = i; bestAt = at; }
    });
    const it = left.splice(best, 1)[0]!;
    const start = bestAt;
    const name = it.recipe.name;
    steps.push({ id: `${it.recipe.id}:prep`, at: start, minutes: it.active, recipeId: it.recipe.id, kind: "handsOn", station: it.hands, text: `Make ${name} (${batchWord(it.recipe, it.servings)})` });
    const cookStart = start + it.active;
    if (it.hands !== "counter") busy.push({ station: it.hands, from: start, to: cookStart + (it.cook === it.hands ? it.waiting : 0) });
    if (it.waiting > 0) {
      if (it.cook !== it.hands && it.cook !== "fridge") busy.push({ station: it.cook, from: cookStart, to: cookStart + it.waiting });
      steps.push({ id: `${it.recipe.id}:wait`, at: cookStart, minutes: it.waiting, recipeId: it.recipe.id, kind: "waiting", station: it.cook, text: WAIT_TEXT[it.cook](name), whenDone: DONE_TEXT[it.cook] });
    }
    cookFree = cookStart;
    doneAt = Math.max(doneAt, cookStart + it.waiting);
  }
  const containers = items.reduce((a, it) => a + Math.max(1, Math.round(it.servings / Math.max(0.25, it.portion))), 0);
  const packAt = Math.max(doneAt, cookFree);
  const packMinutes = items.length ? 5 + containers : 0;
  if (items.length) steps.push({ id: "pack", at: packAt, minutes: packMinutes, recipeId: null, kind: "pack", station: "counter", text: `Portion and label ${containers} containers`, whenDone: "Get everything in the fridge within 2 hours of cooking." });
  const order = { preheat: 0, handsOn: 1, waiting: 2, pack: 3 } as const;
  steps.sort((a, b) => a.at - b.at || order[a.kind] - order[b.kind]);
  const handsOnMinutes = steps.filter((s) => s.kind !== "waiting").reduce((a, s) => a + s.minutes, 0);
  const oneAtATimeMinutes = items.reduce((a, it) => a + it.active + it.waiting, 0) + packMinutes + (ovenReady === Infinity ? 0 : PREHEAT_MINUTES);
  const stations = [...new Set(steps.map((s) => s.station))];
  return { steps: items.length ? steps : [], totalMinutes: items.length ? packAt + packMinutes : 0, handsOnMinutes: items.length ? handsOnMinutes : 0, oneAtATimeMinutes: items.length ? oneAtATimeMinutes : 0, containers, stations: items.length ? stations : [] };
}

/** Storage and reheating advice for a cooked batch. */
export interface StorageNote {
  recipeId: string;
  fridgeDays: number;
  freezer: boolean;
  /** how to reheat; the recipe's own note when it has one */
  reheat: string;
  /** a short line for the container label */
  label: string;
}

export function storageNote(r: Recipe): StorageNote {
  const station = cookStation(r);
  const reheat = r.reheat
    ?? (station === "fridge" ? "Eat cold."
      : r.mealType === "snack" ? "Eat cold or at room temperature."
      : r.mealType === "breakfast" ? "Microwave 45 to 60 seconds."
      : station === "oven" || station === "airFryer"
        ? "Microwave 2 to 3 minutes until steaming, or 10 minutes at 350°F (air fryer 5 minutes) to keep it crisp."
        : "Microwave 2 to 3 minutes, stirring halfway, until steaming hot all the way through.");
  const fridgeDays = Math.max(1, r.fridgeDays);
  return {
    recipeId: r.id, fridgeDays, freezer: r.freezerFriendly, reheat,
    label: `${r.name}. Fridge ${fridgeDays} day${fridgeDays === 1 ? "" : "s"}${r.freezerFriendly ? ", freezes 3 months" : ""}.`,
  };
}
