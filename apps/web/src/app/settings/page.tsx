"use client";
import { useRef, useState, type ReactNode } from "react";
import { Download, LocateFixed, MapPin, RotateCcw, Upload } from "lucide-react";
import { BodyStatsEditor, MealStructureEditor, MoodEditor, RulesEditor, StoresEditor, TargetsEditor } from "@/components/editors";
import { FitnessSync } from "@/components/fitness";
import { HouseholdEditor } from "@/components/household";
import { Card, PageHeader, Segmented, SectionTitle, Tag } from "@/components/ui";
import { useApp } from "@/lib/store";
import { useHydrated } from "@/lib/use-planner";
import { currentPosition, pointForZip, storesNear } from "@/lib/nearby";
import { chainName } from "@/lib/format";

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

function NearbyFinder() {
  const s = useApp();
  const [state, setState] = useState<"idle" | "busy" | "error">("idle");
  const [err, setErr] = useState("");
  const [zip, setZip] = useState(s.profile.zip);
  const find = async (how: "zip" | "gps") => {
    setState("busy"); setErr("");
    try {
      const p = how === "gps" ? await currentPosition() : await pointForZip(zip);
      if (how === "zip") s.setProfile({ zip });
      const list = await storesNear(p);
      s.set({ nearby: list });
      setState("idle");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Something went wrong.");
      setState("error");
    }
  };
  const known = s.nearby.filter((n) => n.chain);
  const other = s.nearby.filter((n) => !n.chain);
  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-end gap-2">
        <div className="grid gap-1">
          <label htmlFor="zip" className="text-[13px] text-muted">ZIP code</label>
          <input id="zip" className="input w-28" inputMode="numeric" maxLength={5} value={zip} onChange={(e) => setZip(e.target.value.replace(/\D/g, ""))} />
        </div>
        <button className="btn" onClick={() => find("zip")} disabled={state === "busy" || zip.length !== 5}><MapPin size={16} aria-hidden /> Find stores</button>
        <button className="btn" onClick={() => find("gps")} disabled={state === "busy"}><LocateFixed size={16} aria-hidden /> Use my location</button>
      </div>
      {state === "busy" && <p role="status" className="text-sm text-muted">Looking up stores from OpenStreetMap…</p>}
      {state === "error" && <p role="alert" className="text-sm text-warn">{err}</p>}
      {s.nearby.length > 0 && (
        <div className="grid gap-3">
          <ul className="divide-y divide-line rounded-lg border border-line">
            {known.slice(0, 12).map((n) => {
              const on = !!n.chain && s.stores.includes(n.chain);
              return (
                <li key={n.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                  <span className="min-w-0 flex-1"><span className="block font-medium">{n.name}</span><span className="block text-xs text-muted">{n.address || "Address not listed"} · {n.distanceMi} mi</span></span>
                  {n.chain && <Tag>{on ? "Planning with" : chainName(n.chain)}</Tag>}
                </li>
              );
            })}
          </ul>
          {other.length > 0 && <p className="text-xs text-muted">Also nearby, without prices yet: {other.slice(0, 8).map((o) => o.name).join(", ")}{other.length > 8 ? ` and ${other.length - 8} more` : ""}.</p>}
        </div>
      )}
      <p className="text-xs text-muted">Store locations come from OpenStreetMap. Prices are only available for the four chains above for now.</p>
    </div>
  );
}

export default function Settings() {
  const hydrated = useHydrated();
  const s = useApp();
  const file = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState("");
  const [theme, setTheme] = useState<"system" | "light" | "dark">(() => (typeof document !== "undefined" ? (document.documentElement.dataset.theme as "light" | "dark" | undefined) ?? "system" : "system"));
  if (!hydrated) return null;
  const exportData = () => {
    const raw = localStorage.getItem("prep-cart-v1") ?? "{}";
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
      localStorage.setItem("prep-cart-v1", text);
      await useApp.persist.rehydrate();
      setMsg("Imported.");
    } catch { setMsg("That file isn't a Prep Cart backup."); }
  };
  return (
    <>
      <PageHeader title="Settings" lead="Everything here is saved on this device only." />
      <nav aria-label="Settings sections" className="mb-4 flex flex-wrap gap-2 text-sm">
        {[["you", "You"], ["household", "Household"], ["targets", "Targets"], ["meals", "Meals"], ["rules", "Food rules"], ["moods", "Moods"], ["stores", "Stores"], ["fitness", "Fitness apps"], ["data", "Data"]].map(([id, label]) => (
          <a key={id} href={`#${id}`} className="rounded-full border border-line bg-surface px-3 py-1 hover:bg-sunk">{label}</a>
        ))}
      </nav>
      <div className="grid max-w-[760px] gap-4">
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
        </Section>
        <Section id="targets" title="Calories and macros"><TargetsEditor /></Section>
        <Section id="meals" title="Meals and snacks"><MealStructureEditor /></Section>
        <Section id="rules" title="Food rules" lead="The planner never breaks these."><RulesEditor /></Section>
        <Section id="moods" title="In the mood for"><MoodEditor /></Section>
        <Section id="stores" title="Stores">
          <StoresEditor />
          <div className="mt-5 border-t border-line pt-4">
            <h3 className="label mb-2">Stores near me</h3>
            <NearbyFinder />
          </div>
        </Section>
        <Section id="fitness" title="Fitness apps" lead="Use what your watch or tracker measured instead of an estimate.">
          <FitnessSync />
        </Section>
        <Section id="data" title="Your data" lead="There's no account yet. Back up your settings and plans to a file to move them to another device.">
          <div className="flex flex-wrap gap-2">
            <button className="btn" onClick={exportData}><Download size={16} aria-hidden /> Download backup</button>
            <button className="btn" onClick={() => file.current?.click()}><Upload size={16} aria-hidden /> Restore backup</button>
            <input ref={file} type="file" accept="application/json" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void importData(f); e.target.value = ""; }} />
            <button className="btn text-warn" onClick={() => { if (window.confirm("Erase all settings, plans and pantry on this device?")) { s.reset(); setMsg("Everything was reset."); } }}>
              <RotateCcw size={16} aria-hidden /> Start over
            </button>
          </div>
          {msg && <p role="status" className="mt-2 text-sm text-muted">{msg}</p>}
          <p className="mt-4 text-xs text-muted">Nutrition is estimated from USDA ingredient data and is not medical advice. Prices are estimates for the Pittsburgh area and change often.</p>
        </Section>
      </div>
    </>
  );
}
