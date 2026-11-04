/** Atwater factors: kcal per gram. */
export const KCAL_PER_GRAM = { protein: 4, carbs: 4, fat: 9, alcohol: 7 } as const;

export type MacroKey = "protein" | "carbs" | "fat";
export const MACROS: readonly MacroKey[] = ["protein", "carbs", "fat"];

export interface MacroGrams {
  protein: number;
  carbs: number;
  fat: number;
}

/** Calories implied by macro grams (4/4/9). */
export function kcalFromMacros(m: MacroGrams): number {
  return m.protein * KCAL_PER_GRAM.protein + m.carbs * KCAL_PER_GRAM.carbs + m.fat * KCAL_PER_GRAM.fat;
}

/** Share of calories from each macro, 0..1. Returns zeros for an empty input. */
export function macroShares(m: MacroGrams): Record<MacroKey, number> {
  const total = kcalFromMacros(m);
  if (total <= 0) return { protein: 0, carbs: 0, fat: 0 };
  return {
    protein: (m.protein * KCAL_PER_GRAM.protein) / total,
    carbs: (m.carbs * KCAL_PER_GRAM.carbs) / total,
    fat: (m.fat * KCAL_PER_GRAM.fat) / total,
  };
}
