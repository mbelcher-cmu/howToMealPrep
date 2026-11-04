"use client";
import type { SupabaseClient } from "@supabase/supabase-js";
import { KEYS } from "./env";
import { flag } from "./flags";

let client: Promise<SupabaseClient | null> | null = null;

/** True when this build has a Supabase project and the accounts flag is on. */
export function backendEnabled(): boolean {
  return !!(KEYS.supabaseUrl && KEYS.supabaseAnonKey) && flag("accounts");
}

/**
 * The Supabase client, loaded only when it's needed. The anon key is public by design:
 * row-level security in supabase/migrations decides what each signed-in person can read.
 */
export function supabase(): Promise<SupabaseClient | null> {
  if (!backendEnabled()) return Promise.resolve(null);
  client ??= import("@supabase/supabase-js").then(({ createClient }) =>
    createClient(KEYS.supabaseUrl, KEYS.supabaseAnonKey, { auth: { persistSession: true, detectSessionInUrl: true, flowType: "pkce" } }));
  return client;
}
