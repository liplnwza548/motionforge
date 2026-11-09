/**
 * whale60.js — MotionForge S06 60 วินาที: วาฬ (WhaleState + spine + วาด)
 * ดัดแปลงจาก s06-full-v3/draw.js + breach.js (อ่านอย่างเดียว ไม่แก้ต้นฉบับ)
 *  - travelling wave A(u) = L·(0.005 + 0.095·u³), ω = π, Δφ = 2π/11 (Vault V1)
 *  - arc-length correction ต่อข้อ + rescale ให้ยาวรวม = L = 300 เป๊ะ
 *  - วาดอวัยวะผูก Local Frame ของ spine (attach u/s) — ห้าม offset พิกัดโลกตายตัว
 *  - ห้ามใส่ตัวหนังสือดีบักในฟังก์ชันวาด
 * v2 (ข้อ 1+5): หัวมน (BODY_WIDTH_KNOTS u=0: 0->0.40), ครีบข้างใกล้ย้ายฐานลงฝั่งท้อง
 *  + ครีบข้างไกลลด 60% (90->36 px) ชี้ถอยหลัง-ลงทั้งคู่, ตุ่มสันหลัง u 0.66-0.78
 *  สูง 10 px บนขอบ s=+1, กลับด้านแถบสี (หลังเข้มบน/ท้องสว่างล่าง — v1 กลับด้านจน
 *  วาฬดูหงายท้อง), ร่องใต้ท้อง 10 เส้นฝั่งท้อง + Rim Light แนวสันหลัง (ช็อต 17-18 x1.6)
 *
 * อนุสัญญา pitch: องศาในพิกัดจอ (y ลง), บวก = หัวชี้ลง, ลบ = หัวชี้ขึ้น
 * spine nodes: node[0] = หัว, node[11] = หาง (local x: หัว −150 → หาง +150)
 */
'use strict';

let P60 = null;
if (typeof require !== 'undefined') {
  try { P60 = require('./physics60.js'); } catch (e) { P60 = null; }
}
if (!P60 && typeof globalThis !== 'undefined' && globalThis.PHYSICS60) P60 = globalThis.PHYSICS60;

function p60() {
  if (!P60) throw new Error('whale60.js needs physics60.js loaded first');
  return P60;
}
function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
function smooth01(v) { const x = clamp01(v); return x * x * (3 - 2 * x); }
const D2R = Math.PI / 180;

// ---- โครงกระดูกว่ายน้ำ local (หัวที่ x = −L/2) — สูตรเดียวกับ breach.js v3 ----
function localSpine(t, ampScale) {
  const P = p60();
  const L = P.L60, N = P.N60;
  const OMEGA = Math.PI, DPHI = (2 * Math.PI) / (N - 1), SEG = P.SEG60;
  const amp = ampScale === undefined ? 1 : ampScale;
  const pts = [];
  let x = -L / 2, prevY = 0;
  for (let i = 0; i < N; i++) {
    const u = i / (N - 1);
    const A = L * (0.005 + 0.095 * u * u * u) * amp;
    const y = A * Math.sin(OMEGA * t - i * DPHI);
    if (i > 0) {
      const dy = y - prevY;
      x += Math.sqrt(Math.max(SEG * SEG - dy * dy, 0));
    }
    pts.push([x, y]);
    prevY = y;
  }
  return pts; // node[0] = หัว (x ≈ −150), node[11] = หาง (x ≈ +150)
}

// ความยาวรวมของ spine (px)
function spineLength(pts) {
  let len = 0;
  for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  return len;
}

// spine nodes ในพิกัดโลก จาก (หัว, pitch, เวลา)
// หมุน local spine ด้วย pitch แล้วเลื่อนให้ node[0] ตรงหัวที่ให้มา,
// rescale แบบ uniform รอบหัวให้ความยาวรวมกลับเป็น L = 300 เป๊ะ
function computeSpineNodes(head, pitchDeg, t, ampScale) {
  const P = p60();
  const local = localSpine(t, ampScale);
  // หมุนด้วย pitch+180°: local +x ชี้จากหัวไปหาง (local หัวอยู่ที่ −150)
  // ส่วนทิศหัวในพิกัดโลกคือ (cos p, sin p) — ดังนั้นแกน local ต้องหมุน
  // อีกครึ่งรอบเพื่อให้หางอยู่ "ข้างหลัง" หัว (เหมือน breach.js v3 ที่
  // θ คือมุมของแกน local −x = ทิศหัว)
  const p = (pitchDeg + 180) * D2R;
  const cos = Math.cos(p), sin = Math.sin(p);
  const rot = local.map(([lx, ly]) => [lx * cos - ly * sin, lx * sin + ly * cos]);
  const h0 = rot[0];
  const shifted = rot.map(([x, y]) => [x - h0[0], y - h0[1]]);
  const k = P.L60 / Math.max(spineLength(shifted), 1e-9);
  return shifted.map(([x, y]) => [head[0] + x * k, head[1] + y * k]);
}

