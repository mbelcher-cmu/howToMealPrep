"use client";
import { create } from "zustand";
import { STORE_KEY } from "./env";
import { safeStorage } from "./storage";
import { useApp } from "./store";
import { backendEnabled, supabase } from "./supabase";
import { syncOnce, type Local } from "./sync-engine";
import { supabaseRemote } from "./sync-remote";
import type { SyncBase } from "./sync-rules";
import { reportError, track } from "./telemetry";

/**
 * Sign-in and cloud sync. Signing in is optional: without an account everything stays on the
 * device as before. With one, settings, pantry, plans and prices are kept in the person's own rows
 * (row-level security keeps them private) and follow them to other devices. The merge rules are in
 * sync-rules.ts and sync-engine.ts.
 */
type Status = "off" | "loading" | "signedOut" | "signedIn";
interface AccountState {
  status: Status;
  email: string | null;
  syncing: boolean;
  lastSynced: number | null;
  error: string | null;
  /** a one-off note for the sign-in form, such as after deleting the account */
  notice: string | null;
}
export const useAccount = create<AccountState>()(() => ({ status: "off", email: null, syncing: false, lastSynced: null, error: null, notice: null }));

// when this device last changed something, and what the cloud held after the last sync
const LOCAL_AT_KEY = `${STORE_KEY}:changed`;
const BASE_KEY = `${STORE_KEY}:sync-base`;
const LEGACY_META_KEY = `${STORE_KEY}:sync`;
const readLocalAt = (): number => {
  const n = Number(safeStorage.getItem(LOCAL_AT_KEY));
  if (n) return n;
  try { return Number((JSON.parse(safeStorage.getItem(LEGACY_META_KEY) ?? "{}") as { localAt?: number }).localAt) || 0; } catch { return 0; }
};
const readBase = (): SyncBase | null => { try { return JSON.parse(safeStorage.getItem(BASE_KEY) ?? "null") as SyncBase | null; } catch { return null; } };
const writeBase = (b: SyncBase | null) => (b ? safeStorage.setItem(BASE_KEY, JSON.stringify(b)) : safeStorage.removeItem(BASE_KEY));

/** The saved part of the app state, as plain data. */
const plainState = (): Record<string, unknown> =>
  Object.fromEntries(Object.entries(useApp.getState() as unknown as Record<string, unknown>).filter(([, v]) => typeof v !== "function"));

let userId: string | null = null;
let applying = false;
let pushTimer: ReturnType<typeof setTimeout> | null = null;
let started = false;

const local: Local = {
  read: plainState,
  write: (patch) => {
    applying = true;
    try { useApp.setState(patch as never); } finally { applying = false; }
  },
  localAt: readLocalAt,
};

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
  const sb = await supabase();
  if (!sb || !userId) return;
  useAccount.setState({ syncing: true, error: null });
  const remote = supabaseRemote(sb, userId, () => useApp.getState().profile.zip);
  try {
    // another device saving at the same moment makes a save bounce; merge again, a few times at most
    for (let i = 0; i < 3; i++) {
      const r = await syncOnce(userId, readBase(), local, remote);
      if (r.base) writeBase(r.base);
      if (r.pulled) track("sync_pulled");
      if (!r.again) break;
    }
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
    safeStorage.setItem(LOCAL_AT_KEY, String(Date.now()));
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

/** Signs in with Google. Only offered once the Google provider is set up in Supabase (googleSignIn flag). */
export async function signInWithGoogle(): Promise<string | null> {
  const sb = await supabase();
  if (!sb) return "Accounts aren't available in this version.";
  const { error } = await sb.auth.signInWithOAuth({ provider: "google", options: { redirectTo: redirectTo() } });
  if (error) { reportError(error, { where: "google" }); return "Couldn't start Google sign-in. Please try again or use your email."; }
  return null;
}

/**
 * Deletes the account and everything stored with it in the cloud. Nothing on this device changes
 * unless eraseDevice is set, so someone can leave the service and keep using the app offline.
 */
export async function deleteAccount(eraseDevice: boolean): Promise<string | null> {
  const sb = await supabase();
  if (!sb || !userId) return "You're not signed in.";
  if (pushTimer) { clearTimeout(pushTimer); pushTimer = null; }
  try { await inflight; } catch { /* the delete matters more */ }
  const { error } = await sb.rpc("delete_account");
  if (error) {
    reportError(error, { where: "deleteAccount" });
    return /fetch|network/i.test(error.message) ? "Couldn't reach the server. Check your connection and try again." : "Something went wrong deleting your account. Please try again.";
  }
  track("account_deleted", { erased: eraseDevice });
  userId = null;
  writeBase(null);
  await sb.auth.signOut({ scope: "local" });
  if (eraseDevice) useApp.getState().reset();
  useAccount.setState({ status: "signedOut", email: null, lastSynced: null, error: null, notice: eraseDevice ? "Your account was deleted, and this device was cleared." : "Your account was deleted. Everything is still on this device." });
  return null;
}
