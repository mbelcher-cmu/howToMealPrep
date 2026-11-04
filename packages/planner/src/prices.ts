import { INGREDIENTS, type ChainId } from "@prep-cart/catalog";
import type { PriceQuote, PriceTable } from "./types";

/** Estimated prices from the catalog, overlaid with the user's own (receipt or manual) prices. */
export function buildPriceTable(overrides: Record<string, Partial<Record<ChainId, PriceQuote | null>>> = {}): PriceTable {
  const t: PriceTable = {};
  for (const ing of Object.values(INGREDIENTS)) {
    t[ing.id] = {};
    for (const [chain, price] of Object.entries(ing.estPrice) as [ChainId, number | null][]) {
      t[ing.id]![chain] = price == null ? null : { price, source: "estimate" };
    }
    const o = overrides[ing.id];
    if (o) for (const [chain, q] of Object.entries(o) as [ChainId, PriceQuote | null][]) t[ing.id]![chain] = q;
  }
  return t;
}

export interface Deal { ingredientId: string; chain: ChainId; price: number; endsOn: string }

/** Lay this week's sales over a price table. A sale only counts while it runs and when it beats the usual price. */
export function applyDeals(t: PriceTable, deals: Deal[], today: string): PriceTable {
  const out: PriceTable = { ...t };
  for (const d of deals) {
    if (d.endsOn < today || !(d.price > 0)) continue;
    const row = { ...(out[d.ingredientId] ?? {}) };
    const usual = row[d.chain]?.price;
    if (usual != null && d.price >= usual) continue;
    row[d.chain] = { price: d.price, source: "sale", ...(usual != null ? { regular: usual } : {}), observedAt: today };
    out[d.ingredientId] = row;
  }
  return out;
}
