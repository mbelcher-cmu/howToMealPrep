import { describe, expect, it } from "vitest";
import { syncOnce, type Local, type Remote } from "../src/lib/sync-engine";
import {
  fromSnapshot, merge, priceKey, same, toSnapshot,
  type Json, type PantryRec, type PlanBody, type PriceRec, type SettingsDocV2, type SyncBase,
} from "../src/lib/sync-rules";

/** A cloud account held in memory, with the same rules as the database (compare-and-swap settings). */
class MemoryCloud {
  doc: unknown = null;
  pantry: Record<string, PantryRec> = {};
  plans: Record<string, PlanBody & { stored: string }> = {};
  prices: { rowId: number; rec: PriceRec }[] = [];
  saves = 0;
  /** runs once just before the next settings save, to simulate another device racing us */
  beforeSave: (() => void) | null = null;
  remote(clock: () => number): Remote {
    return {
      load: async (since) => ({
        doc: structuredClone(this.doc),
        pantry: structuredClone(this.pantry),
        plans: Object.values(this.plans).map((p) => ({ id: p.id, createdAt: p.stored })),
        prices: this.prices.filter((p) => p.rowId > since).map((p) => structuredClone(p)),
      }),
      loadPlans: async (ids) => ids.map((id) => { const { stored: _s, ...p } = this.plans[id]!; return structuredClone(p); }),
      putPlans: async (ps) => { for (const p of ps) this.plans[p.id] ??= { ...structuredClone(p), stored: new Date(clock()).toISOString() }; },
      deletePlans: async (ids) => { for (const id of ids) delete this.plans[id]; },
      putPantry: async (rows) => { Object.assign(this.pantry, structuredClone(rows)); },
      deletePantry: async (ids) => { for (const id of ids) delete this.pantry[id]; },
      addPrices: async (recs) => {
        for (const r of recs) if (!this.prices.some((p) => priceKey(p.rec) === priceKey(r))) this.prices.push({ rowId: this.prices.length + 1, rec: { ...r, price: Math.round(r.price * 100) / 100 } });
      },
      saveSettings: async (expected, doc: SettingsDocV2) => {
        if (this.beforeSave) { const f = this.beforeSave; this.beforeSave = null; f(); }
        const cur = (this.doc as { savedAt?: number } | null)?.savedAt ?? 0;
        if (cur !== expected) return false;
        this.doc = structuredClone(doc);
        this.saves++;
        return true;
      },
    };
  }
}

const plan = (id: string): PlanBody => ({ id, key: `k${id}`, createdAt: "2026-11-01T00:00:00Z", days: 7, result: { cart: [], pantryUsed: [] }, schedule: { days: [] } });

/** A device: its own app state, last-change time and sync base. */
class Device {
  state: Json;
  at = 0;
  base: SyncBase | null = null;
  constructor(state: Json, private clock: { t: number }) { this.state = structuredClone(state); }
  edit(patch: Json) { this.state = { ...this.state, ...patch }; this.at = ++this.clock.t * 1000; }
  local(): Local {
    return { read: () => this.state, write: (p) => { this.state = { ...this.state, ...p }; }, localAt: () => this.at };
  }
  async sync(cloud: MemoryCloud, user = "u1") {
    for (let i = 0; i < 3; i++) {
      const now = ++this.clock.t * 1000;
      const r = await syncOnce(user, this.base, this.local(), cloud.remote(() => now), now);
      if (r.base) this.base = r.base;
      if (!r.again) return r;
    }
    throw new Error("sync did not settle");
  }
}

const fresh = (): Json => ({
  onboarded: false, profile: { zip: "" }, targets: { kcal: 2200 }, splitPreset: "highProtein", lockedMacros: ["protein"],
  meals: 3, snacks: 1, occasions: [], pantry: [{ ingredientId: "salt", grams: Infinity }], priceHistory: {},
  current: null, history: [], lastWeek: null, checked: {}, plusPreview: false, household: [],
});
const setUp = (patch: Json = {}): Json => ({ ...fresh(), onboarded: true, ...patch });

describe("snapshots", () => {
  it("round-trips the app state, keeping staples as Infinity", () => {
    const p = plan("1");
    const st = setUp({
      current: p, history: [p], pantry: [{ ingredientId: "salt", grams: Infinity }, { ingredientId: "rice", grams: 500, useBy: "2026-12-01" }],
      priceHistory: { rice: [{ chain: "aldi", price: 1.99, on: "2026-11-01", source: "manual" }] },
    });
    const { snapshot, plans } = toSnapshot(st);
    expect(snapshot.settings.currentId).toBe("1");
    expect(snapshot.settings).not.toHaveProperty("pantry");
    expect(snapshot.settings).not.toHaveProperty("plusPreview");
    expect(snapshot.pantry.salt).toEqual({ grams: null, useBy: null });
    const back = fromSnapshot(snapshot, plans);
    expect(back.current).toEqual(p);
    expect(back.pantry).toEqual([{ ingredientId: "rice", grams: 500, useBy: "2026-12-01" }, { ingredientId: "salt", grams: Infinity }]);
    expect(back.priceHistory).toEqual(st.priceHistory);
  });
  it("compares objects regardless of key order, as Postgres reorders them", () => {
    expect(same({ a: 1, b: { c: 2, d: 3 } }, { b: { d: 3, c: 2 }, a: 1 })).toBe(true);
    expect(same({ a: 1 }, { a: 2 })).toBe(false);
  });
});

