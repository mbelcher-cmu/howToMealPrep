"use client";
import Link from "next/link";
import { useState } from "react";
import { ArrowRight, CalendarClock, ChefHat, ShoppingCart } from "lucide-react";
import { MENU_BY_ID, RECIPES_BY_ID, RESTAURANTS_BY_ID } from "@prep-cart/catalog";
import type { SavedPlan } from "@/lib/store";
import { isoDay, useApp } from "@/lib/store";
import { plusDays, shopDateOf } from "@/lib/shop-day";
import { dayLabel, useWeek } from "@/lib/use-week";
import { cx, plural, recipeHref } from "@/lib/format";
import { RecipeArt } from "./food";

const daysBetween = (from: string, to: string) => Math.round((new Date(`${to}T12:00:00`).getTime() - new Date(`${from}T12:00:00`).getTime()) / 86400000);

/** When the next grocery trip is, and whether it's time to pick the food for it. */
export function useNextTrip() {
  const w = useWeek();
  const sameDay = useApp((s) => s.shopSameDay ?? true);
  const today = isoDay();
  // the trip that starts the next plan: on its first day, or the evening before
  const trip = w.phase === "over" ? today : shopDateOf(w.phase === "ahead" ? w.start : w.next, sameDay);
  const inDays = Math.max(0, daysBetween(today, trip));
  return { ...w, trip, inDays, needsPicks: w.phase === "ending" || w.phase === "over" };
}

/**
 * The top of Home: days until the next grocery trip. Near the end of the plan it turns into the
 * prompt to pick the next stretch of meals from scratch, and once they're picked it says so.
 */
export function NextTripCard() {
  const t = useNextTrip();
  const days = useApp((s) => s.current?.days ?? s.days);
  const when = t.inDays === 0 ? "today" : t.inDays === 1 ? "tomorrow" : dayLabel(t.trip);
  const big = t.phase === "over" ? "Now" : t.inDays === 0 ? "Today" : String(t.inDays);
  const unit = t.phase === "over" || t.inDays === 0 ? "" : t.inDays === 1 ? "day" : "days";
  return (
    <section aria-label="Next grocery trip" className={cx("card overflow-hidden", t.needsPicks && "pop")}>
      <div className="flex items-center gap-4 p-4 sm:p-5">
        <div className="grid h-20 w-20 shrink-0 place-items-center rounded-2xl bg-accent-soft text-center">
          <span className="leading-none">
            <span className="num block font-display text-3xl font-extrabold">{big}</span>
            {unit && <span className="label text-ink">{unit}</span>}
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <p className="label">Next grocery trip</p>
          <h2 className="font-display text-xl font-bold leading-snug">
            {t.phase === "over" ? "Your meals ran out" : t.inDays === 0 ? "Shop today" : `${plural(t.inDays, "day")} until you shop`}
          </h2>
          <p className="text-sm text-muted">
            {t.phase === "ahead" && <>Your next {plural(days, "day")} of meals are picked. Shop {when}.</>}
            {t.phase === "mid" && <>Shop {when}. A couple of days before, we&apos;ll ask you to pick the next {plural(days, "day")} of meals.</>}
            {t.phase === "ending" && <>Shop {when}. Pick your next {plural(days, "day")} of meals first, so the cart is ready.</>}
            {t.phase === "over" && <>Pick your next {plural(days, "day")} of meals and we&apos;ll build a new cart.</>}
          </p>
        </div>
      </div>
      {(t.needsPicks || t.phase === "ahead") && (
        <div className="flex flex-wrap gap-2 px-4 pb-4 sm:px-5 sm:pb-5">
          {t.needsPicks ? (
            <Link href="/next-week/" className="btn btn-primary w-full sm:w-auto">Pick {t.phase === "over" ? "this week's" : "next week's"} meals <ArrowRight size={16} aria-hidden /></Link>
          ) : (
            <>
              <Link href="/groceries/" className="btn btn-primary flex-1 sm:flex-none"><ShoppingCart size={16} aria-hidden /> See the cart</Link>
              <Link href="/next-week/" className="btn flex-1 sm:flex-none"><CalendarClock size={16} aria-hidden /> Change picks</Link>
            </>
          )}
        </div>
      )}
    </section>
  );
}

