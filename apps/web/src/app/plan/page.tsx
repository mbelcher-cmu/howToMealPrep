"use client";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { ChevronDown, Lock, LockOpen, Shuffle, X } from "lucide-react";
import { MENU_BY_ID, RECIPES_BY_ID, RESTAURANTS_BY_ID, type MealType } from "@prep-cart/catalog";
import { FavoritesEditor } from "@/components/favorites";
import { useFlag } from "@/lib/flags";
import { BudgetEditor, MealStructureEditor, MoodEditor, RulesEditor, StoresEditor, TargetsEditor } from "@/components/editors";
import { BudgetBar, LockedTag, PerServing, PlanMacros, PlanStatus, RecipeMeta, RecipeTile, SolvingNote } from "@/components/plan-bits";
import { Card, EmptyState, PageHeader, SectionTitle, Tag } from "@/components/ui";
import { SwapButton } from "@/components/swap";
import { NearbyFinder } from "@/components/nearby";
import { useApp } from "@/lib/store";
import { useHydrated, usePlanner } from "@/lib/use-planner";
import { chainName, cx, fmtServings, recipeHref } from "@/lib/format";
import { useDays } from "@/lib/days";

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

/** Phone layout of the week: days with the same food are grouped ("Mon to Wed"), so a rotation reads at a glance. */
function WeekList() {
  const { DAY_NAMES } = useDays();
  const { plan } = usePlanner();
  const occasions = useApp((s) => s.occasions);
  if (!plan) return null;
  const rows = plan.schedule.days.map((d) => ({
    day: d.day,
    items: occasions.map((o) => {
      const out = d.takeout?.find((x) => x.occasionId === o.id);
      const item = out ? MENU_BY_ID[out.itemId] : null;
      if (item) return { occ: o.name, text: `${RESTAURANTS_BY_ID[item.restaurantId]?.name ?? "Takeout"}: ${item.name.split(" (")[0]}`, href: "/eat-out/", kind: "out" as const };
      const m = d.meals.find((x) => x.occasionId === o.id);
      const r = m ? RECIPES_BY_ID[m.recipeId] : null;
      return r ? { occ: o.name, text: r.name, href: recipeHref(r.id), kind: "prep" as const } : { occ: o.name, text: o.prepped ? "—" : "Free", href: null, kind: "free" as const };
    }),
  }));
  const groups: { from: number; to: number; items: (typeof rows)[number]["items"] }[] = [];
  for (const r of rows) {
    const last = groups[groups.length - 1];
    if (last && JSON.stringify(last.items) === JSON.stringify(r.items)) last.to = r.day;
    else groups.push({ from: r.day, to: r.day, items: r.items });
  }
  return (
    <ol className="grid gap-3 sm:hidden">
      {groups.map((g) => (
        <li key={g.from} className="rounded-lg bg-sunk/60 p-3">
          <p className="label">{g.from === g.to ? DAY_NAMES[g.from] : `${DAY_NAMES[g.from]} to ${DAY_NAMES[g.to]}`}</p>
          <dl className="mt-1.5 grid grid-cols-[5.5rem_minmax(0,1fr)] gap-x-2 gap-y-1 text-sm">
            {g.items.map((it) => (
              <div key={it.occ} className="contents">
                <dt className="text-xs leading-5 text-muted">{it.occ}</dt>
                <dd className={cx("min-w-0", it.kind === "free" && "text-muted", it.kind === "out" && "text-warn")}>
                  {it.href ? <Link href={it.href} className="hover:underline">{it.text}</Link> : it.text}
                </dd>
              </div>
            ))}
          </dl>
        </li>
      ))}
    </ol>
  );
}

export default function PlanPage() {
  const { DAY_NAMES } = useDays();
  const hydrated = useHydrated();
  const { plan, status, tryAnother } = usePlanner();
  const s = useApp();
  const ranking = useFlag("mealRanking");
  const [favMeal, setFavMeal] = useState<MealType | undefined>(undefined);
  if (!hydrated) return null;
  const excluded = s.prefs.excludeRecipes ?? [];
  return (
    <>
      <PageHeader title="Plan" lead="Every change re-plans on its own. Keep recipes you like, swap or skip the ones you don't." action={<SolvingNote />} />
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,360px)_minmax(0,1fr)]">
        <div className="order-2 grid min-w-0 grid-cols-1 content-start gap-3 lg:order-1">
          <h2 className="px-1 font-display text-lg font-bold lg:sr-only">Change your week</h2>
          <Panel title="Calories and macros"><TargetsEditor showSuggest /></Panel>
          <Panel title="Meals and rotation"><MealStructureEditor /></Panel>
          <Panel title="Budget and days"><BudgetEditor /></Panel>
          {ranking && <Panel title="Your favorites"><FavoritesEditor meal={favMeal} onMeal={setFavMeal} /></Panel>}
          <Panel title="In the mood for"><MoodEditor /></Panel>
          <Panel title="Diet, allergies and dislikes"><RulesEditor /></Panel>
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
                        <li key={m.id} className="flex justify-between gap-3"><span>{m.name} <span className="text-xs text-muted">({Math.round(m.scale * 100)}% portions)</span></span><span className="num text-muted">{Math.round(m.daily.kcal).toLocaleString()} kcal · {Math.round(m.daily.protein)} g protein from prep</span></li>
                      ))}
                    </ul>
                  </div>
                )}
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
                        <div className="flex flex-wrap items-start gap-3">
                          <RecipeTile recipe={p.recipe} />
                          <div className="min-w-0 flex-1 basis-[180px]">
                            <div className="flex flex-wrap items-center gap-2">
                              <Tag>{p.slot}</Tag>
                              {locked && <LockedTag />}
                            </div>
                            <Link href={recipeHref(p.recipe.id)} className="mt-0.5 block font-semibold hover:underline">{p.recipe.name}</Link>
                            <div className="text-sm">
                              {p.meals} meal{p.meals === 1 ? "" : "s"} · {fmtServings(p.portion)} {(plan.result.household?.members.length ?? 0) > 0 ? "a meal for you" : "each"} · <PerServing recipe={p.recipe} portion={p.portion} />
                            </div>
                            <RecipeMeta recipe={p.recipe} />
                            {p.reasons.length > 0 && <p className="mt-1 text-xs text-muted">Why: {p.reasons.join(" · ")}</p>}
                          </div>
                          {/* phone: a labeled row under the recipe; wider screens: a column on the right */}
                          <div className="flex w-full shrink-0 gap-1.5 sm:w-auto sm:flex-col">
                            <button className="btn btn-sm" onClick={() => s.toggleLock(p.recipe.id)} aria-pressed={locked} aria-label={locked ? `Unlock ${p.recipe.name}` : `Keep ${p.recipe.name}`}>
                              {locked ? <Lock size={14} aria-hidden /> : <LockOpen size={14} aria-hidden />}<span>{locked ? "Locked" : "Keep"}</span>
                            </button>
                            <SwapButton recipeId={p.recipe.id} label="always" />
                            <button className="btn btn-sm" onClick={() => s.skipRecipe(p.recipe.id)} aria-label={`Skip ${p.recipe.name} this week`}>
                              <X size={14} aria-hidden /><span>Skip</span>
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
                <WeekList />
                <div className="hidden overflow-x-auto sm:block">
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
                                {r ? <Link href={recipeHref(r.id)} className="hover:underline">{r.name}</Link> : o.prepped ? "—" : "Free"}
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
            </>
          )}
        </div>
      </div>
    </>
  );
}
