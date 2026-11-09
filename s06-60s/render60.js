// render60.js — เรนเดอร์ S06 60 วิ: puppeteer-core + Chromium ของ Playwright
// เรียก drawFrame(t) ทีละเฟรม แคปเป็น PNG (60 วิ @30fps = 1,800 เฟรม)
// ดัดแปลงจาก s06-full-v3/render.js (วิธีที่เวิร์กแล้ว):
// - /tmp เต็ม 100% -> userDataDir + TMPDIR ไว้บนดิสก์ใหญ่
// - แรมน้อย -> --single-process --no-zygote
// - waitForFunction ทำให้ frame detached ใน single-process -> manual polling
// - โหลดผ่าน HTTP port 8931 (เสิร์ฟจากโฟลเดอร์ motionforge-benchmark) แทน file://
// ต่างจาก v3: เปิด HTTP server เองถ้ายังไม่รัน + --start/--end (เฟรม)
// + ข้ามเฟรมที่มี PNG อยู่แล้ว (resume) + เก็บ error รายเฟรมแล้วรายงานตอนจบ
//
//   node render60.js --start 0 --end 0        # smoke test 1 เฟรม
//   node render60.js --start 1179 --end 1179  # เฟรมจุดหัวแตะน้ำ (t=39.31)
//   node render60.js                          # เต็ม 1,800 เฟรม (F0–F1799)
//   (F1800 = t=60.00 ปลายคลิป — เรนเดอร์เฉพาะตอน smoke test ได้ด้วย --end 1800)
const puppeteer = require('/home/hatch/workspace/mascot-test/node_modules/puppeteer-core');
const fs = require('fs');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');
const DIR = __dirname;
const BENCH_DIR = path.join(DIR, '..');
const PORT = 8931;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function parseArgs() {
  const a = { start: 0, end: 1799 };
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--start' && argv[i + 1] !== undefined) a.start = parseInt(argv[++i], 10);
    else if (argv[i] === '--end' && argv[i + 1] !== undefined) a.end = parseInt(argv[++i], 10);
  }
  if (!Number.isFinite(a.start) || !Number.isFinite(a.end) || a.start < 0 || a.end < a.start || a.end > 1800) {
    throw new Error(`bad range --start ${a.start} --end ${a.end} (expect 0..1800, start<=end)`);
  }
  return a;
}

function serverUp() {
  return new Promise((resolve) => {
    const req = http.get(`http://127.0.0.1:${PORT}/s06-60s-v3/index.html`, (res) => {
      res.resume();
      resolve(res.statusCode === 200);
    });
    req.on('error', () => resolve(false));
    req.setTimeout(3000, () => { req.destroy(); resolve(false); });
  });
}

async function ensureServer() {
  if (await serverUp()) { console.log(`HTTP server already up on :${PORT}`); return null; }
  console.log(`starting python http.server :${PORT} in ${BENCH_DIR} ...`);
  const proc = spawn('python3', ['-m', 'http.server', String(PORT)], {
    cwd: BENCH_DIR, stdio: 'ignore', detached: false,
  });
  for (let i = 0; i < 50; i++) {
    await sleep(300);
    if (await serverUp()) { console.log('HTTP server up'); return proc; }
    if (proc.exitCode !== null) throw new Error(`http.server exited early (code ${proc.exitCode})`);
  }
  throw new Error('http.server did not come up in 15s');
}

