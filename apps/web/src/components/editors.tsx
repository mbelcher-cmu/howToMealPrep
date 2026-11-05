"use client";
import { useMemo, useState } from "react";
import {
  ALLERGENS, CHAINS, CUISINES, DIETS, EQUIPMENT, INGREDIENTS, MOODS, PROTEIN_SOURCES,
  type Allergen, type Diet, type Equipment,
} from "@prep-cart/catalog";
import { ACTIVITY_LEVELS, customOverflow, cmToFeetInches, editMealCalories, editMealMacro, feetInchesToCm, kgToLb, lbToKg, macroShares, MAX_MEALS, MAX_SNACKS, MEAL_STYLES, splitTargets, SPLIT_PRESETS, suggestTargets, type ActivityLevel, type Goal, type MacroGrams, type MealStyle, type SplitPreset } from "@prep-cart/nutrition";
import { useFlag } from "@/lib/flags";
import { useOccasions } from "@/lib/meal-styles";
import { useApp } from "@/lib/store";
import { Chip, NumberField, Segmented, Slider, Stepper, Toggle, WishChip } from "./ui";
import { cx, isPittsburghZip, money } from "@/lib/format";
import { Lock, LockOpen, SlidersHorizontal } from "lucide-react";

const cap = (x: string) => x.charAt(0).toUpperCase() + x.slice(1);

/* ───────────── Body stats ───────────── */
export function BodyStatsEditor() {
  const p = useApp((s) => s.profile);
  const setProfile = useApp((s) => s.setProfile);
  const us = p.units === "us";
  const fi = cmToFeetInches(p.heightCm);
  let suggestion: ReturnType<typeof suggestTargets> | null = null;
  try { suggestion = suggestTargets({ stats: p, activity: p.activity, goal: p.goal }); } catch { suggestion = null; }
  return (
    <div className="grid gap-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-1">
          <span className="text-[13px] text-muted">Sex</span>
          <Segmented label="Sex" value={p.sex} onChange={(sex) => setProfile({ sex })} options={[{ value: "male", label: "Male" }, { value: "female", label: "Female" }]} />
        </div>
        <NumberField label="Age" value={p.ageYears} min={13} max={100} onChange={(ageYears) => setProfile({ ageYears })} suffix="yr" />
      </div>
      {us ? (
        <div className="grid grid-cols-3 gap-3">
          <NumberField label="Height" value={fi.feet} min={3} max={7} onChange={(f) => setProfile({ heightCm: Math.round(feetInchesToCm(f, fi.inches)) })} suffix="ft" />
          <NumberField label="Inches" hideLabel value={fi.inches} min={0} max={11} onChange={(i) => setProfile({ heightCm: Math.round(feetInchesToCm(fi.feet, i)) })} suffix="in" />
          <NumberField label="Weight" value={Math.round(kgToLb(p.weightKg))} min={70} max={650} onChange={(lb) => setProfile({ weightKg: Math.round(lbToKg(lb) * 10) / 10 })} suffix="lb" />
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <NumberField label="Height" value={Math.round(p.heightCm)} min={120} max={230} onChange={(heightCm) => setProfile({ heightCm })} suffix="cm" />
          <NumberField label="Weight" value={p.weightKg} min={30} max={300} step={0.5} onChange={(weightKg) => setProfile({ weightKg })} suffix="kg" />
        </div>
      )}
      <div className="grid gap-1">
        <label htmlFor="activity" className="text-[13px] text-muted">Activity</label>
        <select id="activity" className="input" value={p.activity} onChange={(e) => setProfile({ activity: e.target.value as ActivityLevel })}>
          {Object.entries(ACTIVITY_LEVELS).map(([k, v]) => <option key={k} value={k}>{v.label}: {v.detail}</option>)}
        </select>
      </div>
      <div className="grid gap-1">
        <span className="text-[13px] text-muted">Goal</span>
        <Segmented label="Goal" value={p.goal} onChange={(goal: Goal) => setProfile({ goal })} options={[{ value: "lose", label: "Lose fat" }, { value: "maintain", label: "Maintain" }, { value: "gain", label: "Build muscle" }]} />
      </div>
      {suggestion && (
        <p className="text-sm text-muted">
          You burn about <b className="num text-ink">{suggestion.maintenanceKcal.toLocaleString()}</b> kcal a day. For your goal we suggest{" "}
          <b className="num text-ink">{suggestion.targets.kcal.toLocaleString()} kcal</b> with {suggestion.targets.protein} g protein.
          {suggestion.flooredAtMinimum && " We don't plan below this minimum without a doctor's target."}
        </p>
      )}
    </div>
  );
}

