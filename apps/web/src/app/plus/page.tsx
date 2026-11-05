"use client";
import { useEffect, useState } from "react";
import { Check, Sparkles } from "lucide-react";
import { Card, PageHeader, Segmented, Toggle } from "@/components/ui";
import { PlusBadge } from "@/components/paywall";
import { useApp } from "@/lib/store";
import { useHydrated } from "@/lib/use-planner";
import { useFlag } from "@/lib/flags";
import { PLUS_FEATURES } from "@/lib/plus";
import { FEATURES, PLUS_PRICE, useSubscription, yearlySavings, type BillingInterval, type Feature, type FeatureId } from "@/lib/entitlements";

const FREE = ["Plans that hit your calories and macros within budget", "Shopping list by aisle and in-store mode", "Prep-day timeline and reminders", "Pantry, sales and price history", "Household plans, takeout, recipe import"];

export default function Plus() {
  const hydrated = useHydrated();
  const tier = useFlag("plusTier");
  if (!hydrated) return null;
  return tier ? <Upgrade /> : <Preview />;
}

const entries = () => Object.entries(FEATURES) as [FeatureId, Feature][];
const money = (n: number) => `$${n.toFixed(2)}`;
const longDate = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" });

/** The upgrade page: what's free, what Plus adds, and a test-mode upgrade. */
function Upgrade() {
  const sub = useSubscription();
  const [interval, setBilling] = useState<BillingInterval>("year");
  const [from, setFrom] = useState<FeatureId | null>(null);
  const [msg, setMsg] = useState("");
  useEffect(() => {
    const f = new URLSearchParams(location.search).get("from");
    if (f && f in FEATURES && FEATURES[f as FeatureId].tier === "plus") setFrom(f as FeatureId);
  }, []);
  const free = entries().filter(([, f]) => f.tier === "free");
  const plus = entries().filter(([, f]) => f.tier === "plus");
  const price = interval === "year" ? PLUS_PRICE.year : PLUS_PRICE.month;
  const isPlus = sub.tier === "plus";

  return (
    <>
      <PageHeader eyebrow={<PlusBadge />} title="MacroAisle Plus" lead="More for households and people who want everything tuned. Planning, swaps and your shopping list stay free for everyone." />
      <div className="grid max-w-[960px] gap-4">
        {isPlus && sub.since ? (
          <Card className="border-accent">
            <p className="flex items-center gap-2 font-semibold"><Sparkles size={18} className="text-accent" aria-hidden /> You have Plus</p>
            <p className="mt-1 text-sm text-muted">Test mode since {longDate(sub.since)}, billed {sub.interval === "year" ? "yearly" : "monthly"}. Nothing is charged while MacroAisle is in testing.</p>
            <button className="btn btn-sm mt-3" onClick={() => { sub.cancel(); setMsg("Plus is off. Everything you made with it is kept."); }}>Cancel Plus</button>
          </Card>
        ) : from ? (
          <Card className="border-accent">
            <p className="font-semibold">{FEATURES[from].title}</p>
            <p className="mt-1 text-sm text-muted">{FEATURES[from].blurb}</p>
          </Card>
        ) : null}
        {msg && <p role="status" className="text-sm text-muted">{msg}</p>}

        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <h2 className="label">Free</h2>
            <p className="font-display text-3xl font-bold">$0</p>
            <p className="text-sm text-muted">Forever. No card.</p>
            <ul className="mt-4 grid gap-2 text-sm">
              {free.map(([id, f]) => <li key={id} className="flex gap-2"><Check size={16} className="mt-0.5 shrink-0 text-accent" aria-hidden /> {f.title}</li>)}
              {plus.filter(([, f]) => f.freeLimit).map(([id, f]) => <li key={id} className="flex gap-2"><Check size={16} className="mt-0.5 shrink-0 text-accent" aria-hidden /> {id === "household" ? "Plans for you and 1 more person" : `${f.freeLimit} imported recipes`}</li>)}
            </ul>
          </Card>

          <Card className="border-accent">
            <h2 className="label flex items-center gap-1.5"><Sparkles size={14} className="text-accent" aria-hidden /> Plus</h2>
            <p className="font-display text-3xl font-bold">{money(price)}<span className="text-base font-medium text-muted"> / {interval}</span></p>
            <p className="text-sm text-muted">{interval === "year" ? `${money(PLUS_PRICE.year / 12)} a month, ${yearlySavings()}% less than monthly.` : "Cancel anytime."} Price not final.</p>
            <div className="mt-3">
              <Segmented size="sm" label="Billing" value={interval} onChange={setBilling} options={[{ value: "year", label: "Yearly" }, { value: "month", label: "Monthly" }]} />
            </div>
            <p className="mt-4 text-sm font-semibold">Everything in Free, plus:</p>
            <ul className="mt-2 grid gap-3 text-sm">
              {plus.map(([id, f]) => (
                <li key={id} className="flex gap-2">
                  <Check size={16} className="mt-0.5 shrink-0 text-accent" aria-hidden />
                  <span>
                    <span className="font-semibold">{f.title}</span>{f.status === "later" && <span className="ml-2 rounded-full border border-line px-2 py-0.5 text-[11px] text-muted">Coming later</span>}
                    <span className="block text-muted">{f.blurb}</span>
                  </span>
                </li>
              ))}
            </ul>
            {!isPlus && (
              <div className="mt-5 border-t border-line pt-4">
                <button className="btn btn-primary w-full" onClick={() => { sub.upgrade(interval); setMsg("Plus is on. Your Plus features are unlocked on this device."); }}>Start Plus (test mode)</button>
                <p className="mt-2 text-xs text-muted">Test mode: no card needed and nothing is charged. Payments open later.</p>
              </div>
            )}
          </Card>
        </div>

        <Card>
          <h2 className="font-display text-lg font-bold">Questions</h2>
          <dl className="mt-2 grid gap-3 text-sm">
            <div><dt className="font-semibold">What stays free?</dt><dd className="text-muted">Building a plan to your calories, macros and budget, swapping or skipping recipes, the shopping list and cart, in-store mode and prep day. Always.</dd></div>
            <div><dt className="font-semibold">What happens if I cancel?</dt><dd className="text-muted">Nothing you made is deleted. Extra household members and imported recipes stay in your plan; you just can't add more until you upgrade again.</dd></div>
            <div><dt className="font-semibold">Is anything charged now?</dt><dd className="text-muted">No. MacroAisle is in testing, so Plus is a free test switch on this device.</dd></div>
          </dl>
        </Card>
      </div>
    </>
  );
}

