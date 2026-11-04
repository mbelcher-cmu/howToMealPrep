"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Check, Copy, ExternalLink, House, PackageCheck } from "lucide-react";
import { CHAINS, formatAmount, INGREDIENTS, type Aisle, type ChainId } from "@prep-cart/catalog";
import type { CartLine } from "@prep-cart/planner";
import { BudgetBar, PlanStatus, SolvingNote } from "@/components/plan-bits";
import { Card, EmptyState, PageHeader, SectionTitle, Tag } from "@/components/ui";
import { useApp } from "@/lib/store";
import { useHydrated, usePlanner } from "@/lib/use-planner";
import { chainName, cx, money } from "@/lib/format";

const AISLE_ORDER: Aisle[] = ["Produce", "Meat and seafood", "Deli", "Dairy and eggs", "Bakery", "Grains and pasta", "Canned and jarred", "Sauces and condiments", "Oils and nuts", "Frozen"];
const SOURCE_LABEL = { estimate: "Estimate", receipt: "Receipt", manual: "Your price", live: "Live", sale: "On sale" } as const;
const lineKey = (l: CartLine) => `${l.chain}:${l.ingredientId}`;

export default function Groceries() {
  const hydrated = useHydrated();
  const { plan } = usePlanner();
  const s = useApp();
  const [copied, setCopied] = useState(false);
  const [done, setDone] = useState(false);

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

  const copy = async () => {
    const text = [...byStore].map(([chain, aisles]) =>
      [`${chainName(chain)}`, ...AISLE_ORDER.filter((a) => aisles.has(a)).flatMap((a) => [`  ${a}`, ...aisles.get(a)!.map((l) => `  [ ] ${INGREDIENTS[l.ingredientId]!.name}: ${l.packages} × ${INGREDIENTS[l.ingredientId]!.pkg.label} (${money(l.cost)})`)])].join("\n"),
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
                  {AISLE_ORDER.filter((a) => aisles.has(a)).map((a) => (
                    <div key={a}>
                      <h3 className="label mb-1">{a}</h3>
                      <ul className="divide-y divide-line">
                        {aisles.get(a)!.map((l) => {
                          const ing = INGREDIENTS[l.ingredientId]!;
                          const k = lineKey(l);
                          const on = !!s.checked[k];
                          return (
                            <li key={k} className="flex items-center gap-3 py-2">
                              <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-3">
                                <input type="checkbox" checked={on} onChange={() => s.toggleChecked(k)} className="peer sr-only" />
                                <span aria-hidden className={cx("grid h-6 w-6 shrink-0 place-items-center rounded-md border-2 peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-accent", on ? "border-accent bg-accent text-accent-ink" : "border-line")}>
                                  {on && <Check size={14} strokeWidth={3} />}
                                </span>
                                <span className={cx("min-w-0", on && "text-muted line-through")}>
                                  <span className="block font-medium">{ing.name}</span>
                                  <span className="block text-xs text-muted">
                                    {l.packages} × {ing.pkg.label} · recipes use {formatAmount(ing.id, l.needGrams, s.profile.units)}
                                    {l.leftoverGrams >= 10 && <> · {formatAmount(ing.id, l.leftoverGrams, s.profile.units)} left over</>}
                                  </span>
                                </span>
                              </label>
                              <div className="shrink-0 text-right">
                                <div className="num text-sm font-semibold">{money(l.cost)}</div>
                                <div className="text-[11px] text-muted">{l.packages > 1 && `${money(l.unitPrice)} ea · `}{SOURCE_LABEL[l.priceSource]}</div>
                              </div>
                              <button className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-muted hover:bg-sunk hover:text-ink" title="I already have this" aria-label={`I already have ${ing.name}`}
                                onClick={() => s.addToPantry(ing.id, l.needGrams)}>
                                <House size={16} aria-hidden />
                              </button>
                              <a href={c.search(ing.name)} target="_blank" rel="noreferrer" className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-muted hover:bg-sunk hover:text-ink" aria-label={`Look up ${ing.name} at ${c.name} (opens new tab)`}>
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
                {r.pantryUsed.map((u) => <li key={u.ingredientId}><Tag>{INGREDIENTS[u.ingredientId]?.name ?? u.ingredientId}</Tag></li>)}
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
              <button className="btn" onClick={copy}>{copied ? <><Check size={16} aria-hidden /> Copied</> : <><Copy size={16} aria-hidden /> Copy list</>}</button>
              <button className="btn btn-primary" onClick={() => { s.finishShopping(); setDone(true); }} disabled={done}>
                <PackageCheck size={16} aria-hidden /> {done ? "Leftovers saved to pantry" : "Done shopping"}
              </button>
            </div>
            <p className="mt-3 text-xs text-muted">Done shopping moves what's left of each package into your pantry, so next week's plan uses it first.</p>
          </Card>
          <p className="px-1 text-xs text-muted">Prices are Pittsburgh-area estimates. Correct any price in <Link href="/pantry/" className="underline">Pantry → Prices</Link> and the plan updates.</p>
        </aside>
      </div>
    </>
  );
}