/* ───────────── Calories and macros ───────────── */
export function TargetsEditor({ showSuggest = true }: { showSuggest?: boolean }) {
  return useFlag("macroLocks") ? <LockingTargetsEditor showSuggest={showSuggest} /> : <ClassicTargetsEditor showSuggest={showSuggest} />;
}

type TargetField = "kcal" | "protein" | "carbs" | "fat";
const FIELD_NAME: Record<TargetField, string> = { kcal: "calories", protein: "protein", carbs: "carbs", fat: "fat" };
const andList = (xs: string[]) => (xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}`);

/** One plain sentence on what moves when the person changes something, for the locks they have. */
export function lockRule(kcalLocked: boolean, locked: readonly ("protein" | "carbs" | "fat")[]): string {
  const free = (["protein", "carbs", "fat"] as const).filter((k) => !locked.includes(k));
  if (kcalLocked) {
    if (free.length === 3) return "Calories are locked, so changing one macro moves the other two.";
    if (free.length === 2) return `Calories and ${locked[0]} are locked, so changing ${free[0]} moves ${free[1]}, and the other way round.`;
    return `Calories and ${andList([...locked])} are locked, so nothing can move. Unlock one to make a change.`;
  }
  if (!free.length) return "All three macros are locked, so your calories are set by them.";
  return `Calories are unlocked, so changing a macro changes your calories. Changing calories moves ${andList([...free])}.`;
}

/** Calories and macros with a lock on each; locked values hold when anything else changes. */
function LockingTargetsEditor({ showSuggest }: { showSuggest: boolean }) {
  const s = useApp();
  const t = s.targets;
  const shares = macroShares(t);
  const [note, setNote] = useState<string | null>(null);
  const locked = s.lockedMacros ?? [];
  const kcalLocked = s.targetMode === "calories";
  const isLocked = (f: TargetField) => (f === "kcal" ? kcalLocked : locked.includes(f));
  const edit = (f: TargetField, v: number) => {
    const r = s.setTarget(f, v);
    if (r.blocked) setNote(`Nothing else is unlocked to make room for that. Unlock ${f === "kcal" ? "a macro" : "calories or another macro"} first.`);
    else if (r.clamped) setNote(f === "kcal" ? "Your locked macros already need more calories than that, so the others went to zero." : "That's more than your calories allow with these locks, so it was set as high as it fits.");
    else setNote(null);
  };
  const field = (f: TargetField, label: string, max: number, step: number, suffix: string) => {
    const on = isLocked(f);
    return (
      <div className="grid min-w-0 gap-1">
        <NumberField label={label} value={f === "kcal" ? t.kcal : t[f]} min={f === "kcal" ? 1000 : 0} max={max} step={step} onChange={(v) => edit(f, v)} suffix={suffix} />
        <button type="button" onClick={() => { (f === "kcal" ? s.toggleCaloriesLock() : s.toggleMacroLock(f)); setNote(null); }} aria-pressed={on} aria-label={`Lock ${FIELD_NAME[f]}`}
          className={cx("inline-flex min-h-[32px] items-center justify-center gap-1 rounded-md border text-xs font-semibold", on ? "border-accent bg-accent-soft text-ink" : "border-line text-muted hover:bg-sunk")}>
          {on ? <Lock size={12} aria-hidden /> : <LockOpen size={12} aria-hidden />} {on ? "Locked" : "Lock"}
        </button>
      </div>
    );
  };
  return (
    <div className="grid gap-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {field("kcal", "Calories per day", 6000, 50, "kcal")}
        {field("protein", "Protein", 500, 5, "g")}
        {field("carbs", "Carbs", 900, 5, "g")}
        {field("fat", "Fat", 300, 1, "g")}
      </div>
      <p className="text-xs text-muted">{lockRule(kcalLocked, locked)}</p>
      {note && <p role="status" className="text-sm text-warn">{note}</p>}
      <div className="grid gap-1 sm:max-w-xs">
        <label htmlFor="split" className="text-[13px] text-muted">Macro split</label>
        <select id="split" className="input" value={s.splitPreset} onChange={(e) => { if (e.target.value !== "custom") { s.setSplitPreset(e.target.value as SplitPreset); setNote(null); } }}>
          {Object.entries(SPLIT_PRESETS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          <option value="custom">{s.splitPreset === "custom" ? "Suggested or your own" : "Custom"}</option>
        </select>
      </div>
      <div>
        <div className="flex h-3 overflow-hidden rounded-full" role="img" aria-label={`Protein ${Math.round(shares.protein * 100)}%, carbs ${Math.round(shares.carbs * 100)}%, fat ${Math.round(shares.fat * 100)}% of calories`}>
          <div style={{ width: `${shares.protein * 100}%` }} className="bg-protein" />
          <div style={{ width: `${shares.carbs * 100}%` }} className="bg-carbs" />
          <div style={{ width: `${shares.fat * 100}%` }} className="bg-fat" />
        </div>
        <div className="num mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
          <span><b className="text-protein">■</b> Protein {Math.round(shares.protein * 100)}% · {t.protein * 4} kcal</span>
          <span><b className="text-carbs">■</b> Carbs {Math.round(shares.carbs * 100)}% · {t.carbs * 4} kcal</span>
          <span><b className="text-fat">■</b> Fat {Math.round(shares.fat * 100)}% · {t.fat * 9} kcal</span>
          <span>Fiber goal {t.fiber} g</span>
        </div>
      </div>
      {showSuggest && (
        <button type="button" className="btn btn-sm justify-self-start" onClick={() => { s.applySuggestedTargets(); setNote(null); }}>
          Use the suggestion from my body stats
        </button>
      )}
    </div>
  );
}

function ClassicTargetsEditor({ showSuggest }: { showSuggest: boolean }) {
  const s = useApp();
  const t = s.targets;
  const shares = macroShares(t);
  const [note, setNote] = useState<string | null>(null);
  const [adv, setAdv] = useState(false);
  // hooks run on every render, so read the flag before any condition uses it
  const stylesOn = useFlag("mealStyles");
  const presetOptions = Object.entries(SPLIT_PRESETS).map(([k, v]) => ({ value: k, label: v.label }));
  const change = (m: "protein" | "carbs" | "fat", g: number) => {
    const r = s.setMacro(m, g);
    if (r.clamped) setNote(`That's more than your calories allow with the other macros locked. Unlock one, raise calories, or switch to "Set grams freely".`);
    else setNote(null);
  };
  const locked = s.lockedMacros ?? [];
  const caloriesMode = s.targetMode === "calories";
  // with meal styles on, locks are part of the everyday editor instead of hidden under more options
  const mealStyles = useFlag("mealStyles"); // called every render: a hook inside && would change the hook count
  const showLocks = caloriesMode && (adv || mealStyles);
  const macroField = (m: "protein" | "carbs" | "fat", label: string, max: number, step: number) => {
    const isLocked = locked.includes(m);
    return (
      <div className="grid min-w-0 gap-1">
        <NumberField label={label} value={t[m]} min={0} max={max} step={step} onChange={(g) => change(m, g)} suffix="g" />
        {showLocks && (
          <button type="button" onClick={() => s.toggleMacroLock(m)} aria-pressed={isLocked}
            className={cx("inline-flex min-h-[32px] items-center justify-center gap-1 rounded-md border text-xs font-semibold", isLocked ? "border-accent bg-accent-soft text-ink" : "border-line text-muted hover:bg-sunk")}>
            {isLocked ? <Lock size={12} aria-hidden /> : <LockOpen size={12} aria-hidden />} {isLocked ? "Locked" : "Lock"}
            <span className="sr-only"> {label}</span>
          </button>
        )}
      </div>
    );
  };
  const free = (["protein", "carbs", "fat"] as const).filter((k) => !locked.includes(k));
  return (
    <div className="grid gap-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {caloriesMode ? (
          <NumberField label="Calories per day" value={t.kcal} min={1000} max={6000} step={50} onChange={(k) => s.setCalories(k)} suffix="kcal" />
        ) : (
          <div className="grid gap-1">
            <span className="text-[13px] text-muted">Calories per day</span>
            <div className="input num bg-sunk">{t.kcal.toLocaleString()} kcal <span className="text-xs text-muted">from your grams</span></div>
          </div>
        )}
        <div className="grid gap-1">
          <label htmlFor="split" className="text-[13px] text-muted">Macro split</label>
          <select id="split" className="input" value={s.splitPreset} onChange={(e) => e.target.value !== "custom" && s.setSplitPreset(e.target.value as SplitPreset)}>
            {presetOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            <option value="custom">{s.splitPreset === "custom" ? "Suggested or your own" : "Custom"}</option>
          </select>
        </div>
      </div>

      {adv && (
        <div className="grid gap-1">
          <span className="text-[13px] text-muted">When I change a macro</span>
          <Segmented size="sm" label="Editing mode" value={s.targetMode} onChange={s.setTargetMode} options={[{ value: "calories", label: "Keep calories fixed" }, { value: "grams", label: "Set grams freely" }]} />
        </div>
      )}

      <div className="grid grid-cols-3 gap-3">
        {macroField("protein", "Protein", 500, 5)}
        {macroField("carbs", "Carbs", 900, 5)}
        {macroField("fat", "Fat", 300, 1)}
      </div>
      {showLocks && (
        <p className="text-xs text-muted">
          {free.length === 3 && "Nothing is locked: changing one macro moves the other two to keep your calories. Changing calories rescales all three."}
          {free.length === 2 && `${cap(locked[0]!)} is locked. Changing ${free[0]} moves ${free[1]} (and the other way round). Changing calories moves ${free.join(" and ")}.`}
          {free.length === 1 && `${cap(locked.join(" and "))} are locked. Changing ${free[0]} changes your calories; changing calories moves ${free[0]}.`}
          {free.length === 0 && "All three are locked, so calories stay where they are. Unlock a macro to change calories."}
        </p>
      )}
      {note && <p role="status" className="text-sm text-warn">{note}</p>}

      <div>
        <div className="flex h-3 overflow-hidden rounded-full" role="img" aria-label={`Protein ${Math.round(shares.protein * 100)}%, carbs ${Math.round(shares.carbs * 100)}%, fat ${Math.round(shares.fat * 100)}% of calories`}>
          <div style={{ width: `${shares.protein * 100}%` }} className="bg-protein" />
          <div style={{ width: `${shares.carbs * 100}%` }} className="bg-carbs" />
          <div style={{ width: `${shares.fat * 100}%` }} className="bg-fat" />
        </div>
        <div className="num mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
          <span><b className="text-protein">■</b> Protein {Math.round(shares.protein * 100)}% · {t.protein * 4} kcal</span>
          <span><b className="text-carbs">■</b> Carbs {Math.round(shares.carbs * 100)}% · {t.carbs * 4} kcal</span>
          <span><b className="text-fat">■</b> Fat {Math.round(shares.fat * 100)}% · {t.fat * 9} kcal</span>
          <span>Fiber goal {t.fiber} g</span>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {showSuggest && (
          <button type="button" className="btn btn-sm" onClick={() => { s.applySuggestedTargets(); setNote(null); }}>
            Use the suggestion from my body stats
          </button>
        )}
        <button type="button" className="btn btn-sm border-transparent text-accent" aria-expanded={adv} onClick={() => setAdv(!adv)}>{adv ? "Fewer options" : "Locks and more options"}</button>
      </div>
    </div>
  );
}

