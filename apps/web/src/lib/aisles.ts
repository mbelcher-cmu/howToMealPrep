import type { Aisle, ChainId } from "@prep-cart/catalog";

/** A typical walk through a store: fresh food around the edge first, cold and frozen last so it stays cold. */
export const AISLE_ORDER: Aisle[] = ["Produce", "Bakery", "Deli", "Meat and seafood", "Grains and pasta", "Canned and jarred", "Sauces and condiments", "Oils and nuts", "Dairy and eggs", "Frozen"];

/** The person's order for a store, with any aisle they never placed added at the end. */
export function aisleOrderFor(chain: ChainId, custom: Partial<Record<ChainId, Aisle[]>> | undefined): Aisle[] {
  const mine = (custom?.[chain] ?? []).filter((a) => AISLE_ORDER.includes(a));
  return [...mine, ...AISLE_ORDER.filter((a) => !mine.includes(a))];
}
