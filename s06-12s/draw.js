// draw.js — v3 (S06 เต็ม 12 วิ, คำวิจารณ์ Opus §16.8 — 5 อันดับแรก)
// ซ้าย Drawing 274px: 3 กล่อง (Header 0–115 / Viewport 120–760 / Telemetry 780–1280)
// ขวา Render 446px: กล้อง camera.js (สเกลฐาน 0.82x + ซูม 1.0→1.12 + Vertical Pan + สั่น)
// โค้ดฐาน: ฟังก์ชันบีน 5 ชิ้น + breach/camera/telemetry_breach/shell v3
// พิกัดโลก (world): 720x1280, y ชี้ลง, ผิวน้ำ WATER_Y=760, พื้นทราย SAND_Y=1200
//   (WATER_Y/SAND_Y/G มาจาก breach.js — ห้ามนิยามซ้ำที่นี่)
// เปลี่ยนจาก v2:
//   ก1–ก5: drawWhale ใหม่รอบ 2 — bodyWidth monotone cubic + ขอบ quadraticCurveTo
//     + gradient 4 stop + rim light ครึ่งบน; ครีบ 0.3L หยักตุ่ม, หางเลนส์บาง,
//     ปากโค้ง, ร่องใต้คาง 7 เส้น (ลบเส้นขาวกลางลำตัว); บีบหนาต่ำสุด 0.95 +
//     แถบท้องเลื่อนตาม −cos(roll); สีทับใต้น้ำ (source-atop) + ความเปียก 0.6 วิ
//   ข9: ผิวน้ำ heightfield 1D ยกน้ำตรงจุดที่โครงร่างตัดผิวน้ำจริง
//   ข10: อนุภาคพิกัดโลก — จุดกำเนิดคงที่ที่เหตุการณ์ (ไม่ตามหัว), ปล่อยน้ำพุ
//     เฉพาะตอน blowhole อยู่ใกล้ผิวน้ำ (Beat 1 ไม่มีน้ำพุ — วาฬอยู่ลึก),
//     อนุภาค log-normal 0.8–4 px วาดเป็นเส้นตามความเร็ว + ละอองหมอก
//   ข14: เบลอแบบวาดวาฬซ้ำ 6 ครั้งย้อนทิศความเร็วเฉพาะ |v|>300 (ไม่เบลอฉาก)
//   ก7: เมฆ radial 7 วง + ฟ้า 5 stop + ลำแสง lighter แกว่ง + ผิวน้ำ sine 3 ชุด
//   ก8: อนุภาค log-normal + ละอองหมอก (CA เก็บไว้เหมือน v2 ตามที่ล็อก — polish ไม่แตะ)
//   ข1: parallax bgX −= v·dt·f (0.3/1.0/1.3) + ตะกอนวนกลับ
//   ข12: โซนาร์คลิปในกรอบน้ำ + alpha exp(−r/300)
//   ค6/ง1–ง5: สเกลแผง Drawing เท่ากันสองแกน 0.465 + กราฟ y(t)/v(t) ตรงช่องว่าง;
//     ข้อความดีบักห่อ if(DEBUG) — งานจริง (index.html) ไม่มีดีบัก,
//     โหมดดีบักแยก (index-debug.html); ป้ายข้อต่อวางแบบ greedy;
//     เกจคำนวณล่วงหน้าทั้งคลิป; AMPL ค่ายอด; SPEED แสดง m/s

const W = 720, H = 1280, SPLIT = 274;

// DEBUG: เปิดด้วย ?debug=1 หรือ window.__DEBUG=true (index-debug.html)
// งานจริง (index.html) = false — ไม่มีข้อความดีบักในเฟรม
const DEBUG = (typeof window !== 'undefined') &&
  (window.__DEBUG === true ||
    (typeof location !== 'undefined' && /[?&]debug=1/.test(location.search)));

// ---- แผงซ้าย: map พิกัดโลก -> แผง (สเกลเท่ากันสองแกน 0.465 — Opus ค6) ----
const PANEL_S = 0.465;
const mx = (wx) => 16 + (wx - 100) * PANEL_S;
const my = (wy) => 120 + (wy - 300) * PANEL_S;

// Catmull-Rom sampling ผ่านจุด spine (เหมือนเดโม v2)
function sampleSpline(pts, n) {
  const out = [];
  const P = pts;
  function get(i) { return P[Math.max(0, Math.min(P.length - 1, i))]; }
  for (let s = 0; s < P.length - 1; s++) {
    for (let j = 0; j < n; j++) {
      const u = j / n;
      const p0 = get(s - 1), p1 = get(s), p2 = get(s + 1), p3 = get(s + 2);
      const u2 = u * u, u3 = u2 * u;
      out.push([
        0.5 * ((2 * p1[0]) + (-p0[0] + p2[0]) * u + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * u2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * u3),
        0.5 * ((2 * p1[1]) + (-p0[1] + p2[1]) * u + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * u2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * u3),
      ]);
    }
  }
  out.push(P[P.length - 1].slice());
  return out;
}

// เส้นโค้งนุ่มผ่านจุด (quadraticCurveTo ผ่านจุดกึ่งกลาง — Opus ก1)
function smoothPath(ctx, pts) {
  if (!pts.length) return;
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length - 1; i++) {
    const mxp = (pts[i][0] + pts[i + 1][0]) / 2, myp = (pts[i][1] + pts[i + 1][1]) / 2;
    ctx.quadraticCurveTo(pts[i][0], pts[i][1], mxp, myp);
  }
  ctx.lineTo(pts[pts.length - 1][0], pts[pts.length - 1][1]);
}

