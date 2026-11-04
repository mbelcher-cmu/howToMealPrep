"use client";
import { create } from "zustand";
import { persist, createJSONStorage, type StateStorage } from "zustand/middleware";
import { INGREDIENTS, shelfLifeDays, type ChainId, type UnitSystem } from "@prep-cart/catalog";
import {
  defaultOccasions, editCaloriesWithLocks, editMacroFree, editMacroWithLocks, suggestTargets, targetsFromSplit,
  SPLIT_PRESETS, type ActivityLevel, type Balancer, type EatingOccasion, type Goal, type MacroGrams, type MacroKey, type Sex,
  type SplitPreset, type Targets,
} from "@prep-cart/nutrition";
import type { Deal, EatOut, PantryItem, PlanResult, Preferences, PriceQuote, Schedule, Variety, Wish } from "@prep-cart/planner";
import { decode, encode, safeStorage } from "./storage";

export interface Profile {
  sex: Sex; ageYears: number; heightCm: number; weightKg: number; activity: ActivityLevel; goal: Goal;
  units: UnitSystem; zip: string;
}

/** Someone else the food is cooked for. kcal null means estimate from body stats and goal. */
export interface Member { id: string; name: string; sex: Sex; ageYears: number; heightCm: number; weightKg: number; activity: ActivityLevel; goal: Goal; kcal: number | null }

export type TargetMode = "calories" | "grams";
export type BudgetPeriod = "week" | "month";

export interface SavedPlan {
  id: string;
  /** fingerprint of the inputs that produced this plan */
  key: string;
  createdAt: string;
  days: number;
  result: PlanResult;
  schedule: Schedule;
}

/** A pantry row. useBy is a YYYY-MM-DD date; staples (Infinity grams) have none. */
export type PantryRow = PantryItem & { useBy?: string };

export const isoDay = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
export const addDays = (iso: string, n: number) => { const d = new Date(`${iso}T12:00:00`); d.setDate(d.getDate() + n); return isoDay(d); };
export const daysUntil = (iso: string) => Math.round((new Date(`${iso}T12:00:00`).getTime() - new Date(`${isoDay()}T12:00:00`).getTime()) / 86400000);
const defaultUseBy = (id: string) => addDays(isoDay(), shelfLifeDays(id));

export interface NearbyStore { id: string; name: string; chain: ChainId | null; address: string; distanceMi: number }

export interface AppState {
  onboarded: boolean;
  profile: Profile;
  targets: Targets;
  targetMode: TargetMode;
  /** @deprecated replaced by lockedMacros */
  balancer: Balancer;
  /** macros that stay put when another macro or the calories change */
  lockedMacros: MacroKey[];
  splitPreset: SplitPreset | "custom";
  meals: number;
  snacks: number;
  occasions: EatingOccasion[];
  days: number;
  budget: { amount: number; period: BudgetPeriod };
  prefs: Preferences;
  variety: Variety;
  stores: ChainId[];
  storeMode: "one" | "any";
  costVsMacros: number;
  priceOverrides: Record<string, Partial<Record<ChainId, PriceQuote | null>>>;
  pantry: PantryRow[];
  nearby: NearbyStore[];
  locked: string[];
  current: SavedPlan | null;
  history: SavedPlan[];
  checked: Record<string, boolean>;
  /** last energy reading synced from a fitness app */
  fitness: { source: string; maintenanceKcal: number; days: number; on: string } | null;
  /** other people eating the same prepped meals */
  household: Member[];
  /** first day of the plan, 0 = Monday; prep day is the day before */
  weekStart: number;
  /** prep session start, HH:MM */
  prepTime: string;
  /** takeout meals placed on the week */
  eatingOut: EatOut[];
  /** sales the person entered from a weekly ad or the shelf */
  deals: (Deal & { id: string; addedOn: string })[];
  /** every price the person recorded, newest last */
  priceHistory: Record<string, { chain: ChainId; price: number; on: string; source: "manual" | "receipt" | "sale" }[]>;

  // actions
  setProfile: (p: Partial<Profile>) => void;
  applySuggestedTargets: () => void;
  setCalories: (kcal: number) => void;
  setMacro: (m: MacroKey, grams: number) => { clamped: boolean; kcalChanged: boolean };
  toggleMacroLock: (m: MacroKey) => void;
  setOccasionMacros: (id: string, macros: MacroGrams | null) => void;
  setSplitPreset: (p: SplitPreset) => void;
  setTargetMode: (m: TargetMode) => void;
  setBalancer: (b: Balancer) => void;
  setStructure: (meals: number, snacks: number) => void;
  updateOccasion: (id: string, patch: Partial<EatingOccasion>) => void;
  set: (patch: Partial<AppState>) => void;
  setWish: (group: "cuisines" | "moods" | "flavors" | "proteins", key: string, wish: Wish | null) => void;
  toggleLock: (recipeId: string) => void;
  setPantryAmount: (ingredientId: string, grams: number | null, useBy?: string | null) => void;
  addToPantry: (ingredientId: string, grams: number) => void;
  setPrice: (ingredientId: string, chain: ChainId, price: number | null | undefined) => void;
  savePlan: (plan: SavedPlan) => void;
  toggleChecked: (key: string) => void;
  finishShopping: () => void;
  setTakeout: (day: number, occasionId: string, itemId: string | null) => void;
  addDeal: (d: Deal) => void;
  removeDeal: (id: string) => void;
  reset: () => void;
}

