"use client";
import { useMemo } from "react";
import { cleanTrainingWeek, dayPortionScales, isTrainingWeek, trainingDayTargets, type TrainingPlan } from "@prep-cart/nutrition";
import { flag, useFlag } from "./flags";
import type { AppState } from "./store";
import { useApp } from "./store";

type Inputs = Pick<AppState, "training" | "targets" | "profile">;

/** Training and rest day targets, or null when the flag is off or every day is a rest day. */
export function trainingPlanOf(s: Inputs, on: boolean): TrainingPlan | null {
  if (!on || !s.training) return null;
  const week = cleanTrainingWeek(s.training.week);
  if (!isTrainingWeek(week)) return null;
  return trainingDayTargets(s.targets, week, s.profile, s.profile.sex);
}

/** Portion multipliers for the planner, one per plan day; undefined when nothing changes. */
export function dayScalesOf(s: Inputs & Pick<AppState, "weekStart" | "days">): number[] | undefined {
  const tp = trainingPlanOf(s, flag("fitnessSync"));
  return tp ? dayPortionScales(tp, s.weekStart ?? 0, s.days) : undefined;
}

export function useTrainingPlan(): TrainingPlan | null {
  const on = useFlag("fitnessSync");
  const training = useApp((s) => s.training);
  const targets = useApp((s) => s.targets);
  const profile = useApp((s) => s.profile);
  return useMemo(() => trainingPlanOf({ training, targets, profile }, on), [on, training, targets, profile]);
}