// ---- โปรไฟล์ความกว้างลำตัว (Opus ก1 — monotone cubic ผ่านจุดคุม, จาก breach.js) ----
// v2 ข้อ 1 (Blunt & Rounded Rostrum): หัวไม่แหลมแล้ว — ความกว้างที่จมูก u=0
// เป็น 0.40·WMAX (≈15 px ครึ่งกว้าง) แทน 0, คาง/ใต้ท้องหนาขึ้นที่ u=0.05–0.12
const BODY_WIDTH_KNOTS = [[0, 0.40], [0.05, 0.70], [0.12, 0.90], [0.25, 1.0], [0.5, 0.86], [0.75, 0.42], [0.9, 0.16], [1, 0.08]];
const WMAX60 = 37.5; // ครึ่งความกว้างสูงสุด = 0.125·L
function bodyWidth60(u) {
  const K = BODY_WIDTH_KNOTS;
  if (u <= 0) return K[0][1] * WMAX60;
  if (u >= 1) return K[K.length - 1][1] * WMAX60;
  for (let i = 0; i < K.length - 1; i++) {
    if (u <= K[i + 1][0]) {
      const s = smooth01((u - K[i][0]) / (K[i + 1][0] - K[i][0]));
      return (K[i][1] + (K[i + 1][1] - K[i][1]) * s) * WMAX60;
    }
  }
  return WMAX60;
}

