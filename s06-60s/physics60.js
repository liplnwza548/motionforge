/**
 * physics60.js — MotionForge S06 60 วินาที (ขั้นที่ 1: ฟิสิกส์ + โมดูลหลัก)
 * Pure JS ไม่พึ่ง DOM — รันได้ทั้ง node (เทสต์) และเบราว์เซอร์ (script tag)
 *
 * แหล่งสูตร:
 *  - 4 ข้อแก้ฟิสิกส์จาก gemini-60s-physics-check.md (บีนตรวจด้วยสูตรจริง)
 *  - Build Spec + สตอรี่บอร์ด 19 ช็อตจาก gemini-60s-blueprint.md ส่วนที่ 2–3
 *  - สูตร spine travelling wave + arc-length จาก breach.js v3 (Vault V1)
 *  - Gerstner 4 ระลอกอยู่ใน water60.js (สูตร gerstner_v3.js, Vault V2)
 *
 * กฎเหล็ก: g = 235.4 ค่าเดียวทั้งโปรเจกต์ (วาฬ/อนุภาค/คลื่น/telemetry)
 *
 * อนุสัญญา pitch (สำคัญ — อ่านก่อนใช้):
 *  pitch = มุมทิศหัววาฬวัดจากแกน +x ในพิกัดจอ (y ชี้ลง) หน่วยองศา
 *  บวก = หัวชี้ลง (ตามเข็มนาฬิกา), ลบ = หัวชี้ขึ้น
 *  เช่น pitch -70° = หัวชี้ขึ้น 70°, pitch +26.5° = หัวชี้ลง 26.5°
 *  (ค่าบลูพรินต์เขียนในอนุสัญญาคณิตศาสตร์ y ชี้ขึ้น — แปลงเครื่องหมายแล้ว)
 *
 * เรขาคณิตจุดแตะน้ำ (ตามตัวเลขที่บีนตรวจไว้):
 *  ที่หัวแตะน้ำ pitch = -55° (หัวชี้ขึ้น 55°) หัวอยู่สูงกว่าจุดศูนย์กลาง
 *  150·sin55° = 122.9 px และอยู่ขวา 150·cos55° = 86.0 px
 *  → หัวแตะที่ x = 684.4, t ≈ 39.31 วิ (τ = 3.315)
 *  หมายความว่าวาฬกลับลงน้ำแบบหลัง/ข้างลงก่อน หัวแตะทีหลัง (ท่า breach
 *  ของวาฬหลังค่อมจริง + roll 0→90° แบบ v3) — ไม่ใช่หัวปักลงตรงๆ
 *  ถ้าต้องการหัวปัก (หัวต่ำกว่าศูนย์กลาง 122.9 px) เวลาจะเป็น ~38.60 วิ
 *  ซึ่งขัดกับตัวเลขที่ตรวจไว้ — รอบประกอบช็อตต้องยืนยันกับฟิลิปอีกครั้ง
 */

'use strict';

// ---- ค่าคงที่โลก ----
const W60 = 720;          // ความกว้างจอ px
const H60 = 1280;         // ความสูงจอ px
const FPS60 = 30;         // เฟรมต่อวินาที
const G60 = 235.4;        // แรงโน้มถ่วง px/s² = 9.81 × 24 — ค่าเดียวทั้งโปรเจกต์
const Y_SURFACE60 = 760;  // ระดับผิวน้ำปกติ px
const Y_SAND60 = 1200;    // ระดับพื้นทราย px
const L60 = 300;          // ความยาววาฬ px
const N60 = 12;           // ข้อกระดูกสันหลัง
const SEG60 = L60 / (N60 - 1); // 27.27 px ระยะห่างระหว่างข้อ
const TOTAL_T60 = 60.0;   // ความยาวคลิป วิ
const TOTAL_F60 = 1800;   // เฟรมทั้งหมด

