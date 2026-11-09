/**
 * shots60.js — MotionForge S06 60 วิ ขั้นที่ 2: director 19 ช็อต
 * whalePoseAt(t) -> { head, center, pitch, roll, speed, velocity, ampScale, shot }
 *
 * หลักการ:
 *  - ใช้ physics60.js เป็นหลักทุกที่ที่ทำได้ (พาราโบลา breach, ความเร็ว ascent,
 *    เวลาสัมผัสน้ำ/พ่นน้ำ) — ห้ามคำนวณซ้ำเอง
 *  - ช็อต 1–9: keyframe ศูนย์กลาง+ pitch (interp smoothstep ระหว่างคีย์)
 *  - ช็อต 10: coiling — เส้นทางวนเป็นวงกลม 2 รอบในระนาบ (drift, perp) แล้ว
 *    map เวลา -> ระยะทางตาม s(t) = 100τ + ½·a·τ² เพื่อให้ความเร็วตามเส้นทาง
 *    ตรง ascentSpeed(t) เป๊ะ (ระยะทางรวม 599.2 px ใน 3.5 วิ)
 *  - ช็อต 11: เส้นทางชั่วคราวของ physics60 (waypoint) 32.5–36.0
 *  - ช็อต 12–14: พาราโบลา breach ของ physics60 ตรงๆ (36.00–39.3149)
 *  - ช็อต 15–19: เส้นทางชั่วคราวของ physics60 (ช็อต 19 จบที่ x≈540 ตามที่ล็อก)
 *
 * การแก้ staging 3 จุด (ตามบรีฟขั้นที่ 2):
 *  (1) ช็อต 10 coiling — ดู COIL ด้านล่าง
 *  (2) ping 3 (17.00 วิ): จัด staging ช็อต 03–06 ให้วาฬก้มหัวลงหาหอย
 *      (pitch 0° -> 55° -> 80°) จนหัวอยู่ที่ (328,1183) ห่างขอบใกล้หอย
 *      (293,1195) แค่ ~37 px -> sonar hit = 17.00 + 37/180 ≈ 17.21 วิ
 *      ตรงคิว shell creak 17.20 วิ (ขั้นที่ 1 วัดไว้ว่าชน 18.51 วิเพราะ
 *      วาฬห่าง 271 px — แก้ด้วย staging ไม่ใช่ความเร็วคลื่น)
 *  (3) ช็อต 19: ใช้ waypoint ของ physics60 ตรงๆ จบที่ศูนย์กลาง x≈540
 *      (หัว x≈690 ยังอยู่ในเฟรม) + fade to black ใน draw60.js
 *
 * หมายเหตุที่ล็อกไว้ (ห้ามแก้เป็น ~38.60 เอง):
 *  ที่หัวแตะน้ำ 39.3149 วิ หัวชี้ขึ้น 55° (pitch -55°) — วาฬลงน้ำแบบ
 *  หลัง/ข้างลงก่อน หัวแตะทีหลัง ตามตัวเลขที่บีนตรวจไว้แล้ว
 *
 * อนุสัญญา pitch: องศาในพิกัดจอ (y ลง), บวก = หัวชี้ลง, ลบ = หัวชี้ขึ้น
 * roll ที่คืนเป็นเรเดียน (ใช้กับ drawWhale60 opts.roll ตรงๆ)
 */
'use strict';

let P60 = null;
if (typeof require !== 'undefined') {
  try { P60 = require('./physics60.js'); } catch (e) { P60 = null; }
}
if (!P60 && typeof globalThis !== 'undefined' && globalThis.PHYSICS60) P60 = globalThis.PHYSICS60;

function p60() {
  if (!P60) throw new Error('shots60.js needs physics60.js loaded first');
  return P60;
}
function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
function smooth01(v) { const x = clamp01(v); return x * x * (3 - 2 * x); }
function lerp(a, b, u) { return a + (b - a) * u; }
function deg2rad(d) { return d * Math.PI / 180; }

