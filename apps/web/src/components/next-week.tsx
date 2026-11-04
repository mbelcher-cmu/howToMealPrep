"use client";
import Link from "next/link";
import { ArrowRight, CalendarClock, CalendarCheck2 } from "lucide-react";
import { RECIPES_BY_ID } from "@prep-cart/catalog";
import { addDays, useApp } from "@/lib/store";
import { useFlag } from "@/lib/flags";
import { dayLabel, useWeek } from "@/lib/use-week";
import { menuChange } from "@/lib/week";
import { plural } from "@/lib/format";
import { RecipeArt } from "./food";

/**
 * Home's nudge for the end of the week. It stays quiet for most of the week, asks for next week's food
 * in the last two days, says so plainly when the week has run out, and confirms once next week is set.
 */
export function NextWeekCard() {
  const on = useFlag("nextWeek");
  const w = useWeek();
  const plan = useApp((s) => s.current);
  const lastWeek = useApp((s) => s.lastWeek);
  if (!on || !plan || w.phase === "mid") return null;

  if (w.phase === "ahead") {
    const ids = plan.result.recipes.map((p) => p.recipe.id);
    const change = lastWeek ? menuChange(lastWeek.result.recipes.map((p) => p.recipe.id), ids) : null;
    return (
      <section aria-label="Next week" className="card pop overflow-hidden">
        <div className="flex items-start gap-4 p-4 sm:p-5">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-sunk" aria-hidden><CalendarCheck2 size={20} /></span>
          <div className="min-w-0 flex-1">
            <p className="label">Starts {dayLabel(w.start)}</p>
            <p className="mt-0.5 font-display text-lg font-bold leading-snug">Next week's food is set</p>
            <p className="text-sm text-muted">
              {change ? `${plural(change.added.length, "new recipe")}${change.kept.length ? `, ${change.kept.length} kept` : ""}. ` : ""}
              Shop for it before your prep day.
            </p>
          </div>
        </div>
        <div className="flex gap-2 px-4 pb-4 sm:px-5 sm:pb-5">
          <Link href="/groceries/" className="btn btn-primary flex-1 sm:flex-none">Shopping list</Link>
          <Link href="/next-week/" className="btn flex-1 sm:flex-none">Change</Link>
        </div>
      </section>
    );
  }

  const over = w.phase === "over";
  const lastDay = dayLabel(addDays(w.next, -1)).split(",")[0];
  const art = [...new Set(plan.result.recipes.map((p) => p.recipe.id))].slice(0, 3).map((id) => RECIPES_BY_ID[id]).filter(Boolean);
  return (
    <section aria-label={over ? "Plan this week" : "Plan next week"} className="card pop overflow-hidden">
      <div className="flex items-start gap-4 p-4 sm:p-5">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-sunk" aria-hidden><CalendarClock size={20} /></span>
        <div className="min-w-0 flex-1">
          <p className="label">{over ? "Your week ran out" : w.daysLeft === 1 ? "Tomorrow is a new week" : `This week ends ${lastDay}`}</p>
          <p className="mt-0.5 font-display text-lg font-bold leading-snug">{over ? "Pick this week's food" : "Pick next week's food"}</p>
          <p className="text-sm text-muted">Keep what you liked, swap the rest for something new. Leftovers from your pantry come with you.</p>
        </div>
        <div className="hidden shrink-0 -space-x-3 sm:flex" aria-hidden>
          {art.map((r) => <RecipeArt key={r!.id} recipe={r!} badges={false} className="h-12 w-12 rounded-full ring-2 ring-surface" />)}
        </div>
      </div>
      <div className="px-4 pb-4 sm:px-5 sm:pb-5">
        <Link href="/next-week/" className="btn btn-primary w-full sm:w-auto">{over ? "Plan this week" : "Plan next week"} <ArrowRight size={16} aria-hidden /></Link>
      </div>
    </section>
  );
}