// ---- พาราโบลา breach (แก้ข้อ 1 + 3: x0 = 300, หัวแตะ ~39.31) ----
// ศูนย์กลางอยู่ที่ (300, 760) ตอน t = 36.00 วิ, v = (90, -353.1) px/s
const BREACH60 = {
  T_BREACH: 36.00,   // t ที่ศูนย์กลางอยู่ระดับผิวน้ำขาขึ้น (F1080)
  X0: 300,            // แก้ข้อ 3: 300 (ไม่ใช่ 360 — ที่ 360 หัวหลุดขอบขวา 744 px)
  Y0: Y_SURFACE60,    // 760
  VX: 90,             // px/s
  VY0: -353.1,        // px/s (พุ่งขึ้น)
  T_APEX: 37.50,      // 36.00 + 353.1/235.4 = 36.00 + 1.500
  APEX_Y: 495.2,      // 760 - 353.1²/(2×235.4) = 760 - 264.8
  PITCH_EXIT_DEG: -70,  // หัวชี้ขึ้น 70° ตอนพ้นน้ำ
  PITCH_TOUCH_DEG: -55, // หัวชี้ขึ้น 55° ตอนหัวแตะน้ำ
  // อัตราหมุนหัวในอากาศ: 15° ใน τ_touch ≈ 3.315 วิ → 4.52°/วิ (หัวก้มลงช้าๆ)
  OMEGA_PITCH_DEG: 15 / 3.315,
};
const TAU_TOUCH_DESIGN = 3.315; // τ ที่หัวแตะน้ำตามที่บีนคำนวณไว้ (ใช้ตั้ง ω)

// ---- ความเร็วช็อต 10–11 (แก้ข้อ 2: ลบ 550/620 ออก) ----
// เร่ง 100 → 364.4 px/s ต่อเนื่องตลอด 29.00–35.50 วิ (6.5 วิ)
// |V| ที่ทะลุผิว = √(90² + 353.1²) = 364.4 px/s
const ASCENT60 = {
  T0: 29.00, T1: 35.50,
  V0: 100, V1: 364.4,
};
ASCENT60.ACCEL = (ASCENT60.V1 - ASCENT60.V0) / (ASCENT60.T1 - ASCENT60.T0); // ≈ 40.68 px/s²

// ---- โซนาร์ (คลื่น 180 px/s — ตามบลูพรินต์ช็อต 03) ----
const SONAR60 = {
  SPEED: 180,                    // px/s
  PINGS: [8.00, 11.50, 17.00],   // เวลา ping 1/2/3 (บลูพรินต์ cue A02–A04)
  // หอย: hinge แบบ v3 shell.js (397, 1195) — ขอบใกล้หอย x = 397 − 2×52 = 293
  SHELL_HINGE: [397, 1195],
  SHELL_R: 52,
};
SONAR60.SHELL_NEAR = [SONAR60.SHELL_HINGE[0] - 2 * SONAR60.SHELL_R, SONAR60.SHELL_HINGE[1]];

// ---- ตารางช็อต 19 ช็อต (แก้ข้อ 1: ช็อต 13 จบ ~39.31, ช็อต 14 เริ่ม ~39.31,
//      ยืดช็อต 14 เป็น 39.31–43.50 = 4.19 วิ ดูดซับเวลาที่เหลือ รวมยัง 60.00 วิ) ----
const SHOTS60 = [
  { n: 1,  t0: 0.00,  t1: 3.00,  name: 'Surface Descent',    cam: 'pan-down' },
  { n: 2,  t0: 3.00,  t1: 6.50,  name: 'Deep Water Crossing', cam: 'tracking-pan' },
  { n: 3,  t0: 6.50,  t1: 10.00, name: 'Wide: Shell + Ping 1', cam: 'static-wide' },
  { n: 4,  t0: 10.00, t1: 13.50, name: 'Head Close-up + Ping 2', cam: 'zoom-in' },
  { n: 5,  t0: 13.50, t1: 16.50, name: 'Shell Close-up: Wave Hits', cam: 'low-static' },
  { n: 6,  t0: 16.50, t1: 19.50, name: 'Ping 3: Shell Opens', cam: 'dolly-out' },
  { n: 7,  t0: 19.50, t1: 23.00, name: 'Golden Pearl Revealed', cam: 'pan-up' },
  { n: 8,  t0: 23.00, t1: 26.00, name: 'Absorbing Pearl Light', cam: 'low-tracking' },
  { n: 9,  t0: 26.00, t1: 29.00, name: 'Orbit + Pitch Up',    cam: 'orbit' },
  { n: 10, t0: 29.00, t1: 32.50, name: 'Coil + Tail Thrust',  cam: 'fast-pan-up' },
  { n: 11, t0: 32.50, t1: 35.50, name: 'Full-speed Ascent',   cam: 'leading' },
  { n: 12, t0: 35.50, t1: 38.00, name: 'The Breach',         cam: 'above-water' },
  { n: 13, t0: 38.00, t1: 39.31, name: 'Apex + Spout',        cam: 'floating-apex' },
  { n: 14, t0: 39.31, t1: 43.50, name: 'Re-entry + Splashdown', cam: 'impact-shake' },
  { n: 15, t0: 43.50, t1: 46.50, name: 'Bubble Descent',      cam: 'decel-tracking' },
  { n: 16, t0: 46.50, t1: 50.00, name: 'Pitch Recovery',      cam: 'side-tracking' },
  { n: 17, t0: 50.00, t1: 53.50, name: 'Low Glide Past Shell', cam: 'static-sand' },
  { n: 18, t0: 53.50, t1: 56.50, name: 'Shell Closes',        cam: 'close-up' },
  { n: 19, t0: 56.50, t1: 60.00, name: 'Swim Away / Fade',    cam: 'static-fade' },
];
for (const s of SHOTS60) {
  s.f0 = Math.round(s.t0 * FPS60);
  s.f1 = Math.round(s.t1 * FPS60);
  s.dur = s.t1 - s.t0;
}

