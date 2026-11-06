"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, Check } from "lucide-react";
import { ALLERGENS, DIETS, type Allergen, type Diet } from "@prep-cart/catalog";
import { ACTIVITY_LEVELS, feetInchesToCm, lbToKg, suggestTargets, type ActivityLevel, type Goal } from "@prep-cart/nutrition";
import type { MealType } from "@prep-cart/catalog";
import { NearbyFinder } from "@/components/nearby";
import { FavoritesRanker, MEAL_LABELS, useRankedMeals } from "@/components/favorites";
import { useFlag } from "@/lib/flags";
import { BudgetEditor, RotationPicker, StoresEditor } from "@/components/editors";
import { menusFor, ShoppingDayEditor } from "@/components/shopping-day";
import { BreakfastChoice } from "@/components/meal-pattern";
import { Chip, Segmented, Stepper } from "@/components/ui";
import { isoDay, useApp } from "@/lib/store";
import { startPatch, suggestedCookDays } from "@/lib/shop-day";
import { cx } from "@/lib/format";
import { track } from "@/lib/telemetry";

type Draft = { sex: "male" | "female" | null; age: string; ft: string; inch: string; cm: string; lb: string; kg: string; activity: ActivityLevel | ""; goal: Goal | null };

/** Reads the draft into body stats, or null while something is missing or out of range. */
function statsOf(d: Draft, us: boolean) {
  const n = (x: string) => (x.trim() === "" ? NaN : Number(x));
  const age = n(d.age);
  const heightCm = us ? feetInchesToCm(n(d.ft), d.inch.trim() === "" ? 0 : n(d.inch)) : n(d.cm);
  const weightKg = us ? lbToKg(n(d.lb)) : n(d.kg);
  if (!d.sex || !d.activity || !d.goal) return null;
  if (!(age >= 13 && age <= 100) || !(heightCm >= 120 && heightCm <= 230) || !(weightKg >= 30 && weightKg <= 300)) return null;
  return { sex: d.sex, ageYears: age, heightCm: Math.round(heightCm), weightKg: Math.round(weightKg * 10) / 10, activity: d.activity, goal: d.goal };
}

function Field({ label, value, onChange, suffix, id }: { label: string; value: string; onChange: (v: string) => void; suffix: string; id: string }) {
  return (
    <div className="grid min-w-0 gap-1">
      <label htmlFor={id} className="text-[13px] text-muted">{label}</label>
      <div className="relative flex items-center">
        <input id={id} inputMode="decimal" className="input num pr-9" value={value} onChange={(e) => onChange(e.target.value.replace(/[^\d.]/g, ""))} />
        <span className="pointer-events-none absolute right-3 text-sm text-muted">{suffix}</span>
      </div>
    </div>
  );
}

