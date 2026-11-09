/**
 * draw60.js — MotionForge S06 60 วิ ขั้นที่ 2: drawFrame(t) หลัก
 * ลำดับเลเยอร์ตามบลูพรินต์ §3.2:
 *   0 ท้องฟ้า/น้ำ (body) -> 1 เมฆ/Caustics -> 2 พื้นทราย/สาหร่าย/ฝาหอยล่าง
 *   -> 3 ไข่มุก+แสงทอง -> 4 ฝาหอยบน -> 5 วาฬ -> 6 ผิวน้ำ (เส้น+โฟม)
 *   -> 7 FX บนสุด (โซนาร์/ฟอง/สแปลช/พ่นน้ำ/ประกาย/ตะกอน)
 *  + fade to black 58.5–60.0 วิ + window.__done / window.__drawMs แบบ v3
 *
 * หมายเหตุการออกแบบ:
 *  - กล้อง: setVirtualCamera(cameraFor(t)) จาก camera60.js (ไม่แตะฟิสิกส์โลก)
 *  - วาฬ: ท่าจาก shots60.whalePoseAt(t) + WhaleState (เกลี่ยข้ามช็อต 12 เฟรม
 *    เฉพาะเรนเดอร์ต่อเนื่อง; กระโดดข้ามเฟรมจะ reset ท่าตรงๆ ไม่เกลี่ยจากท่าเก่า)
 *    และวาดลง offscreen ก่อนประกอบกลับ (กัน wet overlay ของ whale60 ทับฉาก)
 *  - อนุภาค: step แบบก้าวหน้าทีละ 1/30 วิ (มี replay จาก 0 เมื่อ seek กลับ)
 *    เพื่อให้ drawFrame(t) เรียกซ้ำแบบสุ่ม (smoke test) ได้ผลเท่าเดิม
 *  - พื้นทราย/น้ำเติมถึง y=1900 (ไม่ใช่แค่ 1280) เพราะกล้องซูม 1.1–1.5x
 *    มองเห็นโลกเลยขอบล่างจอ (เช่น ช็อต 05 มองถึง y≈1732)
 *  - สาหร่าย v2 ข้อ 8: bgSeaweed = water60.drawSeaweed 3 ชั้นที่เลเยอร์ 2
 *    (หลังวาฬ) ส่วน fgSeaweed = อาร์เรย์ในไฟล์นี้ วาดที่เลเยอร์ 6 หน้าวาฬ
 *    เฉพาะช็อต 02/17 (drawFgSeaweed60) — ไม่แตะ water60.js
 *  - พื้นทราย v2 ข้อ 9: drawSandExtended60 + drawSandDetail60 ในไฟล์นี้
 *    ขยายเนินทราย x -600..1620 ถึง y=2100 (เกินขอบกล้องทุกตำแหน่ง/ซูม)
 *    + เม็ดทราย/หิน/ริ้วคลื่นเต็มพื้นที่ — ไม่แตะ water60.js
 *  - วาฬช็อต 17-18 v2 ข้อ 5: เลื่อนลง WHALE_LOW_DROP (+65/+45 px) ตอนวาด
 *    เท่านั้น (ไม่แตะ shots60.js / ไทม์ไลน์) — WhaleState warm-up เกลี่ยให้เอง
 *  - ห้ามใส่ตัวหนังสือดีบักในเฟรมจริง: overlay ดีบักวาดเฉพาะเมื่อ
 *    window.__DEBUG === true (index-debug.html ตั้งไว้ก่อนโหลด)
 *  - ห้ามใส่ตัวหนังสือดีบักในเฟรมจริง: overlay ดีบักวาดเฉพาะเมื่อ
 *    window.__DEBUG === true (index-debug.html ตั้งไว้ก่อนโหลด)
 */
'use strict';

let P60 = null;
if (typeof require !== 'undefined') {
  try { P60 = require('./physics60.js'); } catch (e) { P60 = null; }
}
if (!P60 && typeof globalThis !== 'undefined' && globalThis.PHYSICS60) P60 = globalThis.PHYSICS60;

