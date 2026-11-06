"use client";
import { useMemo, useState } from "react";
import { Tag as TagIcon, Trash2, TrendingDown } from "lucide-react";
import { INGREDIENTS, pkgAt, type ChainId } from "@prep-cart/catalog";
import { useChains } from "@/lib/bulk";
import { addDays, daysUntil, isoDay, useApp } from "@/lib/store";
import { chainName, money } from "@/lib/format";
import { Card, SectionTitle } from "./ui";

/** Usual price for a package at a chain: the person's own price if they set one, else the estimate. */
export function usualPrice(ingredientId: string, chain: ChainId, overrides: ReturnType<typeof useApp.getState>["priceOverrides"]): number | null {
  const o = overrides[ingredientId]?.[chain];
  if (o === null) return null;
  return o?.price ?? INGREDIENTS[ingredientId]?.estPrice[chain] ?? null;
}

export function DealsPanel() {
  const s = useApp();
  const chains = useChains();
  const [q, setQ] = useState("");
  const [pick, setPick] = useState<string | null>(null);
  const [chain, setChain] = useState<ChainId>(s.stores[0] ?? "aldi");
  const [price, setPrice] = useState("");
  const [ends, setEnds] = useState(addDays(isoDay(), 6));
  const [err, setErr] = useState("");
  const matches = q.length >= 2 && !pick ? Object.values(INGREDIENTS).filter((i) => i.name.toLowerCase().includes(q.toLowerCase())).slice(0, 8) : [];
  const active = useMemo(() => s.deals.filter((d) => daysUntil(d.endsOn) >= 0).sort((a, b) => a.endsOn.localeCompare(b.endsOn)), [s.deals]);
  const expired = s.deals.filter((d) => daysUntil(d.endsOn) < 0);
  const inPlan = new Set(s.current?.result.cart.map((l) => `${l.chain}:${l.ingredientId}`) ?? []);

  const add = () => {
    const n = Number(price.replace(/^\$/, ""));
    if (!pick) { setErr("Pick an item."); return; }
    if (!(n > 0 && n < 500)) { setErr("Enter the sale price for one package."); return; }
    const usual = usualPrice(pick, chain, s.priceOverrides);
    if (usual != null && n >= usual) { setErr(`That's not below the usual ${money(usual)}, so it wouldn't change the plan.`); return; }
    s.addDeal({ ingredientId: pick, chain, price: Math.round(n * 100) / 100, endsOn: ends });
    setPick(null); setQ(""); setPrice(""); setErr("");
  };
  const ing = pick ? INGREDIENTS[pick] : null;

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
      <Card>
        <SectionTitle>Sales this week</SectionTitle>
        {active.length === 0 ? (
          <p className="text-sm text-muted">No sales yet. Add items from the store's weekly ad or shelf tags, and the plan will lean on them while they last.</p>
        ) : (
          <ul className="divide-y divide-line">
            {active.map((d) => {
              const usual = usualPrice(d.ingredientId, d.chain, s.priceOverrides);
              const left = daysUntil(d.endsOn);
              const used = inPlan.has(`${d.chain}:${d.ingredientId}`);
              return (
                <li key={d.id} className="flex flex-wrap items-center gap-3 py-2.5">
                  <TagIcon size={16} className="shrink-0 text-accent" aria-hidden />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2 font-medium">{INGREDIENTS[d.ingredientId]?.name}{used && <span className="pill">In your plan</span>}</div>
                    <div className="text-xs text-muted">{chainName(d.chain)} · {pkgAt(d.ingredientId, d.chain).label} · ends {left === 0 ? "today" : `in ${left} day${left === 1 ? "" : "s"}`}</div>
                  </div>
                  <div className="text-right">
                    <div className="num font-semibold">{money(d.price)}</div>
                    {usual != null && <div className="num text-xs text-muted"><s>{money(usual)}</s> · save {Math.round((1 - d.price / usual) * 100)}%</div>}
                  </div>
                  <button className="btn btn-sm" onClick={() => s.removeDeal(d.id)} aria-label={`Remove the ${INGREDIENTS[d.ingredientId]?.name} sale`}><Trash2 size={14} aria-hidden /></button>
                </li>
              );
            })}
          </ul>
        )}
        {expired.length > 0 && (
          <button className="mt-3 text-xs text-muted underline" onClick={() => expired.forEach((d) => s.removeDeal(d.id))}>Clear {expired.length} ended sale{expired.length === 1 ? "" : "s"}</button>
        )}
      </Card>

      <Card className="self-start">
        <SectionTitle>Add a sale</SectionTitle>
        <div className="grid gap-3">
          <div className="grid gap-1">
            <label htmlFor="deal-item" className="text-[13px] text-muted">Item</label>
            {ing ? (
              <div className="flex items-center justify-between gap-2 rounded-lg border border-accent bg-accent-soft px-3 py-2 text-sm">
                <span>{ing.name} <span className="text-muted">· {ing.pkg.label}</span></span>
                <button className="text-xs underline" onClick={() => setPick(null)}>Change</button>
              </div>
            ) : (
              <input id="deal-item" className="input" placeholder="Search, like chicken thighs" value={q} onChange={(e) => setQ(e.target.value)} />
            )}
            {matches.length > 0 && (
              <ul className="grid gap-1">
                {matches.map((i) => <li key={i.id}><button className="w-full rounded-md px-2 py-1.5 text-left text-sm hover:bg-sunk" onClick={() => setPick(i.id)}>{i.name} <span className="text-xs text-muted">· {i.pkg.label}</span></button></li>)}
              </ul>
            )}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="grid gap-1">
              <label htmlFor="deal-store" className="text-[13px] text-muted">Store</label>
              <select id="deal-store" className="input" value={chain} onChange={(e) => setChain(e.target.value as ChainId)}>
                {chains.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div className="grid gap-1">
              <label htmlFor="deal-price" className="text-[13px] text-muted">Sale price</label>
              <input id="deal-price" className="input num" inputMode="decimal" placeholder={ing ? money(usualPrice(ing.id, chain, s.priceOverrides) ?? 0) : "$0.00"} value={price} onChange={(e) => setPrice(e.target.value)} />
            </div>
          </div>
          <div className="grid gap-1">
            <label htmlFor="deal-ends" className="text-[13px] text-muted">Sale ends</label>
            <input id="deal-ends" type="date" className="input" value={ends} min={isoDay()} onChange={(e) => setEnds(e.target.value)} />
          </div>
          {err && <p role="alert" className="text-sm text-warn">{err}</p>}
          <button className="btn btn-primary" onClick={add}><TrendingDown size={16} aria-hidden /> Add sale</button>
          <p className="text-xs text-muted">Price is for one package as listed. Live weekly-ad data needs a paid data feed, so for now you add the sales you see.</p>
        </div>
      </Card>
    </div>
  );
}

/** Short "was $x" history line for the price table. */
export function PriceHistoryLine({ ingredientId }: { ingredientId: string }) {
  const h = useApp((s) => s.priceHistory[ingredientId]);
  if (!h?.length) return null;
  const last = h[h.length - 1]!;
  const low = h.reduce((a, b) => (b.price < a.price ? b : a));
  return (
    <span className="block text-[11px] text-muted">
      Last {money(last.price)} at {chainName(last.chain)} ({new Date(`${last.on}T12:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" })})
      {h.length > 1 && low !== last && <> · lowest {money(low.price)}</>}
    </span>
  );
}
