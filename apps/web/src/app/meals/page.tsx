"use client";
import Link from "next/link";
import { ArrowRight, Shuffle } from "lucide-react";
import { useState } from "react";
import { MealPicker } from "@/components/meal-picker";
import { PlanStatus } from "@/components/plan-bits";
import { EmptyState, PageHeader } from "@/components/ui";
import { WeekRecipes } from "@/components/week-recipes";
import { useNextTrip } from "@/components/home-week";
import { useHydrated, usePlanner } from "@/lib/use-planner";
import { useDays } from "@/lib/days";
import { useApp } from "@/lib/store";
import { dayLabel } from "@/lib/use-week";
import { plural } from "@/lib/format";

/**
 * Meals: only the recipes chosen for this week. Keep, swap or skip any of them; the cart follows.
 * This page is also where the meal picker lives. The week's calendar is on Home, browsing on Discover.
 */
export default function Meals() {
  const hydrated = useHydrated();
  const { plan, status } = usePlanner();
  const { cookDayName } = useDays();
  const trip = useNextTrip();
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
  const cooks = plan.schedule.sessions.filter((x) => x.batches.length).map((x) => cookDayName(x.beforeDay));
  const fresh = r.recipes.some((p) => p.recipe.cookFresh);
  const ahead = trip.phase === "ahead";
  return (
    <>
      <PageHeader title={ahead ? "Next week's meals" : "Your meals"} lead={<>{plural(r.recipes.length, "recipe")} for {plural(plan.days, "day")}, portioned to your calories. Swap anything you don&apos;t want and your cart updates.{cooks.length > 0 && <> Cook on {cooks.join(" and ")}{fresh ? "; breakfast is made fresh each morning" : ""}.</>}{ahead && <> Starts {dayLabel(trip.start)}.</>}</>}
        action={<button type="button" className="btn" onClick={() => setPicking(true)}><Shuffle size={16} aria-hidden /> Pick meals</button>} />
      <PlanStatus />
      <div className="grid grid-cols-[minmax(0,1fr)] gap-5">
        {trip.needsPicks && (
          <Link href="/next-week/" className="card pop tap-card press flex items-center justify-between gap-3 p-4">
            <span><span className="block font-display text-lg font-bold">{trip.phase === "over" ? "Your meals ran out" : "Time to pick next week's meals"}</span><span className="text-sm text-muted">Rate this week, then pick everything again from the top.</span></span>
            <ArrowRight size={20} aria-hidden className="shrink-0" />
          </Link>
        )}
        <WeekRecipes title={ahead ? "Next week's recipes" : "This week's recipes"} />
      </div>
    </>
  );
}
