// test_breach.js — v3 ตรวจฟิสิกส์ breach + telemetry + shell + กล้อง ด้วย node
// รัน: node test_breach.js  (ใน s06-full-v3/)
// พารามิเตอร์ใหม่ v3 (Opus §16.8): G=235.4 ค่าเดียว, L=300, น้ำลึก 440
//   (ผิวน้ำ 760 / ทราย 1200), C0=[440,1060], V0=[-80,-436.7],
//   T_APEX 7.855 / T_REENTRY 8.799 / T_SETTLE 10.4, θ 20°→70°→10°,
//   shell เปิด easing ช่วงเดียวที่เวลาคลื่นชน (~1.96 วิ),
//   tHeadDownCross ใหม่ ≈ 8.905 วิ (หัวตบข้าง 10° แตะน้ำ — สายเสียงยึดค่านี้)
const fs = require('fs');
const path = require('path');
const DIR = __dirname;
const vm = require('vm');
function load(f) {
  const p1 = path.join(DIR, f), p2 = path.join(DIR, '..', f);
  vm.runInThisContext(fs.readFileSync(fs.existsSync(p1) ? p1 : p2, 'utf8'), { filename: f });
}
load('spine_bean.js');
load('telemetry_bean.js');
load('gerstner_v3.js');
load('particles_v3.js');
load('breach.js');
load('camera.js');
load('telemetry_breach.js');
load('shell.js');

let fails = 0;
function check(name, cond, detail) {
  console.log((cond ? 'PASS' : 'FAIL') + ' | ' + name + (detail ? ' | ' + detail : ''));
  if (!cond) fails++;
}

// 0) G ค่าเดียวทั้งโปรเจกต์ (Opus ข4)
check('BREACH.G = 235.4', BREACH.G === 235.4, 'G=' + BREACH.G);
check('G_WORLD = 235.4 (9.81·24 ≈ 235.44 ปัดเป็น 235.4 ตามสเปก)', Math.abs(G_WORLD - 235.4) < 0.001, 'G=' + G_WORLD);
check('WATER_Y=760 / SAND_Y=1200 (น้ำลึก 440)', WATER_Y === 760 && SAND_Y === 1200, `water=${WATER_Y} sand=${SAND_Y}`);
{
  const gSrc = fs.readFileSync(path.join(DIR, 'gerstner_v3.js'), 'utf8');
  const pSrc = fs.readFileSync(path.join(DIR, 'particles_v3.js'), 'utf8');
  check('gerstner ω มาจาก G=235.4 (ω=2.15/2.79/3.59/4.60)', gSrc.includes('w: 2.1500') && gSrc.includes('w: 4.5970') && gSrc.includes('235.4'));
  check('particles G = 235.4', pSrc.includes('G = 235.4'));
  // ตรวจเฉพาะโค้ด (ตัดคอมเมนต์ // ออกก่อน — คอมเมนต์ที่อธิบายว่า "เลิกใช้ 10.02" ไม่นับ)
  const stripComments = (s) => s.split('\n').map(l => l.split('//')[0]).join('\n');
  const bSrc = stripComments(fs.readFileSync(path.join(DIR, 'breach.js'), 'utf8'));
  const dSrc = stripComments(fs.readFileSync(path.join(DIR, 'draw.js'), 'utf8'));
  check('ไม่มีค่าคงที่ 10.02 ตกค้างในโค้ด v3 (คอมเมนต์ที่อธิบายการเลิกใช้ไม่นับ)', !bSrc.includes('10.02') && !dSrc.includes('10.02'));
}

