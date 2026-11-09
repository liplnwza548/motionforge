// สคริปต์ทดสอบเดียวกันสำหรับ gerstner_bean.js และ gerstner_bean.js
// โหลด gerstnerPoint(x, t) จากแต่ละไฟล์ แล้วเทียบพิกัดที่ x = 0..400, t = 0, 0.5, 1.0 วิ
// ตรวจ: 4 ระลอกซ้อนกันจริงไหม, แอมพลิจูดรวม, displacement แนวนอน,
// ยอดแหลม/ท้องกว้าง (ความกว้างยอด vs ท้อง + dx'/dx), ผิวน้ำม้วนเป็นลูปไหม,
// ความถี่เชิงเวลา (DFT) ตรงกับ ω ของแต่ละระลอกไหม, ω สอดคล้อง dispersion ω²= g·k ไหม
const fs = require('fs');
const path = require('path');

function loadGerstner(file) {
  const code = fs.readFileSync(path.join(__dirname, file), 'utf8');
  const fn = new Function(code + '\n; return gerstnerPoint;');
  return { fn: fn(), code };
}

function fmtPt(p) { return `[${p[0].toFixed(1)},${p[1].toFixed(1)}]`; }

// ดึงพารามิเตอร์ระลอก (A, λ, dir, ω, Q, φ) จากข้อความไฟล์ — รองรับ 2 รูปแบบ
function parseWaves(code) {
  const waves = [];
  const reBEAN = /\{\s*A:\s*([\d.]+),\s*L:\s*([\d.]+),\s*dir:\s*(-?[\d.]+),\s*w:\s*([\d.]+),\s*Q:\s*([\d.]+),\s*phi:\s*(-?[\d.]+)\s*\}/g;
  let m;
  while ((m = reBEAN.exec(code))) waves.push({ A: +m[1], L: +m[2], dir: +m[3], w: +m[4], Q: +m[5], phi: +m[6] });
  if (waves.length) return waves;
  const reBEAN2 = /\(\s*([\d.]+),\s*([\d.]+),\s*([+-]?[\d.]+),\s*([\d.]+),\s*([\d.]+),\s*([\d.]+)\s*\)/g;
  while ((m = reBEAN2.exec(code))) waves.push({ A: +m[1], L: +m[2], dir: +m[3], w: +m[4], Q: +m[5], phi: +m[6] });
  return waves;
}

