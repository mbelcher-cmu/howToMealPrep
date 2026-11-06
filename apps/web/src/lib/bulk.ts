"use client";
import { CHAINS, INGREDIENTS, isBulkChain, type ChainId } from "@prep-cart/catalog";
import type { CartLine, PantryItem } from "@prep-cart/planner";
import { useFlag } from "./flags";

/**
 * Warehouse clubs (Costco, Sam's Club), behind the bulkStores flag. A club pack is big, so a week's
 * plan counts only the share it uses; what's left goes to the pantry still carrying the rest of what
 * was paid for it, and later weeks count it as they use it.
 */

/** The weeks one bulk trip can cover. */
export const BULK_WEEK_OPTIONS = [2, 3, 4] as const;
export const DEFAULT_BULK_WEEKS = 4;

/** Stores to show: the clubs only while the flag is on. */
export function visibleChains(bulkOn: boolean) {
  return bulkOn ? CHAINS : CHAINS.filter((c) => !c.bulk);
}
export function useChains() {
  return visibleChains(useFlag("bulkStores"));
}

/** The person's stores as the planner should see them: clubs drop out while the flag is off. */
export function plannerStores(stores: ChainId[], bulkOn: boolean): ChainId[] {
  return bulkOn ? stores : stores.filter((c) => !isBulkChain(c));
}

/** True when the person shops at a club. */
export const usesClub = (stores: ChainId[], bulkOn: boolean) => bulkOn && stores.some(isBulkChain);

/** The package on a grocery line: the club pack for club lines, the usual one otherwise. */
export const linePkgLabel = (l: Pick<CartLine, "ingredientId" | "pkg">) => l.pkg?.label ?? INGREDIENTS[l.ingredientId]?.pkg.label ?? "";

/** What a line counts toward the plan (club lines only in part). */
export const lineCounted = (l: Pick<CartLine, "cost" | "countedCost">) => l.countedCost ?? l.cost;

/**
 * Dollars per gram still "unspent" in what's left of a club pack after this plan: the register price
 * minus what the plan counted, spread over the leftover. Regular-store leftovers carry nothing.
 */
export function leftoverPerGram(l: CartLine): number | null {
  if (l.countedCost == null || l.leftoverGrams <= 0) return null;
  const left = Math.max(0, l.cost - l.countedCost);
  return left > 0 ? left / l.leftoverGrams : null;
}

/** Add grams carrying a per-gram value to a pantry row, keeping a weighted average value. */
export function addPaid(row: PantryItem | undefined, grams: number, perGram: number | null): Pick<PantryItem, "grams" | "costPerGram"> {
  const had = row?.grams ?? 0;
  if (had === Infinity) return { grams: Infinity };
  const hadValue = had * (row?.costPerGram ?? 0);
  const total = had + grams;
  const value = hadValue + grams * (perGram ?? 0);
  return value > 0 && total > 0 ? { grams: total, costPerGram: value / total } : { grams: total };
}
