/**
 * End-to-end checks of the built app, run against the static export in a real browser.
 *
 *   npm run build -w @prep-cart/web
 *   npm run e2e:ci -w @prep-cart/web   (serves apps/web/out itself)
 *
 * or point it at any running copy with BASE_URL=https://.../howToMealPrep npm run e2e:ci.
 * Each test starts where the one before it left off (one person, one device), so they run in order.
 */
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { chromium } = require("playwright");
const axe = require("axe-core");
const { serve } = require("./serve.cjs");

const PAGES = ["", "plan/", "groceries/", "shop/", "prep/", "recipes/", "recipes/chicken_tikka/", "recipes/import/", "pantry/", "settings/", "eat-out/", "preps/", "more/", "next-week/"];
/** axe rule sets we hold the app to: WCAG 2.1 A and AA plus axe's best practices */
const AXE_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "best-practice"];

let server, base, browser, ctx, page;
const errors = [];

function watch(p, label) {
  p.on("pageerror", (e) => errors.push(`${label} pageerror: ${e.message}`));
  p.on("console", (m) => {
    if (m.type() !== "error") return;
    const t = m.text();
    // analytics and error-report hosts are not reachable from CI; that is not an app bug
    if (/posthog|sentry|supabase|Failed to load resource/i.test(t)) return;
    errors.push(`${label} console: ${t}`);
  });
}

/** Opens Plan and waits for the first solve (it runs in a worker and loads the solver). */
async function openPlan(p) {
  await p.goto(base + "/plan/");
  await p.getByText("Recipes this week").first().waitFor({ timeout: 45000 });
}

/** Reads "2,753 of 2,760 calories a day" off the calorie ring. */
async function calories(p) {
  const label = await p.locator('[aria-label$="calories a day"]').first().getAttribute("aria-label");
  const [actual, target] = label.match(/[\d,]+/g).map((n) => Number(n.replace(/,/g, "")));
  return { actual, target };
}

async function axeScan(p, name) {
  if (!(await p.evaluate(() => typeof window.axe !== "undefined"))) await p.addScriptTag({ content: axe.source });
  const r = await p.evaluate((tags) => window.axe.run(document, { runOnly: tags, resultTypes: ["violations"] }), AXE_TAGS);
  return r.violations.map((v) => ({ page: name, id: v.id, impact: v.impact, count: v.nodes.length, example: v.nodes[0]?.html.slice(0, 160) }));
}

before(async () => {
  if (process.env.BASE_URL) base = process.env.BASE_URL.replace(/\/$/, "");
  else {
    // a build made with a base path (GitHub Pages: /howToMealPrep) only works when served under it
    const prefix = (process.env.NEXT_PUBLIC_BASE_PATH ?? "").replace(/\/$/, "");
    server = await serve(path.join(__dirname, "..", "out"), 0, prefix);
    base = `http://localhost:${server.address().port}${prefix}`;
  }
  browser = await chromium.launch();
  ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, acceptDownloads: true });
  page = await ctx.newPage();
  watch(page, "phone");
});

after(async () => {
  await browser?.close();
  server?.close();
});

test("a first visit goes to onboarding, and finishing it lands on Home", async () => {
  await page.goto(base + "/");
  await page.waitForURL("**/welcome/**", { timeout: 15000 });
  await page.getByRole("radio", { name: "Maintain" }).click();
  await page.getByRole("radio", { name: "Male", exact: true }).click();
  await page.getByLabel("Age", { exact: true }).fill("30");
  await page.getByLabel("Height", { exact: true }).fill("5");
  await page.getByLabel("Inches").fill("10");
  await page.getByLabel("Weight", { exact: true }).fill("180");
  await page.getByLabel("How active are you?").selectOption("moderate");
  await page.getByRole("button", { name: /^Next/ }).click();
  await page.getByRole("button", { name: /^Next/ }).click();
  // favorites (mealRanking flag): one screen per meal; rank a lunch-and-dinner pick on the first, skip the rest
  const build = page.getByRole("button", { name: /Build my plan/ });
  for (let step = 0; step < 6 && !(await build.isVisible()); step++) {
    const options = page.getByRole("button", { name: /^Rank / });
    if (step === 0 && (await options.count())) {
      await options.first().click();
      await page.getByRole("button", { name: /your number 1/ }).waitFor();
    }
    await page.getByRole("button", { name: /^(Next|Skip)/ }).click();
  }
  await build.click();
  await page.waitForURL(base + "/", { timeout: 15000 });
  assert.ok(await page.getByRole("navigation", { name: "Main" }).first().isVisible(), "tab bar shows on Home");
});

