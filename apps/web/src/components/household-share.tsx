"use client";
import { useEffect, useState } from "react";
import { Check, Copy, UserPlus, Users, X } from "lucide-react";
import { cancelInvite, createInvite, joinHousehold, leaveHousehold, refreshHousehold, useAccount, useHousehold } from "@/lib/account";

const inviteLink = (code: string) => `${window.location.origin}${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/settings/?join=${code}#household`;

/** Share one plan and grocery list with other people's accounts. Shown only with accounts on. */
export function HouseholdShare() {
  const a = useAccount();
  const { info, loaded } = useHousehold();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  // an invite link opens Settings with the code filled in
  useEffect(() => {
    const j = new URLSearchParams(window.location.search).get("join");
    if (j) setCode(j.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8));
  }, []);
  useEffect(() => { if (a.status === "signedIn" && !loaded) void refreshHousehold(); }, [a.status, loaded]);

  if (a.status === "off" || a.status === "loading") return null;
  if (a.status !== "signedIn") {
    return (
      <div className="mt-4 grid gap-1 border-t border-line pt-4">
        <p className="flex items-center gap-2 text-sm font-semibold"><Users size={16} aria-hidden /> Share with your household</p>
        <p className="text-sm text-muted">{code ? `You have an invite (${code}). Sign in under Account above, then come back here to join.` : "Sign in to share your plan and grocery list with people on their own phones."}</p>
      </div>
    );
  }

  const run = async (f: () => Promise<string | null | undefined>) => { setBusy(true); setMsg(null); const err = await f(); setBusy(false); if (err) setMsg(err); };
  const copy = async (c: string) => {
    try { await navigator.clipboard.writeText(inviteLink(c)); setCopied(c); setTimeout(() => setCopied(null), 2000); } catch { setNote(`Send this link: ${inviteLink(c)}`); }
  };

  return (
    <div className="mt-4 grid gap-3 border-t border-line pt-4">
      <p className="flex items-center gap-2 text-sm font-semibold"><Users size={16} aria-hidden /> Share with your household</p>

      {info?.role === "member" ? (
        <>
          <p className="text-sm">You're using <b>{info.ownerName}</b>'s plan. When they plan a new week, it shows up here too.</p>
          <button type="button" className="btn justify-self-start" disabled={busy} onClick={() => void run(() => leaveHousehold())}>Stop sharing</button>
        </>
      ) : (
        <>
          <p className="text-sm text-muted">Invite people to see this plan and grocery list on their own phones. They need a free account; their own settings stay private.</p>
          {!!info?.members.length && (
            <ul className="grid gap-2" aria-label="People sharing your plan">
              {info.members.map((m) => (
                <li key={m.id} className="flex items-center justify-between gap-2 rounded-xl border border-line px-3 py-2 text-sm">
                  <span>{m.name}</span>
                  <button type="button" className="text-muted underline" disabled={busy} onClick={() => void run(() => leaveHousehold(m.id))}>Remove</button>
                </li>
              ))}
            </ul>
          )}
          {info?.invites.map((i) => (
            <div key={i.code} className="flex flex-wrap items-center gap-2 rounded-xl border border-dashed border-line px-3 py-2 text-sm">
              <span>Invite code <b className="num tracking-widest">{i.code}</b></span>
              <span className="text-muted">works once, until {new Date(i.expiresAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>
              <span className="ml-auto flex gap-2">
                <button type="button" className="btn" onClick={() => void copy(i.code)}>{copied === i.code ? <Check size={16} aria-hidden /> : <Copy size={16} aria-hidden />} {copied === i.code ? "Copied" : "Copy link"}</button>
                <button type="button" className="btn" aria-label={`Cancel invite ${i.code}`} onClick={() => void cancelInvite(i.code)}><X size={16} aria-hidden /></button>
              </span>
            </div>
          ))}
          <button type="button" className="btn justify-self-start" disabled={busy} onClick={() => void run(async () => {
            const r = await createInvite();
            if (r.code) await copy(r.code);
            return r.error;
          })}><UserPlus size={16} aria-hidden /> Invite someone</button>

          {!info && (
            <form className="grid gap-2" onSubmit={(e) => {
              e.preventDefault();
              if (code.length === 8 && !busy) void run(async () => {
                const r = await joinHousehold(code);
                if (r.ownerName) { setMsg(null); setCode(""); window.history.replaceState(null, "", window.location.pathname + "#household"); }
                return r.error;
              });
            }}>
              <label htmlFor="join-code" className="text-[13px] text-muted">Got a code from someone? Join their household to use their plan.</label>
              <div className="flex flex-wrap gap-2">
                <input id="join-code" className="input num min-w-0 flex-1 uppercase tracking-widest" value={code} autoCapitalize="characters" autoComplete="off"
                  onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8))} placeholder="AB12CD34" />
                <button className="btn btn-primary" type="submit" disabled={code.length !== 8 || busy}>Join</button>
              </div>
              {code.length === 8 && <p className="text-xs text-muted">Joining replaces the plan on this device with theirs. Your pantry and settings stay yours.</p>}
            </form>
          )}
        </>
      )}
      {note && <p role="status" className="select-all break-all text-sm text-muted">{note}</p>}
      {msg && <p role="alert" className="text-sm text-warn">{msg}</p>}
    </div>
  );
}
