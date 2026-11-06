"use client";
import { useEffect, useState } from "react";
import { APP_ENV } from "./env";

/**
 * Feature flags. Defaults live here, per environment. A build can override them with
 * NEXT_PUBLIC_FLAGS ("accounts=on,plus=off"), and anyone can try a flag on their own device
 * with ?flags=accounts=on in the address (saved on that device; ?flags=reset clears it).
 */
export const FLAG_DEFAULTS = {
  /** sign-in and cloud sync (sprint 2) */
  accounts: { production: true, staging: true, development: true },
  /** "Continue with Google" on the sign-in form; turn on once the Google provider is set up in Supabase */
  googleSignIn: { production: false, staging: false, development: false },
  /** Plus page (swaps are free for everyone) */
  plus: { production: true, staging: true, development: true },
  /** Plus tier: free vs Plus entitlements, paywalls and a test-mode upgrade (no real payments). See docs/payments.md */
  plusTier: { production: true, staging: true, development: true },
  /** November 2026 visual redesign (skin v2). Mirrored in app/layout.tsx so the first paint is right. */
  redesign: { production: true, staging: true, development: true },
  /** "Plan next week" review: keep or swap each recipe, carry leftovers over, on in production since Nov 5 2026 */
  nextWeek: { production: true, staging: true, development: true },
  /** multi-week shopping calendar with bulk-buy hints, on in production since Nov 5 2026 */
  calendar: { production: true, staging: true, development: true },
  /** setup asks the person to rank about 10 options for breakfast, lunch and dinner, and snacks, on in production since Nov 5 2026 */
  mealRanking: { production: true, staging: true, development: true },
  /** per-meal styles (high-protein breakfast, lighter dinner...), meal edits that keep the meal's calories, macro locks shown up front */
  mealStyles: { production: true, staging: true, development: true },
  /** calories get a lock like protein, carbs and fat; all four locks shown up front with a one-line rule */
  macroLocks: { production: true, staging: true, development: true },
  /** Netflix-style recommendations from star ratings: yours, and everyone's via the database (staging first) */
  recommendations: { production: true, staging: true, development: true },
  /** Eat out, more: "plan takeout for me", chains near you, search and sort, cost against cooking, just-this-week takeout */
  eatOutPlus: { production: true, staging: true, development: true },
  /** prep day knows the kitchen (two oven racks, four burners), plus step-by-step cook mode with timers and storage notes */
  cookMode: { production: true, staging: true, development: true },
  /** in-store list: jump between aisles, "can't find it", and a buzz on each tick */
  aisleMode: { production: true, staging: true, development: true },
  /** pantry tracker: fridge/freezer/cupboard groups, quick amounts, savings, "cook from your pantry", per-item "have at home" on the list */
  pantryV2: { production: true, staging: true, development: true },
  /** "Whole foods only" switch, processed items named on recipes, meal preps filtered to fit your diet */
  wholeFoods: { production: true, staging: true, development: true },
  /** household members with their own protein goal, diet and allergies; shared recipes, extra ones only when needed */
  householdGoals: { production: true, staging: true, development: true },
  /** price history from each shopping trip, deal and stock-up hints on Groceries and the calendar, plans lean on sales */
  priceTrends: { production: true, staging: true, development: true },
  /** training and rest days: workouts move calories to the days you train, plus workout file import */
  fitnessSync: { production: true, staging: true, development: true },
  /** recipe import v2: one box for a link or text, a bookmark for any site, smarter matching, edit, cost, add to plan */
  recipeImportV2: { production: true, staging: true, development: true },
  /** Costco and Sam's Club: club packs that count only the share a week uses, leftovers paid for in the pantry, 2 to 4 week bulk trips */
  bulkStores: { production: false, staging: true, development: true },
  /** first-time app tour: five stops over the real menu, shown once on Home after setup, replay from Settings */
  tour: { production: false, staging: true, development: true },
  /** anonymous usage analytics, when a PostHog key is set */
  analytics: { production: true, staging: true, development: false },
  /** error reports, when a Sentry DSN is set */
  errorReports: { production: true, staging: true, development: false },
} satisfies Record<string, Record<typeof APP_ENV, boolean>>;

export type Flag = keyof typeof FLAG_DEFAULTS;
const LOCAL_KEY = "prep-cart-flags";

/** Parses "a=on,b=off" into overrides; unknown flags and values are ignored. */
export function parseFlags(raw: string | null | undefined): Partial<Record<Flag, boolean>> {
  const out: Partial<Record<Flag, boolean>> = {};
  // names match in any case, so ?flags=plustier=on works as well as plusTier=on
  const names = new Map((Object.keys(FLAG_DEFAULTS) as Flag[]).map((f) => [f.toLowerCase(), f]));
  for (const part of (raw ?? "").split(",")) {
    const [k, v] = part.split("=").map((x) => x?.trim().toLowerCase());
    const name = k ? names.get(k) : undefined;
    if (!name) continue;
    if (v === "on" || v === "true" || v === "1") out[name] = true;
    else if (v === "off" || v === "false" || v === "0") out[name] = false;
  }
  return out;
}

const buildOverrides = parseFlags(process.env.NEXT_PUBLIC_FLAGS);

function deviceOverrides(): Partial<Record<Flag, boolean>> {
  if (typeof window === "undefined") return {};
  try {
    const q = new URLSearchParams(window.location.search).get("flags");
    if (q === "reset") localStorage.removeItem(LOCAL_KEY);
    else if (q) localStorage.setItem(LOCAL_KEY, JSON.stringify({ ...JSON.parse(localStorage.getItem(LOCAL_KEY) ?? "{}"), ...parseFlags(q) }));
    return JSON.parse(localStorage.getItem(LOCAL_KEY) ?? "{}") as Partial<Record<Flag, boolean>>;
  } catch { return {}; }
}

/** The flag's value now. Safe to call anywhere; on the server it ignores device overrides. */
export function flag(name: Flag): boolean {
  const device = deviceOverrides();
  return device[name] ?? buildOverrides[name] ?? FLAG_DEFAULTS[name][APP_ENV];
}

/** The flag in a component. Renders the build default first, then the device's value. */
export function useFlag(name: Flag): boolean {
  const [on, setOn] = useState(() => buildOverrides[name] ?? FLAG_DEFAULTS[name][APP_ENV]);
  useEffect(() => setOn(flag(name)), [name]);
  return on;
}