/**
 * The week's meals as a calendar: one row per day (one column per day on wide screens), today
 * marked, cook days flagged. While next week is planned but not started, it shows the week being eaten.
 */
export function MealCalendar({ plan, start }: { plan: SavedPlan; start: string }) {
  const occasions = useApp((s) => s.occasions);
  const sameDay = useApp((s) => s.shopSameDay ?? true);
  const today = isoDay();
  const cookOn = new Set(plan.schedule.sessions.filter((x) => x.batches.length).map((x) => (sameDay ? x.beforeDay : x.beforeDay - 1)));
  const [showPast, setShowPast] = useState(false);
  const pastDays = plan.schedule.days.filter((d) => plusDays(start, d.day) < today).length;
  const order = (id: string) => { const i = occasions.findIndex((o) => o.id === id); return i < 0 ? 99 : i; };
  return (
    <section aria-labelledby="cal-title" className="min-w-0">
      <div className="mb-2 flex items-end justify-between gap-3">
        <h2 id="cal-title" className="font-display text-xl font-bold">Your meals this week</h2>
        {pastDays > 0 && pastDays < plan.days && (
          <button type="button" className="shrink-0 text-sm font-semibold text-accent hover:underline" aria-expanded={showPast} onClick={() => setShowPast(!showPast)}>
            {showPast ? "Hide past days" : `Show ${plural(pastDays, "past day")}`}
          </button>
        )}
      </div>
      <ol className="grid gap-2 lg:grid-cols-7 lg:gap-1.5">
        {plan.schedule.days.map((d) => {
          const date = plusDays(start, d.day);
          const isToday = date === today;
          const past = date < today;
          if (past && !showPast && pastDays < plan.days) return null;
          const items = [
            ...d.meals.map((m) => ({ occ: m.occasionId, name: m.occasionName, recipe: RECIPES_BY_ID[m.recipeId], text: RECIPES_BY_ID[m.recipeId]?.name ?? "", fresh: m.fresh, href: recipeHref(m.recipeId) })),
            ...(d.takeout ?? []).map((tk) => { const it = MENU_BY_ID[tk.itemId]; return { occ: tk.occasionId, name: tk.occasionName, recipe: undefined, text: it ? `${RESTAURANTS_BY_ID[it.restaurantId]?.name ?? "Takeout"}: ${it.name.split(" (")[0]}` : "Takeout", fresh: false, href: null as string | null }; }),
          ].sort((a, b) => order(a.occ) - order(b.occ));
          return (
            <li key={d.day} aria-current={isToday ? "date" : undefined}
              className={cx("card flex min-w-0 gap-3 p-3 lg:flex-col lg:gap-2 lg:p-2.5", isToday && "ring-2 ring-accent", past && "opacity-60")}>
              <div className="w-14 shrink-0 lg:w-auto">
                <p className={cx("label", isToday && "text-ink")}>{isToday ? "Today" : new Date(`${date}T12:00:00`).toLocaleDateString(undefined, { weekday: "short" })}</p>
                <p className="num font-display text-lg font-bold leading-tight">{new Date(`${date}T12:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</p>
                {cookOn.has(d.day) && <p className="mt-1 inline-flex items-center gap-1 rounded-full bg-sunk px-2 py-0.5 text-[11px] font-semibold"><ChefHat size={12} aria-hidden /> Cook</p>}
              </div>
              <ul className="grid min-w-0 flex-1 gap-1.5">
                {items.map((it) => (
                  <li key={it.occ} className="flex min-w-0 items-center gap-2">
                    {it.recipe && <RecipeArt recipe={it.recipe} badges={false} className="h-9 w-9 shrink-0 rounded-lg lg:hidden" />}
                    <span className="min-w-0 flex-1">
                      <span className="block text-[11px] text-muted">{it.name}{it.fresh ? " · fresh" : ""}</span>
                      {it.href
                        ? <Link href={it.href} className="line-clamp-2 text-sm font-semibold leading-snug hover:underline lg:text-xs">{it.text}</Link>
                        : <span className="line-clamp-2 text-sm font-semibold leading-snug text-warn lg:text-xs">{it.text}</span>}
                    </span>
                  </li>
                ))}
                {!items.length && <li className="text-sm text-muted">Nothing prepped</li>}
              </ul>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
