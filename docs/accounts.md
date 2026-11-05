# Accounts and keys

Everything here is free. Public keys we already have are written into `pages.yml` as defaults, so a variable is only needed to change them. Values marked **variable** are public by design and go in
GitHub: Settings → Secrets and variables → Actions → **Variables**. Values marked
**secret** go in the **Secrets** tab and are never shown in the browser.

Until a value is set, its feature stays off and the app works as before.

## Supabase (database, sign-in, backups)

1. Sign up at supabase.com with GitHub. Create two projects: `macroaisle` and `macroaisle-staging`
   (region: East US). Save each database password somewhere safe.
2. For each project, open Project Settings → API and copy the Project URL and the `anon` public key.

| Name | Where it comes from | Kind |
| --- | --- | --- |
| `SUPABASE_URL`, `SUPABASE_ANON_KEY` | production project | variable |
| `STAGING_SUPABASE_URL`, `STAGING_SUPABASE_ANON_KEY` | staging project | variable |
| `SUPABASE_DB_URL` | production → Connect → Session pooler connection string, with the password filled in | secret |
| `STAGING_SUPABASE_DB_URL` | the same, for the staging project | secret |
| `BACKUP_PASSPHRASE` | any long random phrase; keep a copy outside GitHub, since it is the only way to open a backup | secret |

3. Sign-in emails: Authentication → Emails → **Magic Link** template, add `Your code: {{ .Token }}` so
   people can type a code as well as tap the link. Supabase's built-in mailer sends only a few emails
   an hour; before the pilot, connect a free SMTP sender (Resend) under Authentication → Emails → SMTP.
4. In each project, Authentication → URL Configuration: set Site URL to the production address
   below and add the staging address as a redirect URL.
5. Google sign-in (optional, free): in Google Cloud Console create an OAuth client (Web application),
   with authorized redirect URI `https://<project-ref>.supabase.co/auth/v1/callback`. Paste its client ID and
   secret into Supabase → Authentication → Sign In / Providers → Google. Then turn the button on with the
   flag `googleSignIn=on` (in `FLAGS` / `STAGING_FLAGS`, or `?flags=googleSignIn=on` to try it on one device).
6. The **Database schema** workflow applies `supabase/migrations` to staging, then production, using
   the secrets above. It runs whenever a migration changes on main, or by hand from the Actions tab.
   The privacy rules are tested in `apps/web/test/rls.test.ts`.

## How sync works

Each kind of data has its own table: settings in `profiles.settings`, pantry rows in `pantry_items`,
saved plans in `plans` (one row each), and recorded prices in `price_observations`. Every device keeps
a copy of what the cloud held after its last sync, so a merge can tell who changed what: edits to
different things on two devices both survive, and when both changed the same thing the more recent edit
wins. Settings are saved with a compare-and-swap (`save_settings`), so two devices saving at once never
overwrite each other. Accounts from the first version (everything in one document) move to the tables
on their next sync. Rules: `apps/web/src/lib/sync-rules.ts`, `sync-engine.ts`; tests:
`apps/web/test/sync.test.ts`, and `apps/web/e2e/sync.cjs` for two browsers against a stand-in server.

Household sharing (Settings → Household): the person who plans makes a one-time invite code (good for 7
days) and sends the link. Whoever joins sees the planner's current plan, week and grocery ticks on their own
phone after each sync; nothing else of the planner's is visible to them, and their own settings stay private.
It all goes through database functions (`create_household_invite`, `join_household`, `household_plan`, …),
tested in `apps/web/test/households.test.ts`.

People can delete their account in Settings → Account (`delete_account` removes every row they own).

## Sentry (error reports)

Sign up at sentry.io with GitHub, create a **Browser JavaScript** project and copy its DSN.

| Name | Kind |
| --- | --- |
| `SENTRY_DSN` | variable (one project; reports are tagged production or staging) |

## PostHog (anonymous usage stats)

Sign up at posthog.com (US cloud). The free plan allows one project, which is enough: every event
carries `app_env` (production or staging), so filter on it. Copy the project API key (it starts with
`phc_`) into both variables below.

| Name | Kind |
| --- | --- |
| `POSTHOG_KEY` | variable |
| `STAGING_POSTHOG_KEY` | variable |

People can turn analytics off in Settings → Your data. Events carry counts and choices only.

## Feature flags

Optional variables `FLAGS` and `STAGING_FLAGS`, for example `accounts=on`. Defaults are in
`apps/web/src/lib/flags.ts`. To try a flag on one device, add `?flags=accounts=on` to any page
address (`?flags=reset` clears it).

## What runs on a schedule

| Workflow | When | Does |
| --- | --- | --- |
| Keep the database awake | every 3 days | calls `public.ping` on both projects so free projects don't pause |
| Nightly database backup | 07:41 UTC | encrypted production dump, kept 30 days as a workflow artifact |
| Database schema | when a migration changes, or by hand | applies new migrations to staging, then production |
| Uptime check | every 30 minutes | the live site, staging and the database; a failure emails the repo owner |

## Where each build lives

- Production: https://mbelcher-cmu.github.io/howToMealPrep/
- Staging (same commit, staging keys, its own saved data): https://mbelcher-cmu.github.io/howToMealPrep/staging/
