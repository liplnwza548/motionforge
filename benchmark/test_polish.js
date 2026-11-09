// สคริปต์ทดสอบเดียวกันสำหรับ polish_opus.js และ polish_flash.js
// โหลด applyPolish(data, width, height, t, speed) จากแต่ละไฟล์ แล้ววัดตัวเลขจริง
// ภาพสังเคราะห์ 64x48: ซ้ายมืด 20 / ขวามืดสว่าง 220 ขอบแนวตั้งที่ x=32 + ภาพเรียบ 128
// ตรวจ: (1) grain เปลี่ยนทุกเฟรม + deterministic (2) blur โตตาม speed (3) CA shift ที่ขอบสว่าง
//       (4) SSS ทำให้ขอบนุ่ม + ภาพไม่มืดลง (5) รันได้ คืนอาร์เรย์เดิม
const fs = require('fs');
const path = require('path');

function loadPolish(file) {
  const code = fs.readFileSync(path.join(__dirname, file), 'utf8');
  const fn = new Function(code + '\n; return applyPolish;');
  return fn();
}

const W = 64, H = 48;
function edgeImage() {
  const d = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4, v = x < 32 ? 20 : 220;
    d[i] = v; d[i + 1] = v; d[i + 2] = v; d[i + 3] = 255;
  }
  return d;
}
function flatImage(v) {
  const d = new Uint8ClampedArray(W * H * 4);
  for (let i = 0; i < d.length; i += 4) { d[i] = v; d[i + 1] = v; d[i + 2] = v; d[i + 3] = 255; }
  return d;
}
function meanLum(d) {
  let s = 0; for (let i = 0; i < d.length; i += 4) s += 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
  return s / (W * H);
}
// โปรไฟล์เฉลี่ยต่อคอลัมน์ x (เฉลี่ยทุกแถว ลด noise จาก grain) ของช่อง c (0=R,2=B) หรือ lum (c=-1)
function profile(d, c) {
  const out = new Array(W).fill(0);
  for (let x = 0; x < W; x++) {
    let s = 0;
    for (let y = 0; y < H; y++) {
      const i = (y * W + x) * 4;
      s += c === -1 ? 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2] : d[i + c];
    }
    out[x] = s / H;
  }
  return out;
}
// ความกว้างขอบ: ระยะ x ระหว่างจุดที่โปรไฟล์ผ่าน 10% (40) กับ 90% (200) ของขั้น 20->220
function edgeWidth(prof) {
  let x10 = null, x90 = null;
  for (let x = 0; x < W; x++) { if (x10 === null && prof[x] >= 40) x10 = x; if (x90 === null && prof[x] >= 200) x90 = x; }
  if (x10 === null || x90 === null) return NaN;
  return x90 - x10;
}
function maxGrad(prof) {
  let m = 0; for (let x = 1; x < W; x++) m = Math.max(m, Math.abs(prof[x] - prof[x - 1]));
  return m;
}
function crossing(prof, mid) { // x แบบทศนิยมที่โปรไฟล์ผ่าน mid (interpolate)
  for (let x = 1; x < W; x++) {
    if (prof[x - 1] < mid && prof[x] >= mid) {
      const f = (mid - prof[x - 1]) / (prof[x] - prof[x - 1] || 1);
      return (x - 1) + f;
    }
  }
  return NaN;
}
function meanAbsDiff(a, b) {
  let s = 0, n = 0;
  for (let i = 0; i < a.length; i += 4) { s += Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]); n += 3; }
  return s / n;
}
function maxAbsDiff(a, b) {
  let m = 0; for (let i = 0; i < a.length; i++) m = Math.max(m, Math.abs(a[i] - b[i]));
  return m;
}
function stdDiffFlat(out, v) { // std ของ (out - v) ในโซนเรียบซ้าย x=0..15 (ไม่มีขอบ ไม่มี bloom)
  const vals = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < 16; x++) vals.push(out[(y * W + x) * 4] - v);
  const m = vals.reduce((a, b) => a + b, 0) / vals.length;
  const sd = Math.sqrt(vals.reduce((a, b) => a + (b - m) * (b - m), 0) / vals.length);
  return { mean: m, std: sd };
}

