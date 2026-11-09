/**
 * camera60.js — MotionForge S06 60 วินาที: Virtual Camera
 * ดัดแปลงแนวคิดจาก camera.js v3 (ตามวาฬด้วย extent + ซูม + สั่นตอนกระแทก)
 * แต่ 60 วิใช้กล้องแบบคีย์เฟรมต่อช็อต (pan/zoom/shake จากสตอรี่บอร์ด)
 * แทนการตาม extent ทุกเฟรม — กล้องขยับแบบ smoothstep ไม่กระตุก
 *
 * โมเดลกล้อง: { cx, cy, zoom } = จุดโลกที่อยู่กลางจอ + สเกล
 * setVirtualCamera แปลงพิกัดโลก→จอโดยไม่แตะฟิสิกส์โลก (ฟิสิกส์อยู่ใน world เสมอ)
 * shake: noise แบบ deterministic จากเวลา (sin hash) — เรนเดอร์ซ้ำได้เฟรมเดิม
 */
'use strict';

let P60 = null;
if (typeof require !== 'undefined') {
  try { P60 = require('./physics60.js'); } catch (e) { P60 = null; }
}
if (!P60 && typeof globalThis !== 'undefined' && globalThis.PHYSICS60) P60 = globalThis.PHYSICS60;

function p60() {
  if (!P60) throw new Error('camera60.js needs physics60.js loaded first');
  return P60;
}
function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
function smooth01(v) { const x = clamp01(v); return x * x * (3 - 2 * x); }
function lerp(a, b, u) { return a + (b - a) * u; }

