"use client";
import Link from "next/link";
import { useEffect, type ReactNode } from "react";
import { Sparkles } from "lucide-react";
import { FEATURES, PLUS_PRICE, useEntitlements, type Feature, type FeatureId } from "@/lib/entitlements";
import { track } from "@/lib/telemetry";
import { cx } from "@/lib/format";

/**
 * Shown where a Plus feature would be. Says what the feature does and links to the upgrade page.
 * Never placed in front of planning, swaps, the shopping list or the cart.
 */
export function Paywall({ feature, className, children }: { feature: FeatureId; className?: string; children?: ReactNode }) {
  const f: Feature = FEATURES[feature];
  useEffect(() => { track("paywall_view", { feature }); }, [feature]);
  return (
    <div className={cx("rounded-lg border border-accent bg-surface p-4", className)} data-paywall={feature}>
      <p className="flex items-center gap-1.5 text-sm font-semibold"><Sparkles size={16} className="text-accent" aria-hidden /> {f.title} is part of Plus</p>
      <p className="mt-1 text-sm text-muted">{children ?? f.blurb}</p>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Link href={`/plus/?from=${feature}`} className="btn btn-primary btn-sm">See Plus</Link>
        <span className="text-xs text-muted">From ${PLUS_PRICE.month.toFixed(2)} a month</span>
      </div>
    </div>
  );
}

/** Renders the feature when the person may use it, and a paywall in its place when not. */
export function PlusGate({ feature, children }: { feature: FeatureId; children: ReactNode }) {
  const e = useEntitlements();
  return e.can(feature) ? <>{children}</> : <Paywall feature={feature} />;
}

/** Small "Plus" tag next to a feature the person has through Plus. */
export function PlusBadge() {
  return <span className="inline-flex items-center gap-1 rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-ink"><Sparkles size={11} className="text-accent" aria-hidden /> Plus</span>;
}
