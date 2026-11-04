"use client";
import Link from "next/link";
import { Snowflake, Timer } from "lucide-react";
import { formatAmount, INGREDIENTS, RECIPES_BY_ID } from "@prep-cart/catalog";
import { RecipeTile, SolvingNote } from "@/components/plan-bits";
import { Card, EmptyState, PageHeader, SectionTitle } from "@/components/ui";
import { useApp } from "@/lib/store";
import { useHydrated, usePlanner } from "@/lib/use-planner";
import { DAY_LONG, fmtServings } from "@/lib/format";

export default function Prep() {
  const hydrated = useHydrated();
  const { plan } = usePlanner();
  const units = useApp((s) => s.profile.units);
  if (!hydrated) return null;
  if (!plan) return (<><PageHeader title="Prep day" /><EmptyState title="No plan yet">Your cooking plan appears here once a plan is ready.</EmptyState></>);
  const { sessions, freezer } = plan.schedule;
  return (
    <>
      <PageHeader title="Prep day" lead="What to cook, how much, and in what order. Amounts are already scaled to your plan." action={<SolvingNote />} />
      {freezer.length > 0 && (
        <Card className="mb-4">
          <SectionTitle>Freezer</SectionTitle>
          <ul className="grid gap-1 text-sm">
            {freezer.map((f) => (
              <li key={f.recipeId} className="flex items-start gap-2">
                <Snowflake size={16} className="mt-0.5 shrink-0 text-accent" aria-hidden />
                <span>Freeze {f.portions} portion{f.portions === 1 ? "" : "s"} of <b>{RECIPES_BY_ID[f.recipeId]?.name}</b> on prep day. Move to the fridge the night before {DAY_LONG[f.thawBeforeDay]}.</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
      <div className="grid gap-6">
        {sessions.map((sess) => {
          const batches = sess.batches.map((b) => ({ ...b, recipe: RECIPES_BY_ID[b.recipeId]! })).filter((b) => b.recipe)
            // longest total time first so the oven or slow cooker runs while you do the rest
            .sort((a, b) => b.recipe.totalMinutes - a.recipe.totalMinutes);
          const active = batches.reduce((a, b) => a + b.recipe.activeMinutes, 0);
          const longest = Math.max(0, ...batches.map((b) => b.recipe.totalMinutes));
          return (
            <section key={sess.index} aria-labelledby={`sess-${sess.index}`}>
              <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
                <h2 id={`sess-${sess.index}`} className="font-display text-xl font-bold">
                  {sess.index === 0 ? "Main prep" : "Top-up prep"} <span className="font-normal text-muted">· before {DAY_LONG[sess.beforeDay]}</span>
                </h2>
                <span className="inline-flex items-center gap-1.5 text-sm text-muted"><Timer size={15} aria-hidden /> About {Math.max(longest + 10, active)} min in all, {active} hands-on</span>
              </div>
              <div className="grid gap-4">
                {batches.map((b, n) => {
                  const scale = b.servings / b.recipe.servings;
                  return (
                    <Card key={b.recipeId} as="article">
                      <div className="flex items-start gap-3">
                        <RecipeTile recipe={b.recipe} />
                        <div className="min-w-0 flex-1">
                          <p className="label">Step {n + 1}</p>
                          <h3 className="font-display text-lg font-bold"><Link href={`/recipes/${b.recipe.id}/`} className="hover:underline">{b.recipe.name}</Link></h3>
                          <p className="text-sm text-muted">Make {fmtServings(b.servings)} ({scale === 1 ? "as written" : `${Math.round(scale * 100) / 100}× the recipe`}) · {b.recipe.activeMinutes} min hands-on, {b.recipe.totalMinutes} total</p>
                        </div>
                      </div>
                      <div className="mt-4 grid gap-5 md:grid-cols-[minmax(0,240px)_minmax(0,1fr)]">
                        <div>
                          <h4 className="label mb-1.5">Ingredients</h4>
                          <ul className="grid gap-1 text-sm">
                            {b.recipe.lines.map((l) => (
                              <li key={l.ingredientId} className="flex justify-between gap-3">
                                <span>{INGREDIENTS[l.ingredientId]?.name}</span>
                                <span className="num shrink-0 text-muted">{formatAmount(l.ingredientId, l.grams * scale, units)}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                        <div>
                          <h4 className="label mb-1.5">Method</h4>
                          <ol className="grid list-decimal gap-1.5 pl-5 text-sm">
                            {b.recipe.steps.map((st, i) => <li key={i}>{st}</li>)}
                          </ol>
                          <p className="mt-3 text-xs text-muted">
                            Portion into {Math.round(b.servings / Math.max(0.25, plan.result.recipes.find((p) => p.recipe.id === b.recipeId)?.portion ?? 1))} containers. Keeps {b.recipe.fridgeDays} days in the fridge.
                            {b.recipe.reheat && <> Reheat: {b.recipe.reheat}</>}
                          </p>
                        </div>
                      </div>
                    </Card>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
    </>
  );
}
