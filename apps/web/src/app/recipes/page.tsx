"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Plus, Search } from "lucide-react";
import { CUISINES, DIETS, MOODS, RECIPES, type Cuisine, type Diet, type MealType, type Mood } from "@prep-cart/catalog";
import { hardRejection } from "@prep-cart/planner";
import { RecipeCard } from "@/components/food";
import { Chip, EmptyState, PageHeader } from "@/components/ui";
import { useApp } from "@/lib/store";
import { useFlag } from "@/lib/flags";
import { cookFromPantry } from "@/lib/pantry";
import { useHydrated } from "@/lib/use-planner";
import { PicksRail } from "@/components/picks";
import { useRecommendations } from "@/lib/recommend";

type Sort = "protein" | "fast" | "name" | "match" | "pantry";

export default function Recipes() {
  const hydrated = useHydrated();
  const prefs = useApp((s) => s.prefs);
  const ratings = useApp((s) => s.ratings);
  const custom = useApp((s) => s.customRecipes);
  const pantry = useApp((s) => s.pantry);
  const pantryOn = useFlag("pantryV2");
  const [mineOnly, setMineOnly] = useState(false);
  const [moreFilters, setMoreFilters] = useState(false);
  const [q, setQ] = useState("");
  const [meal, setMeal] = useState<MealType | "all">("all");
  const [cuisine, setCuisine] = useState<Cuisine | "">("");
  const [mood, setMood] = useState<Mood | "">("");
  const [diet, setDiet] = useState<Diet | "">("");
  const [fitsMe, setFitsMe] = useState(true);
  const [sort, setSort] = useState<Sort>("protein");
  const { on: recsOn, recs } = useRecommendations();

  const list = useMemo(() => {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    const found = RECIPES.filter((r) =>
      (meal === "all" || r.mealType === meal) &&
      (!cuisine || r.cuisines.includes(cuisine)) &&
      (!mood || r.moods.includes(mood)) &&
      (!diet || r.diets.includes(diet)) &&
      (!fitsMe || !hardRejection(r, prefs)) &&
      (!mineOnly || r.id.startsWith("custom_") || (ratings[r.id] ?? 0) >= 4) &&
      words.every((w) => r.name.toLowerCase().includes(w) || r.lines.some((l) => l.ingredientId.includes(w))),
    ).sort((a, b) =>
      sort === "match" ? (recs[b.id]?.affinity ?? (ratings[b.id] ? (ratings[b.id]! - 3) / 2 : 0)) - (recs[a.id]?.affinity ?? (ratings[a.id] ? (ratings[a.id]! - 3) / 2 : 0))
        : sort === "name" ? a.name.localeCompare(b.name)
        : sort === "fast" ? a.activeMinutes - b.activeMinutes
          : b.perServing.protein / b.perServing.kcal - a.perServing.protein / a.perServing.kcal);
    if (sort !== "pantry") return found;
    // recipes the pantry covers most come first, the rest keep their order
    const rank = new Map(cookFromPantry(pantry, found, { limit: found.length }).map((m, i) => [m.recipe.id, i]));
    return [...found].sort((a, b) => (rank.get(a.id) ?? 1e9) - (rank.get(b.id) ?? 1e9));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, meal, cuisine, mood, diet, fitsMe, prefs, sort, mineOnly, ratings, custom, recs, pantry]);

  return (
    <>
      <PageHeader title="Recipes" lead={`${RECIPES.length} meal-prep recipes. Calories are worked out from the ingredients, per serving.`} action={<div className="flex flex-wrap gap-2"><Link href="/preps/" className="btn">Meal preps</Link><Link href="/recipes/import/" className="btn btn-primary"><Plus size={16} aria-hidden /> Add a recipe</Link></div>} />
      <PicksRail prompt />
      <div className="mb-5 grid gap-3">
        <div className="relative">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" aria-hidden />
          <input className="input rounded-full bg-surface pl-9" placeholder="Search by name or ingredient" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search recipes" />
        </div>
        <div className="rail" role="group" aria-label="Filters">
          {([["all", "All"], ["breakfast", "Breakfast"], ["main", "Lunch and dinner"], ["snack", "Snacks"]] as const).map(([v, l]) => <Chip key={v} selected={meal === v} onClick={() => setMeal(v)}>{l}</Chip>)}
          {hydrated && <Chip selected={fitsMe} onClick={() => setFitsMe(!fitsMe)}>Fits my rules</Chip>}
          {hydrated && <Chip selected={mineOnly} onClick={() => setMineOnly(!mineOnly)}>Mine and favorites</Chip>}
          <span className="sm:hidden"><Chip selected={moreFilters} onClick={() => setMoreFilters(!moreFilters)}>More filters</Chip></span>
        </div>
        <div id="more-filters" className={`${moreFilters ? "grid" : "hidden"} grid-cols-2 gap-2 sm:grid sm:grid-cols-4`}>
          <select className="input" aria-label="Cuisine" value={cuisine} onChange={(e) => setCuisine(e.target.value as Cuisine | "")}>
            <option value="">Any cuisine</option>
            {Object.entries(CUISINES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <select className="input" aria-label="Mood" value={mood} onChange={(e) => setMood(e.target.value as Mood | "")}>
            <option value="">Any mood</option>
            {Object.entries(MOODS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <select className="input" aria-label="Diet" value={diet} onChange={(e) => setDiet(e.target.value as Diet | "")}>
            <option value="">Any diet</option>
            {Object.entries(DIETS).filter(([k]) => k !== "omnivore").map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
          <select className="input" aria-label="Sort" value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
            <option value="protein">Most protein per calorie</option>
            <option value="fast">Least hands-on time</option>
            <option value="name">A to Z</option>
            {recsOn && <option value="match">Best match for you</option>}
            {hydrated && pantryOn && <option value="pantry">Uses what I have</option>}
          </select>
        </div>
      </div>
      <p className="mb-3 text-sm text-muted" aria-live="polite">{list.length} recipe{list.length === 1 ? "" : "s"}</p>
      <h2 className="sr-only">Matching recipes</h2>
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
        {list.map((r) => (
          <li key={r.id} className="flex">
            <RecipeCard wide recipe={r} eyebrow={<>{r.cuisines.map((c) => CUISINES[c]).join(", ")}{ratings[r.id] ? <span className="text-carbs"> · {"★".repeat(ratings[r.id]!)}</span> : recsOn && (recs[r.id]?.affinity ?? 0) >= 0.15 ? <span className="text-accent"> · {recs[r.id]!.match}% match</span> : null}</>} />
          </li>
        ))}
      </ul>
      {list.length === 0 && (
        <EmptyState
          title={mineOnly ? "No saved recipes yet" : "Nothing matches"}
          action={<button type="button" className="btn" onClick={() => { setQ(""); setMeal("all"); setCuisine(""); setMood(""); setDiet(""); setFitsMe(false); setMineOnly(false); }}>Show all recipes</button>}
        >
          {mineOnly ? "Rate a recipe or add your own and it shows up here." : "Try fewer words, or loosen a filter."}
        </EmptyState>
      )}
    </>
  );
}