/* ───────────── Meals and snacks ───────────── */
const STYLE_OPTIONS = Object.entries(MEAL_STYLES).map(([value, v]) => ({ value: value as MealStyle, label: v.label }));

function OccasionRow({ id, part, advanced, styles }: { id: string; part: { protein: number; carbs: number; fat: number; kcal: number }; advanced: boolean; styles: boolean }) {
  const s = useApp();
  const o = s.occasions.find((x) => x.id === id)!;
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const custom = !!o.macros;
  const style = styles && !custom && o.style && o.style in MEAL_STYLES && o.style !== "balanced" ? MEAL_STYLES[o.style] : null;
  const cur: MacroGrams = { protein: part.protein, carbs: part.carbs, fat: part.fat };
  const apply = (r: { macros: MacroGrams; clamped: boolean }) => {
    s.setOccasionMacros(o.id, r.macros);
    setNote(r.clamped ? "That's more than this meal's calories allow. Raise its calories first." : null);
  };
  // with styles on, a meal edit keeps the meal's calories; otherwise the grams are taken as typed
  const setM = (k: "protein" | "carbs" | "fat", g: number) => (styles ? apply(editMealMacro(cur, k, g)) : s.setOccasionMacros(o.id, { ...cur, ...o.macros, [k]: g }));
  const pickStyle = (v: MealStyle) => {
    if (o.macros) s.setOccasionMacros(o.id, null);
    s.updateOccasion(o.id, { style: v === "balanced" ? undefined : v });
  };
  return (
    <li className="px-3 py-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-sm font-medium">{o.name}{custom ? <span className="pill">Custom</span> : style && <span className="pill">{style.label}</span>}</div>
          <div className="num text-xs text-muted">{part.kcal} kcal · {part.protein}P · {part.carbs}C · {part.fat}F</div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {styles && (
            <>
              <label htmlFor={`style-${o.id}`} className="sr-only">{o.name} style</label>
              <select id={`style-${o.id}`} className="input w-auto py-1.5 text-[13px]" value={custom ? "custom" : (o.style && o.style in MEAL_STYLES ? o.style : "balanced")}
                onChange={(e) => e.target.value !== "custom" && pickStyle(e.target.value as MealStyle)}>
                {STYLE_OPTIONS.map((x) => <option key={x.value} value={x.value}>{x.label}</option>)}
                {custom && <option value="custom">My own grams</option>}
              </select>
            </>
          )}
          {(advanced || custom) && (
            <button type="button" className={cx("btn btn-sm", (open || custom) && "border-accent")} aria-expanded={open} onClick={() => setOpen(!open)}>
              <SlidersHorizontal size={14} aria-hidden /> Macros
            </button>
          )}
          <Segmented size="sm" label={`${o.name} source`} value={o.prepped ? "prep" : "fresh"} onChange={(v) => s.updateOccasion(o.id, { prepped: v === "prep" })}
            options={[{ value: "prep", label: "Meal prep" }, { value: "fresh", label: "Not prepped" }]} />
        </div>
      </div>
      {style && <p className="mt-1 text-xs text-muted">{style.detail}</p>}
      {open && (
        <div className="mt-2 grid gap-2 rounded-lg bg-sunk p-3">
          <div className={cx("grid gap-2", styles ? "grid-cols-2" : "grid-cols-3")}>
            {styles && <NumberField compact label="Calories" value={part.kcal} min={0} max={3000} step={25} suffix="kcal" onChange={(k) => apply(editMealCalories(cur, k))} />}
            <NumberField compact label="Protein" value={part.protein} min={0} max={300} step={5} suffix="g" onChange={(g) => setM("protein", g)} />
            <NumberField compact label="Carbs" value={part.carbs} min={0} max={500} step={5} suffix="g" onChange={(g) => setM("carbs", g)} />
            <NumberField compact label="Fat" value={part.fat} min={0} max={200} step={1} suffix="g" onChange={(g) => setM("fat", g)} />
          </div>
          <p className="text-xs text-muted">
            {styles
              ? "Changing protein moves carbs and fat; changing carbs or fat keeps protein. This meal's calories stay put unless you change them, and your other meals share what's left of the day."
              : custom ? "These grams are fixed for this meal. Your other meals share what's left of the day." : "Change a number to set this meal's macros yourself. Until then it gets its share of the day automatically."}
          </p>
          {note && <p role="status" className="text-xs text-warn">{note}</p>}
          {custom && <button type="button" className="btn btn-sm justify-self-start" onClick={() => { s.setOccasionMacros(o.id, null); setNote(null); }}>Back to automatic</button>}
        </div>
      )}
    </li>
  );
}

