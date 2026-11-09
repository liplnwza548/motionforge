/**
 * test_shots60.js — เทสต์ director ช็อต 60 วิ (รันด้วย node)
 *   node test_shots60.js
 * ตรวจ staging 3 จุด + ความต่อเนื่อง + ขอบเฟรม/ทราย ของ whalePoseAt (shots60)
 * ไม่แตะ test_physics_60s.js (เทสต์ขั้นที่ 1 ใช้เส้นทางชั่วคราวของ physics60)
 */
'use strict';
const P = require('./physics60.js');
const S = require('./shots60.js');
const SH = require('./shell60.js');
const W = require('./whale60.js');

let pass = 0, fail = 0;
function check(name, ok, detail) {
  if (ok) { pass++; console.log(`PASS  ${name} — ${detail}`); }
  else { fail++; console.log(`FAIL  ${name} — ${detail}`); }
}

// 1. ping 3 staging: หัวที่ 17.00 ห่างขอบใกล้หอย ~36 px -> hit ~17.20 วิ
{
  const st = S.ping3Staging();
  check('ping3 staging hit ~17.20s',
    Math.abs(st.hitT - 17.20) <= 0.05,
    `head=(${st.head[0].toFixed(1)}, ${st.head[1].toFixed(1)}) dist=${st.dist.toFixed(1)}px hit=${st.hitT.toFixed(3)}s (creak 17.20)`);
}

// 2. ช็อต 10 coiling: ระยะทางรวม = 599.2 px (±1), ความเร็ว = ascentSpeed ทุกจุด
{
  const target = S.COIL.TARGET_S;
  let maxSpdErr = -1, worstT = 0;
  for (let t = 29; t <= 32.5; t += 0.05) {
    const err = Math.abs(S.whalePoseAt(t).speed - P.ascentSpeed(t));
    if (err > maxSpdErr) { maxSpdErr = err; worstT = t; }
  }
  // ระยะทางจริงตามเส้นทาง (รวมเชิงตัวเลขจาก pose — สุ่มละเอียด dt=0.002
  // เพราะ chord สุ่มหยาบจะวัดสั้นกว่าจริง)
  let pathLen = 0, prev = S.whalePoseAt(29).center;
  for (let t = 29 + 0.002; t <= 32.5; t += 0.002) {
    const c = S.whalePoseAt(t).center;
    pathLen += Math.hypot(c[0] - prev[0], c[1] - prev[1]);
    prev = c;
  }
  check('shot10 coil path length 599.2px',
    Math.abs(pathLen - target) <= 2,
    `R=${S.COIL.R.toFixed(1)}px path=${pathLen.toFixed(1)}px target=${target.toFixed(1)}px | max speed err=${maxSpdErr.toFixed(2)}px/s at t=${worstT.toFixed(2)}`);
  // หัวต้องอยู่ใต้น้ำตลอดช็อต 10 (y > 790 — ผิวน้ำวาดลึกสุด ~789)
  let minHeadY = Infinity, minT = 0;
  for (let t = 29; t <= 32.5; t += 0.02) {
    const hy = S.whalePoseAt(t).head[1];
    if (hy < minHeadY) { minHeadY = hy; minT = t; }
  }
  check('shot10 head stays underwater',
    minHeadY > 790,
    `min head y=${minHeadY.toFixed(1)} at t=${minT.toFixed(2)}s (limit >790)`);
}

// 3. ช็อต 13–14 ใช้ physics60 ตรงๆ: breach center/pitch/หัวแตะน้ำ
{
  const tTouch = P.headTouchTime();
  const p36 = S.whalePoseAt(36.00), pApex = S.whalePoseAt(37.50), pTouch = S.whalePoseAt(tTouch);
  const bc36 = P.breachCenterAtTime(36.00), bcApex = P.apexCenter();
  const ok =
    Math.abs(p36.center[0] - bc36[0]) < 1e-9 && Math.abs(p36.center[1] - bc36[1]) < 1e-9 &&
    Math.abs(pApex.center[1] - bcApex[1]) < 1e-9 && Math.abs(pApex.center[1] - 495.2) <= 1 &&
    Math.abs(pTouch.pitch - (-55)) < 0.01 && Math.abs(tTouch - 39.3149) <= 0.01;
  check('shots 13-14 breach from physics60',
    ok,
    `center36=(${p36.center[0].toFixed(1)},${p36.center[1].toFixed(1)}) apex y=${pApex.center[1].toFixed(1)} ` +
    `touch t=${tTouch.toFixed(4)}s pitch=${pTouch.pitch.toFixed(1)}° head=(${pTouch.head[0].toFixed(1)},${pTouch.head[1].toFixed(1)}) ` +
    `(หัวชี้ขึ้น 55° = หลัง/ข้างลงก่อน ตามสเปกที่ล็อก — ไม่ใช่หัวปัก)`);
  // spout เริ่ม 35.728 (รูจมูกพ้น 35.578 + 0.15) — ไม่ใช่ apex 37.50
  const sp = P.spoutStartTime();
  check('spout start 35.728 (not apex)',
    Math.abs(sp - 35.728) <= 0.01,
    `spout=${sp.toFixed(3)}s nostril clears ${P.nostrilCrossTime().toFixed(3)}s`);
}

