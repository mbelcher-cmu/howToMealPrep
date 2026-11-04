"use client";
import Link from "next/link";
import { ShoppingCart } from "lucide-react";
import { INGREDIENTS, MENU_BY_ID, PREP_PACKS, RECIPES_BY_ID, RESTAURANTS_BY_ID } from "@prep-cart/catalog";
import { usualPrice } from "@/components/deals";
import { BudgetBar, PlanMacros, PlanStatus, SolvingNote, usePreppedTargets } from "@/components/plan-bits";
import { ItemCard, RecipeArt, RecipeCard, Rail } from "@/components/food";
import { PrepPackCard, usePackCost } from "@/components/preps";
import { Card, EmptyState, PageHeader, SectionTitle } from "@/components/ui";
import { useApp } from "@/lib/store";
import { useHydrated, usePlanner } from "@/lib/use-planner";
import { chainName, isPittsburghZip, money, plural, recipeHref, PITTSBURGH_ONLY } from "@/lib/format";
import { useDays } from "@/lib/days";

export default function Home() {
  const { DAY_LONG, weekStart } = useDays();
  const hydrated = useHydrated();
  const { plan, status } = usePlanner();
  const zip = useApp((s) => s.profile.zip);
  const checked = useApp((s) => s.checked);
  const deals = useApp((s) => s.deals);
  const overrides = useApp((s) => s.priceOverrides);
  const t = usePreppedTargets();
  const packCost = usePackCost();
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
  const todo = r.cart.filter((l) => !checked[`${l.chain}:${l.ingredientId}`]);
  return (
    <>
      <PageHeader title="This week" lead={<>Your {plan.days}-day plan: {plural(r.recipes.length, "recipe")} from {r.stores.map(chainName).join(" and ") || "your stores"}.</>} action={<SolvingNote />} />
      <PlanStatus />
      <div className="grid gap-7">
        <Rail title={day ? `${DAY_LONG[dayIdx]}'s food` : "Today"} href="/plan/" linkLabel="Whole week">
          {day?.takeout?.map((tk) => {
            const item = MENU_BY_ID[tk.itemId];
            return item ? (
              <Link key={tk.occasionId} href="/eat-out/" className="card flex w-[220px] shrink-0 flex-col justify-between bg-warn-soft p-4 sm:w-[240px]">
                <span className="label">{tk.occasionName} · takeout</span>
                <span className="mt-2 font-display text-[16px] font-bold leading-snug">{RESTAURANTS_BY_ID[item.restaurantId]?.name}: {item.name.split(" (")[0]}</span>
                <span className="num mt-2 text-sm text-muted">{item.kcal} kcal · {item.protein}g protein</span>
              </Link>
            ) : null;
          })}
          {day?.meals.map((m) => {
            const rec = RECIPES_BY_ID[m.recipeId];
            return rec ? <RecipeCard key={m.occasionId} recipe={rec} portion={m.portion} eyebrow={m.occasionName} /> : null;
          })}
          {!day?.meals.length && !day?.takeout?.length && <p className="text-sm text-muted">Nothing prepped is planned for today.</p>}
        </Rail>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <SectionTitle aside={<Link href="/plan/" className="text-sm text-accent underline-offset-2 hover:underline">Adjust</Link>}>Average day from your prep</SectionTitle>
            <PlanMacros result={r} />
            {t.allowanceKcal > 0 && <p className="mt-3 text-xs text-muted">Plus about {t.allowanceKcal.toLocaleString()} kcal a day you've kept free for meals you don't prep.</p>}
          </Card>
          <Card>
            <SectionTitle>Groceries</SectionTitle>
            <BudgetBar cost={r.cost} budget={r.budget} takeout={r.takeout?.cost ?? 0} />
            <p className="mt-3 text-sm text-muted">{bought} of {plural(r.cart.length, "item")} in the cart · about {money(r.cost / Math.max(1, plan.days * Math.max(1, plan.schedule.days[0]?.meals.length ?? 1)))} a meal</p>
            <Link href="/shop/" className="btn btn-primary mt-3 w-full"><ShoppingCart size={16} aria-hidden /> Shop in store</Link>
            <Link href="/groceries/" className="btn mt-2 w-full">Full list</Link>
          </Card>
        </div>


        <section aria-label="Your prep this week">
          <div className="mb-2 flex items-end justify-between gap-3">
            <div>
              <h2 className="font-display text-xl font-bold">Your prep this week</h2>
              {nextSession && <p className="text-sm text-muted">Cook {plural(nextSession.batches.length, "recipe")} before {DAY_LONG[nextSession.beforeDay]}.{plan.schedule.sessions.slice(1).map((x) => <span key={x.index}> Then {x.batches.length} more before {DAY_LONG[x.beforeDay]}, so it stays fresh.</span>)}</p>}
            </div>
            <Link href="/prep/" className="shrink-0 text-sm font-semibold text-accent hover:underline">Prep plan</Link>
          </div>
          <ul className="card divide-y divide-line">
            {r.recipes.map((p) => (
              <li key={p.recipe.id}>
                <Link href={recipeHref(p.recipe.id)} className="flex items-center gap-3 px-3 py-2.5 hover:bg-sunk">
                  <RecipeArt recipe={p.recipe} badges={false} className="h-12 w-12 shrink-0 rounded-lg" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{p.recipe.name}</span>
                    <span className="block text-xs text-muted">{p.meals} meal{p.meals === 1 ? "" : "s"} · {p.slot === "main" ? "lunch or dinner" : p.slot}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>


        {todo.length > 0 && (
          <Rail title="Still to buy" href="/groceries/" linkLabel="Shopping list" lead={`${plural(todo.length, "item")}, about ${money(todo.reduce((a, l) => a + l.cost, 0))}`}>
            {todo.slice(0, 16).map((l) => <ItemCard key={l.chain + l.ingredientId} ingredientId={l.ingredientId} price={l.cost} note={`${l.packages} × ${INGREDIENTS[l.ingredientId]?.pkg.label ?? ""} · ${chainName(l.chain)}`} />)}
          </Rail>
        )}

        {sales.length > 0 && (
          <Rail title="On sale in your cart" href="/pantry/" linkLabel="All sales" lead={saved > 0 ? `Your plan saves about ${money(saved)} with ${sales.length} sale item${sales.length === 1 ? "" : "s"}.` : undefined}>
            {sales.map((l) => <ItemCard key={l.ingredientId + l.chain} ingredientId={l.ingredientId} price={l.unitPrice} note={l.regular ? `Save ${money((l.regular - l.unitPrice) * l.packages)} at ${chainName(l.chain)}` : `At ${chainName(l.chain)}`} />)}
          </Rail>
        )}


        <Rail title="Featured meal preps" href="/preps/" lead="Ready-made weeks with their macros. Use one and the plan builds around it.">
          {PREP_PACKS.filter((p) => isPittsburghZip(zip) || !PITTSBURGH_ONLY.has(p.id)).map((p) => <PrepPackCard key={p.id} pack={p} cost={packCost(p)} />)}
        </Rail>
      </div>
    </>
  );
}
