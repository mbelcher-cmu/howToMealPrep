/**
 * Which build this is. GitHub Actions builds the same code twice: production at the site root and
 * staging under /staging/, each with its own keys. Local development is "development".
 */
export type AppEnv = "production" | "staging" | "development";

export const APP_ENV: AppEnv = ((): AppEnv => {
  const v = process.env.NEXT_PUBLIC_APP_ENV;
  return v === "production" || v === "staging" ? v : "development";
})();

/** Release id for error reports: the commit the build came from. */
export const RELEASE = process.env.NEXT_PUBLIC_RELEASE || "local";

/** Production keeps its original storage key so existing users keep their data; other builds get their own. */
export const STORE_KEY = APP_ENV === "production" || APP_ENV === "development" ? "prep-cart-v1" : `prep-cart-${APP_ENV}-v1`;

/** Public keys only. Anything secret lives in Supabase or GitHub secrets, never in the browser. */
export const KEYS = {
  sentryDsn: process.env.NEXT_PUBLIC_SENTRY_DSN || "",
  posthogKey: process.env.NEXT_PUBLIC_POSTHOG_KEY || "",
  posthogHost: process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://us.i.posthog.com",
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "",
};
