"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowLeft, ArrowRight, Check } from "lucide-react";
import { NearbyFinder } from "@/components/nearby";
import { BodyStatsEditor, BudgetEditor, MealStructureEditor, MoodEditor, RulesEditor, StoresEditor, TargetsEditor } from "@/components/editors";
import { useApp } from "@/lib/store";
import { cx } from "@/lib/format";

const STEPS = [
  { title: "About you", lead: "We use this to estimate how much energy you burn. It stays on this device.", body: <BodyStatsEditor /> },
  { title: "Calories and macros", lead: "Start from the suggestion or set your own numbers. Changing a macro keeps your calories in step.", body: <TargetsEditor /> },
  { title: "Meals and snacks", lead: "How many times you eat a day, and which of those come from your meal prep.", body: <MealStructureEditor /> },
  { title: "Food rules", lead: "Hard rules. The planner never breaks these.", body: <RulesEditor /> },
  { title: "What you're in the mood for", lead: "Soft preferences that steer this week's recipes. You can change them every week.", body: <MoodEditor /> },
  { title: "Budget", lead: "How much you want to spend on groceries.", body: <BudgetEditor /> },
  { title: "Stores near you", lead: "Enter your ZIP code to find grocery stores around you. Prices are estimates until you correct them.", body: <div className="grid gap-5"><NearbyFinder /><div className="border-t border-line pt-4"><StoresEditor /></div></div> },
];

export default function Welcome() {
  const [i, setI] = useState(0);
  const router = useRouter();
  const s = useApp();
  const step = STEPS[i]!;
  const last = i === STEPS.length - 1;
  const finish = () => { s.set({ onboarded: true }); router.push("/plan/"); };
  return (
    <div className="mx-auto grid min-h-dvh w-full max-w-[640px] grid-rows-[auto_1fr_auto] px-4 pb-6 pt-6 sm:px-6">
      <header>
        <div className="font-display text-xl font-bold">Prep <span className="text-accent">Cart</span></div>
        <ol className="mt-4 flex gap-1.5" aria-label="Setup progress">
          {STEPS.map((st, n) => (
            <li key={st.title} className={cx("h-1.5 flex-1 rounded-full", n <= i ? "bg-accent" : "bg-line")} aria-current={n === i ? "step" : undefined}>
              <span className="sr-only">{st.title}{n < i ? " (done)" : ""}</span>
            </li>
          ))}
        </ol>
        <p className="label mt-4">Step {i + 1} of {STEPS.length}</p>
        <h1 className="mt-1 font-display text-[28px] font-bold leading-tight">{step.title}</h1>
        <p className="mt-1 text-muted">{step.lead}</p>
      </header>
      <section className="card mt-5 self-start p-4 sm:p-5" aria-label={step.title}>{step.body}</section>
      <footer className="sticky bottom-0 mt-6 flex items-center justify-between gap-3 bg-bg py-3" style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 12px)" }}>
        <button className="btn" onClick={() => setI(i - 1)} disabled={i === 0}><ArrowLeft size={16} aria-hidden /> Back</button>
        <div className="flex gap-2">
          {!last && i >= 3 && <button className="btn" onClick={finish}>Skip the rest</button>}
          {last
            ? <button className="btn btn-primary" onClick={finish} disabled={s.stores.length === 0}><Check size={16} aria-hidden /> Build my plan</button>
            : <button className="btn btn-primary" onClick={() => { if (i === 0) s.applySuggestedTargets(); setI(i + 1); }}>Next <ArrowRight size={16} aria-hidden /></button>}
        </div>
      </footer>
    </div>
  );
}
