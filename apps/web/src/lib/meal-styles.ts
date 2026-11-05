"use client";
import { useMemo } from "react";
import type { EatingOccasion } from "@prep-cart/nutrition";
import { flag, useFlag } from "./flags";
import { useApp } from "./store";

/** Meal styles only count while the mealStyles flag is on; otherwise every meal is balanced. */
export function styledOccasions(occasions: EatingOccasion[], on: boolean = flag("mealStyles")): EatingOccasion[] {
  if (on || !occasions.some((o) => o.style)) return occasions;
  return occasions.map(({ style: _style, ...o }) => o);
}

/** The person's eating occasions as the planner sees them. */
export function useOccasions(): EatingOccasion[] {
  const occasions = useApp((s) => s.occasions);
  const on = useFlag("mealStyles");
  return useMemo(() => styledOccasions(occasions, on), [occasions, on]);
}