// 4. ช็อต 19: จบที่ศูนย์กลาง x≈540, หัวอยู่ในเฟรม, fade ใน draw60 (ตรวจที่นี่แค่ท่า)
{
  const pEnd = S.whalePoseAt(60.00);
  const ok = Math.abs(pEnd.center[0] - 540) <= 1 && pEnd.head[0] > 0 && pEnd.head[0] < 720;
  check('shot19 ends x~540 in frame',
    ok,
    `center=(${pEnd.center[0].toFixed(1)}, ${pEnd.center[1].toFixed(1)}) head x=${pEnd.head[0].toFixed(1)} (frame 0..720)`);
}

// 5. หอย: เปิดสุด 56° ที่ 23.00, คงถึง 50.00, ปิดสนิท 55.50
{
  const a = (t) => SH.shellAngle60(t);
  const ok = Math.abs(a(17.19)) < 0.01 && Math.abs(a(23.00) - 56) < 0.01 &&
    Math.abs(a(50.00) - 56) < 0.01 && Math.abs(a(55.50)) < 0.01 && Math.abs(a(60.00)) < 0.01;
  check('shell 0->56 @23.00, holds, 0 @55.50',
    ok,
    `angle 17.19=${a(17.19).toFixed(1)}° 19.5=${a(19.5).toFixed(1)}° 23=${a(23).toFixed(1)}° ` +
    `50=${a(50).toFixed(1)}° 53.5=${a(53.5).toFixed(1)}° 55.5=${a(55.5).toFixed(1)}°`);
}

// 6. ความต่อเนื่อง: ศูนย์กลางกระโดดต่อเฟรม < 40 px ทุกเฟรม (ไม่มีดีดตัวข้ามช็อต)
{
  let maxJump = 0, worstT = 0;
  let prev = S.whalePoseAt(0).center;
  for (let f = 1; f <= 1800; f++) {
    const t = f / 30;
    const c = S.whalePoseAt(t).center;
    const j = Math.hypot(c[0] - prev[0], c[1] - prev[1]);
    if (j > maxJump) { maxJump = j; worstT = t; }
    prev = c;
  }
  check('pose continuity (center jump/frame < 40px)',
    maxJump < 40,
    `max jump=${maxJump.toFixed(1)}px at t=${worstT.toFixed(2)}s`);
}

// 7. หัวอยู่ในเฟรมทุกเฟรม + outline ไม่ทะลุทราย (max y < 1192)
{
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, maxYT = 0;
  let worstPt = null, worstT = 0;
  for (let f = 0; f <= 1800; f++) {
    const t = f / 30;
    const pose = S.whalePoseAt(t);
    const nodes = W.computeSpineNodes(pose.head, pose.pitch, t, pose.ampScale);
    // outline คร่าวๆ: spine ± bodyWidth (ใช้สูตรเดียวกับ whaleOutlinePoints)
    for (let i = 0; i < nodes.length; i++) {
      const w = Math.max(2, W.bodyWidth60(i / (nodes.length - 1)));
      const a = nodes[Math.max(0, i - 1)], b = nodes[Math.min(nodes.length - 1, i + 1)];
      const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy) || 1;
      for (const s of [-1, 1]) {
        const x = nodes[i][0] + (-dy / len) * w * s;
        const y = nodes[i][1] + (dx / len) * w * s;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) { maxY = y; maxYT = t; }
        if (x < 0 || x > 720 || y < 0 || y > 1280) { worstPt = [x, y]; worstT = t; }
      }
    }
  }
  const inFrame = minX >= 0 && maxX <= 720 && minY >= 0 && !worstPt;
  check('pose head+outline in frame every frame',
    inFrame,
    `x∈[${minX.toFixed(1)}, ${maxX.toFixed(1)}] y_min=${minY.toFixed(1)}` +
    (inFrame ? '' : ` worst t=${worstT.toFixed(2)}s pt=(${worstPt[0].toFixed(1)},${worstPt[1].toFixed(1)})`));
  check('pose outline below sand (max y < 1192)',
    maxY < 1192,
    `max outline.y=${maxY.toFixed(1)} at t=${maxYT.toFixed(2)}s (limit 1192)`);
}