function analyze(name, applyPolish) {
  console.log(`\n===== ${name} =====`);
  // --- รันได้ / คืนอาร์เรย์เดิม ---
  const d0 = flatImage(128);
  const ret = applyPolish(d0, W, H, 0, 0);
  const sameArray = ret === d0;
  console.log(`runs ok: returns same array=${sameArray} len=${ret.length} (expect ${W * H * 4})`);

  // --- Grain temporal + deterministic ---
  const g0 = applyPolish(edgeImage(), W, H, 0, 0);
  const g0b = applyPolish(edgeImage(), W, H, 0, 0);
  const g1 = applyPolish(edgeImage(), W, H, 1 / 30, 0);
  const g2 = applyPolish(edgeImage(), W, H, 2 / 30, 0);
  console.log(`grain deterministic (same t twice): maxDiff=${maxAbsDiff(g0, g0b)} (expect 0)`);
  console.log(`grain temporal: meanAbsDiff t0->t1=${meanAbsDiff(g0, g1).toFixed(2)} t0->t2=${meanAbsDiff(g0, g2).toFixed(2)} (expect >0)`);
  const gs = stdDiffFlat(g0, 20);
  console.log(`grain strength in flat dark zone: meanDiff=${gs.mean.toFixed(2)} std=${gs.std.toFixed(2)} (std~amplitude/sqrt(3))`);

  // --- Mean preservation (ภาพเรียบ 128, speed 0) ---
  const flat = applyPolish(flatImage(128), W, H, 0, 0);
  console.log(`mean lum flat128: before=128.00 after=${meanLum(flat).toFixed(2)} (expect ~128, grain mean~0)`);

  // --- Motion blur: edge width vs speed ---
  const base = profile(edgeImage(), -1);
  const w0 = edgeWidth(profile(applyPolish(edgeImage(), W, H, 0, 0), -1));
  const w120 = edgeWidth(profile(applyPolish(edgeImage(), W, H, 0, 120), -1));
  const w300 = edgeWidth(profile(applyPolish(edgeImage(), W, H, 0, 300), -1));
  console.log(`edge width (10-90%): input=${edgeWidth(base)} speed0=${w0} speed120=${w120} speed300=${w300} (expect grows with speed, speed0 ~ input)`);
  const wNeg = edgeWidth(profile(applyPolish(edgeImage(), W, H, 0, -300), -1));
  console.log(`edge width speed -300 (reverse dir): ${wNeg} (expect ~ speed300, blur uses |speed|)`);

  // --- Chromatic aberration: R vs B crossing at speed 0 ---
  const pR = profile(g0, 0), pB = profile(g0, 2);
  const xR = crossing(pR, 120), xB = crossing(pB, 120);
  console.log(`CA crossing x (mid=120): R=${xR.toFixed(2)} B=${xB.toFixed(2)} shift R-B=${(xR - xB).toFixed(2)} px (expect R right of B by ~1-4 px)`);

  // --- SSS: edge softening + ไม่มืดลง (speed 0) ---
  const gradIn = maxGrad(base), gradOut = maxGrad(profile(g0, -1));
  console.log(`max edge gradient: input=${gradIn.toFixed(1)} after speed0=${gradOut.toFixed(1)} ratio=${(gradOut / gradIn).toFixed(2)} (expect <1 = softer edge)`);
  console.log(`mean lum edge image: before=${meanLum(edgeImage()).toFixed(2)} after speed0=${meanLum(g0).toFixed(2)} (expect not darker by >1)`);
  return { sameArray, grainDet: maxAbsDiff(g0, g0b), grainT01: meanAbsDiff(g0, g1), grainStd: gs.std, w0, w120, w300, caShift: xR - xB, gradRatio: gradOut / gradIn, meanFlat: meanLum(flat) };
}

const opus = analyze('OPUS (polish_opus.js)', loadPolish('polish_opus.js'));
const flash = analyze('FLASH (polish_flash.js)', loadPolish('polish_flash.js'));
console.log('\n===== SUMMARY =====');
console.log(`Opus : grainDet ${opus.grainDet} grainT01 ${opus.grainT01.toFixed(2)} grainStd ${opus.grainStd.toFixed(2)} edgeW 0/120/300 = ${opus.w0}/${opus.w120}/${opus.w300} CA ${opus.caShift.toFixed(2)}px gradRatio ${opus.gradRatio.toFixed(2)}`);
console.log(`Flash: grainDet ${flash.grainDet} grainT01 ${flash.grainT01.toFixed(2)} grainStd ${flash.grainStd.toFixed(2)} edgeW 0/120/300 = ${flash.w0}/${flash.w120}/${flash.w300} CA ${flash.caShift.toFixed(2)}px gradRatio ${flash.gradRatio.toFixed(2)}`);
