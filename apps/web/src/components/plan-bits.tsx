"use client";
import { RecipeArt } from "./food";
import Link from "next/link";
import { useMemo } from "react";
import { AlertTriangle, Droplet, Drumstick, Flame, Loader2, Lock, RefreshCw, Snowflake, Timer, Wheat } from "lucide-react";
import { CUISINES, type Recipe } from "@prep-cart/catalog";
import { preppedShare } from "@prep-cart/nutrition";
import { useOccasions } from "@/lib/meal-styles";
import type { PlanResult } from "@prep-cart/planner";
import { useApp } from "@/lib/store";
import { usePlanner } from "@/lib/use-planner";
import { cx, money } from "@/lib/format";
import { MacroMeter, Ring, Tag } from "./ui";
import { useFlag } from "@/lib/flags";

export const MACRO_COLORS = { kcal: "rgb(var(--ink) / 0.75)", protein: "rgb(var(--protein))", carbs: "rgb(var(--carbs))", fat: "rgb(var(--fat))" };

/** Daily targets for the prepped occasions only (unprepped ones are an allowance). */
export function usePreppedTargets() {
  const targets = useApp((s) => s.targets);
  const occasions = useOccasions();
  return useMemo(() => {
    const { prepped, allowanceKcal } = preppedShare(targets, occasions);
    const sum = prepped.reduce((a, o) => ({ kcal: a.kcal + o.kcal, protein: a.protein + o.protein, carbs: a.carbs + o.carbs, fat: a.fat + o.fat }), { kcal: 0, protein: 0, carbs: 0, fat: 0 });
    return { ...sum, allowanceKcal };
  }, [targets, occasions]);
}

const MACROS = [
  { key: "protein", label: "Protein", icon: Drumstick },
  { key: "carbs", label: "Carbs", icon: Wheat },
  { key: "fat", label: "Fat", icon: Droplet },
] as const;

/** "+8%" or "on target" (within 5%) */
function offBy(actual: number, target: number) {
  const off = target > 0 ? (actual - target) / target : 0;
  return Math.abs(off) < 0.05 ? "on target" : `${off > 0 ? "+" : ""}${Math.round(off * 100)}%`;
}

function MacroRingTile({ k, label, icon: Icon, actual, target, flat }: { k: "protein" | "carbs" | "fat"; label: string; icon: typeof Flame; actual: number; target: number; flat?: boolean }) {
  return (
    <div className={cx("flex min-w-0 flex-col gap-3 p-3.5", flat ? "rounded-2xl bg-sunk/60" : "card")}>
      <div className="min-w-0">
        <p className="num text-[19px] font-bold leading-none">{Math.round(actual)}<span className="text-[13px] font-medium text-muted">/{Math.round(target)}g</span></p>
        <p className="mt-1 truncate text-[12px] text-muted">{label}</p>
      </div>
      <Ring value={actual} target={target} size={60} stroke={6} color={MACRO_COLORS[k]} label={`${label} ${Math.round(actual)} of ${Math.round(target)} grams a day`}>
        <Icon size={18} style={{ color: MACRO_COLORS[k] }} />
      </Ring>
    </div>
  );
}

/** Calories and macros as rings: one wide calorie card and three macro cards. */
export function MacroRings({ result, flat }: { result: PlanResult; flat?: boolean }) {
  const t = usePreppedTargets();
  const d = result.daily;
  return (
    <div className="grid gap-3">
      <div className={cx("flex items-center justify-between gap-4", flat ? "rounded-2xl bg-sunk/60 p-4" : "card p-5")}>
        <div className="min-w-0">
          <p className="num text-[40px] font-bold leading-none tracking-tight sm:text-[44px]">{Math.round(d.kcal).toLocaleString()}<span className="text-[17px] font-medium text-muted">/{Math.round(t.kcal).toLocaleString()}</span></p>
          <p className="mt-1.5 text-[14px] text-muted">Calories a day from your prep · {offBy(d.kcal, t.kcal)}</p>
        </div>
        <Ring value={d.kcal} target={t.kcal} size={flat ? 76 : 92} stroke={8} color="rgb(var(--ink))" label={`${Math.round(d.kcal)} of ${Math.round(t.kcal)} calories a day`}>
          <Flame size={flat ? 20 : 24} className="text-ink" />
        </Ring>
      </div>
      <div className="grid grid-cols-3 gap-3">
        {MACROS.map((m) => <MacroRingTile key={m.key} k={m.key} label={m.label} icon={m.icon} actual={d[m.key]} target={t[m.key]} flat={flat} />)}
      </div>
    </div>
  );
}

