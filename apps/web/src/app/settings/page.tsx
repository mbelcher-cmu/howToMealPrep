"use client";
import { STORE_KEY } from "@/lib/env";
import { setDeviceFlag, useFlag } from "@/lib/flags";
import { analyticsOptedOut, setAnalyticsOptOut } from "@/lib/telemetry";
import Link from "next/link";
import { useRef, useState, type ReactNode } from "react";
import { Download, RotateCcw, Upload } from "lucide-react";
import { AccountPanel } from "@/components/account";
import { HouseholdShare } from "@/components/household-share";
import { BodyStatsEditor } from "@/components/editors";
import { FitnessSync } from "@/components/fitness";
import { HouseholdEditor } from "@/components/household";
import { PlusBadge, PlusGate } from "@/components/paywall";
import { useEntitlements } from "@/lib/entitlements";
import { Card, PageHeader, Segmented, SectionTitle } from "@/components/ui";
import { useAccount } from "@/lib/account";
import { useApp } from "@/lib/store";
import { useHydrated } from "@/lib/use-planner";

function Section({ id, title, lead, children }: { id: string; title: string; lead?: string; children: ReactNode }) {
  return (
    <Card as="section" className="scroll-mt-20">
      <div id={id} className="pointer-events-none -mt-20 pt-20" aria-hidden />
      <SectionTitle>{title}</SectionTitle>
      {lead && <p className="-mt-1 mb-4 text-sm text-muted">{lead}</p>}
      {children}
    </Card>
  );
}

