"use client";
import { useMemo, useState } from "react";
import { Infinity as InfinityIcon, Plus, Trash2 } from "lucide-react";
import { CHAINS, formatAmount, INGREDIENTS, type ChainId } from "@prep-cart/catalog";
import { DealsPanel, PriceHistoryLine } from "@/components/deals";
import { PriceTrendLine } from "@/components/price-trends";
import { useFlag } from "@/lib/flags";
import { Card, Chip, NumberField, PageHeader, Segmented } from "@/components/ui";
import { daysUntil, useApp } from "@/lib/store";
import { useHydrated } from "@/lib/use-planner";
import { cx, money } from "@/lib/format";
import { PantryTracker } from "@/components/pantry-tracker";

function PriceCell({ ingredientId, chain }: { ingredientId: string; chain: ChainId }) {
  const s = useApp();
  const ing = INGREDIENTS[ingredientId]!;
  const est = ing.estPrice[chain];
  const o = s.priceOverrides[ingredientId]?.[chain];
  const current = o === undefined ? est : o?.price ?? null;
  const [text, setText] = useState<string | null>(null);
  const commit = () => {
    if (text === null) return;
    const t = text.trim().replace(/^\$/, "");
    if (t === "") s.setPrice(ingredientId, chain, undefined);
    else if (t === "-" || /^n\/?a$/i.test(t)) s.setPrice(ingredientId, chain, null);
    else { const n = Number(t); if (Number.isFinite(n) && n > 0 && n < 500) s.setPrice(ingredientId, chain, Math.round(n * 100) / 100); }
    setText(null);
  };
  const name = CHAINS.find((c) => c.id === chain)!.name;
  return (
    <td className="px-1 py-1">
      <input
        className={cx("input num h-9 w-[84px] px-2 py-1 text-right text-sm", o !== undefined && "border-accent bg-accent-soft")}
        aria-label={`${ing.name} at ${name}, price per ${ing.pkg.label}`}
        placeholder={est == null ? "n/a" : money(est)}
        value={text ?? (current == null ? (o === null ? "n/a" : "") : current.toFixed(2))}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); if (e.key === "Escape") setText(null); }}
        inputMode="decimal"
      />
    </td>
  );
}