export function PlanMacros({ result }: { result: PlanResult }) {
  const t = usePreppedTargets();
  const d = result.daily;
  const v2 = useFlag("redesign");
  if (v2) return <MacroRings result={result} flat />;
  return (
    <div className="grid grid-cols-2 gap-x-5 gap-y-4 sm:grid-cols-4">
      <MacroMeter label="Calories / day" actual={d.kcal} target={t.kcal} unit="" color={MACRO_COLORS.kcal} />
      <MacroMeter label="Protein" actual={d.protein} target={t.protein} unit="g" color={MACRO_COLORS.protein} />
      <MacroMeter label="Carbs" actual={d.carbs} target={t.carbs} unit="g" color={MACRO_COLORS.carbs} />
      <MacroMeter label="Fat" actual={d.fat} target={t.fat} unit="g" color={MACRO_COLORS.fat} />
    </div>
  );
}

export function BudgetBar({ cost: groceries, budget, takeout = 0 }: { cost: number; budget: number; takeout?: number }) {
  const cost = groceries + takeout;
  const over = cost > budget + 0.005;
  const pct = budget > 0 ? Math.min(100, (cost / budget) * 100) : 100;
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <span className="num text-[22px] font-semibold">{money(cost)}</span>
        <span className={cx("text-sm", over ? "font-semibold text-warn" : "text-muted")}>
          {over ? `${money(cost - budget)} over ${money(budget)}` : `${money(budget - cost)} left of ${money(budget)}`}
        </span>
      </div>
      <div className="mt-1.5 h-2 rounded-full bg-sunk" role="img" aria-label={`Spent ${money(cost)} of ${money(budget)}`}>
        <div className={cx("h-full rounded-full", over ? "bg-warn" : "bg-accent")} style={{ width: `${pct}%` }} />
      </div>
      {takeout > 0 && <p className="mt-1.5 text-xs text-muted">{money(groceries)} groceries + {money(takeout)} takeout</p>}
    </div>
  );
}

/** Solving / stale / error / budget messages shown above a plan. */
export function PlanStatus() {
  const { status, error, plan, replan } = usePlanner();
  const t = usePreppedTargets();
  if (status === "error") {
    return (
      <div role="alert" className="card mb-4 flex flex-wrap items-center justify-between gap-3 border-warn p-4">
        <span className="inline-flex items-center gap-2 text-sm"><AlertTriangle size={18} className="text-warn" aria-hidden /> {error}</span>
        <button className="btn btn-sm" onClick={replan}><RefreshCw size={14} aria-hidden /> Try again</button>
      </div>
    );
  }
  if (!plan) return null;
  const r = plan.result;
  // the solver can come back "ok" on budget yet well off the calories, e.g. one meal a day can't hold 3,000 kcal
  const off = r.status !== "no_recipes" && t.kcal > 0 ? (r.daily.kcal - t.kcal) / t.kcal : 0;
  const calorieNote = Math.abs(off) > 0.1 ? <CalorieGap off={off} actual={r.daily.kcal} target={t.kcal} maxedOut={r.recipes.some((p) => p.portion >= 2.5)} /> : null;
  if (r.status === "ok") return calorieNote;
  return (
    <>
    <div role="status" className="card mb-4 flex items-start gap-3 border-warn bg-warn-soft p-4 text-sm">
      <AlertTriangle size={18} className="mt-0.5 shrink-0 text-warn" aria-hidden />
      <div>
        <p className="font-semibold">{r.status === "over_budget" ? "This is the cheapest plan that fits your rules, and it's over budget." : "No recipes fit your rules."}</p>
        {r.message && <p className="mt-0.5">{r.message}</p>}
        <p className="mt-1">
          {r.status === "over_budget"
            ? "Raise the budget, move the slider toward lowest cost, or allow more stores in "
            : "Loosen a diet, allergen, dislike or Must choice in "}
          <Link href="/plan/" className="underline">Plan</Link> or <Link href="/settings/" className="underline">Settings</Link>.
        </p>
      </div>
    </div>
    {calorieNote}
    </>
  );
}

