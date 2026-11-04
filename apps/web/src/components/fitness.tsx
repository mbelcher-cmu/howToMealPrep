"use client";
import { useEffect, useRef, useState } from "react";
import { Activity, Apple, Link2, Upload } from "lucide-react";
import { editMacroFree, kgToLb, summarizeAppleHealth, type HealthSummary } from "@prep-cart/nutrition";
import { isoDay, useApp } from "@/lib/store";
import { NumberField } from "./ui";

const FITBIT_CLIENT_ID = process.env.NEXT_PUBLIC_FITBIT_CLIENT_ID ?? "";
const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const GOAL_FACTOR = { lose: 0.8, maintain: 1, gain: 1.1 } as const;

async function readExport(file: File): Promise<string> {
  if (/\.xml$/i.test(file.name)) return file.text();
  const { unzip } = await import("fflate");
  const buf = new Uint8Array(await file.arrayBuffer());
  const files = await new Promise<Record<string, Uint8Array>>((resolve, reject) =>
    unzip(buf, { filter: (f) => /(^|\/)export\.xml$/.test(f.name) }, (err, out) => (err ? reject(err) : resolve(out))));
  const entry = Object.values(files)[0];
  if (!entry) throw new Error("That zip has no export.xml. In the Health app, tap your picture, then Export All Health Data.");
  return new TextDecoder().decode(entry);
}

/* ── Fitbit (OAuth 2 with PKCE, entirely in the browser) ── */
const b64url = (b: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const redirectUri = () => `${location.origin}${BASE}/settings/`;
async function startFitbit() {
  const verifier = b64url(crypto.getRandomValues(new Uint8Array(48)));
  const challenge = b64url(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)));
  try { sessionStorage.setItem("fitbit-verifier", verifier); } catch { /* ignore */ }
  const q = new URLSearchParams({ response_type: "code", client_id: FITBIT_CLIENT_ID, scope: "activity weight profile", code_challenge: challenge, code_challenge_method: "S256", redirect_uri: redirectUri() });
  location.assign(`https://www.fitbit.com/oauth2/authorize?${q}`);
}
async function finishFitbit(code: string): Promise<HealthSummary> {
  let verifier = "";
  try { verifier = sessionStorage.getItem("fitbit-verifier") ?? ""; } catch { /* ignore */ }
  const tok = await fetch("https://api.fitbit.com/oauth2/token", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: FITBIT_CLIENT_ID, grant_type: "authorization_code", code, code_verifier: verifier, redirect_uri: redirectUri() }),
  });
  if (!tok.ok) throw new Error(`Fitbit sign-in failed (${tok.status}).`);
  const { access_token } = (await tok.json()) as { access_token: string };
  const res = await fetch("https://api.fitbit.com/1/user/-/activities/calories/date/today/15d.json", { headers: { Authorization: `Bearer ${access_token}` } });
  if (!res.ok) throw new Error(`Couldn't read calories from Fitbit (${res.status}).`);
  const rows = ((await res.json())["activities-calories"] ?? []) as { dateTime: string; value: string }[];
  const days = rows.filter((r) => r.dateTime < isoDay() && Number(r.value) > 800);
  const avg = days.length ? Math.round(days.reduce((a, r) => a + Number(r.value), 0) / days.length) : null;
  return { maintenanceKcal: avg, activeKcal: null, restingKcal: null, days: days.length, from: days[0]?.dateTime ?? null, to: days.at(-1)?.dateTime ?? null, weightKg: null, weightOn: null };
}

