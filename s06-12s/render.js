// render.js — เรนเดอร์ S06 เต็ม 12 วิ: puppeteer-core + Chromium ของ Playwright
// เรียก drawFrame(t) ทีละเฟรม แคปเป็น PNG 360 เฟรม (12 วิ @30fps)
// วิธีเดียวกับ ab-test ที่เวิร์กแล้ว:
// - /tmp เต็ม 100% -> userDataDir + TMPDIR ไว้บนดิสก์ใหญ่
// - แรมน้อย -> --single-process --no-zygote
// - waitForFunction ทำให้ frame detached ใน single-process -> manual polling
// - โหลดผ่าน HTTP (python http.server ที่ motionforge-benchmark/, port 8931) แทน file://
// ต้องเปิด HTTP server ก่อน: cd motionforge-benchmark && python3 -m http.server 8931
const puppeteer = require('/home/hatch/workspace/mascot-test/node_modules/puppeteer-core');
const fs = require('fs');
const path = require('path');
const DIR = __dirname;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const FRAMES = 360;

(async () => {
  const browser = await puppeteer.launch({
    executablePath: '/home/hatch/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome',
    headless: 'new',
    userDataDir: path.join(DIR, '.chrome-profile'),
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
      await sleep(300);
    }
    return false;
  }
  if (!await waitDone(30000)) throw new Error('initial drawFrame timeout');
  fs.mkdirSync(path.join(DIR, 'frames'), { recursive: true });
  const drawMs = [];
  const t0 = Date.now();
  for (let i = 0; i < FRAMES; i++) {
    const t = i / 30;
    await page.evaluate((tt) => { window.__done = false; window.__drawErr = null; try { drawFrame(tt); } catch (e) { window.__drawErr = e.message; window.__done = true; } }, t);
    if (!await waitDone(60000)) throw new Error('drawFrame timeout at frame ' + i);
    const info = await page.evaluate(() => ({ ms: window.__drawMs, err: window.__drawErr || null }));
    if (info.err) throw new Error('drawFrame error at frame ' + i + ': ' + info.err);
    drawMs.push(info.ms);
    const file = path.join(DIR, 'frames', 'frame-' + String(i).padStart(4, '0') + '.png');
    await page.screenshot({ path: file });
    if (i % 30 === 0) console.log(`frame ${i}/${FRAMES} t=${t.toFixed(2)}s draw=${info.ms.toFixed(0)}ms (${((Date.now() - t0) / 1000).toFixed(1)}s elapsed)`);
  }
  drawMs.sort((a, b) => a - b);
  const avg = drawMs.reduce((s, v) => s + v, 0) / drawMs.length;
  console.log(`DONE ${FRAMES} frames in ${((Date.now() - t0) / 1000).toFixed(1)}s | draw ms/frame (excl. screenshot): avg ${avg.toFixed(0)} median ${drawMs[Math.floor(FRAMES / 2)].toFixed(0)} min ${drawMs[0].toFixed(0)} max ${drawMs[FRAMES - 1].toFixed(0)}`);
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
