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
  accounts: { production: false, staging: true, development: true },
  /** Plus page and smart swaps preview */
  plus: { production: true, staging: true, development: true },
  /** November 2026 visual redesign (skin v2). Mirrored in app/layout.tsx so the first paint is right. */
  redesign: { production: false, staging: true, development: true },
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
    const [k, v] = part.split("=").map((x) => x?.trim().toLowerCase());
    if (!k || !(k in FLAG_DEFAULTS)) continue;
    if (v === "on" || v === "true" || v === "1") out[k as Flag] = true;
    else if (v === "off" || v === "false" || v === "0") out[k as Flag] = false;
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
