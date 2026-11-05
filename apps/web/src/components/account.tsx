"use client";
import { useEffect, useState } from "react";
import { Cloud, LogOut, RefreshCw, Trash2 } from "lucide-react";
import { deleteAccount, sendCode, signInWithGoogle, signOut, syncNow, useAccount, verifyCode } from "@/lib/account";
import { useFlag } from "@/lib/flags";

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
  const google = useFlag("googleSignIn");

  // a sign-in link that failed comes back with an error in the address: say so plainly, then tidy the address
  useEffect(() => {
    const q = new URLSearchParams(window.location.search + "&" + window.location.hash.slice(1));
    const code = q.get("error_code");
    if (!code) return;
    setMsg(code === "otp_expired" ? "That sign-in link has expired or was already used. Ask for a new one below and open only the newest email." : "That sign-in link didn't work. Please ask for a new one.");
    window.history.replaceState(null, "", window.location.pathname);
  }, []);

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
        <DeleteAccount />
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
      {a.notice && <p role="status" className="text-sm">{a.notice}</p>}
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
      {google && !sent && (
        <button type="button" className="btn justify-self-start" disabled={busy} onClick={async () => { setBusy(true); setMsg(null); const err = await signInWithGoogle(); setBusy(false); if (err) setMsg(err); }}>
          <GoogleMark /> Continue with Google
        </button>
      )}
      {msg && <p role="alert" className="text-sm text-warn">{msg}</p>}
    </div>
  );
}

function GoogleMark() {
  return (
    <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden>
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}

/** Delete the account, with a plain confirmation step in place of a browser dialog. */
function DeleteAccount() {
  const [open, setOpen] = useState(false);
  const [erase, setErase] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  if (!open) {
    return <button type="button" className="justify-self-start text-sm text-muted underline" onClick={() => setOpen(true)}>Delete account…</button>;
  }
  return (
    <div className="grid gap-3 rounded-xl border border-line p-3" role="group" aria-labelledby="del-title">
      <p id="del-title" className="text-sm font-semibold">Delete your account?</p>
      <p className="text-sm text-muted">This permanently removes your account and everything synced to it: settings, plans, pantry and recorded prices. It can't be undone.</p>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" className="mt-1" checked={erase} onChange={(e) => setErase(e.target.checked)} />
        <span>Also erase everything on this device. Leave this off to keep using MacroAisle here without an account.</span>
      </label>
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn text-warn" disabled={busy} onClick={async () => {
          setBusy(true); setMsg(null);
          const err = await deleteAccount(erase);
          setBusy(false);
          if (err) setMsg(err);
        }}><Trash2 size={16} aria-hidden /> {busy ? "Deleting…" : "Delete my account"}</button>
        <button type="button" className="btn" disabled={busy} onClick={() => { setOpen(false); setMsg(null); }}>Cancel</button>
      </div>
      {msg && <p role="alert" className="text-sm text-warn">{msg}</p>}
    </div>
  );
}
