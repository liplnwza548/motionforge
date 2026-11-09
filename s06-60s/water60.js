/**
 * water60.js — MotionForge S06 60 วินาที: น้ำ + ผิวน้ำ + แสง + พื้นทราย + สาหร่าย
 * สูตร Gerstner 4 ระลอกคัดลอกมาจาก gerstner_v3.js (Vault V2 — Q คลื่นหลัก ≥ 0.6,
 * ω = √(g·k), g = 235.4 ค่าเดียวทั้งโปรเจกต์) — ไม่แก้ไฟล์ต้นฉบับ
 *
 *  - drawDynamicWaterSurface: ปูดนูนก่อนทะลุ (+35 px) + ฉีกขาดตอนทะลุ
 *    + คลื่นกระจาย 2 ฝั่งหลังกลับลงน้ำ (v_wave = 220 px/s, damped)
 *  - drawSonarWave: วงขยาย + fade (r = 180·age, alpha exp(−r/300))
 *  - drawCausticRays: ลำแสงใต้น้ำขยับตามเวลา
 *  - drawSandFloor + drawSeaweed: สาหร่าย parallax 3 ชั้น (แก้ลู่วิ่ง v3)
 */
'use strict';

let P60 = null;
if (typeof require !== 'undefined') {
  try { P60 = require('./physics60.js'); } catch (e) { P60 = null; }
}
if (!P60 && typeof globalThis !== 'undefined' && globalThis.PHYSICS60) P60 = globalThis.PHYSICS60;

function p60() {
  if (!P60) throw new Error('water60.js needs physics60.js loaded first');
  return P60;
}
function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
function smooth01(v) { const x = clamp01(v); return x * x * (3 - 2 * x); }

// ---- Gerstner 4 ระลอก (คัดลอกค่าคงที่จาก gerstner_v3.js) ----
// θᵢ = kᵢ·Dxᵢ·x − ωᵢ·t + φᵢ; x' = x + Σ qᵢ·Aᵢ·Dxᵢ·cos θᵢ; y = Σ Aᵢ·sin θᵢ
// qᵢ = Qᵢ·(Aᵢ/ΣA)/(kᵢ·Aᵢ); ΣA = 29 px; Q คลื่นหลัก 0.90 ≥ 0.6 ✓
const GERSTNER_WAVES = [
  { A: 14.0, L: 320, dir: 0,   w: 2.1500, Q: 0.90, phi: 0.0 },
  { A: 8.0,  L: 190, dir: 18,  w: 2.7900, Q: 0.80, phi: 1.7 },
  { A: 4.5,  L: 115, dir: -32, w: 3.5860, Q: 0.70, phi: 4.1 },
  { A: 2.5,  L: 70,  dir: 200, w: 4.5970, Q: 0.60, phi: 2.6 },
];
const GERSTNER_SUM_A = 29.0;
function gerstnerPoint(x, t) {
  let xp = x, y = 0;
  for (const { A, L, dir, w, Q, phi } of GERSTNER_WAVES) {
    const k = (2 * Math.PI) / L;
    const Dx = Math.cos((dir * Math.PI) / 180);
    const theta = k * Dx * x - w * t + phi;
    const q = (Q * (A / GERSTNER_SUM_A)) / (k * A);
    xp += q * A * Dx * Math.cos(theta);
    y += A * Math.sin(theta);
  }
  return [xp, y];
}
// ความสูงผิวน้ำ (พิกัดจอ y) ที่ตำแหน่ง x — Gerstner + ระลอกเล็ก 3 ชุด (แบบ v3)
function surfaceYAt(x, t) {
  const P = p60();
  const [xp, h] = gerstnerPoint(x, t);
  const rip = 3 * Math.sin(2 * Math.PI * x / 180 + 0.9 * t)
    + 2 * Math.sin(2 * Math.PI * x / 97 + 1.7 * t)
    + 1 * Math.sin(2 * Math.PI * x / 53 + 2.3 * t);
  return P.Y_SURFACE60 - h - rip;
}