// 1) เหตุการณ์ breach (v3 — วัดจริงจากโค้ด)
const ev = breachEvents();
console.log('events:', JSON.stringify(ev));
check('หัวทะลุผิว t≈6.50', Math.abs(ev.tHeadCross - 6.50) < 0.05, 'tHeadCross=' + ev.tHeadCross.toFixed(3));
check('ศูนย์กลางทะลุผิวขาขึ้น t≈6.910', Math.abs(ev.tCenterCross - 6.910) < 0.02, 'tCenterCross=' + ev.tCenterCross.toFixed(3));
check('หัวแตะผิวขาลง t≈8.905 (ตบข้าง 10° — สายเสียงยึดค่านี้)', Math.abs(ev.tHeadDownCross - 8.905) < 0.05, 'tHeadDownCross=' + ev.tHeadDownCross.toFixed(3));
check('หัวแตะผิวขาลง x≈58', Math.abs(ev.reentryHeadX - 58.1) < 5, 'reentryHeadX=' + ev.reentryHeadX.toFixed(1));
check('Apex y≈655 (เหนือน้ำ 105 px = 0.35L)', Math.abs(ev.apexCenter[1] - 654.9) < 5, 'apexY=' + ev.apexCenter[1].toFixed(1));
check('Apex x≈292 (440−80·1.855)', Math.abs(ev.apexCenter[0] - 291.6) < 5, 'apexX=' + ev.apexCenter[0].toFixed(1));
check('Apex t=7.855', Math.abs(ev.tApex - 7.855) < 0.01, 'tApex=' + ev.tApex.toFixed(3));
check('Re-entry y≈760 (ผิวน้ำ)', Math.abs(ev.reentryCenter[1] - 759.8) < 5, 'reY=' + ev.reentryCenter[1].toFixed(1));
check('Re-entry x≈216 (440−80·2.799)', Math.abs(ev.reentryCenter[0] - 216.1) < 5, 'reX=' + ev.reentryCenter[0].toFixed(1));
check('Re-entry t=8.799', Math.abs(ev.tReentry - 8.799) < 0.01, 'tReentry=' + ev.tReentry.toFixed(3));
check('crossX อยู่ในโลกที่กล้องมองเห็น', ev.crossX > 100 && ev.crossX < 620, 'crossX=' + ev.crossX.toFixed(1));
check('tExit ≈ 6.911 (ศูนย์กลางพ้นน้ำ)', Math.abs(ev.tExit - 6.911) < 0.02, 'tExit=' + ev.tExit.toFixed(3));

// 1b) C0/V0 ใหม่
check('C0 = [440,1060]', BREACH.C0[0] === 440 && BREACH.C0[1] === 1060, JSON.stringify(BREACH.C0));
check('V0 = [-80,-436.7]', BREACH.V0[0] === -80 && BREACH.V0[1] === -436.7, JSON.stringify(BREACH.V0));
check('ความเร็วที่จุดปล่อย |V0|≈444.0', Math.abs(Math.hypot(...breachCenterVel(6.0)) - 444.0) < 1, '|v(6.0)|=' + Math.hypot(...breachCenterVel(6.0)).toFixed(1));
check('vy ที่ผิวน้ำ ≈ 222.3 px/s (9.3 m/s)', Math.abs(Math.hypot(...breachCenterVel(ev.tCenterCross)) - 236.1) < 30, '|v|=' + Math.hypot(...breachCenterVel(ev.tCenterCross)).toFixed(1));
check('L = 300', BREACH.L === 300, 'L=' + BREACH.L);

// 2) ความต่อเนื่องของศูนย์กลาง (กระโดดต่อ 0.1 วิต้อง < 60 px)
let maxJump = 0, maxJumpT = 0;
for (let t = 0.1; t < 12; t += 0.1) {
  const a = breachCenter(t - 0.1), b = breachCenter(t);
  const d = Math.hypot(b[0] - a[0], b[1] - a[1]);
  if (d > maxJump) { maxJump = d; maxJumpT = t; }
}
console.log('max center jump per 0.1s:', maxJump.toFixed(1), 'at t=' + maxJumpT.toFixed(1));
check('ศูนย์กลางไม่กระโดด (>60px/0.1s)', maxJump < 60, 'max=' + maxJump.toFixed(1) + ' @t=' + maxJumpT.toFixed(1));

