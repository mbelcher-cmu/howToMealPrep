"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { BookOpen, CalendarDays, ChefHat, Home, Package, Settings, ShoppingCart, Loader2, Menu, Sparkles, UtensilsCrossed } from "lucide-react";
import { shoppedShare, useApp } from "@/lib/store";
import { useHydrated, usePlanner, usePlannerSync } from "@/lib/use-planner";
import { cx } from "@/lib/format";
import { initTelemetry } from "@/lib/telemetry";
import { initAccount } from "@/lib/account";
import { useFlag } from "@/lib/flags";

const NAV = [
  { href: "/", label: "Home", icon: Home, primary: true },
  { href: "/plan/", label: "Plan", icon: CalendarDays, primary: true },
  { href: "/groceries/", label: "Groceries", icon: ShoppingCart, primary: true },
  { href: "/prep/", label: "Prep", icon: ChefHat, primary: true },
  { href: "/recipes/", label: "Recipes", icon: BookOpen, primary: false },
  { href: "/pantry/", label: "Pantry", icon: Package, primary: false },
  { href: "/eat-out/", label: "Eat out", icon: UtensilsCrossed, primary: false },
  { href: "/settings/", label: "Settings", icon: Settings, primary: false },
];
/** Pages reached from the phone's More tab. */
export const MORE = [...NAV.filter((n) => !n.primary), { href: "/preps/", label: "Meal preps", icon: Sparkles, primary: false }, { href: "/plus/", label: "MacroAisle Plus", icon: Sparkles, primary: false }];

function active(path: string, href: string) {
  if (href === "/") return path === "/";
  return path.startsWith(href.replace(/\/$/, ""));
}

