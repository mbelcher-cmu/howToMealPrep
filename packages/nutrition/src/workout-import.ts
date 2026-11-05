import { MAX_WORKOUT_MINUTES, restWeek, type TrainingWeek, type WorkoutType } from "./training";

/**
 * Read workouts from the files fitness apps export, entirely on the device:
 * - Strava: activities.csv from "Download your data" (Settings, My Account)
 * - Garmin Connect: Activities.csv from the Activities list (Export CSV)
 * - any app's single workout as .gpx or .tcx
 * - Apple Health: export.xml (Workout records)
 * - a plain CSV with a date, a type and a duration column
 * Then turn a few weeks of them into a typical training week.
 */
export interface ImportedWorkout {
  /** YYYY-MM-DD, local to where it was recorded */
  date: string;
  type: WorkoutType;
  minutes: number;
  /** what the app said, e.g. "Run" or "HKWorkoutActivityTypeRunning" */
  rawType: string;
  /** calories the app reported, when it did */
  kcal?: number;
}

export interface WorkoutImport {
  source: "Strava" | "Garmin" | "Apple Health" | "GPX" | "TCX" | "CSV";
  workouts: ImportedWorkout[];
  /** rows that could not be read */
  skipped: number;
}

/** Map an app's activity name to one of ours. */
export function workoutTypeFrom(raw: string): WorkoutType {
  const s = raw.replace(/^HKWorkoutActivityType/, "").replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase();
  if (/ruck|march/.test(s)) return "ruck";
  if (/run|jog|treadmill/.test(s)) return "run";
  if (/hiit|interval|circuit|boot ?camp|cross ?fit|cross ?training|functional|\bpt\b|calisthenic|kickbox|box(ing)?\b|mixed cardio|rowing|row\b|elliptical|stair/.test(s)) return "pt";
  if (/strength|weight|lift|resistance|core training/.test(s)) return "lift";
  if (/ride|cycl|bike|biking|spin/.test(s)) return "cycle";
  if (/swim/.test(s)) return "swim";
  if (/walk|hik/.test(s)) return "walk";
  if (/yoga|pilates|stretch|flexibility|mobility|tai chi|mind and body|cooldown/.test(s)) return "mobility";
  if (/soccer|basketball|football|tennis|volley|rugby|hockey|squash|racquet|pickle|badminton|martial|wrestl|climb|sport|golf|baseball|softball|lacrosse|paddle|surf|ski|skat/.test(s)) return "sports";
  return "other";
}

const MONTHS: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
const pad = (n: number) => String(n).padStart(2, "0");

/** A calendar day from the dates exports use: ISO, "Nov 3, 2026, 6:12:45 PM", or 11/03/2026. */
export function dayFrom(raw: string): string | null {
  const s = raw.trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = /^([A-Za-z]{3})[a-z]*\.? (\d{1,2}),? (\d{4})/.exec(s);
  if (m && MONTHS[m[1]!.toLowerCase()]) return `${m[3]}-${pad(MONTHS[m[1]!.toLowerCase()]!)}-${pad(Number(m[2]))}`;
  m = /^(\d{1,2}) ([A-Za-z]{3})[a-z]* (\d{4})/.exec(s);
  if (m && MONTHS[m[2]!.toLowerCase()]) return `${m[3]}-${pad(MONTHS[m[2]!.toLowerCase()]!)}-${pad(Number(m[1]))}`;
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(s);
  if (m) return `${m[3]}-${pad(Number(m[1]))}-${pad(Number(m[2]))}`;
  return null;
}

/** Minutes from "1:02:03", "45:10", "45:10.5", or plain seconds (Strava) / minutes. */
export function minutesFrom(raw: string, plainUnit: "seconds" | "minutes"): number | null {
  const s = raw.trim().replace(/,/g, "");
  if (!s) return null;
  if (s.includes(":")) {
    const parts = s.split(":").map(Number);
    if (parts.some((p) => !Number.isFinite(p))) return null;
    const [h, mi, se] = parts.length === 3 ? parts : [0, parts[0]!, parts[1]!];
    return h! * 60 + mi! + se! / 60;
  }
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return plainUnit === "seconds" ? n / 60 : n;
}

