"use client";
import { useEffect } from "react";
import { STORE_KEY } from "@/lib/env";
import { reportError } from "@/lib/telemetry";

/**
 * Last-resort screen when the app itself fails to render (instead of a blank "Application error").
 * Offers a retry, and as a final step a fresh start that keeps a copy of the old data on the device.
 */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { reportError(error, { where: "global-error" }); }, [error]);
  const startFresh = () => {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (raw) localStorage.setItem(`${STORE_KEY}:damaged`, raw);
      localStorage.removeItem(STORE_KEY);
    } catch { /* storage blocked */ }
    location.reload();
  };
  const btn = { font: "inherit", fontWeight: 600, padding: "12px 20px", borderRadius: 999, border: "1px solid #d4d4da", background: "#fff", color: "#111114", cursor: "pointer", minHeight: 44 } as const;
  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: "system-ui, -apple-system, sans-serif", background: "#f7f7f9", color: "#111114" }}>
        <main style={{ maxWidth: 440, margin: "0 auto", padding: "64px 24px" }}>
          <h1 style={{ fontSize: 26, margin: "0 0 8px" }}>Something went wrong</h1>
          <p style={{ color: "#55555f", lineHeight: 1.5, margin: "0 0 24px" }}>
            MacroAisle hit an error loading this page. We've been told about it. Try again first; your plan and lists are still saved on this device.
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
            <button type="button" style={{ ...btn, background: "#111114", color: "#fff", borderColor: "#111114" }} onClick={() => reset()}>Try again</button>
            <button type="button" style={btn} onClick={() => location.reload()}>Reload</button>
          </div>
          <p style={{ color: "#55555f", lineHeight: 1.5, margin: "32px 0 12px", fontSize: 14 }}>
            Still stuck? Start fresh on this device. You'll set up again; a copy of your old data is kept on the device in case we can recover it.
          </p>
          <button type="button" style={btn} onClick={startFresh}>Start fresh</button>
        </main>
      </body>
    </html>
  );
}