function p60() {
  if (!P60) throw new Error('draw60.js needs physics60.js loaded first');
  return P60;
}
function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
function smooth01(v) { const x = clamp01(v); return x * x * (3 - 2 * x); }
function lerp(a, b, u) { return a + (b - a) * u; }
function wrapRange(v, lo, hi) {
  const m = hi - lo;
  return ((((v - lo) % m) + m) % m) + lo;
}

// ---- state ----
let _whaleState = null;
let _whaleOff = null; // offscreen canvas สำหรับวาดวาฬ (กัน wet overlay ทับฉาก)
function whaleOffscreen() {
  if (!_whaleOff) {
    _whaleOff = document.createElement('canvas');
    _whaleOff.width = 720; _whaleOff.height = 1280;
  }
  return _whaleOff;
}
let _lastShot = -1;
let _sys = null;      // { bubbles, splash, spout, sparkles, ambient }
let _pLastT = 0;      // เวลาล่าสุดที่ step อนุภาคถึง
let _fired = {};      // one-shot events ที่ยิงไปแล้ว (key -> true)

function ensureParticles() {
  if (_sys) return;
  _sys = {
    bubbles: createBubbleSystem(400),
    splash: createSplashSystem(800),
    spout: createSpoutSystem(250),
    sparkles: createSparkleSystem(120),
    ambient: createAmbientSystem(80, 60),
  };
  _pLastT = 0;
  _fired = {};
}

// เหตุการณ์ครั้งเดียว: สเปรย์ตอนหัวพ้นน้ำ + สแปลช+ฟองตอนหัวแตะน้ำ
function fireEvents(prevT, tt) {
  const P = p60();
  const he = P.headExitTime();
  if (prevT < he && he <= tt && !_fired.breachSpray) {
    _fired.breachSpray = true;
    const hx = whalePoseAt(he).head[0]; // ≈ 306 (จุดหัวพ้นผิวน้ำ)
    _sys.splash.emitBreachSpray(hx, P.Y_SURFACE60, he);
  }
  const tT = P.headTouchTime();
  if (prevT < tT && tT <= tt && !_fired.splashdown) {
    _fired.splashdown = true;
    const hp = P.headTouchHeadPos(); // (684.4, 760)
    _sys.splash.emitSplashdown(hp[0], P.Y_SURFACE60, tT);
    _sys.bubbles.emit(hp[0], hp[1] + 20, 60, tT);
  }
}

// ก้าวอนุภาคจากเวลาปัจจุบันไปถึง toT ทีละ 1/30 วิ (seek กลับ -> reset + replay)
function stepParticles(toT) {
  ensureParticles();
  if (toT < _pLastT - 1e-9) {
    _sys = null;
    ensureParticles();
  }
  const dt = 1 / 30;
  let guard = 0;
  while (_pLastT < toT - 1e-9 && guard++ < 2000) {
    const tt = Math.min(toT, _pLastT + dt);
    const stepDt = tt - _pLastT;
    fireEvents(_pLastT, tt);
    const pose = whalePoseAt(tt);
    const P = p60();
    // ฟองจากหางขณะว่ายใต้น้ำ (v > 40 px/s, ศูนย์กลางอยู่ใต้ผิวน้ำ)
    if (pose.speed > 40 && pose.center[1] > P.Y_SURFACE60 + 20) {
      const pr = pose.pitch * Math.PI / 180;
      const tx = pose.center[0] - (P.L60 / 2) * Math.cos(pr);
      // v2 ข้อ 5: หางที่วาดจริงอยู่ต่ำกว่าท่า pose ในช็อต 17-18 (WHALE_LOW_DROP)
      // เลื่อนจุดปล่อยฟองตามลงไปด้วย กันฟองลอยห่างจากหางที่วาด
      // v3 จุด 1: ช็อต 18 ยกวาฬขึ้น (whaleShot18LiftY) — เลื่อนจุดปล่อยฟองตามขึ้นด้วย
      const ty = pose.center[1] - (P.L60 / 2) * Math.sin(pr) + whaleLowDropY(pose.shot) + whaleShot18LiftY(pose.shot);
      _sys.bubbles.emit(tx, ty, 2, tt);
    }
    // ช็อต 15: ฟองมหาศาลหลังตกกระทบ (43.5–46.5 วิ)
    if (tt >= 43.5 && tt <= 46.5) {
      _sys.bubbles.emit(pose.head[0], pose.head[1], 4, tt);
    }
    // ประกายทองรอบไข่มุกขณะหอยเปิดกว้าง (> 40°)
    if (shellAngle60(tt) > 40) _sys.sparkles.emit(2, tt);
    _sys.bubbles.update(stepDt, tt);
    _sys.splash.update(stepDt, tt);
    _sys.spout.update(stepDt, tt);
    _sys.sparkles.update(stepDt, tt);
    _pLastT = tt;
  }
}

