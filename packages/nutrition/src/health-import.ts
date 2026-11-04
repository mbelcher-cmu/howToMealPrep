/**
 * Read energy burned and body weight from an Apple Health export (export.xml). The export can
 * hold every reading for years, so this scans attributes with a regular expression instead of
 * building a DOM, and only keeps per-day totals.
 */
export interface HealthSummary {
  /** average daily calories burned (resting + active) over the days with both */
  maintenanceKcal: number | null;
  activeKcal: number | null;
  restingKcal: number | null;
  days: number;
  from: string | null;
  to: string | null;
  weightKg: number | null;
  weightOn: string | null;
}

const RECORD = /<Record\b([^>]*?)\/?>/g;
const ATTR = /(\w+)="([^"]*)"/g;
const ACTIVE = "HKQuantityTypeIdentifierActiveEnergyBurned";
const BASAL = "HKQuantityTypeIdentifierBasalEnergyBurned";
const MASS = "HKQuantityTypeIdentifierBodyMass";

const toKcal = (v: number, unit: string) => (/kj/i.test(unit) ? v / 4.184 : v);
const toKg = (v: number, unit: string) => (/lb/i.test(unit) ? v * 0.45359237 : v);

/**
 * @param xml the export.xml text
 * @param lastDays how many of the most recent complete days to average
 * @param today YYYY-MM-DD; that day is skipped because it is not over yet
 */
export function summarizeAppleHealth(xml: string, lastDays = 14, today?: string): HealthSummary {
  // day -> type -> source -> kcal. Phone and watch both log energy, so per day we keep the
  // larger source total instead of adding them up.
  const energy = new Map<string, { active: Map<string, number>; basal: Map<string, number> }>();
  let weight: { kg: number; on: string } | null = null;
  for (const m of xml.matchAll(RECORD)) {
    const body = m[1]!;
    const type = /type="([^"]+)"/.exec(body)?.[1];
    if (type !== ACTIVE && type !== BASAL && type !== MASS) continue;
    const a: Record<string, string> = {};
    for (const x of body.matchAll(ATTR)) a[x[1]!] = x[2]!;
    const value = Number(a.value);
    const day = (a.startDate ?? "").slice(0, 10);
    if (!Number.isFinite(value) || !/^\d{4}-\d{2}-\d{2}$/.test(day)) continue;
    if (type === MASS) {
      if (!weight || day >= weight.on) weight = { kg: toKg(value, a.unit ?? "kg"), on: day };
      continue;
    }
    const e = energy.get(day) ?? { active: new Map(), basal: new Map() };
    const bucket = type === ACTIVE ? e.active : e.basal;
    const src = a.sourceName ?? "";
    bucket.set(src, (bucket.get(src) ?? 0) + toKcal(value, a.unit ?? "kcal"));
    energy.set(day, e);
  }
  const best = (m: Map<string, number>) => (m.size ? Math.max(...m.values()) : 0);
  const days = [...energy.keys()].filter((d) => !today || d < today).sort().reverse()
    .filter((d) => energy.get(d)!.basal.size > 0 && energy.get(d)!.active.size > 0)
    .slice(0, lastDays);
  const sum = (f: (d: string) => number) => days.reduce((a, d) => a + f(d), 0);
  const active = days.length ? sum((d) => best(energy.get(d)!.active)) / days.length : null;
  const resting = days.length ? sum((d) => best(energy.get(d)!.basal)) / days.length : null;
  return {
    maintenanceKcal: active != null && resting != null ? Math.round(active + resting) : null,
    activeKcal: active != null ? Math.round(active) : null,
    restingKcal: resting != null ? Math.round(resting) : null,
    days: days.length,
    from: days.at(-1) ?? null,
    to: days[0] ?? null,
    weightKg: weight ? Math.round(weight.kg * 10) / 10 : null,
    weightOn: weight?.on ?? null,
  };
}