// ---- Heightfield ผิวน้ำ 1D (Opus ข9) ----
const HF = { n: 180, x0: -150, x1: 870, h: null, hO: null, lastT: -1 };
function hfReset() {
  HF.h = new Float64Array(HF.n);
  HF.hO = new Float64Array(HF.n);
  HF.lastT = 0;
}
function hfAt(x) {
  if (!HF.h) return 0;
  const idx = Math.max(0, Math.min(HF.n - 1, Math.round((x - HF.x0) / (HF.x1 - HF.x0) * (HF.n - 1))));
  return HF.h[idx];
}
function stepHeightfield(t) {
  if (HF.lastT < 0 || t < HF.lastT - 1e-6) hfReset();
  const dt = 1 / 30;
  let guard = 0;
  while (HF.lastT < t - 1e-9 && guard++ < 400) {
    const tt = HF.lastT + dt;
    // ยกน้ำขึ้นตรงจุดที่โครงร่างตัดผิวน้ำจริง (Opus ข9)
    const pts = whalePointsS06(tt);
    const v = breachCenterVel(tt);
    const vy = Math.abs(v[1]);
    if (vy > 50) {
      for (let i = 0; i < pts.length - 1; i++) {
        const y0 = pts[i][1] - WATER_Y, y1 = pts[i + 1][1] - WATER_Y;
        if ((y0 < 0) !== (y1 < 0)) {
          const f = y0 / (y0 - y1);
          const xi = pts[i][0] + (pts[i + 1][0] - pts[i][0]) * f;
          const idx = Math.round((xi - HF.x0) / (HF.x1 - HF.x0) * (HF.n - 1));
          for (let k = -3; k <= 3; k++) {
            const j = idx + k;
            if (j >= 0 && j < HF.n) HF.h[j] += 0.012 * vy * Math.exp(-(k * k) / 4);
          }
        }
      }
    }
    // สมการคลื่น: hN[i]=(2h[i]−hO[i]+c²(h[i−1]−2h[i]+h[i+1]))·0.995
    const hN = new Float64Array(HF.n), c2 = 0.25;
    for (let i = 1; i < HF.n - 1; i++) {
      hN[i] = (2 * HF.h[i] - HF.hO[i] + c2 * (HF.h[i - 1] - 2 * HF.h[i] + HF.h[i + 1])) * 0.995;
    }
    hN[0] = hN[1]; hN[HF.n - 1] = hN[HF.n - 2];
    HF.hO = HF.h; HF.h = hN;
    HF.lastT = tt;
  }
}

// จุดผิวน้ำ (x', y) — Gerstner + heightfield + sine 3 ชุด (Opus ก7)
function surfacePoint(x, t) {
  const [xp, h] = gerstnerPoint(x, t);
  const rip = 3 * Math.sin(2 * Math.PI * x / 180 + 0.9 * t)
    + 2 * Math.sin(2 * Math.PI * x / 97 + 1.7 * t)
    + 1 * Math.sin(2 * Math.PI * x / 53 + 2.3 * t);
  return [xp, WATER_Y - h - hfAt(xp) - rip];
}

// ---- Parallax (Opus ข1): offset = −f·∫|v|dt — คำนวณเป็นฟังก์ชันของ t ----
const _parCache = {};
function parallaxIntegral(t) {
  const key = t.toFixed(2);
  if (_parCache[key] !== undefined) return _parCache[key];
  let I = 0;
  const step = 0.05;
  for (let tt = 0; tt < t; tt += step) {
    const mid = Math.min(t, tt + step);
    const v = (tt < BREACH.T_LAUNCH || tt >= BREACH.T_SETTLE)
      ? getTelemetryS06(tt + (mid - tt) / 2).speed
      : Math.abs(breachCenterVel(tt + (mid - tt) / 2)[0]);
    I += v * (mid - tt);
  }
  _parCache[key] = I;
  return I;
}
function wrapRange(v, lo, hi) {
  const m = hi - lo;
  return ((((v - lo) % m) + m) % m) + lo;
}

// ---- วาดวาฬ (Opus ก1–ก5, ข14) ----
let _whaleOff = null;
function whaleOffscreen() {
  if (!_whaleOff) {
    _whaleOff = document.createElement('canvas');
    _whaleOff.width = W; _whaleOff.height = H;
  }
  return _whaleOff;
}

