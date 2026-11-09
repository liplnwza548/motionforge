/**
 * shell.js — v3 (S06, คำวิจารณ์ Opus §16.8: ก6/ข12/ข13)
 * เปลี่ยนจาก v2 (หอยพัดมองจากด้านบน — Opus ว่าเหมือนพิซซ่า/Pac-Man):
 *   ก6: วาดหอยใหม่มุมมองด้านข้าง — ฝาล่างนิ่ง ฝาบนหมุนรอบบานพับที่ขอบหลัง
 *       เปลือก (hinge อยู่ที่ขอบหลัง ไม่ใช่จุดศูนย์กลาง); ซี่ลายแผ่ออกจาก hinge;
 *       ไข่มุก radial gradient ขาว→เทาชมพู + จุดสะท้อนแสง 1 จุด
 *   ข13: หอยใช้ easing ช่วงเดียว open = 50°·easeInOutCubic((t−hit)/0.9)
 *       (v2 ใช้ smoothstep 2 ท่อน ความเร็วตกเป็นศูนย์กลางทาง)
 *   ข12: โซนาร์คลิปในกรอบน้ำ + alpha exp(−r/300) อยู่ฝั่ง draw.js;
 *       หอยเรืองแสงเมื่อวงถึง (pearl glow เริ่มที่ hit+0.8 วิ) + Echo ring ทอง
 *   ตำแหน่ง: hinge (545, 1195) ที่ขอบหลัง (ขวา) — เปลือกยาว 2R=104 px
 *       ไปทางซ้ายเข้าหาวาฬ (ขอบซ้าย world x≈441); ฝาบนเปิดเข้าหาวาฬ
 *       (ที่ hinge อยู่ซ้ายแบบร่างแรก ฝาบนเปิด 50° เฉียดหางวาฬแค่ ~1 px
 *        ตอน t=5.75–6.0 — กลับด้านแล้วห่าง ~14 px ขึ้นไป)
 *   SONAR_T0 ย้ายมาอยู่นี่ (shell.js โหลดก่อน draw.js — draw.js ใช้ต่อได้)
 */

const SONAR_T0 = [1.50, 2.27, 3.00]; // โซนาร์ 3 ระลอก (เฟรม 45/68/90)

const SHELL = {
  X: 397, Y: 1195,      // จุดบานพับ (hinge) ที่ขอบหลังเปลือก (ขวา) — บนพื้นทราย
                       // เปลือกยาว 2R=104 px ไปทางซ้าย (ขอบซ้าย x≈293)
                       // ปลายฝาบนเปิด 50° อยู่ที่ (330,1115)
                       // v3: X 480→397 — ที่ 480 ปลายฝาอยู่ใต้ท้องวาฬช่วงกลางตัว
                       // ซึ่งดำลงถึง y≈1117 ตอน Anticipation (เฉียด ~1 px);
                       // ที่ 397 ปลายฝาอยู่ใต้ส่วนหัวที่ท้องอยู่สูงกว่า
                       // (ท้อง y≈1092 ตอนดำลึกสุด) → ห่าง ~23 px
  R: 52,                // รัศมีเปลือก (px)
  LOBE_N: 9,            // ลอนหอย 9 กลีบ (คงเดิม — ซี่ลายแผ่ออกจาก hinge)
  ANGLE_MID: 30,        // (เลิกใช้ — v3 ใช้ easing ช่วงเดียว)
  ANGLE_FULL: 50,       // องศาเปิดเต็ม
  PEARL_R: 13,          // รัศมีไข่มุก
};

// เวลาที่คลื่นโซนาร์ระลอกแรกชนหอย (วินาที) — คำนวณจากตำแหน่งหัววาฬจริงตอนยิง
// ระยะจากหัว (whalePointsS06(t0)[0]) ถึงขอบใกล้หอย (ปลายซ้าย X−2R, Y);
// r(age)=30+300·age
let _shellHit = null;
function shellHitTime() {
  if (_shellHit !== null) return _shellHit;
  const t0 = SONAR_T0[0];
  const head = whalePointsS06(t0)[0];
  const d = Math.hypot((SHELL.X - 2 * SHELL.R) - head[0], SHELL.Y - head[1]);
  _shellHit = t0 + Math.max(0, (d - 30) / 300);
  return _shellHit;
}