export function MealStructureEditor() {
  const s = useApp();
  const styles = useFlag("mealStyles");
  const occasions = useOccasions();
  const parts = useMemo(() => splitTargets(s.targets, occasions), [s.targets, occasions]);
  const overflow = useMemo(() => customOverflow(s.targets, s.occasions), [s.targets, s.occasions]);
  const [adv, setAdv] = useState(false);
  return (
    <div className="grid gap-4">
      <div className="grid grid-cols-2 gap-3">
        <Stepper label="Meals a day" value={s.meals} min={1} max={MAX_MEALS} onChange={(m) => s.setStructure(m, s.snacks)} />
        <Stepper label="Snacks a day" value={s.snacks} min={0} max={MAX_SNACKS} onChange={(n) => s.setStructure(s.meals, n)} />
      </div>
      <ul className="divide-y divide-line rounded-lg border border-line">
        {s.occasions.map((o, i) => <OccasionRow key={o.id} id={o.id} part={parts[i]!} advanced={adv} styles={styles} />)}
      </ul>
      {(overflow.protein > 0 || overflow.carbs > 0 || overflow.fat > 0) && (
        <p role="status" className="text-sm text-warn">
          Your custom meals add up to more than your day ({[overflow.protein && `${overflow.protein} g protein`, overflow.carbs && `${overflow.carbs} g carbs`, overflow.fat && `${overflow.fat} g fat`].filter(Boolean).join(", ")} over). Other meals get nothing of that macro.
        </p>
      )}
      <p className="text-xs text-muted">
        {styles && "Pick a style to shape a meal, like a high-protein breakfast or a lighter dinner. Your day's calories and macros stay the same; the other meals rebalance. "}
        "Not prepped" keeps those calories free for eating out or cooking fresh. The plan fills the rest.
      </p>
      <RotationPicker />
      <details className="group" onToggle={(e) => setAdv((e.target as HTMLDetailsElement).open)}>
        <summary className="cursor-pointer text-sm font-semibold text-accent">More options: recipe counts and macros per meal</summary>
        <div className="mt-3 grid grid-cols-3 gap-3">
          <Stepper label="Breakfast recipes" value={s.variety.breakfast} min={1} max={3} onChange={(v) => s.set({ variety: { ...s.variety, breakfast: v } })} />
          <Stepper label="Lunch and dinner recipes" value={s.variety.main} min={1} max={5} onChange={(v) => s.set({ variety: { ...s.variety, main: v, rotation: v === 2 ? s.variety.rotation : "mix" } })} />
          <Stepper label="Snack recipes" value={s.variety.snack} min={1} max={3} onChange={(v) => s.set({ variety: { ...s.variety, snack: v } })} />
        </div>
      </details>
    </div>
  );
}

