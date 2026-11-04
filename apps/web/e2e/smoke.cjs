const { chromium } = require('playwright');
const OUT = process.argv[2] || require("os").tmpdir();
const BASE_URL = process.env.BASE_URL;
const BASE = BASE_URL || "http://localhost:4173";
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  await page.goto(BASE + '/');
  await page.waitForURL('**/welcome/**', { timeout: 10000 });
  await page.screenshot({ path: `${OUT}/01-welcome.png` });
  for (let i = 0; i < 6; i++) await page.getByRole('button', { name: /^Next/ }).click();
  await page.screenshot({ path: `${OUT}/02-welcome-stores.png` });
  await page.getByRole('button', { name: /Build my plan/ }).click();
  await page.waitForURL('**/plan/**');
  const t0 = Date.now();
  await page.getByText('Recipes this week').waitFor({ timeout: 30000 });
  console.log('first plan ms', Date.now() - t0);
  await page.screenshot({ path: `${OUT}/03-plan.png`, fullPage: true });
  const kcalBefore = await page.locator('text=Calories / day').locator('..').innerText();
  // live update: change calories
  const cal = page.getByLabel('Calories per day');
  await cal.fill('2800');
  await page.waitForTimeout(400);
  await page.getByText('Updating plan').waitFor({ timeout: 5000 }).catch(() => console.log('no updating indicator seen'));
  await page.getByText('Updating plan').waitFor({ state: 'detached', timeout: 30000 });
  const kcalAfter = await page.locator('text=Calories / day').locator('..').innerText();
  console.log('before:', kcalBefore.replace(/\n/g, ' | '));
  console.log('after:', kcalAfter.replace(/\n/g, ' | '));
  for (const p of ['', 'groceries/', 'prep/', 'recipes/', 'recipes/chicken_tikka/', 'pantry/', 'settings/']) {
    await page.goto(BASE + '/' + p);
    await page.waitForTimeout(800);
    await page.screenshot({ path: `${OUT}/d-${p.replace(/\//g, '_') || 'home'}.png`, fullPage: true });
  }
  // phone, dark
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: 'dark', storageState: await ctx.storageState() });
  const pp = await phone.newPage();
  pp.on('pageerror', (e) => errors.push('phone pageerror: ' + e.message));
  for (const p of ['', 'plan/', 'groceries/', 'prep/', 'recipes/']) {
    await pp.goto(BASE + '/' + p);
    await pp.waitForTimeout(1500);
    const sw = await pp.evaluate(() => document.documentElement.scrollWidth);
    if (sw > 390) console.log('horizontal overflow on', p, sw);
    await pp.screenshot({ path: `${OUT}/m-${p.replace(/\//g, '_') || 'home'}.png`, fullPage: true });
  }
  console.log('errors:', JSON.stringify(errors, null, 1));
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
