"use client";
import { Segmented } from "@/components/ui";
import { useApp } from "@/lib/store";

type Choice = "prep" | "fresh" | "skip";

/**
 * Breakfast as its own meal: prepped on cook day with the rest, made fresh each morning (eggs and
 * toast, about 10 minutes, still on the shopping list), or skipped. Shown for 2 or 3 meals a day,
 * where breakfast is a named meal.
 */
export function BreakfastChoice() {
  const s = useApp();
  if (s.meals !== 2 && s.meals !== 3) return null;
  const bf = s.occasions.find((o) => o.kind === "meal" && /breakfast/i.test(o.name));
  const value: Choice = !bf ? "skip" : bf.fresh ? "fresh" : "prep";
  const pick = (v: Choice) => {
    if (v === "skip") { if (s.meals === 3) s.setStructure(2, s.snacks); return; }
    if (s.meals === 2) s.setStructure(3, s.snacks);
    const id = useApp.getState().occasions.find((o) => o.kind === "meal" && /breakfast/i.test(o.name))?.id;
    if (id) s.updateOccasion(id, { prepped: true, fresh: v === "fresh" });
  };
  const hint = {
    prep: "Cooked with everything else on cook day, ready to grab.",
    fresh: "Quick breakfasts you make each morning, like eggs and toast. About 10 minutes, and the groceries are on your list.",
    skip: "Just lunch and dinner. Their portions grow to cover your day.",
  }[value];
  return (
    <div className="grid gap-1.5">
      <span className="text-[13px] text-muted">Breakfast</span>
      <Segmented size="sm" label="Breakfast" value={value} onChange={pick}
        options={[{ value: "prep", label: "Prep ahead" }, { value: "fresh", label: "Fresh each morning" }, { value: "skip", label: "Skip it" }]} />
      <p className="text-xs text-muted">{hint}</p>
    </div>
  );
}