/** How lunches and dinners rotate: one recipe all week, two in back-to-back blocks, or a mix. */
export function RotationPicker() {
  const s = useApp();
  const v = s.variety;
  const value = v.main === 1 ? "same" : v.main === 2 && v.rotation === "blocks" ? "blocks" : v.main === 2 ? "mix" : "custom";
  const pick = (x: "same" | "blocks" | "mix") => s.set({ variety: { ...v, main: x === "same" ? 1 : 2, rotation: x === "blocks" ? "blocks" : "mix" } });
  const hint = {
    same: "One lunch-and-dinner recipe all week. Least cooking.",
    blocks: `One recipe for the first ${Math.ceil(s.days / 2)} days, a different one for the rest. You cook the second one fresh mid-week.`,
    mix: "Two recipes, alternating through the week.",
    custom: `${v.main} recipes, mixed through the week.`,
  }[value];
  return (
    <div className="grid gap-1.5">
      <span className="text-[13px] text-muted">Lunches and dinners</span>
      <Segmented size="sm" label="Lunches and dinners" value={value === "custom" ? "mix" : value} onChange={pick}
        options={[{ value: "same", label: "Same" }, { value: "blocks", label: "Split week" }, { value: "mix", label: "Alternate" }]} />
      <p className="text-xs text-muted">{hint}</p>
    </div>
  );
}