// 8. pitch ต่อเนื่อง (กระโดดต่อเฟรม < 10°) — ยกเว้นจุดที่ออกแบบให้หันเร็ว
{
  let maxJump = 0, worstT = 0;
  let prev = S.whalePoseAt(0).pitch;
  for (let f = 1; f <= 1800; f++) {
    const t = f / 30;
    const p = S.whalePoseAt(t).pitch;
    const j = Math.abs(p - prev);
    if (j > maxJump) { maxJump = j; worstT = t; }
    prev = p;
  }
  check('pitch continuity (jump/frame < 10 deg)',
    maxJump < 10,
    `max pitch jump=${maxJump.toFixed(2)}°/frame at t=${worstT.toFixed(2)}s`);
}

const WT = require('./water60.js');
const PT = require('./particles60.js');
const CAM = require('./camera60.js');

// 9. v2 ข้อ 3 (P1) วงแหวนทะลุผิว: ริ้วคลื่นโปร่งแสง 3 วง ขยาย 80 px/s
//    เฟดหมดใน 0.8 วิ/วง วงสุดท้ายหายที่ 36.96 วิ — เฟรม 37.00 ต้องไม่มีแล้ว
//    และแผ่นวงรีขาวทึบเดิมต้องหายไป (whiteWaterAt ไม่มี entry ช่วง 36–39)
{
  const rings = (t) => WT.breachRipples60(t);
  const r0 = rings(36.0);
  const r05 = rings(36.5);
  const rate = r05.length && r0.length ? (r05[0].radius - r0[0].radius) / 0.5 : -1;
  check('breach ripples: 3 rings, expand 80px/s, gone before 37.00',
    r0.length === 1 && Math.abs(r0[0].radius - 20) < 0.01 &&
    r05.length === 3 && Math.abs(r05[0].radius - 60) < 0.01 &&
    Math.abs(rate - 80) < 0.01 &&
    rings(36.96).length === 0 && rings(37.00).length === 0 && rings(38.0).length === 0,
    `36.00: ${r0.length} ring r=${r0[0] ? r0[0].radius.toFixed(1) : '-'} | 36.50: ${r05.length} rings ` +
    `r=${r05.map((r) => r.radius.toFixed(1)).join('/')} rate=${rate.toFixed(1)}px/s | ` +
    `36.96: ${rings(36.96).length} rings, 37.00: ${rings(37.00).length} rings (must be 0)`);
  check('white disc breach ring removed (no whiteWater 36-39s)',
    WT.whiteWaterAt(36.0).length === 0 && WT.whiteWaterAt(36.5).length === 0 &&
    WT.whiteWaterAt(38.0).length === 0 && WT.whiteWaterAt(39.0).length === 0,
    `whiteWater entries: 36.0=${WT.whiteWaterAt(36.0).length} 36.5=${WT.whiteWaterAt(36.5).length} ` +
    `38.0=${WT.whiteWaterAt(38.0).length} 39.0=${WT.whiteWaterAt(39.0).length} (all 0; ` +
    `splashdown foam kept: 39.5=${WT.whiteWaterAt(39.5).length} entry)`);
}

// 10. v2 ข้อ 7 เส้นโค้งเปิดหอย: เชิงเส้น 17.20→19.50 (0→27°) แล้ว
//     easeOutQuad 19.50→23.00 (27°→56°) — แตะจุดยึดทั้งสองจุด
{
  const a = (t) => SH.shellAngle60(t);
  check('shell anchors 27deg @19.5s, 56deg @23.0s',
    Math.abs(a(17.19)) < 0.01 && Math.abs(a(18.35) - 13.5) <= 0.5 &&
    Math.abs(a(19.50) - 27) <= 1 && Math.abs(a(21.25) - 48.75) <= 0.5 &&
    Math.abs(a(23.00) - 56) < 0.01,
    `angle 17.19=${a(17.19).toFixed(1)}° 18.35=${a(18.35).toFixed(1)}° (expect 13.5) ` +
    `19.50=${a(19.50).toFixed(1)}° (expect 27±1) 21.25=${a(21.25).toFixed(1)}° (expect 48.75) ` +
    `23.00=${a(23.00).toFixed(1)}° (expect 56)`);
}