// 3) ความยาวลำตัวคงที่ (ผลรวมท่อน spine ≈ 300 ±5% — รวมช่วงบินที่มี Dorsal Arch)
for (const t of [0, 3, 5.9, 6.0, 6.5, 7.855, 8.799, 10.4, 11.9]) {
  const pts = whalePointsS06(t);
  let len = 0;
  for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  const ok = Math.abs(len - 300) / 300 < 0.05;
  check('body length t=' + t, ok, 'len=' + len.toFixed(1));
  if (!pts.every(p => p.every(Number.isFinite))) { check('finite t=' + t, false); }
}

// 3b) Dorsal Arch มีจริงตอนบิน (กลางลำตัวโค้งออกจากเส้นหัว-หาง)
{
  const pts = whalePointsS06(7.855);
  const [hx, hy] = pts[0], [tx, ty] = pts[11];
  const mxp = (hx + tx) / 2, myp = (hy + ty) / 2;
  const mid = pts[5];
  const archDev = Math.hypot(mid[0] - mxp, mid[1] - myp);
  console.log('dorsal arch deviation at Apex:', archDev.toFixed(1), 'px');
  check('Dorsal Arch ตอนบิน (เบี่ยง > 8 px)', archDev > 8, 'dev=' + archDev.toFixed(1));
}

// 3c) แอมพลิจูดคลื่นว่ายน้ำ A(u) = L·(0.005+0.095u³) (Opus ข2)
{
  let maxHead = 0, maxTail = 0;
  for (let t = 0; t <= 2; t += 0.01) {
    const sp = localSpine(t);
    maxHead = Math.max(maxHead, Math.abs(sp[0][1]));
    maxTail = Math.max(maxTail, Math.abs(sp[11][1]));
  }
  console.log('swim wave amp: head max', maxHead.toFixed(1), 'px (target 1.5), tail max', maxTail.toFixed(1), 'px (target 30)');
  check('แอมพลิจูดหัว ≈ 1.5 px (0.5%L)', Math.abs(maxHead - 1.5) < 0.3, 'head=' + maxHead.toFixed(1));
  check('แอมพลิจูดหาง ≈ 30 px (10%L)', Math.abs(maxTail - 30) < 0.5, 'tail=' + maxTail.toFixed(1));
  check('bodyWidth สูงสุด 37.5 px ที่ u=0.25', Math.abs(bodyWidthOpus(0.25) - 37.5) < 0.01, 'w=' + bodyWidthOpus(0.25).toFixed(1));
  check('bodyWidth หัวแหลม (u=0 → 0)', bodyWidthOpus(0) === 0);
}

// 3d) หัวไม่ทะลุทราย — เทสต์ใหม่ของ Opus (ข7): max(outline.y) < sandY − 8 ทุกเฟรม
{
  let maxY = -1e9, maxYT = 0;
  for (let i = 0; i <= 360; i++) {
    const t = i / 30;
    for (const [, y] of whaleOutlinePoints(t)) {
      if (y > maxY) { maxY = y; maxYT = t; }
    }
  }
  console.log('max outline y =', maxY.toFixed(1), 'px @t=' + maxYT.toFixed(2), '(limit sandY−8 =', (SAND_Y - 8) + ')');
  check('หัวไม่ทะลุทราย (max outline.y < 1192)', maxY < SAND_Y - 8, 'maxY=' + maxY.toFixed(1) + ' @t=' + maxYT.toFixed(2));
}

// 3e) ตาอยู่ในโครงร่างตัวทุกช่วง (Opus หัวข้อ 3.6)
{
  const pip = (pt, poly) => {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const xi = poly[i][0], yi = poly[i][1], xj = poly[j][0], yj = poly[j][1];
      if (((yi > pt[1]) !== (yj > pt[1])) && (pt[0] < (xj - xi) * (pt[1] - yi) / (yj - yi) + xi)) inside = !inside;
    }
    return inside;
  };
  for (const t of [0, 3, 6.0, 7.855, 8.799, 11.0]) {
    const pts = whalePointsS06(t);
    const e = attachPoint(pts, 0.12, 0.2);
    const inside = pip([e.x, e.y], whaleOutlinePoints(t));
    check('ตาอยู่ในโครงร่างตัว t=' + t, inside, `eye=(${e.x.toFixed(0)},${e.y.toFixed(0)})`);
  }
}