function drawWhale(ctx, pts, t) {
  const phi = rollPhi(t);
  const rollK = 0.95 + 0.05 * Math.abs(Math.cos(phi)); // ก4: บีบหนาต่ำสุด 0.95
  const bellyShift = -Math.cos(phi); // ก4: แถบท้องเลื่อนตาม −cos(roll)
  const curve = sampleSpline(pts, 6);
  const n = curve.length;
  const T = [], N = [];
  for (let i = 0; i < n; i++) {
    const a = curve[Math.max(0, i - 1)], b = curve[Math.min(n - 1, i + 1)];
    const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy) || 1;
    T.push([dx / len, dy / len]);
    N.push([-dy / len, dx / len]);
  }
  const wAt = (i) => Math.max(2, bodyWidthOpus(i / (n - 1))) * rollK;
  const off = (i, a) => [curve[i][0] + N[i][0] * wAt(i) * a, curve[i][1] + N[i][1] * wAt(i) * a];
  const att = (u, s) => {
    const x = clamp01(u) * (n - 1);
    const i0 = Math.max(0, Math.min(n - 2, Math.floor(x)));
    const f = x - i0;
    const px = curve[i0][0] + (curve[i0 + 1][0] - curve[i0][0]) * f;
    const py = curve[i0][1] + (curve[i0 + 1][1] - curve[i0][1]) * f;
    const ti = T[Math.max(0, Math.min(n - 1, Math.round(x)))];
    const ni = N[Math.max(0, Math.min(n - 1, Math.round(x)))];
    const w = Math.max(2, bodyWidthOpus(clamp01(u))) * rollK;
    return { x: px + ni[0] * w * s, y: py + ni[1] * w * s, ang: Math.atan2(ti[1], ti[0]), tx: ti[0], ty: ti[1], nx: ni[0], ny: ni[1] };
  };
  // เส้นขอบ (quadratic ผ่านจุดกึ่งกลาง) สำหรับ clip ร่องใต้คาง
  const outlinePts = [];
  for (let i = 0; i < n; i++) outlinePts.push(off(i, -1));
  for (let i = n - 1; i >= 0; i--) outlinePts.push(off(i, 1));

  function finShape(c, u, s, dark) {
    const b = att(u, s);
    const dir = b.ang + (s > 0 ? 0.9 : -0.9);
    const dx = Math.cos(dir), dy = Math.sin(dir);
    const px = -dy, py = dx;
    const L = 0.3 * BREACH.L; // ครีบยาว 0.3L = 90 px (Opus ก3)
    const lead = [], trail = [];
    for (let k = 0; k <= 6; k++) {
      const f = k / 6;
      const cxp = b.x + dx * L * f, cyp = b.y + dy * L * f;
      const w = 14 * Math.pow(1 - f, 0.8) + 1;
      const bump = 2.5 * Math.sin(f * Math.PI * 5.5) * (1 - f); // หยักตุ่ม 5–6 ลูก
      lead.push([cxp + px * (w + bump), cyp + py * (w + bump)]);
      trail.push([cxp - px * w * 0.7, cyp - py * w * 0.7]);
    }
    c.fillStyle = dark ? '#1a3049' : '#24405e';
    c.beginPath();
    c.moveTo(lead[0][0], lead[0][1]);
    for (const p of lead.slice(1)) c.lineTo(p[0], p[1]);
    for (let i = trail.length - 1; i >= 0; i--) c.lineTo(trail[i][0], trail[i][1]);
    c.closePath(); c.fill();
  }

  function whaleBody(c) {
    // ครีบฝั่งไกลก่อนลำตัวเมื่อ roll > 90° (Opus ก4)
    if (phi > Math.PI / 2) finShape(c, 0.30, -0.6, true);
    // แถบสี 4 stop ตามแนว N (Opus ก1): หลังเข้ม → ท้องสว่าง (วาฬหลังค่อมจริง)
    const bellyEdge = Math.max(0.45, Math.min(0.85, 0.65 + 0.15 * bellyShift));
    function band(a0, a1, color) {
      c.fillStyle = color;
      c.beginPath();
      const top = [], bot = [];
      for (let i = 0; i < n; i++) top.push(off(i, a0));
      for (let i = n - 1; i >= 0; i--) bot.push(off(i, a1));
      smoothPath(c, top.concat(bot));
      c.closePath(); c.fill();
    }
    band(-1, -0.45, '#18283a'); // หลัง (เข้มสุด)
    band(-0.45, 0.1, '#2e4a68'); // กลาง-หลัง
    band(0.1, bellyEdge, '#55728e'); // กลาง-ท้อง
    band(bellyEdge, 1, '#b9c6d2'); // ท้อง (สว่างสุด)
    // Rim Light: เส้นสว่างตามขอบหลังครึ่งบน (Opus ก1)
    c.strokeStyle = 'rgba(190,225,255,0.35)'; c.lineWidth = 2; c.beginPath();
    const back = [];
    for (let i = 0; i < n; i++) back.push(off(i, -1));
    smoothPath(c, back);
    c.stroke();
    // หาง fluke — เลนส์บาง (Opus ก3): หนา 0.03L, กางเป็นปีกเมื่อ roll > 30°
    {
      const tail = pts[11];
      const tAng = Math.atan2(T[n - 1][1], T[n - 1][0]);
      const spread = phi > Math.PI / 6 ? 1.3 : 1.0;
      c.fillStyle = '#24405e';
      for (const s of [-1, 1]) {
        const a1 = tAng + s * 0.5 * spread;
        const dx = Math.cos(a1), dy = Math.sin(a1);
        const px = -dy, py = dx;
        const tip = [tail[0] + dx * 30, tail[1] + dy * 30];
        c.beginPath();
        c.moveTo(tail[0], tail[1]);
        c.quadraticCurveTo(tail[0] + dx * 15 + px * 4.5, tail[1] + dy * 15 + py * 4.5, tip[0], tip[1]);
        c.quadraticCurveTo(tail[0] + dx * 15 - px * 4.5, tail[1] + dy * 15 - py * 4.5, tail[0], tail[1]);
        c.closePath(); c.fill();
      }
    }
    // ครีบข้างฝั่งใกล้ (หลังลำตัว)
    if (phi <= Math.PI / 2) finShape(c, 0.30, -0.6, true);
    finShape(c, 0.30, 0.6, false);
    // ตา — attach(0.12, +0.2) (Opus ก2)
    {
      const e = att(0.12, 0.2);
      c.fillStyle = '#fff'; c.beginPath(); c.arc(e.x, e.y, 5, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#111'; c.beginPath(); c.arc(e.x + e.tx, e.y + e.ty, 2.5, 0, Math.PI * 2); c.fill();
    }
    // ปากโค้ง attach(0,−0.1) → attach(0.22,−0.35) (Opus ก3)
    {
      const m0 = att(0, -0.1), m1 = att(0.22, -0.35), mc = att(0.11, -0.3);
      c.strokeStyle = 'rgba(20,30,45,0.8)'; c.lineWidth = 2.5; c.beginPath();
      c.moveTo(m0.x, m0.y); c.quadraticCurveTo(mc.x, mc.y, m1.x, m1.y); c.stroke();
    }
    // ร่องใต้คาง 7 เส้น u=0.03–0.45, clip ด้วยโครงร่างตัว (Opus ก3)
    c.save();
    c.beginPath();
    smoothPath(c, outlinePts);
    c.closePath(); c.clip();
    c.strokeStyle = 'rgba(20,35,55,0.35)'; c.lineWidth = 2;
    for (let k = 0; k < 7; k++) {
      const u = 0.03 + (0.45 - 0.03) * k / 6;
      const g0 = att(u, 0.45), g1 = att(u, 1.0);
      c.beginPath(); c.moveTo(g0.x, g0.y); c.lineTo(g1.x, g1.y); c.stroke();
    }
    c.restore();
    // (ลบเส้นขาวกลางลำตัวของ v2 ทิ้ง — Opus ก3: เหมือนรอยพับกระดาษ)
  }

  // ---- วาดลง offscreen (เพื่อทำ wet overlay แบบ source-atop + motion blur) ----
  // หมายเหตุ: ชื่อ offc ไม่ใช่ off — ในฟังก์ชันนี้มีตัวช่วยโครงร่างชื่อ off อยู่แล้ว (บรรทัด ~172)
  const offc = whaleOffscreen();
  const oc = offc.getContext('2d');
  oc.setTransform(1, 0, 0, 1, 0, 0);
  oc.clearRect(0, 0, W, H);
  oc.setTransform(ctx.getTransform());
  const v = breachCenterVel(t);
  const speed = Math.hypot(v[0], v[1]);
  if (speed > 300) {
    // ข14: วาดซ้ำ 6 ครั้งย้อนทิศความเร็ว −v·dt·k/6 เฉพาะ |v|>300 (ไม่เบลอฉาก)
    const dt = 1 / 30;
    for (let k = 0; k < 6; k++) {
      oc.save();
      oc.translate(-v[0] * dt * k / 6, -v[1] * dt * k / 6);
      oc.globalAlpha = k === 0 ? 1.0 : 0.18;
      whaleBody(oc);
      oc.restore();
    }
  } else {
    whaleBody(oc);
  }
  // ก5: สีทับเฉพาะส่วนใต้น้ำ (source-atop) — เข้มขึ้นตามความลึก
  oc.save();
  oc.beginPath(); oc.rect(-150, WATER_Y, 1020, 2000); oc.clip();
  oc.globalCompositeOperation = 'source-atop';
  const wet = oc.createLinearGradient(0, WATER_Y, 0, SAND_Y);
  wet.addColorStop(0, 'rgba(15,55,85,0.35)');
  wet.addColorStop(1, 'rgba(15,55,85,0.75)');
  oc.fillStyle = wet; oc.fillRect(-150, WATER_Y, 1020, 2000);
  oc.restore();
  // ก5: ความเปียก 0.6 วิแรกหลังพ้นน้ำ — เส้นเงาสะท้อนจาง exp(−t/0.3) + หยดน้ำร่วง
  const ev0 = breachEvents();
  const wetAge = t - ev0.tHeadCross;
  if (wetAge >= 0 && wetAge < 0.6) {
    const a = Math.exp(-wetAge / 0.3);
    oc.save();
    oc.strokeStyle = `rgba(255,255,255,${0.5 * a})`; oc.lineWidth = 3; oc.beginPath();
    const back = [];
    for (let i = 0; i < n; i++) back.push(off(i, -1));
    smoothPath(oc, back);
    oc.stroke();
    oc.fillStyle = `rgba(220,240,255,${0.6 * (1 - wetAge / 0.6)})`;
    for (let k = 0; k < 5; k++) {
      const u = 0.3 + 0.1 * k;
      const d = att(u, 1.0);
      oc.beginPath(); oc.arc(d.x, d.y + 10 + wetAge * 250, 2, 0, Math.PI * 2); oc.fill();
    }
    oc.restore();
  }
  // ประกอบกลับเฟรมหลัก (1:1 — offscreen อยู่ในพิกัดจอแล้ว)
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(offc, 0, 0);
  ctx.restore();
}