// 11. v2 ข้อ 4 ช็อต 04: ซูม 2.2x กล้องตามหัววาฬ — หัว (+ตา) อยู่ในเฟรมทุกเฟรม
{
  let maxDev = 0, minMx = Infinity, minMy = Infinity, worstT = 0;
  let zoomOk = true;
  for (let f = 300; f <= 404; f++) { // 10.00–13.47 วิ (13.50 คือช็อต 05 แล้ว)
    const t = f / 30;
    const pose = S.whalePoseAt(t);
    const cam = CAM.cameraFor(t);
    if (Math.abs(cam.zoom - 2.2) > 1e-9) zoomOk = false;
    const dev = Math.hypot(pose.head[0] - cam.cx, pose.head[1] - cam.cy);
    if (dev > maxDev) maxDev = dev;
    const hs = CAM.worldToScreen(pose.head[0], pose.head[1], t);
    const pr = pose.pitch * Math.PI / 180;
    // ตา ≈ attach(0.12) — ห่างหัว 36 px ย้อนตามแนวลำตัว (ดู whale60.js)
    const es = CAM.worldToScreen(
      pose.head[0] - 36 * Math.cos(pr), pose.head[1] - 36 * Math.sin(pr), t);
    const mx = Math.min(hs[0] - 30, 690 - hs[0], es[0], 720 - es[0]);
    const my = Math.min(hs[1] - 30, 1250 - hs[1], es[1], 1280 - es[1]);
    if (mx < minMx) { minMx = mx; worstT = t; }
    if (my < minMy) minMy = my;
  }
  check('shot04 close-up 2.2x: head+eye in frame every frame',
    zoomOk && maxDev < 5 && minMx >= 0 && minMy >= 0,
    `zoom 2.2 ${zoomOk ? 'all frames' : 'MISMATCH'} | max head-cam dev=${maxDev.toFixed(1)}px world ` +
    `(limit 5) | min head/eye margin x=${minMx.toFixed(0)}px y=${minMy.toFixed(0)}px ` +
    `(worst t=${worstT.toFixed(2)}s; head sits at screen centre 360,640)`);
}

// 12. v2 ข้อ 4 ช็อต 18: ซูม 2.5x เจาะหอย — หอยทั้งเปลือกอยู่ในเฟรมทุกเฟรม
{
  let minMargin = Infinity, worstT = 0, zoomOk = true;
  let pearlWorst = 0;
  for (let f = 1605; f <= 1694; f++) { // 53.50–56.47 วิ
    const t = f / 30;
    const cam = CAM.cameraFor(t);
    if (Math.abs(cam.zoom - 2.5) > 1e-9) zoomOk = false;
    for (const [x, y] of SH.shellOutlinePoints60(t)) {
      const s = CAM.worldToScreen(x, y, t);
      const m = Math.min(s[0], 720 - s[0], s[1], 1280 - s[1]);
      if (m < minMargin) { minMargin = m; worstT = t; }
    }
    const ps = CAM.worldToScreen(SH.SHELL60.PEARL_X, SH.SHELL60.PEARL_Y, t);
    const pd = Math.hypot(ps[0] - 360, ps[1] - 640);
    if (pd > pearlWorst) pearlWorst = pd;
  }
  check('shot18 close-up 2.5x: whole shell in frame every frame',
    zoomOk && minMargin >= 0,
    `zoom 2.5 ${zoomOk ? 'all frames' : 'MISMATCH'} | min shell outline margin=${minMargin.toFixed(1)}px ` +
    `(worst t=${worstT.toFixed(2)}s; >=0 = inside) | pearl max dist from screen centre=${pearlWorst.toFixed(0)}px`);
}