function AboutYou({ d, setD }: { d: Draft; setD: (d: Draft) => void }) {
  const s = useApp();
  const us = s.profile.units === "us";
  const stats = statsOf(d, us);
  let kcal: number | null = null;
  let protein = 0;
  if (stats) try { const r = suggestTargets({ stats, activity: stats.activity, goal: stats.goal }); kcal = r.targets.kcal; protein = r.targets.protein; } catch { kcal = null; }
  const up = (p: Partial<Draft>) => setD({ ...d, ...p });
  return (
    <div className="grid gap-4">
      <div className="grid gap-1">
        <span className="text-[13px] text-muted">Goal</span>
        <Segmented label="Goal" value={d.goal ?? ("" as Goal)} onChange={(goal: Goal) => up({ goal })} options={[{ value: "lose", label: "Lose fat" }, { value: "maintain", label: "Maintain" }, { value: "gain", label: "Build muscle" }]} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-1">
          <span className="text-[13px] text-muted">Sex</span>
          <Segmented label="Sex" value={d.sex ?? ("" as "male")} onChange={(sex) => up({ sex })} options={[{ value: "male", label: "Male" }, { value: "female", label: "Female" }]} />
        </div>
        <Field id="age" label="Age" value={d.age} onChange={(age) => up({ age })} suffix="yr" />
      </div>
      {us ? (
        <div className="grid grid-cols-3 gap-3">
          <Field id="ft" label="Height" value={d.ft} onChange={(ft) => up({ ft })} suffix="ft" />
          <Field id="in" label="Inches" value={d.inch} onChange={(inch) => up({ inch })} suffix="in" />
          <Field id="lb" label="Weight" value={d.lb} onChange={(lb) => up({ lb })} suffix="lb" />
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <Field id="cm" label="Height" value={d.cm} onChange={(cm) => up({ cm })} suffix="cm" />
          <Field id="kg" label="Weight" value={d.kg} onChange={(kg) => up({ kg })} suffix="kg" />
        </div>
      )}
      <div className="grid gap-1">
        <label htmlFor="activity" className="text-[13px] text-muted">How active are you?</label>
        <select id="activity" className="input" value={d.activity} onChange={(e) => up({ activity: e.target.value as ActivityLevel })}>
          <option value="" disabled>Choose one</option>
          {Object.entries(ACTIVITY_LEVELS).map(([k, v]) => <option key={k} value={k}>{v.label}: {v.detail}</option>)}
        </select>
      </div>
      <button type="button" className="justify-self-start text-sm text-muted underline" onClick={() => s.setProfile({ units: us ? "metric" : "us" })}>{us ? "Use kg and cm" : "Use lb and inches"}</button>
      <p className="min-h-[40px] text-sm text-muted" role="status">
        {kcal ? <>We'll plan about <b className="num text-ink">{kcal.toLocaleString()} kcal</b> a day with <b className="num text-ink">{protein} g</b> protein. You can change this any time.</> : "Fill these in and we'll work out your calories and protein."}
      </p>
    </div>
  );
}

/** The week step. Simple mode splits it in two: the budget first, then meals and diet. */
function YourWeek({ part = "all" }: { part?: "all" | "budget" | "meals" }) {
  const s = useApp();
  const p = s.prefs;
  const toggle = <T extends string>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  const wholeFoodsOn = useFlag("pantryV2");
  const diets = (["vegetarian", "vegan", "pescatarian", "glutenFree", "dairyFree", ...(wholeFoodsOn ? ["wholeFoods"] : [])] as Diet[]).filter((d) => DIETS[d]);
  return (
    <div className="grid gap-5">
      {part !== "meals" && <BudgetEditor />}
      {part !== "meals" && <div className="border-t border-line pt-4"><ShoppingDayEditor compact /></div>}
      {part === "budget" ? null : <>
      <div className={cx("grid grid-cols-2 gap-3", part === "all" && "border-t border-line pt-4")}>
        <Stepper label="Meals a day" value={s.meals} min={1} max={6} onChange={(m) => s.setStructure(m, s.snacks)} />
        <Stepper label="Snacks a day" value={s.snacks} min={0} max={3} onChange={(n) => s.setStructure(s.meals, n)} />
      </div>
      <BreakfastChoice />
      {s.cookDays < 2 && <RotationPicker />}
      <div className="grid gap-2 border-t border-line pt-4">
        <span className="text-[13px] text-muted">Any diet? (optional)</span>
        <div className="flex flex-wrap gap-2">
          {diets.map((d) => (
            <Chip key={d} selected={p.diets.includes(d)} onClick={() => s.set({ prefs: { ...p, diets: toggle(p.diets, d) } })}>{DIETS[d].label}</Chip>
          ))}
        </div>
        <details open={p.allergens.length > 0 || undefined}>
          <summary className="cursor-pointer text-sm font-semibold text-accent">Allergies</summary>
          <div className="mt-2 flex flex-wrap gap-2">
            {(Object.keys(ALLERGENS) as Allergen[]).map((a) => (
              <Chip key={a} tone="warn" selected={p.allergens.includes(a)} onClick={() => s.set({ prefs: { ...p, allergens: toggle(p.allergens, a) } })}>{ALLERGENS[a]}</Chip>
            ))}
          </div>
          <p className="mt-2 text-xs text-muted">Allergy filtering is a convenience. Always check product labels.</p>
        </details>
        {part === "all" && <p className="text-xs text-muted">Cuisines, moods, foods you won't eat and kitchen equipment are on the Plan page whenever you want them.</p>}
      </div>
      </>}
    </div>
  );
}

function Stores() {
  return (
    <div className="grid gap-4">
      <NearbyFinder />
      <details className="border-t border-line pt-4">
        <summary className="cursor-pointer text-sm font-semibold text-accent">Choose stores yourself</summary>
        <div className="mt-3"><StoresEditor /></div>
      </details>
    </div>
  );
}

type StepId = "about" | "week" | "budget" | "meals" | "favorites" | "stores";
const STEPS: Record<StepId, { title: string; lead: string }> = {
  budget: { title: "Your budget", lead: "How much do you want to spend on groceries?" },
  meals: { title: "Your meals", lead: "How many meals and snacks a day, and any diet." },
  about: { title: "About you", lead: "So we can size your meals. It stays on this device." },
  week: { title: "Your week", lead: "Your budget and how you like to eat. Everything else can wait." },
  favorites: { title: "What sounds good?", lead: "Tap what you'd eat, favorite first. We plan your top picks when they fit your budget and macros." },
  stores: { title: "Stores near you", lead: "Enter your ZIP code and we'll shop the closest store we have prices for." },
};

export default function Welcome() {
  const [i, setI] = useState(0);
  const router = useRouter();
  const s = useApp();
  const ranking = useFlag("mealRanking");
  const simple = useFlag("simple");
  const meals = useRankedMeals();
  // someone new shops today and starts eating today, cooking often enough that nothing sits more
  // than a few days; the budget step shows all of it and they can change any of it
  useEffect(() => {
    const start = () => {
      const st = useApp.getState();
      if (st.onboarded || st.weekOf) return;
      const k = suggestedCookDays(st.days);
      st.set({ ...startPatch(isoDay(), true), cookDays: k, variety: menusFor(st.variety, k, k >= 2) });
    };
    if (useApp.persist.hasHydrated()) start();
    else return useApp.persist.onFinishHydration(start);
  }, []);
  // which meal the favorites step is on; Next walks through them before moving on
  const [m, setM] = useState(0);
  const [d, setD] = useState<Draft>({ sex: null, age: "", ft: "", inch: "", cm: "", lb: "", kg: "", activity: "", goal: null });
  const fav: StepId[] = ranking && meals.length ? ["favorites"] : [];
  // simple mode follows the app's order: budget, calories (about you), meals, then stores for the cart
  const ids: StepId[] = simple ? ["budget", "about", "meals", ...fav, "stores"] : ["about", "week", ...fav, "stores"];
  const TITLES = ids.map((id) => STEPS[id]);
  const id = ids[i]!;
  const step = STEPS[id];
  const last = i === ids.length - 1;
  const meal: MealType | undefined = meals[Math.min(m, meals.length - 1)];
  const stats = statsOf(d, s.profile.units === "us");
  const finish = () => {
    s.set({ onboarded: true });
    const fav = s.favorites ?? {};
    track("onboarding_done", { rotation: s.variety.rotation ?? "mix", diets: s.prefs.diets.length, nearby: s.nearby.length > 0, ranked: (fav.breakfast?.length ?? 0) + (fav.main?.length ?? 0) + (fav.snack?.length ?? 0) });
    router.push(simple ? "/meals/" : "/");
  };
  const next = () => {
    if (id === "about" && stats) { s.setProfile(stats); s.applySuggestedTargets(); }
    if (id === "favorites" && m < meals.length - 1) { setM(m + 1); window.scrollTo({ top: 0 }); return; }
    if (ids[i + 1] === "favorites") setM(0);
    setI(i + 1);
  };
  const back = () => {
    if (id === "favorites" && m > 0) { setM(m - 1); return; }
    if (ids[i - 1] === "favorites") setM(meals.length - 1);
    setI(i - 1);
  };
  return (
    <div className="mx-auto grid min-h-dvh w-full max-w-[640px] grid-rows-[auto_1fr_auto] px-4 pb-6 pt-6 sm:px-6">
      <header>
        <div className="wordmark font-display text-xl font-bold">Macro<span className="text-accent">Aisle</span></div>
        <ol className="mt-4 flex gap-1.5" aria-label="Setup progress">
          {TITLES.map((st, n) => (
            <li key={st.title} className={cx("h-1.5 flex-1 rounded-full", n <= i ? "bg-accent" : "bg-line")} aria-current={n === i ? "step" : undefined}>
              <span className="sr-only">{st.title}{n < i ? " (done)" : ""}</span>
            </li>
          ))}
        </ol>
        <p className="label mt-4">Step {i + 1} of {TITLES.length}{id === "favorites" && meal && meals.length > 1 ? <> · Meal {m + 1} of {meals.length}</> : null}</p>
        <h1 className="page-title mt-1 font-display text-[28px] font-bold leading-tight">{id === "favorites" && meal ? MEAL_LABELS[meal] : step.title}</h1>
        <p className="mt-1 text-muted">{step.lead}</p>
      </header>
      {id === "favorites" && meal ? (
        <section className="mt-5 self-start" aria-label={`${MEAL_LABELS[meal]} favorites`}>
          <FavoritesRanker key={meal} meal={meal} />
        </section>
      ) : (
        <section className="card mt-5 self-start p-4 sm:p-5" aria-label={step.title}>
          {id === "about" ? <AboutYou d={d} setD={setD} /> : id === "week" ? <YourWeek /> : id === "budget" ? <YourWeek part="budget" /> : id === "meals" ? <YourWeek part="meals" /> : <Stores />}
        </section>
      )}
      <footer className="sticky bottom-0 z-10 mt-6 flex items-center justify-between gap-3 border-t border-line bg-bg py-3" style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 12px)" }}>
        <button className="btn" onClick={back} disabled={i === 0}><ArrowLeft size={16} aria-hidden /> Back</button>
        {last
          ? <button className="btn btn-primary" onClick={finish} disabled={s.stores.length === 0}><Check size={16} aria-hidden /> Build my plan</button>
          : <button className="btn btn-primary" onClick={next} disabled={id === "about" && !stats}>{id === "favorites" && !(s.favorites?.[meal!]?.length) ? "Skip" : "Next"} <ArrowRight size={16} aria-hidden /></button>}
      </footer>
    </div>
  );
}
