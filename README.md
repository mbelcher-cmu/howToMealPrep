# MacroAisle

Plan a week of meal prep that hits your calories and macros within your grocery budget, then shop it in person at stores near you (Pittsburgh first).

Everything runs in the browser. There is no server and no account yet. Settings and plans are saved on the device.

## Layout

| Path | What it is |
| --- | --- |
| `packages/nutrition` | Energy needs (Mifflin-St Jeor), calorie and macro targets (kcal always = 4P + 4C + 9F), meals and snacks per day, adherence checks |
| `packages/catalog` | 95 ingredients with nutrition and Pittsburgh price estimates for Aldi, Giant Eagle, Walmart and Trader Joe's; 78 recipes across 23 cuisines and 10 moods |
| `packages/planner` | The optimizer: a mixed-integer program solved with HiGHS (WebAssembly) that picks recipes, portions and whole packages to buy, plus the prep-day schedule |
| `apps/web` | Next.js static site: onboarding, home, plan, groceries, prep day, recipes, pantry and prices, settings |

## Run it

```bash
npm install
npm test                      # unit, property and golden-profile tests for the three packages
npm run dev -w @prep-cart/web # http://localhost:3000
npm run build -w @prep-cart/web   # static site in apps/web/out
```

Smoke test in a real browser (after a build): serve `apps/web/out` on port 4173, then `npm run e2e -w @prep-cart/web`.

## How it works

- The planner runs in a Web Worker so the page stays responsive. Every input change re-plans after 400 ms.
- The solver's loader (`highs.js`) and WebAssembly (`highs.wasm`) are copied into `public/` before dev and build, and the worker loads them with `importScripts`.
- Nearby stores come from OpenStreetMap (Nominatim and Overpass), called from the browser only when you ask.
- Set `NEXT_PUBLIC_BASE_PATH` when hosting under a sub-path, such as GitHub Pages.
