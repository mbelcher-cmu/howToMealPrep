"use client";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { ChevronDown, Lock, LockOpen, Shuffle, X } from "lucide-react";
import { MENU_BY_ID, RECIPES_BY_ID, RESTAURANTS_BY_ID } from "@prep-cart/catalog";
import { BudgetEditor, MealStructureEditor, MoodEditor, StoresEditor, TargetsEditor } from "@/components/editors";
import { BudgetBar, LockedTag, PerServing, PlanMacros, PlanStatus, RecipeMeta, RecipeTile, SolvingNote } from "@/components/plan-bits";
import { Card, EmptyState, PageHeader, SectionTitle, Tag } from "@/components/ui";
import { useApp } from "@/lib/store";
import { useHydrated, usePlanner } from "@/lib/use-planner";
import { chainName, cx, DAY_NAMES, fmtServings, money } from "@/lib/format";

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
  const { plan, status, tryAnother } = usePlanner();
  const s = useApp();
  if (!hydrated) return null;
  const exclude = (id: string) => s.set({ prefs: { ...s.prefs, excludeRecipes: [...(s.prefs.excludeRecipes ?? []), id] }, locked: s.locked.filter((x) => x !== id) });
  const excluded = s.prefs.excludeRecipes ?? [];
  return (
    <>
      <PageHeader title="Plan" lead="Every change re-plans on its own. Lock recipes you want to keep, skip the ones you don't." action={<SolvingNote />} />
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,360px)_minmax(0,1fr)]">
        <div className="grid min-w-0 grid-cols-1 content-start gap-3">
          <Panel title="Calories and macros" open><TargetsEditor showSuggest /></Panel>
          <Panel title="Meals and snacks"><MealStructureEditor /></Panel>
          <Panel title="Budget and days"><BudgetEditor /></Panel>
          <Panel title="In the mood for"><MoodEditor /></Panel>
          <Panel title="Stores"><StoresEditor /></Panel>
          <p className="px-1 text-xs text-muted">Diet, allergies and dislikes are in <Link href="/settings/" className="underline">Settings</Link>.</p>
        </div>

        <div className="grid min-w-0 grid-cols-1 content-start gap-4">
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
              </Card>

              <Card>
                <SectionTitle aside={<button className="btn btn-sm" onClick={tryAnother} disabled={status === "solving"}><Shuffle size={14} aria-hidden /> Try another plan</button>}>
                  Recipes this week
                </SectionTitle>
                <ul className="grid gap-3">
                  {plan.result.recipes.map((p) => {
                    const locked = s.locked.includes(p.recipe.id);
                    return (
                      <li key={p.recipe.id} className="rounded-lg border border-line p-3">
                        <div className="flex items-start gap-3">
                          <RecipeTile recipe={p.recipe} />
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <Tag>{p.slot}</Tag>
                              {locked && <LockedTag />}
                            </div>
                            <Link href={`/recipes/${p.recipe.id}/`} className="mt-0.5 block font-semibold hover:underline">{p.recipe.name}</Link>
                            <div className="text-sm">
                              {p.meals} meal{p.meals === 1 ? "" : "s"} · cook {fmtServings(p.servings)} · {fmtServings(p.portion)} each · <PerServing recipe={p.recipe} portion={p.portion} />
                            </div>
                            <RecipeMeta recipe={p.recipe} />
                            {p.reasons.length > 0 && <p className="mt-1 text-xs text-muted">Why: {p.reasons.join(" · ")}</p>}
                          </div>
                          <div className="flex shrink-0 flex-col gap-1.5">
                            <button className="btn btn-sm" onClick={() => s.toggleLock(p.recipe.id)} aria-pressed={locked} aria-label={locked ? `Unlock ${p.recipe.name}` : `Keep ${p.recipe.name}`}>
                              {locked ? <Lock size={14} aria-hidden /> : <LockOpen size={14} aria-hidden />}<span className="hidden sm:inline">{locked ? "Locked" : "Keep"}</span>
                            </button>
                            <button className="btn btn-sm" onClick={() => exclude(p.recipe.id)} aria-label={`Skip ${p.recipe.name} this week`}>
                              <X size={14} aria-hidden /><span className="hidden sm:inline">Skip</span>
                            </button>
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
                {excluded.length > 0 && (
                  <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted">
                    Skipped: {excluded.map((id) => RECIPES_BY_ID[id]?.name ?? id).join(", ")}
                    <button className="underline" onClick={() => s.set({ prefs: { ...s.prefs, excludeRecipes: [] } })}>Bring back</button>
                  </div>
                )}
              </Card>

              <Card>
                <SectionTitle>Week at a glance</SectionTitle>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[560px] border-separate border-spacing-1 text-left text-sm">
                    <thead>
                      <tr>
                        <th className="label w-24 font-semibold" scope="col"><span className="sr-only">Meal</span></th>
                        {plan.schedule.days.map((d) => <th key={d.day} scope="col" className="label text-center">{DAY_NAMES[d.day]}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {s.occasions.map((o) => (
                        <tr key={o.id}>
                          <th scope="row" className="pr-2 align-top text-xs font-semibold text-muted">{o.name}</th>
                          {plan.schedule.days.map((d) => {
                            const m = d.meals.find((x) => x.occasionId === o.id);
                            const r = m ? RECIPES_BY_ID[m.recipeId] : null;
                            const out = d.takeout?.find((x) => x.occasionId === o.id);
                            const item = out ? MENU_BY_ID[out.itemId] : null;
                            if (item) return (
                              <td key={d.day} className="rounded-md bg-warn-soft px-1.5 py-1 align-top text-xs leading-snug">
                                <Link href="/eat-out/" className="hover:underline"><b className="block font-semibold">{RESTAURANTS_BY_ID[item.restaurantId]?.name}</b>{item.name.split(" (")[0]}</Link>
                              </td>
                            );
                            return (
                              <td key={d.day} className={cx("rounded-md px-1.5 py-1 align-top text-xs leading-snug", r ? "bg-accent-soft" : "bg-sunk text-muted")}>
                                {r ? <Link href={`/recipes/${r.id}/`} className="hover:underline">{r.name}</Link> : o.prepped ? "—" : "Free"}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="mt-2 text-xs text-muted">"Free" meals aren't prepped. Their calories are left open for eating out or cooking fresh. <Link href="/eat-out/" className="underline">Add takeout</Link> to any meal and the plan cooks around it.</p>
              </Card>
              <p className="text-xs text-muted">Solved in {(plan.result.solveMs / 1000).toFixed(1)} s · {money(plan.result.cost)} total</p>
            </>
          )}
        </div>
      </div>
    </>
  );
}