/* ───────────── Budget ───────────── */
export function BudgetEditor() {
  const s = useApp();
  const weekly = s.budget.period === "month" ? s.budget.amount / (30.4 / 7) : s.budget.amount;
  return (
    <div className="grid gap-4">
      <div className="grid grid-cols-2 gap-3">
        <NumberField label="Grocery budget" prefix="$" value={s.budget.amount} min={10} max={2000} step={5} onChange={(amount) => s.set({ budget: { ...s.budget, amount } })} />
        <div className="grid gap-1">
          <span className="text-[13px] text-muted">Per</span>
          <Segmented label="Budget period" value={s.budget.period} onChange={(period) => s.set({ budget: { ...s.budget, period } })} options={[{ value: "week", label: "Week" }, { value: "month", label: "Month" }]} />
        </div>
      </div>
      <Stepper label="Days to plan" value={s.days} min={1} max={7} onChange={(days) => s.set({ days })} format={(d) => `${d} day${d === 1 ? "" : "s"}`} />
      <p className="text-xs text-muted">
        {s.budget.period === "month" && <>That's about {money(weekly)} a week. </>}
        This plan gets {money((weekly * s.days) / 7)} for {s.days} days.
      </p>
    </div>
  );
}

/* ───────────── Food rules and moods ───────────── */
export function RulesEditor() {
  const s = useApp();
  const p = s.prefs;
  const toggle = <T extends string>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  const wholeSwitch = useFlag("wholeFoods");
  const [q, setQ] = useState("");
  const matches = q.length >= 2 ? Object.values(INGREDIENTS).filter((i) => i.name.toLowerCase().includes(q.toLowerCase()) && !p.dislikes.includes(i.id)).slice(0, 6) : [];
  return (
    <div className="grid gap-5">
      {wholeSwitch && (
        <Toggle label="Whole foods only" detail="Skip processed meats, white rice and pasta, and sauces with added sugar"
          checked={p.diets.includes("wholeFoods")} onChange={() => s.set({ prefs: { ...p, diets: toggle(p.diets, "wholeFoods") } })} />
      )}
      <div className="grid gap-2">
        <span className="label">Diet</span>
        <div className="flex flex-wrap gap-2">
          {(Object.keys(DIETS) as Diet[]).filter((d) => d !== "omnivore" && !(wholeSwitch && d === "wholeFoods")).map((d) => (
            <Chip key={d} selected={p.diets.includes(d)} onClick={() => s.set({ prefs: { ...p, diets: toggle(p.diets, d) } })} title={DIETS[d].detail}>{DIETS[d].label}</Chip>
          ))}
        </div>
      </div>
      <div className="grid gap-2">
        <span className="label">Allergies</span>
        <div className="flex flex-wrap gap-2">
          {(Object.keys(ALLERGENS) as Allergen[]).map((a) => (
            <Chip key={a} tone="warn" selected={p.allergens.includes(a)} onClick={() => s.set({ prefs: { ...p, allergens: toggle(p.allergens, a) } })}>{ALLERGENS[a]}</Chip>
          ))}
        </div>
        <p className="text-xs text-muted">Allergy filtering is a convenience. Always check product labels.</p>
      </div>
      <div className="grid gap-2">
        <label htmlFor="dislike" className="label">Foods I won't eat</label>
        <div className="flex flex-wrap gap-2">
          {p.dislikes.map((id) => (
            <Chip key={id} tone="warn" selected onClick={() => s.set({ prefs: { ...p, dislikes: p.dislikes.filter((x) => x !== id) } })} title="Remove">
              {INGREDIENTS[id]?.name ?? id} ✕
            </Chip>
          ))}
        </div>
        <input id="dislike" className="input" placeholder="Type an ingredient, like mushrooms" value={q} onChange={(e) => setQ(e.target.value)} />
        {matches.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {matches.map((i) => <Chip key={i.id} selected={false} onClick={() => { s.set({ prefs: { ...p, dislikes: [...p.dislikes, i.id] } }); setQ(""); }}>+ {i.name}</Chip>)}
          </div>
        )}
      </div>
      <div className="grid gap-2">
        <span className="label">Equipment I don't have</span>
        <div className="flex flex-wrap gap-2">
          {(Object.keys(EQUIPMENT) as Equipment[]).filter((e) => e !== "noCook").map((e) => (
            <Chip key={e} tone="warn" selected={p.missingEquipment.includes(e)} onClick={() => s.set({ prefs: { ...p, missingEquipment: toggle(p.missingEquipment, e) } })}>{EQUIPMENT[e]}</Chip>
          ))}
        </div>
      </div>
      <NumberField label="Most hands-on time per recipe" value={p.maxActiveMinutes} min={5} max={120} step={5} suffix="min" onChange={(maxActiveMinutes) => s.set({ prefs: { ...p, maxActiveMinutes } })} />
    </div>
  );
}