// 3f) θ ในอากาศมีความเร็วเชิงมุมคงที่ (Opus ข6: dω/dt ≈ 0)
{
  const th = (t) => breachTheta(t) * 180 / Math.PI;
  const om1 = (th(7.5) - th(7.0)) / 0.5, om2 = (th(8.0) - th(7.5)) / 0.5, om3 = (th(8.5) - th(8.0)) / 0.5;
  console.log('angular velocity in air (°/s): 7.0–7.5:', om1.toFixed(2), '7.5–8.0:', om2.toFixed(2), '8.0–8.5:', om3.toFixed(2), '(target −31.76)');
  check('θ ที่พ้นน้ำ ≈ 70°', Math.abs(th(ev.tExit) - 70) < 1.5, 'θ=' + th(ev.tExit).toFixed(1));
  check('θ ที่แตะน้ำ ≈ 10° (ตบข้าง ≤15°)', Math.abs(th(ev.tReentry) - 10) < 1.5 && th(ev.tReentry) <= 15, 'θ=' + th(ev.tReentry).toFixed(1));
  check('ω คงที่ในอากาศ (|Δω| < 1.5°/s)', Math.abs(om1 - om2) < 1.5 && Math.abs(om2 - om3) < 1.5, `ω=${om1.toFixed(1)}/${om2.toFixed(1)}/${om3.toFixed(1)}`);
  check('ω ≈ −31.8°/s', Math.abs(om1 + 31.76) < 1.5, 'ω=' + om1.toFixed(1));
  check('roll ที่ Apex ≈ 45°', Math.abs(rollPhi(7.855) * 180 / Math.PI - 45) < 2, 'roll=' + (rollPhi(7.855) * 180 / Math.PI).toFixed(1));
  check('roll ที่แตะน้ำ ≈ 90°', Math.abs(rollPhi(8.799) * 180 / Math.PI - 90) < 1.5, 'roll=' + (rollPhi(8.799) * 180 / Math.PI).toFixed(1));
}

