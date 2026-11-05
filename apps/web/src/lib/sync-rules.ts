/**
 * The rules for cloud sync, kept free of the browser and the network so they can be tested.
 *
 * Each kind of data lives in its own place in the cloud:
 * - settings (targets, preferences, household, the week's choices) as one document in profiles.settings
 * - pantry rows in pantry_items, one per ingredient
 * - saved plans in plans, one row each (plans never change once saved)
 * - recorded prices in price_observations, one row each (never change)
 *
 * Merging is three-way: each device remembers what the cloud held after its last sync (the base).
 * A part that changed on only one side takes that side; a part that changed on both takes the side
 * that changed most recently. So editing the pantry on a phone and targets on a laptop keeps both.
 */

export type Json = Record<string, unknown>;

/** A pantry row as stored in the cloud. grams null means a staple you always have. */
export interface PantryRec { grams: number | null; useBy: string | null }

export type PriceSource = "manual" | "receipt" | "sale";
export interface PriceRec { ingredientId: string; chain: string; price: number; on: string; source: PriceSource }

/** A saved plan, as the app keeps it. Only id matters to the merge. */
export interface PlanBody { id: string; key: string; createdAt: string; days: number; result: unknown; schedule: unknown }

/** Everything that syncs, in a form that compares cleanly. */
export interface Snapshot {
  /** settings, with plans replaced by their ids (currentId, lastWeekId, historyIds) */
  settings: Json;
  pantry: Record<string, PantryRec>;
  /** recorded prices by key */
  prices: Record<string, PriceRec>;
}

/** What the device remembers between syncs. */
export interface SyncBase {
  userId: string;
  snapshot: Snapshot;
  /** savedAt of the settings document this device last saw or wrote */
  savedAt: number;
  /** highest price_observations id already pulled */
  priceWatermark: number;
}

/** State keys that sync somewhere other than the settings document. */
const SEPARATE = new Set(["pantry", "priceHistory", "current", "history", "lastWeek"]);
/** State keys that stay on the device: they describe this browser, not the person. */
const DEVICE_ONLY = new Set(["plusPreview"]);

/**
 * Settings that only make sense together. A conflict picks one side for the whole group, so a
 * merge never pairs one device's calories with the other's macro split.
 */
const GROUPS: string[][] = [
  ["targets", "targetMode", "splitPreset", "lockedMacros", "balancer"],
  ["meals", "snacks", "occasions"],
  ["currentId", "historyIds", "lastWeekId", "checked", "shoppedPlanId", "pantryForPlan", "weekOf", "locked", "resting", "eatingOut", "days"],
  ["priceOverrides", "deals"],
];

// ---------- JSON helpers ----------

/** Encodes Infinity (pantry staples) so it survives JSON and Postgres. */
export const toWire = <T>(v: T): T => JSON.parse(JSON.stringify(v, (_k, x) => (x === Infinity ? "__inf" : x))) as T;
export const fromWire = <T>(v: T): T => JSON.parse(JSON.stringify(v), (_k, x) => (x === "__inf" ? Infinity : x)) as T;

/** JSON with sorted keys: Postgres jsonb doesn't keep key order, so compare this way. */
export function stable(v: unknown): string {
  if (v === undefined) return "undefined";
  if (v === Infinity) return '"__inf"';
  if (v === null || typeof v !== "object") return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map((x) => (x === undefined ? "null" : stable(x))).join(",")}]`;
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o).filter((k) => o[k] !== undefined).sort().map((k) => `${JSON.stringify(k)}:${stable(o[k])}`).join(",")}}`;
}
export const same = (a: unknown, b: unknown) => stable(a) === stable(b);

// ---------- app state <-> snapshot ----------

type PantryRow = { ingredientId: string; grams: number; useBy?: string };
type PriceHistory = Record<string, { chain: string; price: number; on: string; source: PriceSource }[]>;

/** The cloud keeps cents, so the key does too. */
export const priceKey = (p: PriceRec) => `${p.ingredientId}|${p.chain}|${p.on}|${p.price.toFixed(2)}|${p.source}`;