/** RFC 4180 CSV: quoted fields, doubled quotes, commas and newlines inside quotes. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], field = "", q = false;
  const src = text.replace(/^﻿/, "");
  for (let i = 0; i < src.length; i++) {
    const c = src[i]!;
    if (q) {
      if (c === '"' && src[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') q = false;
      else field += c;
    } else if (c === '"') q = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.some((x) => x.trim())) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((x) => x.trim())) rows.push(row);
  return rows;
}

const keep = (w: ImportedWorkout) => w.minutes >= 5 && w.minutes <= MAX_WORKOUT_MINUTES * 2;
const round = (w: ImportedWorkout): ImportedWorkout => ({ ...w, minutes: Math.round(w.minutes) });

/** Strava, Garmin or a plain CSV, told apart by their headers. */
export function parseWorkoutCsv(text: string): WorkoutImport {
  const rows = parseCsv(text);
  const head = (rows[0] ?? []).map((h) => h.trim().toLowerCase());
  const col = (...names: string[]) => { for (const n of names) { const i = head.indexOf(n); if (i >= 0) return i; } return -1; };
  const strava = head.includes("activity date") && head.includes("activity type");
  const garmin = !strava && head.includes("activity type") && head.includes("date");
  const source: WorkoutImport["source"] = strava ? "Strava" : garmin ? "Garmin" : "CSV";
  const iDate = col("activity date", "date", "start time", "start", "day");
  const iType = col("activity type", "type", "sport", "activity", "workout");
  // Strava: Elapsed Time is seconds (the first one is the summary column); Garmin: "Time" is h:mm:ss
  const iTime = strava ? col("moving time", "elapsed time") : col("time", "duration", "elapsed time", "moving time", "total time", "minutes", "duration (min)");
  const iKcal = col("calories", "active calories", "kcal", "energy");
  const unit: "seconds" | "minutes" = strava || /sec/.test(head[iTime] ?? "") ? "seconds" : "minutes";
  const workouts: ImportedWorkout[] = [];
  let skipped = 0;
  if (iDate < 0 || iTime < 0) return { source, workouts, skipped: Math.max(0, rows.length - 1) };
  for (const r of rows.slice(1)) {
    const date = dayFrom(r[iDate] ?? "");
    const minutes = minutesFrom(r[iTime] ?? "", unit);
    const rawType = (iType >= 0 ? r[iType] : "")?.trim() || "Workout";
    if (!date || minutes == null) { skipped++; continue; }
    const kcal = iKcal >= 0 ? Number((r[iKcal] ?? "").replace(/,/g, "")) : NaN;
    const w: ImportedWorkout = { date, type: workoutTypeFrom(rawType), minutes, rawType, ...(Number.isFinite(kcal) && kcal > 0 ? { kcal: Math.round(kcal) } : {}) };
    if (keep(w)) workouts.push(round(w)); else skipped++;
  }
  return { source, workouts, skipped };
}

const tag = (xml: string, name: string) => new RegExp(`<${name}\\b[^>]*>([^<]*)</${name}>`, "i").exec(xml)?.[1]?.trim();

/** One GPX track: type from <type>, duration from the first and last timestamps. */
export function parseGpx(xml: string): WorkoutImport {
  const times = [...xml.matchAll(/<time>([^<]+)<\/time>/gi)].map((m) => Date.parse(m[1]!)).filter(Number.isFinite);
  const first = /<trkpt\b[\s\S]*?<time>([^<]+)<\/time>/i.exec(xml)?.[1] ?? tag(xml, "time");
  const rawType = tag(xml, "type") ?? tag(xml, "name") ?? "Workout";
  if (times.length < 2 || !first) return { source: "GPX", workouts: [], skipped: 1 };
  const minutes = (Math.max(...times) - Math.min(...times)) / 60000;
  const w: ImportedWorkout = { date: first.slice(0, 10), type: workoutTypeFrom(rawType), minutes, rawType };
  return keep(w) ? { source: "GPX", workouts: [round(w)], skipped: 0 } : { source: "GPX", workouts: [], skipped: 1 };
}

/** Garmin Training Center files: each <Activity Sport="…"> with its laps' time and calories. */
export function parseTcx(xml: string): WorkoutImport {
  const workouts: ImportedWorkout[] = [];
  let skipped = 0;
  for (const m of xml.matchAll(/<Activity\b([^>]*)>([\s\S]*?)<\/Activity>/gi)) {
    const rawType = /Sport="([^"]+)"/.exec(m[1]!)?.[1] ?? "Other";
    const body = m[2]!;
    const date = (tag(body, "Id") ?? "").slice(0, 10);
    const secs = [...body.matchAll(/<TotalTimeSeconds>([\d.]+)<\/TotalTimeSeconds>/gi)].reduce((a, x) => a + Number(x[1]), 0);
    const kcal = [...body.matchAll(/<Calories>(\d+)<\/Calories>/gi)].reduce((a, x) => a + Number(x[1]), 0);
    const w: ImportedWorkout = { date, type: workoutTypeFrom(rawType), minutes: secs / 60, rawType, ...(kcal > 0 ? { kcal } : {}) };
    if (/^\d{4}-\d{2}-\d{2}$/.test(date) && keep(w)) workouts.push(round(w)); else skipped++;
  }
  return { source: "TCX", workouts, skipped };
}

