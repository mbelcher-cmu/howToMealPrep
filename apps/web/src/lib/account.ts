"use client";
import { create } from "zustand";
import { STORE_KEY } from "./env";
import { safeStorage } from "./storage";
import { useApp } from "./store";
import { backendEnabled, supabase } from "./supabase";
import { decide, isRemoteDoc, type RemoteDoc, type SyncMeta } from "./sync-rules";
import { reportError, track } from "./telemetry";

/**
 * Sign-in and cloud sync. Signing in is optional: without an account everything stays on the
 * device as before. With one, the saved app state is copied to the person's own profile row
 * (row-level security keeps it private) and follows them to other devices.
 */
type Status = "off" | "loading" | "signedOut" | "signedIn";
interface AccountState {
  status: Status;
  email: string | null;
  syncing: boolean;
  lastSynced: number | null;
  error: string | null;
}
export const useAccount = create<AccountState>()(() => ({ status: "off", email: null, syncing: false, lastSynced: null, error: null }));

const META_KEY = `${STORE_KEY}:sync`;
const readMeta = (): SyncMeta => {
  try { return { userId: null, localAt: 0, remoteAt: 0, ...(JSON.parse(safeStorage.getItem(META_KEY) ?? "{}") as Partial<SyncMeta>) }; } catch { return { userId: null, localAt: 0, remoteAt: 0 }; }
};
const writeMeta = (m: Partial<SyncMeta>) => safeStorage.setItem(META_KEY, JSON.stringify({ ...readMeta(), ...m }));

/** The saved part of the app state, in the same JSON form the browser store uses. */
function snapshot(): Record<string, unknown> {
  const s = useApp.getState() as unknown as Record<string, unknown>;
  const plain = Object.fromEntries(Object.entries(s).filter(([, v]) => typeof v !== "function"));
  return JSON.parse(JSON.stringify(plain, (_k, x) => (x === Infinity ? "__inf" : x))) as Record<string, unknown>;
}
const revive = (state: Record<string, unknown>) => JSON.parse(JSON.stringify(state), (_k, x) => (x === "__inf" ? Infinity : x)) as Record<string, unknown>;

let userId: string | null = null;
let applying = false;
let pushTimer: ReturnType<typeof setTimeout> | null = null;
let started = false;

async function fetchRemote(): Promise<RemoteDoc | null> {
  const sb = await supabase();
  if (!sb || !userId) return null;
  const { data, error } = await sb.from("profiles").select("settings").eq("id", userId).maybeSingle();
  if (error) throw error;
  return isRemoteDoc(data?.settings) ? data.settings : null;
}

async function push() {
  const sb = await supabase();
  if (!sb || !userId) return;
  const doc: RemoteDoc = { v: 1, savedAt: Math.max(Date.now(), readMeta().localAt), state: snapshot() };
  const { error } = await sb.from("profiles").upsert({ id: userId, settings: doc });
  if (error) throw error;
  writeMeta({ userId, remoteAt: doc.savedAt, localAt: doc.savedAt });
}

function pull(doc: RemoteDoc) {
  applying = true;
  try { useApp.setState(revive(doc.state) as never); } finally { applying = false; }
  writeMeta({ userId, remoteAt: doc.savedAt, localAt: doc.savedAt });
}

/** Brings this device and the account into step. Safe to call any time. */
let inflight: Promise<void> | null = null;
let again = false;
export function syncNow(): Promise<void> {
  if (!userId) return Promise.resolve();
  if (inflight) { again = true; return inflight; }
  inflight = runSync().finally(() => {
    inflight = null;
    if (again) { again = false; void syncNow(); }
  });
  return inflight;
}

async function runSync(): Promise<void> {
  if (!userId) return;
  useAccount.setState({ syncing: true, error: null });
  try {
    const remote = await fetchRemote();
    const action = decide(readMeta(), userId, remote, useApp.getState().onboarded);
    if (action === "pull" && remote) pull(remote);
    else if (action === "push") await push();
    else writeMeta({ userId });
    useAccount.setState({ syncing: false, lastSynced: Date.now() });
  } catch (e) {
    reportError(e, { where: "sync" });
    useAccount.setState({ syncing: false, error: "Couldn't sync just now. Your changes are safe on this device and will sync later." });
  }
}

function schedulePush() {
  if (!userId) return;
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(() => { void syncNow(); }, 3000);
}

/** Starts sign-in handling and sync. Called once by the app shell. */
export async function initAccount() {
  if (started || typeof window === "undefined") return;
  started = true;
  if (!backendEnabled()) return;
  useAccount.setState({ status: "loading" });
  const sb = await supabase();
  if (!sb) { useAccount.setState({ status: "off" }); return; }

  useApp.subscribe(() => {
    if (applying) return;
    writeMeta({ localAt: Date.now() });
    schedulePush();
  });
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") void syncNow(); });

  const onUser = (u: { id: string; email?: string | null } | null) => {
    const was = userId;
    userId = u?.id ?? null;
    useAccount.setState({ status: u ? "signedIn" : "signedOut", email: u?.email ?? null });
    if (u && u.id !== was) void syncNow();
  };
  sb.auth.onAuthStateChange((_event, session) => onUser(session?.user ?? null));
  const { data } = await sb.auth.getSession();
  onUser(data.session?.user ?? null);
}

const redirectTo = () => `${window.location.origin}${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/settings/`;

/** Emails a one-time code (and a sign-in link) to the address. */
export async function sendCode(email: string): Promise<string | null> {
  const sb = await supabase();
  if (!sb) return "Accounts aren't available in this version.";
  const { error } = await sb.auth.signInWithOtp({ email: email.trim(), options: { shouldCreateUser: true, emailRedirectTo: redirectTo() } });
  if (error) {
    if (error.status === 429) return "Too many codes were sent. Please wait a few minutes and try again.";
    if (/fetch|network/i.test(error.message)) return "Couldn't reach the server. Check your connection and try again.";
    reportError(error, { where: "sendCode" });
    return "Something went wrong sending the code. Please try again.";
  }
  return null;
}

export async function verifyCode(email: string, code: string): Promise<string | null> {
  const sb = await supabase();
  if (!sb) return "Accounts aren't available in this version.";
  const { error } = await sb.auth.verifyOtp({ email: email.trim(), token: code.replace(/\s/g, ""), type: "email" });
  if (error) return "That code didn't work. Check it, or ask for a new one.";
  track("signed_in");
  return null;
}

/** Signs out. The data stays on this device. */
export async function signOut() {
  const sb = await supabase();
  if (pushTimer) { clearTimeout(pushTimer); pushTimer = null; }
  if (userId) { try { await syncNow(); } catch { /* best effort */ } }
  await sb?.auth.signOut();
}