test("the plan solves and hits the calorie target within 5%", async () => {
  await openPlan(page);
  const { actual, target } = await calories(page);
  assert.ok(target > 1500 && target < 4000, `sane target, got ${target}`);
  assert.ok(Math.abs(actual - target) / target < 0.05, `plan gives ${actual} kcal for a ${target} target`);
});

test("changing calories re-plans live and the new target survives a reload", async () => {
  await page.getByRole("button", { name: "Calories and macros" }).click();
  const cal = page.getByLabel("Calories per day");
  await cal.fill("2800");
  await cal.blur();
  // the target is rebuilt from grams of protein, carbs and fat (4/4/9), so it lands within a few kcal of 2,800
  await page.waitForFunction(() => {
    const m = /^([\d,]+) of ([\d,]+) calories/.exec(document.querySelector('[aria-label$="calories a day"]')?.getAttribute("aria-label") ?? "");
    if (!m) return false;
    const [actual, target] = [m[1], m[2]].map((n) => Number(n.replace(/,/g, "")));
    return Math.abs(target - 2800) <= 30 && Math.abs(actual - target) / target < 0.05;
  }, null, { timeout: 45000 });
  await page.reload();
  await page.getByText("Recipes this week").first().waitFor({ timeout: 45000 });
  assert.ok(Math.abs((await calories(page)).target - 2800) <= 30);
});

test("the grocery list has items, and checking one off survives a reload", async () => {
  await page.goto(base + "/groceries/");
  const boxes = page.locator('main input[type="checkbox"]');
  await boxes.first().waitFor({ state: "attached", timeout: 15000 });
  const n = await boxes.count();
  assert.ok(n >= 5, `expected a real shopping list, got ${n} items`);
  const first = boxes.first();
  assert.equal(await first.isChecked(), false);
  await first.check({ force: true });
  await page.reload();
  await boxes.first().waitFor({ state: "attached" });
  assert.equal(await page.locator('main input[type="checkbox"]').first().isChecked(), true, "checked item stays checked");
  await page.locator('main input[type="checkbox"]').first().uncheck({ force: true });
});

test("recipe search narrows the list and a recipe page opens", async () => {
  await page.goto(base + "/recipes/");
  const count = () => page.locator("main ul > li").count();
  await page.locator("main ul > li").first().waitFor();
  const all = await count();
  await page.getByLabel("Search recipes").fill("chicken");
  await page.waitForTimeout(200);
  const some = await count();
  assert.ok(some > 0 && some < all, `search narrows ${all} to ${some}`);
  await page.locator("main ul > li a").first().click();
  await page.waitForURL("**/recipes/*/");
  assert.ok(await page.getByRole("heading", { level: 1 }).isVisible());
});

test("rating a recipe brings picks like it, with a match and the reason", async () => {
  // behind the recommendations flag (off in production): turn it on for this device, then back to the build's flags
  await page.goto(base + "/recipes/?flags=recommendations=on");
  await page.getByText("Get recipes picked for you.").waitFor();
  await page.goto(base + "/recipes/chickpea_curry/");
  await page.getByRole("radio", { name: /^5 stars/ }).click();
  await page.goto(base + "/recipes/");
  const rail = page.getByRole("group", { name: "Picked for you" });
  await rail.waitFor();
  assert.ok(await rail.getByText(/\d+% match/).first().isVisible(), "picks show a match");
  assert.ok(await rail.getByText("Because you liked Chickpea spinach coconut curry").first().isVisible(), "picks say why");
  await page.goto(base + "/recipes/chicken_tikka/");
  await page.getByText(/\d+% match/).first().waitFor();
  await page.goto(base + "/recipes/?flags=reset");
  await page.locator("main").waitFor();
});

