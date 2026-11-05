"use client";
import { useEffect, useState } from "react";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { STORE_KEY } from "./env";
import { useFlag } from "./flags";
import { safeStorage } from "./storage";
import { track } from "./telemetry";

/**
 * Entitlements: which features are free and which are MacroAisle Plus.
 *
 * Everything that decides "can this person use X" goes through here, so moving a feature between
 * tiers is a one-line change in FEATURES. Behind the `plusTier` flag: with the flag off nothing is
 * gated and the app behaves as if this file didn't exist.
 *
 * There are no real payments yet. Upgrading is a test-mode switch saved on this device. When real
 * billing arrives (see docs/payments.md) only `useSubscription` changes: it will read the person's
 * subscription from Supabase, written there by the payment provider's webhook.
 */

export type Tier = "free" | "plus";
export type BillingInterval = "month" | "year";

export interface Feature {
  title: string;
  /** one line for the paywall and the upgrade page */
  blurb: string;
  tier: Tier;
  /** for Plus features with a free allowance: how many a free account gets */
  freeLimit?: number;
  /** "later" features are listed on the upgrade page but not built yet */
  status: "live" | "later";
}

/**
 * The core of the product is free and must stay free: planning to your macros and budget, swapping
 * and skipping recipes, the shopping list and cart, and shopping in the store. Gating Swap once left
 * testers stuck on the Plus page, so the free list is checked by a test.
 */
export const FEATURES = {
  planning: { title: "Plans that hit your calories, macros and budget", blurb: "", tier: "free", status: "live" },
  swaps: { title: "Swap or skip any recipe", blurb: "", tier: "free", status: "live" },
  groceries: { title: "Shopping list and cart, by aisle", blurb: "", tier: "free", status: "live" },
  inStore: { title: "In-store mode", blurb: "", tier: "free", status: "live" },
  prepDay: { title: "Prep-day timeline and reminders", blurb: "", tier: "free", status: "live" },
  nextWeek: { title: "Plan next week and shopping calendar", blurb: "", tier: "free", status: "live" },
  pantry: { title: "Pantry, sales and price history", blurb: "", tier: "free", status: "live" },
  recipes: { title: "137 recipes and ratings", blurb: "", tier: "free", status: "live" },
  eatOut: { title: "Mix takeout into your week", blurb: "", tier: "free", status: "live" },
  accountSync: { title: "Sign in and sync your devices", blurb: "", tier: "free", status: "live" },

  household: { title: "Household plans", blurb: "Cook for up to 6 people from one list, each with portions sized to their calories. Free covers you and one more person.", tier: "plus", freeLimit: 1, status: "live" },
  recipeImport: { title: "Unlimited recipe imports", blurb: "Bring in as many of your own recipes as you like. Free covers 3.", tier: "plus", freeLimit: 3, status: "live" },
  fitnessSync: { title: "Fitness app sync", blurb: "Set your calories from what Apple Health, Fitbit or MyFitnessPal measured instead of an estimate.", tier: "plus", status: "live" },
  aiSwaps: { title: "AI meal swaps", blurb: "Describe what you feel like and get a recipe written to fit your macros.", tier: "plus", status: "later" },
  livePrices: { title: "Live store prices", blurb: "Prices and stock from your own store, refreshed every week.", tier: "plus", status: "later" },
  moreStores: { title: "Every store near you", blurb: "Plan with Kroger, Target, Publix, Wegmans and more.", tier: "plus", status: "later" },
} satisfies Record<string, Feature>;

export type FeatureId = keyof typeof FEATURES;

/** Features that must never be gated. */
export const CORE_FREE: FeatureId[] = ["planning", "swaps", "groceries", "inStore"];

/**
 * Placeholder price. Not decided yet (open question in the investor kit). Comparable apps:
 * Eat This Much $59.99/yr, MyFitnessPal Premium $99/yr.
 */
export const PLUS_PRICE = { month: 4.99, year: 39.99, placeholder: true } as const;

export const yearlySavings = () => Math.round((1 - PLUS_PRICE.year / (PLUS_PRICE.month * 12)) * 100);

export interface Subscription {
  tier: Tier;
  interval: BillingInterval | null;
  /** "test" is the only source today; "stripe" (or similar) once real payments exist */
  source: "test" | null;
  /** YYYY-MM-DD the subscription started */
  since: string | null;
}

export const FREE_SUB: Subscription = { tier: "free", interval: null, source: null, since: null };

/** Starts Plus in test mode. Nothing is charged. */
export function startTestPlus(interval: BillingInterval, now = new Date()): Subscription {
  return { tier: "plus", interval, source: "test", since: now.toISOString().slice(0, 10) };
}

/** Whether a tier may use a feature. With gating off everything is allowed. */
export function entitled(feature: FeatureId, tier: Tier, gating = true): boolean {
  if (!gating) return true;
  const f: Feature = FEATURES[feature];
  return f.tier === "free" || tier === "plus" || (f.freeLimit ?? 0) > 0;
}

/** How many of something a tier may have (household members, imported recipes). Infinity when unlimited. */
export function limitFor(feature: FeatureId, tier: Tier, gating = true): number {
  const f: Feature = FEATURES[feature];
  if (!gating || f.tier === "free" || tier === "plus") return Infinity;
  return f.freeLimit ?? 0;
}

/** Whether one more is allowed, given how many the person already has. */
export function canAddMore(feature: FeatureId, have: number, tier: Tier, gating = true): boolean {
  return have < limitFor(feature, tier, gating);
}

/* ── state on this device (test mode) ── */

interface SubState extends Subscription {
  upgrade: (interval: BillingInterval) => void;
  cancel: () => void;
}

export const useSubscription = create<SubState>()(
  persist(
    (set) => ({
      ...FREE_SUB,
      upgrade: (interval) => { set(startTestPlus(interval)); track("plus_upgrade", { interval, mode: "test" }); },
      cancel: () => { set(FREE_SUB); track("plus_cancel", { mode: "test" }); },
    }),
    { name: `${STORE_KEY}:plus`, storage: createJSONStorage(() => safeStorage), version: 1 },
  ),
);

/** Everything a component needs to gate a feature. */
export function useEntitlements() {
  const gating = useFlag("plusTier");
  const tier = useSubscription((s) => s.tier);
  // the saved tier loads after the first paint; until then treat the person as free but don't gate
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  const on = gating && ready;
  return {
    /** whether the Plus tier is switched on at all */
    gating: on,
    tier,
    isPlus: tier === "plus",
    can: (f: FeatureId) => entitled(f, tier, on),
    limit: (f: FeatureId) => limitFor(f, tier, on),
    canAdd: (f: FeatureId, have: number) => canAddMore(f, have, tier, on),
  };
}
