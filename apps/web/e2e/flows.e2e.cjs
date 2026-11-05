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

const PAGES = ["", "plan/", "groceries/", "shop/", "prep/", "recipes/", "recipes/chicken_tikka/", "recipes/import/", "pantry/", "settings/", "eat-out/", "preps/", "more/", "next-week/", "cook/", "calendar/"];
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

test("locking calories and fat: raising carbs takes from protein and nothing locked moves", async () => {
  if (!(await page.getByLabel("Calories per day").isVisible())) await page.getByRole("button", { name: "Calories and macros" }).click();
  const lockBtn = page.getByRole("button", { name: "Lock calories" });
  if (!(await lockBtn.count())) return; // macroLocks flag is off in this build
  const num = async (label) => Number((await page.getByLabel(label, { exact: true }).inputValue()).replace(/,/g, ""));
  const ensure = async (name, on) => {
    const b = page.getByRole("button", { name: `Lock ${name}` });
    if ((await b.getAttribute("aria-pressed")) !== String(on)) await b.click();
  };
  await ensure("calories", true);
  await ensure("fat", true);
  await ensure("protein", false);
  await ensure("carbs", false);
  const [kcal, protein, carbs, fat] = [await num("Calories per day"), await num("Protein"), await num("Carbs"), await num("Fat")];
  const c = page.getByLabel("Carbs", { exact: true });
  await c.fill(String(carbs + 20));
  await c.blur();
  await page.waitForFunction((p) => Number(document.getElementById([...document.querySelectorAll("label")].find((l) => l.textContent === "Protein")?.htmlFor ?? "")?.value) === p, protein - 20);
  assert.equal(await num("Fat"), fat, "locked fat holds");
  assert.ok(Math.abs((await num("Calories per day")) - kcal) <= 9, "locked calories hold");
  // with protein locked too, nothing can make room, so a carb change is refused
  await ensure("protein", true);
  await c.fill(String(carbs + 40));
  await c.blur();
  await page.getByText("Nothing else is unlocked to make room").waitFor();
  assert.equal(await num("Carbs"), carbs + 20);
  await ensure("fat", false);
  await ensure("carbs", false);
  await page.reload();
  await page.getByText("Recipes this week").first().waitFor({ timeout: 45000 });
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

test("cook mode walks through prep day one step at a time, with timers", async () => {
  // cookMode and aisleMode are off in production; turn them on for this device (later tests scan them too)
  await page.goto(base + "/prep/?flags=cookMode=on,aisleMode=on");
  await page.getByRole("heading", { name: "Storage and reheating" }).waitFor();
  await page.getByRole("link", { name: "Start cooking" }).first().click();
  await page.waitForURL("**/cook/**");
  const doneBtn = page.getByRole("button", { name: "Done, next step" });
  await doneBtn.waitFor();
  // the first steps start the oven or a recipe; within a few steps something is cooking on its own
  for (let i = 0; i < 4 && !(await page.getByRole("heading", { name: "Timers" }).isVisible()); i++) await doneBtn.click();
  await page.getByRole("heading", { name: "Timers" }).waitFor();
  const progress = async () => Number((await page.getByText(/ of \d+ steps done/).first().innerText()).match(/^(\d+)/)[1]);
  const n = await progress();
  assert.ok(n >= 1, `some steps done, got ${n}`);
  // progress and timers survive a reload
  await page.reload();
  await page.getByRole("heading", { name: "Timers" }).waitFor();
  assert.equal(await progress(), n);
  await page.getByRole("button", { name: "Back one step" }).click();
  await page.waitForFunction((was) => new RegExp(`^${was - 1} of`).test([...document.querySelectorAll("header span")].find((e) => / steps done$/.test(e.textContent ?? ""))?.textContent ?? ""), n);
});

test("aisle mode jumps between aisles and sets aside what you can't find", async () => {
  await page.goto(base + "/shop/");
  await page.getByRole("navigation", { name: "Jump to aisle" }).waitFor();
  const before = await page.getByText(/ of \d+ in the cart/).first().innerText();
  const cant = page.getByRole("button", { name: /^Can't find / }).first();
  const name = (await cant.getAttribute("aria-label")).replace("Can't find ", "");
  await cant.click();
  await page.getByRole("heading", { name: "Couldn't find" }).waitFor();
  await page.getByRole("button", { name: "Found it" }).first().click();
  await page.getByRole("button", { name: `${name}, in the cart. Tap to put back.` }).waitFor();
  assert.notEqual(await page.getByText(/ of \d+ in the cart/).first().innerText(), before);
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

test("a sale shows up as a deal on Groceries and the shopping calendar (price trends on)", async () => {
  // the flag stays on for this device, so the page and accessibility scans below cover the deal hints too
  await page.goto(base + "/groceries/?flags=pricetrends=on,calendar=on");
  await page.locator("main li input[type=checkbox]").first().waitFor({ timeout: 45000 });
  // shop at one store only: with several, each store's solve is time-limited and a re-plan can
  // land on a different store, which drops the sale item from the list for reasons unrelated to deals
  const storesBefore = await page.evaluate(() => {
    const k = Object.keys(localStorage).find((x) => /^prep-cart-(\w+-)?v1$/.test(x));
    const saved = JSON.parse(localStorage.getItem(k));
    const before = saved.state.stores;
    const chain = document.querySelector("main .card h2").textContent.trim().toLowerCase().replace(/[^a-z]/g, "");
    saved.state.stores = [chain];
    localStorage.setItem(k, JSON.stringify(saved));
    return before;
  });
  await page.reload();
  await page.locator("main li input[type=checkbox]").first().waitFor({ timeout: 45000 });
  const item = await page.evaluate(() => {
    const li = [...document.querySelectorAll("main li")].find((x) => x.querySelector("input[type=checkbox]"));
    return { name: li.querySelector("span.font-medium").textContent.trim(), store: li.closest(".card").querySelector("h2").textContent.trim() };
  });
  await page.goto(base + "/pantry/");
  await page.getByRole("radio", { name: /^Sales/ }).click();
  await page.getByLabel("Item").fill(item.name.slice(0, 14));
  await page.locator("main li button", { hasText: item.name }).first().click();
  await page.getByLabel("Store").selectOption({ label: item.store });
  await page.getByLabel("Sale price").fill("0.25");
  await page.getByRole("button", { name: "Add sale" }).click();
  await page.getByRole("button", { name: `Remove the ${item.name} sale` }).waitFor();

  await page.goto(base + "/groceries/");
  await page.getByText(/^Deals save about \$/).waitFor({ timeout: 45000 });
  assert.ok(await page.getByText(/(Stock up|Good deal) · \d+% off/).count() >= 1, "a deal hint on the sale item");
  await page.goto(base + "/calendar/");
  await page.getByText(/(Stock up|Good deal) · \d+% off/).first().waitFor({ timeout: 45000 });

  // put the week back as it was
  await page.goto(base + "/pantry/");
  await page.getByRole("radio", { name: /^Sales/ }).click();
  await page.getByRole("button", { name: `Remove the ${item.name} sale` }).click();
  await page.evaluate((stores) => {
    const k = Object.keys(localStorage).find((x) => /^prep-cart-(\w+-)?v1$/.test(x));
    const saved = JSON.parse(localStorage.getItem(k));
    saved.state.stores = stores;
    localStorage.setItem(k, JSON.stringify(saved));
  }, storesBefore);
  await page.reload();
  await page.locator("main").waitFor();
});

test("a lighter dinner moves calories to the other meals and the day still adds up", async () => {
  await openPlan(page);
  const { target: before } = await calories(page);
  await page.getByRole("button", { name: "Meals and rotation" }).click();
  const style = page.getByLabel("Dinner style");
  if (!(await style.count())) return; // mealStyles flag is off in this build
  const kcalOf = async (name) => Number((await page.locator("li", { has: page.getByLabel(`${name} style`) }).locator(".num").first().innerText()).match(/^([\d,]+) kcal/)[1].replace(/,/g, ""));
  const dinner = await kcalOf("Dinner");
  const lunch = await kcalOf("Lunch");
  await style.selectOption("light");
  await page.waitForFunction((d) => {
    const li = [...document.querySelectorAll("li")].find((x) => x.querySelector('select[id^="style-"]') && x.querySelector("label")?.textContent === "Dinner style");
    const m = /^([\d,]+) kcal/.exec(li?.querySelector(".num")?.textContent ?? "");
    return m && Number(m[1].replace(/,/g, "")) < d * 0.85;
  }, dinner);
  assert.ok((await kcalOf("Lunch")) > lunch, "lunch picks up what dinner gives back");
  await page.getByText("Recipes this week").first().waitFor({ timeout: 45000 });
  assert.ok(Math.abs((await calories(page)).target - before) <= 1, "the day's calorie target doesn't change");
  await page.reload();
  await page.getByRole("button", { name: "Meals and rotation" }).click();
  assert.equal(await page.getByLabel("Dinner style").inputValue(), "light");
  await page.getByLabel("Dinner style").selectOption("balanced");
});

test("opening macro locks and switching editing modes doesn't crash the editor", async () => {
  await openPlan(page);
  await page.getByRole("button", { name: "Calories and macros" }).click();
  const more = page.getByRole("button", { name: "Locks and more options" });
  if (!(await more.count())) return; // macroLocks flag is on: the locks editor replaces this one and has its own test
  await more.click();
  await page.getByRole("radio", { name: "Set grams freely" }).click();
  await page.getByRole("radio", { name: "Keep calories fixed" }).click();
  await page.getByRole("button", { name: "Fewer options" }).click();
  assert.ok(await page.getByLabel("Calories per day").isVisible(), "the editor is still on screen");
  assert.deepEqual(errors.filter((e) => /hook|Rendered (more|fewer)/i.test(e)), []);
});

test("Eat out can plan takeout for the week (eatOutPlus flag)", async () => {
  await page.goto(base + "/eat-out/?flags=eatOutPlus=on");
  await page.getByRole("heading", { name: "Plan takeout for me" }).waitFor();
  await page.getByRole("button", { name: "Plan takeout" }).click();
  await page.getByRole("status").filter({ hasText: /Added \d takeout meal/ }).waitFor();
  assert.ok(await page.getByRole("button", { name: /^Remove takeout on / }).count() >= 1, "takeout was placed on the week");
  // the picker gains search and sort
  await page.getByRole("button", { name: /^Add takeout for / }).first().click();
  await page.getByRole("searchbox", { name: "Search takeout" }).fill("chili");
  await page.locator("#takeout-picker li button", { hasText: /chili/i }).first().waitFor();
  await page.getByRole("button", { name: "Close" }).click();
  const v = (await axeScan(page, "eat-out/ with eatOutPlus")).filter((x) => x.impact === "serious" || x.impact === "critical");
  assert.deepEqual(v, [], JSON.stringify(v, null, 1));
  await page.getByRole("button", { name: "Clear all" }).click();
  await page.goto(base + "/eat-out/?flags=eatOutPlus=off");
});

test("a household member with their own diet: vegetarian food for them, one shared plan (householdGoals flag)", async () => {
  await page.goto(base + "/settings/?flags=householdGoals=on");
  await page.getByRole("button", { name: "Add a person" }).click();
  await page.getByRole("button", { name: /Person 2: Vegetarian$/ }).click();
  await page.goto(base + "/plan/");
  await page.getByText("Cooking for 2").first().waitFor({ timeout: 45000 });
  // their line shows calories and protein against their own goals
  await page.waitForFunction(() => /Person 2[\s\S]*of [\d,]+ kcal/.test(document.querySelector("main")?.innerText ?? ""), null, { timeout: 45000 });
  const found = [...(await axeScan(page, "household /plan/"))];
  await page.goto(base + "/settings/");
  await page.getByRole("button", { name: /Person 2: Vegetarian$/ }).waitFor();
  found.push(...(await axeScan(page, "household /settings/")));
  assert.deepEqual(found.filter((v) => v.impact === "serious" || v.impact === "critical"), [], "serious or critical accessibility violations");
  // back to one person and the build's own flags for the tests after this one
  await page.getByRole("button", { name: "Remove Person 2" }).click();
  await page.goto(base + "/settings/?flags=reset");
  await page.locator("main").waitFor();
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

test("the pantry tracker files food by where it lives and quick amounts stick", async () => {
  // behind the pantryV2 flag (off in production); it stays on so the accessibility scan below covers the tracker
  await page.goto(base + "/pantry/?flags=pantryV2=on");
  await page.getByLabel("Add to pantry").fill("frozen salmon");
  await page.getByRole("button", { name: /Frozen salmon fillets/ }).click();
  await page.getByLabel("Add to pantry").fill("large eggs");
  await page.getByRole("button", { name: /Large eggs/ }).click();
  await page.getByRole("heading", { name: "Freezer" }).waitFor();
  await page.getByRole("heading", { name: "Fridge" }).waitFor();
  const amounts = page.getByRole("group", { name: "How much Large eggs is left" });
  assert.equal(await amounts.getByRole("button", { name: "Full" }).getAttribute("aria-pressed"), "true", "new items start as a full package");
  await amounts.getByRole("button", { name: "Half" }).click();
  await page.reload();
  const after = page.getByRole("group", { name: "How much Large eggs is left" });
  assert.equal(await after.getByRole("button", { name: "Half" }).getAttribute("aria-pressed"), "true", "half survives a reload");
  // used up removes it; the salmon stays for the accessibility scan below
  await after.getByRole("button", { name: /Used up/ }).click();
  await page.getByRole("heading", { name: "Fridge" }).waitFor({ state: "detached" });
  await page.getByRole("heading", { name: "Freezer" }).waitFor();
});

test("no serious accessibility problems on any page, light, dark and desktop", async () => {
  const found = [];
  for (const scheme of ["light", "dark"]) {
    await page.emulateMedia({ colorScheme: scheme });
    for (const p of scheme === "light" ? PAGES : ["", "plan/", "groceries/", "recipes/", "prep/", "cook/", "shop/", "pantry/"]) {
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

test("whole foods only keeps processed food out of the plan and meal preps", async () => {
  // staging-only flag: switch it on for this device, and off again at the end
  await page.goto(base + "/plan/?flags=wholeFoods=on");
  await page.getByText("Recipes this week").first().waitFor({ timeout: 45000 });
  await page.getByRole("button", { name: "Diet, allergies and dislikes" }).click();
  const sw = page.getByRole("switch", { name: /Whole foods only/ });
  await sw.check({ force: true });
  assert.equal(await sw.isChecked(), true);
  const found = await axeScan(page, "whole foods /plan/");
  // the Pittsburgh comfort prep has bacon and pierogies, so it drops out
  await page.goto(base + "/preps/");
  await page.getByText(/fit your diet/).first().waitFor();
  assert.equal(await page.getByRole("heading", { name: "Pittsburgh comfort" }).count(), 0);
  assert.ok((await page.getByRole("button", { name: /Use this prep|In your plan/ }).count()) >= 3);
  found.push(...(await axeScan(page, "whole foods /preps/")));
  await page.goto(base + "/recipes/bacon_potato_bowls/");
  await page.getByText(/left out of whole-foods plans/).waitFor();
  assert.deepEqual(found.filter((v) => v.impact === "serious" || v.impact === "critical"), []);
  // back to how the earlier tests left things
  await openPlan(page);
  await page.getByRole("button", { name: "Diet, allergies and dislikes" }).click();
  await page.getByRole("switch", { name: /Whole foods only/ }).uncheck({ force: true });
  await page.goto(base + "/?flags=reset");
  await page.locator("main").waitFor();
});

test("no script errors along the way", () => {
  assert.deepEqual(errors, []);
});
