/**
 * shell60.js — MotionForge S06 60 วิ: หอยเชลล์ + ไข่มุกทอง
 * ดัดแปลงจาก s06-full-v3/shell.js (อ่านอย่างเดียว ไม่แก้ต้นฉบับ)
 * เปลี่ยนจาก v3:
 *  - เวลาเปิดหอยไม่ผูกกับ shellHitTime() ของ v3 แล้ว แต่ผูกกับ sonar hit
 *    ที่ staging ใหม่ล็อกไว้: HIT_T = 17.20 วิ (ping 3 ชนหอย ตรงคิว creak)
 *  - มุมเปิดเต็ม 56° (v3 = 50°): เปิด 17.20 -> 23.00, คง 56° ถึงช็อต 17,
 *    ปิด 50.00 -> 55.50 (ปิดสนิท 55.50 วิ ตรงคิวเสียง A13)
 *  - ไข่มุกทอง (ไม่ใช่ไข่มุกขาว-ชมพูของ v3): radial gradient ทอง + radial pulse
 *    ตอนเปิดสุด + แสงทองส่องใต้น้ำ (golden light)
 *  - แยกเลเยอร์: drawShellLower60 (เลเยอร์ 2) / drawPearl60+drawGoldenLight60
 *    (เลเยอร์ 3) / drawShellUpper60 (เลเยอร์ 4) ตามบลูพรินต์ §3.2
 *  - ไม่วาดพื้นทรายที่นี่ (water60.drawSandFloor วาดใน draw60.js เลเยอร์ 2)
 *
 * ตำแหน่ง (จาก shell.js v3 + บรีฟขั้นที่ 2 — ห้ามเปลี่ยน):
 *  hinge (397, 1195) ที่ขอบหลังเปลือก, เปลือกยาว 2R = 104 px ไปทางซ้าย
 *  (ขอบซ้าย x ≈ 293), ไข่มุก (345, 1187)
 */
'use strict';

let P60 = null;
if (typeof require !== 'undefined') {
  try { P60 = require('./physics60.js'); } catch (e) { P60 = null; }
}
if (!P60 && typeof globalThis !== 'undefined' && globalThis.PHYSICS60) P60 = globalThis.PHYSICS60;

function p60() {
  if (!P60) throw new Error('shell60.js needs physics60.js loaded first');
  return P60;
}
function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
function smooth01(v) { const x = clamp01(v); return x * x * (3 - 2 * x); }
function easeInOutCubic(v) {
  const x = clamp01(v);
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}

const SHELL60 = {
  X: 397, Y: 1195,      // hinge ที่ขอบหลังเปลือก (ขวา) — บนพื้นทราย
  R: 52,                // รัศมีเปลือก (px); เปลือกยาว 2R = 104 px ไปทางซ้าย
  LOBE_N: 9,            // ลอนหอย 9 กลีบ (ซี่ลายแผ่ออกจาก hinge)
  ANGLE_FULL: 56,       // องศาเปิดเต็ม (บลูพรินต์ช็อต 07)
  PEARL_R: 13,          // รัศมีไข่มุก
  PEARL_X: 345,         // ไข่มุกทอง (345, 1187)
  PEARL_Y: 1187,
  // จังหวะเปิด/ปิด (วิ) — ล็อกตามบรีฟขั้นที่ 2
  HIT_T: 17.20,         // sonar ping 3 ชนหอย (ตรงคิว shell creak 17.20)
  OPEN_FULL_T: 23.00,   // เปิดสุด 56° (~ช็อต 07)
  CLOSE_T0: 50.00,      // เริ่มปิด (ช็อต 17)
  CLOSE_T1: 55.50,      // ปิดสนิท (ช็อต 18, ตรงคิว soft snap 55.20)
};

