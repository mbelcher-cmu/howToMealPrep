"use client";
import Link from "next/link";
import { useState } from "react";
import { ArrowLeftRight, Sparkles } from "lucide-react";
import { RECIPES_BY_ID } from "@prep-cart/catalog";
import { useApp } from "@/lib/store";
import { swapSuggestions } from "@/lib/plus";
import { RecipeTile } from "./plan-bits";
import { MacroChips } from "./food";

/** Plus preview: swap a planned recipe for one with nearly the same macros. */
export function SwapButton({ recipeId }: { recipeId: string }) {
  const s = useApp();
  const [open, setOpen] = useState(false);
  const r = RECIPES_BY_ID[recipeId];
  if (!r) return null;
  if (!s.plusPreview) {
    return <Link href="/plus/" className="btn btn-sm" aria-label={`Swap ${r.name} (Plus)`}><Sparkles size={14} aria-hidden /><span className="hidden sm:inline">Swap</span></Link>;
  }
  const planned = s.current?.result.recipes.map((p) => p.recipe.id) ?? [];
  const options = open ? swapSuggestions(r, s.prefs, [...planned, ...(s.prefs.excludeRecipes ?? [])]) : [];
  const swap = (to: string) => {
    s.set({ prefs: { ...s.prefs, excludeRecipes: [...(s.prefs.excludeRecipes ?? []), recipeId] }, locked: [...s.locked.filter((x) => x !== recipeId), to] });
    setOpen(false);
  };
  return (
    <div className="relative">
      <button className="btn btn-sm" onClick={() => setOpen(!open)} aria-expanded={open} aria-label={`Swap ${r.name}`}><ArrowLeftRight size={14} aria-hidden /><span className="hidden sm:inline">Swap</span></button>
      {open && (
        <div role="dialog" aria-label={`Swaps for ${r.name}`} className="card absolute right-0 top-full z-30 mt-1 grid w-[300px] gap-2 p-3 shadow-lg">
          <p className="label">Similar macros</p>
          {options.length === 0 && <p className="text-sm text-muted">No other recipe fits your rules for this meal.</p>}
          {options.map((o) => (
            <button key={o.id} className="flex items-center gap-2.5 rounded-lg p-1.5 text-left hover:bg-sunk" onClick={() => swap(o.id)}>
              <RecipeTile recipe={o} size={44} />
              <span className="grid min-w-0 gap-1"><span className="truncate text-sm font-semibold">{o.name}</span><MacroChips recipe={o} /></span>
            </button>
          ))}
          <p className="text-[11px] text-muted">Plus preview. Your plan rebalances portions after a swap.</p>
        </div>
      )}
    </div>
  );
}
