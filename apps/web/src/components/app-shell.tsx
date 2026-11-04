"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { BookOpen, CalendarDays, ChefHat, Home, Package, Settings, ShoppingCart, Loader2, Sparkles, UtensilsCrossed } from "lucide-react";
import { useApp } from "@/lib/store";
import { useHydrated, usePlanner, usePlannerSync } from "@/lib/use-planner";
import { cx } from "@/lib/format";

const NAV = [
  { href: "/", label: "Home", icon: Home, primary: true },
  { href: "/plan/", label: "Plan", icon: CalendarDays, primary: true },
  { href: "/groceries/", label: "Groceries", icon: ShoppingCart, primary: true },
  { href: "/prep/", label: "Prep day", icon: ChefHat, primary: false },
  { href: "/eat-out/", label: "Eat out", icon: UtensilsCrossed, primary: false },
  { href: "/preps/", label: "Meal preps", icon: Sparkles, primary: false },
  { href: "/recipes/", label: "Recipes", icon: BookOpen, primary: true },
  { href: "/pantry/", label: "Pantry", icon: Package, primary: false },
  { href: "/plus/", label: "Plus", icon: Sparkles, primary: false },
  { href: "/settings/", label: "Settings", icon: Settings, primary: true },
];

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

  useEffect(() => {
    // offline support for the installed app; skipped in development so builds don't go stale
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register(`${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/sw.js`).catch(() => {});
  }, []);

  useEffect(() => {
    if (hydrated && !onboarded && !isOnboarding) router.replace("/welcome/");
  }, [hydrated, onboarded, isOnboarding, router]);

  if (isOnboarding || isShopping) return <main id="main" className="min-h-dvh">{children}</main>;

  return (
    <div className="min-h-dvh md:grid md:grid-cols-[232px_minmax(0,1fr)]">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-surface focus:p-2">Skip to content</a>
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-dvh flex-col border-r border-line bg-surface px-3 py-5 md:flex">
        <Link href="/" className="mb-6 px-3 font-display text-xl font-bold tracking-tight">
          Prep <span className="text-accent">Cart</span>
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
          <Link href="/" className="font-display text-lg font-bold">Prep <span className="text-accent">Cart</span></Link>
          {status === "solving" && <span className="inline-flex items-center gap-1.5 text-xs text-muted"><Loader2 size={14} className="animate-spin" aria-hidden /> Updating</span>}
        </header>
        <main id="main" className="mx-auto w-full max-w-[1120px] px-4 pb-28 pt-5 sm:px-6 md:pb-12 md:pt-8">{children}</main>
      </div>

      {/* Phone tab bar */}
      <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-line bg-surface md:hidden" style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}>
        {NAV.filter((n) => n.primary).map(({ href, label, icon: Icon }) => (
          <Link key={href} href={href} aria-current={active(path, href) ? "page" : undefined}
            className={cx("flex min-h-[56px] flex-col items-center justify-center gap-0.5 text-[11px] font-medium", active(path, href) ? "text-accent" : "text-muted")}>
            <Icon size={20} aria-hidden /> {label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