// 4) telemetry: drag = k(ρ)·speed² + AMPL ค่ายอด + ไม่กระโดดในเฟรมเดียว
let maxKErr = 0, ampMin = 1e9, maxSpeedJump = 0, maxSpeedJumpT = 0;
let prev = null;
for (let i = 0; i <= 360; i++) {
  const t = i / 30;
  const tel = getTelemetryS06(t);
  if (tel.speed > 1) {
    const k = tel.drag / (tel.speed * tel.speed);
    const kk = dragK(t);
    const err = Math.abs(k - kk) / kk;
    if (err > maxKErr) maxKErr = err;
  }
  if (tel.amplitude < ampMin) ampMin = tel.amplitude;
  if (prev !== null) {
    const d = Math.abs(tel.speed - prev);
    if (d > maxSpeedJump) { maxSpeedJump = d; maxSpeedJumpT = t; }
  }
  prev = tel.speed;
  if (![tel.speed, tel.pitch, tel.amplitude, tel.drag].every(Number.isFinite)) { check('telemetry finite t=' + t, false); }
}
console.log('drag k(ρ) rel err max:', maxKErr.toExponential(2), '(target: drag = k(ρ)·speed² ตรง)');
check('drag/speed² = k(ρ) ตรงทุกเฟรม (err < 0.1%)', maxKErr < 0.001, 'err=' + maxKErr.toExponential(2));
check('amplitude ≥ 0 ตลอด', ampMin >= 0, 'min=' + ampMin.toFixed(2));
{
  const telApex = getTelemetryS06(7.855);
  console.log('telemetry @Apex: speed', telApex.speed.toFixed(1), 'drag', telApex.drag.toFixed(0), 'N (ในอากาศต้องน้อยมาก — ρ≈1.2)');
  check('drag ในอากาศที่ Apex < 150 N (ρ ถ่วงจมน้ำแล้ว)', telApex.drag < 150, 'drag=' + telApex.drag.toFixed(0));
  check('AMPL ที่ Apex = 4.5 px (30·0.15 — ค่ายอดตอนบิน)', Math.abs(telApex.amplitude - 4.5) < 0.01, 'amp=' + telApex.amplitude.toFixed(1));
  const telSwim = getTelemetryS06(3.0);
  check('AMPL ตอนว่ายน้ำ = 30 px (ค่ายอด ไม่กะพริบ)', Math.abs(telSwim.amplitude - 30) < 0.01, 'amp=' + telSwim.amplitude.toFixed(1));
}
console.log('max telemetry speed jump per frame:', maxSpeedJump.toFixed(1), 'at t=' + maxSpeedJumpT.toFixed(2));
let jumpOk = true;
if (maxSpeedJumpT >= 5.75 && maxSpeedJumpT <= 6.5) jumpOk = maxSpeedJump < 90;
else if (maxSpeedJumpT >= 8.799 && maxSpeedJumpT <= 9.0) jumpOk = maxSpeedJump < 130;
else jumpOk = maxSpeedJump < 60;
check('telemetry speed ไม่กระโดดเกินเกณฑ์', jumpOk, 'max=' + maxSpeedJump.toFixed(1) + ' @t=' + maxSpeedJumpT.toFixed(2));

// 4b) ความเร็วต่อเนื่องที่จุดปล่อย (C¹) — ไม่มีกระโดด 0→444
{
  const s599 = Math.hypot(...breachCenterVel(5.99));
  const s600 = Math.hypot(...breachCenterVel(6.0));
  const s601 = Math.hypot(...breachCenterVel(6.01));
  const s575 = Math.hypot(...breachCenterVel(5.75));
  const s550 = Math.hypot(...breachCenterVel(5.50));
  console.log(`thrust speeds: 5.50=${s550.toFixed(1)} 5.75=${s575.toFixed(1)} 5.99=${s599.toFixed(1)} 6.00=${s600.toFixed(1)} 6.01=${s601.toFixed(1)}`);
  check('Anticipation settle: speed ที่ 5.75 < 15 px/s', s575 < 15, 'v(5.75)=' + s575.toFixed(1));
  check('Thrust C¹: |v(6.00) − v(5.99)| < 60', Math.abs(s600 - s599) < 60, 'Δ=' + Math.abs(s600 - s599).toFixed(1));
  check('Thrust C¹: |v(6.01) − v(6.00)| < 30', Math.abs(s601 - s600) < 30, 'Δ=' + Math.abs(s601 - s600).toFixed(1));
  check('Thrust เร่งขึ้น: v(5.99) > 300', s599 > 300, 'v(5.99)=' + s599.toFixed(1));
}

