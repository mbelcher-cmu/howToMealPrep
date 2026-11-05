import type { ChainId } from "@prep-cart/catalog";
import type { CartLine } from "./types";

/**
 * Price history and deal hints. There is no live price feed yet, so the history is what the app
 * has seen: the price each item was planned at on every shopping trip (estimates, your own prices,
 * sales), plus prices you typed in and sales you added. The usual price is the estimate (or your
 * own price) blended with that history; a price well below it is a deal.
 */
export type PriceObsSource = "manual" | "receipt" | "sale" | "trip";
export interface PriceObs { chain: ChainId; price: number; on: string; source: PriceObsSource }
/** ingredientId -> observations, oldest first */
export type PriceHistory = Record<string, PriceObs[]>;

/** How many observations the app keeps per ingredient. */
export const PRICES_KEPT = 30;
/** A price at least this far below the usual one counts as a deal. */
export const DEAL_SHARE = 0.1;
/** A price this far above the usual one is worth a quiet "price up" note. */
export const UP_SHARE = 0.1;
/** Food that keeps at least this long is worth stocking up on while it's on deal (matches the calendar). */
export const STOCK_UP_KEEPS_DAYS = 60;
/** Only the last half year of prices counts toward the usual price. */
const WINDOW_DAYS = 182;

export interface PriceInsight {
  /** what this item usually costs at this store */
  usual: number;
  low: number;
  high: number;
  /** most recent observation at this store, if any */
  last?: PriceObs;
  /** regular (non-sale) prices lately compared with before */
  trend: "up" | "down" | "steady";
  /** observations at this store, oldest first, for a sparkline */
  points: { on: string; price: number }[];
}

export interface DealHint {
  kind: "stockUp" | "deal" | "up";
  /** share below (deal) or above (up) the usual price, 0..1 */
  share: number;
  usual: number;
}

const DAY = 86_400_000;
const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / DAY);

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

/**
 * What an item usually costs at a store and which way it's heading. `regular` is the price the app
 * would use without history (your own price, else the estimate); it seeds the usual price so one
 * odd trip can't swing it. Sales never count toward the usual price, only toward the low.
 */
export function priceInsight(history: PriceObs[] | undefined, chain: ChainId, regular: number | null, today: string): PriceInsight | null {
  const here = (history ?? []).filter((o) => o.chain === chain && o.price > 0).sort((a, b) => a.on.localeCompare(b.on));
  const recent = here.filter((o) => daysBetween(o.on, today) <= WINDOW_DAYS);
  const regulars = recent.filter((o) => o.source !== "sale").map((o) => o.price);
  const seed = regular != null && regular > 0 ? [regular] : [];
  if (!seed.length && !regulars.length) return null;
  const usual = Math.round(median([...seed, ...regulars]) * 100) / 100;
  const all = [...here.map((o) => o.price), ...seed];

  // trend: the last 6 weeks of regular prices against the ones before (needs some of each)
  const nonSale = recent.filter((o) => o.source !== "sale");
  const late = nonSale.filter((o) => daysBetween(o.on, today) <= 42).map((o) => o.price);
  const early = nonSale.filter((o) => daysBetween(o.on, today) > 42).map((o) => o.price);
  let trend: PriceInsight["trend"] = "steady";
  if (late.length && early.length) {
    const change = median(late) / median(early) - 1;
    if (change >= 0.05) trend = "up";
    else if (change <= -0.05) trend = "down";
  }
  return {
    usual,
    low: Math.min(...all),
    high: Math.max(...all),
    ...(here.length ? { last: here[here.length - 1]! } : {}),
    trend,
    points: here.map((o) => ({ on: o.on, price: o.price })),
  };
}

/**
 * The one hint worth showing for a price: stock up (a deal on food that keeps), a deal, or a price
 * that's gone up. Small differences say nothing, so most items get no hint at all.
 */
export function dealHint(price: number, insight: PriceInsight | null, keepsDays: number): DealHint | null {
  if (!insight || !(price > 0) || !(insight.usual > 0)) return null;
  const below = 1 - price / insight.usual;
  if (below >= DEAL_SHARE - 1e-9) {
    const share = Math.round(below * 100) / 100;
    return { kind: keepsDays >= STOCK_UP_KEEPS_DAYS ? "stockUp" : "deal", share, usual: insight.usual };
  }
  const above = price / insight.usual - 1;
  if (above >= UP_SHARE - 1e-9) return { kind: "up", share: Math.round(above * 100) / 100, usual: insight.usual };
  return null;
}

/**
 * Adds the prices a shopping trip paid to the history: one observation per item and store, dated
 * the trip. A line bought on sale is kept as a sale, so it never drags the usual price down.
 * Running it twice for the same day changes nothing.
 */
export function recordTrip(history: PriceHistory, cart: Pick<CartLine, "ingredientId" | "chain" | "unitPrice" | "priceSource">[], on: string): PriceHistory {
  const out: PriceHistory = { ...history };
  for (const l of cart) {
    if (!(l.unitPrice > 0)) continue;
    const list = out[l.ingredientId] ?? [];
    const source: PriceObsSource = l.priceSource === "sale" ? "sale" : "trip";
    const price = Math.round(l.unitPrice * 100) / 100;
    if (list.some((o) => o.on === on && o.chain === l.chain && o.source === source && o.price === price)) continue;
    out[l.ingredientId] = [...list, { chain: l.chain, price, on, source }]
      .sort((a, b) => a.on.localeCompare(b.on))
      .slice(-PRICES_KEPT);
  }
  return out;
}

/** Dollars a cart saves against usual prices, counting only the lines that are deals. */
export function cartSavings(lines: { price: number; packages: number; hint: DealHint | null }[]): number {
  const s = lines.reduce((a, l) => a + (l.hint && l.hint.kind !== "up" ? (l.hint.usual - l.price) * l.packages : 0), 0);
  return Math.round(s * 100) / 100;
}