// 13. v2 ข้อ 2 ม่านน้ำด้านข้าง: splashdown กระจายตลอดแนวลำตัว ไม่ใช่แค่ตรงหัว
{
  const sys = PT.createSplashSystem(800);
  const tT = P.headTouchTime();
  const hp = P.headTouchHeadPos();
  sys.emitSplashdown(hp[0], P.Y_SURFACE60, tT);
  let n = 0, minX = Infinity, maxX = -Infinity;
  sys.pool.forEachAlive((s) => { n++; if (s.x < minX) minX = s.x; if (s.x > maxX) maxX = s.x; });
  const span = maxX - minX;
  check('splashdown lateral curtain spans body line',
    n === 560 && span > 150 && minX < 560 && maxX > 640,
    `alive=${n} (400 burst + 160 curtain) | x span=${span.toFixed(1)}px ` +
    `[${minX.toFixed(1)}, ${maxX.toFixed(1)}] (body tail ~512 → head ~684 at touch)`);
}

// 14. v2 ข้อ 3 (อนุภาค): ริ้วคลื่น kind-5 เกิดตอนทะลุ วาดเป็นวงรีขยาย
//     และตายหมดก่อน 37.00 วิ — ตรวจผ่าน pool จริง + stub ctx
{
  const sys = PT.createSplashSystem(800);
  const he = P.headExitTime();
  sys.emitBreachSpray(306, P.Y_SURFACE60, he);
  const count5 = () => {
    let c = 0;
    sys.pool.forEachAlive((s) => { if (s.kind === 5) c++; });
    return c;
  };
  const dt = 1 / 30;
  let t = he;
  while (t < 36.5 - 1e-9) { t += dt; sys.update(dt, t); }
  const alive365 = count5();
  // stub ctx: รับเฉพาะคำสั่งที่ drawSplashPlume ใช้ — วาดที่ 36.5 ต้องได้
  // วงรี 3 วง รัศมี ~47–60 px (20 + 80·age, age ~0.34–0.50 วิ)
  const ellipses = [];
  const stub = {
    save() {}, restore() {}, beginPath() {}, moveTo() {}, lineTo() {}, stroke() {},
    ellipse(x, y, rx, ry) { ellipses.push([x, y, rx, ry]); },
  };
  sys.draw(stub);
  while (t < 37.0 - 1e-9) { t += dt; sys.update(dt, t); }
  const alive370 = count5();
  check('breach ripple particles: alive @36.5, dead @37.0, drawn as ellipses',
    alive365 === 3 && alive370 === 0 && ellipses.length === 3 &&
    Math.min(...ellipses.map((e) => e[2])) > 40 && Math.max(...ellipses.map((e) => e[2])) < 65,
    `kind-5 alive: @36.50=${alive365} (expect 3) @37.00=${alive370} (expect 0) | ` +
    `drawn ellipses @36.50=${ellipses.length} rx=${ellipses.map((e) => e[2].toFixed(1)).join('/')} ` +
    `(expect 3, rx ~47–60) | headExit=${he.toFixed(3)}s, last ring dies 36.96s`);
}

// ---- v3: 3 จุด Final Polish (Gemini) ----