// 5) shell — เปิดตามเวลาคลื่นชน (v3: hit ≈ 1.96 วิ, easing ช่วงเดียว)
const hit = shellHitTime();
console.log('shell hit time:', hit.toFixed(3), 's (ping 1 ยิง 1.50 + อายุคลื่น ~0.46)');
check('shell hit ≈ 1.96 วิ', Math.abs(hit - 1.959) < 0.05, 'hit=' + hit.toFixed(3));
for (const [dt, expect] of [[-0.1, 0], [0, 0], [0.45, 25], [0.9, 50], [1.8, 50], [5, 50]]) {
  const a = shellAngle(hit + dt);
  check(`shell angle hit+${dt} ≈ ${expect}° (easing ช่วงเดียว)`, Math.abs(a - expect) < 2, 'angle=' + a.toFixed(1));
}
check('pearl glow 0 ก่อน hit+0.8', shellPearlGlow(hit + 0.7) === 0);
check('pearl glow 1 หลัง hit+1.5', shellPearlGlow(hit + 1.6) === 1);
check('shell X=397 (hinge ขอบขวา)', SHELL.X === 397, 'X=' + SHELL.X);
check('shell ลอน 9 กลีบ', SHELL.LOBE_N === 9, `m=${SHELL.LOBE_N}`);
check('echo ring มีตอน hit+0.5', shellEchoRing(hit + 0.5) !== null);
check('echo ring หมดตอน hit+2.0', shellEchoRing(hit + 2.0) === null);
{
  const e = shellEchoRing(hit + 0.5);
  check('echo ring รัศมีโตตามเวลา (≈160 px ที่ +0.5 วิ)', Math.abs(e.radius - 160) < 5, 'r=' + e.radius.toFixed(1));
}

// 5b) หางไม่แตะหอย (V3 — ข้อค้าง v2): ระยะโครงร่างวาฬ–ขอบหอย > 0 ทุกเฟรม
{
  let minD = 1e9, minDT = 0;
  for (let i = 0; i <= 360; i++) {
    const t = i / 30;
    const sp = shellOutlinePoints(t);
    for (const p of whaleOutlinePoints(t)) {
      for (const q of sp) {
        const d = Math.hypot(p[0] - q[0], p[1] - q[1]);
        if (d < minD) { minD = d; minDT = t; }
      }
    }
  }
  console.log('min whale–shell outline distance =', minD.toFixed(1), 'px @t=' + minDT.toFixed(2));
  check('หางไม่แตะหอย (ระยะ > 0 ทุกเฟรม)', minD > 0, 'min=' + minD.toFixed(1) + ' @t=' + minDT.toFixed(2));
}

// 6) white water
check('white water ไม่มีก่อนทะลุ', breachWhiteWater(6.0) === null);
check('white water มีหลังทะลุ', breachWhiteWater(7.0) !== null);
check('white water หมดหลัง re-entry+1.2', breachWhiteWater(12.0) === null);
check('โฟมกลับลงน้ำ ไม่มีก่อนหัวแตะน้ำ', breachWhiteWaterReentry(8.5) === null);
check('โฟมกลับลงน้ำ มีหลังหัวแตะน้ำ', breachWhiteWaterReentry(9.2) !== null);

// 7) กล้องใหม่ (v3): วาฬไม่หลุดขอบเฟรมเลย — เช็กทุกจุดของโครงร่าง (Opus ค1)
let minML = 1e9, minMR = 1e9, minMT = 1e9, minMB = 1e9, worstT = 0;
for (let i = 0; i <= 360; i++) {
  const t = i / 30;
  const b = whaleScreenBounds(t);
  const mL = b.minX - 274, mR = 720 - b.maxX, mT = b.minY, mB = 1280 - b.maxY;
  if (Math.min(mL, mR, mT, mB) < Math.min(minML, minMR, minMT, minMB)) worstT = t;
  minML = Math.min(minML, mL); minMR = Math.min(minMR, mR);
  minMT = Math.min(minMT, mT); minMB = Math.min(minMB, mB);
}
console.log(`camera margins (px): L=${minML.toFixed(1)} R=${minMR.toFixed(1)} T=${minMT.toFixed(1)} B=${minMB.toFixed(1)} (worst @t=${worstT.toFixed(2)})`);
check('วาฬไม่หลุดขอบซ้าย/ขวา (margin ≥ 16 px — Opus ค1)', minML >= 16 && minMR >= 16, `L=${minML.toFixed(1)} R=${minMR.toFixed(1)}`);
check('วาฬไม่หลุดขอบบน/ล่าง (margin ≥ 16 px)', minMT >= 16 && minMB >= 16, `T=${minMT.toFixed(1)} B=${minMB.toFixed(1)}`);
check('กล้อง scale 0.9184 ตอน Beat 1 (0.82·1.12)', Math.abs(cameraScale(4.0) - 0.82 * 1.12) < 0.001, 's=' + cameraScale(4.0).toFixed(4));
check('กล้อง scale 0.82 ตอนบิน', Math.abs(cameraScale(7.855) - 0.82) < 0.001, 's=' + cameraScale(7.855).toFixed(4));
check('Vertical Pan: ผิวน้ำ y_screen=520 ช่วง Beat 1', Math.abs(waterScreenY(3.0) - 520) < 0.01, 'y=' + waterScreenY(3.0).toFixed(1));
check('Vertical Pan: ผิวน้ำ y_screen=900 ช่วง Breach', Math.abs(waterScreenY(7.855) - 900) < 0.01, 'y=' + waterScreenY(7.855).toFixed(1));
check('Vertical Pan: ผิวน้ำกลับ 520 หลัง settle', Math.abs(waterScreenY(11.0) - 520) < 0.01, 'y=' + waterScreenY(11.0).toFixed(1));

