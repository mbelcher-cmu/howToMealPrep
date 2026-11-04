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

3. In each project, Authentication → URL Configuration: set Site URL to the production address
   below and add the staging address as a redirect URL.
4. The **Database schema** workflow applies `supabase/migrations` to staging, then production, using
   the secrets above. It runs whenever a migration changes on main, or by hand from the Actions tab.
   The privacy rules are tested in `apps/web/test/rls.test.ts`.

## Sentry (error reports)

Sign up at sentry.io with GitHub, create a **Browser JavaScript** project and copy its DSN.

| Name | Kind |
| --- | --- |
| `SENTRY_DSN` | variable (one project; reports are tagged production or staging) |

## PostHog (anonymous usage stats)

Sign up at posthog.com (US cloud) and create two projects, production and staging. Copy each
project API key (it starts with `phc_`).

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