export function AppShell({ children }: { children: ReactNode }) {
  usePlannerSync();
  const path = usePathname() ?? "/";
  const router = useRouter();
  const hydrated = useHydrated();
  const onboarded = useApp((s) => s.onboarded);
  const { status } = usePlanner();
  const isOnboarding = path.startsWith("/welcome");
  const isShopping = path.startsWith("/shop");

  useEffect(() => { void initTelemetry(); }, []);
  useEffect(() => { if (hydrated) void initAccount(); }, [hydrated]);

  useEffect(() => {
    // offline support for the installed app; skipped in development so builds don't go stale
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register(`${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/sw.js`).catch(() => {});
  }, []);

  useEffect(() => {
    // a plan whose days are over and that was mostly shopped: its leftovers go to the pantry without a tap
    if (!hydrated) return;
    const st = useApp.getState();
    const cur = st.current;
    if (!cur) return;
    const ended = Date.now() - new Date(cur.createdAt).getTime() > cur.days * 86400000;
    if (!ended) return;
    if (st.shoppedPlanId !== cur.id && shoppedShare(st) >= 0.5) st.finishShopping();
    // the week is over: next week's plan uses what's left in the pantry
    if (useApp.getState().pantryForPlan) st.planNextWeek();
  }, [hydrated]);

  useEffect(() => {
    if (hydrated && !onboarded && !isOnboarding) router.replace("/welcome/");
  }, [hydrated, onboarded, isOnboarding, router]);

  const v2 = useFlag("redesign");
  if (isOnboarding || isShopping) return <main id="main" className="min-h-dvh">{children}</main>;
  if (v2) return <ShellV2 path={path} solving={status === "solving"}>{children}</ShellV2>;

  return (
    <div className="min-h-dvh md:grid md:grid-cols-[232px_minmax(0,1fr)]">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-surface focus:p-2">Skip to content</a>
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-dvh flex-col border-r border-line bg-surface px-3 py-5 md:flex">
        <Link href="/" className="mb-6 px-3 font-display text-xl font-bold tracking-tight">
          Macro<span className="text-accent">Aisle</span>
        </Link>
        <nav aria-label="Main" className="grid gap-0.5">
          {NAV.map(({ href, label, icon: Icon }) => (
            <Link key={href} href={href} aria-current={active(path, href) ? "page" : undefined}
              className={cx("flex min-h-[40px] items-center gap-3 rounded-lg px-3 text-sm font-medium", active(path, href) ? "bg-accent-soft text-ink" : "text-muted hover:bg-sunk hover:text-ink")}>
              <Icon size={18} aria-hidden /> {label}
            </Link>
          ))}
        </nav>
        <div className="mt-auto px-3 text-xs text-muted">
          {status === "solving" ? <span className="inline-flex items-center gap-1.5"><Loader2 size={14} className="animate-spin" aria-hidden /> Updating your plan</span> : "Prices are estimates until you add receipts."}
        </div>
      </aside>

      <div className="min-w-0">
        {/* Phone header */}
        <header className="sticky top-0 z-20 flex items-center justify-between border-b border-line bg-surface/95 px-4 py-3 backdrop-blur md:hidden" style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 12px)" }}>
          <Link href="/" className="font-display text-lg font-bold">Macro<span className="text-accent">Aisle</span></Link>
          {status === "solving" && <span className="inline-flex items-center gap-1.5 text-xs text-muted"><Loader2 size={14} className="animate-spin" aria-hidden /> Updating</span>}
        </header>
        <main id="main" className="mx-auto w-full max-w-[1120px] px-4 pb-28 pt-5 sm:px-6 md:pb-12 md:pt-8">{children}</main>
      </div>

      {/* Phone tab bar */}
      <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-line bg-surface md:hidden" style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}>
        {[...NAV.filter((n) => n.primary), { href: "/more/", label: "More", icon: Menu, primary: true }].map(({ href, label, icon: Icon }) => {
          const on = href === "/more/" ? active(path, href) || MORE.some((m) => active(path, m.href)) : active(path, href);
          return (
            <Link key={href} href={href} aria-current={on ? "page" : undefined}
              className={cx("press flex min-h-[56px] flex-col items-center justify-center gap-0.5 text-[11px] font-medium", on ? "text-accent" : "text-muted")}>
              <Icon size={20} aria-hidden /> {label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

/** The wordmark: wide, heavy, uppercase. */
function Wordmark({ className }: { className?: string }) {
  return <span className={cx("wide text-[17px] font-extrabold uppercase leading-none tracking-[-0.01em]", className)}>Macro<span className="text-muted">Aisle</span></span>;
}

/**
 * Redesigned shell: a quiet sidebar on desktop; on phones a floating pill tab bar with the
 * grocery list as the round action button beside it.
 */
function ShellV2({ path, solving, children }: { path: string; solving: boolean; children: ReactNode }) {
  const tabs = [...NAV.filter((n) => n.primary && n.href !== "/groceries/"), { href: "/more/", label: "More", icon: Menu, primary: true }];
  const groceriesOn = active(path, "/groceries/");
  return (
    <div className="min-h-dvh md:grid md:grid-cols-[248px_minmax(0,1fr)]">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-surface focus:p-2">Skip to content</a>
      <aside className="sticky top-0 hidden h-dvh flex-col px-4 py-6 md:flex">
        <Link href="/" className="mb-8 px-3"><Wordmark className="text-[19px]" /></Link>
        <nav aria-label="Main" className="grid gap-1">
          {NAV.map(({ href, label, icon: Icon }) => {
            const on = active(path, href);
            return (
              <Link key={href} href={href} aria-current={on ? "page" : undefined}
                className={cx("press flex min-h-[44px] items-center gap-3 rounded-full px-4 text-[14px]", on ? "bg-surface font-semibold text-ink shadow-[var(--shadow-card)]" : "font-medium text-muted hover:bg-surface/60 hover:text-ink")}>
                <Icon size={18} strokeWidth={on ? 2.4 : 2} aria-hidden /> {label}
              </Link>
            );
          })}
        </nav>
        <div className="mt-auto px-4 text-xs text-muted">
          {solving ? <span className="inline-flex items-center gap-1.5"><Loader2 size={14} className="animate-spin" aria-hidden /> Updating your plan</span> : "Prices are estimates until you add receipts."}
        </div>
      </aside>

      <div className="min-w-0">
        <header className="sticky top-0 z-20 flex items-center justify-between bg-bg/85 px-4 pb-3 backdrop-blur-xl md:hidden" style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 14px)" }}>
          <Link href="/"><Wordmark /></Link>
          {solving
            ? <span className="inline-flex items-center gap-1.5 rounded-full bg-surface px-3 py-1.5 text-xs font-medium text-muted shadow-[var(--shadow-card)]"><Loader2 size={13} className="animate-spin" aria-hidden /> Updating</span>
            : <Link href="/settings/" aria-label="Settings" className="press grid h-10 w-10 place-items-center rounded-full bg-surface text-ink shadow-[var(--shadow-card)]"><Settings size={18} aria-hidden /></Link>}
        </header>
        <main id="main" className="mx-auto w-full max-w-[1120px] px-4 pb-36 pt-3 sm:px-6 md:pb-12 md:pt-10">{children}</main>
      </div>

      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-30 flex items-center gap-3 px-4 md:hidden" style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 12px)" }}>
        <nav aria-label="Main" className="pointer-events-auto grid flex-1 grid-cols-4 gap-1 rounded-full bg-surface/95 p-1.5 shadow-[var(--shadow-float)] backdrop-blur-xl">
          {tabs.map(({ href, label, icon: Icon }) => {
            const on = href === "/more/" ? active(path, href) || MORE.some((m) => active(path, m.href)) : active(path, href);
            return (
              <Link key={href} href={href} aria-current={on ? "page" : undefined}
                className={cx("press flex min-h-[52px] flex-col items-center justify-center gap-0.5 rounded-full text-[11px]", on ? "bg-sunk font-semibold text-ink" : "font-medium text-muted")}>
                <Icon size={20} strokeWidth={on ? 2.4 : 2} aria-hidden /> {label}
              </Link>
            );
          })}
        </nav>
        <Link href="/groceries/" aria-label="Groceries" aria-current={groceriesOn ? "page" : undefined}
          className={cx("press pointer-events-auto grid h-16 w-16 shrink-0 place-items-center rounded-full bg-accent text-accent-ink shadow-[var(--shadow-float)]", groceriesOn && "ring-4 ring-ink/15")}>
          <ShoppingCart size={24} aria-hidden />
        </Link>
      </div>
    </div>
  );
}
