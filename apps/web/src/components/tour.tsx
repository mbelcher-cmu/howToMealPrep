"use client";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { create } from "zustand";
import { isoDay, useApp } from "@/lib/store";
import { useHydrated } from "@/lib/use-planner";
import { useAccount } from "@/lib/account";
import { useFlag } from "@/lib/flags";
import { track } from "@/lib/telemetry";

/**
 * First-time app tour: five stops that light up the real menu (Home, Plan, Groceries, Prep, More)
 * with one sentence each. It shows once, on Home, after setup; tourSeen (synced with the account)
 * is set the moment it appears. Settings can replay it. Menu items carry data-tour="<stop id>".
 */
export const TOUR_STEPS = [
  { id: "home", title: "Welcome to MacroAisle", body: "Home shows today's food, your macros and what's left to buy." },
  { id: "plan", title: "Plan", body: "Change calories, meals, budget, diet and stores. Swap any recipe you don't want." },
  { id: "groceries", title: "Groceries", body: "Your list, sorted by store and aisle. Tap Shop in store when you're at the market." },
  { id: "prep", title: "Prep", body: "What to cook on prep day, in order, with a step-by-step cook mode and timers." },
  { id: "more", title: "Everything else", body: "Recipes, pantry, eating out and settings. You can replay this tour in Settings." },
] as const;

export const useTour = create<{ open: boolean; step: number }>(() => ({ open: false, step: 0 }));
/** Opens the tour at its first stop (Settings' "Replay the tour"). */
export const startTour = () => useTour.setState({ open: true, step: 0 });

/** The menu item a stop lights up: the first visible one, since phone and desktop menus both exist. */
function findTarget(id: string): HTMLElement | null {
  for (const el of Array.from(document.querySelectorAll<HTMLElement>(`[data-tour="${id}"]`))) {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) return el;
  }
  return null;
}

type Box = { top: number; left: number; width: number; height: number };
const PAD = 6;

export function Tour() {
  const on = useFlag("tour");
  const hydrated = useHydrated();
  const path = usePathname() ?? "/";
  const onboarded = useApp((s) => s.onboarded);
  const seen = useApp((s) => s.tourSeen);
  const account = useAccount();
  const { open, step } = useTour();

  // first visit to Home after setup: show it once. A signed-in device waits for its first sync,
  // which may bring "seen" from another device.
  const awaitingCloud = account.status === "loading" || (account.status === "signedIn" && !account.lastSynced && !account.error);
  useEffect(() => {
    if (!on || !hydrated || !onboarded || seen || path !== "/" || awaitingCloud || open) return;
    const t = window.setTimeout(() => {
      useApp.setState({ tourSeen: isoDay() });
      startTour();
    }, 600);
    return () => window.clearTimeout(t);
  }, [on, hydrated, onboarded, seen, path, awaitingCloud, open]);

  // leaving Home closes it. Only a change of page counts, so Settings can open it and then go Home.
  useEffect(() => { if (path !== "/") useTour.setState({ open: false }); }, [path]);

  if (!open || !on || path !== "/") return null;
  return <TourStop step={step} />;
}

function TourStop({ step }: { step: number }) {
  const s = TOUR_STEPS[step]!;
  const last = step === TOUR_STEPS.length - 1;
  const [box, setBox] = useState<Box | null>(null);
  const [vw, setVw] = useState(0);
  const [vh, setVh] = useState(0);
  const card = useRef<HTMLDivElement>(null);
  const primary = useRef<HTMLButtonElement>(null);

  const close = useCallback((skipped: boolean) => {
    track("tour_done", { step: step + 1, skipped });
    useTour.setState({ open: false });
  }, [step]);
  const next = () => (last ? close(false) : useTour.setState({ step: step + 1 }));

  // measure the lit item now and whenever the window changes size
  useLayoutEffect(() => {
    const measure = () => {
      setVw(window.innerWidth);
      setVh(window.innerHeight);
      const el = findTarget(s.id);
      if (!el) { setBox(null); return; }
      const r = el.getBoundingClientRect();
      setBox({ top: r.top - PAD, left: r.left - PAD, width: r.width + PAD * 2, height: r.height + PAD * 2 });
    };
    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, { passive: true });
    return () => { window.removeEventListener("resize", measure); window.removeEventListener("scroll", measure); };
  }, [s.id]);

  // focus lands on the main button at each stop; Escape skips; Tab stays inside the card
  useEffect(() => { primary.current?.focus({ preventScroll: true }); }, [step]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); close(true); return; }
      if (e.key !== "Tab" || !card.current) return;
      const items = Array.from(card.current.querySelectorAll<HTMLElement>("button"));
      const first = items[0], end = items[items.length - 1];
      if (!first || !end) return;
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); end.focus(); }
      else if (!e.shiftKey && document.activeElement === end) { e.preventDefault(); first.focus(); }
      else if (!card.current.contains(document.activeElement)) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [close]);

  // the card sits beside a sidebar item on wide screens, above a bottom-bar item on phones,
  // below anything near the top, and centered when the item can't be found
  const W = Math.min(360, vw - 32);
  let pos: React.CSSProperties = { left: "50%", top: "50%", transform: "translate(-50%, -50%)", width: W };
  if (box && vw) {
    if (vw >= 768 && box.left + box.width < vw / 3) {
      pos = { left: box.left + box.width + 12, top: Math.max(16, Math.min(box.top + box.height / 2 - 90, vh - 220)), width: W };
    } else {
      const left = Math.max(16, Math.min(box.left + box.width / 2 - W / 2, vw - W - 16));
      pos = box.top > vh / 2 ? { left, bottom: vh - box.top + 12, width: W } : { left, top: box.top + box.height + 12, width: W };
    }
  }

  return (
    <div className="fixed inset-0 z-50">
      {/* the dim layer catches taps so nobody leaves the tour by accident; the cut-out shows the lit item */}
      <div className="absolute inset-0" aria-hidden onClick={(e) => e.stopPropagation()} />
      <div aria-hidden className="tour-hole pointer-events-none absolute rounded-[22px]"
        style={box ? { top: box.top, left: box.left, width: box.width, height: box.height } : { top: "50%", left: "50%", width: 0, height: 0 }} />
      <div ref={card} role="dialog" aria-modal="true" aria-labelledby="tour-title" aria-describedby="tour-body"
        key={step} className="tour-card card absolute p-5 shadow-[var(--shadow-float)]" style={pos}>
        <p className="label">App tour · {step + 1} of {TOUR_STEPS.length}</p>
        <h2 id="tour-title" className="mt-1 font-display text-[20px] font-bold leading-snug">{s.title}</h2>
        <p id="tour-body" className="mt-1.5 text-[15px] text-muted">{s.body}</p>
        <div className="mt-4 flex items-center justify-between gap-3">
          {last ? <span /> : (
            <button type="button" className="btn border-transparent bg-transparent px-3 text-muted shadow-none hover:bg-sunk hover:text-ink" onClick={() => close(true)}>Skip tour</button>
          )}
          <button ref={primary} type="button" className="btn btn-primary" onClick={next}>{last ? "Got it" : "Next"}</button>
        </div>
      </div>
    </div>
  );
}