/** The recipe names in "Recipes this week", in order. */
async function planRecipes(p) {
  await p.getByText("Recipes this week").first().waitFor({ timeout: 45000 });
  return (await p.getByRole("button", { name: /^Skip .+ this week$/ }).evaluateAll((els) => els.map((e) => e.getAttribute("aria-label")))).map((l) => l.replace(/^Skip | this week$/g, ""));
}
async function waitForReplan(p, before) {
  await p.waitForFunction((prev) => {
    const now = [...document.querySelectorAll("button[aria-label^='Skip '][aria-label$=' this week']")].map((e) => e.getAttribute("aria-label")).join("|");
    return now && now !== prev;
  }, before.map((n) => `Skip ${n} this week`).join("|"), { timeout: 45000 });
}

test("skipping a recipe re-plans without it, and Try another plan changes the week", async () => {
  await page.goto(base + "/plan/");
  const before = await planRecipes(page);
  assert.ok(before.length >= 2, `a week has several recipes, got ${before}`);
  await page.getByRole("button", { name: `Skip ${before[0]} this week` }).click();
  await waitForReplan(page, before);
  const skipped = await planRecipes(page);
  assert.ok(!skipped.includes(before[0]), `${before[0]} is gone after skipping`);
  await page.getByRole("button", { name: "Try another plan" }).click();
  await waitForReplan(page, skipped);
});

test("in-store mode ticks items into the cart", async () => {
  await page.goto(base + "/shop/");
  const count = page.getByText(/ of \d+ in the cart/).first();
  await count.waitFor();
  assert.match(await count.innerText(), /^0 of/);
  await page.getByText("Mark as in the cart").first().locator("xpath=..").click();
  await page.waitForFunction(() => /^1 of/.test([...document.querySelectorAll("main span")].find((e) => / in the cart$/.test(e.textContent ?? ""))?.textContent ?? ""));
});

test("prep day exports a calendar file", async () => {
  await page.goto(base + "/prep/");
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: /calendar/i }).first().click()]);
  const body = require("node:fs").readFileSync(await download.path(), "utf8");
  assert.match(body, /BEGIN:VEVENT/);
  assert.match(body, /END:VCALENDAR/);
});

test("adding takeout on Eat out takes that meal out of the prep", async () => {
  await page.goto(base + "/eat-out/");
  await page.getByRole("button", { name: /^Add takeout for Friday (Dinner|Main meal|Meal 3)/ }).first().click();
  await page.locator("main button", { hasText: /bowl|sandwich|wrap/i }).first().click();
  await page.getByRole("button", { name: /^Remove takeout on Friday/ }).first().waitFor();
  await page.goto(base + "/plan/");
  await page.getByText("Recipes this week").first().waitFor({ timeout: 45000 });
  await page.waitForFunction(() => /takeout/i.test(document.querySelector("main")?.innerText ?? ""), null, { timeout: 45000 });
  await page.goto(base + "/eat-out/");
  await page.getByRole("button", { name: /^Remove takeout on Friday/ }).first().click();
});

test("every main page renders on a phone without errors or sideways scrolling", async () => {
  for (const p of PAGES) {
    await page.goto(base + "/" + p);
    await page.locator("main").waitFor();
    await page.waitForTimeout(300);
    const sw = await page.evaluate(() => document.documentElement.scrollWidth);
    assert.ok(sw <= 390, `/${p} scrolls sideways (${sw}px wide)`);
    assert.ok(await page.getByRole("heading", { level: 1 }).count() >= 1, `/${p} has a page title`);
  }
});

