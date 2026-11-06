"use client";
import { Trash2, UserPlus } from "lucide-react";
import { ALLERGENS, DIETS, type Allergen, type Diet } from "@prep-cart/catalog";
import { ACTIVITY_LEVELS, kgToLb, lbToKg, suggestTargets, type ActivityLevel, type Goal } from "@prep-cart/nutrition";
import { useApp, type Member } from "@/lib/store";
import { memberGoals, memberKcal } from "@/lib/household";
import { useFlag } from "@/lib/flags";
import { Chip, NumberField, Segmented } from "./ui";
import { Paywall } from "./paywall";
import { useEntitlements } from "@/lib/entitlements";

/** Diets that change what a person can eat (the cook's own diet lives in Preferences). */
const MEMBER_DIETS: Diet[] = ["vegetarian", "vegan", "pescatarian", "glutenFree", "dairyFree", "noPork"];
const toggle = <T,>(list: T[] | undefined, x: T) => ((list ?? []).includes(x) ? (list ?? []).filter((y) => y !== x) : [...(list ?? []), x]);

const newMember = (n: number): Member => ({ id: `m${Date.now()}`, name: `Person ${n + 2}`, sex: "female", ageYears: 30, heightCm: 165, weightKg: 65, activity: "light", goal: "maintain", kcal: null });