export default function Settings() {
  const hydrated = useHydrated();
  const s = useApp();
  const file = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState("");
  const plus = useFlag("plus");
  const ent = useEntitlements();
  const accounts = useFlag("accounts");
  const training = useFlag("fitnessSync");
  const simple = useFlag("simple");
  const account = useAccount();
  const signedIn = account.status === "signedIn";
  const [noAnalytics, setNoAnalytics] = useState(() => typeof window !== "undefined" && analyticsOptedOut());
  const [theme, setTheme] = useState<"system" | "light" | "dark">(() => (typeof document !== "undefined" ? (document.documentElement.dataset.theme as "light" | "dark" | undefined) ?? "system" : "system"));
  if (!hydrated) return null;
  const exportData = () => {
    const raw = localStorage.getItem(STORE_KEY) ?? "{}";
    const url = URL.createObjectURL(new Blob([raw], { type: "application/json" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: `prep-cart-${new Date().toISOString().slice(0, 10)}.json` });
    a.click();
    URL.revokeObjectURL(url);
  };
  const importData = async (f: File) => {
    try {
      const text = await f.text();
      const parsed = JSON.parse(text) as { state?: unknown };
      if (!parsed || typeof parsed !== "object" || !parsed.state) throw new Error();
      localStorage.setItem(STORE_KEY, text);
      await useApp.persist.rehydrate();
      setMsg("Imported.");
    } catch { setMsg("That file isn't a MacroAisle backup."); }
  };
  return (
    <>
      <PageHeader title="Settings" lead={signedIn ? "Saved on this device and synced to your account." : "Everything here is saved on this device only."} />
      <nav aria-label="Settings sections" className="rail mb-4 text-sm">
        {[...(accounts && account.status !== "off" ? [["account", "Account"]] : []), ["you", "You"], ["household", "Household"], ...(simple ? [] : [["fitness", "Fitness apps"], ["plus", "MacroAisle Plus"]]), ["data", "Data"], ["features", "Features"]].map(([id, label]) => (
          <a key={id} href={`#${id}`} className="press inline-flex min-h-[40px] shrink-0 items-center whitespace-nowrap rounded-full bg-surface px-4 font-semibold shadow-[var(--shadow-card)] hover:bg-sunk">{label}</a>
        ))}
      </nav>
      <div className="grid max-w-[760px] gap-4">
        {accounts && account.status !== "off" && <Section id="account" title="Account" lead={signedIn ? undefined : "Sign in to keep your plan, pantry and settings on all your devices. Optional."}>
          <AccountPanel />
        </Section>}
        <Section id="you" title="You">
          <BodyStatsEditor />
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1">
              <span className="text-[13px] text-muted">Units</span>
              <Segmented label="Units" value={s.profile.units} onChange={(units) => s.setProfile({ units })} options={[{ value: "us", label: "US (lb, oz)" }, { value: "metric", label: "Metric (kg, g)" }]} />
            </div>
            <div className="grid gap-1">
              <span className="text-[13px] text-muted">Appearance</span>
              <Segmented label="Appearance" value={theme} onChange={(v) => {
                if (v === "system") delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = v;
                try { localStorage.setItem("prep-cart-theme", v); } catch { /* ignore */ }
                setTheme(v);
              }} options={[{ value: "system", label: "Auto" }, { value: "light", label: "Light" }, { value: "dark", label: "Dark" }]} />
            </div>
          </div>
        </Section>
        <Section id="household" title="Household" lead="Cook once for everyone. Each person gets portions sized to their own calories.">
          <HouseholdEditor />
          {accounts && <HouseholdShare />}
        </Section>
        <Card>
          <p className="text-sm">{simple
            ? <>Budget, calories, meals, diet and stores are on <Link href="/plan/" className="font-semibold text-accent underline">Goals</Link>.</>
            : <>Calories, meals, diet, moods and stores are on the <Link href="/plan/" className="font-semibold text-accent underline">Plan page</Link>, next to the plan they change.</>}</p>
        </Card>
        {!simple && <>
        <Section id="fitness" title="Fitness apps" lead="Use what your watch or tracker measured instead of an estimate.">
          <PlusGate feature="fitnessSync"><FitnessSync /></PlusGate>
          {training && <p className="mt-4 border-t border-line pt-4 text-sm">Train on some days and rest on others? Set your <Link href="/plan/" className="font-semibold text-accent underline">training days on the Plan page</Link> and import Strava, Garmin or Apple Health workouts there.</p>}
        </Section>
        {ent.gating ? (
          <Section id="plus" title="MacroAisle Plus" lead={ent.isPlus ? "You have Plus on this device (test mode)." : "Household plans for more people, unlimited recipe imports and fitness app sync. Planning stays free."}>
            <div className="flex flex-wrap items-center gap-3">
              {ent.isPlus && <PlusBadge />}
              <Link href="/plus/" className="btn">{ent.isPlus ? "Manage Plus" : "See Plus"}</Link>
            </div>
          </Section>
        ) : plus && <Section id="plus" title="MacroAisle Plus" lead="AI meal swaps, live prices and more, coming later.">
          <Link href="/plus/" className="btn">See what's in Plus</Link>
        </Section>}
        </>}
        <Section id="data" title="Your data" lead={signedIn ? "Your data syncs to your account. You can also keep a backup file." : "Back up your settings and plans to a file to move them to another device."}>
          <div className="flex flex-wrap gap-2">
            <button className="btn" onClick={exportData}><Download size={16} aria-hidden /> Download backup</button>
            <button className="btn" onClick={() => file.current?.click()}><Upload size={16} aria-hidden /> Restore backup</button>
            <input ref={file} type="file" accept="application/json" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void importData(f); e.target.value = ""; }} />
            <button className="btn text-warn" onClick={() => { if (window.confirm("Erase all settings, plans and pantry on this device?")) { s.reset(); setMsg("Everything was reset."); } }}>
              <RotateCcw size={16} aria-hidden /> Start over
            </button>
          </div>
          {msg && <p role="status" className="mt-2 text-sm text-muted">{msg}</p>}
          <label className="mt-4 flex items-start gap-2 text-sm">
            <input type="checkbox" className="mt-1" checked={!noAnalytics} onChange={(e) => { setAnalyticsOptOut(!e.target.checked); setNoAnalytics(!e.target.checked); }} />
            <span>Share anonymous usage stats, like how many plans are built, to help improve MacroAisle. Never your body stats, food or prices.</span>
          </label>
          <p className="mt-4 text-xs text-muted">Nutrition is estimated from USDA ingredient data and is not medical advice. Prices are estimates from Pittsburgh-area stores (Walmart and Aldi are similar nationwide) and change often.</p>
        </Section>
        <Section id="features" title="Features" lead={simple ? "MacroAisle shows just budget, goals, meals and your cart. Pantry, prep day, eating out, the shopping calendar, fitness and Plus are hidden, not gone." : "Every feature is showing."}>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" className="mt-1" checked={!simple} onChange={(e) => setDeviceFlag("simple", !e.target.checked)} />
            <span>Show all features on this device</span>
          </label>
        </Section>
      </div>
    </>
  );
}