test("no serious accessibility problems on any page, light, dark and desktop", async () => {
  const found = [];
  for (const scheme of ["light", "dark"]) {
    await page.emulateMedia({ colorScheme: scheme });
    for (const p of scheme === "light" ? PAGES : ["", "plan/", "groceries/", "recipes/"]) {
      await page.goto(base + "/" + p);
      await page.locator("main").waitFor();
      await page.waitForTimeout(600);
      found.push(...(await axeScan(page, `${scheme} /${p}`)));
    }
  }
  await page.emulateMedia({ colorScheme: "light" });
  // desktop has its own layout (sidebar, two columns)
  await page.setViewportSize({ width: 1280, height: 860 });
  for (const p of ["", "plan/", "groceries/", "eat-out/", "recipes/import/", "settings/"]) {
    await page.goto(base + "/" + p);
    await page.locator("main").waitFor();
    await page.waitForTimeout(600);
    found.push(...(await axeScan(page, `desktop /${p}`)));
  }
  await page.setViewportSize({ width: 390, height: 844 });
  const blocking = found.filter((v) => v.impact === "serious" || v.impact === "critical");
  for (const v of found.filter((v) => !blocking.includes(v))) console.log(`  a11y (${v.impact}) ${v.page} ${v.id} x${v.count}: ${v.example}`);
  assert.deepEqual(blocking, [], "serious or critical accessibility violations");
});

test("onboarding passes the accessibility scan too", async () => {
  const fresh = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const p = await fresh.newPage();
  watch(p, "fresh");
  await p.goto(base + "/welcome/");
  await p.locator("main").waitFor();
  const v = await axeScan(p, "/welcome/");
  await fresh.close();
  assert.deepEqual(v.filter((x) => x.impact === "serious" || x.impact === "critical"), []);
});

test("the app opens offline after one visit", async () => {
  // the service worker caches pages as they load; give it a moment to install and claim the page
  await page.goto(base + "/");
  await page.evaluate(() => navigator.serviceWorker?.ready);
  for (const p of ["", "groceries/", "shop/", "plan/", "recipes/"]) { await page.goto(base + "/" + p); await page.locator("main").waitFor(); }
  await page.waitForTimeout(500);
  await ctx.setOffline(true);
  try {
    for (const p of ["", "groceries/", "shop/", "plan/", "prep/", "recipes/chicken_tikka/"]) {
      await page.goto(base + "/" + p);
      await page.locator("main").waitFor({ timeout: 10000 });
      assert.ok((await page.locator("main").innerText()).trim().length > 20, `/${p} shows content offline`);
    }
  } finally {
    await ctx.setOffline(false);
  }
});

test("a new phone can open pages offline it never visited, once the app has loaded", async () => {
  const fresh = await browser.newContext({ viewport: { width: 390, height: 844 }, storageState: await ctx.storageState() });
  const p = await fresh.newPage();
  watch(p, "precache");
  await p.goto(base + "/");
  await p.locator("main").waitFor();
  // ready resolves once the worker has installed, and install finishes only after the precache
  await p.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
  await fresh.setOffline(true);
  try {
    for (const [path, title] of [["pantry/", "Pantry and prices"], ["settings/", "Settings"], ["eat-out/", "Eat out"], ["recipes/import/", "Add a recipe"]]) {
      await p.goto(base + "/" + path);
      // the right page, not the Home fallback
      await p.getByRole("heading", { level: 1, name: title }).waitFor({ timeout: 10000 });
    }
  } finally {
    await fresh.close();
  }
});

test("a damaged or odd-shaped save never leaves the app blank or crashed", async () => {
  for (const saved of ["not json{", JSON.stringify({ state: { onboarded: true, budget: null, stores: "aldi", occasions: {}, targets: null }, version: 1 })]) {
    const fresh = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: "block" });
    await fresh.addInitScript((v) => { if (!sessionStorage.getItem("seeded")) { localStorage.setItem("prep-cart-v1", v); sessionStorage.setItem("seeded", "1"); } }, saved);
    const p = await fresh.newPage();
    const crashes = [];
    p.on("pageerror", (e) => crashes.push(e.message));
    await p.goto(base + "/settings/");
    await p.getByRole("heading", { level: 1 }).first().waitFor({ timeout: 15000 });
    assert.doesNotMatch(await p.locator("body").innerText(), /Application error|Something went wrong/);
    assert.deepEqual(crashes, [], `save ${saved.slice(0, 30)}`);
    await fresh.close();
  }
});

test("no script errors along the way", () => {
  assert.deepEqual(errors, []);
});