/** Splits the saved app state into the parts that sync, and the plan bodies it references. */
export function toSnapshot(state: Json): { snapshot: Snapshot; plans: Record<string, PlanBody> } {
  const settings: Json = {};
  for (const [k, v] of Object.entries(state)) {
    if (typeof v === "function" || SEPARATE.has(k) || DEVICE_ONLY.has(k)) continue;
    settings[k] = v;
  }
  const current = state.current as PlanBody | null | undefined;
  const lastWeek = state.lastWeek as PlanBody | null | undefined;
  const history = (state.history as PlanBody[] | undefined) ?? [];
  settings.currentId = current?.id ?? null;
  settings.lastWeekId = lastWeek?.id ?? null;
  settings.historyIds = history.map((h) => h.id);

  const plans: Record<string, PlanBody> = {};
  for (const p of [current, lastWeek, ...history]) if (p) plans[p.id] = p;

  const pantry: Record<string, PantryRec> = {};
  for (const r of (state.pantry as PantryRow[] | undefined) ?? []) {
    pantry[r.ingredientId] = { grams: r.grams === Infinity ? null : r.grams, useBy: r.grams === Infinity ? null : r.useBy ?? null };
  }

  const prices: Record<string, PriceRec> = {};
  for (const [ingredientId, list] of Object.entries((state.priceHistory as PriceHistory | undefined) ?? {})) {
    for (const e of list) { const p = { ingredientId, chain: e.chain, price: e.price, on: e.on, source: e.source }; prices[priceKey(p)] = p; }
  }
  return { snapshot: { settings: toWire(settings), pantry, prices }, plans };
}

/** How many prices the app keeps per ingredient. */
const PRICES_KEPT = 30;

/**
 * Rebuilds the app state's synced parts from a snapshot. Plans come from planBodies; a plan the
 * snapshot points at but nobody has any more is dropped rather than left dangling.
 */
export function fromSnapshot(s: Snapshot, planBodies: Record<string, PlanBody>): Json {
  const { currentId, lastWeekId, historyIds, ...rest } = fromWire(s.settings) as Json & { currentId?: string | null; lastWeekId?: string | null; historyIds?: string[] };
  const plan = (id: string | null | undefined) => (id && planBodies[id]) || null;
  const priceHistory: PriceHistory = {};
  for (const p of Object.values(s.prices).sort((a, b) => a.on.localeCompare(b.on))) {
    (priceHistory[p.ingredientId] ??= []).push({ chain: p.chain, price: p.price, on: p.on, source: p.source });
  }
  for (const k of Object.keys(priceHistory)) priceHistory[k] = priceHistory[k]!.slice(-PRICES_KEPT);
  return {
    ...rest,
    current: plan(currentId),
    lastWeek: plan(lastWeekId),
    history: (historyIds ?? []).map((id) => planBodies[id]).filter((p): p is PlanBody => !!p),
    pantry: Object.entries(s.pantry).sort(([a], [b]) => a.localeCompare(b)).map(([ingredientId, r]) =>
      r.grams === null ? { ingredientId, grams: Infinity } : { ingredientId, grams: r.grams, ...(r.useBy ? { useBy: r.useBy } : {}) }),
    priceHistory,
  };
}

/** Drops prices the app would no longer keep, so they don't come back on every sync. */
export function trimPrices(prices: Record<string, PriceRec>): Record<string, PriceRec> {
  const by: Record<string, PriceRec[]> = {};
  for (const p of Object.values(prices)) (by[p.ingredientId] ??= []).push(p);
  const out: Record<string, PriceRec> = {};
  for (const list of Object.values(by)) for (const p of list.sort((a, b) => a.on.localeCompare(b.on)).slice(-PRICES_KEPT)) out[priceKey(p)] = p;
  return out;
}

// ---------- merging ----------

/** Who wins when both sides changed the same thing. */
export type Tiebreak = "local" | "remote";

/** Three-way merge of one value; undefined means "not there". */
function pick<T>(base: T | undefined, local: T | undefined, remote: T | undefined, tie: Tiebreak): T | undefined {
  if (same(local, remote)) return local;
  if (same(local, base)) return remote;
  if (same(remote, base)) return local;
  return tie === "local" ? local : remote;
}