// ---- ค่าคงที่ v2 ข้อ 1 + ข้อ 5 (สรีระวาฬ / คอนทราสต์) ----
// รากเหง้าที่เจอตอนดูเฟรมจริง (วัดพิกัดจาก F150): tangent T ชี้จากหัวไปหาง
// (ang ≈ -179° ตอนว่ายขวา) ดังนั้น s=+1 คือขอบบนของลำตัวบนจอ, s=-1 คือขอบล่าง
// แต่โค้ด v1 วางแถบสีไว้กลับด้าน: ท้องสว่าง+ร่องใต้ท้องอยู่ที่ s→+1 (ขอบบน)
// ครีบข้างใกล้ฐานอยู่ที่ s=+0.6 (ขอบบน) ทำให้ครีบกวาดพาดท้องสว่างเป็นแถบทแยง
// อ่านเป็นครีบหลัง + วาฬดูหงายท้อง (ท้องขาวอยู่บน หลังเข้มอยู่ล่าง) — นี่คือ
// ส่วนหนึ่งของ "อ่านเป็นโลมา/ฉลาม" ที่บรีฟข้อ 1 สั่งแก้ จึงกลับด้านแถบสี:
// หลังเข้มอยู่บน (s→+1), ท้องสว่าง+ร่องอยู่ล่าง (s→-1); ตา (s=+0.2, อยู่เหนือปาก)
// กับปาก (s=-0.1..-0.35) ถูกต้องอยู่แล้ว ไม่ต้องแตะ
// ครีบหลังเดิม (finShape ฝั่ง s=+0.6 ที่ u=0.30 ยาว 0.3L=90 px ชี้ขึ้น-หน้า
// จนอ่านเป็นครีบหลังฉลาม/โลมา) — ย้ายฐานครีบข้างใกล้ลงมาฝั่งท้อง (s=-0.6)
// ชี้ถอยหลัง-ลงเหมือนครีบข้างจริง + ครีบข้างไกลลด 60% เหลือ 36 px
const FAR_FIN_LEN_SCALE = 0.4;   // 90 px -> 36 px (-60%)
const FAR_FIN_W_SCALE = 0.45;    // ความกว้างครีบ 14 px -> ~6.3 px
// ทิศครีบ: tangent T ชี้จากหัวไปหาง (ang ≈ 180° ตอนว่ายขวา) ดังนั้นครีบที่ห้อย
// ถอยหลัง-ลงต้องใช้ dir = ang - 0.9 (เดิมโค้ดใช้ +0.9 สำหรับ s>0 ทำให้ครีบข้างใกล้
// กวาดขึ้นพ้นหลัง 70 px อ่านเป็นครีบหลังฉลาม/โลมา — วัดจากเฟรมจริง F150:
// ฐาน (430,616) -> ปลาย (374,545) ชี้ขึ้นพ้นหลังพอดี) — แก้เป็น -0.9 ทั้งสองข้าง
const FAR_FIN_DIR = -0.9;        // rad จาก tangent (ชี้ถอยหลัง-ลง เหมือนครีบข้างใกล้)
const DORSAL_HUMP_U0 = 0.66, DORSAL_HUMP_U1 = 0.78, DORSAL_HUMP_H = 13; // ตุ่มสันหลัง: u 0.66-0.78 (ค่อนไปทางโคนหาง) สูง 13 px ยาว ~36 px (v3: 10 -> 13 ตามคำตัดสิน Gemini — เห็นชัดในมุมมองปกติ แต่ยังมนไม่แหลมเป็นครีบฉลาม)
const BELLY_BRIGHT = '#dde7f0';  // ลายท้องสีขาวสว่างขึ้น (เดิม '#b9c6d2') — ข้อ 5
const BELLY_MID = '#5d7d9c';     // แถบกลางท้องสว่างขึ้นเล็กน้อย (เดิม '#55728e')
const VENTRAL_GROOVES = 10;      // ร่องใต้ท้อง 7 -> 10 เส้น (ข้อ 1: คาง/ร่องใต้ท้องมีมวลขึ้น)
const VENTRAL_U0 = 0.02, VENTRAL_U1 = 0.55; // ช่วงร่องใต้ท้อง (เดิม 0.03-0.45)
const RIM_ALPHA = 0.55, RIM_GOLD_ALPHA = 0.30; // Rim Light แนวสันหลัง (ข้อ 5)
const RIM_BOOST_SHOTS = [17, 18]; // ช็อต 17-18 เร่ง Rim Light x1.6
function rollPhi60(t) {
  const P = p60();
  const tB = P.BREACH60.T_BREACH, tT = P.headTouchTime();
  if (t < tB) return 0;
  if (t <= tT) return (Math.PI / 2) * ((t - tB) / (tT - tB));
  if (t < tT + 1.6) return (Math.PI / 2) * Math.exp(-(t - tT) / 0.8);
  return 0;
}
// แฟกเตอร์แอมพลิจูดคลื่นว่ายน้ำ: 1.0 ใต้น้ำ → 0.15 ตอนบิน → 1.0 หลังลงน้ำ
function waveAmp60(t) {
  const P = p60();
  const tB = P.BREACH60.T_BREACH, tT = P.headTouchTime();
  if (t < tB) return 1.0;
  if (t < tB + 0.5) return 1.0 + (0.15 - 1.0) * smooth01((t - tB) / 0.5);
  if (t <= tT) return 0.15;
  if (t < tT + 1.6) return 0.15 + (1.0 - 0.15) * smooth01((t - tT) / 1.6);
  return 1.0;
}

// spine nodes ณ เวลา t จากเส้นทางชั่วคราว (physics60) — ใช้ในเทสต์/กล้อง
function whaleSpineAt(t) {
  const P = p60();
  return computeSpineNodes(P.whaleHeadAt(t), P.whalePitchDegAt(t), t, waveAmp60(t));
}

