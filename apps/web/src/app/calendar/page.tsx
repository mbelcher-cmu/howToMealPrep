"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { CalendarDays, ChefHat, Package, ShoppingCart, Snowflake } from "lucide-react";
import { INGREDIENTS, shelfLifeDays } from "@prep-cart/catalog";
import { buildPriceTable } from "@prep-cart/planner";
import { ItemArt } from "@/components/food";
import { usualPrice } from "@/components/deals";
import { SolvingNote } from "@/components/plan-bits";
import { Card, EmptyState, PageHeader, Segmented, SectionTitle } from "@/components/ui";
import { addDaysIso, shoppingCalendar, type CalendarItem, type Trip } from "@/lib/calendar";
import { isoDay, useApp } from "@/lib/store";
import { useHydrated, usePlanner } from "@/lib/use-planner";
import { useWeek } from "@/lib/use-week";
import { useFlag } from "@/lib/flags";
import { chainName, cx, money, plural } from "@/lib/format";

/** Raw meat and fish: bought fresh each trip, and any extra goes in the freezer. */
const FREEZER_DAYS = 90;
const WEEK_OPTIONS = [
  { value: "2", label: "2 weeks" },
  { value: "3", label: "3 weeks" },
  { value: "4", label: "4 weeks" },
];

const keepsLabel = (days: number) => (days >= 300 ? "keeps a year" : days >= 60 ? `keeps ${Math.round(days / 30)} months` : `keeps ${Math.round(days / 7)} weeks`);
const shortDate = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" });
const weekday = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString(undefined, { weekday: "short" });

