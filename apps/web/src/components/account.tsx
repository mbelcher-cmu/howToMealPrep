"use client";
import { useState } from "react";
import { Cloud, LogOut, RefreshCw } from "lucide-react";
import { sendCode, signOut, syncNow, useAccount, verifyCode } from "@/lib/account";

function ago(t: number | null) {
  if (!t) return "not yet";
  const s = Math.round((Date.now() - t) / 1000);
  return s < 60 ? "just now" : s < 3600 ? `${Math.round(s / 60)} min ago` : new Date(t).toLocaleString();
}

/** Sign in with an emailed code, or see sync status once signed in. Renders nothing when accounts are off. */
export function AccountPanel() {
  const a = useAccount();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  if (a.status === "off") return null;
  if (a.status === "loading") return <p className="text-sm text-muted">Checking your account…</p>;

  if (a.status === "signedIn") {
    return (
      <div className="grid gap-3">
        <p className="flex items-center gap-2 text-sm"><Cloud size={16} aria-hidden className="text-accent" /> Signed in as <b>{a.email}</b></p>
        <p className="text-sm text-muted" role="status">
          {a.syncing ? "Syncing…" : a.error ?? `Your plan, pantry and settings sync to your account. Last synced ${ago(a.lastSynced)}.`}
        </p>
        <div className="flex flex-wrap gap-2">
          <button className="btn" onClick={() => void syncNow()} disabled={a.syncing}><RefreshCw size={16} aria-hidden /> Sync now</button>
          <button className="btn" onClick={() => void signOut()}><LogOut size={16} aria-hidden /> Sign out</button>
        </div>
        <p className="text-xs text-muted">Signing out keeps everything on this device.</p>
      </div>
    );
  }

  const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const request = async () => {
    setBusy(true); setMsg(null);
    const err = await sendCode(email);
    setBusy(false);
    if (err) setMsg(err); else { setSent(true); setMsg(null); }
  };
  const verify = async () => {
    setBusy(true); setMsg(null);
    const err = await verifyCode(email, code);
    setBusy(false);
    if (err) setMsg(err);
  };

  return (
    <div className="grid gap-3">
      {!sent ? (
        <form className="grid gap-2" onSubmit={(e) => { e.preventDefault(); if (validEmail && !busy) void request(); }}>
          <label htmlFor="acct-email" className="text-[13px] text-muted">Email</label>
          <div className="flex flex-wrap gap-2">
            <input id="acct-email" type="email" autoComplete="email" inputMode="email" className="input min-w-0 flex-1" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
            <button className="btn btn-primary" type="submit" disabled={!validEmail || busy}>{busy ? "Sending…" : "Email me a sign-in link"}</button>
          </div>
          <p className="text-xs text-muted">No password needed. Your data stays on this device until you sign in, then it syncs to your account.</p>
        </form>
      ) : (
        <form className="grid gap-2" onSubmit={(e) => { e.preventDefault(); if (code.trim().length >= 6 && !busy) void verify(); }}>
          <label htmlFor="acct-code" className="text-[13px] text-muted">We emailed a sign-in link to {email.trim()}. Open it on this device and in this browser. If the email has a code instead, enter it here.</label>
          <div className="flex flex-wrap gap-2">
            <input id="acct-code" autoComplete="one-time-code" inputMode="numeric" className="input num min-w-0 flex-1 tracking-widest" value={code} onChange={(e) => setCode(e.target.value.replace(/[^\d]/g, "").slice(0, 10))} placeholder="123456" />
            <button className="btn btn-primary" type="submit" disabled={code.trim().length < 6 || busy}>{busy ? "Checking…" : "Sign in"}</button>
          </div>
          <button type="button" className="justify-self-start text-sm text-muted underline" onClick={() => { setSent(false); setCode(""); setMsg(null); }}>Use a different email</button>
        </form>
      )}
      {msg && <p role="alert" className="text-sm text-warn">{msg}</p>}
    </div>
  );
}