// ---- helpers ----
function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
function smooth01(v) { const x = clamp01(v); return x * x * (3 - 2 * x); }
function easeInOutCubic(v) {
  const x = clamp01(v);
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}
function lerp(a, b, u) { return a + (b - a) * u; }
function deg2rad(d) { return d * Math.PI / 180; }

// ---- พาราโบลา breach: ศูนย์กลาง ----
// C(τ) = (300 + 90τ, 760 − 353.1τ + ½·235.4·τ²), τ = t − 36.00
function breachCenterAtTau(tau) {
  const B = BREACH60;
  return [B.X0 + B.VX * tau, B.Y0 + B.VY0 * tau + 0.5 * G60 * tau * tau];
}
function breachCenterAtTime(t) { return breachCenterAtTau(t - BREACH60.T_BREACH); }
function breachVelocityAtTau(tau) {
  return [BREACH60.VX, BREACH60.VY0 + G60 * tau];
}
function breachSpeedAtTau(tau) {
  const v = breachVelocityAtTau(tau);
  return Math.hypot(v[0], v[1]);
}
// pitch ตอนบิน: -70° → -55° ด้วย ω คงที่ (หัวก้มลงช้าๆ ตลอดการบิน)
function breachPitchDegAtTau(tau) {
  return BREACH60.PITCH_EXIT_DEG + BREACH60.OMEGA_PITCH_DEG * tau;
}
// ตำแหน่งหัวตอนบิน: หัว = ศูนย์กลาง + 150·(cos p, sin p), p = pitch (rad, พิกัดจอ)
function breachHeadAtTau(tau) {
  const c = breachCenterAtTau(tau);
  const p = deg2rad(breachPitchDegAtTau(tau));
  return [c[0] + (L60 / 2) * Math.cos(p), c[1] + (L60 / 2) * Math.sin(p)];
}
// ตำแหน่งหางตอนบิน
function breachTailAtTau(tau) {
  const c = breachCenterAtTau(tau);
  const p = deg2rad(breachPitchDegAtTau(tau));
  return [c[0] - (L60 / 2) * Math.cos(p), c[1] - (L60 / 2) * Math.sin(p)];
}

// ---- เวลาสำคัญ: หาด้วย bisection จากวิถีหัวจริง (ไม่ใช่คีย์เฟรมตายตัว) ----
function solveHeadTouchTau() {
  // หัวแตะน้ำขาลงครั้งแรก: headY(τ) = 760, τ ∈ [3.0, 3.6]
  const f = (tau) => breachHeadAtTau(tau)[1] - Y_SURFACE60;
  let lo = 3.0, hi = 3.6;
  if (f(lo) > 0 || f(hi) < 0) return TAU_TOUCH_DESIGN; // กันพัง: คืนค่าออกแบบ
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (f(mid) > 0) hi = mid; else lo = mid;
  }
  return (lo + hi) / 2;
}
let _tauTouch = null;
function headTouchTau() {
  if (_tauTouch === null) _tauTouch = solveHeadTouchTau();
  return _tauTouch;
}
function headTouchTime() { return BREACH60.T_BREACH + headTouchTau(); }
function headTouchHeadPos() { return breachHeadAtTau(headTouchTau()); }
function apexCenter() { return breachCenterAtTau(1.5); } // τ_apex = 353.1/235.4 = 1.500

