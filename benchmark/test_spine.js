// สคริปต์ทดสอบเดียวกันสำหรับ spine_opus.js และ spine_flash.js
// โหลด spinePoints จากแต่ละไฟล์ แล้วเทียบพิกัดที่ t = 0, 0.5, 1.0 วิ
// ตรวจ: จำนวนจุด, แอมพลิจูดหัว vs หาง, phase lag, ความยาวท่อนกระดูก
const fs = require('fs');
const path = require('path');

function loadSpine(file) {
  const code = fs.readFileSync(path.join(__dirname, file), 'utf8');
  const fn = new Function(code + '\n; return spinePoints;');
  return fn();
}

function fmt(pts) {
  return pts.map(p => `[${p[0].toFixed(1)},${p[1].toFixed(1)}]`).join(' ');
}

function analyze(name, spinePoints) {
  const times = [0, 0.5, 1.0];
  console.log(`\n===== ${name} =====`);
  const all = {};
  for (const t of times) {
    const pts = spinePoints(t);
    all[t] = pts;
    console.log(`t=${t.toFixed(1)}s n=${pts.length} : ${fmt(pts)}`);
  }
  // แอมพลิจูดหัว (i=0) vs หาง (i=11) จากการสแกน t 0..4 วิ ทีละ 0.01
  const y0 = spinePoints(0)[0][1];
  let headMax = 0, tailMax = 0;
  const tailPeakTimes = [];
  for (let k = 0; k <= 400; k++) {
    const t = k * 0.01;
    const pts = spinePoints(t);
    headMax = Math.max(headMax, Math.abs(pts[0][1] - y0));
    tailMax = Math.max(tailMax, Math.abs(pts[11][1] - y0));
  }
  // เวลาที่แต่ละข้อถึงยอดคลื่น (y สูงสุด) ในรอบแรก — ใช้ตรวจ phase lag / ทิศคลื่น
  const peakT = [];
  for (let i = 0; i < 12; i++) {
    let best = -Infinity, bt = 0;
    for (let k = 0; k <= 400; k++) {
      const t = k * 0.01;
      const y = spinePoints(t)[i][1];
      if (y > best) { best = y; bt = t; }
    }
    peakT.push(bt);
  }
  // ความยาวท่อนกระดูกที่ t=0.5 (ควรคงที่ถ้ารักษา arc length)
  const segLens = [];
  const p05 = all[0.5];
  for (let i = 1; i < 12; i++) {
    segLens.push(Math.hypot(p05[i][0] - p05[i-1][0], p05[i][1] - p05[i-1][1]));
  }
  const segMin = Math.min(...segLens), segMax = Math.max(...segLens);
  console.log(`head |dy|max = ${headMax.toFixed(2)} px | tail |dy|max = ${tailMax.toFixed(2)} px | ratio tail/head = ${(tailMax / Math.max(headMax, 0.001)).toFixed(1)}x`);
  console.log(`peak time per joint (s): ${peakT.map(v => v.toFixed(2)).join(' ')}`);
  console.log(`peak time monotonic increasing (wave travels head->tail): ${peakT.every((v, i) => i === 0 || v >= peakT[i-1] - 0.01)}`);
  console.log(`segment lengths @t=0.5: min ${segMin.toFixed(2)} max ${segMax.toFixed(2)} spread ${((segMax - segMin)).toFixed(2)} px (${(((segMax - segMin) / segMin) * 100).toFixed(1)}%)`);
  return { headMax, tailMax, peakT, segSpreadPct: ((segMax - segMin) / segMin) * 100 };
}

const opus = analyze('OPUS (spine_opus.js)', loadSpine('spine_opus.js'));
const flash = analyze('FLASH (spine_flash.js)', loadSpine('spine_flash.js'));
console.log('\n===== SUMMARY =====');
console.log(`Opus : head ${opus.headMax.toFixed(2)}px tail ${opus.tailMax.toFixed(2)}px segSpread ${opus.segSpreadPct.toFixed(1)}%`);
console.log(`Flash: head ${flash.headMax.toFixed(2)}px tail ${flash.tailMax.toFixed(2)}px segSpread ${flash.segSpreadPct.toFixed(1)}%`);
