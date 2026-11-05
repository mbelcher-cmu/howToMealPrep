"use client";
import Link from "next/link";
import { useRef, useState } from "react";
import { Dumbbell, Plus, Upload, X } from "lucide-react";
import {
  ACTIVITY_LEVELS, cleanTrainingWeek, parseWorkoutFile, restWeek, typicalWeek, WEEKDAYS, WORKOUT_TYPES, WORKOUTS,
  type ImportedWorkout, type TrainingWeek, type WorkoutType,
} from "@prep-cart/nutrition";
import { isoDay, useApp } from "@/lib/store";
import { useTrainingPlan } from "@/lib/training";
import { cx } from "@/lib/format";

const SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MINUTES = [15, 20, 30, 45, 60, 75, 90, 120, 150, 180, 240];

/** Unzip an Apple Health export.zip down to export.xml; other files are read as text. */
async function readFile(f: File): Promise<string> {
  if (!/\.zip$/i.test(f.name)) return f.text();
  const { unzip } = await import("fflate");
  const buf = new Uint8Array(await f.arrayBuffer());
  const files = await new Promise<Record<string, Uint8Array>>((resolve, reject) =>
    unzip(buf, { filter: (x) => /(^|\/)(export\.xml|activities\.csv)$/i.test(x.name) }, (err, out) => (err ? reject(err) : resolve(out))));
  const entry = Object.values(files)[0];
  if (!entry) throw new Error("That zip has no workouts in it. Choose the Apple Health export.zip, or Strava's activities.csv.");
  return new TextDecoder().decode(entry);
}

