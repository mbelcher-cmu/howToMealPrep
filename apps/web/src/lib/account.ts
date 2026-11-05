"use client";
import { create } from "zustand";
import { STORE_KEY } from "./env";
import { safeStorage } from "./storage";
import { useApp, type SavedPlan } from "./store";
import { backendEnabled, supabase } from "./supabase";
import { syncOnce, type Local } from "./sync-engine";
import { supabaseRemote } from "./sync-remote";
import { fromWire, type SyncBase } from "./sync-rules";
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
    await followHousehold();
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
    if (!u) useHousehold.setState({ info: null, loaded: false });
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
  useHousehold.setState({ info: null, loaded: false });
  await sb.auth.signOut({ scope: "local" });
  if (eraseDevice) useApp.getState().reset();
  useAccount.setState({ status: "signedOut", email: null, lastSynced: null, error: null, notice: eraseDevice ? "Your account was deleted, and this device was cleared." : "Your account was deleted. Everything is still on this device." });
  return null;
}

// ---------- household sharing ----------

export interface HouseholdInfo {
  role: "owner" | "member";
  ownerName: string;
  members: { id: string; name: string }[];
  invites: { code: string; expiresAt: string }[];
}
interface HouseholdPlan { ownerName: string; weekOf?: string | null; checked?: Record<string, boolean>; plan: Record<string, unknown> | null }

export const useHousehold = create<{ info: HouseholdInfo | null; loaded: boolean }>()(() => ({ info: null, loaded: false }));

const householdError = (e: { message?: string } | null): string => {
  const m = e?.message ?? "";
  if (/invite not valid/.test(m)) return "That code didn't work. It may have expired or already been used; ask for a new one.";
  if (/own household/.test(m)) return "That's your own household's code. Send it to the person you want to invite.";
  if (/owns a household|already in another household/.test(m)) return "You're already sharing with a household. Leave it first.";
  if (/too many open invites/.test(m)) return "You have 10 unused codes. Cancel one first.";
  if (/fetch|network/i.test(m)) return "Couldn't reach the server. Check your connection and try again.";
  return "Something went wrong. Please try again.";
};

export async function refreshHousehold(): Promise<void> {
  const sb = await supabase();
  if (!sb || !userId) { useHousehold.setState({ info: null, loaded: true }); return; }
  const { data, error } = await sb.rpc("household_info");
  if (error) { reportError(error, { where: "household_info" }); return; }
  useHousehold.setState({ info: (data as HouseholdInfo | null) ?? null, loaded: true });
}

/** Members see the owner's current plan: it replaces theirs on every sync while they're in the household. */
async function followHousehold(): Promise<void> {
  const sb = await supabase();
  if (!sb || !userId) return;
  await refreshHousehold();
  if (useHousehold.getState().info?.role !== "member") return;
  const { data, error } = await sb.rpc("household_plan");
  if (error) { reportError(error, { where: "household_plan" }); return; }
  const hp = data as HouseholdPlan | null;
  if (!hp?.plan) return;
  const plan = fromWire(hp.plan) as unknown as SavedPlan;
  const s = useApp.getState();
  if (s.current?.id === plan.id) return;
  local.write({
    onboarded: true,
    current: plan,
    history: [plan, ...s.history.filter((h) => h.id !== plan.id)].slice(0, 20),
    ...(hp.weekOf ? { weekOf: hp.weekOf } : {}),
    checked: hp.checked ?? {},
    lastWeek: null,
  });
  track("household_plan_received");
}

export async function createInvite(): Promise<{ code?: string; error?: string }> {
  const sb = await supabase();
  if (!sb || !userId) return { error: "Sign in first." };
  const { data, error } = await sb.rpc("create_household_invite");
  if (error) return { error: householdError(error) };
  track("household_invite_created");
  await refreshHousehold();
  return { code: data as string };
}

export async function joinHousehold(code: string): Promise<{ ownerName?: string; error?: string }> {
  const sb = await supabase();
  if (!sb || !userId) return { error: "Sign in first." };
  const { data, error } = await sb.rpc("join_household", { invite: code.trim() });
  if (error) return { error: householdError(error) };
  track("household_joined");
  await followHousehold();
  return { ownerName: data as string };
}

/** Leaves the household, or with a member id (owner only), removes that person. */
export async function leaveHousehold(member?: string): Promise<string | null> {
  const sb = await supabase();
  if (!sb || !userId) return "Sign in first.";
  const { error } = await sb.rpc("leave_household", member ? { member } : {});
  if (error) return householdError(error);
  await refreshHousehold();
  return null;
}

export async function cancelInvite(code: string): Promise<void> {
  const sb = await supabase();
  if (!sb || !userId) return;
  const { error } = await sb.rpc("cancel_household_invite", { invite: code });
  if (error) reportError(error, { where: "cancel_invite" });
  await refreshHousehold();
}
