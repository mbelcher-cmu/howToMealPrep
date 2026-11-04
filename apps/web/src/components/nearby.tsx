"use client";
import { useState } from "react";
import { LocateFixed, MapPin } from "lucide-react";
import { Tag } from "./ui";
import { useApp } from "@/lib/store";
import { currentPosition, pointForZip, storesNear } from "@/lib/nearby";
import { chainName } from "@/lib/format";

export function NearbyFinder() {
  const s = useApp();
  const [state, setState] = useState<"idle" | "busy" | "error">("idle");
  const [err, setErr] = useState("");
  const [note, setNote] = useState("");
  const [zip, setZip] = useState(s.profile.zip);
  const find = async (how: "zip" | "gps") => {
    setState("busy"); setErr("");
    try {
      const p = how === "gps" ? await currentPosition() : await pointForZip(zip);
      if (how === "zip") s.setProfile({ zip });
      let list = await storesNear(p, 6);
      if (!list.some((n) => n.chain)) list = await storesNear(p, 15); // wider net outside cities
      const priced = [...new Set(list.filter((n) => n.chain).map((n) => n.chain!))];
      s.set({ nearby: list, ...(priced.length ? { stores: priced } : {}) });
      setNote(priced.length
        ? `Planning with ${priced.map(chainName).join(priced.length > 2 ? ", " : " and ").replace(/, ([^,]*)$/, ", and $1")} near you.`
        : list.length ? "None of the chains with prices yet are near you, so plans use their price estimates for now." : "No grocery stores were found nearby on OpenStreetMap.");
      setState("idle");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Something went wrong.");
      setState("error");
    }
  };
  const known = s.nearby.filter((n) => n.chain);
  const other = s.nearby.filter((n) => !n.chain);
  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-end gap-2">
        <div className="grid gap-1">
          <label htmlFor="zip" className="text-[13px] text-muted">ZIP code</label>
          <input id="zip" className="input w-28" inputMode="numeric" maxLength={5} value={zip} onChange={(e) => setZip(e.target.value.replace(/\D/g, ""))} />
        </div>
        <button className="btn" onClick={() => find("zip")} disabled={state === "busy" || zip.length !== 5}><MapPin size={16} aria-hidden /> Find stores</button>
        <button className="btn" onClick={() => find("gps")} disabled={state === "busy"}><LocateFixed size={16} aria-hidden /> Use my location</button>
      </div>
      {state === "busy" && <p role="status" className="text-sm text-muted">Looking up stores from OpenStreetMap…</p>}
      {state === "error" && <p role="alert" className="text-sm text-warn">{err}</p>}
      {state === "idle" && note && <p role="status" className="text-sm text-accent">{note}</p>}
      {s.nearby.length > 0 && (
        <div className="grid gap-3">
          <ul className="divide-y divide-line rounded-lg border border-line">
            {known.slice(0, 12).map((n) => {
              const on = !!n.chain && s.stores.includes(n.chain);
              return (
                <li key={n.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                  <span className="min-w-0 flex-1"><span className="block font-medium">{n.name}</span><span className="block text-xs text-muted">{n.address || "Address not listed"} · {n.distanceMi} mi</span></span>
                  {n.chain ? <Tag>{on ? "Planning with" : chainName(n.chain)}</Tag> : null}
                </li>
              );
            })}
          </ul>
          {other.length > 0 && <p className="text-xs text-muted">Also nearby, prices coming later: {[...new Set(other.map((o) => o.name))].slice(0, 8).join(", ")}{other.length > 8 ? " and more" : ""}.</p>}
        </div>
      )}
      <p className="text-xs text-muted">Works anywhere in the US. Store locations come from OpenStreetMap. Prices cover Aldi, Giant Eagle, Walmart and Trader Joe's for now.</p>
    </div>
  );
}