// 7b) กล้องไม่กระตุก: จุดกลางวาฬบนจอขยับต่อเฟรมไม่เกิน 45 px
{
  let maxStep = 0, maxStepT = 0;
  let prevC = null;
  for (let i = 0; i <= 360; i++) {
    const t = i / 30;
    const c = breachCenter(t);
    const [sx, sy] = worldToScreen(c[0], c[1], t);
    if (prevC) {
      const d = Math.hypot(sx - prevC[0], sy - prevC[1]);
      if (d > maxStep) { maxStep = d; maxStepT = t; }
    }
    prevC = [sx, sy];
  }
  console.log('max camera-center screen step per frame:', maxStep.toFixed(1), 'px @t=' + maxStepT.toFixed(2));
  check('กล้องแพนต่อเนื่อง (กลางวาฬขยับ < 45 px/เฟรม)', maxStep < 45, 'max=' + maxStep.toFixed(1) + ' @t=' + maxStepT.toFixed(2));
}

// 8) เกจคำนวณล่วงหน้าทั้งคลิป (Opus ง4): คงที่ตลอด 12 วิ
{
  const g1 = precomputedGaugeMax(), g2 = precomputedGaugeMax();
  console.log('gauge (precomputed): speedMax=' + g1.speedMax.toFixed(1) + ' dragMax=' + g1.dragMax.toFixed(0));
  check('gauge คงที่ตลอดคลิป (เรียกซ้ำได้ค่าเดิม)', g1.speedMax === g2.speedMax && g1.dragMax === g2.dragMax);
  check('gauge speedMax ≈ 444.0 (ความเร็วสูงสุดทั้งคลิป)', Math.abs(g1.speedMax - 444.0) < 1, 'sMax=' + g1.speedMax.toFixed(1));
  check('gauge dragMax ≈ 26307 (drag สูงสุดทั้งคลิป)', Math.abs(g1.dragMax - 26307) < 50, 'dMax=' + g1.dragMax.toFixed(0));
}

// ค่า telemetry ตัวอย่าง (SPEED ใน m/s = px/s ÷ 24 — ที่ draw.js แสดง)
for (const t of [0, 3, 5.5, 5.75, 5.99, 6.0, 6.5, 7.855, 8.905, 10.4, 11.9]) {
  const tel = getTelemetryS06(t);
  console.log(`t=${t.toFixed(2)} speed=${tel.speed.toFixed(1)} px/s (${(tel.speed / 24).toFixed(1)} m/s) pitch=${tel.pitch.toFixed(1)} amp=${tel.amplitude.toFixed(1)} drag=${tel.drag.toFixed(0)} fsub=${submergedFraction(t).toFixed(2)}`);
}

console.log(fails === 0 ? 'ALL TESTS PASSED' : fails + ' TESTS FAILED');
process.exit(fails === 0 ? 0 : 1);
