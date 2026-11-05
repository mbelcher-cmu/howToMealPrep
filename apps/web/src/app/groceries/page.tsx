"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { CalendarDays, Check, Copy, ExternalLink, House, PackageCheck, Store } from "lucide-react";
import { CHAINS, formatAmount, formatUseAndLeftover, INGREDIENTS, type Aisle, type ChainId } from "@prep-cart/catalog";
import type { CartLine } from "@prep-cart/planner";
import { BudgetBar, PlanStatus, SolvingNote } from "@/components/plan-bits";
import { ItemArt } from "@/components/food";
import { NearbyFinder } from "@/components/nearby";
import { Card, EmptyState, PageHeader, SectionTitle, Tag } from "@/components/ui";
import { useApp } from "@/lib/store";
import { useHydrated, usePlanner } from "@/lib/use-planner";
import { chainName, cx, money } from "@/lib/format";
import { aisleOrderFor } from "@/lib/aisles";
import { useFlag } from "@/lib/flags";

const SOURCE_LABEL = { estimate: "Estimate", receipt: "Receipt", manual: "Your price", live: "Live", sale: "On sale" } as const;
const lineKey = (l: CartLine) => `${l.chain}:${l.ingredientId}`;

export default function Groceries() {
  const hydrated = useHydrated();
  const { plan } = usePlanner();
  const s = useApp();
  const [copied, setCopied] = useState(false);
  const nextWeekOn = useFlag("nextWeek");
  const calendarOn = useFlag("calendar");
  const pantryOn = useFlag("pantryV2");
  const done = !!s.current && s.shoppedPlanId === s.current.id;

  const byStore = useMemo(() => {
    const m = new Map<ChainId, Map<Aisle, CartLine[]>>();
    for (const l of plan?.result.cart ?? []) {
      const ing = INGREDIENTS[l.ingredientId];
      if (!ing) continue;
      const store = m.get(l.chain) ?? new Map<Aisle, CartLine[]>();
      const list = store.get(ing.aisle) ?? [];
      list.push(l);
      store.set(ing.aisle, list);
      m.set(l.chain, store);
    }
    for (const store of m.values()) for (const list of store.values()) list.sort((a, b) => INGREDIENTS[a.ingredientId]!.name.localeCompare(INGREDIENTS[b.ingredientId]!.name));
    return m;
  }, [plan]);

  if (!hydrated) return null;
  if (!plan) return (<><PageHeader title="Groceries" /><EmptyState title="No plan yet">Your shopping list appears here once a plan is ready.</EmptyState></>);

  const r = plan.result;
  const total = r.cart.length;
  const got = r.cart.filter((l) => s.checked[lineKey(l)]).length;
  // food the plan takes from home (staples left out), shown on each line it shortens
  const staples = new Set((s.pantryForPlan ?? s.pantry).filter((p) => p.grams === Infinity).map((p) => p.ingredientId));
  const fromHome = new Map(r.pantryUsed.filter((u) => !staples.has(u.ingredientId) && u.grams > 0).map((u) => [u.ingredientId, u.grams]));

  const copy = async () => {
    const text = [...byStore].map(([chain, aisles]) =>
      [`${chainName(chain)}`, ...aisleOrderFor(chain, s.aisleOrder).filter((a) => aisles.has(a)).flatMap((a) => [`  ${a}`, ...aisles.get(a)!.map((l) => `  [ ] ${INGREDIENTS[l.ingredientId]!.name}: ${l.packages} × ${INGREDIENTS[l.ingredientId]!.pkg.label} (${money(l.cost)})`)])].join("\n"),
    ).join("\n\n") + `\n\nTotal about ${money(r.cost)}`;
    try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { setCopied(false); }
  };

  return (
    <>
      <PageHeader title="Groceries" lead="Your in-store list, sorted by aisle. Tick items as they go in the cart. Tap the house if you already have something at home and the plan drops it." action={<SolvingNote />} />
      <PlanStatus />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="grid min-w-0 grid-cols-1 content-start gap-4">
          {[...byStore].map(([chain, aisles]) => {
            const c = CHAINS.find((x) => x.id === chain)!;
            return (
              <Card key={chain}>
                <SectionTitle aside={<span className="num text-sm text-muted">{money(r.cart.filter((l) => l.chain === chain).reduce((a, l) => a + l.cost, 0))}</span>}>{c.name}</SectionTitle>
                <div className="grid gap-4">
                  {aisleOrderFor(chain, s.aisleOrder).filter((a) => aisles.has(a)).map((a) => (
                    <div key={a}>
                      <h3 className="label mb-1">{a}</h3>
                      <ul className="divide-y divide-line">
                        {aisles.get(a)!.map((l) => {
                          const ing = INGREDIENTS[l.ingredientId]!;
                          const k = lineKey(l);
                          const on = !!s.checked[k];
                          return (
                            <li key={k} className="flex items-center gap-2 py-2 sm:gap-3">
                              <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2.5 sm:gap-3">
                                <input type="checkbox" checked={on} onChange={() => s.toggleChecked(k)} className="peer sr-only" />
                                <span aria-hidden className={cx("grid h-6 w-6 shrink-0 place-items-center rounded-md border-2 peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-accent", on ? "border-accent bg-accent text-accent-ink" : "border-line")}>
                                  {on && <Check size={14} strokeWidth={3} />}
                                </span>
                                <ItemArt ingredientId={ing.id} className={cx("h-11 w-11 sm:h-[52px] sm:w-[52px]", on && "opacity-50")} />
                                <span className={cx("min-w-0", on && "text-muted line-through")}>
                                  <span className="block font-medium">{ing.name}</span>
                                  <span className="block text-xs text-muted">
                                    {(() => { const u = formatUseAndLeftover(ing.id, l.needGrams, l.leftoverGrams, s.profile.units); return <>{l.packages} × {ing.pkg.label} · recipes use {u.use}{u.left && <> · {u.left} left over</>}{pantryOn && fromHome.has(ing.id) && <> · <span className="font-semibold text-accent">{formatAmount(ing.id, fromHome.get(ing.id)!, s.profile.units)} from home</span></>}</>; })()}
                                  </span>
                                </span>
                              </label>
                              <div className="shrink-0 text-right">
                                <div className="num text-sm font-semibold">{money(l.cost)}</div>
                                <div className="hidden text-[11px] text-muted sm:block">{l.packages > 1 && `${money(l.unitPrice)} ea · `}{SOURCE_LABEL[l.priceSource]}</div>
                              </div>
                              <button className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-muted hover:bg-sunk hover:text-ink" title="I already have this" aria-label={`I already have ${ing.name}`}
                                onClick={() => s.addToPantry(ing.id, l.needGrams)}>
                                <House size={16} aria-hidden />
                              </button>
                              <a href={c.search(ing.name)} target="_blank" rel="noreferrer" className="hidden h-9 w-9 shrink-0 place-items-center rounded-lg text-muted hover:bg-sunk hover:text-ink sm:grid" aria-label={`Look up ${ing.name} at ${c.name} (opens new tab)`}>
                                <ExternalLink size={16} aria-hidden />
                              </a>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  ))}
                </div>
              </Card>
            );
          })}
          {r.pantryUsed.length > 0 && (
            <Card>
              <SectionTitle>Already in your pantry</SectionTitle>
              <ul className="flex flex-wrap gap-2">
                {r.pantryUsed.map((u) => <li key={u.ingredientId}><Tag>{INGREDIENTS[u.ingredientId]?.name ?? u.ingredientId}{pantryOn && fromHome.has(u.ingredientId) && `: ${formatAmount(u.ingredientId, u.grams, s.profile.units)}`}</Tag></li>)}
              </ul>
            </Card>
          )}
        </div>

        <aside className="grid content-start gap-4 lg:sticky lg:top-6 lg:self-start">
          <Card>
            <SectionTitle>Total</SectionTitle>
            <BudgetBar cost={r.cost} budget={r.budget} takeout={r.takeout?.cost ?? 0} />
            <p className="mt-3 text-sm text-muted">{got} of {total} in the cart</p>
            <div className="mt-1 h-1.5 rounded-full bg-sunk"><div className="h-full rounded-full bg-accent" style={{ width: `${total ? (got / total) * 100 : 0}%` }} /></div>
            <div className="mt-4 grid gap-2">
              <Link href="/shop/" className="btn btn-primary"><Store size={16} aria-hidden /> Start in-store mode</Link>
              <button className="btn" onClick={copy}>{copied ? <><Check size={16} aria-hidden /> Copied</> : <><Copy size={16} aria-hidden /> Copy list</>}</button>
              <button className="btn" onClick={() => s.finishShopping()} disabled={done}>
                <PackageCheck size={16} aria-hidden /> {done ? "Leftovers saved to pantry" : "Done shopping"}
              </button>
            </div>
            {done
              ? (nextWeekOn
                ? <Link href="/next-week/" className="btn btn-primary mt-2 w-full">Plan next week</Link>
                : <button className="btn btn-primary mt-2 w-full" onClick={() => s.planNextWeek()}>Plan next week</button>)
              : null}
            <p className="mt-3 text-xs text-muted">{done ? "Your leftovers are in the pantry. This week's plan stays as it is until you plan next week." : "Done shopping moves what's left of each package into your pantry, so next week's plan uses it first."}</p>
          </Card>
          {calendarOn && (
            <Link href="/calendar/" className="card flex items-center gap-3 p-4 hover:bg-sunk">
              <CalendarDays size={20} className="shrink-0 text-accent" aria-hidden />
              <span className="min-w-0 text-sm"><span className="block font-semibold">Plan 4 weeks of shopping</span><span className="block text-muted">See each trip and what&apos;s worth buying in bulk.</span></span>
            </Link>
          )}
          {s.nearby.length === 0 && (
            <Card>
              <SectionTitle>Stores near you</SectionTitle>
              <NearbyFinder />
            </Card>
          )}
          <p className="px-1 text-xs text-muted">Prices are estimates from Pittsburgh-area stores; Walmart and Aldi prices are similar across the US. Correct any price in <Link href="/pantry/" className="underline">Pantry → Prices</Link> and the plan updates.</p>
        </aside>
      </div>
    </>
  );
}