// ---- keyframe ช็อต 1–9: [t, cx, cy, pitchDeg] ----
// 13.5–17.0: วาฬก้มหัวลงหาหอย (pitch 12 -> 55 -> 80) เพื่อ ping 3 ระยะประชิด
// 26–29: วนรอบหอย (loop key) pitch -10 -> -70 เตรียมพุ่งขึ้น
const POSE_KEYS = [
  [0.00, 360, 700, 26.5],   // S01 ลงจากผิวน้ำ
  [3.00, 420, 780, 0],      // S02 ว่ายตัดหน้าจอ
  [6.50, 400, 880, 0],      // S03 มุมกว้าง + ping 1 (08.00)
  [10.00, 380, 950, 0],     // S04 โคลสอัปหัว + ping 2 (11.50)
  [13.50, 340, 1000, 12],   // S05 หอยโคลสอัป (คลื่นระลอก 2 ชนหอย)
  [16.50, 310, 1035, 55],   // S06 เข้าใกล้หอย ก้มหัวลง
  [17.00, 302, 1035, 80],   // S06 ping 3 ระยะประชิด — หัว (328,1183)
  [19.50, 340, 1000, 0],    // S06/S07 เงยหัวขึ้น หอยเริ่มเปิด
  [23.00, 340, 980, -10],   // S07 ไข่มุกเผยเต็มที่
  [26.00, 360, 960, -10],   // S08 ซึมซับแสงทอง
  [27.00, 420, 990, -30],   // S09 วนรอบหอย
  [28.00, 380, 1030, -50],  // S09 วนรอบหอย
  [29.00, 380, 980, -70],   // S09/S10 พร้อมพุ่งขึ้น (= waypoint physics60)
];

function interpKeys(t) {
  const K = POSE_KEYS;
  if (t <= K[0][0]) return [K[0][1], K[0][2], K[0][3]];
  for (let i = 0; i < K.length - 1; i++) {
    const a = K[i], b = K[i + 1];
    if (t <= b[0]) {
      const u = smooth01((t - a[0]) / (b[0] - a[0]));
      return [lerp(a[1], b[1], u), lerp(a[2], b[2], u), lerp(a[3], b[3], u)];
    }
  }
  const last = K[K.length - 1];
  return [last[1], last[2], last[3]];
}

