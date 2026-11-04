/** Resting and total daily energy estimates. */

export type Sex = "male" | "female";

export interface BodyStats {
  sex: Sex;
  ageYears: number;
  heightCm: number;
  weightKg: number;
}

export const ACTIVITY_LEVELS = {
  sedentary: { factor: 1.2, label: "Sedentary", detail: "Desk job, little exercise" },
  light: { factor: 1.375, label: "Lightly active", detail: "Exercise 1 to 3 days a week" },
  moderate: { factor: 1.55, label: "Moderately active", detail: "Exercise 3 to 5 days a week" },
  very: { factor: 1.725, label: "Very active", detail: "Hard exercise 6 to 7 days a week" },
  extra: { factor: 1.9, label: "Extra active", detail: "Physical job plus daily training" },
} as const;
export type ActivityLevel = keyof typeof ACTIVITY_LEVELS;

/** Mifflin-St Jeor resting metabolic rate, kcal/day. */
export function restingKcal(s: BodyStats): number {
  assertStats(s);
  const base = 10 * s.weightKg + 6.25 * s.heightCm - 5 * s.ageYears;
  return s.sex === "male" ? base + 5 : base - 161;
}

/** Total daily energy expenditure, kcal/day. */
export function maintenanceKcal(s: BodyStats, activity: ActivityLevel): number {
  return restingKcal(s) * ACTIVITY_LEVELS[activity].factor;
}

export function assertStats(s: BodyStats): void {
  if (!(s.ageYears >= 13 && s.ageYears <= 100)) throw new RangeError("Age must be between 13 and 100.");
  if (!(s.heightCm >= 120 && s.heightCm <= 230)) throw new RangeError("Height must be between 120 and 230 cm.");
  if (!(s.weightKg >= 30 && s.weightKg <= 300)) throw new RangeError("Weight must be between 30 and 300 kg.");
}
