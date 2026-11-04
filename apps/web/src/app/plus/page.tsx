"use client";
import { Check, Sparkles } from "lucide-react";
import { Card, PageHeader, Toggle } from "@/components/ui";
import { useApp } from "@/lib/store";
import { useHydrated } from "@/lib/use-planner";
import { PLUS_FEATURES } from "@/lib/plus";

const FREE = ["Plans that hit your calories and macros within budget", "Shopping list by aisle and in-store mode", "Prep-day timeline and reminders", "Pantry, sales and price history", "Household plans, takeout, recipe import"];

export default function Plus() {
  const hydrated = useHydrated();
  const s = useApp();
  if (!hydrated) return null;
  return (
    <>
      <PageHeader title="MacroAisle Plus" lead="The planned paid tier. Everything you use today stays free. Nothing is charged yet." />
      <div className="grid max-w-[960px] gap-4 md:grid-cols-2">
        <Card>
          <p className="label">Free</p>
          <p className="font-display text-2xl font-bold">$0</p>
          <ul className="mt-3 grid gap-1.5 text-sm">{FREE.map((f) => <li key={f} className="flex gap-2"><Check size={16} className="mt-0.5 shrink-0 text-accent" aria-hidden /> {f}</li>)}</ul>
        </Card>
        <Card className="border-accent">
          <p className="label flex items-center gap-1.5"><Sparkles size={14} aria-hidden /> Plus</p>
          <p className="font-display text-2xl font-bold">Price to be decided</p>
          <ul className="mt-3 grid gap-3 text-sm">
            {PLUS_FEATURES.map((f) => (
              <li key={f.id}>
                <p className="font-semibold">{f.title}</p>
                <p className="text-muted">{f.body}</p>
                <p className="mt-0.5 text-xs text-muted">Today: {f.today} To launch: {f.needs}</p>
              </li>
            ))}
          </ul>
          <div className="mt-4 border-t border-line pt-3">
            <Toggle checked={s.plusPreview} onChange={(plusPreview) => s.set({ plusPreview })} label="Preview Plus on this device" detail="Turns on the features that already work, such as smart swaps. Free while MacroAisle is in testing." />
          </div>
        </Card>
      </div>
    </>
  );
}