function analyze(name, file) {
  const { fn, code } = loadGerstner(file);
  const waves = parseWaves(code);
  console.log(`\n===== ${name} =====`);
  console.log(`waves parsed: ${waves.length} | ${waves.map(w => `A=${w.A} λ=${w.L} dir=${w.dir} ω=${w.w} Q=${w.Q} φ=${w.phi}`).join(' | ')}`);
  const sumA = waves.reduce((s, w) => s + w.A, 0);
  const maxA = Math.max(...waves.map(w => w.A));
  console.log(`ΣA = ${sumA.toFixed(1)} px | max single A = ${maxA.toFixed(1)} px | Q range ${Math.min(...waves.map(w => w.Q))}–${Math.max(...waves.map(w => w.Q))} (ต้องอยู่ใน 0–1)`);
  // dispersion: ω²/k ต่อระลอก — ถ้าเป็นคลื่นน้ำลึกจริงต้องได้ g เดียวกันทุกตัว
  console.log(`ω²/k per wave (g_px ถ้าสอดคล้องต้องเท่ากันทุกตัว): ${waves.map(w => (w.w * w.w / (2 * Math.PI / w.L)).toFixed(1)).join(' ')}`);

  for (const t of [0, 0.5, 1.0]) {
    const pts = [0, 100, 200, 300, 400].map(x => fn(x, t));
    console.log(`t=${t.toFixed(1)}s : ${pts.map(fmtPt).join(' ')}`);
  }

  // โปรไฟล์ผิวน้ำละเอียดที่ t=0: x 0..2000 step 0.5
  const N = 4001, xs = [], ys = [], xps = [];
  for (let i = 0; i < N; i++) {
    const x = i * 0.5;
    const [xp, y] = fn(x, 0);
    xs.push(x); ys.push(y); xps.push(xp);
  }
  const ymax = Math.max(...ys), ymin = Math.min(...ys);
  const dxs = xps.map((xp, i) => xp - xs[i]);
  const maxDx = Math.max(...dxs.map(Math.abs));
  // ยอดแหลม/ท้องกว้าง: นับจุดที่ y สูงกว่าครึ่งยอด vs ต่ำกว่าครึ่งท้อง (sine สมมาตรจะได้สัดส่วน ~1.0)
  const crestN = ys.filter(y => y > 0.5 * ymax).length;
  const troughN = ys.filter(y => y < 0.5 * ymin).length;
  // dx'/dx เชิงตัวเลข + ตรวจ x' monotonic (ไม่ม้วนเป็นลูป)
  let dMin = Infinity, dMax = -Infinity, mono = true;
  for (let i = 1; i < N; i++) {
    const d = (xps[i] - xps[i - 1]) / (xs[i] - xs[i - 1]);
    dMin = Math.min(dMin, d); dMax = Math.max(dMax, d);
    if (xps[i] <= xps[i - 1]) mono = false;
  }
  // นับยอดคลื่น (local maxima) ในช่วง 0..2000 px
  let peaks = 0;
  for (let i = 2; i < N - 2; i++) if (ys[i] > ys[i - 1] && ys[i] > ys[i + 1] && ys[i] > ys[i - 2] && ys[i] > ys[i + 2]) peaks++;
  console.log(`y range @t=0: [${ymin.toFixed(1)}, ${ymax.toFixed(1)}] span ${(ymax - ymin).toFixed(1)} px (ΣA*2=${(2 * sumA).toFixed(1)}, max single A*2=${(2 * maxA).toFixed(1)} — span เกิน 2*maxA แปลว่าหลายระลอกซ้อนกันจริง)`);
  console.log(`|dx| max = ${maxDx.toFixed(1)} px | crest points (>½ymax): ${crestN} | trough points (<½ymin): ${troughN} | crest/trough = ${(crestN / troughN).toFixed(2)} (<1 = ยอดแคบกว่าท้อง = ยอดแหลม)`);
  console.log(`dx'/dx: min ${dMin.toFixed(2)} max ${dMax.toFixed(2)} | x' monotonic (no loop): ${mono} | local maxima in 0..2000px: ${peaks}`);
  // ความถี่เชิงเวลา: DFT ของ y(t) ที่ x=200, t 0..20 วิ — หา 4 ยอดความถี่
  const T = 2001, dt = 0.01, yt = [];
  for (let i = 0; i < T; i++) yt.push(fn(200, i * dt)[1]);
  const mags = [];
  for (let f = 0.05; f <= 1.20; f += 0.005) {
    let re = 0, im = 0;
    for (let i = 0; i < T; i++) { const a = -2 * Math.PI * f * i * dt; re += yt[i] * Math.cos(a); im += yt[i] * Math.sin(a); }
    mags.push({ f, m: Math.hypot(re, im) });
  }
  mags.sort((a, b) => b.m - a.m);
  const top = [];
  for (const c of mags) if (top.every(t => Math.abs(t.f - c.f) > 0.08)) { top.push(c); if (top.length === 4) break; }
  top.sort((a, b) => a.f - b.f);
  console.log(`temporal peaks @x=200 (Hz, ควรตรง ω/2π): ${top.map(c => `${c.f.toFixed(2)}`).join(' ')} | expected ω/2π: ${waves.map(w => (w.w / (2 * Math.PI)).toFixed(2)).join(' ')}`);
  return { sumA, maxA, ymax, ymin, maxDx, crestRatio: crestN / troughN, dMin, dMax, mono, peaks, waves: waves.length };
}

const opus = analyze('BEAN (gerstner_bean.js)', 'gerstner_bean.js');
const flash = analyze('BEAN (gerstner_bean.js)', 'gerstner_bean.js');
console.log('\n===== SUMMARY =====');
console.log(`BEAN : waves ${opus.waves} ΣA ${opus.sumA} ySpan ${(opus.ymax - opus.ymin).toFixed(1)} |dx|max ${opus.maxDx.toFixed(1)} crest/trough ${opus.crestRatio.toFixed(2)} dx'/dx[${opus.dMin.toFixed(2)},${opus.dMax.toFixed(2)}] loop-free ${opus.mono} peaks ${opus.peaks}`);
console.log(`BEAN: waves ${flash.waves} ΣA ${flash.sumA} ySpan ${(flash.ymax - flash.ymin).toFixed(1)} |dx|max ${flash.maxDx.toFixed(1)} crest/trough ${flash.crestRatio.toFixed(2)} dx'/dx[${flash.dMin.toFixed(2)},${flash.dMax.toFixed(2)}] loop-free ${flash.mono} peaks ${flash.peaks}`);
