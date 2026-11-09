// smoke.js — เรนเดอร์เฟรมตัวอย่างไม่กี่เฟรมเพื่อตรวจ JS error + ดูภาพก่อนเรนเดอร์เต็ม
// รัน: node smoke.js [frame...]  (default: 0 45 90 160 180 200 250 300 321 359)
const puppeteer = require('/home/hatch/workspace/mascot-test/node_modules/puppeteer-core');
const path = require('path');
const DIR = __dirname;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const frames = process.argv.slice(2).map(Number).filter(Number.isFinite);
const list = frames.length ? frames : [45, 180, 211, 261, 301, 357];

(async () => {
  const browser = await puppeteer.launch({
    executablePath: '/home/hatch/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome',
    headless: 'new',
    userDataDir: path.join(DIR, '.chrome-profile-smoke'),
    env: { ...process.env, TMPDIR: '/home/hatch/workspace/.tmp-chrome' },
    args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', '--single-process', '--no-zygote', '--force-device-scale-factor=1'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 720, height: 1280, deviceScaleFactor: 1 });
  page.on('pageerror', (e) => console.error('PAGE ERROR:', e.message));
  page.on('console', (m) => { if (m.type() === 'error') console.error('CONSOLE ERROR:', m.text()); });
  page.on('requestfailed', (r) => console.error('REQ FAILED:', r.url(), r.failure() && r.failure().errorText));
  await page.goto('http://127.0.0.1:8931/s06-full-v3/index.html', { waitUntil: 'load', timeout: 30000 });
  async function waitDone(timeoutMs) {
    const t0 = Date.now();
    while (Date.now() - t0 < timeoutMs) {
      try { if (await page.evaluate(() => window.__done)) return true; } catch (e) { return false; }
      await sleep(200);
    }
    return false;
  }
  if (!await waitDone(30000)) throw new Error('initial drawFrame timeout');
  for (const i of list) {
    const t = i / 30;
    await page.evaluate((tt) => { window.__done = false; window.__drawErr = null; try { drawFrame(tt); } catch (e) { window.__drawErr = e.message; window.__done = true; } }, t);
    if (!await waitDone(60000)) throw new Error('drawFrame timeout at frame ' + i);
    const info = await page.evaluate(() => ({ ms: window.__drawMs, err: window.__drawErr || null }));
    if (info.err) throw new Error('drawFrame error at frame ' + i + ': ' + info.err);
    const file = path.join(DIR, 'smoke-frames', 'smoke-frame-' + String(i).padStart(4, '0') + '.png');
    await page.screenshot({ path: file });
    console.log(`frame ${i} t=${t.toFixed(2)}s draw=${info.ms.toFixed(0)}ms -> ${file}`);
  }
  await browser.close();
  console.log('SMOKE OK');
})().catch((e) => { console.error(e); process.exit(1); });
