"use client";
import { useState } from "react";
import { PREP_PACKS, packDay } from "@prep-cart/catalog";
import { PrepPackCard, usePackCost } from "@/components/preps";
import { Chip, PageHeader } from "@/components/ui";
import { isPittsburghZip, PITTSBURGH_ONLY } from "@/lib/format";
import { useApp } from "@/lib/store";
import { useHydrated } from "@/lib/use-planner";

type Sort = "featured" | "protein" | "kcal" | "cost";

export default function Preps() {
  const hydrated = useHydrated();
  const costOf = usePackCost();
  const [sort, setSort] = useState<Sort>("featured");
  const zip = useApp((st) => st.profile.zip);
  if (!hydrated) return null;
  const list = PREP_PACKS.filter((p) => isPittsburghZip(zip) || !PITTSBURGH_ONLY.has(p.id)).map((p) => ({ p, d: packDay(p), cost: costOf(p) }));
  if (sort === "protein") list.sort((a, b) => b.d.protein / b.d.kcal - a.d.protein / a.d.kcal);
  if (sort === "kcal") list.sort((a, b) => a.d.kcal - b.d.kcal);
  if (sort === "cost") list.sort((a, b) => (a.cost ?? 99) - (b.cost ?? 99));
  return (
    <>
      <PageHeader title="Meal preps" lead="Ready-made weeks: a breakfast, two mains and a snack that prep together. Use one and the planner builds around it, scaling portions to your macros and budget." />
      <div className="rail mb-4" role="group" aria-label="Sort">
        {([["featured", "Featured"], ["protein", "Most protein"], ["kcal", "Fewest calories"], ["cost", "Cheapest"]] as const).map(([v, l]) => <Chip key={v} selected={sort === v} onClick={() => setSort(v)}>{l}</Chip>)}
      </div>
      <h2 className="sr-only">All meal preps</h2>
      <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {list.map(({ p, cost }) => <li key={p.id} className="flex"><PrepPackCard wide pack={p} cost={cost} /></li>)}
      </ul>
      <p className="mt-4 text-xs text-muted">Macros are one serving of each recipe. Your plan adjusts portions to hit your own targets.</p>
    </>
  );
}