// วาดอนุภาคเป็นเส้นแคปซูลยืดตามความเร็ว (A6) — ไม่ใช่เม็ดกลมรัศมีคงที่
function drawCapsule(ctx, x, y, vx, vy, color, width) {
  const k = 0.03; // ความยาวเส้น = |v|·0.03 วิ (≈16 px ที่ 540 px/s)
  ctx.strokeStyle = color; ctx.lineWidth = width; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - vx * k, y - vy * k); ctx.stroke();
}

// รัศมีอนุภาค log-normal 0.8–4 px (Opus ก8) — deterministic จาก index
function particleRadius(i) {
  const f = Math.abs(Math.sin(i * 12.9898) * 43758.5453) % 1;
  return 0.8 + 3.2 * f * f;
}

// เมฆกลุ่มวงกลมซ้อน radial gradient 7 วง (Opus ก7) + parallax offset
function drawCloud(ctx, bx, by, s, offX) {
  const cx = wrapRange(bx + offX, -150, 870);
  const puffs = [[0, 0, 42, 0.85], [38, -12, 34, 0.7], [-38, -8, 30, 0.65], [70, 4, 24, 0.55], [-70, 6, 22, 0.5], [15, -22, 26, 0.6], [-15, -20, 20, 0.5]];
  for (const [ox, oy, r, a] of puffs) {
    const g = ctx.createRadialGradient(cx + ox * s, by + oy * s, r * 0.2, cx + ox * s, by + oy * s, r * s);
    g.addColorStop(0, `rgba(255,255,255,${a})`);
    g.addColorStop(0.7, `rgba(255,255,255,${a * 0.6})`);
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(cx + ox * s, by + oy * s, r * s, 0, Math.PI * 2); ctx.fill();
  }
}

// timecode แบบ HUD: 00:01.50 | F045
function formatTimecode(t) {
  const m = String(Math.floor(t / 60)).padStart(2, '0');
  const s = (t % 60).toFixed(2).padStart(5, '0');
  const f = String(Math.round(t * 30)).padStart(3, '0');
  return `${m}:${s} | F${f}`;
}

// โฟมวงขอบไม่สม่ำเสมอ (ไม่ใช่เป้าเล็งขอบเรียบ)
function drawFoam(ctx, ww, t) {
  const poly = (rx, ry) => {
    ctx.beginPath();
    for (let k = 0; k <= 40; k++) {
      const a = (k / 40) * Math.PI * 2;
      const rr = 1 + 0.12 * Math.sin(5 * a + t * 3) + 0.08 * Math.cos(3 * a - t * 2);
      const px = ww.x + Math.cos(a) * rx * rr, py = ww.y + Math.sin(a) * ry * rr;
      k === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
    }
    ctx.closePath();
  };
  ctx.fillStyle = `rgba(255,255,255,${0.18 * ww.alpha})`;
  poly(ww.radius, ww.radius * 0.28); ctx.fill();
  ctx.strokeStyle = `rgba(255,255,255,${0.85 * ww.alpha})`; ctx.lineWidth = 4;
  poly(ww.radius, ww.radius * 0.28); ctx.stroke();
  ctx.strokeStyle = `rgba(255,255,255,${0.5 * ww.alpha})`; ctx.lineWidth = 2;
  poly(ww.radius * 0.65, ww.radius * 0.18); ctx.stroke();
}