/** The page before the Plus tier: a preview of what's planned. Kept while the plusTier flag is off. */
function Preview() {
  const s = useApp();
  return (
    <>
      <PageHeader title="MacroAisle Plus" lead="The planned paid tier. Everything you use today stays free. Nothing is charged yet." />
      <div className="grid max-w-[960px] gap-4 md:grid-cols-2">
        <Card>
          <p className="label">Free</p>
          <p className="font-display text-2xl font-bold">$0</p>
          <ul className="mt-3 grid gap-1.5 text-sm">{FREE.map((f) => <li key={f} className="flex gap-2"><Check size={16} className="mt-0.5 shrink-0 text-accent" aria-hidden /> {f}</li>)}</ul>
        </Card>
        <Card className="border-accent">
          <p className="label flex items-center gap-1.5"><Sparkles size={14} aria-hidden /> Plus</p>
          <p className="font-display text-2xl font-bold">Price to be decided</p>
          <ul className="mt-3 grid gap-3 text-sm">
            {PLUS_FEATURES.map((f) => (
              <li key={f.id}>
                <p className="font-semibold">{f.title}</p>
                <p className="text-muted">{f.body}</p>
                <p className="mt-0.5 text-xs text-muted">Today: {f.today} To launch: {f.needs}</p>
              </li>
            ))}
          </ul>
          <div className="mt-4 border-t border-line pt-3">
            <Toggle checked={s.plusPreview} onChange={(plusPreview) => s.set({ plusPreview })} label="Preview Plus on this device" detail="Turns on Plus features as they become ready. Free while MacroAisle is in testing." />
          </div>
        </Card>
      </div>
    </>
  );
}