function mergeMap<T>(base: Record<string, T> | null, local: Record<string, T>, remote: Record<string, T>, tie: Tiebreak): Record<string, T> {
  const out: Record<string, T> = {};
  for (const k of new Set([...Object.keys(local), ...Object.keys(remote)])) {
    const l = local[k], r = remote[k];
    let v: T | undefined;
    if (!base) v = l === undefined ? r : r === undefined ? l : pick(undefined, l, r, tie);
    else v = pick(base[k], l, r, tie);
    if (v !== undefined) out[k] = v;
  }
  return out;
}

function mergeSettings(base: Json | null, local: Json, remote: Json, tie: Tiebreak): Json {
  const keys = new Set([...Object.keys(local), ...Object.keys(remote), ...Object.keys(base ?? {})]);
  const groups: string[][] = GROUPS.map((g) => g.filter((k) => keys.has(k)));
  const grouped = new Set(GROUPS.flat());
  for (const k of keys) if (!grouped.has(k)) groups.push([k]);
  const out: Json = {};
  for (const g of groups) {
    if (!g.length) continue;
    const slice = (o: Json | null) => (o ? Object.fromEntries(g.map((k) => [k, o[k]])) : undefined);
    const l = slice(local)!, r = slice(remote)!;
    // a part missing on one side (an app version that predates it) never wins over a real value
    const lHas = g.some((k) => local[k] !== undefined), rHas = g.some((k) => remote[k] !== undefined);
    const chosen = !lHas ? r : !rHas ? l : base ? pick(slice(base), l, r, tie)! : (same(l, r) ? l : tie === "local" ? l : r);
    for (const k of g) if (chosen[k] !== undefined) out[k] = chosen[k];
  }
  return out;
}

/**
 * Merges this device's snapshot with the cloud's.
 * - base null: this device hasn't synced with this account before. Both sides' data is kept; where
 *   both have something different, the more recent side wins.
 * - localBlank: this device was never set up, so it simply takes the cloud copy.
 */
export function merge(base: Snapshot | null, local: Snapshot, remote: Snapshot, opts: { tie: Tiebreak; localBlank: boolean }): Snapshot {
  if (opts.localBlank) return { settings: remote.settings, pantry: remote.pantry, prices: trimPrices({ ...local.prices, ...remote.prices }) };
  return {
    settings: mergeSettings(base?.settings ?? null, local.settings, remote.settings, opts.tie),
    pantry: mergeMap(base?.pantry ?? null, local.pantry, remote.pantry, opts.tie),
    // prices are only ever added, so the union is always right
    prices: trimPrices({ ...remote.prices, ...local.prices }),
  };
}

/** Plan ids the snapshot points at. */
export function planRefs(s: Snapshot): string[] {
  const st = s.settings as { currentId?: string | null; lastWeekId?: string | null; historyIds?: string[] };
  return [...new Set([st.currentId, st.lastWeekId, ...(st.historyIds ?? [])].filter((x): x is string => !!x))];
}

/** The cloud's settings document. */
export interface SettingsDocV2 { v: 2; savedAt: number; settings: Json }
/** The first version stored the whole app state in one document. */
export interface SettingsDocV1 { v: 1; savedAt: number; state: Json }

export function isDocV2(x: unknown): x is SettingsDocV2 {
  const d = x as SettingsDocV2 | null;
  return !!d && typeof d === "object" && d.v === 2 && typeof d.savedAt === "number" && !!d.settings && typeof d.settings === "object";
}
export function isDocV1(x: unknown): x is SettingsDocV1 {
  const d = x as SettingsDocV1 | null;
  return !!d && typeof d === "object" && d.v === 1 && typeof d.savedAt === "number" && !!d.state && typeof d.state === "object";
}

/** Whether the cloud's copy is newer than this device's last change, for tie-breaks. */
export const tiebreak = (localAt: number, remoteSavedAt: number): Tiebreak => (remoteSavedAt > localAt ? "remote" : "local");