// จังหวะเปิดหอย (v3: easing ช่วงเดียว — ไม่สะดุดกลางทางเหมือน v2)
//   open = 50°·easeInOutCubic(clamp((t−hit)/0.9))
function shellAngle(t) {
  const hit = shellHitTime();
  return SHELL.ANGLE_FULL * easeInOutCubic((t - hit) / 0.9);
}

// ความสว่างไข่มุก 0..1 — เริ่มวาบหลังคลื่นชน +0.8 วิ เต็มที่ +1.5 วิ
function shellPearlGlow(t) {
  const hit = shellHitTime();
  if (t < hit + 0.8) return 0;
  if (t < hit + 1.5) return smooth01((t - (hit + 0.8)) / 0.7);
  return 1;
}

// วงสะท้อนสีทอง (Echo ring) — ตีกลับจากหอยทันทีที่คลื่นชน
// คืน {x, y, radius, alpha} หรือ null ถ้าไม่อยู่ในช่วง (hit .. hit+1.6 วิ)
function shellEchoRing(t) {
  const hit = shellHitTime();
  const age = t - hit;
  if (age < 0 || age > 1.6) return null;
  return {
    x: SHELL.X - 52, y: SHELL.Y - 8,
    radius: 30 + age * 260,
    alpha: 0.9 * (1 - age / 1.6),
  };
}

// จุดบนเส้นโค้ง quadratic Bézier (ใช้สุ่มขอบเปลือกจริงที่วาด)
function shellQuad(p0, c, p1, u) {
  const a = (1 - u) * (1 - u), b = 2 * (1 - u) * u, d = u * u;
  return [a * p0[0] + b * c[0] + d * p1[0], a * p0[1] + b * c[1] + d * p1[1]];
}

// โครงเปลือกครึ่งซีก (ด้านข้าง): จาก hinge (0,0) ไปปลาย (sx·2R, 0) —
// โค้งนูนออกด้านหนึ่ง (belly) แล้วกลับ hinge; sx=−1 = เปลือกชี้ไปทางซ้าย
function shellHalfPath(ctx, dir, sx) {
  const L = 2 * SHELL.R * sx;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.quadraticCurveTo(L * 0.35, dir * 26, L * 0.7, dir * 14);
  ctx.quadraticCurveTo(L * 0.9, dir * 8, L, 0);
  ctx.quadraticCurveTo(L * 0.5, dir * 4, 0, 0);
  ctx.closePath();
}

// ซี่ลายเปลือก: เส้นจาก hinge แผ่ไปตามขอบเปลือก (9 กลีบ)
function shellRidges(ctx, dir, sx) {
  const L = 2 * SHELL.R * sx;
  ctx.strokeStyle = 'rgba(120,85,45,0.7)';
  ctx.lineWidth = 2;
  for (let i = 1; i <= 8; i++) {
    const f = i / 9;
    const ex = L * f;
    const ey = dir * (26 * Math.sin(Math.PI * f) * 0.9 + 2);
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(ex, ey); ctx.stroke();
  }
}

// จุดขอบเปลือก (สุ่มจากเส้นโค้งเดียวกับที่วาด) — ใช้ในเทสต์หางแตะหอย
function shellOutlinePoints(t) {
  const ang = shellAngle(t) * Math.PI / 180;
  const L = 2 * SHELL.R, sx = -1;
  const out = [];
  // ขอบฝาล่าง (นิ่ง): 2 ช่วง quadratic
  for (let k = 0; k <= 10; k++) {
    const u = k / 10;
    out.push(shellQuad([0, 0], [L * 0.35 * sx, 26], [L * 0.7 * sx, 14], u));
  }
  for (let k = 0; k <= 10; k++) {
    const u = k / 10;
    out.push(shellQuad([L * 0.7 * sx, 14], [L * 0.9 * sx, 8], [L * sx, 0], u));
  }
  // ขอบฝาบน: จุดเดียวกับฝาล่างแต่โค้งกลับด้าน (−dir) แล้วหมุน +ang รอบ hinge
  const c = Math.cos(ang), s = Math.sin(ang);
  for (let k = 0; k <= 10; k++) {
    const u = k / 10;
    const p = shellQuad([0, 0], [L * 0.35 * sx, -26], [L * 0.7 * sx, -14], u);
    out.push([SHELL.X + p[0] * c - p[1] * s, SHELL.Y + p[0] * s + p[1] * c]);
  }
  for (let k = 0; k <= 10; k++) {
    const u = k / 10;
    const p = shellQuad([L * 0.7 * sx, -14], [L * 0.9 * sx, -8], [L * sx, 0], u);
    out.push([SHELL.X + p[0] * c - p[1] * s, SHELL.Y + p[0] * s + p[1] * c]);
  }
  // แปลจุดฝาล่างให้เป็นพิกัดโลก (ข้างบนยังเป็น local)
  const lower = out.slice(0, 22).map(([x, y]) => [SHELL.X + x, SHELL.Y + y]);
  const upper = out.slice(22);
  // ไข่มุก (วงกลม 8 จุด)
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    upper.push([SHELL.X - 52 + Math.cos(a) * SHELL.PEARL_R, SHELL.Y - 10 + Math.sin(a) * SHELL.PEARL_R]);
  }
  return lower.concat(upper);
}