// โครงร่างวาฬ (outline) — ขอบ ±ความกว้าง + ปลายหาง fluke 4 จุด (สูตร v3)
// ใช้ในเทสต์: ไม่หลุดขอบจอ / ไม่ทะลุทราย
function whaleOutlinePoints(t) {
  const pts = whaleSpineAt(t);
  const n = pts.length;
  const phi = rollPhi60(t);
  const rollK = 0.95 + 0.05 * Math.abs(Math.cos(phi));
  const out = [];
  for (const s of [-1, 1]) {
    for (let i = 0; i < n; i++) {
      const u = i / (n - 1);
      const w = Math.max(2, bodyWidth60(u)) * rollK;
      const p = pts[i];
      const aa = pts[Math.max(0, i - 1)], bb = pts[Math.min(n - 1, i + 1)];
      const dx = bb[0] - aa[0], dy = bb[1] - aa[1], len = Math.hypot(dx, dy) || 1;
      out.push([p[0] + (-dy / len) * w * s, p[1] + (dx / len) * w * s]);
    }
  }
  const tail = pts[11], prev = pts[10];
  const ang = Math.atan2(tail[1] - prev[1], tail[0] - prev[0]);
  for (const s of [-1, 1]) {
    const a1 = ang + s * 0.5, a2 = ang + s * 1.05;
    out.push([tail[0] + Math.cos(a1) * 30, tail[1] + Math.sin(a1) * 30]);
    out.push([tail[0] + Math.cos(a2) * 18, tail[1] + Math.sin(a2) * 18]);
  }
  return out;
}

// ---- WhaleState: คงค่ากระดูกสันหลังข้ามช็อต + warm-up 10–15 เฟรม ----
// Hard Cut 19 ช็อต: ถ้าเริ่มคำนวณ spine ใหม่ทุกช็อต วาฬจะดีดตัวตอนตัด.
// WhaleState เก็บ nodes ช็อตก่อนไว้; beginShot() แล้ว update() จะเกลี่ย
// จากท่าเก่าเข้าท่าใหม่แบบ smooth ตลอด warm-up (ค่าเริ่มต้น 12 เฟรม)
const WARMUP_FRAMES = 12;
class WhaleState {
  constructor() {
    this.nodes = null;      // 12 nodes ล่าสุด (พิกัดโลก)
    this.pitchDeg = 0;
    this.warmUpLeft = 0;
    this.t = 0;
  }
  reset() { this.nodes = null; this.pitchDeg = 0; this.warmUpLeft = 0; this.t = 0; }
  // เรียกตอนเริ่มช็อตใหม่ (ก่อนเรนเดอร์เฟรมแรกของช็อต)
  beginShot() { this.warmUpLeft = WARMUP_FRAMES; }
  // อุ่นเครื่องล่วงหน้า: รัน update เงียบๆ 12 เฟรมก่อนเวลา tStart แล้วคืน nodes
  // ที่ tStart — ใช้เมื่อต้องการท่าเข้าสู่สมดุลก่อนเรนเดอร์จริง
  warmUp(headAt, pitchAt, tStart) {
    const P = p60();
    const dt = 1 / P.FPS60;
    let nodes = this.nodes;
    for (let k = WARMUP_FRAMES; k >= 1; k--) {
      const tt = tStart - k * dt;
      nodes = this.update(headAt(tt), pitchAt(tt), tt);
    }
    return nodes;
  }
  // คำนวณ nodes เฟรมปัจจุบัน; ช่วง warm-up เกลี่ยจากท่าเดิม (smoothstep)
  update(head, pitchDeg, t, ampScale) {
    const target = computeSpineNodes(head, pitchDeg, t, ampScale);
    if (!this.nodes) { this.nodes = target; this.pitchDeg = pitchDeg; this.t = t; return target; }
    if (this.warmUpLeft > 0) {
      const k = smooth01(1 - this.warmUpLeft / WARMUP_FRAMES);
      this.nodes = this.nodes.map(([x, y], i) => [
        x + (target[i][0] - x) * k, y + (target[i][1] - y) * k,
      ]);
      this.warmUpLeft--;
    } else {
      this.nodes = target;
    }
    this.pitchDeg = pitchDeg;
    this.t = t;
    return this.nodes;
  }
}

// ---- วาดวาฬ (ดัดแปลงจาก drawWhale ใน draw.js v3 — ไม่แตะไฟล์ต้นฉบับ) ----
// ctx: Canvas 2D context; nodes: 12 spine nodes พิกัดโลก
// opts: { t, roll (rad), speed (px/s, สำหรับ motion blur), wet (0..1 ความเปียก) }
// หมายเหตุ: offscreen ใช้ได้เฉพาะในเบราว์เซอร์; ใน node (ไม่มี document)
// วาดตรงลง ctx เลย (ข้าม wet overlay + motion blur แบบ offscreen)
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
function smoothPath(ctx, pts) {
  if (!pts.length) return;
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length - 1; i++) {
    const mxp = (pts[i][0] + pts[i + 1][0]) / 2, myp = (pts[i][1] + pts[i + 1][1]) / 2;
    ctx.quadraticCurveTo(pts[i][0], pts[i][1], mxp, myp);
  }
  ctx.lineTo(pts[pts.length - 1][0], pts[pts.length - 1][1]);
}

