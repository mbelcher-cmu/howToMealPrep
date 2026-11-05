"use client";
import { useMemo } from "react";
import { Check } from "lucide-react";
import type { MealType } from "@prep-cart/catalog";
import { rankingChoices, slotTypeFor } from "@prep-cart/planner";
import { RecipeArt } from "@/components/food";
import { Segmented } from "@/components/ui";
import { useApp } from "@/lib/store";
import { cx } from "@/lib/format";

export const MEAL_LABELS: Record<MealType, string> = { breakfast: "Breakfast", main: "Lunch and dinner", snack: "Snacks" };

/** The meals this person actually preps, in the order they eat them. */
export function useRankedMeals(): MealType[] {
  const occasions = useApp((s) => s.occasions);
  return useMemo(() => {
    const kinds = new Set(occasions.filter((o) => o.prepped).map(slotTypeFor));
    return (["breakfast", "main", "snack"] as MealType[]).filter((m) => kinds.has(m));
  }, [occasions]);
}

/**
 * Tap the options in the order you like them: the first tap is your top pick. Tap a ranked one
 * again to take it out. Nothing is required; unranked options are simply neutral.
 */
export function FavoritesRanker({ meal }: { meal: MealType }) {
  const s = useApp();
  const ranked = s.favorites?.[meal] ?? [];
  const prefs = s.prefs;
  const choices = useMemo(() => rankingChoices(meal, prefs, 10), [meal, prefs]);
  const set = (list: string[]) => s.set({ favorites: { ...s.favorites, [meal]: list } });
  const tap = (id: string) => set(ranked.includes(id) ? ranked.filter((x) => x !== id) : [...ranked, id]);
  // a pick that no longer fits the person's rules drops out of the count but keeps its place if they change back
  const shown = ranked.filter((id) => choices.some((r) => r.id === id));
  return (
    <div className="grid gap-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted" role="status">
          {shown.length === 0 ? "Tap your favorite first, then the next, and so on." : shown.length === choices.length ? "All ranked. Tap one to take it out." : `${shown.length} of ${choices.length} ranked. Keep going, or move on.`}
        </p>
        {ranked.length > 0 && <button type="button" className="shrink-0 text-sm font-semibold text-accent" onClick={() => set([])}>Start over</button>}
      </div>
      <ul className="grid grid-cols-2 gap-2.5 sm:grid-cols-3" aria-label={`${MEAL_LABELS[meal]} options`}>
        {choices.map((r) => {
          const place = shown.indexOf(r.id) + 1;
          return (
            <li key={r.id}>
              <button
                type="button"
                aria-pressed={place > 0}
                aria-label={place ? `${r.name}, your number ${place}. Tap to take it out.` : `Rank ${r.name}`}
                onClick={() => tap(r.id)}
                className={cx(
                  "card press relative flex h-full w-full flex-col overflow-hidden text-left transition-shadow",
                  place > 0 ? "ring-2 ring-ink" : "hover:bg-sunk",
                )}
              >
                <RecipeArt recipe={r} className="aspect-[4/3] w-full" badges={false} />
                <span
                  aria-hidden
                  className={cx(
                    "num absolute left-2 top-2 grid h-8 w-8 place-items-center rounded-full text-[15px] font-bold shadow-sm transition-transform",
                    place > 0 ? "scale-100 bg-ink text-bg" : "scale-90 border border-line bg-surface/90 text-muted",
                  )}
                >
                  {place > 0 ? place : <Check size={14} className="opacity-0" />}
                </span>
                <span className="flex flex-1 flex-col gap-0.5 p-2.5">
                  <span className="line-clamp-2 text-[14px] font-semibold leading-snug">{r.name}</span>
                  <span className="num mt-auto pt-0.5 text-xs text-muted">{Math.round(r.perServing.kcal)} kcal · {Math.round(r.perServing.protein)}g protein</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      {choices.length === 0 && <p className="text-sm text-muted">No {MEAL_LABELS[meal].toLowerCase()} recipes fit your diet and allergies yet.</p>}
    </div>
  );
}

/** All the person's meals in one place, with a switch between them (for the Plan page). */
export function FavoritesEditor({ meal, onMeal }: { meal?: MealType; onMeal?: (m: MealType) => void }) {
  const meals = useRankedMeals();
  const current = meal && meals.includes(meal) ? meal : meals[0];
  if (!current) return <p className="text-sm text-muted">Mark a meal as prepped to rank favorites.</p>;
  return (
    <div className="grid gap-3">
      {meals.length > 1 && (
        <Segmented
          label="Meal"
          size="sm"
          value={current}
          onChange={(m: MealType) => onMeal?.(m)}
          options={meals.map((m) => ({ value: m, label: m === "main" ? "Lunch & dinner" : MEAL_LABELS[m] }))}
        />
      )}
      <FavoritesRanker meal={current} />
    </div>
  );
}
