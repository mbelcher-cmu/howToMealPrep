"use client";
import Link from "next/link";
import { useMemo } from "react";
import { Check, Timer } from "lucide-react";
import { PREP_PACKS, packDay, packFits, packRecipes, type PrepPack } from "@prep-cart/catalog";
import { buildPriceTable, servingCost } from "@prep-cart/planner";
import { useApp } from "@/lib/store";
import { cx, isPittsburghZip, money, PITTSBURGH_ONLY, recipeHref } from "@/lib/format";
import { useFlag } from "@/lib/flags";
import { RecipeArt } from "./food";

/** Cheapest estimated cost of one day of the pack across the person's stores. */
export function usePackCost() {
  const overrides = useApp((s) => s.priceOverrides);
  const stores = useApp((s) => s.stores);
  const prices = useMemo(() => buildPriceTable(overrides), [overrides]);
  return (p: PrepPack) => {
    const rs = packRecipes(p);
    const per = stores.map((c) => rs.reduce((a, r) => a + servingCost(r, prices, [c], new Set()), 0)).filter((x) => x > 0 && Number.isFinite(x));
    return per.length ? Math.min(...per) : null;
  };
}

/**
 * Meal preps to show: local ones only near Pittsburgh, and (with the wholeFoods flag) only packs whose
 * recipes all fit the person's diets, since the planner would drop the rest. hidden counts the diet misses.
 */
export function useVisiblePacks(): { packs: PrepPack[]; hidden: number } {
  const zip = useApp((s) => s.profile.zip);
  const diets = useApp((s) => s.prefs.diets);
  const byDiet = useFlag("wholeFoods");
  const local = PREP_PACKS.filter((p) => isPittsburghZip(zip) || !PITTSBURGH_ONLY.has(p.id));
  const packs = byDiet ? local.filter((p) => packFits(p, diets)) : local;
  return { packs, hidden: local.length - packs.length };
}

export function usePack() {
  const s = useApp();
  const isUsing = (p: PrepPack) => { const ids = packRecipes(p).map((r) => r.id); return ids.length > 0 && ids.every((id) => s.locked.includes(id)) && s.locked.length === ids.length; };
  const use = (p: PrepPack) => s.set({ locked: [...new Set(packRecipes(p).map((r) => r.id))], variety: { ...s.variety, breakfast: 1, main: 2, snack: 1 } });
  return { isUsing, use };
}

export function PrepPackCard({ pack, wide, cost }: { pack: PrepPack; wide?: boolean; cost: number | null }) {
  const rs = packRecipes(pack);
  const d = packDay(pack);
  const { isUsing, use } = usePack();
  const on = isUsing(pack);
  return (
    <article className={cx("card flex flex-col overflow-hidden", wide ? "w-full" : "w-[280px] shrink-0 sm:w-[300px]")}>
      <div className="grid aspect-[16/10] grid-cols-2 grid-rows-2 gap-0.5 bg-line/50">
        {rs.map((r) => <RecipeArt key={r.id} recipe={r} className="h-full w-full" badges={false} />)}
      </div>
      <div className="flex flex-1 flex-col gap-2 p-3.5">
        <div className="flex flex-wrap gap-1">{pack.tags.map((t) => <span key={t} className="chip-macro bg-accent-soft text-ink">{t}</span>)}</div>
        <h3 className="font-display text-lg font-bold leading-snug">{pack.name}</h3>
        <p className="text-sm text-muted">{pack.tagline}</p>
        <div className="num grid grid-cols-4 gap-1 rounded-xl bg-sunk p-2 text-center">
          <div><div className="text-[15px] font-bold">{d.kcal.toLocaleString()}</div><div className="text-[10px] uppercase tracking-wide text-muted">kcal</div></div>
          <div><div className="text-[15px] font-bold text-protein">{d.protein}g</div><div className="text-[10px] uppercase tracking-wide text-muted">protein</div></div>
          <div><div className="text-[15px] font-bold text-carbs">{d.carbs}g</div><div className="text-[10px] uppercase tracking-wide text-muted">carbs</div></div>
          <div><div className="text-[15px] font-bold text-fat">{d.fat}g</div><div className="text-[10px] uppercase tracking-wide text-muted">fat</div></div>
        </div>
        <ul className="grid gap-0.5 text-[13px]">
          {rs.map((r) => <li key={r.id} className="truncate"><span className="text-muted">{r.mealType === "main" ? "Main" : r.mealType === "breakfast" ? "Breakfast" : "Snack"}:</span> <Link href={recipeHref(r.id)} className="hover:underline">{r.name}</Link></li>)}
        </ul>
        <p className="mt-auto flex items-center gap-3 pt-1 text-xs text-muted">
          <span>{cost != null ? <>About <b className="num text-ink">{money(cost)}</b> a day</> : "Price varies"}</span>
          <span className="inline-flex items-center gap-1"><Timer size={12} aria-hidden /> {d.activeMinutes} min hands-on</span>
        </p>
        <button className={cx("btn w-full", on ? "" : "btn-primary")} onClick={() => use(pack)} disabled={on}>
          {on ? <><Check size={16} aria-hidden /> In your plan</> : "Use this prep"}
        </button>
      </div>
    </article>
  );
}
