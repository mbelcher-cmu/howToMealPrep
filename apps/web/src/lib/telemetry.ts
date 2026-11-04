"use client";
import { APP_ENV, KEYS, RELEASE } from "./env";
import { flag } from "./flags";

/**
 * Error reports (Sentry) and anonymous usage events (PostHog). Both stay off until their key is
 * set for the build, load only after the page is up, and never receive body stats, plans or
 * anything typed into the app: events carry counts and choices, not personal data.
 */
const OPT_OUT_KEY = "prep-cart-no-analytics";
type Capture = (event: string, props?: Record<string, string | number | boolean>) => void;
let capture: Capture | null = null;
const queue: [string, Record<string, string | number | boolean> | undefined][] = [];
let started = false;

export function analyticsOptedOut(): boolean {
  try { return localStorage.getItem(OPT_OUT_KEY) === "1"; } catch { return false; }
}

export function setAnalyticsOptOut(out: boolean) {
  try { if (out) localStorage.setItem(OPT_OUT_KEY, "1"); else localStorage.removeItem(OPT_OUT_KEY); } catch { /* storage blocked */ }
  if (out) { capture = null; queue.length = 0; void import("posthog-js").then((m) => m.default.opt_out_capturing()).catch(() => {}); }
}

export async function initTelemetry() {
  if (started || typeof window === "undefined") return;
  started = true;
  if (KEYS.sentryDsn && flag("errorReports")) {
    try {
      const Sentry = await import("@sentry/browser");
      Sentry.init({
        dsn: KEYS.sentryDsn, environment: APP_ENV, release: RELEASE,
        // errors only: no session replay and no performance tracing; cookies are stripped below
        tracesSampleRate: 0,
        beforeSend: (e) => { if (e.request) delete e.request.cookies; return e; },
      });
    } catch { /* a blocked script must never break the app */ }
  }
  if (KEYS.posthogKey && flag("analytics") && !analyticsOptedOut()) {
    try {
      const { default: posthog } = await import("posthog-js");
      posthog.init(KEYS.posthogKey, {
        api_host: KEYS.posthogHost, person_profiles: "identified_only",
        autocapture: false, capture_pageview: true, disable_session_recording: true,
        respect_dnt: true, persistence: "localStorage",
      });
      posthog.register({ app_env: APP_ENV, release: RELEASE });
      capture = (e, p) => posthog.capture(e, p);
      for (const [e, p] of queue.splice(0)) capture(e, p);
    } catch { /* ignore */ }
  }
}

/** Record a product event, like "plan_built". Events before startup are queued, then sent. */
export function track(event: string, props?: Record<string, string | number | boolean>) {
  if (capture) capture(event, props);
  else if (!started || queue.length < 50) queue.push([event, props]);
}

/** Report an error the app caught itself. */
export function reportError(err: unknown, context?: Record<string, string>) {
  if (!KEYS.sentryDsn) return;
  void import("@sentry/browser").then((S) => S.captureException(err, { extra: context })).catch(() => {});
}
