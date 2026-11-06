"use client";
import { CalendarDays } from "lucide-react";
import { Chip, Segmented, Toggle } from "@/components/ui";
import { isoDay, useApp } from "@/lib/store";
import { FRESH_DAYS, longestWait, shopChoices, shopDateOf, startPatch, suggestedCookDays } from "@/lib/shop-day";
import { cookStarts } from "@prep-cart/planner";
import { DAY_LONG } from "@/lib/format";

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;

/** "Different food each cook day" is on when every cook day gets its own lunch-and-dinner recipe. */
export const freshMenusOn = (v: { main: number; rotation?: string }, cookDays: number) => cookDays >= 2 && v.rotation === "blocks" && v.main >= cookDays;

/**
 * When the person shops, how many days they prep for and how often they cook. A plan starts on
 * the shopping day (or the day after), so someone who opens the app on a Thursday can shop and
 * start that day instead of waiting for a fixed Monday.
 */
export function ShoppingDayEditor({ compact = false }: { compact?: boolean }) {
  const s = useApp();
  const today = isoDay();
  const choices = shopChoices(today);
  const sameDay = s.shopSameDay ?? true;
  const shopOn = s.weekOf ? shopDateOf(s.weekOf, sameDay) : null;
  const picked = shopOn && shopOn >= today ? shopOn : null;
  const days = s.days;
  const cookDays = Math.max(1, Math.min(3, s.cookDays ?? 1));
  const wait = longestWait(days, cookDays);
  const starts = cookStarts(days, cookDays);
  const startDay = s.weekStart ?? 0;
  const cookName = (d: number) => DAY_LONG[(startDay + d + (sameDay ? 0 : 6)) % 7]!;

  const pickShop = (iso: string) => s.set(startPatch(iso, sameDay));
  const pickSame = (v: "same" | "next") => s.set(startPatch(picked ?? today, v === "same"));
  const pickDays = (n: number) => {
    const k = suggestedCookDays(n);
    // a new cook count keeps "different food each cook day" in step
    const on = k >= 2 && (freshMenusOn(s.variety, cookDays) || cookDays < 2);
    s.set({ days: n, cookDays: k, variety: menusFor(s.variety, k, on) });
  };
  const pickCook = (k: number) => s.set({ cookDays: k, variety: menusFor(s.variety, k, k >= 2 && (freshMenusOn(s.variety, cookDays) || cookDays < 2)) });
  const menus = freshMenusOn(s.variety, cookDays);

  return (
    <div className="grid gap-4">
      <div className="grid gap-1.5">
        <span id="shop-when" className="text-[13px] text-muted">When will you go grocery shopping?</span>
        <div className="flex flex-wrap gap-2" role="group" aria-labelledby="shop-when">
          {choices.map((c) => (
            <Chip key={c.iso} selected={picked === c.iso} onClick={() => pickShop(c.iso)} title={c.long}>{c.label}</Chip>
          ))}
        </div>
      </div>
      <div className="grid gap-1.5">
        <span className="text-[13px] text-muted">Start eating your prep</span>
        <Segmented size="sm" label="Start eating your prep" value={sameDay ? "same" : "next"} onChange={pickSame}
          options={[{ value: "same", label: "Same day" }, { value: "next", label: "Next day" }]} />
      </div>
      <div className="grid gap-1.5 border-t border-line pt-4">
        <span className="text-[13px] text-muted">How many days do you want to prep for?</span>
        <Segmented size="sm" label="Days to prep for" value={String(days)} onChange={(v) => pickDays(Number(v))}
          options={[2, 3, 4, 5, 6, 7].map((n) => ({ value: String(n), label: String(n) }))} />
        {!compact && <p className="text-xs text-muted">Cooked food tastes best within {FRESH_DAYS} days. Longer than that and we split your cooking so nothing sits too long.</p>}
      </div>
      {days >= 3 && (
        <div className="grid gap-1.5">
          <span className="text-[13px] text-muted">How many times do you want to cook?</span>
          <Segmented size="sm" label="Cook days" value={String(cookDays)} onChange={(v) => pickCook(Number(v))}
            options={[1, 2, 3].filter((k) => k <= Math.max(1, Math.floor(days / 2))).map((k) => ({ value: String(k), label: k === 1 ? "Once" : k === 2 ? "Twice" : "3 times" }))} />
          <p className="flex items-start gap-1.5 text-xs text-muted">
            <CalendarDays size={14} className="mt-0.5 shrink-0" aria-hidden />
            <span>
              {picked || s.weekOf ? <>Cook on {starts.map((d) => cookName(d)).join(" and ")}. </> : null}
              {wait <= FRESH_DAYS ? <>Nothing waits more than {plural(wait, "day")} in the fridge.</> : <>Some meals wait {plural(wait, "day")} in the fridge; freezer-friendly recipes help, or cook twice.</>}
            </span>
          </p>
        </div>
      )}
      {cookDays >= 2 && (
        <Toggle checked={menus} onChange={(on) => s.set({ variety: menusFor(s.variety, cookDays, on) })}
          label="Different food each cook day" detail={menus ? "Each cook day gets its own lunch, dinner and breakfast recipes." : "The same recipes all period, cooked fresh each time."} />
      )}
    </div>
  );
}

/** Variety for "different food each cook day": one lunch-and-dinner (and breakfast) recipe per cook day, in blocks. */
export function menusFor<V extends { breakfast: number; main: number; snack: number; rotation?: "mix" | "blocks" }>(v: V, cookDays: number, on: boolean): V {
  if (on && cookDays >= 2) return { ...v, main: Math.max(cookDays, Math.min(v.main, 3)), breakfast: Math.max(v.breakfast, Math.min(cookDays, 3)), rotation: "blocks" };
  return { ...v, main: v.rotation === "blocks" ? 2 : v.main, breakfast: Math.min(v.breakfast, 1) || 1, rotation: "mix" };
}
