import { suggestTargets } from "@prep-cart/nutrition";
import type { HouseholdMember } from "@prep-cart/planner";
import type { Member } from "./store";

/** Daily calories for a household member: their own number, or an estimate from body stats and goal. */
export function memberKcal(m: Member): number {
  if (m.kcal) return m.kcal;
  try { return suggestTargets({ stats: m, activity: m.activity, goal: m.goal }).goalKcal; } catch { return 2000; }
}

/** Daily goals for a household member: their calories and protein (their own or estimated), fat at 30%, carbs fill the rest. */
export function memberGoals(m: Member): { kcal: number; protein: number; carbs: number; fat: number; estimatedProtein: number } {
  const kcal = memberKcal(m);
  let est: number;
  try { est = suggestTargets({ stats: m, activity: m.activity, goal: m.goal }).targets.protein; } catch { est = Math.round((kcal * 0.25) / 4); }
  // protein stays at or under 40% of calories so carbs and fat stay sensible
  const protein = Math.min(m.protein ?? est, Math.round((kcal * 0.4) / 4));
  const fat = Math.round((kcal * 0.3) / 9);
  const carbs = Math.max(0, Math.round((kcal - protein * 4 - fat * 9) / 4));
  return { kcal, protein, carbs, fat, estimatedProtein: Math.min(est, Math.round((kcal * 0.4) / 4)) };
}

/** What the planner gets for a member. With own goals off, only calories (everyone eats the same scaled meals). */
export function memberRequest(m: Member, ownGoals: boolean): HouseholdMember {
  const base = { id: m.id, name: m.name.trim() || "Someone", kcal: memberKcal(m) };
  if (!ownGoals) return base;
  const g = memberGoals(m);
  return { ...base, protein: g.protein, carbs: g.carbs, fat: g.fat, diets: m.diets ?? [], allergens: m.allergens ?? [] };
}