// ---- ความเร็วช็อต 10–11 (แก้ข้อ 2) ----
function ascentSpeed(t) {
  const A = ASCENT60;
  if (t <= A.T0) return A.V0;
  if (t >= A.T1) return A.V1;
  return A.V0 + A.ACCEL * (t - A.T0);
}

// ---- เส้นทางศูนย์กลางวาฬชั่วคราวทั้งคลิป (PROVISIONAL) ----
// ใช้ waypoint + smoothstep ต่อช็อต — สำหรับเทสต์ขอบเฟรม/ทราย + วางกล้อง/โซนาร์
// รอบประกอบช็อตต้องแทนที่ด้วย choreography จริงต่อช็อต (โดยเฉพาะช็อต 10:
// ระยะทางจากความเร็ว 100→364 ใน 6.5 วิ ≈ 1,510 px เกินความลึกน้ำ 440 px —
// วาฬต้องว่ายวน/ม้วนตัว ไม่ใช่พุ่งตรง; waypoint นี้จึงเป็นแค่ตำแหน่งนำทาง)
// ในหน้าต่างบิน [36.00, T_TOUCH] ใช้พาราโบลาตรงๆ ไม่ใช่ interpolation
const WAYPOINTS60 = [
  [0.00, 360, 700], [3.00, 420, 780], [6.50, 400, 880], [10.00, 380, 950],
  [13.50, 360, 1000], [16.50, 350, 1020], [19.50, 340, 1000], [23.00, 340, 980],
  [26.00, 360, 960], [29.00, 380, 980], [32.50, 300, 940], [35.50, 255, 906],
  [36.00, 300, 760], [37.50, 435, 495.2],
  // จุดแตะน้ำเติมจากพาราโบลาจริงตอนโหลด (ดูข้างล่าง)
  [43.50, 500, 1000], [46.50, 450, 1020], [50.00, 420, 1000],
  [53.50, 450, 1010], [56.50, 500, 1000], [60.00, 540, 980],
];
{
  const tc = headTouchTime();
  const cc = breachCenterAtTime(tc);
  WAYPOINTS60.splice(14, 0, [tc, cc[0], cc[1]]);
}
const PITCH_WAYPOINTS60 = [
  [0.00, 26.5], [3.00, 0], [6.50, 0], [10.00, 0], [13.50, 12], [16.50, 0],
  [19.50, 0], [23.00, -10], [26.00, 10], [29.00, -70], [32.50, -70],
  [35.50, -70], [36.00, -70],
  // จุดแตะน้ำเติมจากพาราโบลาจริงตอนโหลด
  [43.50, 30], [46.50, 60], [50.00, 5], [53.50, 0], [56.50, 0], [60.00, 0],
];
{
  PITCH_WAYPOINTS60.splice(13, 0, [headTouchTime(), BREACH60.PITCH_TOUCH_DEG]);
}
function interpWaypoints(wps, t, col) {
  if (t <= wps[0][0]) return wps[0][col];
  for (let i = 0; i < wps.length - 1; i++) {
    const a = wps[i], b = wps[i + 1];
    if (t <= b[0]) {
      const u = smooth01((t - a[0]) / (b[0] - a[0]));
      return lerp(a[col], b[col], u);
    }
  }
  return wps[wps.length - 1][col];
}
function whaleCenterAt(t) {
  const tTouch = headTouchTime();
  if (t >= BREACH60.T_BREACH && t <= tTouch) return breachCenterAtTime(t);
  const x = interpWaypoints(WAYPOINTS60, t, 1);
  const y = interpWaypoints(WAYPOINTS60, t, 2);
  return [x, y];
}
function whalePitchDegAt(t) {
  const tTouch = headTouchTime();
  if (t >= BREACH60.T_BREACH && t <= tTouch) {
    return breachPitchDegAtTau(t - BREACH60.T_BREACH);
  }
  return interpWaypoints(PITCH_WAYPOINTS60, t, 1);
}
function whaleHeadAt(t) {
  const c = whaleCenterAt(t);
  const p = deg2rad(whalePitchDegAt(t));
  return [c[0] + (L60 / 2) * Math.cos(p), c[1] + (L60 / 2) * Math.sin(p)];
}
// รูจมูก (blowhole): หลังหัว 12 px ตามแนวลำตัว + 20 px ฝั่งหลัง (dorsal)
function whaleNostrilAt(t) {
  const h = whaleHeadAt(t);
  const p = deg2rad(whalePitchDegAt(t));
  const dx = Math.cos(p), dy = Math.sin(p);
  const nx = dy, ny = -dx; // normal ฝั่งหลัง (หมุน -90° ในพิกัดจอ)
  return [h[0] - 12 * dx + 20 * nx, h[1] - 12 * dy + 20 * ny];
}
function isNostrilAboveWater(t) { return whaleNostrilAt(t)[1] < Y_SURFACE60; }
// เวลารูจมูกพ้นผิวน้ำ (แก้ข้อ 4: หาจากตำแหน่งจริง ไม่ใช่ Apex 37.50)
function nostrilCrossTime() {
  // สแกนช่วงขึ้นสู่ผิวน้ำ 35.0 → 36.0 วิ หาจุดที่ nostril y ตัด 760 ลงมา
  let prevT = 35.0, prevY = whaleNostrilAt(prevT)[1];
  for (let t = 35.0 + 0.002; t <= BREACH60.T_BREACH + 0.001; t += 0.002) {
    const y = whaleNostrilAt(t)[1];
    if (prevY >= Y_SURFACE60 && y < Y_SURFACE60) {
      const f = (Y_SURFACE60 - prevY) / (y - prevY);
      return prevT + (t - prevT) * f;
    }
    prevT = t; prevY = y;
  }
  return BREACH60.T_BREACH; // กันพัง
}
// เวลาเริ่มพ่นน้ำจริง = รูจมูกพ้นผิว + ดีเลย์หายใจออก ~0.15 วิ
const SPOUT_DELAY = 0.15;
function spoutStartTime() { return nostrilCrossTime() + SPOUT_DELAY; }
// เวลาหัวพ้นผิวน้ำขาขึ้น (สแกน 35.0 → 36.0)
function headExitTime() {
  let prevT = 35.0, prevY = whaleHeadAt(prevT)[1];
  for (let t = 35.0 + 0.002; t <= BREACH60.T_BREACH + 0.001; t += 0.002) {
    const y = whaleHeadAt(t)[1];
    if (prevY >= Y_SURFACE60 && y < Y_SURFACE60) {
      const f = (Y_SURFACE60 - prevY) / (y - prevY);
      return prevT + (t - prevT) * f;
    }
    prevT = t; prevY = y;
  }
  return BREACH60.T_BREACH;
}

