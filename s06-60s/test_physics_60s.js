/**
 * test_physics_60s.js — เทสต์ฟิสิกส์ S06 60 วิ (รันด้วย node)
 *   node test_physics_60s.js
 * assert ทุกข้อตามบรีฟ + ข้อเสริม (ความเร็วช็อต 10–11, เวลาพ่นน้ำ, roll)
 * พิมพ์ PASS/FAIL พร้อมตัวเลขจริงทุกข้อ; exit 1 ถ้ามีข้อใด FAIL
 */
'use strict';
const P = require('./physics60.js');
const W = require('./whale60.js');

let pass = 0, fail = 0;
function check(name, ok, detail) {
  if (ok) { pass++; console.log(`PASS  ${name} — ${detail}`); }
  else { fail++; console.log(`FAIL  ${name} — ${detail}`); }
}

// 1. Apex: 37.50 วิ, y ≈ 495.2 (±1 px)
{
  const apex = P.apexCenter();
  const tauApex = 353.1 / P.G60;
  check('apex time+y',
    Math.abs(P.BREACH60.T_APEX - 37.50) < 1e-9 &&
    Math.abs(tauApex - 1.5) < 1e-9 &&
    Math.abs(apex[1] - 495.2) <= 1,
    `t_apex=${P.BREACH60.T_APEX.toFixed(2)}s τ=${tauApex.toFixed(3)}s center=(${apex[0].toFixed(1)}, ${apex[1].toFixed(2)}) target y=495.2`);
}

// 2. หัวแตะน้ำ 39.31 วิ (±0.05), หัวที่ x ≈ 684.4 (ในจอ, เหลือขอบ 36 px)
{
  const tTouch = P.headTouchTime();
  const head = P.headTouchHeadPos();
  check('head touch water',
    Math.abs(tTouch - 39.31) <= 0.05 && Math.abs(head[1] - P.Y_SURFACE60) <= 1,
    `t_touch=${tTouch.toFixed(4)}s (target 39.31) head=(${head[0].toFixed(1)}, ${head[1].toFixed(1)}) target x≈684.4`);
}

// 3. max(outline.y) < 1192 (= ySand − 8) ทุกเฟรม
// 4. วาฬทุกจุดใน [0,720]×[0,1280] ทุกเฟรม
// 5. ความยาว spine คงที่ 300 (±0.5 px)
{
  let maxY = -Infinity, maxYT = 0;
  let minX = Infinity, maxX = -Infinity, minY = Infinity, worstT = 0, worstPt = null;
  let maxLenErr = 0, worstLenT = 0;
  const dt = 1 / P.FPS60;
  for (let f = 0; f <= P.TOTAL_F60; f++) {
    const t = f * dt;
    const outline = W.whaleOutlinePoints(t);
    for (const [x, y] of outline) {
      if (y > maxY) { maxY = y; maxYT = t; }
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (x < 0 || x > P.W60 || y < 0 || y > P.H60) { worstT = t; worstPt = [x, y]; }
    }
    // spine length ทุก 0.5 วิ (15 เฟรม)
    if (f % 15 === 0) {
      const len = W.spineLength(W.whaleSpineAt(t));
      const err = Math.abs(len - P.L60);
      if (err > maxLenErr) { maxLenErr = err; worstLenT = t; }
    }
  }
  check('outline below sand (max y < 1192)',
    maxY < P.Y_SAND60 - 8,
    `max outline.y=${maxY.toFixed(1)} at t=${maxYT.toFixed(2)}s (limit ${P.Y_SAND60 - 8})`);
  const inFrame = minX >= 0 && maxX <= P.W60 && minY >= 0;
  check('whale inside frame every frame',
    inFrame,
    `x∈[${minX.toFixed(1)}, ${maxX.toFixed(1)}] y_min=${minY.toFixed(1)} (frame 720×1280)` +
    (inFrame ? '' : ` worst at t=${worstT.toFixed(2)}s pt=(${worstPt[0].toFixed(1)}, ${worstPt[1].toFixed(1)})`));
  check('spine length constant 300±0.5',
    maxLenErr <= 0.5,
    `max |len−300|=${maxLenErr.toFixed(3)} px at t=${worstLenT.toFixed(2)}s`);
}

