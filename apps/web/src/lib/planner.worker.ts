/// <reference lib="webworker" />
import type highsLoaderType from "highs";
import { applyDeals, buildPriceTable, plan, schedule, type Deal, type PlanRequest } from "@prep-cart/planner";
import { buildRecipe, registerRecipes, type RecipeSeed } from "@prep-cart/catalog";

type Msg = { id: number; base: string; req: Omit<PlanRequest, "prices"> & { priceOverrides: Parameters<typeof buildPriceTable>[0]; deals: Deal[]; today: string; customRecipes: RecipeSeed[] } };

type Loader = typeof highsLoaderType;
let highsPromise: ReturnType<Loader> | null = null;

/** Load the solver's script from the site (not the bundle) and start it. */
function loadHighs(base: string): ReturnType<Loader> {
  const g = self as unknown as { Module?: Loader; importScripts: (u: string) => void };
  if (!g.Module) g.importScripts(`${base}/highs.js`);
  return g.Module!({ locateFile: (file: string) => `${base}/${file}` });
}

self.onmessage = async (e: MessageEvent<Msg>) => {
  const { id, base, req } = e.data;
  try {
    highsPromise ??= loadHighs(base);
    const highs = await highsPromise;
    const { priceOverrides, deals, today, customRecipes, ...rest } = req;
    registerRecipes(customRecipes.flatMap((sd) => { try { return [buildRecipe(sd)]; } catch { return []; } }));
    const result = plan({ ...rest, prices: applyDeals(buildPriceTable(priceOverrides), deals, today) }, highs as never);
    const sched = schedule(result, req.occasions, req.days, req.variety.rotation, req.targets);
    (self as unknown as Worker).postMessage({ id, ok: true, result, schedule: sched });
  } catch (err) {
    // a crashed solver instance can't be reused; load a fresh one next time
    highsPromise = null;
    (self as unknown as Worker).postMessage({ id, ok: false, error: err instanceof Error ? err.message : String(err) });
  }
};