// 15a. v3 จุด 1: เส้นซี่หอยถูกขลิบด้วย ctx.clip() ในกรอบรูปพัด + เส้นบางลง 30%
//      (2 -> 1.4 px) — ตรวจผ่าน stub ctx ที่บันทึกทุกคำสั่ง path/clip
{
  const ops = [];
  const stub = {
    save() { ops.push(['save']); },
    restore() { ops.push(['restore']); },
    beginPath() { ops.push(['beginPath']); },
    moveTo(x, y) { ops.push(['moveTo', x, y]); },
    lineTo(x, y) { ops.push(['lineTo', x, y]); },
    quadraticCurveTo(x1, y1, x2, y2) { ops.push(['quad', x1, y1, x2, y2]); },
    closePath() { ops.push(['closePath']); },
    clip() { ops.push(['clip']); },
    stroke() { ops.push(['stroke']); },
    set lineWidth(v) { ops.push(['lineWidth', v]); },
    set strokeStyle(v) { ops.push(['strokeStyle', v]); },
  };
  SH.shellRidges(stub, +1, -1);
  const clipIdx = ops.findIndex((o) => o[0] === 'clip');
  const firstStroke = ops.findIndex((o) => o[0] === 'stroke');
  const widths = ops.filter((o) => o[0] === 'lineWidth').map((o) => o[1]);
  const strokes = ops.filter((o) => o[0] === 'stroke').length;
  // path ที่ clip ต้องเป็นกรอบรูปพัด shellHalfPath เป๊ะ (L = 2R·sx = −104, dir +1):
  // moveTo(0,0) -> quad(−36.4,26 → −72.8,14) -> quad(−93.6,8 → −104,0) -> quad(−52,4 → 0,0)
  const clipPath = ops.slice(0, clipIdx);
  const expectPath = [
    ['save'], ['beginPath'], ['moveTo', 0, 0],
    ['quad', -36.4, 26, -72.8, 14], ['quad', -93.6, 8, -104, 0], ['quad', -52, 4, 0, 0],
    ['closePath'],
  ];
  const pathOk = clipPath.length === expectPath.length &&
    clipPath.every((o, i) => o.length === expectPath[i].length &&
      o.every((v, j) => (typeof v === 'number' ? Math.abs(v - expectPath[i][j]) < 1e-9 : v === expectPath[i][j])));
  check('shell ridges clipped to fan outline + stroke 1.4px (-30%)',
    clipIdx > 0 && clipIdx < firstStroke && widths.length === 1 && widths[0] === 1.4 &&
    strokes === 8 && pathOk,
    `clip@${clipIdx} (before first stroke@${firstStroke}) | lineWidth=${widths.join(',')} ` +
    `(expect exactly [1.4]) | ridge strokes=${strokes} (expect 8) | clip path = fan outline: ${pathOk}`);
  // ตรวจว่า clip นี้ "รับน้ำหนัก" จริง: ปลายเส้นซี่กลางพัด (f=0.5) อยู่นอกกรอบ
  // (ถ้าไม่ clip จะแลบ — นี่คือบั๊กที่ Gemini เห็น) — เทสต์ point-in-polygon
  // กับกรอบพัดที่สุ่มจาก quadratic เดียวกับ shellHalfPath
  const q = (p0, c, p1, u) => {
    const a = (1 - u) * (1 - u), b = 2 * (1 - u) * u, d = u * u;
    return [a * p0[0] + b * c[0] + d * p1[0], a * p0[1] + b * c[1] + d * p1[1]];
  };
  const poly = [];
  const L = -104;
  for (let k = 0; k <= 20; k++) poly.push(q([0, 0], [L * 0.35, 26], [L * 0.7, 14], k / 20));
  for (let k = 0; k <= 20; k++) poly.push(q([L * 0.7, 14], [L * 0.9, 8], [L, 0], k / 20));
  for (let k = 0; k <= 20; k++) poly.push(q([L, 0], [L * 0.5, 4], [0, 0], k / 20));
  const inside = ([x, y]) => {
    let c = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, yi] = poly[i], [xj, yj] = poly[j];
      if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) c = !c;
    }
    return c;
  };
  const ridgeEnds = [];
  for (let i = 1; i <= 8; i++) {
    const f = i / 9;
    ridgeEnds.push([L * f, 26 * Math.sin(Math.PI * f) * 0.9 + 2]);
  }
  const outsideEnds = ridgeEnds.filter((p) => !inside(p));
  check('ridge tips poke outside fan outline (clip is load-bearing)',
    outsideEnds.length >= 3,
    `ridge endpoints outside fan: ${outsideEnds.length}/8 ` +
    `(mid-fan tip f=0.5 at (−52, 25.4) vs boundary y≈17.7 — clip must cut it)`);
}

// 15b. v3 จุด 1: Halo ไข่มุกช็อต 18 — เต็มที่ 53.50 วิ หรี่ช้าๆ ดับที่ 55.50 วิ
{
  const h = (t) => SH.shellPearlHalo60(t);
  check('pearl halo 1.0 @53.50 fading slowly to 0 @55.50',
    h(53.49) === 0 && h(53.50) === 1 && Math.abs(h(54.50) - 0.5) < 1e-9 &&
    Math.abs(h(55.00) - 0.25) < 1e-9 && h(55.50) === 0 && h(56.00) === 0,
    `halo 53.49=${h(53.49)} 53.50=${h(53.50)} 54.50=${h(54.50)} 55.00=${h(55.00)} ` +
    `55.50=${h(55.50)} 56.00=${h(56.00)} (linear fade 53.50→55.50)`);
}

