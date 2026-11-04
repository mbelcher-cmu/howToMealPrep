"use client";
import { useMemo, useState } from "react";
import {
  ALLERGENS, CHAINS, CUISINES, DIETS, EQUIPMENT, FLAVORS, INGREDIENTS, MOODS, PROTEIN_SOURCES,
  type Allergen, type Diet, type Equipment,
} from "@prep-cart/catalog";
import { ACTIVITY_LEVELS, cmToFeetInches, feetInchesToCm, kgToLb, lbToKg, macroShares, MAX_MEALS, MAX_SNACKS, splitTargets, SPLIT_PRESETS, suggestTargets, type ActivityLevel, type Goal, type SplitPreset } from "@prep-cart/nutrition";
import { useApp } from "@/lib/store";
import { Chip, NumberField, Segmented, Slider, Stepper, Toggle, WishChip } from "./ui";
import { money } from "@/lib/format";

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
          <span className="text-[13px] text-muted">Sex (for the energy formula)</span>
          <Segmented label="Sex" value={p.sex} onChange={(sex) => setProfile({ sex })} options={[{ value: "male", label: "Male" }, { value: "female", label: "Female" }]} />
        </div>
        <NumberField label="Age" value={p.ageYears} min={13} max={100} onChange={(ageYears) => setProfile({ ageYears })} suffix="yr" />
      </div>
      {us ? (
        <div className="grid grid-cols-3 gap-3">
          <NumberField label="Height" value={fi.feet} min={3} max={7} onChange={(f) => setProfile({ heightCm: Math.round(feetInchesToCm(f, fi.inches)) })} suffix="ft" />
          <NumberField label="&nbsp;" value={fi.inches} min={0} max={11} onChange={(i) => setProfile({ heightCm: Math.round(feetInchesToCm(fi.feet, i)) })} suffix="in" />
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
  const s = useApp();
  const t = s.targets;
  const shares = macroShares(t);
  const [note, setNote] = useState<string | null>(null);
  const presetOptions = Object.entries(SPLIT_PRESETS).map(([k, v]) => ({ value: k, label: v.label }));
  const change = (m: "protein" | "carbs" | "fat", g: number) => {
    const r = s.setMacro(m, g);
    if (r.clamped) setNote(`That's more than your calories allow. Raise calories or switch to "Set grams".`); else setNote(null);
  };
  return (
    <div className="grid gap-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {s.targetMode === "calories" ? (
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
            <option value="custom">Custom</option>
          </select>
        </div>
      </div>

      <div className="grid gap-1">
        <span className="text-[13px] text-muted">When I change a macro</span>
        <Segmented size="sm" label="Editing mode" value={s.targetMode} onChange={s.setTargetMode} options={[{ value: "calories", label: "Keep calories fixed" }, { value: "grams", label: "Set grams freely" }]} />
      </div>

      <div className="grid grid-cols-3 gap-3">
        <NumberField label="Protein" value={t.protein} min={0} max={500} step={5} onChange={(g) => change("protein", g)} suffix="g" />
        <NumberField label="Carbs" value={t.carbs} min={0} max={900} step={5} onChange={(g) => change("carbs", g)} suffix="g" />
        <NumberField label="Fat" value={t.fat} min={0} max={300} step={1} onChange={(g) => change("fat", g)} suffix="g" />
      </div>
      {s.targetMode === "calories" && (
        <div className="flex flex-wrap items-center gap-2 text-[13px] text-muted">
          <span>Balance changes with</span>
          <Segmented size="sm" label="Balance with" value={s.balancer} onChange={s.setBalancer} options={[{ value: "carbs", label: "Carbs" }, { value: "fat", label: "Fat" }]} />
        </div>
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
        <p className="mt-2 text-xs text-muted">Calories always equal 4 × protein + 4 × carbs + 9 × fat.</p>
      </div>
      {showSuggest && (
        <button type="button" className="btn btn-sm justify-self-start" onClick={() => { s.applySuggestedTargets(); setNote(null); }}>
          Use the suggestion from my body stats
        </button>
      )}
    </div>
  );
}

/* ───────────── Meals and snacks ───────────── */
export function MealStructureEditor() {
  const s = useApp();
  const parts = useMemo(() => splitTargets(s.targets, s.occasions), [s.targets, s.occasions]);
  return (
    <div className="grid gap-4">
      <div className="grid grid-cols-2 gap-3">
        <Stepper label="Meals a day" value={s.meals} min={1} max={MAX_MEALS} onChange={(m) => s.setStructure(m, s.snacks)} />
        <Stepper label="Snacks a day" value={s.snacks} min={0} max={MAX_SNACKS} onChange={(n) => s.setStructure(s.meals, n)} />
      </div>
      <ul className="divide-y divide-line rounded-lg border border-line">
        {s.occasions.map((o, i) => (
          <li key={o.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
            <div className="min-w-0">
              <div className="text-sm font-medium">{o.name}</div>
              <div className="num text-xs text-muted">{parts[i]!.kcal} kcal · {parts[i]!.protein} g protein</div>
            </div>
            <Segmented size="sm" label={`${o.name} source`} value={o.prepped ? "prep" : "fresh"} onChange={(v) => s.updateOccasion(o.id, { prepped: v === "prep" })}
              options={[{ value: "prep", label: "Meal prep" }, { value: "fresh", label: "Not prepped" }]} />
          </li>
        ))}
      </ul>
      <p className="text-xs text-muted">"Not prepped" keeps those calories free for eating out or cooking fresh. The plan fills the rest.</p>
      <div className="grid grid-cols-3 gap-3">
        <Stepper label="Breakfast recipes" value={s.variety.breakfast} min={1} max={3} onChange={(v) => s.set({ variety: { ...s.variety, breakfast: v } })} />
        <Stepper label="Lunch and dinner recipes" value={s.variety.main} min={1} max={5} onChange={(v) => s.set({ variety: { ...s.variety, main: v } })} />
        <Stepper label="Snack recipes" value={s.variety.snack} min={1} max={3} onChange={(v) => s.set({ variety: { ...s.variety, snack: v } })} />
      </div>
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
  const [q, setQ] = useState("");
  const matches = q.length >= 2 ? Object.values(INGREDIENTS).filter((i) => i.name.toLowerCase().includes(q.toLowerCase()) && !p.dislikes.includes(i.id)).slice(0, 6) : [];
  return (
    <div className="grid gap-5">
      <div className="grid gap-2">
        <span className="label">Diet</span>
        <div className="flex flex-wrap gap-2">
          {(Object.keys(DIETS) as Diet[]).filter((d) => d !== "omnivore").map((d) => (
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

export function MoodEditor() {
  const s = useApp();
  const p = s.prefs;
  const groups = [
    { key: "cuisines" as const, title: "Cuisines", labels: CUISINES as Record<string, string> },
    { key: "moods" as const, title: "Moods", labels: MOODS as Record<string, string> },
    { key: "proteins" as const, title: "Proteins", labels: PROTEIN_SOURCES as Record<string, string> },
    { key: "flavors" as const, title: "Flavors", labels: FLAVORS as Record<string, string> },
  ];
  const count = groups.reduce((n, g) => n + Object.keys(p[g.key]).length, 0);
  return (
    <div className="grid gap-5">
      <p className="text-sm text-muted">Tap once for <b>Want</b>, twice for <b>Must</b>, three times to <b>Avoid</b>. Must-haves decide your lunches and dinners when enough recipes match.</p>
      {groups.map((g) => (
        <div key={g.key} className="grid gap-2">
          <span className="label">{g.title}</span>
          <div className="flex flex-wrap gap-2">
            {Object.entries(g.labels).map(([k, label]) => (
              <WishChip key={k} label={label} wish={(p[g.key] as Record<string, "must" | "nice" | "avoid">)[k]} onChange={(w) => s.setWish(g.key, k, w)} />
            ))}
          </div>
        </div>
      ))}
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
