// Two-device sync check against a stand-in for Supabase.
// Build first with a Supabase URL set and accounts on (APP_ENV staging or development), then:
//   node e2e/sync.cjs [screenshot-dir]
// It serves out/ itself, signs both "devices" in as the same person, and checks that a plan,
// pantry edit and settings change made on one appear on the other, then deletes the account.
const { chromium } = require("playwright");
const http = require("http");
const fs = require("fs");
const path = require("path");

const OUT = process.argv[2] || require("os").tmpdir();
const ROOT = path.join(__dirname, "../out");
const SUPABASE = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://xfhxwkmeiktxvhedmfhj.supabase.co";
const REF = new URL(SUPABASE).hostname.split(".")[0];
// the app's saved-state key for the build being tested (staging by default)
const KEY = process.env.STORE_KEY || "prep-cart-staging-v1";
const USER = { id: "11111111-1111-1111-1111-111111111111", email: "tester@example.com", aud: "authenticated", role: "authenticated" };

// ---------- static server for out/ ----------
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".wasm": "application/wasm", ".json": "application/json", ".webp": "image/webp", ".png": "image/png", ".webmanifest": "application/manifest+json", ".woff2": "font/woff2" };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
  let f = path.join(ROOT, p);
  if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, "index.html");
  if (!fs.existsSync(f)) f = path.join(ROOT, "404.html");
  res.writeHead(200, { "content-type": types[path.extname(f)] || "application/octet-stream" });
  fs.createReadStream(f).pipe(res);
});

// ---------- in-memory Supabase (PostgREST subset this app uses) ----------
const db = { profiles: [{ id: USER.id, settings: {} }], pantry_items: [], plans: [], price_observations: [] };
let nextPriceId = 1;
let deleted = false;
const calls = [];

function filterRows(rows, params) {
  return rows.filter((r) => {
    for (const [k, v] of params) {
      if (["select", "order", "limit", "on_conflict", "columns"].includes(k)) continue;
      const [op, ...rest] = v.split(".");
      const val = rest.join(".");
      if (op === "eq" && String(r[k]) !== val) return false;
      if (op === "gt" && !(Number(r[k]) > Number(val))) return false;
      if (op === "in") { const list = val.replace(/^\(|\)$/g, "").split(",").map((x) => x.replace(/^"|"$/g, "")); if (!list.includes(String(r[k]))) return false; }
    }
    return true;
  });
}

async function handleSupabase(route) {
  const req = route.request();
  const url = new URL(req.url());
  const m = url.pathname.match(/^\/rest\/v1\/(rpc\/)?(\w+)/);
  if (!m) return route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
  const [, rpc, name] = m;
  const body = req.postData() ? JSON.parse(req.postData()) : null;
  calls.push(`${req.method()} ${rpc ? "rpc/" : ""}${name}`);
  const json = (data, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(data) });
  if (rpc) {
    if (name === "save_settings") {
      const p = db.profiles[0];
      if ((p.settings?.savedAt ?? 0) !== body.expected) return json(false);
      p.settings = body.doc;
      return json(true);
    }
    if (name === "delete_account") { deleted = true; for (const t of Object.keys(db)) db[t] = []; return json(null); }
    return json(null);
  }
  const table = db[name];
  const params = [...url.searchParams.entries()];
  if (req.method() === "GET") {
    let rows = filterRows(table, params).map((r) => ({ ...r }));
    if ((req.headers()["accept"] || "").includes("vnd.pgrst.object")) return rows.length ? json(rows[0]) : json(null, 406);
    return json(rows);
  }
  if (req.method() === "POST") {
    const conflict = (url.searchParams.get("on_conflict") || "").split(",").filter(Boolean);
    const ignore = (req.headers()["prefer"] || "").includes("ignore-duplicates");
    for (const row of Array.isArray(body) ? body : [body]) {
      const i = conflict.length ? table.findIndex((r) => conflict.every((c) => String(r[c]) === String(row[c]))) : -1;
      if (i >= 0) { if (!ignore) table[i] = { ...table[i], ...row }; continue; }
      if (name === "price_observations") row.id = nextPriceId++;
      if (name === "plans") row.created_at = row.created_at || new Date().toISOString();
      table.push(row);
    }
    return route.fulfill({ status: 201, body: "" });
  }
  if (req.method() === "DELETE") {
    const gone = new Set(filterRows(table, params));
    db[name] = table.filter((r) => !gone.has(r));
    return route.fulfill({ status: 204, body: "" });
  }
  return json({}, 405);
}