export function FitnessSync() {
  const s = useApp();
  const file = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [result, setResult] = useState<(HealthSummary & { source: string }) | null>(null);
  const [mfp, setMfp] = useState({ protein: s.targets.protein, carbs: s.targets.carbs, fat: s.targets.fat });
  const [msg, setMsg] = useState("");

  useEffect(() => {
    const code = new URLSearchParams(location.search).get("code");
    if (!code || !FITBIT_CLIENT_ID) return;
    history.replaceState(null, "", location.pathname + "#fitness");
    setBusy(true);
    finishFitbit(code).then((r) => setResult({ ...r, source: "Fitbit" })).catch((e) => setErr(e instanceof Error ? e.message : String(e))).finally(() => setBusy(false));
  }, []);

  const onFile = async (f: File) => {
    setBusy(true); setErr(""); setResult(null);
    try {
      const xml = await readExport(f);
      const sum = summarizeAppleHealth(xml, 14, isoDay());
      if (!sum.maintenanceKcal && !sum.weightKg) throw new Error("No energy or weight readings found in that export.");
      setResult({ ...sum, source: "Apple Health" });
    } catch (e) { setErr(e instanceof Error ? e.message : "Couldn't read that file."); }
    finally { setBusy(false); }
  };

  const goalKcal = result?.maintenanceKcal ? Math.round((result.maintenanceKcal * GOAL_FACTOR[s.profile.goal]) / 10) * 10 : null;
  const useEnergy = () => {
    if (!goalKcal || !result) return;
    s.setCalories(goalKcal);
    s.set({ fitness: { source: result.source, maintenanceKcal: result.maintenanceKcal!, days: result.days, on: isoDay() } });
    setMsg(`Calories set to ${goalKcal.toLocaleString()} from ${result.source}.`);
  };
  const useMfp = () => {
    let t = s.targets;
    for (const k of ["protein", "carbs", "fat"] as const) t = editMacroFree(t, k, mfp[k]);
    s.set({ targets: t, splitPreset: "custom" });
    setMsg(`Targets set from your MyFitnessPal goals: ${t.kcal.toLocaleString()} kcal.`);
  };

  return (
    <div className="grid gap-5">
      {s.fitness && <p className="text-sm text-muted">Last synced from {s.fitness.source} on {new Date(`${s.fitness.on}T12:00:00`).toLocaleDateString()}: you burn about <b className="num text-ink">{s.fitness.maintenanceKcal.toLocaleString()}</b> kcal a day.</p>}

      <div className="grid gap-2">
        <h3 className="flex items-center gap-2 font-semibold"><Apple size={16} aria-hidden /> Apple Health</h3>
        <p className="text-sm text-muted">On your iPhone, open Health, tap your picture, then Export All Health Data. Save the zip to Files and choose it here. It's read on this device and never uploaded.</p>
        <div>
          <button className="btn" onClick={() => file.current?.click()} disabled={busy}><Upload size={16} aria-hidden /> {busy ? "Reading…" : "Choose export.zip"}</button>
          <input ref={file} type="file" accept=".zip,.xml,application/zip,text/xml" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void onFile(f); e.target.value = ""; }} />
        </div>
      </div>

      <div className="grid gap-2">
        <h3 className="flex items-center gap-2 font-semibold"><Activity size={16} aria-hidden /> Fitbit</h3>
        {FITBIT_CLIENT_ID ? (
          <>
            <p className="text-sm text-muted">Reads your last two weeks of calories burned. Prep Cart only asks to read activity and weight.</p>
            <div><button className="btn" onClick={() => void startFitbit()} disabled={busy}><Link2 size={16} aria-hidden /> Connect Fitbit</button></div>
          </>
        ) : (
          <p className="text-sm text-muted">Coming soon. Fitbit needs a free developer app registered for Prep Cart before it can connect.</p>
        )}
      </div>

      {(result || err) && (
        <div role="status" className={result ? "rounded-lg border border-accent bg-accent-soft p-3" : "rounded-lg bg-warn-soft p-3 text-sm text-warn"}>
          {err || (result && (
            <div className="grid gap-2 text-sm">
              <p>
                From {result.source}{result.days ? `, ${result.days} day${result.days === 1 ? "" : "s"} (${result.from} to ${result.to})` : ""}:
                {result.maintenanceKcal && <> you burn about <b className="num">{result.maintenanceKcal.toLocaleString()}</b> kcal a day{result.activeKcal != null && <> ({result.restingKcal?.toLocaleString()} resting + {result.activeKcal.toLocaleString()} active)</>}.</>}
                {result.weightKg && <> Latest weight {s.profile.units === "us" ? `${Math.round(kgToLb(result.weightKg))} lb` : `${result.weightKg} kg`} on {result.weightOn}.</>}
              </p>
              <div className="flex flex-wrap gap-2">
                {goalKcal && <button className="btn btn-sm btn-primary" onClick={useEnergy}>Set calories to {goalKcal.toLocaleString()}{s.profile.goal !== "maintain" ? ` (${s.profile.goal === "lose" ? "−20%" : "+10%"} for your goal)` : ""}</button>}
                {result.weightKg && <button className="btn btn-sm" onClick={() => { s.setProfile({ weightKg: result.weightKg! }); setMsg("Weight updated."); }}>Update my weight</button>}
              </div>
              {result.days > 0 && result.days < 7 && <p className="text-xs text-muted">Fewer than 7 days of data, so this estimate may swing.</p>}
            </div>
          ))}
        </div>
      )}

      <div className="grid gap-2">
        <h3 className="font-semibold">MyFitnessPal</h3>
        <p className="text-sm text-muted">MyFitnessPal has no public connection for other apps. Copy your daily goals from its Goals screen (in grams) and calories will follow from them.</p>
        <div className="grid grid-cols-3 gap-2">
          <NumberField compact label="Protein" value={mfp.protein} min={0} max={500} suffix="g" onChange={(protein) => setMfp({ ...mfp, protein })} />
          <NumberField compact label="Carbs" value={mfp.carbs} min={0} max={900} suffix="g" onChange={(carbs) => setMfp({ ...mfp, carbs })} />
          <NumberField compact label="Fat" value={mfp.fat} min={0} max={300} suffix="g" onChange={(fat) => setMfp({ ...mfp, fat })} />
        </div>
        <div><button className="btn btn-sm" onClick={useMfp}>Use these goals ({(mfp.protein * 4 + mfp.carbs * 4 + mfp.fat * 9).toLocaleString()} kcal)</button></div>
      </div>
      {msg && <p role="status" className="text-sm text-accent">{msg}</p>}
    </div>
  );
}