// 15c. v3 จุด 1: ช็อต 18 ยกวาฬขึ้น 160 px โลก (draw-time only — ไม่แตะไทม์ไลน์/ฟิสิกส์)
//      ตรวจเชิงเรขาคณิต: ขอบบนของท่อลำตัว (spine ± bodyWidth) ที่ F1650 (55.00 วิ)
//      ต้องขยับขึ้น 160·2.5 = 400 px จอ เทียบกับท่าวาดแบบ v2 (low drop +45 อย่างเดียว)
//      และก้นท่อลำตัวต้องอยู่เหนือขอบบนเฟรม (maxY < 0) — ลำตัวพ้นเฟรม 100%
//      (เหตุผลที่ 160 ไม่ใช่ 45: วัดจากเฟรมจริง F1650 รอบแรก lift 45 — ก้นท่ออยู่จอ
//       y≈272 px ต้องยกเพิ่ม 272/2.5 ≈ 109 px โลก → 45+109 ≈ 154 ใช้ 160 เผื่อขอบ)
{
  const t = 55.00;
  const pose = S.whalePoseAt(t);
  function screenTop(headDy) {
    const head = [pose.head[0], pose.head[1] + headDy];
    const nodes = W.computeSpineNodes(head, pose.pitch, t, pose.ampScale);
    let minY = Infinity;
    for (let i = 0; i < nodes.length; i++) {
      const w = Math.max(2, W.bodyWidth60(i / 11));
      const a = nodes[Math.max(0, i - 1)], b = nodes[Math.min(11, i + 1)];
      const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy) || 1;
      for (const s of [-1, 1]) {
        const sc = CAM.worldToScreen(nodes[i][0] + (-dy / len) * w * s, nodes[i][1] + (dx / len) * w * s, t);
        if (sc[1] < minY) minY = sc[1];
      }
    }
    return minY;
  }
  function screenBottom(headDy) {
    const head = [pose.head[0], pose.head[1] + headDy];
    const nodes = W.computeSpineNodes(head, pose.pitch, t, pose.ampScale);
    let maxY = -Infinity;
    for (let i = 0; i < nodes.length; i++) {
      const w = Math.max(2, W.bodyWidth60(i / 11));
      const a = nodes[Math.max(0, i - 1)], b = nodes[Math.min(11, i + 1)];
      const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy) || 1;
      for (const s of [-1, 1]) {
        const sc = CAM.worldToScreen(nodes[i][0] + (-dy / len) * w * s, nodes[i][1] + (dx / len) * w * s, t);
        if (sc[1] > maxY) maxY = sc[1];
      }
    }
    return maxY;
  }
  const topV2 = screenTop(45); // v2: low drop +45 อย่างเดียว
  const topV3 = screenTop(-115);  // v3: drop +45 − lift 160 = −115 จากท่าฟิสิกส์
  check('shot18 whale lifted 160px world (400px screen @2.5x)',
    Math.abs((topV2 - topV3) - 400) < 1,
    `body-tube screen top @55.00s: v2=${topV2.toFixed(1)}px -> v3=${topV3.toFixed(1)}px ` +
    `(lift ${(topV2 - topV3).toFixed(1)}px, expect 400)`);
  const botV3 = screenBottom(-115);
  check('shot18 whale body tube fully above frame top (bottom < 0)',
    botV3 < 0,
    `body-tube screen bottom @55.00s v3=${botV3.toFixed(1)}px (expect < 0)`);
  // guard: draw60.js (รันในเบราว์เซอร์อย่างเดียว) ต้องมีค่าคงที่และต่อสายเข้าตอนวาดจริง
  const fs = require('fs');
  const drawSrc = fs.readFileSync(`${__dirname}/draw60.js`, 'utf8');
  check('draw60 wires WHALE_SHOT18_LIFT=160 into headDraw (shot 18 only)',
    /WHALE_SHOT18_LIFT\s*=\s*160/.test(drawSrc) &&
    /whaleShot18LiftY\(pose\.shot\)/.test(drawSrc) &&
    /shot === 18 \? -WHALE_SHOT18_LIFT : 0/.test(drawSrc),
    'constant 160 + headDraw + shot-18-only guard present in draw60.js');
}

