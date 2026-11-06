"use client";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { ArrowRight, ChevronDown } from "lucide-react";
import type { MealType } from "@prep-cart/catalog";
import { FavoritesEditor } from "@/components/favorites";
import { TrainingWeekEditor } from "@/components/training";
import { useFlag } from "@/lib/flags";
import { ShoppingDayEditor } from "@/components/shopping-day";
import { BudgetEditor, MealStructureEditor, MoodEditor, RulesEditor, StoresEditor, TargetsEditor } from "@/components/editors";
import { BudgetBar, PlanMacros, PlanStatus, SolvingNote } from "@/components/plan-bits";
import { Card, EmptyState, PageHeader, SectionTitle } from "@/components/ui";
import { NearbyFinder } from "@/components/nearby";
import { WeekGlance, WeekRecipes } from "@/components/week-recipes";
import { useApp } from "@/lib/store";
import { useHydrated, usePlanner } from "@/lib/use-planner";
import { chainName, cx } from "@/lib/format";

function Panel({ title, children, open: initial = false }: { title: string; children: ReactNode; open?: boolean }) {
  const [open, setOpen] = useState(initial);
  return (
    <section className="card">
      <h2>
        <button type="button" className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left font-display text-base font-bold" aria-expanded={open} onClick={() => setOpen(!open)}>
          {title}<ChevronDown size={18} className={cx("transition-transform", open && "rotate-180")} aria-hidden />
        </button>
      </h2>
      {open && <div className="border-t border-line p-4">{children}</div>}
    </section>
  );
}

export default function PlanPage() {
  const hydrated = useHydrated();
  const { plan, status } = usePlanner();
  const s = useApp();
  const ranking = useFlag("mealRanking");
  const training = useFlag("fitnessSync");
  const simple = useFlag("simple");
  const [favMeal, setFavMeal] = useState<MealType | undefined>(undefined);
  if (!hydrated) return null;
  return (
    <>
      {simple
        ? <PageHeader title="Budget and goals" lead="Set what you spend and what you eat. Your meals and cart update on their own." action={<SolvingNote />} />
        : <PageHeader title="Plan" lead="Every change re-plans on its own. Keep recipes you like, swap or skip the ones you don't." action={<SolvingNote />} />}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,360px)_minmax(0,1fr)]">
        <div className="order-2 grid min-w-0 grid-cols-1 content-start gap-3 lg:order-1">
          <h2 className="px-1 font-display text-lg font-bold lg:sr-only">Change your week</h2>
          {simple && <Panel title="Budget and days" open><div className="grid gap-5"><BudgetEditor /><div className="border-t border-line pt-4"><ShoppingDayEditor /></div></div></Panel>}
          <Panel title="Calories and macros" open={simple}><TargetsEditor showSuggest /></Panel>
          {training && !simple && <Panel title="Training days"><TrainingWeekEditor /></Panel>}
          <Panel title="Meals and rotation"><MealStructureEditor /></Panel>
          {!simple && <Panel title="Budget and days"><div className="grid gap-5"><BudgetEditor /><div className="border-t border-line pt-4"><ShoppingDayEditor /></div></div></Panel>}
          {ranking && !simple && <Panel title="Your favorites"><FavoritesEditor meal={favMeal} onMeal={setFavMeal} /></Panel>}
          {!simple && <Panel title="In the mood for"><MoodEditor /></Panel>}
          <Panel title={simple ? "Diet and allergies" : "Diet, allergies and dislikes"}><RulesEditor /></Panel>
          <Panel title="Stores"><div className="grid gap-5"><NearbyFinder /><div className="border-t border-line pt-4"><StoresEditor /></div></div></Panel>
        </div>

        <div className="order-1 grid min-w-0 grid-cols-1 content-start gap-4 lg:order-2">
          <PlanStatus />
          {!plan ? (
            <EmptyState title={status === "solving" ? "Building your plan" : "No plan yet"}>{status === "solving" ? "This takes a few seconds." : "Change any setting to build one."}</EmptyState>
          ) : (
            <>
              <Card>
                <div className="grid grid-cols-1 gap-5 sm:grid-cols-[minmax(0,1fr)_minmax(0,240px)]">
                  <div>
                    <SectionTitle>Average day from your prep</SectionTitle>
                    <PlanMacros result={plan.result} />
                  </div>
                  <div>
                    <SectionTitle>Groceries</SectionTitle>
                    <BudgetBar cost={plan.result.cost} budget={plan.result.budget} takeout={plan.result.takeout?.cost ?? 0} />
                    <p className="mt-2 text-xs text-muted">At {plan.result.stores.map(chainName).join(" + ") || "—"} · estimated prices</p>
                  </div>
                </div>
                {(plan.result.household?.members.length ?? 0) > 0 && (
                  <div className="mt-4 border-t border-line pt-3">
                    <p className="label mb-1.5">Cooking for {plan.result.household.people}</p>
                    <ul className="grid gap-1 text-sm">
                      <li className="flex justify-between gap-3"><span>You</span><span className="num text-muted">{Math.round(plan.result.daily.kcal).toLocaleString()} kcal · {Math.round(plan.result.daily.protein)} g protein</span></li>
                      {plan.result.household.members.map((m) => (
                        m.target
                          ? <li key={m.id} className="flex justify-between gap-3"><span>{m.name}{m.meals ? <span className="text-xs text-muted"> ({m.sharedMeals === m.meals ? "all shared" : `${m.sharedMeals} of ${m.meals} meals shared`})</span> : null}</span><span className="num text-muted">{Math.round(m.daily.kcal).toLocaleString()} of {m.target.kcal.toLocaleString()} kcal · {Math.round(m.daily.protein)} of {m.target.protein} g protein</span></li>
                          : <li key={m.id} className="flex justify-between gap-3"><span>{m.name} <span className="text-xs text-muted">({Math.round(m.scale * 100)}% portions)</span></span><span className="num text-muted">{Math.round(m.daily.kcal).toLocaleString()} kcal · {Math.round(m.daily.protein)} g protein from prep</span></li>
                      ))}
                    </ul>
                  </div>
                )}
              </Card>

              {simple && (
                <div className="grid gap-2 sm:grid-cols-2">
                  <Link href="/meals/" className="btn">See your meals <ArrowRight size={16} aria-hidden /></Link>
                  <Link href="/groceries/" className="btn btn-primary">Go to your cart <ArrowRight size={16} aria-hidden /></Link>
                </div>
              )}
              {!simple && <WeekRecipes />}
              {!simple && <WeekGlance />}
            </>
          )}
        </div>
      </div>
    </>
  );
}
