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
    server = await serve(path.join(__dirname, "..", "out"));
    base = `http://localhost:${server.address().port}`;
  }
  browser = await chromium.launch();
  ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
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
  await page.getByRole("button", { name: /Build my plan/ }).click();
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

test("no serious accessibility problems on any page, light or dark", async () => {
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

test("no script errors along the way", () => {
  assert.deepEqual(errors, []);
});