// ---- เลเยอร์ 0: ท้องฟ้า (โลก) ----
function drawSky60(ctx) {
  const sky = ctx.createLinearGradient(0, 0, 0, 760);
  sky.addColorStop(0, '#cfeaf7');
  sky.addColorStop(0.35, '#a8d4ea');
  sky.addColorStop(0.65, '#7fb8d8');
  sky.addColorStop(0.85, '#5d9cc4');
  sky.addColorStop(1, '#dceef5');
  ctx.fillStyle = sky;
  ctx.fillRect(-300, -600, 1320, 1360); // y −600..760 (เผื่อกล้องแพนขึ้น)
}

// ผิวน้ำ ณ x (Gerstner + bulge + คลื่นกระจาย) — สูตรเดียวกับ water60
function surfaceLineY(x, t) {
  return surfaceYAt(x, t) - bulgeAt(x, t) + spreadWaveAt(x, t);
}

// ---- เลเยอร์ 0: ตัวน้ำ (fill ตามเส้นผิวน้ำลงไปถึง y=1900) ----
function drawWaterBody60(ctx, t) {
  const P = p60();
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(-300, 1900);
  for (let x = -300; x <= 1020; x += 8) {
    ctx.lineTo(x, surfaceLineY(x, t));
  }
  ctx.lineTo(1020, 1900);
  ctx.closePath();
  const g = ctx.createLinearGradient(0, P.Y_SURFACE60, 0, P.H60);
  g.addColorStop(0, 'rgba(28,105,150,0.55)');
  g.addColorStop(0.4, 'rgba(16,70,110,0.75)');
  g.addColorStop(1, 'rgba(8,40,70,0.95)');
  ctx.fillStyle = g;
  ctx.fill();
  ctx.restore();
}

// ---- เลเยอร์ 1: เมฆ (คัดลอกสูตร v3 — 7 วง radial, drift ช้าๆ) ----
function drawCloud60(ctx, bx, by, s, offX) {
  const cx = wrapRange(bx + offX, -150, 870);
  const puffs = [[0, 0, 42, 0.85], [38, -12, 34, 0.7], [-38, -8, 30, 0.65], [70, 4, 24, 0.55], [-70, 6, 22, 0.5], [15, -22, 26, 0.6], [-15, -20, 20, 0.5]];
  for (const [ox, oy, r, a] of puffs) {
    const g = ctx.createRadialGradient(cx + ox * s, by + oy * s, r * 0.2, cx + ox * s, by + oy * s, r * s);
    g.addColorStop(0, `rgba(255,255,255,${a})`);
    g.addColorStop(0.7, `rgba(255,255,255,${(a * 0.6).toFixed(3)})`);
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(cx + ox * s, by + oy * s, r * s, 0, Math.PI * 2); ctx.fill();
  }
}
function drawClouds60(ctx, t) {
  const drift = t * 6; // ลอยเอื่อย 6 px/s
  drawCloud60(ctx, 180, 330, 1.0, drift);
  drawCloud60(ctx, 430, 380, 1.2, drift);
  drawCloud60(ctx, 600, 300, 0.9, drift);
}