// ---- คีย์เฟรมกล้องต่อช็อต (จากสตอรี่บอร์ดบลูพรินต์) ----
// cx/cy = จุดโลกกลางจอ; zoom = สเกลสัมพัทธ์; shakeAmp = แอมป์สั่นสูงสุด (px)
// หมายเหตุ: ค่า pan ของบลูพรินต์บางช็อต (เช่น S02 "x: 100→350") จะทำให้วาฬ
// หลุดเฟรมถ้าใช้ตรงๆ — ตารางนี้จึงยึด "ตามวาฬ" เป็นหลัก คงทิศทาง/จังหวะเดิม
const SHOT_CAM60 = [
  { n: 1,  cx0: 360, cy0: 400, cx1: 420, cy1: 800,  zoom0: 1.0, zoom1: 1.0,  shake: 0 },  // Pan Down y 400→800
  { n: 2,  cx0: 350, cy0: 780, cx1: 430, cy1: 880,  zoom0: 1.0, zoom1: 1.0,  shake: 0 },  // Tracking Pan ตามวาฬ
  { n: 3,  cx0: 390, cy0: 1000, cx1: 390, cy1: 1000, zoom0: 1.0, zoom1: 1.0,  shake: 0 }, // Static Wide
  { n: 4,  cx0: 530, cy0: 950, cx1: 487, cy1: 1031, zoom0: 2.2, zoom1: 2.2, shake: 0 },  // v2 ข้อ 4 P2: โคลสอัปหัว 2.2x — กล้องตามหัววาฬ (head endpoints จาก shots60 POSE_KEYS: (530,950)→(486.7,1031.2); กล้องกับหัวใช้ smooth01 ตัวเดียวกัน ความคลาดเคลื่อน <2 px โลก หัวอยู่กลางจอตลอดช็อต; ที่ 2.2x ลำตัวยาว 300 px โลก = 660 px จอ ภาพอ่านเป็นโคลสอัปชัด ต่างจากมุมกว้าง v1)
  { n: 5,  cx0: 400, cy0: 1150, cx1: 400, cy1: 1150, zoom0: 1.1, zoom1: 1.1,  shake: 0 }, // Low-angle ระดับพื้นทราย
  { n: 6,  cx0: 390, cy0: 1050, cx1: 390, cy1: 1050, zoom0: 1.25, zoom1: 1.0, shake: 0 },  // Dolly Out
  { n: 7,  cx0: 360, cy0: 1010, cx1: 360, cy1: 950,  zoom0: 1.1, zoom1: 1.1,  shake: 0 },  // Pan Up ตามแสง
  { n: 8,  cx0: 360, cy0: 980, cx1: 360, cy1: 980,  zoom0: 1.05, zoom1: 1.05, shake: 0 },  // Low-angle tracking
  { n: 9,  cx0: 370, cy0: 970, cx1: 370, cy1: 970,  zoom0: 1.0, zoom1: 1.0,  shake: 0 },   // Orbit (หมุนตามวาฬ — หมุนจริงในรอบช็อต)
  { n: 10, cx0: 340, cy0: 980, cx1: 300, cy1: 940,  zoom0: 1.0, zoom1: 1.0,  shake: 0 },   // Fast Pan Up
  { n: 11, cx0: 280, cy0: 920, cx1: 260, cy1: 906,  zoom0: 1.0, zoom1: 1.0,  shake: 2 },   // Leading + สั่นเบาๆ
  { n: 12, cx0: 320, cy0: 700, cx1: 435, cy1: 550,  zoom0: 1.0, zoom1: 1.0,  shake: 12 },  // ตัดเหนือน้ำ + สั่นแรงตอนทะลุ
  { n: 13, cx0: 435, cy0: 495, cx1: 520, cy1: 650,  zoom0: 1.0, zoom1: 1.0,  shake: 2 },   // Floating Apex View
  { n: 14, cx0: 598, cy0: 883, cx1: 520, cy1: 1000, zoom0: 1.0, zoom1: 1.0,  shake: 18 },  // Impact Shake 18px แล้วนิ่ง
  { n: 15, cx0: 500, cy0: 1000, cx1: 450, cy1: 1020, zoom0: 1.0, zoom1: 1.0,  shake: 0 },  // Deceleration tracking
  { n: 16, cx0: 450, cy0: 1020, cx1: 420, cy1: 1000, zoom0: 1.0, zoom1: 1.0,  shake: 0 },  // Side Tracking
  { n: 17, cx0: 430, cy0: 1010, cx1: 430, cy1: 1010, zoom0: 1.0, zoom1: 1.0,  shake: 0 },  // Static ระดับพื้นทราย
  { n: 18, cx0: 345, cy0: 1190, cx1: 375, cy1: 1185, zoom0: 2.5, zoom1: 2.5, shake: 0 },  // v2 ข้อ 4 P2: โคลสอัปหอย 2.5x — กล้องกลางไข่มุก (345,1187) แพนตามวาฬเล็กน้อย; หอยทั้งเปลือก (x 293–397) อยู่ในเฟรมทุกเฟรม ไข่มุก r=13 โลก = 32 px จอ เห็นประกายทองหรี่ลงขณะฝาปิดชัด; หมายเหตุ: หัววาฬ (x 600–650) หลุดขอบขวากลางช็อตโดยเลี่ยงไม่ได้ — ระยะหอย→หัว ~307 px โลก กว้างกว่ามุมมองที่ 2.5x (288 px) วาฬจึงเห็นแค่ลำตัวผ่านเฟรม ไม่ใช่หัว (ดูรายงาน)
  { n: 19, cx0: 480, cy0: 1000, cx1: 480, cy1: 1000, zoom0: 1.0, zoom1: 1.0,  shake: 0 },  // Static + Fade to Black (เฟดในรอบเรนเดอร์)
];

// noise แบบ deterministic (เรนเดอร์ซ้ำได้เฟรมเดิม — ไม่ใช้ Math.random)
function shakeNoise(t, seed) {
  return Math.sin(t * 47 + seed) * 0.6 + Math.sin(t * 31 + seed * 1.7) * 0.4;
}

