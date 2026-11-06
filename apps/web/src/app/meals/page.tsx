"use client";
import Link from "next/link";
import { ArrowRight, ShoppingCart, Shuffle } from "lucide-react";
import { RECIPES_BY_ID } from "@prep-cart/catalog";
import { PlanStatus } from "@/components/plan-bits";
import { RecipeCard, Rail } from "@/components/food";
import { EmptyState, PageHeader } from "@/components/ui";
import { WeekGlance, WeekRecipes } from "@/components/week-recipes";
import { useHydrated, usePlanner } from "@/lib/use-planner";
import { useDays } from "@/lib/days";
import { isoDay, useApp } from "@/lib/store";
import { planDayFrom } from "@/lib/shop-day";
import { dayLabel } from "@/lib/use-week";
import { money, plural } from "@/lib/format";

/**
 * Meals: the recipes chosen for this week, on their own tab. Keep, swap or skip any of them;
 * the cart follows. This page is also where the meal picker lives.
 */
export default function Meals() {
  const hydrated = useHydrated();
  const { plan, status } = usePlanner();
  const { DAY_LONG, weekStart, cookDayName } = useDays();
  const weekOf = useApp((s) => s.weekOf);
  if (!hydrated) return null;
  if (!plan) {
    return (
      <>
        <PageHeader title="Your meals" />
        <EmptyState title={status === "solving" ? "Picking your meals" : "No meals yet"}>
          {status === "solving" ? "Finding recipes that hit your calories within budget. This takes a few seconds." : <Link className="underline" href="/plan/">Set your budget and goals to get started.</Link>}
        </EmptyState>
      </>
    );
  }
  const r = plan.result;
  // a plan with a start date counts days from it; before it starts, show its first day
  const fromStart = weekOf ? planDayFrom(weekOf, isoDay()) : null;
  const today = fromStart == null ? ((new Date().getDay() + 6) % 7 - weekStart + 7) % 7 : Math.max(0, fromStart);
  const dayIdx = Math.min(today, plan.days - 1);
  const cooks = plan.schedule.sessions.filter((x) => x.batches.length).map((x) => cookDayName(x.beforeDay));
  const fresh = r.recipes.filter((p) => p.recipe.cookFresh);
  const day = plan.schedule.days[dayIdx];
  return (
    <>
      <PageHeader title="Your meals" lead={<>{plural(r.recipes.length, "recipe")} for {plural(plan.days, "day")}, portioned to your calories. Swap anything you don&apos;t want and your cart updates.{cooks.length > 0 && <> Cook on {cooks.join(" and ")}{fresh.length > 0 ? "; breakfast is made fresh each morning" : ""}.</>}{fromStart != null && fromStart < 0 && <> Starts {dayLabel(weekOf!)}.</>}</>} action={<Link href="/pick/" className="btn"><Shuffle size={16} aria-hidden /> Pick meals</Link>} />
      <PlanStatus />
      <div className="grid grid-cols-[minmax(0,1fr)] gap-5">
        {day && day.meals.length > 0 && (
          <Rail title={`${DAY_LONG[dayIdx]}'s food`}>
            {day.meals.map((m) => {
              const rec = RECIPES_BY_ID[m.recipeId];
              return rec ? <RecipeCard key={m.occasionId} recipe={rec} portion={m.portion} eyebrow={m.fresh ? `${m.occasionName} · make fresh` : m.occasionName} /> : null;
            })}
          </Rail>
        )}
        <WeekRecipes title="This week's recipes" />
        <WeekGlance />
        <Link href="/groceries/" className="btn btn-primary w-full sm:w-auto sm:justify-self-end">
          <ShoppingCart size={16} aria-hidden /> Go to cart · {money(r.registerCost ?? r.cost)} <ArrowRight size={16} aria-hidden />
        </Link>
      </div>
    </>
  );
}
