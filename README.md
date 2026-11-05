# MacroAisle

Plan a week of meal prep that hits your calories and macros within your grocery budget, then shop it in person at stores near you (Pittsburgh first).

Everything runs in the browser. There is no server and no account yet. Settings and plans are saved on the device.

## Layout

| Path | What it is |
| --- | --- |
| `packages/nutrition` | Energy needs (Mifflin-St Jeor), calorie and macro targets (kcal always = 4P + 4C + 9F), meals and snacks per day, adherence checks |
| `packages/catalog` | 118 ingredients with nutrition and price estimates for Aldi, Giant Eagle, Walmart and Trader Joe's (Walmart carries every one, so plans work anywhere); 137 recipes across 27 cuisines and 12 moods; 21 ready-made meal preps |
| `packages/planner` | The optimizer: a mixed-integer program solved with HiGHS (WebAssembly) that picks recipes, portions and whole packages to buy, plus the prep-day schedule |
| `apps/web` | Next.js static site: onboarding, home, plan, groceries, prep day, recipes, pantry and prices, settings |

## Run it

```bash
npm install
npm test                      # unit, property and golden-profile tests for the three packages
npm run dev -w @prep-cart/web # http://localhost:3000
npm run build -w @prep-cart/web   # static site in apps/web/out
```

End-to-end tests in a real browser (after a build): `npm run e2e:ci -w @prep-cart/web`. They serve `apps/web/out` themselves and walk onboarding, the plan, live re-planning, the grocery list, recipe search, every page on a phone (no sideways scrolling), an axe accessibility scan in light and dark (serious or critical problems fail the build), and offline use. CI runs them on every pull request and before every deploy. Set `BASE_URL` to test a deployed copy instead.

The older screenshot script is still there: serve `apps/web/out` on port 4173, then `npm run e2e -w @prep-cart/web`.

## How it works

- The planner runs in a Web Worker so the page stays responsive. Every input change re-plans after 400 ms.
- The solver's loader (`highs.js`) and WebAssembly (`highs.wasm`) are copied into `public/` before dev and build, and the worker loads them with `importScripts`.
- Offline: `public/sw.js` is the service worker. After `next build`, `scripts/sw-precache.mjs` writes the list of files to precache (every main page, scripts, fonts, food photos, the solver; about 7.6 MB) and a build id into `out/sw.js`. Pages are network first but fall back to the cached copy after 3.5 seconds, so a weak signal in a store doesn't stall the list.
- Nearby stores come from OpenStreetMap (Nominatim and Overpass), called from the browser only when you ask.
- Set `NEXT_PUBLIC_BASE_PATH` when hosting under a sub-path, such as GitHub Pages.
