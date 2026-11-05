import { KCAL_PER_GRAM } from "./energy";
import { ACTIVITY_LEVELS, type ActivityLevel, type BodyStats, type Sex, restingKcal } from "./energy-needs";
import { editCaloriesWithLocks, KCAL_FLOOR, type Targets } from "./targets";

/**
 * Training days and rest days. The person's calorie target stays their weekly average; a training
 * week moves calories from rest days to the days they train, in proportion to what each workout
 * burns. Protein stays the same every day and carbs (then fat) carry the difference, which is how
 * sports dietitians cycle food around training.
 */

/**
 * Workout kinds with a MET value (2024 Adult Compendium of Physical Activities, middle of the
 * range). Calories burned by a workout = (MET - 1) x body weight in kg x hours: the 1 MET a body
 * burns at rest is already in the resting estimate, so it is not counted twice.
 */
export const WORKOUTS = {
  run: { label: "Run", met: 9.0 },
  ruck: { label: "Ruck or loaded march", met: 7.5 },
  pt: { label: "PT, HIIT or circuits", met: 8.0 },
  lift: { label: "Weights", met: 5.0 },
  cycle: { label: "Bike or spin", met: 7.5 },
  swim: { label: "Swim", met: 7.0 },
  sports: { label: "Sports", met: 7.0 },
  walk: { label: "Walk or hike", met: 4.5 },
  mobility: { label: "Yoga or stretching", met: 2.8 },
  other: { label: "Other workout", met: 5.0 },
} as const satisfies Record<string, { label: string; met: number }>;
export type WorkoutType = keyof typeof WORKOUTS;
export const WORKOUT_TYPES = Object.keys(WORKOUTS) as WorkoutType[];

export interface Workout {
  type: WorkoutType;
  minutes: number;
}

/** Seven days, Monday first. An empty day is a rest day. */
export type TrainingWeek = Workout[][];

export const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"] as const;
export const MAX_WORKOUT_MINUTES = 360;
/** A day's target never moves more than this share away from the weekly average. */
export const MAX_DAY_SWING = 0.35;

export const restWeek = (): TrainingWeek => Array.from({ length: 7 }, () => []);

/** Calories a workout burns above resting, rounded to 5. */
export function workoutKcal(w: Workout, weightKg: number): number {
  const met = WORKOUTS[w.type]?.met ?? WORKOUTS.other.met;
  const minutes = Math.min(MAX_WORKOUT_MINUTES, Math.max(0, w.minutes || 0));
  return Math.round(((met - 1) * weightKg * minutes) / 60 / 5) * 5;
}

/** Calories each day's workouts burn, Monday first. */
export function weekBurn(week: TrainingWeek, weightKg: number): number[] {
  return Array.from({ length: 7 }, (_, d) => (week[d] ?? []).reduce((a, w) => a + workoutKcal(w, weightKg), 0));
}

export const isTrainingWeek = (week: TrainingWeek | null | undefined): boolean =>
  !!week && week.some((d) => d?.some((w) => w.minutes > 0));

export interface TrainingDay {
  /** 0 = Monday */
  weekday: number;
  workouts: Workout[];
  burn: number;
  targets: Targets;
  /** calories above (or below) the weekly average */
  delta: number;
  training: boolean;
}

export interface TrainingPlan {
  days: TrainingDay[];
  /** average calories a day the workouts burn */
  averageBurn: number;
  trainingDays: number;
  /** the activity level that matches this week, for comparing with the one the person picked */
  matchingActivity: ActivityLevel;
}

/**
 * Daily targets for a training week. The weekly total stays 7 x the base calories: each day gets
 * the base plus how much more (or less) it burns than the average day, capped at +/- 35% and never
 * below the safe minimum for the person's sex.
 */