const DEFAULT_PROFILE: Profile = { sex: "male", ageYears: 30, heightCm: 178, weightKg: 82, activity: "moderate", goal: "maintain", units: "us", zip: "15213" };

export const DEFAULT_PREFS: Preferences = {
  diets: [], allergens: [], dislikes: [], missingEquipment: [],
  cuisines: {}, moods: {}, flavors: {}, proteins: {}, maxActiveMinutes: 45,
};

function initial(): Omit<AppState, keyof Actions> {
  const targets = targetsFromSplit(2200, SPLIT_PRESETS.highProtein.split);
  return {
    onboarded: false,
    profile: DEFAULT_PROFILE,
    targets, targetMode: "calories", balancer: "carbs", lockedMacros: ["protein"], splitPreset: "highProtein",
    meals: 3, snacks: 1, occasions: defaultOccasions(3, 1),
    days: 7,
    budget: { amount: 75, period: "week" },
    prefs: DEFAULT_PREFS,
    variety: { breakfast: 1, main: 2, snack: 1 },
    stores: ["aldi", "gianteagle", "walmart", "traderjoes"],
    storeMode: "one",
    costVsMacros: 0.5,
    priceOverrides: {},
    pantry: Object.values(INGREDIENTS).filter((i) => i.staple).map((i) => ({ ingredientId: i.id, grams: Infinity })),
    nearby: [],
    locked: [],
    current: null,
    history: [],
    checked: {},
    eatingOut: [],
    fitness: null,
    household: [],
    weekStart: 0,
    prepTime: "15:00",
    deals: [],
    priceHistory: {},
  };
}
type Actions = Pick<AppState, "setProfile" | "applySuggestedTargets" | "setCalories" | "setMacro" | "toggleMacroLock" | "setOccasionMacros" | "setSplitPreset" | "setTargetMode" | "setBalancer" | "setStructure" | "updateOccasion" | "set" | "setWish" | "toggleLock" | "setPantryAmount" | "addToPantry" | "setPrice" | "savePlan" | "toggleChecked" | "finishShopping" | "setTakeout" | "addDeal" | "removeDeal" | "reset">;

const storage: StateStorage = {
  getItem: (k) => safeStorage.getItem(k),
  setItem: (k, v) => safeStorage.setItem(k, v),
  removeItem: (k) => safeStorage.removeItem(k),
};