// 6. ช็อต 19 ช็อตต่อกันครบ 60.00 วิ ไม่มีช่องว่าง, เฟรม F0–F1800 ต่อกัน
{
  let gapless = P.SHOTS60.length === 19;
  let sum = 0;
  for (let i = 0; i < P.SHOTS60.length; i++) {
    const s = P.SHOTS60[i];
    sum += s.t1 - s.t0;
    if (i > 0) {
      const prev = P.SHOTS60[i - 1];
      if (Math.abs(s.t0 - prev.t1) > 1e-9 || s.f0 !== prev.f1) gapless = false;
    }
  }
  gapless = gapless && Math.abs(sum - 60.0) < 1e-9 &&
    P.SHOTS60[0].t0 === 0 && P.SHOTS60[0].f0 === 0 &&
    P.SHOTS60[18].t1 === 60.0 && P.SHOTS60[18].f1 === 1800;
  const s13 = P.shotByNumber(13), s14 = P.shotByNumber(14);
  check('19 shots gapless 60.00s',
    gapless,
    `n=${P.SHOTS60.length} sum=${sum.toFixed(2)}s F${P.SHOTS60[0].f0}–F${P.SHOTS60[18].f1}` +
    ` | S13 ${s13.t0}–${s13.t1} (F${s13.f0}–F${s13.f1}), S14 ${s14.t0}–${s14.t1} (F${s14.f0}–F${s14.f1})`);
}

// 7. sonar hit time > เวลา ping เสมอ (ทั้ง 3 ระลอก)
{
  const hits = P.allSonarHits();
  const ok = hits.every((h) => h.hitT > h.pingT);
  check('sonar hit after ping',
    ok,
    hits.map((h) => `ping${h.pingT}s→hit ${h.hitT.toFixed(2)}s (dist ${h.dist.toFixed(1)}px)`).join(' | '));
}

// เสริม A. ความเร็วช็อต 10–11: 100 → 364.4 ต่อเนื่อง, a ≈ 40.7 px/s², ไร้ 550/620
{
  const v0 = P.ascentSpeed(29.00), v1 = P.ascentSpeed(35.50), vm = P.ascentSpeed(32.25);
  const ok = Math.abs(v0 - 100) < 1e-9 && Math.abs(v1 - 364.4) < 1e-9 &&
    Math.abs(vm - 232.2) < 0.01 && Math.abs(P.ASCENT60.ACCEL - 40.68) < 0.05;
  check('ascent speed 100→364.4 (no 550/620)',
    ok,
    `v(29)=${v0.toFixed(1)} v(32.25)=${vm.toFixed(1)} v(35.5)=${v1.toFixed(1)} a=${P.ASCENT60.ACCEL.toFixed(2)} px/s² |V|_breach=${P.breachSpeedAtTau(0).toFixed(1)}`);
}

// เสริม B. พ่นน้ำเริ่มเมื่อรูจมูกพ้นผิวน้ำจริง (ไม่ใช่ Apex 37.50)
{
  const nc = P.nostrilCrossTime(), sp = P.spoutStartTime(), he = P.headExitTime();
  const ok = nc > 35.0 && nc < P.BREACH60.T_BREACH + 0.5 && sp < P.BREACH60.T_APEX &&
    Math.abs(sp - P.BREACH60.T_APEX) > 0.5;
  check('spout at nostril exit (not apex)',
    ok,
    `head exits ${he.toFixed(3)}s, nostril clears ${nc.toFixed(3)}s, spout starts ${sp.toFixed(3)}s (apex 37.50s)`);
}

// เสริม C. WhaleState: warm-up ไม่ดีดตัวข้ามช็อต (กระโดดของ node ต่อเฟรม < 40 px)
{
  const st = new W.WhaleState();
  let maxJump = 0;
  // จำลองตัดช็อตที่ 36.00 (เปลี่ยนหัว/พิทช์กะทันหันแบบ hard cut)
  st.update(P.whaleHeadAt(35.9), P.whalePitchDegAt(35.9), 35.9);
  st.beginShot();
  let prev = st.nodes;
  for (let k = 1; k <= 20; k++) {
    const t = 36.0 + k / 30;
    const nodes = st.update(P.whaleHeadAt(t), P.whalePitchDegAt(t), t);
    for (let i = 0; i < 12; i++) {
      const j = Math.hypot(nodes[i][0] - prev[i][0], nodes[i][1] - prev[i][1]);
      if (j > maxJump) maxJump = j;
    }
    prev = nodes;
  }
  check('WhaleState warm-up no pop',
    maxJump < 40,
    `max node jump/frame during 12-frame warm-up = ${maxJump.toFixed(1)} px (limit 40)`);
}

// เสริม D. v3 จุด 3: ตุ่มสันหลังวาฬ 10 -> 13 px (u 0.66–0.78 ค่อนไปทางโคนหางเหมือนเดิม)
{
  check('dorsal hump height 13px (u 0.66-0.78)',
    W.DORSAL_HUMP_H === 13 && W.DORSAL_HUMP_U0 === 0.66 && W.DORSAL_HUMP_U1 === 0.78,
    `DORSAL_HUMP_H=${W.DORSAL_HUMP_H} (v2 was 10) u=[${W.DORSAL_HUMP_U0}, ${W.DORSAL_HUMP_U1}]`);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