/** Explains a plan that lands more than 10% away from the calorie target, and what to change. */
function CalorieGap({ off, actual, target, maxedOut }: { off: number; actual: number; target: number; maxedOut: boolean }) {
  const short = off < 0;
  const gap = Math.round(Math.abs(actual - target)).toLocaleString();
  return (
    <div role="status" className="card mb-4 flex items-start gap-3 border-warn bg-warn-soft p-4 text-sm">
      <AlertTriangle size={18} className="mt-0.5 shrink-0 text-warn" aria-hidden />
      <div>
        <p className="font-semibold">{short ? `Your prep is about ${gap} calories a day short of your target.` : `Your prep is about ${gap} calories a day over your target.`}</p>
        <p className="mt-0.5">
          {short && maxedOut
            ? "Portions already top out at 2½ servings a meal. Add a meal or snack a day in Meals and rotation, or raise the budget."
            : short
              ? "Raise the budget or allow more stores so the plan can buy more food, or try another plan."
              : "Lower the budget, try another plan, or loosen a Must choice so lighter recipes fit."}
        </p>
      </div>
    </div>
  );
}

export function SolvingNote() {
  const { status, stale } = usePlanner();
  if (status !== "solving" && !stale) return null;
  return <span className="inline-flex items-center gap-1.5 text-sm text-muted"><Loader2 size={14} className="animate-spin" aria-hidden /> Updating plan</span>;
}

/** A simple colored monogram tile in place of photos. */
export function RecipeTile({ recipe, size = 64 }: { recipe: Recipe; size?: number }) {
  return <span className="shrink-0 overflow-hidden rounded-xl" style={{ width: size, height: size }}><RecipeArt recipe={recipe} className="h-full w-full" badges={size >= 80} /></span>;
}

export function RecipeMeta({ recipe }: { recipe: Recipe }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
      <span className="inline-flex items-center gap-1"><Timer size={13} aria-hidden /> {recipe.activeMinutes} min hands-on · {recipe.totalMinutes} total</span>
      <span>Keeps {recipe.fridgeDays} days</span>
      {recipe.freezerFriendly && <span className="inline-flex items-center gap-1"><Snowflake size={13} aria-hidden /> Freezes</span>}
      <span>{recipe.cuisines.map((c) => CUISINES[c]).join(", ")}</span>
    </div>
  );
}

export function PerServing({ recipe, portion = 1 }: { recipe: Recipe; portion?: number }) {
  const n = recipe.perServing;
  return (
    <span className="num text-xs text-muted">
      {Math.round(n.kcal * portion)} kcal · <span className="text-protein">{Math.round(n.protein * portion)}P</span> · <span className="text-carbs">{Math.round(n.carbs * portion)}C</span> · <span className="text-fat">{Math.round(n.fat * portion)}F</span>
    </span>
  );
}

export function LockedTag() {
  return <Tag><span className="inline-flex items-center gap-1"><Lock size={10} aria-hidden /> Locked</span></Tag>;
}
