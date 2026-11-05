"use client";
import { useEffect, useState } from "react";

/** Keeps the phone screen on while the list is open, where the browser allows it. */
export function useWakeLock(on: boolean) {
  const [ok, setOk] = useState<boolean | null>(null);
  useEffect(() => {
    if (!on) return;
    let lock: { release: () => Promise<void> } | null = null;
    let gone = false;
    const nav = navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<{ release: () => Promise<void> }> } };
    const get = async () => {
      if (!nav.wakeLock || document.visibilityState !== "visible") { setOk(!!nav.wakeLock); return; }
      try { lock = await nav.wakeLock.request("screen"); if (gone) void lock.release(); setOk(true); } catch { setOk(false); }
    };
    void get();
    const vis = () => { if (document.visibilityState === "visible") void get(); };
    document.addEventListener("visibilitychange", vis);
    return () => { gone = true; document.removeEventListener("visibilitychange", vis); void lock?.release().catch(() => {}); };
  }, [on]);
  return ok;
}
