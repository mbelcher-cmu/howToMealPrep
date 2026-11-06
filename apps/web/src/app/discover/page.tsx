"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { CUISINES, RECIPES, RECIPES_BY_ID, type MealType } from "@prep-cart/catalog";
import { hardRejection } from "@prep-cart/planner";
import { RecipeCard, Rail } from "@/components/food";
import { PicksRail } from "@/components/picks";
import { PrepPackCard, usePackCost, useVisiblePacks } from "@/components/preps";
import { Chip, PageHeader } from "@/components/ui";
import { useApp } from "@/lib/store";
import { useCommunity, useRecommendations } from "@/lib/recommend";
import { useHydrated } from "@/lib/use-planner";
import { plural } from "@/lib/format";

const MEALS: [MealType | "all", string][] = [["all", "All"], ["breakfast", "Breakfast"], ["main", "Lunch and dinner"], ["snack", "Snacks"]];
const PAGE = 24;

/**
 * Discover: the place to just look. Browse recipes, see what the MacroAisle community rates highly
 * and cooks most, and open the meal preps. Nothing here changes the plan until you add a recipe
 * from its page or pick it on Meals.
 */
export default function Discover() {
  const hydrated = useHydrated();
  const prefs = useApp((s) => s.prefs);
  const ratings = useApp((s) => s.ratings);
  useRecommendations(); // fetches the community numbers
  const statsRaw = useCommunity((c) => c.data?.stats);
  const { packs } = useVisiblePacks();
  const packCost = usePackCost();
  const [q, setQ] = useState("");
  const [meal, setMeal] = useState<MealType | "all">("all");
  const [shown, setShown] = useState(PAGE);

  const fits = (id: string) => { const r = RECIPES_BY_ID[id]; return !!r && (!hydrated || !hardRejection(r, prefs)); };
  const stats = useMemo(() => (statsRaw ?? []).filter((s) => s.n >= 3 && RECIPES_BY_ID[s.id]), [statsRaw]);
  // Bayesian average, so a 5.0 from 3 people doesn't beat a 4.7 from 40
  const loved = useMemo(() => [...stats].sort((a, b) => (b.avg * b.n + 17.5) / (b.n + 5) - (a.avg * a.n + 17.5) / (a.n + 5)).filter((s) => s.avg >= 3.6 && fits(s.id)).slice(0, 12), [stats, prefs, hydrated]); // eslint-disable-line react-hooks/exhaustive-deps
  const cooked = useMemo(() => [...stats].sort((a, b) => b.n - a.n).filter((s) => fits(s.id) && !loved.some((l) => l.id === s.id)).slice(0, 12), [stats, loved, prefs, hydrated]); // eslint-disable-line react-hooks/exhaustive-deps
  const totalRatings = stats.reduce((t, s) => t + s.n, 0);

  const list = useMemo(() => {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    return RECIPES.filter((r) =>
      (meal === "all" || r.mealType === meal) &&
      (!hydrated || !hardRejection(r, prefs)) &&
      words.every((w) => [r.name, ...r.cuisines.map((c) => CUISINES[c] ?? c), ...r.lines.map((l) => l.ingredientId.replace(/_/g, " "))].join(" ").toLowerCase().includes(w)));
  }, [q, meal, prefs, hydrated]);
  const browsing = q.trim().length > 0;

  return (
    <>
      <PageHeader title="Discover" lead="Browse recipes and see what other MacroAisle cooks love. Open one to add it to your plan." />
      <div className="mb-6 grid gap-3">
        <div className="relative">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" aria-hidden />
          <input type="search" className="input rounded-full bg-surface pl-9" placeholder="Search recipes or ingredients" value={q} onChange={(e) => { setQ(e.target.value); setShown(PAGE); }} aria-label="Search recipes" />
        </div>
      </div>

      {!browsing && (
        <div className="mb-8 grid grid-cols-[minmax(0,1fr)] gap-7">
          <section aria-labelledby="community-title" className="min-w-0">
            <h2 id="community-title" className="font-display text-2xl font-bold">From the community</h2>
            <p className="mb-3 text-sm text-muted">
              {totalRatings > 0
                ? `${plural(totalRatings, "rating")} across ${plural(stats.length, "recipe")} so far. A recipe shows up once 3 or more cooks have rated it.`
                : "Community ratings show up once 3 or more cooks rate a recipe. Until then, here are our most popular meal preps."}
            </p>
            <div className="grid grid-cols-[minmax(0,1fr)] gap-6">
              {loved.length > 0 && (
                <Rail title="Top rated">
                  {loved.map((s) => <RecipeCard key={s.id} recipe={RECIPES_BY_ID[s.id]!} eyebrow={<>★ {s.avg.toFixed(1)} from {s.n} cooks</>} />)}
                </Rail>
              )}
              {cooked.length > 0 && (
                <Rail title="Most cooked">
                  {cooked.map((s) => <RecipeCard key={s.id} recipe={RECIPES_BY_ID[s.id]!} eyebrow={<>{s.n} cooks · ★ {s.avg.toFixed(1)}</>} />)}
                </Rail>
              )}
              {packs.length > 0 && (
                <Rail title="Popular meal preps" lead="Ready-made weeks with their macros. Use one and your plan builds around it.">
                  {packs.map((p) => <PrepPackCard key={p.id} pack={p} cost={packCost(p)} />)}
                </Rail>
              )}
            </div>
          </section>
          <PicksRail prompt />
        </div>
      )}

      <section aria-labelledby="all-title" className="min-w-0">
        <h2 id="all-title" className="font-display text-2xl font-bold">{browsing ? "Results" : "All recipes"}</h2>
        <div className="rail my-3" role="group" aria-label="Meal">
          {MEALS.map(([v, l]) => <Chip key={v} selected={meal === v} onClick={() => { setMeal(v); setShown(PAGE); }}>{l}</Chip>)}
        </div>
        <p className="mb-3 text-sm text-muted" aria-live="polite">{plural(list.length, "recipe")}{hydrated ? " that fit your diet and dislikes" : ""}</p>
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
          {list.slice(0, shown).map((r) => (
            <li key={r.id} className="flex">
              <RecipeCard wide recipe={r} eyebrow={<>{r.cuisines.map((c) => CUISINES[c]).join(", ")}{ratings[r.id] ? <span className="text-carbs"> · {"★".repeat(ratings[r.id]!)}</span> : null}</>} />
            </li>
          ))}
        </ul>
        {list.length > shown && <button type="button" className="btn mt-4 w-full sm:w-auto" onClick={() => setShown(shown + PAGE)}>Show more</button>}
        {list.length === 0 && <p className="card p-4 text-sm text-muted">Nothing matches. Try fewer words, or <Link href="/recipes/" className="underline">open the full recipe book</Link> with more filters.</p>}
      </section>
    </>
  );
}