// วาดพื้นทราย + หอยเชลล์ + ไข่มุก (พิกัดโลก — เรียกในโซน Render หลังวาดน้ำ ก่อนวาดวาฬ)
function drawShell(ctx, t) {
  const ang = shellAngle(t) * Math.PI / 180;
  const glow = shellPearlGlow(t);
  const { X, Y } = SHELL;
  const CX = X - 52; // จุดกลางเปลือก (ซ้ายของ hinge ครึ่งความยาว)

  // พื้นทรายก้นทะเล (แถบ y 1200–1900 — กว้างกว่าโลก x −150..870 เผื่อกล้องแพน/ซูม)
  // ขอบบนเป็นเนิน Gaussian σ≥15 (Opus ก7 — เลิกเส้นไซน์เรียบของ v2)
  const sandTop = (x) => SAND_Y
    + 5 * Math.exp(-Math.pow((x - 150) / 22, 2))
    + 6 * Math.exp(-Math.pow((x - 420) / 25, 2))
    + 4 * Math.exp(-Math.pow((x - 650) / 20, 2));
  ctx.beginPath(); ctx.moveTo(-150, 1900);
  for (let x = -150; x <= 870; x += 8) ctx.lineTo(x, sandTop(x));
  ctx.lineTo(870, 1900); ctx.closePath();
  const sand = ctx.createLinearGradient(0, SAND_Y, 0, 1280);
  sand.addColorStop(0, '#8a6f4d'); sand.addColorStop(1, '#5d4832');
  ctx.fillStyle = sand; ctx.fill();
  ctx.strokeStyle = 'rgba(255,240,200,0.25)'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(-150, sandTop(-150));
  for (let x = -150; x <= 870; x += 8) ctx.lineTo(x, sandTop(x));
  ctx.stroke();

  // เงาหอยบนพื้นทราย (ใต้หอย)
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath(); ctx.ellipse(CX, Y + 28, 72, 12, 0, 0, Math.PI * 2); ctx.fill();

  // เนินทรายที่หอยฝังอยู่ (วาดก่อนเปลือก — หอยนั่งบนเนิน)
  const mound = ctx.createLinearGradient(0, Y + 5, 0, Y + 45);
  mound.addColorStop(0, '#9a7d58'); mound.addColorStop(1, '#6b543a');
  ctx.fillStyle = mound;
  ctx.beginPath(); ctx.ellipse(CX, Y + 28, 78, 20, 0, Math.PI, 2 * Math.PI); ctx.fill();

  // แสงทองของไข่มุก (เรืองออกมาก่อนเห็นตัวไข่มุก — สว่างทันทีที่คลื่นชน)
  if (glow > 0) {
    const g = ctx.createRadialGradient(CX, Y - 8, 2, CX, Y - 8, 70);
    g.addColorStop(0, `rgba(255,215,110,${0.75 * glow})`);
    g.addColorStop(0.4, `rgba(255,190,60,${0.28 * glow})`);
    g.addColorStop(1, 'rgba(255,190,60,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(CX, Y - 8, 70, 0, Math.PI * 2); ctx.fill();
  }

  // เปลือกล่าง (อยู่นิ่ง) — ครึ่งซีกด้านข้างนูนลง ชี้ไปทางซ้าย
  ctx.fillStyle = '#c9a06a';
  ctx.save(); ctx.translate(X, Y);
  shellHalfPath(ctx, +1, -1); ctx.fill();
  ctx.strokeStyle = '#8a6a3e'; ctx.lineWidth = 2.5; ctx.stroke();
  shellRidges(ctx, +1, -1);
  ctx.restore();

  // ไข่มุก (เห็นเมื่อหอยเปิด) — radial ขาว→เทาชมพู + จุดสะท้อนแสง 1 จุด
  if (glow > 0) {
    const px = CX, py = Y - 10;
    const pg = ctx.createRadialGradient(px - 4, py - 5, 1, px, py, SHELL.PEARL_R);
    pg.addColorStop(0, '#ffffff'); pg.addColorStop(0.6, '#e8d8dc'); pg.addColorStop(1, '#b99aa2');
    ctx.fillStyle = pg;
    ctx.beginPath(); ctx.arc(px, py, SHELL.PEARL_R, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = `rgba(255,240,190,${0.9 * glow})`; ctx.lineWidth = 1.5; ctx.stroke();
    // จุดสะท้อนแสง
    ctx.fillStyle = `rgba(255,255,255,${0.95 * glow})`;
    ctx.beginPath(); ctx.arc(px - 4, py - 5, 3, 0, Math.PI * 2); ctx.fill();
  }

  // เปลือกบน (หมุนเปิดรอบ hinge ด้วยมุม ang — เงยขึ้นไปทางซ้าย)
  // ฝาชี้ซ้าย (−x) ต้อง rotate(+ang) จึงจะเงยขึ้น (ต่างจากฝาชี้ขวาที่ใช้ −ang)
  ctx.save();
  ctx.translate(X, Y);
  ctx.rotate(ang);
  ctx.fillStyle = '#d9b47e';
  shellHalfPath(ctx, -1, -1); ctx.fill();
  ctx.strokeStyle = '#8a6a3e'; ctx.lineWidth = 2.5; ctx.stroke();
  shellRidges(ctx, -1, -1);
  ctx.restore();

  // ริมทรายทับขอบล่างเปลือกเล็กน้อย (หอยฝังในเนิน — ไม่ใช่ลอยอยู่บนพื้น)
  ctx.fillStyle = '#8a6f4d';
  ctx.beginPath(); ctx.ellipse(CX, Y + 32, 58, 9, 0, 0, Math.PI * 2); ctx.fill();

  // Echo ring ทอง (ตีกลับจากหอยทันทีที่คลื่นชน)
  const echo = shellEchoRing(t);
  if (echo) {
    ctx.strokeStyle = `rgba(255,209,102,${echo.alpha})`;
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(echo.x, echo.y, echo.radius, 0, Math.PI * 2); ctx.stroke();
  }
}

// วาดหอยแบบย่อบนแผง Drawing (ซ้าย) — แสดงมุมเปิด + ป้าย
function drawShellPanel(ctx, t, mx, my) {
  const ang = shellAngle(t);
  const glow = shellPearlGlow(t);
  const hx = mx(SHELL.X), hy = my(SHELL.Y);
  const L = 2 * SHELL.R * 0.465; // ความยาวเปลือกบนแผง (สเกล 0.465)
  ctx.strokeStyle = '#ffd166'; ctx.lineWidth = 2;
  // เปลือกล่าง (เส้นตรงไปซ้าย)
  ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(hx - L, hy); ctx.stroke();
  // เปลือกบน (หมุนเปิดตามมุม — ปลายชี้ขึ้น-ซ้าย)
  const a = ang * Math.PI / 180;
  ctx.beginPath(); ctx.moveTo(hx, hy);
  ctx.lineTo(hx - Math.cos(a) * L, hy - Math.sin(a) * L); ctx.stroke();
  if (glow > 0) {
    ctx.fillStyle = `rgba(255,215,110,${glow})`;
    ctx.beginPath(); ctx.arc(hx - L / 2, hy - 5, 4, 0, Math.PI * 2); ctx.fill();
  }
  ctx.fillStyle = '#9fd8ff'; ctx.font = '13px monospace';
  ctx.fillText('SHELL ' + ang.toFixed(0) + '°' + (glow >= 1 ? ' — PEARL REVEALED' : ''), 16, my(SHELL.Y) + 34);
}
