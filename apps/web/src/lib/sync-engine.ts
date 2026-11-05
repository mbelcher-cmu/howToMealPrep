import {
  fromSnapshot, isDocV1, isDocV2, merge, planRefs, priceKey, same, tiebreak, toSnapshot,
  type Json, type PantryRec, type PlanBody, type PriceRec, type SettingsDocV2, type Snapshot, type SyncBase,
} from "./sync-rules";

/**
 * One sync between this device and the account, written against two small interfaces so the
 * whole round trip can be tested without a browser or a server.
 */

/** What the cloud holds, as read at the start of a sync. */
export interface RemoteState {
  /** profiles.settings */
  doc: unknown;
  pantry: Record<string, PantryRec>;
  /** ids and save times of the plans stored in the cloud */
  plans: { id: string; createdAt: string }[];
  /** price rows newer than the watermark asked for */
  prices: { rowId: number; rec: PriceRec }[];
}

export interface Remote {
  load(sincePriceId: number): Promise<RemoteState>;
  loadPlans(ids: string[]): Promise<PlanBody[]>;
  putPlans(plans: PlanBody[]): Promise<void>;
  deletePlans(ids: string[]): Promise<void>;
  putPantry(rows: Record<string, PantryRec>): Promise<void>;
  deletePantry(ingredientIds: string[]): Promise<void>;
  addPrices(recs: PriceRec[]): Promise<void>;
  /** saves only if the cloud's savedAt still equals expected; false means someone else saved first */
  saveSettings(expected: number, doc: SettingsDocV2): Promise<boolean>;
}

export interface Local {
  /** the saved app state, as plain data */
  read(): Json;
  /** applies synced parts to the app without counting as a local change */
  write(patch: Json): void;
  /** when this device last changed something (ms) */
  localAt(): number;
}

export interface SyncResult {
  /** what to remember for next time; null leaves the old base alone */
  base: SyncBase | null;
  /** run again soon: the cloud moved under us, or the person edited during the sync */
  again: boolean;
  /** what happened, for tests and telemetry */
  pulled: boolean;
  pushed: boolean;
}

/** Plans no longer referenced are removed from the cloud after this long. */
const PLAN_GRACE_MS = 60 * 60 * 1000;

