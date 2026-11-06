"use client";
import Link from "next/link";
import { ArrowRight, ShoppingCart, Shuffle } from "lucide-react";
import { useState } from "react";
import { RECIPES_BY_ID } from "@prep-cart/catalog";
import { MealPicker } from "@/components/meal-picker";
import { useApp } from "@/lib/store";
import { PlanStatus } from "@/components/plan-bits";
import { RecipeCard, Rail } from "@/components/food";
import { EmptyState, PageHeader } from "@/components/ui";
import { WeekGlance, WeekRecipes } from "@/components/week-recipes";
import { useHydrated, usePlanner } from "@/lib/use-planner";
import { useDays } from "@/lib/days";
import { money, plural } from "@/lib/format";

/**
 * Meals: the recipes chosen for this week, on their own tab. Keep, swap or skip any of them;
 * the cart follows. This page is also where the meal picker lives.
 */
export default function Meals() {
  const hydrated = useHydrated();
  const { plan, status } = usePlanner();
  const { DAY_LONG, weekStart } = useDays();
  const pickerDone = useApp((st) => st.pickerDone);
  const [picking, setPicking] = useState<boolean | null>(null);
  if (!hydrated) return null;
  // first time here (straight from setup), Meals opens on the picker
  if (picking ?? !pickerDone) {
    return (
      <>
        <PageHeader title="Pick your meals" lead="One meal at a time. Each pick resets what's left of your day, and portions scale to hit your macros."
          action={plan ? <button type="button" className="btn" onClick={() => { useApp.getState().set({ pickerDone: true }); setPicking(false); }}>See this week</button> : undefined} />
        <MealPicker />
      </>
    );
  }
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
  const today = ((new Date().getDay() + 6) % 7 - weekStart + 7) % 7;
  const dayIdx = Math.min(today, plan.days - 1);
  const day = plan.schedule.days[dayIdx];
  return (
    <>
      <PageHeader title="Your meals" lead={<>{plural(r.recipes.length, "recipe")} for {plural(plan.days, "day")}, portioned to your calories. Swap anything you don&apos;t want and your cart updates.</>} action={<button type="button" className="btn" onClick={() => setPicking(true)}><Shuffle size={16} aria-hidden /> Pick meals</button>} />
      <PlanStatus />
      <div className="grid grid-cols-[minmax(0,1fr)] gap-5">
        {day && day.meals.length > 0 && (
          <Rail title={`${DAY_LONG[dayIdx]}'s food`}>
            {day.meals.map((m) => {
              const rec = RECIPES_BY_ID[m.recipeId];
              return rec ? <RecipeCard key={m.occasionId} recipe={rec} portion={m.portion} eyebrow={m.occasionName} /> : null;
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