export default function CalendarPage() {
  const hydrated = useHydrated();
  const on = useFlag("calendar");
  const { plan } = usePlanner();
  const s = useApp();
  const week = useWeek();
  const [weeks, setWeeks] = useState("4");
  const [picked, setPicked] = useState(0);

  const items = useMemo<CalendarItem[]>(() => {
    if (!plan) return [];
    const r = plan.result;
    const staples = new Set((s.pantryForPlan ?? s.pantry).filter((p) => p.grams === Infinity).map((p) => p.ingredientId));
    const fromHome = new Map(r.pantryUsed.filter((u) => !staples.has(u.ingredientId)).map((u) => [u.ingredientId, u.grams]));
    const prices = buildPriceTable(s.priceOverrides);
    const out: CalendarItem[] = [];
    const seen = new Set<string>();
    const add = (id: string, chain: string, price: number, extra: Partial<CalendarItem> = {}) => {
      const ing = INGREDIENTS[id];
      if (!ing || seen.has(id)) return;
      seen.add(id);
      const meat = ing.aisle === "Meat and seafood";
      const need = r.cart.filter((l) => l.ingredientId === id).reduce((a, l) => a + l.needGrams, 0);
      out.push({
        id, name: ing.name, aisle: ing.aisle, pkgGrams: ing.pkg.grams, pkgLabel: ing.pkg.label, chain, price,
        weeklyGrams: need + (fromHome.get(id) ?? 0), onHand: fromHome.get(id) ?? 0,
        keepsDays: meat ? FREEZER_DAYS : shelfLifeDays(id), ...(meat ? { stockUp: false } : {}), ...extra,
      });
    };
    for (const l of r.cart) {
      if (l.priceSource !== "sale") { add(l.ingredientId, l.chain, l.unitPrice); continue; }
      const regular = usualPrice(l.ingredientId, l.chain, s.priceOverrides);
      const deal = s.deals.find((d) => d.ingredientId === l.ingredientId && d.chain === l.chain);
      add(l.ingredientId, l.chain, l.unitPrice, { ...(regular ? { regular } : {}), ...(deal ? { saleEndsOn: deal.endsOn } : {}) });
    }
    // food the plan takes from home this week still has to be bought in later weeks
    for (const [id] of fromHome) {
      const best = r.stores.map((c) => ({ c, q: prices[id]?.[c] })).filter((x) => x.q).sort((a, b) => a.q!.price - b.q!.price)[0];
      if (best) add(id, best.c, best.q!.price);
    }
    return out;
  }, [plan, s.pantry, s.pantryForPlan, s.priceOverrides, s.deals]);

  // shop and cook the day before each plan week starts
  const firstTrip = addDaysIso(week.start, -1);
  const cal = useMemo(() => shoppingCalendar(items, { weeks: Number(weeks), start: firstTrip, tripDays: plan?.days ?? 7 }), [items, weeks, firstTrip, plan?.days]);

  if (!hydrated) return null;
  if (!on) return (<><PageHeader title="Shopping calendar" /><EmptyState title="Not switched on yet">The shopping calendar is being tested on the staging site first.</EmptyState></>);
  if (!plan) return (<><PageHeader title="Shopping calendar" /><EmptyState title="No plan yet">Your shopping calendar appears here once a plan is ready.</EmptyState></>);

  const n = Number(weeks);
  const budget = plan.result.budget;
  const trip = cal.trips[Math.min(picked, n - 1)]!;
  const byId = new Map(items.map((i) => [i.id, i]));
  const stockUps = cal.items.filter((p) => p.kind === "stockUp" && (p.buysWeekly > p.buys || p.saved > 0));
  const spoils = cal.items.filter((p) => p.wasteCost >= 0.25).sort((a, b) => b.wasteCost - a.wasteCost);
  const sessions = plan.schedule.sessions;
  const today = isoDay();

  // calendar cells: each row starts on a shopping day
  const rows = cal.trips.map((t) => Array.from({ length: 7 }, (_, d) => addDaysIso(t.date, d)));
  const tripOn = new Map(cal.trips.map((t) => [t.date, t]));
  const prepOn = new Set(cal.trips.flatMap((t) => sessions.map((x) => addDaysIso(t.date, x.beforeDay))));

  return (
    <>
      <PageHeader
        title="Shopping calendar"
        lead="Your plan carried over the next few weeks: one trip a week, stocking up on food that keeps so later trips are just fresh food."
        action={<SolvingNote />}
      />
      <div className="mb-4 max-w-sm">
        <Segmented label="How far ahead" value={weeks} options={WEEK_OPTIONS} onChange={(v) => { setWeeks(v); setPicked(0); }} size="sm" />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="grid min-w-0 content-start gap-4">
          <Card>
            <SectionTitle aside={<span className="num text-sm text-muted">{money(cal.total)} total</span>}>{shortDate(cal.trips[0]!.date)} to {shortDate(addDaysIso(cal.trips[n - 1]!.date, 6))}</SectionTitle>
            <div role="grid" aria-label="Shopping calendar" className="grid gap-1.5">
              <div role="row" className="grid grid-cols-7 gap-1.5">
                {rows[0]!.map((d) => <div role="columnheader" key={d} className="label text-center">{weekday(d)}</div>)}
              </div>
              {rows.map((row, ri) => (
                <div role="row" key={row[0]} className="grid grid-cols-7 gap-1.5">
                  {row.map((d) => {
                    const t = tripOn.get(d);
                    const prep = prepOn.has(d);
                    const past = d < today;
                    const content = (
                      <>
                        <span className={cx("num block text-xs", d === today ? "font-bold text-accent" : "text-muted")}>{shortDate(d).replace(/^\w+ /, "")}</span>
                        {t && (
                          <span className={cx("mt-1 flex items-center gap-1 rounded-md px-1 py-0.5 text-[11px] font-semibold leading-tight", t.stockUpCost > 0 ? "bg-accent text-accent-ink" : "bg-sunk text-ink")}>
                            <ShoppingCart size={11} aria-hidden className="hidden shrink-0 sm:block" /><span className="num truncate">{money(t.cost).replace(/\.\d\d$/, "")}</span>
                          </span>
                        )}
                        {prep && <span className="mt-1 flex items-center gap-1 text-[11px] text-muted"><ChefHat size={11} aria-hidden className="shrink-0" /><span className="hidden sm:inline">Prep</span></span>}
                      </>
                    );
                    return (
                      <div role="gridcell" key={d} className={cx("min-h-[64px] rounded-lg border p-1 sm:min-h-[76px] sm:p-1.5", past && "opacity-50", d === today ? "border-accent" : "border-line", t && ri === picked && "ring-2 ring-accent")}>
                        {t ? (
                          <button className="block h-full w-full text-left" onClick={() => setPicked(t.index)} aria-label={`Trip ${t.index + 1} on ${shortDate(d)}: ${money(t.cost)}${t.stockUpCost > 0 ? ", stock-up trip" : ""}`} aria-pressed={ri === picked}>{content}</button>
                        ) : content}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
            <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
              <span className="flex items-center gap-1"><span className="inline-block h-3 w-3 rounded bg-accent" /> Stock-up trip</span>
              <span className="flex items-center gap-1"><span className="inline-block h-3 w-3 rounded bg-sunk" /> Fresh-food trip</span>
              <span className="flex items-center gap-1"><ChefHat size={12} aria-hidden /> Prep day</span>
            </p>
          </Card>

          <TripCard trip={trip} budget={budget} byId={byId} weeks={n} />
        </div>

        <aside className="grid content-start gap-4 lg:sticky lg:top-6 lg:self-start">
          <Card>
            <SectionTitle>{n} weeks at a glance</SectionTitle>
            <ul className="grid gap-2">
              {cal.trips.map((t) => (
                <li key={t.index}>
                  <button onClick={() => setPicked(t.index)} className={cx("w-full rounded-lg px-2 py-1.5 text-left hover:bg-sunk", t.index === picked && "bg-sunk")}>
                    <span className="flex justify-between text-sm"><span>{weekday(t.date)} {shortDate(t.date)}</span><span className="num font-semibold">{money(t.cost)}</span></span>
                    <span className="mt-1 block h-1.5 rounded-full bg-sunk"><span className={cx("block h-full rounded-full", t.cost > budget ? "bg-warn" : "bg-accent")} style={{ width: `${Math.min(100, (t.cost / Math.max(1, budget, ...cal.trips.map((x) => x.cost))) * 100)}%` }} /></span>
                  </button>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-sm text-muted">
              About {money(cal.total / n)} a week against your {money(budget)} budget.
              {cal.trips[0]!.cost > budget && cal.total <= budget * n && " The first trip runs over because it stocks up, and the later ones make it back."}
            </p>
            <dl className="mt-3 grid grid-cols-2 gap-3 border-t border-line pt-3 text-sm">
              <div><dt className="text-muted">Fewer pickups</dt><dd className="num font-semibold">{plural(cal.pickupsSaved, "item")}</dd></div>
              {cal.saved > 0 && <div><dt className="text-muted">Saved on sales</dt><dd className="num font-semibold text-accent">{money(cal.saved)}</dd></div>}
              {cal.wasteCost > 0 && <div><dt className="text-muted">Likely to spoil</dt><dd className="num font-semibold">{money(cal.wasteCost)}</dd></div>}
            </dl>
          </Card>

          {stockUps.length > 0 && (
            <Card>
              <SectionTitle>Worth buying in bulk</SectionTitle>
              <ul className="grid gap-3">
                {stockUps.map((p) => {
                  const it = byId.get(p.id)!;
                  return (
                    <li key={p.id} className="flex items-start gap-2.5">
                      <ItemArt ingredientId={p.id} className="h-10 w-10 shrink-0" />
                      <span className="min-w-0 text-sm">
                        <span className="block font-medium leading-snug">{it.name}</span>
                        <span className="block text-xs text-muted">
                          {p.packages} × {it.pkgLabel} at {chainName(it.chain as never)} · {keepsLabel(it.keepsDays)}
                          {p.buysWeekly > p.buys && <> · one trip instead of {p.buysWeekly}</>}
                          {p.saved > 0 && <> · saves {money(p.saved)} while it&apos;s on sale</>}
                        </span>
                      </span>
                    </li>
                  );
                })}
              </ul>
              <p className="mt-3 text-xs text-muted">Pick these up on the first trip. Warehouse-size packs (Costco, Sam&apos;s Club) are coming later.</p>
            </Card>
          )}

          {spoils.length > 0 && (
            <Card>
              <SectionTitle>Might go to waste</SectionTitle>
              <ul className="grid gap-2 text-sm">
                {spoils.slice(0, 5).map((p) => {
                  const it = byId.get(p.id)!;
                  return <li key={p.id}><span className="font-medium">{it.name}</span><span className="block text-xs text-muted">The plan uses part of each {it.pkgLabel}; about {money(p.wasteCost)} over {n} weeks won&apos;t keep until the next trip.</span></li>;
                })}
              </ul>
            </Card>
          )}

          <p className="flex gap-2 px-1 text-xs text-muted"><Snowflake size={14} aria-hidden className="mt-0.5 shrink-0" /> Raw meat and fish are bought fresh each trip; freeze anything left over and the next trip buys less.</p>
          <p className="px-1 text-xs text-muted">This assumes you keep this week&apos;s menu. When you <Link href="/next-week/" className="underline">plan next week</Link> with new recipes, the calendar updates. This week&apos;s list is on <Link href="/groceries/" className="underline">Groceries</Link>.</p>
        </aside>
      </div>
    </>
  );
}

function TripCard({ trip, budget, byId, weeks }: { trip: Trip; budget: number; byId: Map<string, CalendarItem>; weeks: number }) {
  const stock = trip.lines.filter((l) => l.stockUp);
  const fresh = trip.lines.filter((l) => !l.stockUp);
  const Section = ({ title, lead, lines }: { title: string; lead: string; lines: Trip["lines"] }) => (
    <div>
      <h3 className="label">{title}</h3>
      <p className="mb-1 text-xs text-muted">{lead}</p>
      <ul className="divide-y divide-line">
        {lines.map((l) => {
          const it = byId.get(l.id)!;
          return (
            <li key={l.id} className="flex items-center gap-2.5 py-2">
              <ItemArt ingredientId={l.id} className="h-10 w-10 shrink-0" />
              <span className="min-w-0 flex-1">
                <span className="block font-medium leading-snug">{it.name}</span>
                <span className="block text-xs text-muted">{l.packages} × {it.pkgLabel} · {chainName(it.chain as never)}</span>
              </span>
              <span className="num shrink-0 text-sm font-semibold">{money(l.cost)}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
  return (
    <Card>
      <SectionTitle aside={<span className={cx("num text-sm font-semibold", trip.cost > budget && "text-warn")}>{money(trip.cost)}</span>}>
        <span className="flex items-center gap-2"><CalendarDays size={18} aria-hidden /> Trip {trip.index + 1}: {new Date(`${trip.date}T12:00:00`).toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" })}</span>
      </SectionTitle>
      {trip.lines.length === 0 ? (
        <p className="flex items-center gap-2 text-sm text-muted"><Package size={16} aria-hidden /> Nothing to buy: everything for this week is already at home.</p>
      ) : (
        <div className="grid gap-4">
          {stock.length > 0 && <Section title="Stock up" lead={`Keeps, so this covers up to ${plural(weeks - trip.index, "week")}.`} lines={stock} />}
          {fresh.length > 0 && <Section title={stock.length ? "Fresh this week" : "This week"} lead="Fresh food, plus anything that ran out." lines={fresh} />}
        </div>
      )}
    </Card>
  );
}