// ---- ช็อต 10 coiling (29.00–32.50) ----
// เส้นทาง: drift ตรงจาก S=(380,980) ไป E=(300,940) + วงกลม 2 รอบในระนาบ
// (drift dir, แกน x) ที่เริ่ม/จบด้วย offset 0 (ต่อกับช็อต 9/11 เป๊ะ)
//   offset(phi) = R·sin(phi)·d + R·(1−cos(phi))·ex, phi = 2π·2·u
//   d = ทิศ drift (−0.894,−0.447), ex = (1,0) — วงม้วนออกด้านข้าง
//   (ไม่ใช่ลงล่าง: ถ้าม้วนลง หางจะจมทะลุทราย — วัดได้ outline y 1195.5)
//   -> หัวอยู่ใต้น้ำตลอด (หัว y ต่ำสุด ≈ 799) หางไม่แตะทราย (outline < 1192)
// ระยะทางรวมต้อง = ∫ ascentSpeed dt = 599.2 px — หา R ด้วย bisection ตอนโหลด
const COIL = { T0: 29.00, T1: 32.50, S: [380, 980], E: [300, 940], TURNS: 2 };
{
  const P = p60();
  const dx = COIL.E[0] - COIL.S[0], dy = COIL.E[1] - COIL.S[1];
  const dl = Math.hypot(dx, dy);
  COIL.D = [dx / dl, dy / dl];          // ทิศ drift
  // แกนม้วน = แกน x (วงรีเอียงในระนาบ (D, AX) — ม้วนออกข้าง ไม่ม้วนลง)
  // หมายเหตุ: อย่าใช้ชื่อ COIL.E — E คือจุดปลาย (300,940) อยู่แล้ว
  COIL.AX = [1, 0];
  COIL.TARGET_S = 100 * 3.5 + 0.5 * P.ASCENT60.ACCEL * 3.5 * 3.5; // ≈ 599.2 px
}
function coilPoint(u, R) {
  const phi = 2 * Math.PI * COIL.TURNS * u;
  const bx = lerp(COIL.S[0], COIL.E[0], u);
  const by = lerp(COIL.S[1], COIL.E[1], u);
  const s = Math.sin(phi), c = 1 - Math.cos(phi);
  // offset = R·s·D + R·c·AX (วงรีเอียง ม้วนออกข้าง)
  return [
    bx + R * s * COIL.D[0] + R * c * COIL.AX[0],
    by + R * s * COIL.D[1] + R * c * COIL.AX[1],
  ];
}
function coilPolylineLength(R, n) {
  let len = 0, prev = coilPoint(0, R);
  for (let i = 1; i <= n; i++) {
    const pt = coilPoint(i / n, R);
    len += Math.hypot(pt[0] - prev[0], pt[1] - prev[1]);
    prev = pt;
  }
  return len;
}
// หา R ให้ความยาวเส้นทาง = TARGET_S (±0.5 px) — deterministic, รันตอนโหลด
COIL.R = 40;
{
  let lo = 5, hi = 120;
  for (let i = 0; i < 50; i++) {
    const mid = (lo + hi) / 2;
    if (coilPolylineLength(mid, 400) < COIL.TARGET_S) lo = mid; else hi = mid;
  }
  COIL.R = (lo + hi) / 2;
  COIL.LENGTH = coilPolylineLength(COIL.R, 800);
  // ตาราง arc-length สะสม (800 ช่วง) สำหรับ map s -> ตำแหน่ง
  COIL.PTS = [];
  COIL.CUM = [0];
  let prev = coilPoint(0, COIL.R);
  COIL.PTS.push(prev);
  for (let i = 1; i <= 800; i++) {
    const pt = coilPoint(i / 800, COIL.R);
    COIL.CUM.push(COIL.CUM[i - 1] + Math.hypot(pt[0] - prev[0], pt[1] - prev[1]));
    COIL.PTS.push(pt);
    prev = pt;
  }
}
function coilPointAtArc(s) {
  const C = COIL.CUM, PTS = COIL.PTS;
  const sc = Math.max(0, Math.min(COIL.LENGTH, s));
  let lo = 0, hi = C.length - 1;
  while (lo < hi - 1) {
    const mid = (lo + hi) >> 1;
    if (C[mid] <= sc) lo = mid; else hi = mid;
  }
  const segLen = C[lo + 1] - C[lo] || 1;
  const f = (sc - C[lo]) / segLen;
  return [
    lerp(PTS[lo][0], PTS[lo + 1][0], f),
    lerp(PTS[lo][1], PTS[lo + 1][1], f),
  ];
}
// ระยะทางสะสมตามความเร็ว ascent: s(τ) = 100τ + ½·a·τ²
function coilArcAt(t) {
  const P = p60();
  const tau = t - COIL.T0;
  return 100 * tau + 0.5 * P.ASCENT60.ACCEL * tau * tau;
}