// ---- ผิวน้ำพลวัต: ปูดนูน / ฉีกขาด / คลื่นกระจาย ----
const BREACH_BULGE_X = 306; // x ที่หัวพ้นผิวน้ำ (จาก physics60: head exit ≈ (306, 760))
const BULGE_MAX = 35;       // ปูดนูนสูงสุด 35 px (บลูพรินต์ช็อต 11)
const SPREAD_SPEED = 220;   // คลื่นกระจายหลังกลับลงน้ำ 220 px/s (บลูพรินต์ช็อต 14)
// ส่วนปูดนูน: gaussian รอบจุดทะลุ, ขึ้น 0→35 ช่วง 35.5–36.0, ยุบตอนทะลุ
function bulgeAt(x, t) {
  const P = p60();
  const tB = P.BREACH60.T_BREACH;
  if (t < 35.5 || t > tB + 0.3) return 0;
  const rise = t < tB ? smooth01((t - 35.5) / 0.5) : 1 - smooth01((t - tB) / 0.3);
  const dx = x - BREACH_BULGE_X;
  return BULGE_MAX * rise * Math.exp(-(dx * dx) / (2 * 70 * 70));
}
// คลื่นกระจาย 2 ฝั่งหลังหัวแตะน้ำ: คลื่นเดินทาง |x − xTouch| = 220·age, damped
function spreadWaveAt(x, t) {
  const P = p60();
  const tT = P.headTouchTime();
  if (t < tT) return 0;
  const age = t - tT;
  const head = P.headTouchHeadPos();
  const dist = Math.abs(x - head[0]);
  const front = SPREAD_SPEED * age;
  const d = dist - front; // ระยะห่างจากหน้าคลื่น
  if (Math.abs(d) > 120) return 0;
  const amp = 40 * Math.exp(-age / 1.2) * Math.exp(-dist / 300);
  return amp * Math.cos((d / 120) * Math.PI) * Math.exp(-(d * d) / (2 * 45 * 45));
}
// โฟมรอบจุดกลับลงน้ำเท่านั้น (สูตร breachWhiteWater v3 — เฉพาะครึ่งหลัง)
// ⚠️ v2 ข้อ 3 (P1): ลบแผ่นวงรีขาวทึบตอนทะลุขาขึ้นออกทั้งหมด — ใน v1 มันค้าง
// 36.00→39.31 วิ อ่านเป็นจานลอยน้ำ (QC v1 ข้อ 3) แทนที่ด้วยริ้วคลื่น
// โปร่งแสง breachRipples60() ข้างล่าง (วาดเป็นเส้น ไม่ใช่แผ่นทึบ) +
// อนุภาค kind-5 ใน particles60.emitBreachSpray (เส้นเดียวกับที่ draw60.js
// วาดผ่าน _sys.splash.draw อยู่แล้ว — ไม่ต้องแก้ draw60.js)
function whiteWaterAt(t) {
  const P = p60();
  const out = [];
  const tT = P.headTouchTime();
  if (t >= tT && t <= tT + 1.2) {
    const age = t - tT;
    const head = P.headTouchHeadPos();
    out.push({
      x: head[0], y: P.Y_SURFACE60,
      radius: 20 + Math.min(age, 1.0) * 55, alpha: 0.9 * (1 - age / 1.2),
    });
  }
  return out;
}