// ---- ช็อต ----
function shotAt(t) {
  const tc = Math.max(0, Math.min(TOTAL_T60 - 1e-9, t));
  for (const s of SHOTS60) if (tc >= s.t0 && tc < s.t1) return s;
  return SHOTS60[SHOTS60.length - 1];
}
function shotByNumber(n) { return SHOTS60[n - 1] || null; }

// ---- โซนาร์: เวลาคลื่นชนหอยจากระยะทางจริง (แก้ตาม physics-check ข้อสังเกต 3) ----
// r(age) = 180·age; hit = ping + dist(head→ขอบใกล้หอย)/180
function sonarHitTime(pingT, target) {
  const tgt = target || SONAR60.SHELL_NEAR;
  const head = whaleHeadAt(pingT);
  const d = Math.hypot(tgt[0] - head[0], tgt[1] - head[1]);
  return { pingT, head, dist: d, hitT: pingT + d / SONAR60.SPEED };
}
function sonarRadiusAt(pingT, t) {
  const age = t - pingT;
  return age < 0 ? null : SONAR60.SPEED * age;
}
function allSonarHits() { return SONAR60.PINGS.map((p) => sonarHitTime(p)); }

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    W60, H60, FPS60, G60, Y_SURFACE60, Y_SAND60, L60, N60, SEG60,
    TOTAL_T60, TOTAL_F60, BREACH60, ASCENT60, SONAR60, SHOTS60,
    SPOUT_DELAY, clamp01, smooth01, easeInOutCubic, lerp, deg2rad,
    breachCenterAtTau, breachCenterAtTime, breachVelocityAtTau, breachSpeedAtTau,
    breachPitchDegAtTau, breachHeadAtTau, breachTailAtTau,
    headTouchTau, headTouchTime, headTouchHeadPos, apexCenter,
    ascentSpeed, whaleCenterAt, whalePitchDegAt, whaleHeadAt, whaleNostrilAt,
    isNostrilAboveWater, nostrilCrossTime, spoutStartTime, headExitTime,
    shotAt, shotByNumber, sonarHitTime, sonarRadiusAt, allSonarHits,
    WAYPOINTS60, PITCH_WAYPOINTS60,
  };
}
