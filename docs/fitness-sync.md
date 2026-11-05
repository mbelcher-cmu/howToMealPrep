# Fitness sync

Workouts move calories to the days you train. Behind the `fitnessSync` flag (on in staging and
development, off in production).

## What ships now ($0, no server)

- **Training days** panel on the Plan page: each weekday is a rest day or up to two workouts
  (run, ruck, PT/HIIT, weights, bike, swim, sports, walk, yoga, other) with minutes.
- **How the numbers work** (`packages/nutrition/src/training.ts`):
  - Burn per workout = (MET − 1) × weight kg × hours (2024 Compendium of Physical Activities).
  - The weekly total stays 7 × the person's calorie target. Each day gets the target plus how much
    more (or less) it burns than the average day, capped at ±35% and never under the safe minimum.
  - Protein stays the same every day; carbs, then fat, carry the difference.
  - If the week looks more or less active than the profile's activity level (which sets the weekly
    calories), the panel offers "Match my calories to this week".
- **Meal prep delivery**: the planner still cooks the same food for the week. Portions on each day
  are scaled (bigger on training days, smaller on rest days) and every recipe's portions still add
  up to what was cooked (`scalePortions` in `packages/planner/src/schedule.ts`).
- **Home** shows today's line: training or rest day and the day's calories.
- **Workout import** (`packages/nutrition/src/workout-import.ts`), read on the device only. It
  builds a typical week from the last four weeks: a weekday counts when trained on at least half
  of those weeks, with that day's main workout and median minutes.
  - Strava: `activities.csv` from Settings, My Account, Download or delete your account, Request archive.
  - Garmin Connect: Activities list, Export CSV (`Activities.csv`).
  - Any `.gpx` or `.tcx` file (one workout each; pick several at once).
  - Apple Health: `export.zip` (Workout records).
- Fitbit (PKCE, already in Settings, Fitness apps) and Apple Health energy averages still set the
  calorie target itself.

## What real API sync would need later

| Service | How | What it needs | Cost |
|---|---|---|---|
| Strava | OAuth 2 + REST `GET /athlete/activities`, webhooks for new activities | A **server**: the token exchange needs the client secret (no PKCE for public clients). A Supabase Edge Function can hold the secret and refresh tokens. App review to go past 1 athlete; rate limit 200 requests/15 min, 2,000/day. Strava's API terms forbid showing their data to other users and require "Powered by Strava" branding. | Free |
| Fitbit (Google) | OAuth 2 with PKCE, `activities/list.json` | Works in the browser today: register a free "Personal" or "Client" app and set `NEXT_PUBLIC_FITBIT_CLIENT_ID`. Google is moving Fitbit accounts to Google accounts in 2025-2026; watch for the Google Health API replacing the Web API. | Free |
| Garmin | Garmin Connect Developer Program (Health / Activity API, push to a webhook) | Business application and approval by Garmin, a server endpoint to receive pushes. | Free once approved |
| Apple Health | HealthKit | Only from a native iOS app (no web API). Comes with the native app after funding. | $99/yr Apple Developer |
| Android (Health Connect) | Health Connect SDK | Native Android app only (Google Fit APIs are shut down). | $25 one time |
| Polar, Suunto, Coros, Whoop, Oura | OAuth partner APIs | Each needs a partner application and a server for the client secret and webhooks. | Free to apply |

Suggested order after the pilot: Fitbit (no server), then Strava through a Supabase Edge Function,
then Apple Health and Health Connect with the native apps.

## Turning it on in production

Change `fitnessSync.production` to `true` in `apps/web/src/lib/flags.ts`, or set the `FLAGS`
repository variable to `fitnessSync=on`. Anyone can try it on one device with
`?flags=fitnessSync=on` (and `?flags=reset` to undo).