// 15d. v3 จุด 2: ม่านน้ำด้านข้าง splashdown — ความเร็วข้าง ±150–220 px/s
//      และเฟรมแรก opacity 0.6 (เฟดอิน 0.12 วิ แล้วกลับเป็นค่า v2 เดิม)
{
  const sys = PT.createSplashSystem(800);
  const tT = P.headTouchTime();
  const hp = P.headTouchHeadPos();
  sys.emitSplashdown(hp[0], P.Y_SURFACE60, tT);
  let nBurst = 0, nCurtain = 0;
  let minCurtVx = Infinity, maxCurtVx = -Infinity;
  let minBurstVx = Infinity, maxBurstVx = -Infinity;
  sys.pool.forEachAlive((s) => {
    const isBurst = (s.x0 === hp[0] && s.y0 === P.Y_SURFACE60);
    if (isBurst) {
      nBurst++;
      if (Math.abs(s.vx0) < minBurstVx) minBurstVx = Math.abs(s.vx0);
      if (Math.abs(s.vx0) > maxBurstVx) maxBurstVx = Math.abs(s.vx0);
    } else {
      nCurtain++;
      if (Math.abs(s.vx0) < minCurtVx) minCurtVx = Math.abs(s.vx0);
      if (Math.abs(s.vx0) > maxCurtVx) maxCurtVx = Math.abs(s.vx0);
    }
  });
  // ม่านน้ำ: vx = nrm.x·vPerp + dir.x·vAlong, pitch −55° -> nrm.x≈0.819,
  // dir.x≈0.574, vAlong ±30 -> |vx| ∈ [0.819·150−17.2, 0.819·220+17.2] ≈ [105.6, 197.4]
  check('splashdown curtain lateral speed ±150-220px/s (vx 105-198)',
    nCurtain === 160 && minCurtVx >= 100 && maxCurtVx <= 200,
    `curtain n=${nCurtain} |vx0| ∈ [${minCurtVx.toFixed(1)}, ${maxCurtVx.toFixed(1)}] ` +
    `(expect 160 particles, |vx| 100–200 from vPerp 150–220; v2 was 81–295)`);
  // burst 400 เม็ดคงความเร็วเดิมของ v2 ไว้ (พัดกว้างเหมือนเดิมที่ F1185 — ไม่ clamp)
  check('splashdown burst keeps v2 velocities (fans unchanged @F1185)',
    nBurst === 400 && minBurstVx < 100 && maxBurstVx > 400,
    `burst n=${nBurst} |vx0| ∈ [${minBurstVx.toFixed(1)}, ${maxBurstVx.toFixed(1)}] ` +
    `(broad v2 distribution kept: steep + wide particles both present)`);
  // opacity เฟรมแรก: stub ctx จับสีที่ drawCapsule ใช้ (age 0 -> alpha 0.6 ทุกเม็ด)
  const alphas0 = [];
  const stub = {
    save() {}, restore() {}, beginPath() {}, moveTo() {}, lineTo() {},
    ellipse() {},
    stroke() { if (typeof this._c === 'string') alphas0.push(this._c); },
    set strokeStyle(v) { this._c = v; },
    set lineWidth(v) {}, set lineCap(v) {},
  };
  sys.draw(stub);
  const parseA = (c) => parseFloat(c.match(/rgba\(235,245,255,([0-9.]+)\)/)[1]);
  const a0 = alphas0.map(parseA);
  const maxA0 = Math.max(...a0);
  check('splash first frame opacity 0.6 (not opaque white)',
    a0.length === 560 && a0.every((a) => Math.abs(a - 0.6) < 0.002),
    `drawn kind-2 capsules @age 0: n=${a0.length} alpha all ${maxA0.toFixed(3)} (expect 0.600)`);
  // เฟดอินจบใน 0.12 วิ: หลัง step 0.133 วิ alpha ต้องกลับเป็นสูตรเดิม v2 (0.8·life/maxLife)
  const dt = 1 / 30;
  let tt = tT;
  for (let k = 0; k < 4; k++) { tt += dt; sys.update(dt, tt); }
  const alphas1 = [];
  const stub1 = {
    save() {}, restore() {}, beginPath() {}, moveTo() {}, lineTo() {},
    ellipse() {},
    stroke() { if (typeof this._c === 'string') alphas1.push(this._c); },
    set strokeStyle(v) { this._c = v; },
    set lineWidth(v) {}, set lineCap(v) {},
  };
  sys.draw(stub1);
  let maxErr = 0;
  const drawn = alphas1.map(parseA);
  let di = 0;
  sys.pool.forEachAlive((s) => {
    if (s.kind !== 2) return;
    const expect = 0.8 * Math.max(0, Math.min(1, s.life / s.maxLife));
    const err = Math.abs(drawn[di++] - expect);
    if (err > maxErr) maxErr = err;
  });
  check('splash fade-in done by 0.12s (back to v2 alpha formula)',
    drawn.length === 560 && maxErr < 0.005,
    `drawn kind-2 @age 0.133s: n=${drawn.length} max |alpha − 0.8·life/maxLife| = ${maxErr.toFixed(4)} ` +
    `(expect < 0.005 — F1185 @0.185s identical to v2)`);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