export function HouseholdEditor() {
  const s = useApp();
  const ownGoals = useFlag("householdGoals");
  const us = s.profile.units === "us";
  const people = s.household;
  const ent = useEntitlements();
  // free covers one more person; existing members are never removed when Plus ends
  const atLimit = !ent.canAdd("household", people.length) && people.length < 5;
  const update = (id: string, patch: Partial<Member>) => s.set({ household: people.map((m) => (m.id === id ? { ...m, ...patch } : m)) });
  return (
    <div className="grid gap-4">
      {people.length === 0 && (
        <p className="text-sm text-muted">
          {ownGoals
            ? "Just you for now. Add the people you cook for, with their own calories, protein and diet. Everyone shares recipes where they can, in portions sized for them, from one shopping list and one prep day."
            : "Just you for now. Add the people you cook for and everyone gets the same meals, in portions sized to their own calories, from one shopping list."}
        </p>
      )}
      {people.map((m) => {
        const est = (() => { try { return suggestTargets({ stats: m, activity: m.activity, goal: m.goal }).goalKcal; } catch { return null; } })();
        return (
          <fieldset key={m.id} className="grid gap-3 rounded-lg border border-line p-3">
            <legend className="sr-only">{m.name}</legend>
            <div className="flex items-end gap-2">
              <div className="grid flex-1 gap-1">
                <label htmlFor={`name-${m.id}`} className="text-[13px] text-muted">Name</label>
                <input id={`name-${m.id}`} className="input" value={m.name} maxLength={30} onChange={(e) => update(m.id, { name: e.target.value })} />
              </div>
              <button className="btn text-warn" onClick={() => s.set({ household: people.filter((p) => p.id !== m.id) })} aria-label={`Remove ${m.name}`}><Trash2 size={16} aria-hidden /></button>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="col-span-2 grid gap-1">
                <span className="text-[13px] text-muted">Sex</span>
                <Segmented size="sm" label={`${m.name} sex`} value={m.sex} onChange={(sex) => update(m.id, { sex, kcal: null })} options={[{ value: "male", label: "Male" }, { value: "female", label: "Female" }]} />
              </div>
              <NumberField compact label="Age" value={m.ageYears} min={13} max={100} suffix="yr" onChange={(ageYears) => update(m.id, { ageYears, kcal: null })} />
              {us
                ? <NumberField compact label="Weight" value={Math.round(kgToLb(m.weightKg))} min={70} max={650} suffix="lb" onChange={(lb) => update(m.id, { weightKg: Math.round(lbToKg(lb) * 10) / 10, kcal: null })} />
                : <NumberField compact label="Weight" value={m.weightKg} min={30} max={300} suffix="kg" onChange={(weightKg) => update(m.id, { weightKg, kcal: null })} />}
              {us
                ? <NumberField compact label="Height" value={Math.round(m.heightCm / 2.54)} min={48} max={90} suffix="in" onChange={(inch) => update(m.id, { heightCm: Math.round(inch * 2.54), kcal: null })} />
                : <NumberField compact label="Height" value={m.heightCm} min={120} max={230} suffix="cm" onChange={(heightCm) => update(m.id, { heightCm, kcal: null })} />}
              <div className="col-span-2 grid gap-1 sm:col-span-3">
                <label htmlFor={`act-${m.id}`} className="text-[13px] text-muted">Activity</label>
                <select id={`act-${m.id}`} className="input" value={m.activity} onChange={(e) => update(m.id, { activity: e.target.value as ActivityLevel, kcal: null })}>
                  {Object.entries(ACTIVITY_LEVELS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-[1fr_160px]">
              <div className="grid gap-1">
                <span className="text-[13px] text-muted">Goal</span>
                <Segmented size="sm" label={`${m.name} goal`} value={m.goal} onChange={(goal: Goal) => update(m.id, { goal, kcal: null })} options={[{ value: "lose", label: "Lose fat" }, { value: "maintain", label: "Maintain" }, { value: "gain", label: "Build muscle" }]} />
              </div>
              <NumberField compact label="Calories a day" value={memberKcal(m)} min={1000} max={5000} step={10} suffix="kcal" hint={m.kcal && est ? `Estimate: ${est.toLocaleString()}` : "Estimated"} onChange={(kcal) => update(m.id, { kcal })} />
            </div>
            {ownGoals && <MemberGoals m={m} update={(patch) => update(m.id, patch)} />}
          </fieldset>
        );
      })}
      <div className="flex flex-wrap items-center gap-3">
        {!atLimit && <button className="btn" onClick={() => s.set({ household: [...people, newMember(people.length)] })} disabled={people.length >= 5}><UserPlus size={16} aria-hidden /> Add a person</button>}
        {people.length > 0 && (
          <p className="text-xs text-muted">
            {ownGoals
              ? "One budget, one cart and one prep day for everyone. Recipes are shared where diets allow; if someone can't eat one, the plan cooks something just for them."
              : "Budget, meals and food rules are shared. The budget is for everyone."}
          </p>
        )}
      </div>
      {atLimit && <Paywall feature="household">Free plans cover you and one more person. Plus cooks for up to 6 from one list, each with portions sized to their calories.</Paywall>}
    </div>
  );
}

/** Protein, diet and allergies for one household member (householdGoals flag). */
function MemberGoals({ m, update }: { m: Member; update: (patch: Partial<Member>) => void }) {
  const g = memberGoals(m);
  const name = m.name.trim() || "This person";
  return (
    <div className="grid gap-3 sm:grid-cols-[160px_1fr]">
      <NumberField compact label="Protein a day" value={g.protein} min={30} max={Math.max(30, Math.round((g.kcal * 0.4) / 4))} step={5} suffix="g" hint={m.protein != null ? `Estimate: ${g.estimatedProtein} g` : "Estimated"} onChange={(protein) => update({ protein })} />
      <div className="grid gap-1.5">
        <span className="text-xs text-muted" id={`diet-${m.id}`}>Diet</span>
        <div className="flex flex-wrap gap-1.5" role="group" aria-labelledby={`diet-${m.id}`}>
          {MEMBER_DIETS.map((d) => (
            <Chip key={d} selected={(m.diets ?? []).includes(d)} onClick={() => update({ diets: toggle(m.diets, d) })} title={DIETS[d].detail}>
              <span className="sr-only">{name}: </span>{DIETS[d].label}
            </Chip>
          ))}
        </div>
        <details className="text-sm">
          <summary className="cursor-pointer text-xs text-muted">Allergies{m.allergens?.length ? ` (${m.allergens.length})` : ""}</summary>
          <div className="mt-1.5 flex flex-wrap gap-1.5" role="group" aria-label={`${name} allergies`}>
            {(Object.keys(ALLERGENS) as Allergen[]).map((a) => (
              <Chip key={a} tone="warn" selected={(m.allergens ?? []).includes(a)} onClick={() => update({ allergens: toggle(m.allergens, a) })}>
                <span className="sr-only">{name}: </span>{ALLERGENS[a]}
              </Chip>
            ))}
          </div>
        </details>
      </div>
    </div>
  );
}
