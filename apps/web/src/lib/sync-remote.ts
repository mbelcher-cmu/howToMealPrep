import type { SupabaseClient } from "@supabase/supabase-js";
import type { Remote } from "./sync-engine";
import { fromWire, priceKey, toWire, type PantryRec, type PlanBody, type PriceRec } from "./sync-rules";

/** The cloud side of sync, on Supabase. Row-level security limits every call to the signed-in person. */
export function supabaseRemote(sb: SupabaseClient, userId: string, zip: () => string): Remote {
  const check = <T>(r: { data: T; error: unknown }): T => { if (r.error) throw r.error; return r.data; };
  return {
    async load(since) {
      const [profile, pantry, plans, prices] = await Promise.all([
        sb.from("profiles").select("settings").eq("id", userId).maybeSingle(),
        sb.from("pantry_items").select("ingredient_id, grams, use_by"),
        sb.from("plans").select("client_id, created_at"),
        sb.from("price_observations").select("id, ingredient_id, chain, price, source, observed_on").gt("id", since).order("id").limit(5000),
      ]);
      const pantryRows = check(pantry) as { ingredient_id: string; grams: number | string | null; use_by: string | null }[];
      return {
        doc: (check(profile) as { settings: unknown } | null)?.settings ?? null,
        pantry: Object.fromEntries(pantryRows.map((r) => [r.ingredient_id, { grams: r.grams === null ? null : Number(r.grams), useBy: r.use_by }])),
        plans: (check(plans) as { client_id: string; created_at: string }[]).map((p) => ({ id: p.client_id, createdAt: p.created_at })),
        prices: (check(prices) as { id: number; ingredient_id: string; chain: string; price: number | string; source: PriceRec["source"]; observed_on: string }[])
          .map((p) => ({ rowId: Number(p.id), rec: { ingredientId: p.ingredient_id, chain: p.chain, price: Number(p.price), on: p.observed_on, source: p.source } })),
      };
    },
    async loadPlans(ids) {
      const rows = check(await sb.from("plans").select("client_id, input_key, created_at, days, result, schedule").in("client_id", ids)) as
        { client_id: string; input_key: string | null; created_at: string; days: number; result: unknown; schedule: unknown }[];
      return rows.map((r) => fromWire<PlanBody>({ id: r.client_id, key: r.input_key ?? "", createdAt: r.created_at, days: r.days, result: r.result, schedule: r.schedule }));
    },
    async putPlans(plans) {
      const rows = plans.map((p) => {
        const w = toWire(p);
        return { owner: userId, client_id: w.id, input_key: w.key, days: w.days, result: w.result, schedule: w.schedule, created_at: w.createdAt };
      });
      check(await sb.from("plans").upsert(rows, { onConflict: "owner,client_id", ignoreDuplicates: true }));
    },
    async deletePlans(ids) {
      check(await sb.from("plans").delete().in("client_id", ids));
    },
    async putPantry(rows: Record<string, PantryRec>) {
      const list = Object.entries(rows).map(([id, r]) => ({ owner: userId, ingredient_id: id, grams: r.grams, use_by: r.useBy }));
      check(await sb.from("pantry_items").upsert(list, { onConflict: "owner,ingredient_id" }));
    },
    async deletePantry(ids) {
      check(await sb.from("pantry_items").delete().in("ingredient_id", ids));
    },
    async addPrices(recs) {
      const z = /^\d{5}$/.test(zip()) ? zip() : null;
      const rows = recs.map((p) => ({
        owner: userId, ingredient_id: p.ingredientId, chain: p.chain, price: p.price, source: p.source, observed_on: p.on, zip: z,
        client_key: priceKey(p),
      }));
      // the database refuses silly prices; skip those rather than fail the whole sync
      const ok = rows.filter((r) => r.price > 0 && r.price < 1000);
      if (ok.length) check(await sb.from("price_observations").upsert(ok, { onConflict: "owner,client_key", ignoreDuplicates: true }));
    },
    async saveSettings(expected, doc) {
      return check(await sb.rpc("save_settings", { expected, doc })) === true;
    },
  };
}
