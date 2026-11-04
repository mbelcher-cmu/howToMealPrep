"use client";
import Link from "next/link";
import { useMemo } from "react";
import { AlertTriangle, Loader2, Lock, RefreshCw, Snowflake, Timer } from "lucide-react";
import { CUISINES, type Recipe } from "@prep-cart/catalog";
import { preppedShare } from "@prep-cart/nutrition";
import type { PlanResult } from "@prep-cart/planner";
import { useApp } from "@/lib/store";
import { usePlanner } from "@/lib/use-planner";
import { cx, money } from "@/lib/format";
import { MacroMeter, Tag } from "./ui";

export const MACRO_COLORS = { kcal: "rgb(var(--ink) / 0.75)", protein: "rgb(var(--protein))", carbs: "rgb(var(--carbs))", fat: "rgb(var(--fat))" };

/** Daily targets for the prepped occasions only (unprepped ones are an allowance). */
export function usePreppedTargets() {
  const targets = useApp((s) => s.targets);
  const occasions = useApp((s) => s.occasions);
  return useMemo(() => {
    const { prepped, allowanceKcal } = preppedShare(targets, occasions);
    const sum = prepped.reduce((a, o) => ({ kcal: a.kcal + o.kcal, protein: a.protein + o.protein, carbs: a.carbs + o.carbs, fat: a.fat + o.fat }), { kcal: 0, protein: 0, carbs: 0, fat: 0 });
    return { ...sum, allowanceKcal };
  }, [targets, occasions]);
}

export function PlanMacros({ result }: { result: PlanResult }) {
  const t = usePreppedTargets();
  const d = result.daily;
  return (
    <div className="grid grid-cols-2 gap-x-5 gap-y-4 sm:grid-cols-4">
      <MacroMeter label="Calories / day" actual={d.kcal} target={t.kcal} unit="" color={MACRO_COLORS.kcal} />
      <MacroMeter label="Protein" actual={d.protein} target={t.protein} unit="g" color={MACRO_COLORS.protein} />
      <MacroMeter label="Carbs" actual={d.carbs} target={t.carbs} unit="g" color={MACRO_COLORS.carbs} />
      <MacroMeter label="Fat" actual={d.fat} target={t.fat} unit="g" color={MACRO_COLORS.fat} />
    </div>
  );
}

export function BudgetBar({ cost, budget }: { cost: number; budget: number }) {
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
    </div>
  );
}

/** Solving / stale / error / budget messages shown above a plan. */
export function PlanStatus() {
  const { status, error, plan, replan } = usePlanner();
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
  if (r.status === "ok") return null;
  return (
    <div role="status" className="card mb-4 flex items-start gap-3 border-warn bg-warn-soft p-4 text-sm">
      <AlertTriangle size={18} className="mt-0.5 shrink-0 text-warn" aria-hidden />
      <div>
        <p className="font-semibold">{r.status === "over_budget" ? "This is the cheapest plan that fits your rules, and it's over budget." : "No recipes fit your rules."}</p>
        {r.message && <p className="mt-0.5 text-muted">{r.message}</p>}
        <p className="mt-1 text-muted">
          {r.status === "over_budget"
            ? "Raise the budget, move the slider toward lowest cost, or allow more stores in "
            : "Loosen a diet, allergen, dislike or Must choice in "}
          <Link href="/plan/" className="underline">Plan</Link> or <Link href="/settings/" className="underline">Settings</Link>.
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

const HUES = [150, 25, 205, 280, 45, 340, 95, 0, 180, 255];
/** A simple colored monogram tile in place of photos. */
export function RecipeTile({ recipe, size = 44 }: { recipe: Recipe; size?: number }) {
  const h = HUES[[...recipe.id].reduce((a, c) => a + c.charCodeAt(0), 0) % HUES.length]!;
  const letters = recipe.name.split(/\s+/).filter((w) => /^[A-Za-z]/.test(w)).slice(0, 2).map((w) => w[0]).join("");
  return (
    <span aria-hidden className="grid shrink-0 place-items-center rounded-lg font-display font-bold" style={{ width: size, height: size, fontSize: size * 0.36, background: `hsl(${h} 45% 88%)`, color: `hsl(${h} 45% 28%)` }}>
      {letters.toUpperCase()}
    </span>
  );
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
