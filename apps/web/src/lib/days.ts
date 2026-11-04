"use client";
import { useApp } from "./store";
import { DAY_LONG as LONG, DAY_NAMES as SHORT } from "./format";

/** Weekday names for plan days 0..6, starting from the person's chosen first day. */
export function useDays() {
  const start = useApp((s) => s.weekStart ?? 0);
  const rot = <T,>(a: T[]) => a.map((_, i) => a[(i + start) % 7]!);
  return { DAY_NAMES: rot(SHORT), DAY_LONG: rot(LONG), PREP_DAY: LONG[(start + 6) % 7]!, weekStart: start };
}