// มุมเปิดหอย (องศา): 0 ก่อน 17.20 -> 27 ที่ 19.50 -> 56 ที่ 23.00
// -> คง 56 ถึง 50.00 -> 0 ที่ 55.50
//
// ⚠️ v2 ข้อ 7 — ห้ามใช้ easeOutQuad/easeOutCubic ตรงๆ ทั้งช่วง 17.20→23.00
// ตามที่ Gemini เขียน (ขัดกันเองกับจุดยึด):
//   easeOutQuad  ทั้งช่วง → 39.8° ที่ 19.5 วิ (เกินจุดยึด 25–30°)
//   easeOutCubic ทั้งช่วง → 47.3° ที่ 19.5 วิ (เกินจุดยึด)
//   เชิงเส้น       ทั้งช่วง → 25.8° ที่ 19.5 วิ (ตรงจุดยึดพอดี)
// สูตรที่ใช้จริง (สองช่วง แตะจุดยึดทั้งสองจุด):
//   ช่วงที่ 1 — เชิงเส้น 17.20→19.50 วิ:  θ = 27 · (t−17.20)/2.30
//              (เริ่มที่ HIT_T 17.20 ตามคิว creak — ไม่ใช่ 16.50 ตามที่บรีฟ
//               ยกตัวอย่าง เพราะหอยต้องเปิดหลัง sonar ชน ไม่ใช่ก่อนชน)
//              ความชัน 27/2.30 = 11.74°/วิ; ที่ 19.50 วิได้ 27.0° ✓
//   ช่วงที่ 2 — easeOutQuad 19.50→23.00 วิ: θ = 27 + 29 · (1−(1−u)²),
//              u = (t−19.50)/3.50; ที่ 23.00 วิได้ 27+29 = 56.0° ✓
//              (easeOutQuad ใช้เฉพาะช่วงที่ 2 จึงไม่ขัดจุดยึด —
//               ความชันต้นช่วง 29·2/3.50 = 16.57°/วิ ต่อจาก 11.74°/วิ
//               กระโดดเล็กน้อยแต่ไม่มีกระโดดของมุม)
// ตรวจค่าที่คำนวณได้: 18.35 วิ → 13.5° | 19.50 วิ → 27.0° | 21.25 วิ →
// 27+29·(1−0.5²)=48.75° | 23.00 วิ → 56.0°
function easeOutQuad(v) {
  const x = clamp01(v);
  return 1 - (1 - x) * (1 - x);
}
function shellAngle60(t) {
  const S = SHELL60;
  if (t < S.HIT_T) return 0;
  if (t < 19.50) {
    return 27 * (t - S.HIT_T) / (19.50 - S.HIT_T);
  }
  if (t < S.OPEN_FULL_T) {
    return 27 + 29 * easeOutQuad((t - 19.50) / (S.OPEN_FULL_T - 19.50));
  }
  if (t < S.CLOSE_T0) return S.ANGLE_FULL;
  if (t < S.CLOSE_T1) {
    return S.ANGLE_FULL * (1 - easeInOutCubic((t - S.CLOSE_T0) / (S.CLOSE_T1 - S.CLOSE_T0)));
  }
  return 0;
}

// ความสว่างไข่มุก 0..1 — เริ่มวาบหลังคลื่นชน +0.8 วิ เต็มที่ +1.5 วิ (แบบ v3)
// แล้วหรี่ตามมุมปิดตอนช็อต 17–18 (แสงหายพร้อมฝาปิด)
function shellPearlGlow60(t) {
  const S = SHELL60;
  if (t < S.HIT_T + 0.8) return 0;
  let g = 1;
  if (t < S.HIT_T + 1.5) g = smooth01((t - (S.HIT_T + 0.8)) / 0.7);
  // หรี่ตามมุมเปิดตอนปิดฝา
  g *= clamp01(shellAngle60(t) / 15);
  return g;
}

// v3 (จุด 1): แสง Halo ไข่มุกเฉพาะช็อต 18 — Soft Radial Glow สีทองในรอยแยกเปลือก
// แยกจาก shellPearlGlow60 เพราะอันนั้นหรี่ตามมุมปิดฝา ดับเร็วเกินไป
// (ที่ 55.00 วิ มุมเหลือ ~0.2° glow เหลือแค่ ~0.01 — ไข่มุกแทบไม่มีแสงแล้ว)
// Halo นี้เริ่มเต็มที่ตอน 53.50 วิ แล้วค่อยๆ หรี่จางลงช้าๆ แบบเชิงเส้นจนดับที่ 55.50 วิ
function shellPearlHalo60(t) {
  if (t < 53.50 || t > 55.50) return 0;
  return 1 - (t - 53.50) / 2.0;
}

