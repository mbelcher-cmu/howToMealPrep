/**
 * Where the person is in their plan week. Pure date math, kept free of the browser so it can be tested.
 * Dates are YYYY-MM-DD in local time. weekStart is the plan's first weekday, 0 = Monday.
 */

const at = (iso: string) => new Date(`${iso}T12:00:00`);
const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const plus = (iso: string, n: number) => { const d = at(iso); d.setDate(d.getDate() + n); return fmt(d); };
const between = (from: string, to: string) => Math.round((at(to).getTime() - at(from).getTime()) / 86400000);

/** Plan day (0..6) that a date falls on. */
export function planDayOf(iso: string, weekStart: number): number {
  return ((at(iso).getDay() + 6) % 7 - weekStart + 7) % 7;
}

/** The first day of the plan week a date falls in. */
export function weekStartOn(iso: string, weekStart: number): string {
  return plus(iso, -planDayOf(iso, weekStart));
}

export type WeekPhase =
  /** most of the week is still ahead */
  | "mid"
  /** two days or less left: time to pick next week's food (prep day is the last day) */
  | "ending"
  /** the week is over and nobody planned the next one */
  | "over"
  /** next week is already planned and starts on `start` */
  | "ahead";

export interface WeekInfo {
  phase: WeekPhase;
  /** first day of the week being eaten (or, when ahead, of the planned week) */
  start: string;
  /** first day of the week after it */
  next: string;
  /** days until `next` (when ahead: days until `start`) */
  daysLeft: number;
}

/**
 * @param weekOf the first day of the week the current plan is for, when the person set it
 * @param planCreated when the current plan was built, used when weekOf was never set
 */
export function weekInfo(opts: { weekOf: string | null; planCreated: string | null; weekStart: number; today: string; days?: number }): WeekInfo {
  const { weekStart, today } = opts;
  // a plan covers `days` days; the next trip is the day after it runs out
  const len = Math.max(1, Math.min(7, opts.days ?? 7));
  const base = opts.weekOf ?? (opts.planCreated ? weekStartOn(fmt(new Date(opts.planCreated)), weekStart) : weekStartOn(today, weekStart));
  if (base > today) return { phase: "ahead", start: base, next: plus(base, len), daysLeft: between(today, base) };
  const next = plus(base, len);
  const daysLeft = between(today, next);
  return { phase: daysLeft <= 0 ? "over" : daysLeft <= 2 ? "ending" : "mid", start: base, next, daysLeft };
}

/** The first day of the week someone plans now: the coming one, or this one when the last plan ran out. */
export function nextWeekStart(info: WeekInfo, today: string, weekStart: number): string {
  if (info.phase === "over") return weekStartOn(today, weekStart);
  if (info.phase === "ahead") return info.start;
  return info.next;
}

/**
 * Which recipes stay and which sit out next week. Recipes the person marks "keep" are locked in;
 * the rest rest for one week so the planner picks something new.
 */
export function nextWeekChoices(planned: string[], keep: Set<string>): { locked: string[]; resting: string[] } {
  const ids = [...new Set(planned)];
  return { locked: ids.filter((id) => keep.has(id)), resting: ids.filter((id) => !keep.has(id)) };
}

/** Recipes that came in and went out between two plans. */
export function menuChange(before: string[], after: string[]): { added: string[]; dropped: string[]; kept: string[] } {
  const a = new Set(before);
  const b = new Set(after);
  return { added: [...b].filter((x) => !a.has(x)), dropped: [...a].filter((x) => !b.has(x)), kept: [...b].filter((x) => a.has(x)) };
}
