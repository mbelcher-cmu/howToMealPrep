"use client";
import { useEffect, useRef, useState } from "react";
import { ArrowLeftRight } from "lucide-react";
import { RECIPES_BY_ID } from "@prep-cart/catalog";
import { useApp } from "@/lib/store";
import { swapSuggestions } from "@/lib/plus";
import { RecipeTile } from "./plan-bits";
import { MacroChips } from "./food";

/**
 * Swap a planned recipe for one with nearly the same macros. The rest of the week stays as it is
 * and portions rebalance around the new recipe. Free for everyone (it used to be a Plus preview,
 * which left testers on the Plus page instead of swapping).
 */
export function SwapButton({ recipeId, label = "responsive" }: { recipeId: string; label?: "always" | "responsive" }) {
  const s = useApp();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // close on Escape or a tap anywhere outside, like every other popover
    if (!open) return;
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    const down = (e: PointerEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("keydown", key);
    document.addEventListener("pointerdown", down);
    return () => { document.removeEventListener("keydown", key); document.removeEventListener("pointerdown", down); };
  }, [open]);
  const r = RECIPES_BY_ID[recipeId];
  if (!r) return null;
  const planned = s.current?.result.recipes.map((p) => p.recipe.id) ?? [];
  const options = open ? swapSuggestions(r, s.prefs, [...planned, ...(s.prefs.excludeRecipes ?? [])], 5) : [];
  const swap = (to: string) => {
    s.swapRecipe(recipeId, to);
    setOpen(false);
  };
  return (
    <div ref={box} className="relative">
      <button className="btn btn-sm" onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen(!open); }} aria-expanded={open} aria-label={`Swap ${r.name}`}><ArrowLeftRight size={14} aria-hidden /><span className={label === "always" ? "" : "hidden sm:inline"}>Swap</span></button>
      {open && (
        <div role="dialog" aria-label={`Swaps for ${r.name}`} className="card pop fixed inset-x-3 bottom-24 z-50 grid max-h-[70vh] gap-2 overflow-y-auto p-3 shadow-lg sm:absolute sm:inset-x-auto sm:bottom-auto sm:right-0 sm:top-full sm:mt-1 sm:w-[320px]">
          <p className="label">Swap {r.name} for</p>
          {options.length === 0 && <p className="text-sm text-muted">No other recipe fits your rules for this meal.</p>}
          {options.map((o) => (
            <button key={o.id} className="flex items-center gap-2.5 rounded-lg p-1.5 text-left hover:bg-sunk" onClick={() => swap(o.id)}>
              <RecipeTile recipe={o} size={44} />
              <span className="grid min-w-0 gap-1"><span className="truncate text-sm font-semibold">{o.name}</span><MacroChips recipe={o} /></span>
            </button>
          ))}
          <p className="text-[11px] text-muted">Similar macros. The rest of your week stays the same and portions rebalance.</p>
        </div>
      )}
    </div>
  );
}
