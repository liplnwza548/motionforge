/**
 * telemetry_breach.js — v3 (S06 เต็ม 12 วิ, คำวิจารณ์ Opus §16.8: ง4/ง5)
 * เปลี่ยนจาก v2:
 *   ง5: AMPL แสดงค่ายอด A(1) = 30 px (L·10%) แทนค่าขณะนั้นที่กะพริบ 0↔48
 *       (คูณ breachWave ตอนบิน เหลือ 4.5 px — ไม่กะพริบเป็น 0 อีก)
 *   ง5: แรงต้านถ่วงด้วยสัดส่วนจมน้ำ ρ = f_sub·1025 + (1−f_sub)·1.225
 *       (ในอากาศ drag เหลือ ~1/800 — v2 ใช้ ρ น้ำตลอดแม้ตอนบิน)
 *       f_sub = สัดส่วนจุดโครงร่างวาฬที่อยู่ใต้ผิวน้ำ
 *   ง5: SPEED แสดงเป็น m/s (หาร 24) — ทำที่ draw.js; ที่นี่คืน px/s เหมือนเดิม
 *       เพื่อให้สูตร drag/speed² ตรวจได้ตรง
 *   ง4: เกจ speedMax/dragMax คำนวณล่วงหน้าจากทั้งคลิปครั้งเดียว (Opus ง4)
 *       — เลิก smoothGaugeMax ที่เปลี่ยนสเกลกลางคลิป
 *   ข4: G=235.4 / PX_PER_M=24 ชุดเดียวกับ breach.js (A_MAX ใหม่ = 30 px
 *       ตาม A(u) = L·(0.005+0.095u³) ที่ u=1)
 * โหมดว่ายน้ำ/พาราโบลา/หลังแตะน้ำ และโครง blend คงเดิมจาก v2
 * (T_REENTRY/T_SETTLE ใหม่ 8.799/10.4 อ่านจาก BREACH โดยตรง)
 */

const TEL_BREACH_OMEGA = Math.PI;      // ω เดียวกับ spine
const TEL_BREACH_DPHI = 0.5712;        // Δφ เดียวกับ spine
const TEL_BREACH_A_MAX = 30;           // A(1) ค่ายอด = L·0.10 = 30 px (v2: 48)
const TEL_BREACH_CD = 0.05;            // Cd เดียวกับ telemetry_bean.js
const TEL_BREACH_AREA = 3;             // A = 3 m² เดียวกับ telemetry_bean.js

// สัดส่วนลำตัวที่จมน้ำ (0..1) — นับจุดโครงร่างที่ y > WATER_Y
function submergedFraction(t) {
  const out = whaleOutlinePoints(t);
  let sub = 0;
  for (const [, y] of out) if (y > WATER_Y) sub++;
  return out.length ? sub / out.length : 0;
}

// ความหนาแน่นประสิทธิผล (kg/m³) — ถ่วงด้วยสัดส่วนจมน้ำ (Opus ง5)
function effectiveRho(t) {
  const f = submergedFraction(t);
  return f * 1025 + (1 - f) * 1.225;
}

// k = drag/speed² = 0.5·ρ·Cd·A / PX_PER_M² (ขึ้นกับ f_sub — ไม่ใช่ค่าคงที่อีก)
function dragK(t) {
  return 0.5 * effectiveRho(t) * TEL_BREACH_CD * TEL_BREACH_AREA / (PX_PER_M * PX_PER_M);
}

// สเกลเกจคำนวณล่วงหน้าจากทั้งคลิปครั้งเดียว (Opus ง4) — คงที่ตลอด 12 วิ
let _gaugeMax = null;
function precomputedGaugeMax() {
  if (_gaugeMax) return _gaugeMax;
  let speedMax = 0, dragMax = 0;
  for (let i = 0; i <= 360; i++) {
    const tel = getTelemetryS06(i / 30);
    if (tel.speed > speedMax) speedMax = tel.speed;
    if (tel.drag > dragMax) dragMax = tel.drag;
  }
  _gaugeMax = { speedMax, dragMax };
  return _gaugeMax;
}

// telemetry โหมด breach ล้วนๆ (ไม่ blend) — ใช้กับ t ในช่วงพุ่งเท่านั้น
function telemetryBreach(t) {
  const v = breachCenterVel(t);
  const speed = Math.hypot(v[0], v[1]);
  const pitch = breachTheta(t) * 180 / Math.PI; // มุมลำตัว: บวก = หัวเงยขึ้น
  const amplitude = TEL_BREACH_A_MAX * breachWave(t); // ค่ายอด ไม่ใช่ค่าขณะนั้น
  const drag = dragK(t) * speed * speed;
  return { speed, pitch, amplitude, drag };
}

// ตัวรวม 2 โหมด — ใช้แทน getTelemetry(t) ของเดโมได้ตลอด 12 วิ
// สำคัญ: drag คำนวณจาก speed ที่ blend แล้วเสมอ (drag = k(ρ)·speed²)
function getTelemetryS06(t) {
  const B = BREACH;
  const swim = telemetry(t); // จาก telemetry_bean.js
  const amp = TEL_BREACH_A_MAX * breachWave(t); // AMPL ค่ายอด (Opus ง5)
  function blended(a, b, s) {
    const speed = a.speed + (b.speed - a.speed) * s;
    return {
      speed,
      pitch: a.pitch + (b.pitch - a.pitch) * s,
      amplitude: amp,
      drag: dragK(t) * speed * speed,
    };
  }
  if (t < B.T_LAUNCH) {
    if (t >= B.T_PRE) {
      // Pre-Breach — speed ตาม breachCenterVel จริง (กดตัวนิ่ง → เร่ง)
      const cen = breachCenterVel(t);
      const cenSpeed = Math.hypot(cen[0], cen[1]);
      const sBlend = smooth01((t - B.T_PRE) / 0.2);
      const speed = swim.speed + (cenSpeed - swim.speed) * sBlend;
      const s = smooth01((t - B.T_PRE) / (B.T_LAUNCH - B.T_PRE));
      const th = breachTheta(t) * 180 / Math.PI;
      return {
        speed,
        pitch: swim.pitch + (th - swim.pitch) * s,
        amplitude: amp,
        drag: dragK(t) * speed * speed,
      };
    }
    return { speed: swim.speed, pitch: swim.pitch, amplitude: amp, drag: dragK(t) * swim.speed * swim.speed };
  }
  if (t < B.T_LAUNCH + 0.5) {
    // blend ว่ายน้ำ → breach ช่วง f181–195 (0.5 วิ)
    const from = {
      speed: Math.hypot(B.V0[0], B.V0[1]),
      pitch: breachTheta(B.T_LAUNCH) * 180 / Math.PI,
      amplitude: amp,
      drag: swim.drag,
    };
    return blended(from, telemetryBreach(t), smooth01((t - B.T_LAUNCH) / 0.5));
  }
  if (t <= B.T_REENTRY) return telemetryBreach(t);
  if (t < B.T_SETTLE) {
    // blend breach → ว่ายน้ำ ช่วง f264–312 (1.6 วิ)
    return blended(telemetryBreach(t), swim, smooth01((t - B.T_REENTRY) / (B.T_SETTLE - B.T_REENTRY)));
  }
  return { speed: swim.speed, pitch: swim.pitch, amplitude: amp, drag: dragK(t) * swim.speed * swim.speed };
}