const SHOWN = 10;
export function MoodEditor() {
  const s = useApp();
  const p = s.prefs;
  const [all, setAll] = useState<Record<string, boolean>>({});
  // the Pittsburgh cuisine only shows near Pittsburgh (ZIPs 150 to 152) or once picked
  const local = isPittsburghZip(s.profile.zip);
  const groups = [
    { key: "cuisines" as const, title: "Cuisines", labels: CUISINES as Record<string, string> },
    { key: "moods" as const, title: "Moods", labels: MOODS as Record<string, string> },
    { key: "proteins" as const, title: "Proteins", labels: PROTEIN_SOURCES as Record<string, string> },
  ];
  const count = [...groups.map((g) => g.key), "flavors" as const].reduce((n, k) => n + Object.keys(p[k]).length, 0);
  return (
    <div className="grid gap-5">
      <p className="text-sm text-muted">Tap a tag to want more of it. Tap again to make it a must, and once more to avoid it.</p>
      {groups.map((g) => {
        const wishes = p[g.key] as Record<string, "must" | "nice" | "avoid">;
        const entries = Object.entries(g.labels).filter(([k]) => k !== "pittsburgh" || local || wishes[k]);
        const open = all[g.key] || entries.length <= SHOWN + 2;
        const shown = open ? entries : entries.filter(([k], i) => i < SHOWN || wishes[k]);
        return (
          <div key={g.key} className="grid gap-2">
            <span className="label">{g.title}</span>
            <div className="flex flex-wrap gap-2">
              {shown.map(([k, label]) => (
                <WishChip key={k} label={label} wish={wishes[k]} onChange={(w) => s.setWish(g.key, k, w)} />
              ))}
              {!open && <button type="button" className="text-sm font-semibold text-accent" onClick={() => setAll({ ...all, [g.key]: true })}>All {entries.length}</button>}
            </div>
          </div>
        );
      })}
      {count > 0 && (
        <button type="button" className="btn btn-sm justify-self-start" onClick={() => s.set({ prefs: { ...p, cuisines: {}, moods: {}, proteins: {}, flavors: {} } })}>
          Clear all moods
        </button>
      )}
    </div>
  );
}

/* ───────────── Stores ───────────── */
export function StoresEditor() {
  const s = useApp();
  return (
    <div className="grid gap-4">
      <div className="grid gap-2">
        <span className="label">Stores I'll shop at</span>
        <div className="grid gap-2 sm:grid-cols-2">
          {CHAINS.map((c) => (
            <Toggle key={c.id} label={c.name} detail={c.note} checked={s.stores.includes(c.id)}
              onChange={(on) => s.set({ stores: on ? [...s.stores, c.id] : s.stores.filter((x) => x !== c.id) })} />
          ))}
        </div>
      </div>
      <div className="grid gap-1">
        <span className="text-[13px] text-muted">Shopping trips</span>
        <Segmented label="Store mode" value={s.storeMode} onChange={(storeMode) => s.set({ storeMode })}
          options={[{ value: "one", label: "One store" }, { value: "any", label: "Split if it saves money" }]} />
      </div>
      <Slider label="What matters more" value={s.costVsMacros} onChange={(costVsMacros) => s.set({ costVsMacros })} min={0} max={1} step={0.1} left="Closest to my macros" right="Lowest cost" />
    </div>
  );
}