describe("three-way merge", () => {
  const snap = (patch: Json) => toSnapshot(setUp(patch)).snapshot;
  it("keeps edits made to different things on each side", () => {
    const base = snap({});
    const local = snap({ household: [{ id: "m1" }] });
    const remote = snap({ targets: { kcal: 1800 }, splitPreset: "custom" });
    const m = merge(base, local, remote, { tie: "local", localBlank: false });
    expect(m.settings.household).toEqual([{ id: "m1" }]);
    expect(m.settings.targets).toEqual({ kcal: 1800 });
  });
  it("picks one side for linked settings when both changed them", () => {
    const base = snap({});
    const local = snap({ targets: { kcal: 2500 }, splitPreset: "custom" });
    const remote = snap({ targets: { kcal: 1800 }, lockedMacros: [] });
    const m = merge(base, local, remote, { tie: "remote", localBlank: false });
    expect(m.settings.targets).toEqual({ kcal: 1800 });
    expect(m.settings.splitPreset).toBe("highProtein");
    expect(m.settings.lockedMacros).toEqual([]);
  });
  it("merges the pantry item by item, including removals", () => {
    const base = snap({ pantry: [{ ingredientId: "rice", grams: 500 }, { ingredientId: "oats", grams: 300 }] });
    const local = snap({ pantry: [{ ingredientId: "rice", grams: 200 }, { ingredientId: "oats", grams: 300 }] });
    const remote = snap({ pantry: [{ ingredientId: "rice", grams: 500 }, { ingredientId: "beans", grams: 400 }] });
    const m = merge(base, local, remote, { tie: "local", localBlank: false });
    expect(Object.keys(m.pantry).sort()).toEqual(["beans", "rice"]);
    expect(m.pantry.rice!.grams).toBe(200);
  });
  it("a device that was never set up takes the account's copy", () => {
    const m = merge(null, toSnapshot(fresh()).snapshot, snap({ targets: { kcal: 1900 } }), { tie: "local", localBlank: true });
    expect(m.settings.onboarded).toBe(true);
    expect(m.settings.targets).toEqual({ kcal: 1900 });
  });
});