/** Workout records in an Apple Health export.xml. */
export function parseAppleHealthWorkouts(xml: string): WorkoutImport {
  const workouts: ImportedWorkout[] = [];
  let skipped = 0;
  for (const m of xml.matchAll(/<Workout\b([^>]*?)\/?>/g)) {
    const a: Record<string, string> = {};
    for (const x of m[1]!.matchAll(/(\w+)="([^"]*)"/g)) a[x[1]!] = x[2]!;
    const date = (a.startDate ?? "").slice(0, 10);
    let minutes = Number(a.duration);
    if (/^s/i.test(a.durationUnit ?? "")) minutes /= 60;
    else if (/^h/i.test(a.durationUnit ?? "")) minutes *= 60;
    if (!Number.isFinite(minutes) && a.startDate && a.endDate) minutes = (Date.parse(a.endDate.replace(" ", "T").replace(/ ([+-]\d{2})(\d{2})$/, "$1:$2")) - Date.parse(a.startDate.replace(" ", "T").replace(/ ([+-]\d{2})(\d{2})$/, "$1:$2"))) / 60000;
    const kcalRaw = Number(a.totalEnergyBurned);
    const kcal = Number.isFinite(kcalRaw) && kcalRaw > 0 ? Math.round(/kj/i.test(a.totalEnergyBurnedUnit ?? "") ? kcalRaw / 4.184 : kcalRaw) : undefined;
    const rawType = a.workoutActivityType ?? "Workout";
    const w: ImportedWorkout = { date, type: workoutTypeFrom(rawType), minutes, rawType, ...(kcal ? { kcal } : {}) };
    if (/^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(minutes) && keep(w)) workouts.push(round(w)); else skipped++;
  }
  return { source: "Apple Health", workouts, skipped };
}

/** Pick the reader from the file's name and first bytes. */
export function parseWorkoutFile(name: string, text: string): WorkoutImport {
  const head = text.slice(0, 4000);
  if (/\.gpx$/i.test(name) || /<gpx\b/i.test(head)) return parseGpx(text);
  if (/\.tcx$/i.test(name) || /<TrainingCenterDatabase\b/i.test(head)) return parseTcx(text);
  if (/<HealthData\b/i.test(head) || /\.xml$/i.test(name)) return parseAppleHealthWorkouts(text);
  return parseWorkoutCsv(text);
}

const weekdayOf = (iso: string) => (new Date(`${iso}T12:00:00Z`).getUTCDay() + 6) % 7;
const addDays = (iso: string, n: number) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

export interface TypicalWeek {
  week: TrainingWeek;
  /** whole weeks of history the pattern came from */
  weeks: number;
  workouts: number;
  from: string | null;
  to: string | null;
}

/**
 * A typical week from recent workouts. A weekday counts as a training day when the person trained
 * on it in at least half of the weeks looked at; it gets that weekday's most common workout (by
 * time) and the median minutes of the days they trained.
 * @param today YYYY-MM-DD; only the `weeks` whole weeks before it are used
 */
export function typicalWeek(workouts: ImportedWorkout[], today: string, weeks = 4): TypicalWeek {
  const start = addDays(today, -7 * weeks);
  const recent = workouts.filter((w) => w.date >= start && w.date < today);
  // fewer weeks than asked when the history is short
  const earliest = recent.reduce((a, w) => (w.date < a ? w.date : a), today);
  const span = Math.max(1, Math.min(weeks, Math.ceil((Date.parse(`${today}T12:00:00Z`) - Date.parse(`${earliest}T12:00:00Z`)) / (7 * 86400000))));
  const byDay = new Map<string, ImportedWorkout[]>();
  for (const w of recent) byDay.set(w.date, [...(byDay.get(w.date) ?? []), w]);
  const week = restWeek();
  for (let wd = 0; wd < 7; wd++) {
    const days = [...byDay.entries()].filter(([d]) => weekdayOf(d) === wd).map(([, ws]) => ws);
    if (days.length < span / 2 || !days.length) continue;
    const time = new Map<WorkoutType, number>();
    for (const ws of days) for (const w of ws) time.set(w.type, (time.get(w.type) ?? 0) + w.minutes);
    const type = [...time.entries()].sort((a, b) => b[1] - a[1])[0]![0];
    const totals = days.map((ws) => ws.reduce((a, w) => a + w.minutes, 0)).sort((a, b) => a - b);
    const mid = totals.length / 2;
    const median = totals.length % 2 ? totals[Math.floor(mid)]! : (totals[mid - 1]! + totals[mid]!) / 2;
    week[wd] = [{ type, minutes: Math.min(MAX_WORKOUT_MINUTES, Math.round(median / 5) * 5) }];
  }
  const dates = recent.map((w) => w.date).sort();
  return { week, weeks: span, workouts: recent.length, from: dates[0] ?? null, to: dates.at(-1) ?? null };
}
