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
  /** November 2026 visual redesign (skin v2). Mirrored in app/layout.tsx so the first paint is right. */
  redesign: { production: true, staging: true, development: true },
  /** "Plan next week" review: keep or swap each recipe, carry leftovers over, on in production since Nov 5 2026 */
  nextWeek: { production: true, staging: true, development: true },
  /** multi-week shopping calendar with bulk-buy hints, on in production since Nov 5 2026 */
  calendar: { production: true, staging: true, development: true },
  /** setup asks the person to rank about 10 options for breakfast, lunch and dinner, and snacks, on in production since Nov 5 2026 */
  mealRanking: { production: true, staging: true, development: true },
  /** per-meal styles (high-protein breakfast, lighter dinner...), meal edits that keep the meal's calories, macro locks shown up front */
  mealStyles: { production: false, staging: true, development: true },
  /** calories get a lock like protein, carbs and fat; all four locks shown up front with a one-line rule */
  macroLocks: { production: false, staging: true, development: true },
  /** Netflix-style recommendations from star ratings: yours, and everyone's via the database (staging first) */
  recommendations: { production: false, staging: true, development: true },
  /** Eat out, more: "plan takeout for me", chains near you, search and sort, cost against cooking, just-this-week takeout */
  eatOutPlus: { production: false, staging: true, development: true },
  /** prep day knows the kitchen (two oven racks, four burners), plus step-by-step cook mode with timers and storage notes */
  cookMode: { production: false, staging: true, development: true },
  /** in-store list: jump between aisles, "can't find it", and a buzz on each tick */
  aisleMode: { production: false, staging: true, development: true },
  /** pantry tracker: fridge/freezer/cupboard groups, quick amounts, savings, "cook from your pantry", per-item "have at home" on the list */
  pantryV2: { production: false, staging: true, development: true },
  /** "Whole foods only" switch, processed items named on recipes, meal preps filtered to fit your diet */
  wholeFoods: { production: false, staging: true, development: true },
  /** household members with their own protein goal, diet and allergies; shared recipes, extra ones only when needed */
  householdGoals: { production: false, staging: true, development: true },
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
  for (const part of (raw ?? "").split(",")) {
    const [raw, v] = part.split("=").map((x) => x?.trim().toLowerCase());
    // names are matched without case, so ?flags=nextweek=on and nextWeek=on both work
    const k = (Object.keys(FLAG_DEFAULTS) as Flag[]).find((f) => f.toLowerCase() === raw);
    if (!k) continue;
    if (v === "on" || v === "true" || v === "1") out[k] = true;
    else if (v === "off" || v === "false" || v === "0") out[k] = false;
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
