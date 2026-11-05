"use client";
import { useState } from "react";
import { packDay } from "@prep-cart/catalog";
import { PrepPackCard, usePackCost, useVisiblePacks } from "@/components/preps";
import Link from "next/link";
import { Chip, EmptyState, PageHeader } from "@/components/ui";
import { useHydrated } from "@/lib/use-planner";

type Sort = "featured" | "protein" | "kcal" | "cost";

export default function Preps() {
  const hydrated = useHydrated();
  const costOf = usePackCost();
  const [sort, setSort] = useState<Sort>("featured");
  const { packs, hidden } = useVisiblePacks();
  if (!hydrated) return null;
  const list = packs.map((p) => ({ p, d: packDay(p), cost: costOf(p) }));
  if (sort === "protein") list.sort((a, b) => b.d.protein / b.d.kcal - a.d.protein / a.d.kcal);
  if (sort === "kcal") list.sort((a, b) => a.d.kcal - b.d.kcal);
  if (sort === "cost") list.sort((a, b) => (a.cost ?? 99) - (b.cost ?? 99));
  return (
    <>
      <PageHeader title="Meal preps" lead="Ready-made weeks: a breakfast, two mains and a snack that prep together. Use one and the planner builds around it, scaling portions to your macros and budget." />
      <div className="rail mb-4" role="group" aria-label="Sort">
        {([["featured", "Featured"], ["protein", "Most protein"], ["kcal", "Fewest calories"], ["cost", "Cheapest"]] as const).map(([v, l]) => <Chip key={v} selected={sort === v} onClick={() => setSort(v)}>{l}</Chip>)}
      </div>
      {hidden > 0 && <p className="mb-3 text-sm text-muted">{list.length ? `Showing the ${list.length} that fit your diet.` : ""} {hidden} more {hidden === 1 ? "doesn't" : "don't"} fit it. <Link href="/plan/" className="underline">Change diet</Link></p>}
      {list.length === 0 && <EmptyState title="No meal preps fit your diet yet">The planner still builds a week from every recipe that fits.</EmptyState>}
      <h2 className="sr-only">All meal preps</h2>
      <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {list.map(({ p, cost }) => <li key={p.id} className="flex"><PrepPackCard wide pack={p} cost={cost} /></li>)}
      </ul>
      <p className="mt-4 text-xs text-muted">Macros are one serving of each recipe. Your plan adjusts portions to hit your own targets.</p>
    </>
  );
}