export async function syncOnce(userId: string, prior: SyncBase | null, local: Local, remote: Remote, now = Date.now()): Promise<SyncResult> {
  const start = local.read();
  const { snapshot: L, plans: localPlans } = toSnapshot(start);
  const base = prior?.userId === userId ? prior : null;
  const rs = await remote.load(base?.priceWatermark ?? 0);

  // the cloud's side, in the same shape
  const pulledPrices: Record<string, PriceRec> = {};
  for (const p of rs.prices) pulledPrices[priceKey(p.rec)] = p.rec;
  let R: Snapshot;
  let remoteSavedAt = 0;
  const bodies: Record<string, PlanBody> = {};
  let legacy = false;
  if (isDocV2(rs.doc)) {
    R = { settings: rs.doc.settings, pantry: rs.pantry, prices: { ...(base?.snapshot.prices ?? {}), ...pulledPrices } };
    remoteSavedAt = rs.doc.savedAt;
  } else if (isDocV1(rs.doc)) {
    // an account from before per-table sync: its document holds everything, so move it into the tables
    legacy = true;
    const old = toSnapshot(rs.doc.state);
    Object.assign(bodies, old.plans);
    R = { settings: old.snapshot.settings, pantry: Object.keys(rs.pantry).length ? rs.pantry : old.snapshot.pantry, prices: { ...old.snapshot.prices, ...pulledPrices } };
    remoteSavedAt = rs.doc.savedAt;
  } else {
    R = { settings: {}, pantry: rs.pantry, prices: pulledPrices };
  }
  const hasDoc = legacy || isDocV2(rs.doc);
  const onboarded = start.onboarded === true;

  // a device that was never set up has nothing to give an empty account
  if (!hasDoc && !onboarded) return { base: null, again: false, pulled: false, pushed: false };

  const M = merge(base?.snapshot ?? null, L, R, { tie: tiebreak(local.localAt(), remoteSavedAt), localBlank: hasDoc && !onboarded });

  // plans: send ours the cloud lacks, fetch the ones we lack, forget any nobody has
  Object.assign(bodies, localPlans);
  const remoteIds = new Set(rs.plans.map((p) => p.id));
  const refs = planRefs(M);
  const upload = refs.filter((id) => !remoteIds.has(id) && bodies[id]).map((id) => bodies[id]!);
  const download = refs.filter((id) => !bodies[id] && remoteIds.has(id));
  if (download.length) for (const p of await remote.loadPlans(download)) bodies[p.id] = p;
  M.settings = dropMissingPlans(M.settings, bodies);
  if (upload.length) await remote.putPlans(upload);

  // pantry: make the cloud's rows match the merge
  const put: Record<string, PantryRec> = {};
  for (const [id, r] of Object.entries(M.pantry)) if (!same(rs.pantry[id], r)) put[id] = r;
  const gone = Object.keys(rs.pantry).filter((id) => !M.pantry[id]);
  if (Object.keys(put).length) await remote.putPantry(put);
  if (gone.length) await remote.deletePantry(gone);

  // prices: send the ones the cloud hasn't seen
  const newPrices = Object.entries(M.prices).filter(([k]) => !R.prices[k]).map(([, p]) => p);
  if (newPrices.length) await remote.addPrices(newPrices);

  // settings last, so they never point at a plan the cloud doesn't have yet
  let savedAt = remoteSavedAt;
  const settingsChanged = legacy || !hasDoc || !same(M.settings, R.settings);
  if (settingsChanged) {
    savedAt = Math.max(now, local.localAt(), remoteSavedAt + 1);
    const ok = await remote.saveSettings(remoteSavedAt, { v: 2, savedAt, settings: M.settings });
    if (!ok) return { base: prior, again: true, pulled: false, pushed: false };
  }

  // tidy plans that fell out of the history a while ago
  const keep = new Set(planRefs(M));
  const stale = rs.plans.filter((p) => !keep.has(p.id) && now - Date.parse(p.createdAt) > PLAN_GRACE_MS).map((p) => p.id);
  if (stale.length) await remote.deletePlans(stale);

  // apply to this device, keeping anything the person changed while we were busy
  const nowState = local.read();
  const { snapshot: C, plans: nowPlans } = toSnapshot(nowState);
  Object.assign(bodies, nowPlans);
  const final = merge(L, C, M, { tie: "local", localBlank: false });
  final.settings = dropMissingPlans(final.settings, bodies);
  const pulled = !same(final, C);
  if (pulled) local.write(fromSnapshot(final, bodies));

  const watermark = Math.max(base?.priceWatermark ?? 0, ...rs.prices.map((p) => p.rowId));
  const pushed = settingsChanged || upload.length > 0 || Object.keys(put).length > 0 || gone.length > 0 || newPrices.length > 0;
  return { base: { userId, snapshot: M, savedAt, priceWatermark: watermark }, again: !same(final, M), pulled, pushed };
}

function dropMissingPlans(settings: Json, bodies: Record<string, PlanBody>): Json {
  const s = settings as Json & { currentId?: string | null; lastWeekId?: string | null; historyIds?: string[] };
  const has = (id: string | null | undefined) => !!id && !!bodies[id];
  if ((!s.currentId || has(s.currentId)) && (!s.lastWeekId || has(s.lastWeekId)) && (s.historyIds ?? []).every(has)) return settings;
  return { ...s, currentId: has(s.currentId) ? s.currentId : null, lastWeekId: has(s.lastWeekId) ? s.lastWeekId : null, historyIds: (s.historyIds ?? []).filter(has) };
}
