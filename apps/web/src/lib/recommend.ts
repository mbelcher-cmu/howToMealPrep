"use client";
import { useEffect, useMemo } from "react";
import { create } from "zustand";
import { recommend, type Community, type Preferences, type Recommendation } from "@prep-cart/planner";
import { STORE_KEY } from "./env";
import { flag, useFlag } from "./flags";
import { safeStorage } from "./storage";
import { useApp } from "./store";
import { supabase } from "./supabase";
import { reportError } from "./telemetry";

/**
 * Recommendations on the device. Your star ratings and the community numbers from the database
 * (recipe_community(), shared only across 3+ people) feed recommend() in @prep-cart/planner. With an
 * account, your ratings are mirrored to the community after each sync so they help others too.
 */
const COMMUNITY_KEY = `${STORE_KEY}:community`;
const PUSHED_KEY = `${STORE_KEY}:ratings-pushed`;
/** refetch the community numbers at most this often */
const FRESH_MS = 6 * 60 * 60 * 1000;

interface CommunityState { data: Community | null; fetchedAt: number }
const readCached = (): CommunityState => {
  try {
    const c = JSON.parse(safeStorage.getItem(COMMUNITY_KEY) ?? "null") as CommunityState | null;
    if (c && Array.isArray(c.data?.neighbors) && Array.isArray(c.data?.stats)) return c;
  } catch { /* ignore a damaged cache */ }
  return { data: null, fetchedAt: 0 };
};
export const useCommunity = create<CommunityState>()(() => (typeof window === "undefined" ? { data: null, fetchedAt: 0 } : readCached()));

const num = (v: unknown) => (typeof v === "number" ? v : Number(v));
/** Cleans what the server sent: numbers may arrive as strings, and anything odd is dropped. */
export function parseCommunity(raw: unknown): Community | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as { neighbors?: unknown; stats?: unknown };
  const neighbors = (Array.isArray(r.neighbors) ? r.neighbors : []).flatMap((x) => {
    const n = x as Record<string, unknown>;
    const sim = num(n.sim); const cnt = num(n.n);
    return typeof n.a === "string" && typeof n.b === "string" && Number.isFinite(sim) && Math.abs(sim) <= 1 && cnt > 0 ? [{ a: n.a, b: n.b, sim, n: cnt }] : [];
  });
  const stats = (Array.isArray(r.stats) ? r.stats : []).flatMap((x) => {
    const s = x as Record<string, unknown>;
    const avg = num(s.avg); const cnt = num(s.n);
    return typeof s.id === "string" && avg >= 1 && avg <= 5 && cnt > 0 ? [{ id: s.id, avg, n: cnt }] : [];
  });
  return { neighbors, stats };
}

/** Fetches the community numbers when they're missing or stale. Works signed out too. */
export async function refreshCommunity(force = false): Promise<void> {
  if (!flag("recommendations")) return;
  if (!force && Date.now() - useCommunity.getState().fetchedAt < FRESH_MS) return;
  const sb = await supabase();
  if (!sb) return;
  const { data, error } = await sb.rpc("recipe_community");
  if (error) { reportError(error, { where: "recipe_community" }); return; }
  const next = { data: parseCommunity(data), fetchedAt: Date.now() };
  useCommunity.setState(next);
  safeStorage.setItem(COMMUNITY_KEY, JSON.stringify(next));
}

/** Catalog ratings only: a person's own recipes stay private. */
export const shareableRatings = (ratings: Record<string, number>): Record<string, number> =>
  Object.fromEntries(Object.entries(ratings).filter(([id, s]) => !id.startsWith("custom_") && Number.isInteger(s) && s >= 1 && s <= 5).sort(([a], [b]) => (a < b ? -1 : 1)));

/** Sends the signed-in person's ratings to the community table when they changed. Called after each sync. */
export async function mirrorRatings(): Promise<void> {
  if (!flag("recommendations")) return;
  const sb = await supabase();
  if (!sb) return;
  const doc = shareableRatings(useApp.getState().ratings ?? {});
  const json = JSON.stringify(doc);
  const { data } = await sb.auth.getSession();
  const who = data.session?.user.id;
  if (!who) return;
  if (safeStorage.getItem(PUSHED_KEY) === `${who}:${json}`) return;
  const { error } = await sb.rpc("set_my_ratings", { doc });
  if (error) { reportError(error, { where: "set_my_ratings" }); return; }
  safeStorage.setItem(PUSHED_KEY, `${who}:${json}`);
}

let memo: { ratings: Record<string, number>; data: Community | null; recs: Record<string, Recommendation> } | null = null;
/** recommend(), cached until the ratings or the community numbers change. */
export function recommendationsFor(ratings: Record<string, number>, data: Community | null): Record<string, Recommendation> {
  if (memo && memo.ratings === ratings && memo.data === data) return memo.recs;
  const recs = recommend(ratings ?? {}, data);
  memo = { ratings, data, recs };
  return recs;
}

/** What the planner gets: predicted taste for unrated recipes, when the feature is on. */
export function plannerRecommendations(ratings: Record<string, number>): Preferences["recommended"] | undefined {
  if (!flag("recommendations")) return undefined;
  const recs = recommendationsFor(ratings, useCommunity.getState().data);
  const out: NonNullable<Preferences["recommended"]> = {};
  for (const [id, r] of Object.entries(recs)) if (Math.abs(r.affinity) >= 0.05) out[id] = r.because ? { affinity: r.affinity, because: r.because } : { affinity: r.affinity };
  return out;
}

/** Recommendations for the UI, and whether the feature is on. Fetches community numbers once. */
export function useRecommendations(): { on: boolean; recs: Record<string, Recommendation>; rated: number } {
  const on = useFlag("recommendations");
  const ratings = useApp((s) => s.ratings);
  const data = useCommunity((s) => s.data);
  useEffect(() => { if (on) void refreshCommunity(); }, [on]);
  const recs = useMemo(() => (on ? recommendationsFor(ratings, data) : {}), [on, ratings, data]);
  return { on, recs, rated: Object.keys(ratings ?? {}).length };
}
