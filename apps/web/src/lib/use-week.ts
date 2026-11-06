"use client";
import { isoDay, useApp } from "./store";
import { nextWeekStart, weekInfo, type WeekInfo } from "./week";

/** Where the person is in their plan week, plus the first day of the week they'd plan next. */
export function useWeek(): WeekInfo & { plansFrom: string } {
  const weekOf = useApp((s) => s.weekOf ?? null);
  const created = useApp((s) => s.current?.createdAt ?? null);
  const weekStart = useApp((s) => s.weekStart ?? 0);
  const days = useApp((s) => s.current?.days ?? s.days ?? 7);
  const today = isoDay();
  const info = weekInfo({ weekOf, planCreated: created, weekStart, today, days });
  return { ...info, plansFrom: nextWeekStart(info, today, weekStart) };
}

/** "Monday, Nov 16" */
export const dayLabel = (iso: string, long = true) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString(undefined, { weekday: long ? "long" : "short", month: "short", day: "numeric" });