// ---- ริ้วคลื่นทะลุผิว (Breach Ripples — v2 ข้อ 3 P1) ----
// แทนแผ่นวงรีขาวทึบด้วยเส้นริ้วคลื่นกระเพื่อมโปร่งแสง 3 วงซ้อนกัน
//  - เริ่มที่ T_BREACH = 36.00 วิ เหลื่อมกันวงละ 0.08 วิ
//  - ขยายรัศมี 80 px/s จาก r0 = 20 px; เฟด opacity 0.7 → 0 ใน 0.8 วิ
//  - วงสุดท้ายหมดอายุที่ 36.00 + 0.16 + 0.80 = 36.96 วิ < 37.00 วิ ✓
//  - วาดเป็นวงรีแบน (ry = r·0.28) ตามระนาบผิวน้ำ ไม่ใช่แผ่นทึบ
// หมายเหตุ: draw60.js ไม่เรียก drawBreachRipples60 ตรงๆ (loader ยังไม่ export
// ชื่อใหม่) — ริ้วคลื่นที่เห็นในเฟรมเรนเดอร์จริงมาจากอนุภาค kind-5 ของ
// particles60.emitBreachSpray ซึ่งใช้ค่าคงที่ชุดเดียวกันนี้ (ดู particles60.js)
// ฟังก์ชัน pure นี้ใช้เทสต์ + ให้ draw60 เรียกตรงได้เมื่อ loader อัปเดต
const BREACH_RIPPLE_N = 3;          // จำนวนวงซ้อน
const BREACH_RIPPLE_STAGGER = 0.08; // เหลื่อมกันต่อวง (วิ)
const BREACH_RIPPLE_LIFE = 0.8;     // อายุต่อวง (วิ) — เฟดหมดใน 0.8 วิ
const BREACH_RIPPLE_R0 = 20;        // รัศมีตั้งต้น (px)
const BREACH_RIPPLE_SPEED = 80;     // ขยายรัศมี (px/s)
const BREACH_RIPPLE_ALPHA0 = 0.7;   // opacity ตั้งต้น
const BREACH_RIPPLE_FLATTEN = 0.28; // ry = r · 0.28 (วงรีแบนตามผิวน้ำ)
function breachRipples60(t) {
  const P = p60();
  const tB = P.BREACH60.T_BREACH;
  const out = [];
  for (let i = 0; i < BREACH_RIPPLE_N; i++) {
    const age = t - (tB + i * BREACH_RIPPLE_STAGGER);
    if (age < 0 || age > BREACH_RIPPLE_LIFE) continue;
    out.push({
      x: BREACH_BULGE_X, y: P.Y_SURFACE60,
      radius: BREACH_RIPPLE_R0 + BREACH_RIPPLE_SPEED * age,
      alpha: BREACH_RIPPLE_ALPHA0 * (1 - age / BREACH_RIPPLE_LIFE),
      lineWidth: 3,
    });
  }
  return out;
}
function drawBreachRipples60(ctx, t) {
  ctx.save();
  for (const r of breachRipples60(t)) {
    ctx.globalAlpha = Math.max(0, Math.min(1, r.alpha));
    ctx.strokeStyle = 'rgba(235,245,255,0.9)';
    ctx.lineWidth = r.lineWidth;
    ctx.beginPath();
    ctx.ellipse(r.x, r.y, r.radius, r.radius * BREACH_RIPPLE_FLATTEN, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

// วาดผิวน้ำพลวัตทั้งแถบ (x −150..870 ครอบขอบจอ + margin กล้อง)
function drawDynamicWaterSurface(ctx, t, opts) {
  const P = p60();
  const o = opts || {};
  const x0 = o.x0 !== undefined ? o.x0 : -150;
  const x1 = o.x1 !== undefined ? o.x1 : 870;
  const step = o.step || 8;
  ctx.save();
  ctx.beginPath();
  let first = true;
  for (let x = x0; x <= x1; x += step) {
    const y = surfaceYAt(x, t) - bulgeAt(x, t) + spreadWaveAt(x, t);
    if (first) { ctx.moveTo(x, y); first = false; }
    else ctx.lineTo(x, y);
  }
  // เติมน้ำลงไปถึงก้นจอ (ไล่สีลึก)
  const g = ctx.createLinearGradient(0, P.Y_SURFACE60, 0, P.H60);
  g.addColorStop(0, 'rgba(28,105,150,0.55)');
  g.addColorStop(0.4, 'rgba(16,70,110,0.75)');
  g.addColorStop(1, 'rgba(8,40,70,0.95)');
  ctx.lineTo(x1, P.H60 + 50);
  ctx.lineTo(x0, P.H60 + 50);
  ctx.closePath();
  ctx.fillStyle = g;
  ctx.fill();
  // เส้นผิวน้ำสว่าง + โฟมจุดกลับลงน้ำ + ริ้วคลื่นทะลุ (v2 ข้อ 3)
  ctx.beginPath();
  first = true;
  for (let x = x0; x <= x1; x += step) {
    const y = surfaceYAt(x, t) - bulgeAt(x, t) + spreadWaveAt(x, t);
    if (first) { ctx.moveTo(x, y); first = false; }
    else ctx.lineTo(x, y);
  }
  ctx.strokeStyle = 'rgba(200,235,255,0.7)';
  ctx.lineWidth = 2;
  ctx.stroke();
  drawBreachRipples60(ctx, t);
  for (const ww of whiteWaterAt(t)) {
    ctx.save();
    ctx.globalAlpha = Math.max(0, ww.alpha);
    ctx.fillStyle = 'rgba(240,250,255,0.85)';
    ctx.beginPath();
    ctx.ellipse(ww.x, ww.y, ww.radius, ww.radius * 0.28, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  ctx.restore();
}

// ---- โซนาร์: วงขยาย + fade ----
function drawSonarWave(ctx, x, y, radius, alpha) {
  if (radius === null || radius < 0 || alpha <= 0) return;
  ctx.save();
  ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
  ctx.strokeStyle = 'rgba(140,220,255,0.9)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(140,220,255,0.4)';
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.arc(x, y, Math.max(0, radius - 6), 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}
// วงโซนาร์จากเวลา ping (r = 180·age, alpha = exp(−r/300) แบบ v3)
function drawSonarPing(ctx, pingT, t, origin) {
  const P = p60();
  const r = P.sonarRadiusAt(pingT, t);
  if (r === null) return;
  const alpha = Math.exp(-r / 300);
  drawSonarWave(ctx, origin[0], origin[1], r, alpha);
}

// ---- ลำแสงใต้น้ำ (Caustics / God Rays) ----
function drawCausticRays(ctx, t, opts) {
  const P = p60();
  const o = opts || {};
  const nRays = o.rays || 7;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < nRays; i++) {
    const baseX = 60 + i * 100 + 30 * Math.sin(t * 0.5 + i * 1.3);
    const sway = 25 * Math.sin(t * 0.8 + i * 2.1);
    const topW = 18 + 8 * Math.sin(t * 0.6 + i);
    const alpha = 0.05 + 0.03 * Math.sin(t * 0.9 + i * 1.9);
    ctx.fillStyle = `rgba(190,230,255,${Math.max(0.01, alpha).toFixed(3)})`;
    ctx.beginPath();
    ctx.moveTo(baseX - topW, P.Y_SURFACE60);
    ctx.lineTo(baseX + topW, P.Y_SURFACE60);
    ctx.lineTo(baseX + topW + sway + 60, P.Y_SAND60);
    ctx.lineTo(baseX - topW + sway - 60, P.Y_SAND60);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

// ---- พื้นทราย ----
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let r = Math.imul(a ^ (a >>> 15), 1 | a);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}
function drawSandFloor(ctx, t, opts) {
  const P = p60();
  const o = opts || {};
  const x0 = o.x0 !== undefined ? o.x0 : -150;
  const x1 = o.x1 !== undefined ? o.x1 : 870;
  ctx.save();
  // เนินทราย: sine 2 ชุด + ไล่สีทองน้ำตาล
  ctx.beginPath();
  ctx.moveTo(x0, P.H60 + 50);
  for (let x = x0; x <= x1; x += 10) {
    const y = P.Y_SAND60 + 6 * Math.sin(x * 0.012 + 1.2) + 4 * Math.sin(x * 0.031 + 0.5);
    ctx.lineTo(x, y);
  }
  ctx.lineTo(x1, P.H60 + 50);
  ctx.closePath();
  const g = ctx.createLinearGradient(0, P.Y_SAND60 - 10, 0, P.H60);
  g.addColorStop(0, '#c9a86a');
  g.addColorStop(0.5, '#a9854e');
  g.addColorStop(1, '#7a5c33');
  ctx.fillStyle = g;
  ctx.fill();
  // เม็ดทราย (ตำแหน่งตายตัวจาก seed — ไม่กะพริบข้ามเฟรม)
  const rng = mulberry32(7);
  ctx.fillStyle = 'rgba(60,40,15,0.35)';
  for (let i = 0; i < 120; i++) {
    const x = x0 + rng() * (x1 - x0);
    const y = P.Y_SAND60 + 4 + rng() * (P.H60 - P.Y_SAND60 - 8);
    ctx.beginPath();
    ctx.arc(x, y, 1 + rng() * 1.6, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

// ---- สาหร่าย parallax 3 ชั้น (แก้ลู่วิ่ง v3: แต่ละชั้นเลื่อนตามกล้องคนละอัตรา) ----
// ชั้นหลัง f=0.3 (จาง/สั้น) / กลาง f=0.6 / หน้า f=1.0 (เข้ม/สูง)
// camX = จุดกลางกล้องแนวนอน (world) — ใบที่อยู่นอกจอ wrap กลับเข้ามา
const SEAWEED_LAYERS = [
  { f: 0.3, color: 'rgba(46,110,70,0.55)', hMin: 50, hMax: 90, count: 14 },
  { f: 0.6, color: 'rgba(34,95,60,0.8)', hMin: 80, hMax: 130, count: 12 },
  { f: 1.0, color: 'rgba(22,80,50,0.95)', hMin: 110, hMax: 180, count: 10 },
];
function drawSeaweed(ctx, t, camX, opts) {
  const P = p60();
  const o = opts || {};
  const yBase = o.yBase !== undefined ? o.yBase : P.Y_SAND60 + 4;
  const span = 1020; // ช่วงโลกที่ wrap (−150..870)
  ctx.save();
  for (let li = 0; li < SEAWEED_LAYERS.length; li++) {
    const L = SEAWEED_LAYERS[li];
    const rng = mulberry32(100 + li * 17);
    const blades = [];
    for (let i = 0; i < L.count; i++) {
      blades.push({
        x0: -150 + rng() * span,
        h: L.hMin + rng() * (L.hMax - L.hMin),
        ph: rng() * Math.PI * 2,
        lean: (rng() - 0.5) * 30,
      });
    }
    ctx.strokeStyle = L.color;
    ctx.lineWidth = li === 2 ? 7 : li === 1 ? 5 : 3.5;
    ctx.lineCap = 'round';
    for (const b of blades) {
      // parallax: ตำแหน่งบนจอ = x0 − camX·f (wrap ในช่วงโลก)
      const wx = (((b.x0 - camX * L.f + 150) % span) + span) % span - 150;
      const sway = 12 * Math.sin(t * 0.8 + b.ph) + 6 * Math.sin(t * 1.7 + b.ph * 2);
      const tipX = wx + b.lean + sway;
      const tipY = yBase - b.h;
      const midX = wx + b.lean * 0.4 + sway * 0.5;
      const midY = yBase - b.h * 0.55;
      ctx.beginPath();
      ctx.moveTo(wx, yBase);
      ctx.quadraticCurveTo(midX, midY, tipX, tipY);
      ctx.stroke();
    }
  }
  ctx.restore();
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    GERSTNER_WAVES, GERSTNER_SUM_A, gerstnerPoint, surfaceYAt,
    BREACH_BULGE_X, BULGE_MAX, SPREAD_SPEED, bulgeAt, spreadWaveAt, whiteWaterAt,
    BREACH_RIPPLE_N, BREACH_RIPPLE_STAGGER, BREACH_RIPPLE_LIFE, BREACH_RIPPLE_R0,
    BREACH_RIPPLE_SPEED, BREACH_RIPPLE_ALPHA0, BREACH_RIPPLE_FLATTEN,
    breachRipples60, drawBreachRipples60,
    drawDynamicWaterSurface, drawSonarWave, drawSonarPing, drawCausticRays,
    drawSandFloor, drawSeaweed, SEAWEED_LAYERS, mulberry32,
  };
}