// วงสะท้อนสีทอง (Echo ring) — ตีกลับจากหอยทันทีที่คลื่นชน (17.20 วิ)
// คืน {x, y, radius, alpha} หรือ null ถ้าไม่อยู่ในช่วง (hit .. hit+1.6 วิ)
function shellEchoRing60(t) {
  const age = t - SHELL60.HIT_T;
  if (age < 0 || age > 1.6) return null;
  return {
    x: SHELL60.PEARL_X, y: SHELL60.PEARL_Y,
    radius: 30 + age * 260,
    alpha: 0.9 * (1 - age / 1.6),
  };
}

// radial pulse ทองตอนเปิดสุด: วงขยายจากไข่มุก เริ่มที่ 23.00 วิ
// (และซ้ำทุก 1.2 วิขณะที่เปิดสุดอยู่ — ช็อต 07–08)
function shellPulseRings60(t) {
  const S = SHELL60;
  const out = [];
  if (t < S.OPEN_FULL_T || t >= S.CLOSE_T0) return out;
  const period = 1.2;
  const k0 = Math.floor((t - S.OPEN_FULL_T) / period);
  for (let k = Math.max(0, k0 - 1); k <= k0; k++) {
    const start = S.OPEN_FULL_T + k * period;
    const age = t - start;
    if (age < 0 || age > period) continue;
    out.push({
      x: S.PEARL_X, y: S.PEARL_Y,
      radius: 20 + age * 70,
      alpha: 0.55 * (1 - age / period),
    });
  }
  return out;
}

// ---- เรขาคณิตเปลือก (คัดลอกสูตรจาก shell.js v3 — ไม่เปลี่ยน) ----
function shellQuad(p0, c, p1, u) {
  const a = (1 - u) * (1 - u), b = 2 * (1 - u) * u, d = u * u;
  return [a * p0[0] + b * c[0] + d * p1[0], a * p0[1] + b * c[1] + d * p1[1]];
}
// โครงเปลือกครึ่งซีก (ด้านข้าง): จาก hinge (0,0) ไปปลาย (sx·2R, 0)
function shellHalfPath(ctx, dir, sx) {
  const L = 2 * SHELL60.R * sx;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.quadraticCurveTo(L * 0.35, dir * 26, L * 0.7, dir * 14);
  ctx.quadraticCurveTo(L * 0.9, dir * 8, L, 0);
  ctx.quadraticCurveTo(L * 0.5, dir * 4, 0, 0);
  ctx.closePath();
}
// ซี่ลายเปลือก: เส้นจาก hinge แผ่ไปตามขอบเปลือก (9 กลีบ)
// v3 (จุด 1): ขลิบเส้นด้วย ctx.clip() ให้อยู่เฉพาะภายในกรอบรูปพัดของเปลือกหอย
// (ปลายเส้นเดิมแลบพ้นขอบ ~8 px ตรงกลางพัด อ่านเป็นหนามเม่นทะเล) + ลดความหนา
// เส้นลง 30% (2 -> 1.4 px) ให้ดูเป็นร่องลอนนุ่มนวล
function shellRidges(ctx, dir, sx) {
  const L = 2 * SHELL60.R * sx;
  ctx.save();
  shellHalfPath(ctx, dir, sx);
  ctx.clip();
  ctx.strokeStyle = 'rgba(120,85,45,0.7)';
  ctx.lineWidth = 1.4;
  for (let i = 1; i <= 8; i++) {
    const f = i / 9;
    const ex = L * f;
    const ey = dir * (26 * Math.sin(Math.PI * f) * 0.9 + 2);
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(ex, ey); ctx.stroke();
  }
  ctx.restore();
}

// จุดขอบเปลือก (พิกัดโลก) — ใช้ตรวจชน/เทสต์
function shellOutlinePoints60(t) {
  const ang = shellAngle60(t) * Math.PI / 180;
  const L = 2 * SHELL60.R, sx = -1;
  const out = [];
  for (let k = 0; k <= 10; k++) {
    const u = k / 10;
    out.push(shellQuad([0, 0], [L * 0.35 * sx, 26], [L * 0.7 * sx, 14], u));
  }
  for (let k = 0; k <= 10; k++) {
    const u = k / 10;
    out.push(shellQuad([L * 0.7 * sx, 14], [L * 0.9 * sx, 8], [L * sx, 0], u));
  }
  const c = Math.cos(ang), s = Math.sin(ang);
  const upper = [];
  for (let k = 0; k <= 10; k++) {
    const u = k / 10;
    const p = shellQuad([0, 0], [L * 0.35 * sx, -26], [L * 0.7 * sx, -14], u);
    upper.push([SHELL60.X + p[0] * c - p[1] * s, SHELL60.Y + p[0] * s + p[1] * c]);
  }
  for (let k = 0; k <= 10; k++) {
    const u = k / 10;
    const p = shellQuad([L * 0.7 * sx, -14], [L * 0.9 * sx, -8], [L * sx, 0], u);
    upper.push([SHELL60.X + p[0] * c - p[1] * s, SHELL60.Y + p[0] * s + p[1] * c]);
  }
  const lower = out.map(([x, y]) => [SHELL60.X + x, SHELL60.Y + y]);
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    upper.push([
      SHELL60.PEARL_X + Math.cos(a) * SHELL60.PEARL_R,
      SHELL60.PEARL_Y + Math.sin(a) * SHELL60.PEARL_R,
    ]);
  }
  return lower.concat(upper);
}