function drawWhale60(ctx, nodes, opts) {
  const P = p60();
  const o = opts || {};
  const t = o.t || 0;
  const phi = o.roll !== undefined ? o.roll : rollPhi60(t);
  const rollK = 0.95 + 0.05 * Math.abs(Math.cos(phi));
  const bellyShift = -Math.cos(phi);
  const curve = sampleSpline(nodes, 6);
  const n = curve.length;
  const T = [], N = [];
  for (let i = 0; i < n; i++) {
    const a = curve[Math.max(0, i - 1)], b = curve[Math.min(n - 1, i + 1)];
    const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy) || 1;
    T.push([dx / len, dy / len]);
    N.push([-dy / len, dx / len]);
  }
  const wAt = (i) => Math.max(2, bodyWidth60(i / (n - 1))) * rollK;
  const off = (i, a) => [curve[i][0] + N[i][0] * wAt(i) * a, curve[i][1] + N[i][1] * wAt(i) * a];
  const att = (u, s) => {
    const x = clamp01(u) * (n - 1);
    const i0 = Math.max(0, Math.min(n - 2, Math.floor(x)));
    const f = x - i0;
    const px = curve[i0][0] + (curve[i0 + 1][0] - curve[i0][0]) * f;
    const py = curve[i0][1] + (curve[i0 + 1][1] - curve[i0][1]) * f;
    const ti = T[Math.max(0, Math.min(n - 1, Math.round(x)))];
    const ni = N[Math.max(0, Math.min(n - 1, Math.round(x)))];
    const w = Math.max(2, bodyWidth60(clamp01(u))) * rollK;
    return { x: px + ni[0] * w * s, y: py + ni[1] * w * s, ang: Math.atan2(ti[1], ti[0]), tx: ti[0], ty: ti[1], nx: ni[0], ny: ni[1] };
  };
  const outlinePts = [];
  for (let i = 0; i < n; i++) outlinePts.push(off(i, -1));
  for (let i = n - 1; i >= 0; i--) outlinePts.push(off(i, 1));

  function finShape(c, u, s, dark, fo) {
    const o = fo || {};
    const b = att(u, s);
    const dir = o.dirOverride !== undefined ? b.ang + o.dirOverride : b.ang - 0.9; // ถอยหลัง-ลงทั้งสองข้าง (ดู FAR_FIN_DIR)
    const dx = Math.cos(dir), dy = Math.sin(dir);
    const px = -dy, py = dx;
    const L = 0.3 * P.L60 * (o.lenScale !== undefined ? o.lenScale : 1); // ครีบยาว 0.3L = 90 px (คูณ lenScale ถ้ามี)
    const lead = [], trail = [];
    for (let k = 0; k <= 6; k++) {
      const f = k / 6;
      const cxp = b.x + dx * L * f, cyp = b.y + dy * L * f;
      const w = 14 * (o.widthScale !== undefined ? o.widthScale : 1) * Math.pow(1 - f, 0.8) + 1;
      const bump = 2.5 * Math.sin(f * Math.PI * 5.5) * (1 - f);
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
    // v2 ข้อ 1: ครีบข้างไกล (s=-0.7) ยาว 36 px (-60%) ชี้ถอยหลัง-ลง ซ่อนหลังลำตัว
    // เป็นส่วนใหญ่; ครีบข้างใกล้ย้ายฐานลงมาฝั่งท้อง (s=-0.6) ด้วย — เดิมฐานอยู่
    // s=+0.6 (ขอบบน) ทำให้ครีบกวาดพาดท้องสว่างเป็นแถบทแยงอ่านเป็นครีบหลัง
    if (phi > Math.PI / 2) finShape(c, 0.34, -0.7, true, { lenScale: FAR_FIN_LEN_SCALE, widthScale: FAR_FIN_W_SCALE, dirOverride: FAR_FIN_DIR });
    // v2 ข้อ 1+5: กลับด้านแถบสีให้ถูกกายวิภาคบนจอ — หลังเข้มอยู่บน (s→+1),
    // ท้องสว่างอยู่ล่าง (s→-1); ขยายพื้นที่ท้องสว่าง (bellyEdge 0.65->0.58)
    const bellyEdge = Math.max(0.38, Math.min(0.80, 0.58 + 0.15 * bellyShift));
    function band(a0, a1, color) {
      c.fillStyle = color;
      c.beginPath();
      const top = [], bot = [];
      for (let i = 0; i < n; i++) top.push(off(i, a0));
      for (let i = n - 1; i >= 0; i--) bot.push(off(i, a1));
      smoothPath(c, top.concat(bot));
      c.closePath(); c.fill();
    }
    band(-1, -bellyEdge, BELLY_BRIGHT);
    band(-bellyEdge, -0.1, BELLY_MID);
    band(-0.1, 0.45, '#2e4a68');
    band(0.45, 1, '#18283a');
    c.strokeStyle = 'rgba(190,225,255,0.35)'; c.lineWidth = 2; c.beginPath();
    const back = [];
    for (let i = 0; i < n; i++) back.push(off(i, 1));
    smoothPath(c, back);
    c.stroke();
    // ตุ่มสันหลัง (Dorsal Hump) — v2 ข้อ 1: แทนครีบหลังใหญ่; ตุ่มมนเล็กๆ บนแนวสันหลัง
    // u 0.66-0.78 (ค่อนไปทางโคนหาง) สูง 13 px (v3: 10 -> 13) ยาว ~36 px สีเดียวกับแถบหลัง
    // (ขอบสันหลังคือ s=+1 — normal ของ att ชี้ออกนอกตัวด้านนี้พอดี)
    {
      const h0 = att(DORSAL_HUMP_U0, 1.0), h1 = att(DORSAL_HUMP_U1, 1.0), hm = att((DORSAL_HUMP_U0 + DORSAL_HUMP_U1) / 2, 1.0);
      const nx = hm.nx, ny = hm.ny; // normal ฝั่งหลัง (ชี้ออกจากลำตัว)
      c.fillStyle = '#18283a';
      c.beginPath();
      c.moveTo(h0.x, h0.y);
      c.quadraticCurveTo(hm.x + nx * DORSAL_HUMP_H * 1.6, hm.y + ny * DORSAL_HUMP_H * 1.6, h1.x, h1.y);
      c.quadraticCurveTo(hm.x + nx * 2, hm.y + ny * 2, h0.x, h0.y);
      c.closePath(); c.fill();
    }
    // หาง fluke — เลนส์บาง หนา 0.03L, กางเป็นปีกเมื่อ roll > 30°
    {
      const tail = nodes[11];
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
    if (phi <= Math.PI / 2) finShape(c, 0.34, -0.7, true, { lenScale: FAR_FIN_LEN_SCALE, widthScale: FAR_FIN_W_SCALE, dirOverride: FAR_FIN_DIR });
    finShape(c, 0.30, -0.6, false);
    // ตา — attach(0.12, +0.2)
    {
      const e = att(0.12, 0.2);
      c.fillStyle = '#fff'; c.beginPath(); c.arc(e.x, e.y, 5, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#111'; c.beginPath(); c.arc(e.x + e.tx, e.y + e.ty, 2.5, 0, Math.PI * 2); c.fill();
    }
    // ปากโค้ง attach(0,−0.1) → attach(0.22,−0.35)
    {
      const m0 = att(0, -0.1), m1 = att(0.22, -0.35), mc = att(0.11, -0.3);
      c.strokeStyle = 'rgba(20,30,45,0.8)'; c.lineWidth = 2.5; c.beginPath();
      c.moveTo(m0.x, m0.y); c.quadraticCurveTo(mc.x, mc.y, m1.x, m1.y); c.stroke();
    }
    // ร่องใต้คาง v2 ข้อ 1: 10 เส้น (เดิม 7) ช่วง u=0.02-0.55 (เดิม 0.03-0.45)
    // เส้นเข้มขึ้น (alpha 0.35->0.5, กว้าง 2->2.5) ให้ตัดกับท้องที่สว่างขึ้น;
    // ร่องอยู่ฝั่งท้อง (s→-1, ขอบล่างบนจอ) — กลับด้านจาก v1 ที่วางไว้ขอบบน
    c.save();
    c.beginPath();
    smoothPath(c, outlinePts);
    c.closePath(); c.clip();
    c.strokeStyle = 'rgba(20,35,55,0.5)'; c.lineWidth = 2.5;
    for (let k = 0; k < VENTRAL_GROOVES; k++) {
      const u = VENTRAL_U0 + (VENTRAL_U1 - VENTRAL_U0) * k / (VENTRAL_GROOVES - 1);
      const g0 = att(u, -0.45), g1 = att(u, -1.0);
      c.beginPath(); c.moveTo(g0.x, g0.y); c.lineTo(g1.x, g1.y); c.stroke();
    }
    c.restore();
  }

  // motion blur แบบวาดซ้ำ (v3 ข14): เฉพาะ |v| > 300 — ใช้ transform ตรง ไม่ต้อง offscreen
  const speed = o.speed || 0;
  if (speed > 300) {
    const dt = 1 / 30;
    const v = o.velocity || [0, 0];
    for (let k = 5; k >= 0; k--) {
      ctx.save();
      ctx.translate(-v[0] * dt * k / 6, -v[1] * dt * k / 6);
      ctx.globalAlpha = k === 0 ? 1.0 : 0.18;
      whaleBody(ctx);
      ctx.restore();
    }
  } else {
    whaleBody(ctx);
  }
  // สีทับใต้น้ำ (v3 ก5): เข้มขึ้นตามความลึก — เฉพาะส่วนที่อยู่ใต้ผิวน้ำ
  if (typeof document !== 'undefined') {
    ctx.save();
    ctx.beginPath(); ctx.rect(-150, P.Y_SURFACE60, 1020, 2000); ctx.clip();
    ctx.globalCompositeOperation = 'source-atop';
    const wet = ctx.createLinearGradient(0, P.Y_SURFACE60, 0, P.Y_SAND60);
    wet.addColorStop(0, 'rgba(15,55,85,0.35)');
    wet.addColorStop(1, 'rgba(15,55,85,0.75)');
    ctx.fillStyle = wet; ctx.fillRect(-150, P.Y_SURFACE60, 1020, 2000);
    ctx.restore();
  }
  // Rim Light — v2 ข้อ 5: ไฮไลต์ฟ้าอ่อน/ทองจางๆ ตามแนวสันหลังและขอบครีบ
  // วาดหลัง wet overlay เพื่อให้ไฮไลต์ไม่โดนทับจนมืด; ช็อต 17-18 เร่ง x1.6
  {
    const boost = RIM_BOOST_SHOTS.indexOf(o.shot) >= 0 ? 1.6 : 1.0;
    const a1 = Math.min(0.85, RIM_ALPHA * boost), a2 = Math.min(0.6, RIM_GOLD_ALPHA * boost);
    const dorsal = [];
    for (let i = 0; i < n; i++) dorsal.push(off(i, 1)); // แนวสันหลัง = ขอบ s=+1 (ขอบบนบนจอ)
    ctx.save();
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.strokeStyle = `rgba(165,215,255,${a1.toFixed(3)})`; ctx.lineWidth = 3.5;
    ctx.beginPath(); smoothPath(ctx, dorsal); ctx.stroke();
    ctx.strokeStyle = `rgba(255,226,160,${a2.toFixed(3)})`; ctx.lineWidth = 1.5;
    ctx.beginPath(); smoothPath(ctx, dorsal); ctx.stroke();
    ctx.restore();
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    WARMUP_FRAMES, WhaleState, localSpine, spineLength, computeSpineNodes,
    bodyWidth60, WMAX60, rollPhi60, waveAmp60, whaleSpineAt, whaleOutlinePoints,
    drawWhale60, sampleSpline, smoothPath,
    BODY_WIDTH_KNOTS, FAR_FIN_LEN_SCALE, FAR_FIN_W_SCALE, FAR_FIN_DIR,
    DORSAL_HUMP_U0, DORSAL_HUMP_U1, DORSAL_HUMP_H, BELLY_BRIGHT, BELLY_MID,
    VENTRAL_GROOVES, VENTRAL_U0, VENTRAL_U1, RIM_ALPHA, RIM_GOLD_ALPHA, RIM_BOOST_SHOTS,
  };
}