// ซองสั่น (envelope): ช็อต 12 สั่นแรงสุดตอนทะลุ 36.00 แล้วจาง;
// ช็อต 14 สั่นแรงสุดตอนหัวแตะน้ำ 39.31 แล้วจาง exp(−dt/0.25)
function shakeEnvelope(shotN, t) {
  const P = p60();
  if (shotN === 12) {
    const dt = t - P.BREACH60.T_BREACH;
    if (dt < 0) return 0.3; // ปูดนูนก่อนทะลุ: สั่นเบาๆ
    return Math.exp(-dt / 0.5);
  }
  if (shotN === 14) {
    const dt = t - P.headTouchTime();
    if (dt < 0) return 0;
    return Math.exp(-dt / 0.25);
  }
  return 1;
}

// พารามิเตอร์กล้อง ณ เวลา t (smoothstep ภายในช็อต — ไม่กระตุกที่ขอบช็อต
// เพราะทุกช็อตเริ่มจากค่าที่ช็อตก่อนจบไว้ใกล้เคียงกัน)
function cameraFor(t) {
  const P = p60();
  const shot = P.shotAt(t);
  const key = SHOT_CAM60[shot.n - 1];
  const u = smooth01((t - shot.t0) / (shot.t1 - shot.t0));
  const cx = lerp(key.cx0, key.cx1, u);
  const cy = lerp(key.cy0, key.cy1, u);
  const zoom = lerp(key.zoom0, key.zoom1, u);
  const env = shakeEnvelope(shot.n, t);
  const amp = key.shake * env;
  return {
    shot: shot.n, cx, cy, zoom,
    shakeX: amp * shakeNoise(t, 0.0),
    shakeY: amp * 0.7 * shakeNoise(t, 1.3),
    shakeAmp: amp,
  };
}

// ตั้งกล้องบน canvas: แปลงพิกัดโลก→จอ (จอ 720×1280 เต็มเฟรม ไม่มี split)
// screen = (world − camCenter)·zoom + screenCenter + shake
function setVirtualCamera(ctx, cam) {
  const P = p60();
  const sx = P.W60 / 2 - cam.cx * cam.zoom + cam.shakeX;
  const sy = P.H60 / 2 - cam.cy * cam.zoom + cam.shakeY;
  ctx.setTransform(cam.zoom, 0, 0, cam.zoom, sx, sy);
  return { sx, sy };
}
function applyCamera(ctx, t) { return setVirtualCamera(ctx, cameraFor(t)); }

// แปลงพิกัดโลก → พิกัดจอ ณ เวลา t (ใช้ตรวจว่าวัตถุอยู่ในเฟรมหลังใช้กล้อง)
function worldToScreen(wx, wy, t) {
  const P = p60();
  const cam = cameraFor(t);
  return [
    P.W60 / 2 + (wx - cam.cx) * cam.zoom + cam.shakeX,
    P.H60 / 2 + (wy - cam.cy) * cam.zoom + cam.shakeY,
  ];
}
function screenToWorld(sx, sy, t) {
  const P = p60();
  const cam = cameraFor(t);
  return [
    (sx - cam.shakeX - P.W60 / 2) / cam.zoom + cam.cx,
    (sy - cam.shakeY - P.H60 / 2) / cam.zoom + cam.cy,
  ];
}
// เกลี่ยกล้องจากค่าปัจจุบันเข้าค่าเป้าหมาย (ใช้ตอนตัดช็อตถ้าต้องการ blend;
// ปกติใช้คีย์เฟรมต่อช็อตตรงๆ เพราะค่าต่อกันอยู่แล้ว)
function smoothCamera(prev, target, k) {
  const u = smooth01(k);
  return {
    cx: lerp(prev.cx, target.cx, u),
    cy: lerp(prev.cy, target.cy, u),
    zoom: lerp(prev.zoom, target.zoom, u),
    shakeX: target.shakeX, shakeY: target.shakeY, shakeAmp: target.shakeAmp,
    shot: target.shot,
  };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    SHOT_CAM60, shakeNoise, shakeEnvelope, cameraFor, setVirtualCamera,
    applyCamera, worldToScreen, screenToWorld, smoothCamera,
  };
}