describe("syncing two devices through the cloud", () => {
  it("first sign-in uploads everything, and a new device gets it all", async () => {
    const clock = { t: 100 };
    const cloud = new MemoryCloud();
    const laptop = new Device(setUp({ current: plan("p1"), history: [plan("p1")], pantry: [{ ingredientId: "rice", grams: 900 }], priceHistory: { rice: [{ chain: "aldi", price: 1.89, on: "2026-11-02", source: "receipt" }] } }), clock);
    laptop.at = 50_000;
    const r = await laptop.sync(cloud);
    expect(r.pushed).toBe(true);
    expect(Object.keys(cloud.plans)).toEqual(["p1"]);
    expect(cloud.pantry.rice).toEqual({ grams: 900, useBy: null });
    expect(cloud.prices).toHaveLength(1);

    const phone = new Device(fresh(), clock);
    phone.at = 999_000; // touched, but never set up
    await phone.sync(cloud);
    expect(phone.state.onboarded).toBe(true);
    expect((phone.state.current as PlanBody).id).toBe("p1");
    expect(phone.state.pantry).toEqual([{ ingredientId: "rice", grams: 900 }]);
    expect((phone.state.priceHistory as Record<string, unknown[]>).rice).toHaveLength(1);
  });

  it("does nothing when a blank device meets an empty account", async () => {
    const cloud = new MemoryCloud();
    const r = await new Device(fresh(), { t: 1 }).sync(cloud);
    expect(r.pushed).toBe(false);
    expect(cloud.doc).toBeNull();
  });

  it("an edit on one device shows up on the other, and edits to different things both survive", async () => {
    const clock = { t: 100 };
    const cloud = new MemoryCloud();
    const a = new Device(setUp({ pantry: [{ ingredientId: "rice", grams: 900 }] }), clock);
    await a.sync(cloud);
    const b = new Device(fresh(), clock);
    await b.sync(cloud);

    a.edit({ pantry: [{ ingredientId: "rice", grams: 400 }] });
    b.edit({ targets: { kcal: 1700 }, splitPreset: "custom" });
    await a.sync(cloud);
    await b.sync(cloud);
    await a.sync(cloud);
    for (const d of [a, b]) {
      expect(d.state.pantry).toEqual([{ ingredientId: "rice", grams: 400 }]);
      expect(d.state.targets).toEqual({ kcal: 1700 });
    }
    expect(cloud.pantry.rice!.grams).toBe(400);
  });

  it("removing a pantry item on one device removes it everywhere", async () => {
    const clock = { t: 1 };
    const cloud = new MemoryCloud();
    const a = new Device(setUp({ pantry: [{ ingredientId: "rice", grams: 900 }, { ingredientId: "oats", grams: 100 }] }), clock);
    await a.sync(cloud);
    const b = new Device(fresh(), clock);
    await b.sync(cloud);
    b.edit({ pantry: [{ ingredientId: "rice", grams: 900 }] });
    await b.sync(cloud);
    await a.sync(cloud);
    expect(cloud.pantry).not.toHaveProperty("oats");
    expect(a.state.pantry).toEqual([{ ingredientId: "rice", grams: 900 }]);
  });

  it("a new plan travels to the other device, and old plans are tidied after an hour", async () => {
    const clock = { t: 1 };
    const cloud = new MemoryCloud();
    const a = new Device(setUp({ current: plan("p1"), history: [plan("p1")] }), clock);
    await a.sync(cloud);
    const b = new Device(fresh(), clock);
    await b.sync(cloud);
    a.edit({ current: plan("p2"), history: [plan("p2")] });
    await a.sync(cloud);
    await b.sync(cloud);
    expect((b.state.current as PlanBody).id).toBe("p2");
    expect(Object.keys(cloud.plans).sort()).toEqual(["p1", "p2"]);
    clock.t += 3600 * 2; // two hours on
    await a.sync(cloud);
    expect(Object.keys(cloud.plans)).toEqual(["p2"]);
  });

  it("when another device saves first, it merges again instead of overwriting", async () => {
    const clock = { t: 1 };
    const cloud = new MemoryCloud();
    const a = new Device(setUp(), clock);
    await a.sync(cloud);
    const b = new Device(fresh(), clock);
    await b.sync(cloud);
    b.edit({ household: [{ id: "kid" }] });
    await b.sync(cloud);
    // A edits, and B saves again in the moment between A reading and A saving
    a.edit({ meals: 4 });
    cloud.beforeSave = () => {
      const d = cloud.doc as SettingsDocV2;
      cloud.doc = { ...d, savedAt: d.savedAt + 1, settings: { ...d.settings, ratings: { r1: 5 } } };
    };
    await a.sync(cloud);
    const s = (cloud.doc as SettingsDocV2).settings;
    expect(s.meals).toBe(4);
    expect(s.household).toEqual([{ id: "kid" }]);
    expect(s.ratings).toEqual({ r1: 5 });
  });

  it("keeps a change the person made while a sync was running", async () => {
    const clock = { t: 1 };
    const cloud = new MemoryCloud();
    const a = new Device(setUp(), clock);
    await a.sync(cloud);
    const b = new Device(fresh(), clock);
    await b.sync(cloud);
    b.edit({ meals: 2 });
    await b.sync(cloud);
    // A starts a sync, and the person edits the pantry before it finishes
    cloud.beforeSave = () => a.edit({ pantry: [{ ingredientId: "eggs", grams: 600 }] });
    a.edit({ ratings: { r2: 4 } });
    const r = await syncOnce("u1", a.base, a.local(), cloud.remote(() => 0), ++clock.t * 1000);
    expect(r.again).toBe(true);
    expect(a.state.meals).toBe(2);
    expect(a.state.pantry).toEqual([{ ingredientId: "eggs", grams: 600 }]);
    a.base = r.base;
    await a.sync(cloud);
    expect(cloud.pantry.eggs!.grams).toBe(600);
    expect((cloud.doc as SettingsDocV2).settings.ratings).toEqual({ r2: 4 });
    expect((cloud.doc as SettingsDocV2).settings.meals).toBe(2);
  });

  it("moves an account from the old whole-app document into the tables", async () => {
    const clock = { t: 500 };
    const cloud = new MemoryCloud();
    const old = setUp({ current: plan("p9"), history: [plan("p9")], pantry: [{ ingredientId: "beans", grams: 250 }], targets: { kcal: 2000 } });
    cloud.doc = { v: 1, savedAt: 400, state: JSON.parse(JSON.stringify(old, (_k, x) => (x === Infinity ? "__inf" : x))) };
    const phone = new Device(fresh(), clock);
    await phone.sync(cloud);
    expect((cloud.doc as SettingsDocV2).v).toBe(2);
    expect(Object.keys(cloud.plans)).toEqual(["p9"]);
    expect(cloud.pantry.beans!.grams).toBe(250);
    expect(phone.state.targets).toEqual({ kcal: 2000 });
    expect((phone.state.current as PlanBody).id).toBe("p9");
  });

  it("signing in to a different account starts fresh instead of reusing the old base", async () => {
    const clock = { t: 1 };
    const one = new MemoryCloud(), two = new MemoryCloud();
    const a = new Device(setUp({ pantry: [{ ingredientId: "rice", grams: 1 }] }), clock);
    await a.sync(one, "u1");
    await a.sync(two, "u2");
    expect(a.base!.userId).toBe("u2");
    expect(two.pantry.rice!.grams).toBe(1);
  });
});
