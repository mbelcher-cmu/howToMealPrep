"use client";
import Link from "next/link";
import { ArrowRight, ChefHat, ShoppingCart } from "lucide-react";
import { INGREDIENTS, MENU_BY_ID, RECIPES_BY_ID, RESTAURANTS_BY_ID } from "@prep-cart/catalog";
import { usualPrice } from "@/components/deals";
import { BudgetBar, PlanMacros, PlanStatus, RecipeTile, SolvingNote, usePreppedTargets } from "@/components/plan-bits";
import { Card, EmptyState, PageHeader, SectionTitle } from "@/components/ui";
import { useApp } from "@/lib/store";
import { useHydrated, usePlanner } from "@/lib/use-planner";
import { chainName, money } from "@/lib/format";
import { useDays } from "@/lib/days";

export default function Home() {
  const { DAY_LONG, weekStart } = useDays();
  const hydrated = useHydrated();
  const { plan, status } = usePlanner();
  const checked = useApp((s) => s.checked);
  const deals = useApp((s) => s.deals);
  const overrides = useApp((s) => s.priceOverrides);
  const t = usePreppedTargets();
  if (!hydrated) return null;
  if (!plan) {
    return (
      <>
        <PageHeader title="This week" />
        <EmptyState title={status === "solving" ? "Building your first plan" : "No plan yet"}>
          {status === "solving" ? "Picking recipes that hit your macros within budget. This takes a few seconds." : <Link className="underline" href="/plan/">Open Plan to build one.</Link>}
        </EmptyState>
      </>
    );
  }
  const r = plan.result;
  const today = ((new Date().getDay() + 6) % 7 - weekStart + 7) % 7; // plan day for today
  const dayIdx = Math.min(today, plan.days - 1);
  const day = plan.schedule.days[dayIdx];
  const bought = r.cart.filter((l) => checked[`${l.chain}:${l.ingredientId}`]).length;
  const nextSession = plan.schedule.sessions[0];
  const sales = r.cart.filter((l) => l.priceSource === "sale").map((l) => ({ ...l, regular: deals.find((d) => d.ingredientId === l.ingredientId && d.chain === l.chain) ? usualPrice(l.ingredientId, l.chain, overrides) : null }));
  const saved = sales.reduce((a, l) => a + (l.regular ? (l.regular - l.unitPrice) * l.packages : 0), 0);
  return (
    <>
      <PageHeader title="This week" lead={<>Your {plan.days}-day plan: {r.recipes.length} recipes from {r.stores.map(chainName).join(" and ") || "your stores"}.</>} action={<SolvingNote />} />
      <PlanStatus />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <SectionTitle aside={<Link href="/plan/" className="text-sm text-accent underline-offset-2 hover:underline">Adjust</Link>}>Average day from your prep</SectionTitle>
          <PlanMacros result={r} />
          {t.allowanceKcal > 0 && <p className="mt-3 text-xs text-muted">Plus about {t.allowanceKcal.toLocaleString()} kcal a day you've kept free for meals you don't prep.</p>}
        </Card>
        <Card>
          <SectionTitle>Groceries</SectionTitle>
          <BudgetBar cost={r.cost} budget={r.budget} takeout={r.takeout?.cost ?? 0} />
          <p className="mt-3 text-sm text-muted">{bought} of {r.cart.length} items in the cart</p>
          <Link href="/groceries/" className="btn btn-primary mt-3 w-full"><ShoppingCart size={16} aria-hidden /> Shopping list</Link>
        </Card>
        <Card className="lg:col-span-2">
          <SectionTitle aside={<Link href="/plan/" className="text-sm text-accent underline-offset-2 hover:underline">Whole week</Link>}>{day ? `${DAY_LONG[dayIdx]}'s food` : "Today"}</SectionTitle>
          {day?.takeout?.map((t) => {
            const item = MENU_BY_ID[t.itemId];
            return item ? (
              <Link key={t.occasionId} href="/eat-out/" className="mb-2 flex items-center gap-3 rounded-lg bg-warn-soft p-2 text-sm">
                <span className="min-w-0 flex-1"><span className="label block">{t.occasionName} · takeout</span><span className="block truncate font-medium">{RESTAURANTS_BY_ID[item.restaurantId]?.name}: {item.name.split(" (")[0]}</span></span>
                <span className="num text-muted">{item.kcal} kcal</span>
              </Link>
            ) : null;
          })}
          {day && day.meals.length ? (
            <ul className="grid grid-cols-1 gap-2">
              {day.meals.map((m) => {
                const rec = RECIPES_BY_ID[m.recipeId];
                if (!rec) return null;
                return (
                  <li key={m.occasionId}>
                    <Link href={`/recipes/${rec.id}/`} className="flex min-w-0 items-center gap-3 rounded-lg p-1.5 hover:bg-sunk">
                      <RecipeTile recipe={rec} size={40} />
                      <span className="min-w-0 flex-1">
                        <span className="label block">{m.occasionName}</span>
                        <span className="block truncate font-medium">{rec.name}</span>
                      </span>
                      <span className="num text-sm text-muted">{Math.round(rec.perServing.kcal * m.portion)} kcal</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          ) : <p className="text-sm text-muted">Nothing prepped is planned for today.</p>}
        </Card>
        {sales.length > 0 && (
          <Card className="lg:col-span-3">
            <SectionTitle aside={<Link href="/pantry/" className="text-sm text-accent underline-offset-2 hover:underline">All sales</Link>}>On sale this week</SectionTitle>
            <ul className="flex flex-wrap gap-2">
              {sales.map((l) => (
                <li key={l.ingredientId + l.chain} className="pill">
                  {INGREDIENTS[l.ingredientId]?.name} · {money(l.unitPrice)} at {chainName(l.chain)}{l.regular ? ` (save ${money((l.regular - l.unitPrice) * l.packages)})` : ""}
                </li>
              ))}
            </ul>
            {saved > 0 && <p className="mt-2 text-sm text-muted">Your plan uses {sales.length} sale item{sales.length === 1 ? "" : "s"} and saves about {money(saved)}.</p>}
          </Card>
        )}
        <Card>
          <SectionTitle>Prep day</SectionTitle>
          {nextSession && (
            <p className="text-sm text-muted">
              Cook {nextSession.batches.length} recipes before {DAY_LONG[nextSession.beforeDay]}.
              {plan.schedule.sessions.length > 1 && <> A short second session before {DAY_LONG[plan.schedule.sessions[1]!.beforeDay]} keeps everything fresh.</>}
            </p>
          )}
          <Link href="/prep/" className="btn mt-3 w-full"><ChefHat size={16} aria-hidden /> Prep plan <ArrowRight size={16} aria-hidden /></Link>
          <Link href="/pantry/" className="btn mt-2 w-full">Pantry and prices</Link>
          <p className="mt-3 text-xs text-muted">Estimated {money(r.cost / Math.max(1, plan.days * Math.max(1, plan.schedule.days[0]?.meals.length ?? 1)))} per prepped meal.</p>
        </Card>
      </div>
    </>
  );
}