export function trainingDayTargets(base: Targets, week: TrainingWeek, stats: Pick<BodyStats, "weightKg"> & Partial<BodyStats>, sex: Sex = "male"): TrainingPlan {
  const burn = weekBurn(week, stats.weightKg);
  const avg = burn.reduce((a, b) => a + b, 0) / 7;
  const floor = Math.max(KCAL_FLOOR[sex], base.protein * KCAL_PER_GRAM.protein + 200);
  const lo = Math.max(floor, base.kcal * (1 - MAX_DAY_SWING));
  const hi = base.kcal * (1 + MAX_DAY_SWING);
  // clamp, then spread whatever the clamp took away over the days that still have room
  let want = burn.map((b) => base.kcal + (b - avg));
  for (let pass = 0; pass < 4; pass++) {
    want = want.map((k) => Math.min(hi, Math.max(lo, k)));
    const gap = base.kcal * 7 - want.reduce((a, b) => a + b, 0);
    if (Math.abs(gap) < 1) break;
    const room = want.map((k) => (gap > 0 ? hi - k : k - lo)).map((r) => Math.max(0, r));
    const total = room.reduce((a, b) => a + b, 0);
    if (total <= 0) break;
    want = want.map((k, i) => k + (gap * room[i]!) / total);
  }
  const days = want.map((kcal, d): TrainingDay => {
    const targets = Math.abs(kcal - base.kcal) < 4 ? base : editCaloriesWithLocks(base, kcal, ["protein"]).targets;
    return { weekday: d, workouts: week[d] ?? [], burn: burn[d]!, targets, delta: targets.kcal - base.kcal, training: burn[d]! > 0 };
  });
  return { days, averageBurn: Math.round(avg), trainingDays: days.filter((d) => d.training).length, matchingActivity: matchingActivity(avg, stats) };
}

/**
 * The activity level whose multiplier is closest to this much exercise. Day-to-day movement off
 * the clock adds a little (about 0.05 of resting energy) on top of the 1.2 sedentary baseline.
 */
export function matchingActivity(averageBurn: number, stats: Partial<BodyStats>): ActivityLevel {
  let rmr = 1700;
  try { if (stats.sex && stats.ageYears && stats.heightCm && stats.weightKg) rmr = restingKcal(stats as BodyStats); } catch { /* keep the typical value */ }
  const factor = 1.25 + averageBurn / rmr;
  let best: ActivityLevel = "sedentary";
  for (const [k, v] of Object.entries(ACTIVITY_LEVELS) as [ActivityLevel, (typeof ACTIVITY_LEVELS)[ActivityLevel]][]) {
    if (Math.abs(v.factor - factor) < Math.abs(ACTIVITY_LEVELS[best].factor - factor)) best = k;
  }
  return best;
}

/**
 * Portion multipliers for the days of a plan, so prepped meals deliver the training and rest day
 * targets. Normalized over the planned days, so the food cooked for the week does not change.
 * @param weekStart weekday of the plan's first day, 0 = Monday
 */
export function dayPortionScales(plan: TrainingPlan, weekStart: number, days: number): number[] {
  const kcal = Array.from({ length: days }, (_, d) => plan.days[(weekStart + d) % 7]!.targets.kcal);
  const mean = kcal.reduce((a, b) => a + b, 0) / Math.max(1, days);
  return kcal.map((k) => (mean > 0 ? Math.round((k / mean) * 100) / 100 : 1));
}

/** Keep a saved week in shape: seven days, known workout types, sane minutes. */
export function cleanTrainingWeek(raw: unknown): TrainingWeek {
  const out = restWeek();
  if (!Array.isArray(raw)) return out;
  for (let d = 0; d < 7; d++) {
    const day = raw[d];
    if (!Array.isArray(day)) continue;
    out[d] = day
      .filter((w): w is Workout => !!w && typeof w === "object" && (w as Workout).type in WORKOUTS && Number.isFinite((w as Workout).minutes))
      .map((w) => ({ type: w.type, minutes: Math.round(Math.min(MAX_WORKOUT_MINUTES, Math.max(0, w.minutes))) }))
      .filter((w) => w.minutes > 0)
      .slice(0, 3);
  }
  return out;
}