// ---- ศูนย์กลาง / pitch ----
function whaleCenter60(t) {
  const P = p60();
  const tTouch = P.headTouchTime();
  if (t >= COIL.T0 && t <= COIL.T1) return coilPointAtArc(coilArcAt(t));
  if (t >= P.BREACH60.T_BREACH && t <= tTouch) return P.breachCenterAtTime(t);
  if (t < COIL.T0) {
    const k = interpKeys(t);
    return [k[0], k[1]];
  }
  return P.whaleCenterAt(t); // ช็อต 11 (waypoint) + ช็อต 15–19
}
function whalePitch60(t) {
  const P = p60();
  const tTouch = P.headTouchTime();
  if (t >= COIL.T0 && t <= COIL.T1) {
    const u = (t - COIL.T0) / (COIL.T1 - COIL.T0);
    return -70 + 6 * Math.sin(2 * Math.PI * COIL.TURNS * u); // พยักหัวตามจังหวะม้วน
  }
  if (t >= P.BREACH60.T_BREACH && t <= tTouch) {
    return P.breachPitchDegAtTau(t - P.BREACH60.T_BREACH);
  }
  if (t < COIL.T0) return interpKeys(t)[2];
  return P.whalePitchDegAt(t);
}
// roll (เรเดียน): วนรอบช็อต 9 บิดเบาๆ, ช็อต 10 บิดตามจังหวะม้วน,
// ตอนบิน 0→90° (rollPhi60), หลังแตะน้ำจางกลับแบบ exp
function whaleRoll60(t) {
  const P = p60();
  const tTouch = P.headTouchTime();
  const tB = P.BREACH60.T_BREACH;
  if (t >= 26 && t < COIL.T0) {
    return deg2rad(18 * Math.sin(Math.PI * (t - 26) / 3));
  }
  if (t >= COIL.T0 && t <= COIL.T1) {
    const u = (t - COIL.T0) / (COIL.T1 - COIL.T0);
    const env = smooth01(u / 0.15) * (1 - smooth01((u - 0.85) / 0.15));
    return deg2rad(30 * env * Math.sin(2 * Math.PI * COIL.TURNS * u));
  }
  if (t >= tB && t <= tTouch) return (Math.PI / 2) * ((t - tB) / (tTouch - tB));
  if (t > tTouch && t < tTouch + 1.6) return (Math.PI / 2) * Math.exp(-(t - tTouch) / 0.8);
  return 0;
}
// แอมพลิจูดคลื่นว่ายน้ำ: ดีดขึ้นตอนฟาดหาง 29.50 / 30.80 วิ (คิวเสียง A07)
function whaleAmp60(t) {
  const g = (tc) => Math.exp(-Math.pow((t - tc) / 0.18, 2));
  return 1 + 0.9 * g(29.50) + 0.9 * g(30.80);
}
function whaleSpeed60(t) {
  const P = p60();
  const tTouch = P.headTouchTime();
  if (t >= COIL.T0 && t <= 35.50) return P.ascentSpeed(t); // ช็อต 10–11: โปรไฟล์ที่ล็อก
  if (t > 35.50 && t < P.BREACH60.T_BREACH) return P.ASCENT60.V1; // 364.4 ต่อเนื่อง
  if (t >= P.BREACH60.T_BREACH && t <= tTouch) return P.breachSpeedAtTau(t - P.BREACH60.T_BREACH);
  // ที่อื่น: finite difference ของศูนย์กลาง (สอดคล้องตำแหน่งจริง)
  const h = 1 / 60;
  const a = whaleCenter60(Math.max(0, t - h));
  const b = whaleCenter60(Math.min(60, t + h));
  const dt = Math.min(60, t + h) - Math.max(0, t - h);
  return Math.hypot(b[0] - a[0], b[1] - a[1]) / Math.max(dt, 1e-9);
}
function whaleVelocity60(t) {
  const h = 1 / 60;
  const a = whaleCenter60(Math.max(0, t - h));
  const b = whaleCenter60(Math.min(60, t + h));
  const dt = Math.min(60, t + h) - Math.max(0, t - h);
  return [(b[0] - a[0]) / Math.max(dt, 1e-9), (b[1] - a[1]) / Math.max(dt, 1e-9)];
}

// ---- API หลัก ----
function whalePoseAt(t) {
  const P = p60();
  const tc = Math.max(0, Math.min(60, t));
  const center = whaleCenter60(tc);
  const pitch = whalePitch60(tc);
  const pr = deg2rad(pitch);
  const head = [
    center[0] + (P.L60 / 2) * Math.cos(pr),
    center[1] + (P.L60 / 2) * Math.sin(pr),
  ];
  return {
    head, center,
    pitch,                       // องศา (พิกัดจอ: + = หัวชี้ลง)
    roll: whaleRoll60(tc),       // เรเดียน
    speed: whaleSpeed60(tc),     // px/s
    velocity: whaleVelocity60(tc),
    ampScale: whaleAmp60(tc),
    shot: P.shotAt(tc).n,
  };
}

// ---- ตรวจ staging ping 3 (ใช้ในเทสต์): ระยะหัว->ขอบใกล้หอย + เวลาชน ----
function ping3Staging() {
  const P = p60();
  const pose = whalePoseAt(17.00);
  const tgt = P.SONAR60.SHELL_NEAR; // [293, 1195]
  const dist = Math.hypot(tgt[0] - pose.head[0], tgt[1] - pose.head[1]);
  return { head: pose.head, dist, hitT: 17.00 + dist / P.SONAR60.SPEED };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    POSE_KEYS, COIL, coilPoint, coilPolylineLength, coilPointAtArc, coilArcAt,
    whaleCenter60, whalePitch60, whaleRoll60, whaleAmp60, whaleSpeed60,
    whaleVelocity60, whalePoseAt, ping3Staging,
  };
}
