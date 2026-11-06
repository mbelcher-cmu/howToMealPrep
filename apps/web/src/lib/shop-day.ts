/**
 * When the person shops, when their plan starts, and how often they cook. Pure date math, kept free
 * of the browser so it can be tested. Dates are YYYY-MM-DD in local time; weekdays count from
 * Monday = 0, like weekStart.
 */
const at = (iso: string) => new Date(`${iso}T12:00:00`);
const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
export const plusDays = (iso: string, n: number) => { const d = at(iso); d.setDate(d.getDate() + n); return fmt(d); };

/** True when the person makes breakfast fresh each morning (eggs and toast) instead of prepping it. */
export const freshBreakfast = (occasions: { kind: string; name: string; prepped: boolean; fresh?: boolean }[]) =>
  occasions.some((o) => o.kind === "meal" && o.prepped && !!o.fresh && /breakfast/i.test(o.name));

/** Recipes that can fill a meal: made-fresh breakfasts only when breakfast is made fresh, and then only those. */
export const fitsBreakfastMode = (r: { mealType: string; cookFresh: boolean }, fresh: boolean) => r.mealType !== "breakfast" || r.cookFresh === fresh;

/** Weekday of a date, Monday = 0. */
export const weekdayOf = (iso: string) => (at(iso).getDay() + 6) % 7;

/** Cooked food tastes best eaten within this many days of cooking. */
export const FRESH_DAYS = 3;

/** Cook days that keep every meal within FRESH_DAYS of being cooked (1 to 3). */
export function suggestedCookDays(days: number): number {
  return Math.max(1, Math.min(3, Math.ceil(days / (FRESH_DAYS + 1))));
}

/** Most days any meal waits in the fridge, with `cookDays` even stretches. */
export function longestWait(days: number, cookDays: number): number {
  const k = Math.max(1, Math.min(days, cookDays));
  const starts = [...new Set(Array.from({ length: k }, (_, i) => Math.round((i * days) / k)))];
  return Math.max(...starts.map((s, i) => (starts[i + 1] ?? days) - s - 1));
}

/**
 * The state for a plan that starts on a shopping trip: the first plan day is the shopping day
 * itself (sameDay) or the day after. weekStart follows the first plan day, so day names line up.
 */
export function startPatch(shopDate: string, sameDay: boolean): { shopSameDay: boolean; weekStart: number; weekOf: string } {
  const start = sameDay ? shopDate : plusDays(shopDate, 1);
  return { shopSameDay: sameDay, weekStart: weekdayOf(start), weekOf: start };
}

/** The shopping day for a plan that starts on `weekOf`. */
export const shopDateOf = (weekOf: string, sameDay: boolean) => (sameDay ? weekOf : plusDays(weekOf, -1));

/** Shopping days to offer: today, tomorrow, then the rest of the coming week. */
export function shopChoices(today: string, n = 7): { iso: string; label: string; long: string }[] {
  return Array.from({ length: n }, (_, i) => {
    const iso = plusDays(today, i);
    const d = at(iso);
    const name = d.toLocaleDateString("en-US", { weekday: "short" });
    return {
      iso,
      label: i === 0 ? "Today" : i === 1 ? "Tomorrow" : name,
      long: d.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" }),
    };
  });
}

/** Plan day (0-based) that `today` falls on, or a negative number before the plan starts. */
export const planDayFrom = (weekOf: string, today: string) => Math.round((at(today).getTime() - at(weekOf).getTime()) / 86400000);