// ---- วาด: แยกตามเลเยอร์ของบลูพรินต์ ----
// เลเยอร์ 2 — ฝาล่าง + เงา + เนินทรายที่หอยฝังอยู่ (วาดหลังพื้นทราย)
function drawShellLower60(ctx, t) {
  const { X, Y } = SHELL60;
  const CX = X - 52;
  // เงาหอยบนพื้นทราย
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath(); ctx.ellipse(CX, Y + 28, 72, 12, 0, 0, Math.PI * 2); ctx.fill();
  // เนินทรายที่หอยฝังอยู่
  const mound = ctx.createLinearGradient(0, Y + 5, 0, Y + 45);
  mound.addColorStop(0, '#9a7d58'); mound.addColorStop(1, '#6b543a');
  ctx.fillStyle = mound;
  ctx.beginPath(); ctx.ellipse(CX, Y + 28, 78, 20, 0, Math.PI, 2 * Math.PI); ctx.fill();
  // เปลือกล่าง (อยู่นิ่ง) — ครึ่งซีกด้านข้างนูนลง ชี้ไปทางซ้าย
  ctx.fillStyle = '#c9a06a';
  ctx.save(); ctx.translate(X, Y);
  shellHalfPath(ctx, +1, -1); ctx.fill();
  ctx.strokeStyle = '#8a6a3e'; ctx.lineWidth = 2.5; ctx.stroke();
  shellRidges(ctx, +1, -1);
  ctx.restore();
  // ริมทรายทับขอบล่างเปลือกเล็กน้อย (หอยฝังในเนิน — ไม่ใช่ลอยอยู่บนพื้น)
  ctx.fillStyle = '#8a6f4d';
  ctx.beginPath(); ctx.ellipse(CX, Y + 32, 58, 9, 0, 0, Math.PI * 2); ctx.fill();
}