(async () => {
  const { start, end } = parseArgs();
  fs.mkdirSync(path.join(DIR, 'frames'), { recursive: true });
  fs.mkdirSync('/home/hatch/workspace/.tmp-chrome', { recursive: true });
  const serverProc = await ensureServer();
  const errors = []; // {frame, t, kind, msg}
  let rendered = 0, skipped = 0, consecutiveDrawErr = 0;
  const drawMs = [];
  let browser = null;
  try {
    browser = await puppeteer.launch({
      executablePath: '/home/hatch/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome',
      headless: 'new',
      userDataDir: path.join(DIR, '.chrome-profile'),
      env: { ...process.env, TMPDIR: '/home/hatch/workspace/.tmp-chrome' },
      args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', '--single-process', '--no-zygote', '--force-device-scale-factor=1'],
    });
    const page = await browser.newPage();
    await page.setViewport({ width: 720, height: 1280, deviceScaleFactor: 1 });
    page.on('pageerror', (e) => {
      console.error('PAGE ERROR:', e.message);
      errors.push({ frame: 'page', t: null, kind: 'pageerror', msg: e.message });
    });
    page.on('console', (m) => {
      if (m.type() === 'error') {
        console.error('CONSOLE ERROR:', m.text());
        errors.push({ frame: 'page', t: null, kind: 'console', msg: m.text() });
      }
    });
    page.on('requestfailed', (r) => {
      console.error('REQ FAILED:', r.url(), r.failure() && r.failure().errorText);
      errors.push({ frame: 'page', t: null, kind: 'requestfailed', msg: `${r.url()} ${r.failure() && r.failure().errorText}` });
    });
    await page.goto(`http://127.0.0.1:${PORT}/s06-60s-v3/index.html`, { waitUntil: 'load', timeout: 30000 });
    async function waitDone(timeoutMs) {
      const t0 = Date.now();
      while (Date.now() - t0 < timeoutMs) {
        try { if (await page.evaluate(() => window.__done)) return true; } catch (e) { return false; }
        await sleep(300);
      }
      return false;
    }
    if (!await waitDone(30000)) throw new Error('initial drawFrame timeout');
    const loadErr = await page.evaluate(() => window.__drawErr || null);
    if (loadErr) throw new Error('initial load/draw error: ' + loadErr);
    const t0 = Date.now();
    for (let i = start; i <= end; i++) {
      const t = i / 30;
      const file = path.join(DIR, 'frames', 'frame-' + String(i).padStart(4, '0') + '.png');
      if (fs.existsSync(file)) { skipped++; continue; } // resume: ข้ามเฟรมที่มีแล้ว
      await page.evaluate((tt) => { window.__done = false; window.__drawErr = null; try { drawFrame(tt); } catch (e) { window.__drawErr = e.message; window.__done = true; } }, t);
      if (!await waitDone(60000)) throw new Error('drawFrame timeout at frame ' + i);
      const info = await page.evaluate(() => ({ ms: window.__drawMs, err: window.__drawErr || null }));
      if (info.err) {
        console.error(`DRAW ERROR frame ${i} t=${t.toFixed(2)}s: ${info.err}`);
        errors.push({ frame: i, t, kind: 'draw', msg: info.err });
        if (++consecutiveDrawErr >= 5) throw new Error(`5 consecutive draw errors, aborting at frame ${i}: ${info.err}`);
      } else {
        consecutiveDrawErr = 0;
        drawMs.push(info.ms);
      }
      rendered++;
      await page.screenshot({ path: file });
      if (rendered % 30 === 0) console.log(`frame ${i} (t=${t.toFixed(2)}s) draw=${(info.ms || 0).toFixed(0)}ms (${((Date.now() - t0) / 1000).toFixed(1)}s elapsed, rendered=${rendered} skipped=${skipped})`);
    }
    if (drawMs.length) {
      const sorted = [...drawMs].sort((a, b) => a - b);
      const avg = drawMs.reduce((s, v) => s + v, 0) / drawMs.length;
      console.log(`DONE frames ${start}–${end}: rendered=${rendered} skipped=${skipped} in ${((Date.now() - t0) / 1000).toFixed(1)}s | draw ms/frame (excl. screenshot): avg ${avg.toFixed(0)} median ${sorted[Math.floor(sorted.length / 2)].toFixed(0)} min ${sorted[0].toFixed(0)} max ${sorted[sorted.length - 1].toFixed(0)}`);
    } else {
      console.log(`DONE frames ${start}–${end}: rendered=${rendered} skipped=${skipped} (no draw timings — all skipped or errored)`);
    }
  } finally {
    if (browser) await browser.close().catch(() => {});
    if (serverProc) serverProc.kill();
  }
  if (errors.length) {
    console.error(`\nERRORS: ${errors.length}`);
    for (const e of errors) console.error(`  frame ${e.frame} t=${e.t} [${e.kind}] ${e.msg}`);
    process.exit(1);
  }
  console.log('NO ERRORS');
})().catch((e) => { console.error(e); process.exit(1); });
