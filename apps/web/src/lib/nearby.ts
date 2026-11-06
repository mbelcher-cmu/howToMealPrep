import { RESTAURANTS, type ChainId } from "@prep-cart/catalog";
import type { NearbyStore } from "./store";

/**
 * Free store discovery from OpenStreetMap: Nominatim turns a ZIP into a point, Overpass lists
 * grocery stores around it. Both are public services with fair-use limits, so the app calls them
 * only when the person asks and keeps the result.
 */
const CHAIN_PATTERNS: [ChainId, RegExp][] = [
  ["aldi", /\baldi\b/i],
  ["gianteagle", /giant eagle/i],
  ["walmart", /walmart/i],
  ["traderjoes", /trader joe/i],
  ["costco", /costco/i],
  ["samsclub", /sam'?s club/i],
];

export function chainFor(name: string): ChainId | null {
  for (const [id, re] of CHAIN_PATTERNS) if (re.test(name)) return id;
  return null;
}

function miles(a: { lat: number; lon: number }, b: { lat: number; lon: number }) {
  const R = 3958.8, rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad, dLon = (b.lon - a.lon) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export async function pointForZip(zip: string, signal?: AbortSignal): Promise<{ lat: number; lon: number }> {
  const url = `https://nominatim.openstreetmap.org/search?format=json&countrycodes=us&postalcode=${encodeURIComponent(zip)}&limit=1`;
  const res = await fetch(url, { signal, headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`Location lookup failed (${res.status}).`);
  const rows = (await res.json()) as { lat: string; lon: string }[];
  if (!rows[0]) throw new Error("We couldn't find that ZIP code.");
  return { lat: Number(rows[0].lat), lon: Number(rows[0].lon) };
}

export async function storesNear(p: { lat: number; lon: number }, radiusMi = 6, signal?: AbortSignal): Promise<NearbyStore[]> {
  const m = Math.round(radiusMi * 1609.34);
  const q = `[out:json][timeout:20];(nwr["shop"~"supermarket|grocery|wholesale"](around:${m},${p.lat},${p.lon}););out center tags 200;`;
  const res = await fetch("https://overpass-api.de/api/interpreter", { method: "POST", body: new URLSearchParams({ data: q }), signal });
  if (!res.ok) throw new Error(`Store lookup failed (${res.status}). Try again in a minute.`);
  const json = (await res.json()) as { elements: { type: string; id: number; lat?: number; lon?: number; center?: { lat: number; lon: number }; tags?: Record<string, string> }[] };
  const out: NearbyStore[] = [];
  for (const e of json.elements) {
    const t = e.tags ?? {};
    const name = t.brand || t.name;
    const at = e.center ?? (e.lat != null && e.lon != null ? { lat: e.lat, lon: e.lon } : null);
    if (!name || !at) continue;
    const address = [t["addr:housenumber"], t["addr:street"], t["addr:city"]].filter(Boolean).join(" ") || t.name || "";
    out.push({ id: `${e.type}/${e.id}`, name: t.name || name, chain: chainFor(`${t.brand ?? ""} ${t.name ?? ""}`), address, distanceMi: Math.round(miles(p, at) * 10) / 10 });
  }
  return out.sort((a, b) => a.distanceMi - b.distanceMi);
}

export function currentPosition(): Promise<{ lat: number; lon: number }> {
  return new Promise((resolve, reject) => {
    if (!("geolocation" in navigator)) { reject(new Error("This browser can't share your location.")); return; }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
      () => reject(new Error("Location permission was declined. Use your ZIP code instead.")),
      { timeout: 10000, maximumAge: 600000 },
    );
  });
}

/** Which takeout chain an OpenStreetMap brand or name belongs to, if any. */
export function restaurantFor(name: string): string | null {
  for (const r of RESTAURANTS) if (r.match.test(name)) return r.id;
  return null;
}

/** Closest distance in miles to each takeout chain in a list of OpenStreetMap places. */
export function closestByChain(places: { name: string; distanceMi: number }[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const p of places) {
    const id = restaurantFor(p.name);
    if (id && (out[id] == null || p.distanceMi < out[id]!)) out[id] = p.distanceMi;
  }
  return out;
}

/** Takeout chains near a point (fast food, restaurants and cafes with a brand on OpenStreetMap). */
export async function restaurantsNear(p: { lat: number; lon: number }, radiusMi = 5, signal?: AbortSignal): Promise<Record<string, number>> {
  const m = Math.round(radiusMi * 1609.34);
  const q = `[out:json][timeout:20];(nwr["amenity"~"fast_food|restaurant|cafe"](around:${m},${p.lat},${p.lon}););out center tags 400;`;
  const res = await fetch("https://overpass-api.de/api/interpreter", { method: "POST", body: new URLSearchParams({ data: q }), signal });
  if (!res.ok) throw new Error(`Restaurant lookup failed (${res.status}). Try again in a minute.`);
  const json = (await res.json()) as { elements: { lat?: number; lon?: number; center?: { lat: number; lon: number }; tags?: Record<string, string> }[] };
  const places: { name: string; distanceMi: number }[] = [];
  for (const e of json.elements) {
    const t = e.tags ?? {};
    const at = e.center ?? (e.lat != null && e.lon != null ? { lat: e.lat, lon: e.lon } : null);
    if (!at || !(t.brand || t.name)) continue;
    places.push({ name: `${t.brand ?? ""} ${t.name ?? ""}`, distanceMi: Math.round(miles(p, at) * 10) / 10 });
  }
  return closestByChain(places);
}