// เลเยอร์ 3 — แสงทองส่องใต้น้ำตอนไข่มุกเผย (radial + pulse rings + echo ring)
function drawGoldenLight60(ctx, t) {
  const glow = shellPearlGlow60(t);
  const { PEARL_X: px, PEARL_Y: py } = SHELL60;
  if (glow > 0) {
    // แสงทองเรืองรอบไข่มุก (รัศมีขยายตามมุมเปิด: 70 -> 120 px)
    const ang = shellAngle60(t);
    const R = 70 + 50 * (ang / SHELL60.ANGLE_FULL);
    const g = ctx.createRadialGradient(px, py, 2, px, py, R);
    g.addColorStop(0, `rgba(255,215,110,${(0.75 * glow).toFixed(3)})`);
    g.addColorStop(0.4, `rgba(255,190,60,${(0.28 * glow).toFixed(3)})`);
    g.addColorStop(1, 'rgba(255,190,60,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(px, py, R, 0, Math.PI * 2); ctx.fill();
    // ลำแสงทองพุ่งขึ้น (cone แคบๆ เหนือไข่มุก — แสงส่องขึ้นหาวาฬ)
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const cone = ctx.createLinearGradient(0, py, 0, py - 260);
    cone.addColorStop(0, `rgba(255,210,90,${(0.22 * glow).toFixed(3)})`);
    cone.addColorStop(1, 'rgba(255,210,90,0)');
    ctx.fillStyle = cone;
    ctx.beginPath();
    ctx.moveTo(px - 26, py);
    ctx.lineTo(px + 26, py);
    ctx.lineTo(px + 70, py - 260);
    ctx.lineTo(px - 70, py - 260);
    ctx.closePath(); ctx.fill();
    ctx.restore();
  }
  // v3 (จุด 1): Halo ไข่มุกช็อต 18 — Soft Radial Glow สีทองฟุ้งนวลในรอยแยกเปลือก
  // หรี่ช้าๆ ตาม shellPearlHalo60 (เต็มที่ 53.50 -> ดับ 55.50 วิ)
  const halo = shellPearlHalo60(t);
  if (halo > 0) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const hg = ctx.createRadialGradient(px, py, 2, px, py, 110);
    hg.addColorStop(0, `rgba(255,215,110,${(0.55 * halo).toFixed(3)})`);
    hg.addColorStop(0.45, `rgba(255,190,60,${(0.22 * halo).toFixed(3)})`);
    hg.addColorStop(1, 'rgba(255,190,60,0)');
    ctx.fillStyle = hg;
    ctx.beginPath(); ctx.arc(px, py, 110, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
  // radial pulse ตอนเปิดสุด
  for (const ring of shellPulseRings60(t)) {
    ctx.strokeStyle = `rgba(255,209,102,${ring.alpha.toFixed(3)})`;
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(ring.x, ring.y, ring.radius, 0, Math.PI * 2); ctx.stroke();
  }
  // Echo ring ทองตอนคลื่นชน
  const echo = shellEchoRing60(t);
  if (echo) {
    ctx.strokeStyle = `rgba(255,209,102,${echo.alpha.toFixed(3)})`;
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(echo.x, echo.y, echo.radius, 0, Math.PI * 2); ctx.stroke();
  }
}

// เลเยอร์ 3 — ไข่มุกทอง (เห็นเมื่อหอยเปิด): radial ทอง + จุดสะท้อนแสง
function drawPearl60(ctx, t) {
  const glow = shellPearlGlow60(t);
  if (glow <= 0) return;
  const px = SHELL60.PEARL_X, py = SHELL60.PEARL_Y, R = SHELL60.PEARL_R;
  const pg = ctx.createRadialGradient(px - 4, py - 5, 1, px, py, R);
  pg.addColorStop(0, '#fff8d0');
  pg.addColorStop(0.45, '#ffd766');
  pg.addColorStop(0.8, '#e8a91c');
  pg.addColorStop(1, '#b97f0e');
  ctx.fillStyle = pg;
  ctx.beginPath(); ctx.arc(px, py, R, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = `rgba(255,240,190,${(0.9 * glow).toFixed(3)})`;
  ctx.lineWidth = 1.5; ctx.stroke();
  // จุดสะท้อนแสง
  ctx.fillStyle = `rgba(255,255,255,${(0.95 * glow).toFixed(3)})`;
  ctx.beginPath(); ctx.arc(px - 4, py - 5, 3, 0, Math.PI * 2); ctx.fill();
}

// เลเยอร์ 4 — ฝาบน (หมุนเปิดรอบ hinge ด้วยมุม ang — เงยขึ้นไปทางซ้าย)
function drawShellUpper60(ctx, t) {
  const ang = shellAngle60(t) * Math.PI / 180;
  const { X, Y } = SHELL60;
  ctx.save();
  ctx.translate(X, Y);
  ctx.rotate(ang);
  ctx.fillStyle = '#d9b47e';
  shellHalfPath(ctx, -1, -1); ctx.fill();
  ctx.strokeStyle = '#8a6a3e'; ctx.lineWidth = 2.5; ctx.stroke();
  shellRidges(ctx, -1, -1);
  ctx.restore();
}

// วาดรวมทั้งหอย (ตามลำดับเลเยอร์ย่อย: ล่าง -> แสง+ไข่มุก -> บน)
// — ใช้เมื่อต้องการวาดหอยในครั้งเดียว (draw60.js เรียกแยกเลเยอร์แทน)
function drawShell60(ctx, t) {
  drawShellLower60(ctx, t);
  drawGoldenLight60(ctx, t);
  drawPearl60(ctx, t);
  drawShellUpper60(ctx, t);
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    SHELL60, shellAngle60, easeOutQuad, shellPearlGlow60, shellPearlHalo60, shellEchoRing60, shellPulseRings60,
    shellQuad, shellHalfPath, shellRidges, shellOutlinePoints60,
    drawShellLower60, drawGoldenLight60, drawPearl60, drawShellUpper60, drawShell60,
  };
}