// ---- เลเยอร์ 6: เส้นผิวน้ำ + โฟม ----
function drawSurfaceLine60(ctx, t) {
  ctx.save();
  ctx.beginPath();
  for (let x = -300; x <= 1020; x += 8) {
    const y = surfaceLineY(x, t);
    if (x === -300) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.strokeStyle = 'rgba(200,235,255,0.7)';
  ctx.lineWidth = 2;
  ctx.stroke();
  // โฟมรอบจุดทะลุขาขึ้น + จุดกลับลงน้ำ (whiteWaterAt จาก water60)
  for (const ww of whiteWaterAt(t)) {
    ctx.save();
    ctx.globalAlpha = Math.max(0, ww.alpha);
    ctx.fillStyle = 'rgba(240,250,255,0.85)';
    ctx.beginPath();
    ctx.ellipse(ww.x, ww.y, ww.radius, ww.radius * 0.28, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.restore();
  }
  ctx.restore();
}

// ---- overlay ดีบัก (เฉพาะ window.__DEBUG — index-debug.html) ----
function drawDebug60(ctx, t, pose, nodes) {
  const P = p60();
  // เส้น spine (พิกัดโลก — วาดใต้กล้อง)
  ctx.save();
  applyCamera(ctx, t);
  ctx.strokeStyle = '#ffd166';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  nodes.forEach((p, i) => (i === 0 ? ctx.moveTo(p[0], p[1]) : ctx.lineTo(p[0], p[1])));
  ctx.stroke();
  ctx.fillStyle = '#ff5d5d';
  ctx.beginPath(); ctx.arc(pose.head[0], pose.head[1], 6, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  // ตัวเลข (พิกัดจอ)
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = 'rgba(10,20,30,0.7)';
  ctx.fillRect(10, 10, 460, 92);
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 17px monospace';
  ctx.fillText(`DEBUG SHOT ${String(pose.shot).padStart(2, '0')}  t=${t.toFixed(2)}s  F${Math.round(t * 30)}`, 20, 34);
  ctx.font = '15px monospace';
  ctx.fillStyle = '#9fd8ff';
  ctx.fillText(`head=(${pose.head[0].toFixed(0)}, ${pose.head[1].toFixed(0)}) pitch=${pose.pitch.toFixed(1)}° speed=${pose.speed.toFixed(0)}`, 20, 58);
  ctx.fillText(`shell=${shellAngle60(t).toFixed(1)}° glow=${shellPearlGlow60(t).toFixed(2)} spout@${P.spoutStartTime().toFixed(2)}s`, 20, 80);
}

// ---- v2 ข้อ 9: พื้นทรายเต็มเฟรม (draw60-local — ไม่แตะ water60.js) ----
// ปัญหา v1: drawSandFloor วาดแค่ x -150..870 ถึง y=1330; นอกนั้นเป็นแถบสีเรียบ
// #8a6f4d ของ draw60 — เห็นรอยต่อแนวดิ่งที่ x=870 (เฟรมกลับลงน้ำ) และพื้นทราย
// เรียบว่างโล่ง 1/3 ล่างของเฟรมในช็อตใต้น้ำ
// วิธีแก้: ขยายเนินทรายด้วยสูตร sine เดียวกับ drawSandFloor (จะได้เส้นขอบเนินต่อกัน
// ไร้รอยต่อ) ครอบ x -600..1620 ถึง y=2100 — เกินขอบกล้องทุกตำแหน่ง/ซูม
// (ช็อต 05 zoom 1.1 มองถึง y≈1790, ช็อต 18 zoom 2.5 มองถึง y≈1416, ช็อต 14
// แพนขวาถึง x≈958) + เติมรายละเอียดให้เต็มพื้นที่ด้วย drawSandDetail60
const SAND_EXT = { x0: -600, x1: 1620, yBottom: 2100 };
function sandDuneY(x) {
  const P = p60();
  return P.Y_SAND60 + 6 * Math.sin(x * 0.012 + 1.2) + 4 * Math.sin(x * 0.031 + 0.5);
}
// PRNG แบบ deterministic (สำเนาสูตร mulberry32 ของ water60 — ไม่พึ่งโมดูลอื่น)
function sandRand(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let r = Math.imul(a ^ (a >>> 15), 1 | a);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}
function drawSandExtended60(ctx, t) {
  const P = p60();
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(SAND_EXT.x0, SAND_EXT.yBottom);
  for (let x = SAND_EXT.x0; x <= SAND_EXT.x1; x += 10) ctx.lineTo(x, sandDuneY(x));
  ctx.lineTo(SAND_EXT.x1, SAND_EXT.yBottom);
  ctx.closePath();
  const g = ctx.createLinearGradient(0, P.Y_SAND60 - 10, 0, P.H60);
  g.addColorStop(0, '#c9a86a');
  g.addColorStop(0.5, '#a9854e');
  g.addColorStop(1, '#7a5c33');
  ctx.fillStyle = g;
  ctx.fill();
  ctx.restore();
}
// รายละเอียดพื้นทรายเต็มพื้นที่ (ตำแหน่งตายตัวจาก seed — ไม่กะพริบข้ามเฟรม):
// เม็ดทรายเข้ม/สว่าง ~850 จุด + หินเล็ก ~50 ก้อน + ริ้วคลื่น 18 แถบ + แสงแดดด่าง ~36 จุด
// ครอบ x -600..1620, y 1205..1880 (ลึกกว่าขอบล่างที่กล้องซูม 1.1 มองถึง ≈1790)
function drawSandDetail60(ctx, t) {
  const P = p60();
  const x0 = SAND_EXT.x0, x1 = SAND_EXT.x1;
  ctx.save();
  let rng = sandRand(20261109);
  ctx.fillStyle = 'rgba(60,40,15,0.35)';
  for (let i = 0; i < 700; i++) {
    const x = x0 + rng() * (x1 - x0);
    const y = P.Y_SAND60 + 5 + rng() * (1880 - P.Y_SAND60 - 5);
    ctx.beginPath(); ctx.arc(x, y, 1 + rng() * 1.6, 0, Math.PI * 2); ctx.fill();
  }
  ctx.fillStyle = 'rgba(255,230,180,0.16)';
  for (let i = 0; i < 150; i++) {
    const x = x0 + rng() * (x1 - x0);
    const y = P.Y_SAND60 + 5 + rng() * (1880 - P.Y_SAND60 - 5);
    ctx.beginPath(); ctx.arc(x, y, 0.8 + rng() * 1.4, 0, Math.PI * 2); ctx.fill();
  }
  // หินเล็ก (วงรี + ไฮไลต์ด้านบน)
  for (let i = 0; i < 50; i++) {
    const x = x0 + rng() * (x1 - x0);
    const y = P.Y_SAND60 + 10 + rng() * (1850 - P.Y_SAND60 - 10);
    const rx = 2 + rng() * 4, ry = rx * (0.55 + rng() * 0.25);
    ctx.fillStyle = 'rgba(88,68,42,0.6)';
    ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,235,190,0.20)';
    ctx.beginPath(); ctx.ellipse(x - rx * 0.2, y - ry * 0.35, rx * 0.55, ry * 0.4, 0, 0, Math.PI * 2); ctx.fill();
  }
  // ริ้วคลื่นบนทราย (เส้นโค้งจางๆ แนวนอน)
  ctx.strokeStyle = 'rgba(60,40,15,0.12)';
  ctx.lineWidth = 5; ctx.lineCap = 'round';
  for (let k = 0; k < 18; k++) {
    const yBase = 1240 + k * 36 + rng() * 10;
    ctx.beginPath();
    for (let x = x0; x <= x1; x += 40) {
      const y = yBase + 5 * Math.sin(x * 0.008 + k * 1.7);
      if (x === x0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  // แสงแดดด่างบนทราย (caustic dapple จางๆ)
  ctx.fillStyle = 'rgba(255,235,190,0.09)';
  for (let i = 0; i < 36; i++) {
    const x = x0 + rng() * (x1 - x0);
    const y = P.Y_SAND60 + 8 + rng() * 500;
    ctx.beginPath(); ctx.ellipse(x, y, 15 + rng() * 28, 6 + rng() * 10, (rng() - 0.5) * 0.6, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}

// ---- v2 ข้อ 8: สาหร่ายฉากหน้า (fgSeaweed — Layer 6 หน้าวาฬ) ----
// bgSeaweed = water60.drawSeaweed 3 ชั้น (Layer 2 หลังวาฬ — เรียกที่เดิมใน drawFrame)
// fgSeaweed = อาร์เรย์ในไฟล์นี้: กอสาหร่ายหน้าวาดหลังวาฬ เฉพาะช็อต 02/17
//  - x0 = ตำแหน่งโลกก่อน parallax (สูตรเดียวกับ water60: wx = wrap(x0 - cam.cx·1.0))
//    เลือกให้ใบพาดผ่านลำตัววาฬกลางช็อต: ช็อต 02 ใบที่ world x ≈285/500 (กลางช็อต),
//    ช็อต 17 ใบที่ world x ≈330/520 (กล้องนิ่ง cx=430)
//  - h: ช็อต 02 สูง 375-395 px (ปลายใบ y≈810-830 — อยู่ใต้เส้นผิวน้ำ ~725-795
//    และพาดผ่านครึ่งล่างของลำตัววาฬที่ y≈793-867); ช็อต 17 สูง 300-340 px
//    (ปลายใบ y≈864-904 พาดผ่านลำตัววาฬที่ y≈968-1042)
const bgSeaweed = (typeof SEAWEED_LAYERS !== 'undefined') ? SEAWEED_LAYERS : null;
const fgSeaweed = [
  { shot: 2,  x0: 675, h: 395, lean: -14, ph: 0.7, w: 11 },
  { shot: 2,  x0: 890, h: 375, lean: 10,  ph: 2.1, w: 12 },
  { shot: 17, x0: 760, h: 300, lean: -10, ph: 1.3, w: 11 },
  { shot: 17, x0: 950, h: 340, lean: 14,  ph: 3.9, w: 13 },
];
function fgSeaweedAlpha(t, shot) {
  const P = p60();
  const S = P.SHOTS60[shot - 1];
  if (!S) return 0;
  // เฟดเข้า/ออก 0.4 วิที่ขอบช็อต กันใบโผล่/หายแบบตัดทันที
  return clamp01(smooth01((t - S.t0) / 0.4)) * clamp01(1 - smooth01((t - (S.t1 - 0.4)) / 0.4));
}
function drawFgSeaweed60(ctx, t, cam, shot) {
  const P = p60();
  const alpha = fgSeaweedAlpha(t, shot);
  if (alpha <= 0) return;
  const yBase = P.Y_SAND60 + 4;
  const span = 1020;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.lineCap = 'round';
  for (const b of fgSeaweed) {
    if (b.shot !== shot) continue;
    const wx = (((b.x0 - cam.cx * 1.0 + 150) % span) + span) % span - 150;
    const sway = 10 * Math.sin(t * 0.8 + b.ph) + 5 * Math.sin(t * 1.7 + b.ph * 2);
    const tipX = wx + b.lean + sway, tipY = yBase - b.h;
    const midX = wx + b.lean * 0.4 + sway * 0.5, midY = yBase - b.h * 0.55;
    ctx.strokeStyle = 'rgba(18,75,48,0.96)';
    ctx.lineWidth = b.w;
    ctx.beginPath(); ctx.moveTo(wx, yBase); ctx.quadraticCurveTo(midX, midY, tipX, tipY); ctx.stroke();
    ctx.strokeStyle = 'rgba(120,190,140,0.35)';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(wx, yBase); ctx.quadraticCurveTo(midX, midY, tipX, tipY); ctx.stroke();
  }
  ctx.restore();
}

// ---- v2 ข้อ 5: วาฬช็อต 17-18 ว่ายต่ำลง (แก้ตอนวาดเท่านั้น) ----
// เลื่อนหัววาฬลงตอนส่งให้ WhaleState (ไม่แตะ shots60.js / ไทม์ไลน์);
// warm-up 12 เฟรมของ WhaleState เกลี่ยการเปลี่ยนตำแหน่งให้เองตอนตัดช็อต
const WHALE_LOW_DROP = { 17: 65, 18: 45 };
function whaleLowDropY(shot) { return WHALE_LOW_DROP[shot] || 0; }

// ---- v3 จุด 1: วาฬช็อต 18 ยกขึ้นพ้นขอบบนกล้อง (แก้ตอนวาดเท่านั้น) ----
// ช็อต 18 (53.50–56.50 วิ) กล้องซูม 2.5x กลางไข่มุก — ลำตัววาฬที่ว่ายผ่าน
// อ่านเป็นแท่งมวลคล้ายงูพาดขอบบนเฟรม แย่งสายตาจากจังหวะปิดหอย
// ยกหัววาฬขึ้น 160 px พิกัดโลก เฉพาะช็อต 18 เท่านั้น — หักลบกับ
// WHALE_LOW_DROP ของช็อต 18 (+45) แล้ววาฬกลับไปอยู่ท่าฟิสิกส์เดิมพอดี
// เหตุผลที่ 160 ไม่ใช่ 45 (ตามที่ Gemini ประมาณไว้): วัดจากเฟรมจริง F1650
// ของ v3 รอบแรก (lift 45) — ขอบบนท่อลำตัวอยู่ที่จอ y≈85 px, ก้นท่ออยู่ที่
// ≈272 px; ต้องยกเพิ่ม (272/2.5) ≈ 109 px โลก ก้นท่อถึงจะพ้นขอบบนสนิท
// (45+109 ≈ 154 → ใช้ 160 เผื่อขอบ) — ครีบข้างใกล้ยังอาจโผล่ปลายครีบ
// เล็กน้อยที่มุมขวาบน แต่ลำตัวพ้นเฟรม 100% แล้ว; warm-up 12 เฟรมเกลี่ย
// การเปลี่ยนตำแหน่งตอนตัดช็อตให้เอง (ยกระดับ 160 px โลก = ~400 px จอที่ซูม 2.5x)
const WHALE_SHOT18_LIFT = 160;
function whaleShot18LiftY(shot) { return shot === 18 ? -WHALE_SHOT18_LIFT : 0; }

// ---- drawFrame หลัก ----
function drawFrame(t) {
  const tStart = (typeof performance !== 'undefined') ? performance.now() : Date.now();
  const canvas = document.getElementById('c');
  const ctx = canvas.getContext('2d');
  const P = p60();
  const pose = whalePoseAt(t);
  const cam = cameraFor(t);
  stepParticles(t);

  // พื้นหลังกันพลาด (เผื่อกล้องมองเลยขอบโลกที่วาดไว้)
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#0a2f4d';
  ctx.fillRect(0, 0, P.W60, P.H60);

  ctx.save();
  setVirtualCamera(ctx, cam);

  // Layer 0 — ท้องฟ้า / ตัวน้ำ
  drawSky60(ctx);
  drawWaterBody60(ctx, t);
  // Layer 1 — เมฆ / Caustics
  drawClouds60(ctx, t);
  drawCausticRays(ctx, t);
  // Layer 2 — พื้นทราย / สาหร่ายหลัง / ฝาหอยล่าง
  // v2 ข้อ 9: เนินทรายขยายเต็มเฟรมก่อน (drawSandExtended60: x -600..1620 ถึง y=2100)
  // แล้วค่อย drawSandFloor (กลาง) + รายละเอียดเต็มพื้นที่ — ไร้ขอบสี่เหลี่ยม
  drawSandExtended60(ctx, t);
  drawSandFloor(ctx, t);
  drawSandDetail60(ctx, t);
  drawSeaweed(ctx, t, cam.cx); // bgSeaweed (Layer 2 หลังวาฬ)
  drawShellLower60(ctx, t);
  // Layer 3 — ไข่มุกทอง + แสงทอง
  drawGoldenLight60(ctx, t);
  drawPearl60(ctx, t);
  // Layer 4 — ฝาหอยบน
  drawShellUpper60(ctx, t);
  // Layer 5 — วาฬ (วาดลง offscreen ก่อน — แบบ v3)
  // เหตุผล: whale60.drawWhale60 ทา wet overlay (source-atop, แถบน้ำทั้งจอ)
  // ลงบน ctx ที่ได้รับโดยตรง — ถ้าวาดลงเฟรมหลัก overlay จะทับฉากใต้น้ำ
  // ทั้งหมด (ทราย/หอย/แสงทองมืดลง 35–75%) ไม่ใช่แค่ตัววาฬตามเจตนาเดิม
  // (v3 ทำบน offscreen) — วาดลง offscreen แล้วประกอบกลับ จึงไม่ต้องแก้โมดูลขั้นที่ 1
  if (!_whaleState) _whaleState = new WhaleState();
  if (t < _whaleState.t - 1e-9 || t - _whaleState.t > 1.5 / 30) {
    // seek กลับ หรือกระโดดข้ามเฟรม (smoke test / resume): อย่าเกลี่ยจากท่าเก่า
    // เพราะท่าเก่าคืออีกเวลาหนึ่ง — ตั้งท่าปัจจุบันตรงๆ (เรนเดอร์ต่อเนื่อง
    // dt=1/30 ไม่เข้าเงื่อนไขนี้ จึงยังเกลี่ยข้ามช็อต 12 เฟรมเหมือนเดิม)
    _whaleState.reset();
    _lastShot = -1;
  }
  if (pose.shot !== _lastShot) { _whaleState.beginShot(); _lastShot = pose.shot; }
  // v2 ข้อ 5: ช็อต 17-18 เลื่อนวาฬลงตอนวาดเท่านั้น (+65/+45 px — ไม่แตะ shots60.js)
  // v3 จุด 1: ช็อต 18 ยกวาฬขึ้น 45 px (whaleShot18LiftY) หักลบกับ low drop แล้ว
  const headDraw = [pose.head[0], pose.head[1] + whaleLowDropY(pose.shot) + whaleShot18LiftY(pose.shot)];
  const nodes = _whaleState.update(headDraw, pose.pitch, t, pose.ampScale);
  const offc = whaleOffscreen();
  const oc = offc.getContext('2d');
  oc.setTransform(1, 0, 0, 1, 0, 0);
  oc.clearRect(0, 0, P.W60, P.H60);
  oc.setTransform(ctx.getTransform()); // กล้องเดียวกับเฟรมหลัก
  drawWhale60(oc, nodes, { t, roll: pose.roll, speed: pose.speed, velocity: pose.velocity, shot: pose.shot });
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(offc, 0, 0);
  ctx.restore();
  // Layer 6 — สาหร่ายฉากหน้า (fgSeaweed: ช็อต 02/17 บังลำตัววาฬ) + ผิวน้ำ (เส้น + โฟม)
  drawFgSeaweed60(ctx, t, cam, pose.shot);
  drawSurfaceLine60(ctx, t);
  // Layer 7 — FX บนสุด
  ctx.save();
  ctx.beginPath(); ctx.rect(-150, P.Y_SURFACE60, 1020, P.Y_SAND60 - P.Y_SURFACE60); ctx.clip();
  for (const pingT of P.SONAR60.PINGS) {
    drawSonarPing(ctx, pingT, t, whalePoseAt(pingT).head);
  }
  ctx.restore();
  _sys.bubbles.draw(ctx);
  _sys.splash.draw(ctx);
  _sys.spout.draw(ctx);
  _sys.sparkles.draw(ctx);
  _sys.ambient.draw(ctx, t);

  ctx.restore(); // กล้อง

  // Fade to black 58.5–60.0 วิ (ช็อต 19)
  if (t >= 58.5) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = `rgba(0,0,0,${smooth01((t - 58.5) / 1.5).toFixed(3)})`;
    ctx.fillRect(0, 0, P.W60, P.H60);
  }

  // ดีบักแยกไฟล์ (index-debug.html เท่านั้น)
  if (typeof window !== 'undefined' && window.__DEBUG === true) {
    drawDebug60(ctx, t, pose, nodes);
  }

  window.__drawMs = ((typeof performance !== 'undefined') ? performance.now() : Date.now()) - tStart;
  window.__done = true;
}
window.drawFrame = drawFrame;
window.__done = false;
// v2: เปิดให้ index-debug / เทสต์เบราว์เซอร์ตรวจอาร์เรย์สาหร่าย + ฟังก์ชันทราย
if (typeof window !== 'undefined') {
  window.bgSeaweed = bgSeaweed;
  window.fgSeaweed = fgSeaweed;
  window.drawSandExtended60 = drawSandExtended60;
  window.drawSandDetail60 = drawSandDetail60;
  window.drawFgSeaweed60 = drawFgSeaweed60;
  window.whaleLowDropY = whaleLowDropY;
  window.whaleShot18LiftY = whaleShot18LiftY;
  window.WHALE_SHOT18_LIFT = WHALE_SHOT18_LIFT;
}