export const useApp = create<AppState>()(
  persist(
    (set, get) => ({
      ...initial(),
      setProfile: (p) => set({ profile: { ...get().profile, ...p } }),
      applySuggestedTargets: () => {
        const { profile } = get();
        try {
          const s = suggestTargets({ stats: profile, activity: profile.activity, goal: profile.goal });
          set({ targets: s.targets, splitPreset: "custom" });
        } catch { /* invalid stats: leave targets alone */ }
      },
      setCalories: (kcal) => {
        const { targets, splitPreset, lockedMacros } = get();
        if (splitPreset !== "custom" && !lockedMacros.length) set({ targets: targetsFromSplit(kcal, SPLIT_PRESETS[splitPreset].split) });
        else set({ targets: editCaloriesWithLocks(targets, kcal, lockedMacros).targets, splitPreset: "custom" });
      },
      setMacro: (m, grams) => {
        const { targets, targetMode, lockedMacros } = get();
        if (targetMode === "grams") { set({ targets: editMacroFree(targets, m, grams), splitPreset: "custom" }); return { clamped: false, kcalChanged: true }; }
        const r = editMacroWithLocks(targets, m, grams, lockedMacros.filter((k) => k !== m));
        set({ targets: r.targets, splitPreset: "custom" });
        return { clamped: r.clamped, kcalChanged: r.kcalChanged };
      },
      toggleMacroLock: (m) => {
        const l = get().lockedMacros;
        set({ lockedMacros: l.includes(m) ? l.filter((x) => x !== m) : [...l, m] });
      },
      setOccasionMacros: (id, macros) => set({
        occasions: get().occasions.map((o) => {
          if (o.id !== id) return o;
          const { macros: _old, ...rest } = o;
          return macros ? { ...rest, macros } : rest;
        }),
      }),
      setSplitPreset: (p) => set({ splitPreset: p, targets: targetsFromSplit(get().targets.kcal, SPLIT_PRESETS[p].split) }),
      setTargetMode: (m) => set({ targetMode: m }),
      setBalancer: (b) => set({ balancer: b }),
      setStructure: (meals, snacks) => {
        const prev = get().occasions;
        const next = defaultOccasions(meals, snacks).map((o) => {
          const old = prev.find((p) => p.id === o.id);
          return old ? { ...o, prepped: old.prepped, ...(old.macros ? { macros: old.macros } : {}) } : o;
        });
        set({ meals, snacks, occasions: next });
      },
      updateOccasion: (id, patch) => set({ occasions: get().occasions.map((o) => (o.id === id ? { ...o, ...patch } : o)) }),
      set: (patch) => set(patch),
      setWish: (group, key, wish) => {
        const prefs = get().prefs;
        const g = { ...prefs[group] } as Record<string, Wish>;
        if (wish) g[key] = wish; else delete g[key];
        set({ prefs: { ...prefs, [group]: g } });
      },
      toggleLock: (id) => { const l = get().locked; set({ locked: l.includes(id) ? l.filter((x) => x !== id) : [...l, id] }); },
      setPantryAmount: (id, grams, useBy) => {
        const old = get().pantry.find((p) => p.ingredientId === id);
        const rest = get().pantry.filter((p) => p.ingredientId !== id);
        if (grams == null || grams <= 0) { set({ pantry: rest }); return; }
        const keep = useBy === undefined ? (old?.useBy ?? (grams === Infinity ? undefined : defaultUseBy(id))) : useBy ?? undefined;
        set({ pantry: [...rest, { ingredientId: id, grams, ...(keep && grams !== Infinity ? { useBy: keep } : {}) }] });
      },
      addToPantry: (id, grams) => {
        const old = get().pantry.find((p) => p.ingredientId === id);
        if (old?.grams === Infinity) return;
        get().setPantryAmount(id, (old?.grams ?? 0) + grams);
      },
      setPrice: (id, chain, price) => {
        const o = { ...get().priceOverrides };
        const row = { ...(o[id] ?? {}) };
        if (price === undefined) delete row[chain];
        else row[chain] = price === null ? null : { price, source: "manual", observedAt: new Date().toISOString() };
        o[id] = row;
        const history = { ...get().priceHistory };
        if (typeof price === "number") history[id] = [...(history[id] ?? []), { chain, price, on: isoDay(), source: "manual" as const }].slice(-30);
        set({ priceOverrides: o, priceHistory: history });
      },
      savePlan: (plan) => set({ current: plan, history: [plan, ...get().history.filter((h) => h.id !== plan.id)].slice(0, 20), checked: {} }),
      toggleChecked: (key) => set({ checked: { ...get().checked, [key]: !get().checked[key] } }),
      finishShopping: () => {
        // leftovers from the packages bought go into the pantry for next week
        const cur = get().current;
        if (!cur) return;
        const pantry = new Map(get().pantry.map((p) => [p.ingredientId, p.grams]));
        const useBy = new Map(get().pantry.map((p) => [p.ingredientId, p.useBy]));
        for (const u of cur.result.pantryUsed) {
          const g = pantry.get(u.ingredientId);
          if (g != null && g !== Infinity) pantry.set(u.ingredientId, Math.max(0, g - u.grams));
        }
        for (const l of cur.result.cart) if (l.leftoverGrams > 0) {
          pantry.set(l.ingredientId, (pantry.get(l.ingredientId) ?? 0) + l.leftoverGrams);
          // what's left of a fresh package keeps about as long as the package
          useBy.set(l.ingredientId, defaultUseBy(l.ingredientId));
        }
        set({
          pantry: [...pantry].filter(([, g]) => g > 0).map(([ingredientId, grams]) => {
            const u = useBy.get(ingredientId);
            return grams !== Infinity && u ? { ingredientId, grams, useBy: u } : { ingredientId, grams };
          }),
          checked: {},
        });
      },
      setTakeout: (day, occasionId, itemId) => {
        const rest = get().eatingOut.filter((e) => !(e.day === day && e.occasionId === occasionId));
        set({ eatingOut: itemId ? [...rest, { day, occasionId, itemId }] : rest });
      },
      addDeal: (d) => {
        const deals = get().deals.filter((x) => !(x.ingredientId === d.ingredientId && x.chain === d.chain));
        const history = { ...get().priceHistory };
        history[d.ingredientId] = [...(history[d.ingredientId] ?? []), { chain: d.chain, price: d.price, on: isoDay(), source: "sale" as const }].slice(-30);
        set({ deals: [...deals, { ...d, id: `${d.ingredientId}:${d.chain}:${Date.now()}`, addedOn: isoDay() }], priceHistory: history });
      },
      removeDeal: (id) => set({ deals: get().deals.filter((d) => d.id !== id) }),
      reset: () => set({ ...initial() }),
    }),
    {
      name: "prep-cart-v1",
      version: 1,
      storage: createJSONStorage(() => storage, { replacer: (_k, v) => (v === Infinity ? "__inf" : v), reviver: (_k, v) => (v === "__inf" ? Infinity : v) }),
      partialize: (s) => Object.fromEntries(Object.entries(s).filter(([, v]) => typeof v !== "function")) as Partial<AppState>,
    },
  ),
);

/** Weekly budget scaled to the planned days. */
export function periodBudget(s: Pick<AppState, "budget" | "days">): number {
  const weekly = s.budget.period === "month" ? s.budget.amount / (30.4 / 7) : s.budget.amount;
  return Math.round(((weekly * s.days) / 7) * 100) / 100;
}

export { encode, decode };
