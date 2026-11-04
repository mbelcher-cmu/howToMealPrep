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
