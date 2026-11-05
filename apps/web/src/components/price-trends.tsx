"use client";
import { TrendingDown, TrendingUp } from "lucide-react";
import { INGREDIENTS, shelfLifeDays, type ChainId } from "@prep-cart/catalog";
import { dealHint, priceInsight, type DealHint } from "@prep-cart/planner";
import { isoDay, useApp, type AppState } from "@/lib/store";
import { chainName, cx, money } from "@/lib/format";
import { usualPrice } from "./deals";

/** Raw meat and fish keep about this long in the freezer, so a deal on them is worth stocking up on. */
const FREEZER_DAYS = 90;

/** Days an item keeps once bought; raw meat counts its freezer life. */
export const keepsDays = (id: string) => (INGREDIENTS[id]?.aisle === "Meat and seafood" ? FREEZER_DAYS : shelfLifeDays(id));

/** The deal hint for a price, from the person's price history and their usual price at that store. */
export function hintFor(s: Pick<AppState, "priceHistory" | "priceOverrides">, ingredientId: string, chain: ChainId, price: number, today = isoDay()): DealHint | null {
  const insight = priceInsight(s.priceHistory[ingredientId], chain, usualPrice(ingredientId, chain, s.priceOverrides), today);
  return dealHint(price, insight, keepsDays(ingredientId));
}

const pct = (share: number) => `${Math.round(share * 100)}%`;

/** One short line: "Stock up · 20% off", "Good deal · 12% off" or "Price up 10%". Nothing for usual prices. */
export function DealTag({ hint, className }: { hint: DealHint | null; className?: string }) {
  if (!hint) return null;
  if (hint.kind === "up") {
    return <span className={cx("inline-flex items-center gap-1 text-[11px] text-muted", className)}><TrendingUp size={12} aria-hidden /> Price up {pct(hint.share)}</span>;
  }
  return (
    <span className={cx("inline-flex items-center gap-1 text-[11px] font-semibold text-accent", className)} title={`Usually ${money(hint.usual)}`}>
      <TrendingDown size={12} aria-hidden /> {hint.kind === "stockUp" ? "Stock up" : "Good deal"} · {pct(hint.share)} off
    </span>
  );
}

/** For the price table: the usual price at the store you last bought it, the low, and which way it's going. */
export function PriceTrendLine({ ingredientId }: { ingredientId: string }) {
  const s = useApp();
  const h = s.priceHistory[ingredientId];
  if (!h?.length) return null;
  const last = h[h.length - 1]!;
  const insight = priceInsight(h, last.chain, usualPrice(ingredientId, last.chain, s.priceOverrides), isoDay());
  if (!insight) return null;
  const shown = insight.points.length;
  return (
    <span className="block text-[11px] text-muted">
      Usually {money(insight.usual)} at {chainName(last.chain)}
      {insight.low < insight.usual - 0.005 && <> · low {money(insight.low)}</>}
      {insight.trend !== "steady" && <> · {insight.trend === "up" ? "rising" : "falling"}</>}
      {shown > 1 && <> · {shown} prices seen</>}
    </span>
  );
}