export default function Pantry() {
  const trendsOn = useFlag("priceTrends");
  const hydrated = useHydrated();
  const s = useApp();
  const [tab, setTab] = useState<"pantry" | "prices" | "deals">("pantry");
  const [q, setQ] = useState("");
  const [priceQ, setPriceQ] = useState("");
  const [onlyCart, setOnlyCart] = useState(true);
  const tracker = useFlag("pantryV2");
  const have = new Map(s.pantry.map((p) => [p.ingredientId, p.grams]));
  const matches = q.length >= 2 ? Object.values(INGREDIENTS).filter((i) => i.name.toLowerCase().includes(q.toLowerCase()) && !have.has(i.id)).slice(0, 8) : [];
  const cartIds = useMemo(() => new Set(s.current?.result.cart.map((l) => l.ingredientId) ?? []), [s.current]);
  const priceRows = Object.values(INGREDIENTS)
    .filter((i) => (!onlyCart || cartIds.has(i.id) || !!s.priceOverrides[i.id]) && i.name.toLowerCase().includes(priceQ.toLowerCase()))
    .sort((a, b) => a.aisle.localeCompare(b.aisle) || a.name.localeCompare(b.name));
  if (!hydrated) return null;
  // soonest to spoil first, then staples A to Z
  const items = [...s.pantry].sort((a, b) =>
    (a.useBy ? daysUntil(a.useBy) : 1e9) - (b.useBy ? daysUntil(b.useBy) : 1e9) ||
    (INGREDIENTS[a.ingredientId]?.name ?? "").localeCompare(INGREDIENTS[b.ingredientId]?.name ?? ""));
  const soon = items.filter((p) => p.useBy && daysUntil(p.useBy) <= 2);
  const activeDeals = s.deals.filter((d) => daysUntil(d.endsOn) >= 0).length;
  const overrideCount = Object.values(s.priceOverrides).reduce((n, r) => n + Object.keys(r).length, 0);

  return (
    <>
      <PageHeader title="Pantry and prices" lead="Food you already have gets used first. Correct any price or add a sale and the plan re-runs with it." />
      <div className="mb-4 max-w-[480px]">
        <Segmented label="Section" value={tab} onChange={setTab} options={[{ value: "pantry", label: "What I have" }, { value: "prices", label: `Prices${overrideCount ? ` (${overrideCount})` : ""}` }, { value: "deals", label: `Sales${activeDeals ? ` (${activeDeals})` : ""}` }]} />
      </div>
      {tab === "deals" ? <DealsPanel /> : tab === "pantry" && tracker ? <PantryTracker /> : tab === "pantry" ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
          <Card>
            {soon.length > 0 && (
              <p role="status" className="mb-3 rounded-lg bg-warn-soft p-3 text-sm">
                <b>Use soon:</b> {soon.map((p) => INGREDIENTS[p.ingredientId]?.name).join(", ")}. The plan picks recipes that use these up first.
              </p>
            )}
            {items.length === 0 ? <p className="text-sm text-muted">Nothing here yet. Add what's in your kitchen, or tap Done shopping on the grocery list to save leftovers.</p> : (
              <ul className="divide-y divide-line">
                {items.map((p) => {
                  const ing = INGREDIENTS[p.ingredientId];
                  if (!ing) return null;
                  const always = p.grams === Infinity;
                  const left = p.useBy ? daysUntil(p.useBy) : null;
                  return (
                    <li key={p.ingredientId} className="flex flex-wrap items-center gap-3 py-2.5">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2 font-medium">{ing.name}
                          {left != null && left < 0 && <span className="pill pill-warn">Past its date</span>}
                          {left != null && left >= 0 && left <= 2 && <span className="pill pill-warn">Use soon</span>}
                        </div>
                        <div className="text-xs text-muted">{always ? "Always have it" : `About ${formatAmount(ing.id, p.grams, s.profile.units)}`}{left != null && ` · ${left < 0 ? "was due" : "use by"} ${new Date(`${p.useBy}T12:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" })}${left >= 0 ? ` (${left === 0 ? "today" : `${left} day${left === 1 ? "" : "s"}`})` : ""}`} · {ing.aisle}</div>
                      </div>
                      {!always && <div className="w-28"><NumberField compact label="Grams" value={Math.round(p.grams)} min={0} max={20000} step={50} onChange={(g) => s.setPantryAmount(ing.id, g)} /></div>}
                      {!always && (
                        <div className="grid gap-1">
                          <label className="text-xs text-muted" htmlFor={`useby-${ing.id}`}>Use by</label>
                          <input id={`useby-${ing.id}`} type="date" className="input h-9 w-[150px] px-2 py-1 text-sm" value={p.useBy ?? ""} onChange={(e) => s.setPantryAmount(ing.id, p.grams, e.target.value || null)} />
                        </div>
                      )}
                      <button className={cx("btn btn-sm", always && "border-accent bg-accent-soft")} aria-pressed={always} onClick={() => s.setPantryAmount(ing.id, always ? ing.pkg.grams : Infinity)} title="Always in stock">
                        <InfinityIcon size={14} aria-hidden /><span className="sr-only">Always have {ing.name}</span>
                      </button>
                      <button className="btn btn-sm" onClick={() => s.setPantryAmount(ing.id, null)} aria-label={`Remove ${ing.name}`}><Trash2 size={14} aria-hidden /></button>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
          <Card className="self-start">
            <label htmlFor="add-pantry" className="label">Add to pantry</label>
            <input id="add-pantry" className="input mt-1.5" placeholder="Search ingredients" value={q} onChange={(e) => setQ(e.target.value)} />
            <div className="mt-2 flex flex-wrap gap-2">
              {matches.map((i) => <Chip key={i.id} selected={false} onClick={() => { s.setPantryAmount(i.id, i.pkg.grams); setQ(""); }}><Plus size={12} className="inline" aria-hidden /> {i.name}</Chip>)}
            </div>
            <p className="mt-3 text-xs text-muted">New items start at one package. Mark staples like oil and spices as always in stock.</p>
          </Card>
        </div>
      ) : (
        <Card>
          <div className="mb-3 flex flex-wrap items-center gap-3">
            <input className="input max-w-[280px]" placeholder="Filter ingredients" value={priceQ} onChange={(e) => setPriceQ(e.target.value)} aria-label="Filter ingredients" />
            <Chip selected={onlyCart} onClick={() => setOnlyCart(!onlyCart)}>This week's items only</Chip>
            {overrideCount > 0 && <button className="btn btn-sm" onClick={() => s.set({ priceOverrides: {} })}>Reset all to estimates</button>}
          </div>
          <div className="-mx-4 overflow-x-auto px-4 sm:-mx-5 sm:px-5">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="text-left">
                  <th scope="col" className="label py-2">Item and package</th>
                  {CHAINS.map((c) => <th key={c.id} scope="col" className="label px-1 py-2 text-right">{c.name}</th>)}
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {priceRows.map((i) => (
                  <tr key={i.id}>
                    <th scope="row" className="py-1 pr-2 text-left font-normal">
                      <span className="block font-medium">{i.name}</span>
                      <span className="block text-xs text-muted">{i.pkg.label}</span>
                      {trendsOn ? <PriceTrendLine ingredientId={i.id} /> : <PriceHistoryLine ingredientId={i.id} />}
                    </th>
                    {CHAINS.map((c) => <PriceCell key={c.id} ingredientId={i.id} chain={c.id} />)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs text-muted">Highlighted prices are yours. Clear a box to go back to the estimate. Type "n/a" if a store doesn't carry it.</p>
        </Card>
      )}
    </>
  );
}