function drawFrame(t) {
  const tStart = performance.now();
  const canvas = document.getElementById('c');
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, W, H);
  const pts = whalePointsS06(t);
  const head = pts[0];
  const tel = getTelemetryS06(t);
  const parts = particleState(t);
  const ev = breachEvents();
  const breachMode = t >= BREACH.T_LAUNCH && t <= BREACH.T_REENTRY;
  const cam = cameraFor(t);
  stepHeightfield(t);
  const parI = parallaxIntegral(t);

  // ---- ฝั่งขวา RENDER (กล้องใหม่) ----
  ctx.save();
  ctx.beginPath(); ctx.rect(SPLIT, 0, W - SPLIT, H); ctx.clip();
  ctx.translate(SPLIT + (W - SPLIT) / 2, H / 2);
  ctx.scale(cam.scale, cam.scale);
  ctx.translate(-cam.cx, -cam.cy);
  // ท้องฟ้า 5 stop + ฝ้าใกล้ขอบฟ้า (Opus ก7)
  const sky = ctx.createLinearGradient(0, 0, 0, WATER_Y);
  sky.addColorStop(0, '#cfeaf7'); sky.addColorStop(0.35, '#a8d4ea'); sky.addColorStop(0.65, '#7fb8d8');
  sky.addColorStop(0.85, '#5d9cc4'); sky.addColorStop(1, '#dceef5');
  ctx.fillStyle = sky; ctx.fillRect(-150, -600, 1020, 3100);
  // เมฆ (parallax f=0.3 — เลื่อนตามความเร็ววาฬ)
  drawCloud(ctx, 180, 330, 1.0, -parI * 0.3);
  drawCloud(ctx, 430, 380, 1.2, -parI * 0.3);
  drawCloud(ctx, 600, 300, 0.9, -parI * 0.3);
  // น้ำ (ใต้ผิว Gerstner + heightfield + sine 3 ชุด)
  ctx.beginPath(); ctx.moveTo(-150, 1900);
  for (let x = -150; x <= 870; x += 4) {
    const [xp, y] = surfacePoint(x, t);
    ctx.lineTo(xp, y);
  }
  ctx.lineTo(870, 1900); ctx.closePath();
  const sea = ctx.createLinearGradient(0, WATER_Y, 0, 1900);
  sea.addColorStop(0, '#2f7fb0'); sea.addColorStop(0.35, '#1d5a86'); sea.addColorStop(1, '#0a2f4d');
  ctx.fillStyle = sea; ctx.fill();
  // เส้นผิวน้ำไฮไลต์
  ctx.strokeStyle = 'rgba(255,255,255,0.75)'; ctx.lineWidth = 2.5; ctx.beginPath();
  for (let x = -150; x <= 870; x += 4) {
    const [xp, y] = surfacePoint(x, t);
    x === -150 ? ctx.moveTo(xp, y) : ctx.lineTo(xp, y);
  }
  ctx.stroke();
  // God rays — polygon แบบ lighter แกว่งมุม 0.03·sin(0.3t) (Opus ก7)
  {
    let crestX = 360, crestH = -Infinity;
    for (let x = 120; x <= 660; x += 20) {
      const [xp, h] = gerstnerPoint(x, t);
      if (h > crestH) { crestH = h; crestX = xp; }
    }
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let j = 0; j < 3; j++) {
      const sway = 30 * Math.sin(0.3 * t + j * 2.1);
      const g = ctx.createLinearGradient(0, WATER_Y, 0, 1900);
      g.addColorStop(0, 'rgba(255,255,255,0.08)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(crestX - 50 + j * 50 - 13, WATER_Y);
      ctx.lineTo(crestX - 50 + j * 50 + 13, WATER_Y);
      ctx.lineTo(crestX - 50 + j * 50 + 73 + sway, 1900);
      ctx.lineTo(crestX - 50 + j * 50 + 47 + sway, 1900);
      ctx.closePath(); ctx.fill();
    }
    ctx.restore();
  }
  // พื้นทราย + หอยเชลล์ + ไข่มุกทอง (+ Echo ring)
  drawShell(ctx, t);
  // marine snow — อยู่ใต้น้ำเท่านั้น, parallax f=1.0 วนกลับ (Opus ข1)
  ctx.fillStyle = 'rgba(220,240,255,0.8)';
  for (const p of parts.snow) {
    const x = wrapRange(p.x - parI * 1.0, 0, W);
    if (p.y < WATER_Y) continue;
    ctx.beginPath(); ctx.arc(x, p.y, 2.2, 0, Math.PI * 2); ctx.fill();
  }
  // โซนาร์ 3 ระลอก — คลิปในกรอบน้ำ + alpha exp(−r/300) (Opus ข12)
  ctx.save();
  ctx.beginPath(); ctx.rect(-150, WATER_Y, 1020, SAND_Y - WATER_Y); ctx.clip();
  for (const t0 of SONAR_T0) {
    const age = t - t0;
    if (age < 0 || age > 1.6) continue;
    const r = 30 + age * 300;
    ctx.strokeStyle = `rgba(120,230,255,${Math.exp(-r / 300) * 0.8})`;
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(head[0], head[1], r, 0, Math.PI * 2); ctx.stroke();
  }
  ctx.restore();
  // วาฬ (ระบบวาดใหม่รอบ 2 — offscreen + wet + motion blur)
  drawWhale(ctx, pts, t);
  // ชั้นหน้าสาหร่าย (parallax f=1.3 — Opus ข1)
  {
    ctx.fillStyle = 'rgba(10,45,35,0.75)';
    for (let k = 0; k < 3; k++) {
      const bx = wrapRange(60 + k * 300 - parI * 1.3, -150, 870);
      ctx.beginPath();
      ctx.moveTo(bx, SAND_Y + 60);
      ctx.quadraticCurveTo(bx - 18, SAND_Y - 40, bx + 8, SAND_Y - 110);
      ctx.quadraticCurveTo(bx + 26, SAND_Y - 40, bx + 22, SAND_Y + 60);
      ctx.closePath(); ctx.fill();
    }
  }
  // น้ำพุ Apex — จุดกำเนิดคงที่ที่ blowhole ตอน Apex (พิกัดโลก ไม่ตามหัว — Opus ข10)
  // ปล่อยเฉพาะ t ∈ [T_APEX, T_APEX+1.1]; อนุภาคที่จมต่ำกว่าผิวน้ำถูกตัดทิ้ง
  if (t >= BREACH.T_APEX && t <= BREACH.T_APEX + 1.1) {
    const fade = 1 - (t - BREACH.T_APEX) / 1.1;
    const ap = particleState(t - BREACH.T_APEX);
    const bh = whalePointsS06(BREACH.T_APEX)[0]; // blowhole ≈ หัวตอน Apex
    ap.spout.forEach((p, i) => {
      const x = bh[0] + (p.x - 360), y = bh[1] + (p.y - 700);
      if (y > WATER_Y + 2) return;
      drawCapsule(ctx, x, y, p.vx, p.vy, `rgba(235,245,255,${0.95 * fade})`, Math.max(1.5, particleRadius(i)));
      if (i % 10 === 0) { // ละอองหมอกวงนุ่ม r 10–30 px alpha ~0.12 (Opus ก8)
        ctx.fillStyle = `rgba(235,245,255,${0.12 * fade})`;
        ctx.beginPath(); ctx.arc(x, y, 10 + (i % 3) * 10, 0, Math.PI * 2); ctx.fill();
      }
    });
  }
  // Beat 2: splash ตอนทะลุผิวขาขึ้น — จุดกำเนิดคงที่ (crossX, WATER_Y)
  if (t >= ev.tHeadCross && t < ev.tHeadCross + 2.0) {
    const age = t - ev.tHeadCross;
    const sp = particleState(age);
    sp.splash.forEach((p, i) => {
      const x = ev.crossX + (p.x - 360), y = WATER_Y + (p.y - 900);
      if (y > WATER_Y + 2) return;
      drawCapsule(ctx, x, y, p.vx, p.vy, `rgba(255,255,255,${0.95 * Math.max(0, 1 - age / 1.5)})`, Math.max(1.5, particleRadius(i)));
    });
  }
  // Beat 2: splash ตอนกลับลงน้ำ — เริ่มที่ tHeadDownCross (หัวแตะผิวน้ำจริง)
  if (t >= ev.tHeadDownCross) {
    const age = t - ev.tHeadDownCross;
    const sp = particleState(age);
    sp.splash.forEach((p, i) => {
      const x = ev.reentryHeadX + (p.x - 360), y = WATER_Y + (p.y - 900);
      if (y > WATER_Y + 2) return;
      drawCapsule(ctx, x, y, p.vx, p.vy, `rgba(255,255,255,${0.95 * Math.max(0, 1 - age / 1.5)})`, Math.max(1.5, particleRadius(i)));
    });
  }
  // (Beat 1 ไม่มีน้ำพุ — blowhole อยู่ลึก ~290 px ใต้ผิวน้ำ เงื่อนไข
  //  blowhole.y < WATER_Y+5 ไม่เคยเป็นจริงตอนว่ายน้ำ — Opus ข10)
  // White Water: โฟมตรงจุดทะลุจริงทั้งขาขึ้นและขาลง (Opus ข9)
  const ww = breachWhiteWater(t);
  if (ww) drawFoam(ctx, ww, t);
  const ww2 = breachWhiteWaterReentry(t);
  if (ww2) drawFoam(ctx, ww2, t);
  if (breachMode) {
    // Cavity: รอยน้ำขาวใต้ตัววาฬระหว่างบิน
    ctx.fillStyle = 'rgba(255,255,255,0.13)';
    ctx.beginPath(); ctx.ellipse((ev.crossX + ev.reentryCenter[0]) / 2, WATER_Y + 12, Math.abs(ev.reentryCenter[0] - ev.crossX) / 2 + 40, 16, 0, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();

  // ---- POLISH (ขั้นที่ 5 — โค้ดบีน): เฉพาะฝั่งขวา RENDER เท่านั้น ----
  // (CA เก็บไว้เหมือน v2 ตามที่ล็อก — Opus ให้ลบ แต่ฟิลิปสั่งเก็บไว้)
  if (typeof applyPolish === 'function') {
    const img = ctx.getImageData(SPLIT, 0, W - SPLIT, H);
    applyPolish(img.data, W - SPLIT, H, t, tel.speed);
    ctx.putImageData(img, SPLIT, 0);
  }

  // ---- เส้นแบ่ง ----
  ctx.fillStyle = '#0a0f14'; ctx.fillRect(SPLIT - 2, 0, 4, H);

  // ---- ฝั่งซ้าย DRAWING — 3 กล่อง ----
  ctx.fillStyle = '#0e1a26'; ctx.fillRect(0, 0, SPLIT, H);
  ctx.strokeStyle = 'rgba(120,180,220,0.12)'; ctx.lineWidth = 1;
  for (let gx = 0; gx <= SPLIT; gx += 34) { ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, H); ctx.stroke(); }
  for (let gy = 0; gy <= H; gy += 34) { ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(SPLIT, gy); ctx.stroke(); }
  // เส้นแบ่งกล่อง
  ctx.strokeStyle = 'rgba(120,180,220,0.35)'; ctx.lineWidth = 1.5;
  for (const gy of [115, 780]) { ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(SPLIT, gy); ctx.stroke(); }

  // กล่อง 1 — Header (y 0–115)
  ctx.save(); ctx.beginPath(); ctx.rect(0, 0, SPLIT, 115); ctx.clip();
  ctx.fillStyle = '#9fd8ff'; ctx.font = 'bold 21px monospace'; ctx.textAlign = 'left';
  ctx.fillText('DRAWING', 16, 44);
  if (DEBUG) {
    ctx.font = '15px monospace'; ctx.fillStyle = '#6fa8cc';
    ctx.fillText('spine 12 pts + telemetry', 16, 68);
    ctx.fillText(breachMode ? 'BREACH MODE — parabola' : 'travelling wave', 16, 88);
  }
  ctx.restore();

  // กล่อง 2 — Viewport (y 120–760)
  ctx.save(); ctx.beginPath(); ctx.rect(0, 120, SPLIT, 640); ctx.clip();
  // เส้นผิวน้ำ + พื้นทรายบนแผง
  ctx.strokeStyle = 'rgba(120,230,255,0.5)'; ctx.lineWidth = 1.5; ctx.setLineDash([6, 4]);
  ctx.beginPath(); ctx.moveTo(16, my(WATER_Y)); ctx.lineTo(258, my(WATER_Y)); ctx.stroke();
  ctx.strokeStyle = 'rgba(200,160,100,0.5)';
  ctx.beginPath(); ctx.moveTo(16, my(SAND_Y)); ctx.lineTo(258, my(SAND_Y)); ctx.stroke();
  ctx.setLineDash([]);
  if (DEBUG) {
    ctx.fillStyle = '#6fa8cc'; ctx.font = '11px monospace';
    ctx.fillText('water y=760', 16, my(WATER_Y) - 5);
  }
  // วิถีพาราโบลา (DEBUG เท่านั้น — เป็น overlay ดีบัก)
  if (DEBUG && t >= BREACH.T_PRE) {
    ctx.strokeStyle = 'rgba(255,209,102,0.45)'; ctx.lineWidth = 1.5; ctx.beginPath();
    for (let tt = BREACH.T_LAUNCH; tt <= BREACH.T_REENTRY; tt += 0.05) {
      const c = breachCenter(tt);
      tt === BREACH.T_LAUNCH ? ctx.moveTo(mx(c[0]), my(c[1])) : ctx.lineTo(mx(c[0]), my(c[1]));
    }
    ctx.stroke();
    const ac = ev.apexCenter;
    ctx.fillStyle = '#ffd166';
    ctx.beginPath(); ctx.moveTo(mx(ac[0]), my(ac[1]) - 7); ctx.lineTo(mx(ac[0]) + 6, my(ac[1])); ctx.lineTo(mx(ac[0]), my(ac[1]) + 7); ctx.lineTo(mx(ac[0]) - 6, my(ac[1])); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#ffd166'; ctx.font = '12px monospace';
    ctx.fillText('APEX', mx(ac[0]) + 10, my(ac[1]) - 4);
  }
  // โครงกระดูก spine 12 จุด
  ctx.strokeStyle = '#ffd166'; ctx.lineWidth = 2.5; ctx.beginPath();
  pts.forEach((p, i) => i === 0 ? ctx.moveTo(mx(p[0]), my(p[1])) : ctx.lineTo(mx(p[0]), my(p[1])));
  ctx.stroke();
  // จุดข้อต่อ (ตัวเลข DEBUG เท่านั้น วางแบบ greedy ไม่ทับกัน — Opus ง3)
  const SHOWN_JOINTS = [0, 3, 6, 9, 11];
  const placed = [];
  function rectsOverlap(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }
  pts.forEach((p, i) => {
    ctx.fillStyle = i === 0 ? '#ff5d5d' : '#ffd166';
    ctx.beginPath(); ctx.arc(mx(p[0]), my(p[1]), i === 0 ? 6 : 4.5, 0, Math.PI * 2); ctx.fill();
    if (!DEBUG || !SHOWN_JOINTS.includes(i)) return;
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    const dx = mx(b[0]) - mx(a[0]), dy = my(b[1]) - my(a[1]);
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len, ny = dx / len;
    const bx = mx(p[0]) + nx * 11, by = my(p[1]) + ny * 11;
    const cands = [[8, -8], [8, 12], [-24, -8], [-24, 12]];
    for (const [ox, oy] of cands) {
      const box = { x: bx + ox - 4, y: by + oy - 8, w: 16, h: 14 };
      if (box.x < 2 || box.x + box.w > SPLIT - 2 || box.y < 122 || box.y + box.h > 758) continue;
      if (placed.some((q) => rectsOverlap(box, q))) continue;
      placed.push(box);
      ctx.fillStyle = '#9fd8ff'; ctx.font = '11px monospace';
      ctx.fillText(String(i), bx + ox, by + oy + 4);
      break;
    }
  });
  // วงโซนาร์บนแผง Drawing (วงกลม — สเกลเท่ากันสองแกนแล้ว ไม่ใช่วงรี)
  let activePing = 0;
  for (let i = 0; i < SONAR_T0.length; i++) {
    const age = t - SONAR_T0[i];
    if (age < 0 || age > 1.6) continue;
    activePing = i + 1;
    const r = 30 + age * 300;
    ctx.strokeStyle = `rgba(120,230,255,${Math.exp(-r / 300) * 0.8})`;
    ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(mx(head[0]), my(head[1]), r * PANEL_S, 0, Math.PI * 2); ctx.stroke();
  }
  if (DEBUG) {
    ctx.fillStyle = '#6fa8cc'; ctx.font = '13px monospace';
    ctx.fillText('head 0 (red) -> tail 11', 16, 140);
  }
  // หอยเชลล์แบบย่อ
  drawShellPanel(ctx, t, mx, my);
  // กราฟ y(t)/v(t) ตรงช่องว่างใต้แผง (Opus ค6)
  {
    const gx0 = 16, gx1 = 258, gy0 = 600, gy1 = 748;
    ctx.strokeStyle = 'rgba(120,180,220,0.35)'; ctx.lineWidth = 1;
    ctx.strokeRect(gx0, gy0, gx1 - gx0, gy1 - gy0);
    ctx.fillStyle = '#6fa8cc'; ctx.font = '10px monospace';
    ctx.fillText('y(t) / v(t)', gx0 + 4, gy0 + 12);
    const X = (tt) => gx0 + (tt / 12) * (gx1 - gx0);
    const Yy = (yy) => gy1 - ((yy - 600) / (1200 - 600)) * (gy1 - gy0);
    const Yv = (vv) => gy1 - (Math.min(vv, 500) / 500) * (gy1 - gy0);
    ctx.strokeStyle = '#ffd166'; ctx.lineWidth = 1.5; ctx.beginPath();
    for (let tt = 0; tt <= 12; tt += 0.1) {
      const yy = breachCenter(tt)[1];
      tt === 0 ? ctx.moveTo(X(tt), Yy(yy)) : ctx.lineTo(X(tt), Yy(yy));
    }
    ctx.stroke();
    ctx.strokeStyle = '#78e6ff'; ctx.beginPath();
    for (let tt = 0; tt <= 12; tt += 0.1) {
      const vv = getTelemetryS06(tt).speed;
      tt === 0 ? ctx.moveTo(X(tt), Yv(vv)) : ctx.lineTo(X(tt), Yv(vv));
    }
    ctx.stroke();
    // จุดเวลาปัจจุบัน
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(X(t), Yy(breachCenter(t)[1]), 3, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(X(t), Yv(tel.speed), 3, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();

  // ป้าย SONAR PING / RE-ENTRY — อยู่ในกล่อง Header (y 108)
  // RE-ENTRY ยึด ev.tHeadDownCross (หัวแตะน้ำจริง) — v3 ไม่มีค่าคงที่ 10.02 แล้ว
  ctx.save(); ctx.beginPath(); ctx.rect(0, 0, SPLIT, 115); ctx.clip();
  if (activePing > 0) {
    ctx.fillStyle = '#78e6ff'; ctx.font = 'bold 15px monospace';
    ctx.fillText('SONAR PING ' + activePing, 16, 108);
  }
  if (t >= ev.tHeadDownCross) {
    ctx.fillStyle = '#ffb347'; ctx.font = 'bold 15px monospace';
    ctx.fillText('RE-ENTRY', 16, 108);
  }
  ctx.restore();

  // กล่อง 3 — Telemetry (y 780–1280)
  ctx.save(); ctx.beginPath(); ctx.rect(0, 780, SPLIT, 500); ctx.clip();
  ctx.fillStyle = '#9fd8ff'; ctx.font = 'bold 21px monospace';
  ctx.fillText('TELEMETRY', 16, 815);
  const gm = precomputedGaugeMax(); // เกจคำนวณล่วงหน้าทั้งคลิป — ไม่เปลี่ยนกลางคลิป (Opus ง4)
  const rows = [
    ['SPEED', (tel.speed / PX_PER_M).toFixed(1), 'm/s', Math.min(1, tel.speed / gm.speedMax)],
    ['PITCH', tel.pitch.toFixed(1), 'deg', Math.min(1, Math.abs(tel.pitch) / 90)],
    ['AMPL', tel.amplitude.toFixed(1), 'px', Math.min(1, Math.abs(tel.amplitude) / 30)],
    ['DRAG', tel.drag.toFixed(0), 'N', Math.min(1, tel.drag / gm.dragMax)],
  ];
  let y = 857;
  for (const [label, num, unit, frac] of rows) {
    ctx.fillStyle = '#cfe9ff'; ctx.font = '18px monospace';
    ctx.fillText(label, 16, y);
    ctx.fillStyle = '#fff'; ctx.font = 'bold 18px monospace';
    ctx.fillText(num, 118, y);
    const numW = ctx.measureText(num).width;
    ctx.fillStyle = '#6fa8cc'; ctx.font = '12px monospace';
    ctx.fillText(unit, 118 + numW + 6, y);
    ctx.fillStyle = 'rgba(159,216,255,0.25)'; ctx.fillRect(16, y + 10, 242, 8);
    ctx.fillStyle = '#ffd166'; ctx.fillRect(16, y + 10, 242 * Math.max(0, frac), 8);
    y += 56;
  }
  if (DEBUG) {
    ctx.fillStyle = '#6fa8cc'; ctx.font = '13px monospace';
    ctx.fillText('drag = ½ρCdA·v² — live', 16, y + 6);
    ctx.fillText(breachMode ? 'breach mode: v from parabola' : 'swim mode: v from spine', 16, y + 26);
    ctx.fillText('S06 v3 — 12s, Canvas 2D, 720p', 16, H - 24);
  }
  ctx.restore();

  // ---- HUD Tag ฝั่งขวา: แถบ accent ฟ้า 3px + timecode ----
  ctx.fillStyle = 'rgba(10,20,30,0.55)'; ctx.fillRect(SPLIT + 12, 12, 150, 34);
  ctx.fillStyle = '#6fa8cc'; ctx.fillRect(SPLIT + 12, 12, 3, 34);
  ctx.fillStyle = '#fff'; ctx.font = 'bold 20px monospace'; ctx.fillText('RENDER', SPLIT + 24, 37);
  ctx.fillStyle = 'rgba(10,20,30,0.55)'; ctx.fillRect(SPLIT + 12, H - 52, 230, 34);
  ctx.fillStyle = '#6fa8cc'; ctx.fillRect(SPLIT + 12, H - 52, 3, 34);
  ctx.fillStyle = '#fff'; ctx.font = '19px monospace';
  ctx.fillText(formatTimecode(t), SPLIT + 24, H - 28);
  window.__drawMs = performance.now() - tStart;
  window.__done = true;
}
window.drawFrame = drawFrame;
window.__done = false;