async function device(browser, name, base) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } });
  await ctx.route(`${SUPABASE}/**`, handleSupabase);
  const session = { access_token: "fake", token_type: "bearer", expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: "fake", user: USER };
  await ctx.addInitScript(([key, s]) => { if (!localStorage.getItem(key)) localStorage.setItem(key, s); }, [`sb-${REF}-auth-token`, JSON.stringify(session)]);
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(`${name}: ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource|posthog|sentry/i.test(m.text())) errors.push(`${name}: ${m.text()}`); });
  return { page, errors, base };
}

const appState = (page) => page.evaluate((k) => JSON.parse(localStorage.getItem(k) || "{}").state, KEY);
const waitSynced = (page) => page.waitForFunction(() => document.body.innerText.includes("Last synced just now"), null, { timeout: 15000 });

(async () => {
  await new Promise((r) => server.listen(0, r));
  const BASE = `http://localhost:${server.address().port}`;
  const browser = await chromium.launch();
  const fail = (msg) => { console.error("FAIL:", msg); process.exitCode = 1; };
  try {
    // Device A: set up the app, build a plan
    const a = await device(browser, "A", BASE);
    // start from a set-up app (onboarding has its own test); the plan page then builds a plan
    await a.page.goto(BASE + "/settings/");
    await a.page.evaluate((k) => localStorage.setItem(k, JSON.stringify({ state: { onboarded: true }, version: 1 })), KEY);
    await a.page.goto(BASE + "/plan/");
    await a.page.waitForFunction((k) => { try { return !!JSON.parse(localStorage.getItem(k) || "{}").state?.current; } catch { return false; } }, KEY, { timeout: 60000 });
    await a.page.goto(BASE + "/settings/");
    await a.page.getByText("Signed in as").waitFor();
    await a.page.getByRole("button", { name: "Sync now" }).click();
    await waitSynced(a.page);
    const aState = await appState(a.page);
    if (!db.plans.length) fail("no plan reached the cloud");
    if (!db.pantry_items.length) fail("no pantry rows reached the cloud");
    if (db.profiles[0].settings?.v !== 2) fail("settings document not saved as v2");
    if (db.profiles[0].settings?.settings?.pantry) fail("pantry leaked into the settings document");
    await a.page.screenshot({ path: `${OUT}/sync-a-settings.png` });

    // Device B: fresh browser, same account, should get the plan
    const b = await device(browser, "B", BASE);
    await b.page.goto(BASE + "/settings/");
    await b.page.getByText("Signed in as").waitFor();
    await b.page.waitForFunction(([k, id]) => { try { return JSON.parse(localStorage.getItem(k) || "{}").state?.current?.id === id; } catch { return false; } }, [KEY, aState.current.id], { timeout: 15000 });
    await b.page.goto(BASE + "/");
    await b.page.screenshot({ path: `${OUT}/sync-b-home.png` });
    const bState = await appState(b.page);
    if (!bState.onboarded) fail("device B was not set up from the cloud");
    if (bState.targets.kcal !== aState.targets.kcal) fail("targets differ between devices");

    // B adds a pantry item; it should reach the cloud and then device A
    const before = db.pantry_items.length;
    await b.page.evaluate((k) => {
      const raw = JSON.parse(localStorage.getItem(k));
      raw.state.pantry.push({ ingredientId: "e2e_test_item", grams: 123 });
      localStorage.setItem(k, JSON.stringify(raw));
    }, KEY);
    await b.page.reload();
    await b.page.goto(BASE + "/settings/");
    await b.page.getByRole("button", { name: "Sync now" }).click();
    await waitSynced(b.page);
    if (!db.pantry_items.some((r) => r.ingredient_id === "e2e_test_item")) fail(`pantry edit on B did not reach the cloud (rows ${before} -> ${db.pantry_items.length})`);

    await a.page.getByRole("button", { name: "Sync now" }).click();
    await a.page.waitForFunction((k) => { try { return JSON.parse(localStorage.getItem(k)).state.pantry.some((p) => p.ingredientId === "e2e_test_item"); } catch { return false; } }, KEY, { timeout: 15000 });

    // delete the account from A, keeping the device's data
    await a.page.getByRole("button", { name: "Delete account…" }).click();
    await a.page.screenshot({ path: `${OUT}/sync-delete-confirm.png` });
    await a.page.getByRole("button", { name: "Delete my account" }).click();
    await a.page.getByText("Your account was deleted").waitFor({ timeout: 10000 });
    if (!deleted) fail("delete_account was not called");
    const after = await appState(a.page);
    if (!after.current) fail("device data was erased though the box was unticked");
    await a.page.screenshot({ path: `${OUT}/sync-deleted.png` });

    const errors = [...a.errors, ...b.errors];
    if (errors.length) fail("console errors:\n" + errors.join("\n"));
    console.log(process.exitCode ? "sync e2e FAILED" : "sync e2e passed", "\ncalls:", [...new Set(calls)].join(", "));
  } catch (e) {
    fail(e.stack || e.message);
  } finally {
    await browser.close();
    server.close();
  }
})();