/** The person's usual week of training, and the calories it moves to training days. */
export function TrainingWeekEditor() {
  const training = useApp((s) => s.training);
  const set = useApp((s) => s.set);
  const profile = useApp((s) => s.profile);
  const setProfile = useApp((s) => s.setProfile);
  const applySuggested = useApp((s) => s.applySuggestedTargets);
  const tp = useTrainingPlan();
  const week = cleanTrainingWeek(training?.week);
  const file = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [err, setErr] = useState("");

  const save = (w: TrainingWeek, source: string | null = training?.source ?? null) => set({ training: { week: w, source, on: isoDay() } });
  const setDay = (d: number, i: number, patch: Partial<{ type: WorkoutType | "rest"; minutes: number }>) => {
    const w = week.map((x) => [...x]);
    if (patch.type === "rest") w[d] = w[d]!.filter((_, j) => j !== i);
    else {
      const cur = w[d]![i] ?? { type: "run" as WorkoutType, minutes: 45 };
      w[d]![i] = { type: (patch.type as WorkoutType) ?? cur.type, minutes: patch.minutes ?? cur.minutes };
    }
    save(w, null);
  };

  const onFile = async (files: FileList) => {
    setBusy(true); setErr(""); setNote("");
    try {
      const all: ImportedWorkout[] = [];
      let source = "";
      for (const f of [...files]) {
        const r = parseWorkoutFile(f.name, await readFile(f));
        all.push(...r.workouts);
        source = source && source !== r.source ? "your files" : r.source;
      }
      if (!all.length) throw new Error("No workouts found in that file. Try Strava's activities.csv, Garmin's Activities.csv, a .gpx or .tcx file, or the Apple Health export.");
      const t = typicalWeek(all, isoDay());
      if (!t.workouts) throw new Error("Those workouts are all more than four weeks old, so they can't show your usual week.");
      save(t.week, source);
      const days = t.week.filter((d) => d.length).length;
      setNote(`Read ${t.workouts} workouts from ${source} (${t.from} to ${t.to}). Your usual week has ${days} training day${days === 1 ? "" : "s"}. Change any day below.`);
    } catch (e) { setErr(e instanceof Error ? e.message : "Couldn't read that file."); }
    finally { setBusy(false); }
  };

  const extra = tp ? Math.max(...tp.days.map((d) => d.delta)) : 0;
  const rest = tp ? tp.days.filter((d) => !d.training) : [];
  const restKcal = rest.length ? Math.round(rest.reduce((a, d) => a + d.targets.kcal, 0) / rest.length) : null;
  const mismatch = tp && tp.matchingActivity !== profile.activity;

  return (
    <div className="grid gap-4">
      <p className="text-sm text-muted">Set the days you train. Your calories stay the same across the week, but more of them land on training days, mostly as carbs. Prepped portions are packed bigger on those days.</p>

      <ul className="grid gap-2" aria-label="Your training week">
        {WEEKDAYS.map((name, d) => {
          const workouts = week[d]!;
          const day = tp?.days[d];
          return (
            <li key={name} className="rounded-lg border border-line p-2.5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="w-10 shrink-0 text-sm font-semibold">{SHORT[d]}</span>
                {workouts.length === 0 && (
                  <>
                    <span className="text-sm text-muted">Rest</span>
                    <button type="button" className="btn btn-sm" onClick={() => setDay(d, 0, { type: "run" })} aria-label={`Add workout on ${name}`}>
                      <Plus size={14} aria-hidden /> Add workout
                    </button>
                  </>
                )}
                <span className="ml-auto num text-xs text-muted" aria-live="polite">
                  {day ? <>{day.targets.kcal.toLocaleString()} kcal{day.delta ? <span className={cx(day.delta > 0 && "font-semibold text-ink")}> ({day.delta > 0 ? "+" : "−"}{Math.abs(day.delta)})</span> : null}</> : null}
                </span>
              </div>
              {workouts.map((w, i) => (
                <div key={i} className="mt-2 flex flex-wrap items-center gap-2">
                  <label className="sr-only" htmlFor={`wk-${d}-${i}`}>{name} workout {i + 1}</label>
                  <select id={`wk-${d}-${i}`} className="input min-w-0 flex-1 basis-[150px]" value={w.type} onChange={(e) => setDay(d, i, { type: e.target.value as WorkoutType })}>
                    {WORKOUT_TYPES.map((k) => <option key={k} value={k}>{WORKOUTS[k].label}</option>)}
                  </select>
                  <label className="sr-only" htmlFor={`wm-${d}-${i}`}>{name} workout {i + 1} minutes</label>
                  <select id={`wm-${d}-${i}`} className="input w-[104px]" value={w.minutes} onChange={(e) => setDay(d, i, { minutes: Number(e.target.value) })}>
                    {[...new Set([...MINUTES, w.minutes])].sort((a, b) => a - b).map((m) => <option key={m} value={m}>{m} min</option>)}
                  </select>
                  <button type="button" className="btn btn-sm" onClick={() => setDay(d, i, { type: "rest" })} aria-label={`Remove ${WORKOUTS[w.type].label.toLowerCase()} on ${name}`}><X size={14} aria-hidden /></button>
                  {i === workouts.length - 1 && workouts.length < 2 && (
                    <button type="button" className="btn btn-sm" onClick={() => setDay(d, workouts.length, { type: "lift", minutes: 60 })} aria-label={`Add a second workout on ${name}`}><Plus size={14} aria-hidden /></button>
                  )}
                </div>
              ))}
            </li>
          );
        })}
      </ul>

      {tp && (
        <div role="status" className="rounded-lg bg-accent-soft p-3 text-sm">
          <p><Dumbbell size={14} className="mr-1 inline align-[-2px]" aria-hidden />{tp.trainingDays} training day{tp.trainingDays === 1 ? "" : "s"} burning about <b className="num">{tp.averageBurn.toLocaleString()}</b> kcal a day on average. Training days get up to <b className="num">+{extra.toLocaleString()}</b> kcal{restKcal ? <>, rest days <b className="num">{restKcal.toLocaleString()}</b></> : null}.</p>
          {mismatch && (
            <p className="mt-2">This week looks <b>{ACTIVITY_LEVELS[tp.matchingActivity].label.toLowerCase()}</b>, but your profile says {ACTIVITY_LEVELS[profile.activity].label.toLowerCase()}, which sets your weekly calories.{" "}
              <button type="button" className="font-semibold underline" onClick={() => { setProfile({ activity: tp.matchingActivity }); applySuggested(); setNote(`Activity set to ${ACTIVITY_LEVELS[tp.matchingActivity].label.toLowerCase()} and calories updated.`); }}>Match my calories to this week</button>
            </p>
          )}
        </div>
      )}

      <div className="grid gap-2 border-t border-line pt-4">
        <h3 className="font-semibold">Fill it in from a fitness app</h3>
        <p className="text-sm text-muted">Choose a workout export and MacroAisle finds your usual week from the last four weeks. Files are read on this device and never uploaded. Works with Strava (activities.csv from Download your data), Garmin Connect (Activities.csv), any .gpx or .tcx file, and the Apple Health export.zip.</p>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn" onClick={() => file.current?.click()} disabled={busy}><Upload size={16} aria-hidden /> {busy ? "Reading…" : "Import workouts"}</button>
          {training && week.some((x) => x.length) && <button type="button" className="btn" onClick={() => { save(restWeek(), null); setNote("Every day is a rest day now."); }}>Clear week</button>}
          <input ref={file} type="file" multiple accept=".csv,.gpx,.tcx,.xml,.zip,text/csv,application/zip" className="hidden" aria-label="Workout files" onChange={(e) => { if (e.target.files?.length) void onFile(e.target.files); e.target.value = ""; }} />
        </div>
        {err && <p role="alert" className="rounded-lg bg-warn-soft p-3 text-sm text-warn">{err}</p>}
      </div>
      {note && <p role="status" className="text-sm text-accent">{note}</p>}
      <p className="text-xs text-muted">Burn is estimated from each workout's typical intensity and your weight. Direct Strava and Fitbit sync is planned; see <Link href="/settings/#fitness" className="underline">Fitness apps</Link>.</p>
    </div>
  );
}

/** One line for Home and Prep: today's training and how to portion. */
export function TrainingToday({ weekday }: { weekday: number }) {
  const tp = useTrainingPlan();
  const day = tp?.days[weekday];
  if (!tp || !day) return null;
  const what = day.workouts.map((w) => `${WORKOUTS[w.type].label.toLowerCase()} ${w.minutes} min`).join(" + ");
  return (
    <p className={cx("flex flex-wrap items-center gap-x-2 rounded-lg px-3 py-2 text-sm", day.training ? "bg-accent-soft" : "bg-sunk")}>
      <Dumbbell size={14} aria-hidden />
      <b>{day.training ? "Training day" : "Rest day"}</b>
      {what && <span className="text-muted">{what}</span>}
      <span className="num ml-auto">{day.targets.kcal.toLocaleString()} kcal{day.delta ? ` (${day.delta > 0 ? "+" : "−"}${Math.abs(day.delta)})` : ""}</span>
    </p>
  );
}
