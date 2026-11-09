// สคริปต์ทดสอบเดียวกันสำหรับ particles_opus.js และ particles_flash.js
// โหลด particleState(t) จากแต่ละไฟล์ แล้วเทียบตัวเลขที่ t = 0, 0.1, 0.5, 1.0, 2.0 วิ
// ตรวจ: จำนวนจุดแต่ละ emitter ตามเวลา, determinism (เรียกซ้ำได้ผลเดิม),
// Spout v0 Gaussian N(540,60) + กรวย 15° + แรงโน้มถ่วง,
// Splash มุม 30-75° + แรงโน้มถ่วง, Snow ลอยตัวขึ้น + Brownian noise (spread โตตามเวลา)
// หมายเหตุ: โมเดลอาจเลือกปล่อยอนุภาคทยอยเกิด (emission window) แทนระเบิดพร้อมกันที่ t=0
// จึงวัด v0/มุมที่เวลาแรกสุดที่มีตัวอย่างพอ (t=0 ถ้ามี ≥50 จุด ไม่งั้น t=0.1) แล้วระบุเวลาที่วัดไว้
const fs = require('fs');
const path = require('path');

function loadParticles(file) {
  const code = fs.readFileSync(path.join(__dirname, file), 'utf8');
  const fn = new Function(code + '\n; return particleState;');
  return { fn: fn(), code };
}

function mean(a) { return a.reduce((s, v) => s + v, 0) / a.length; }
function std(a) { const m = mean(a); return Math.sqrt(a.reduce((s, v) => s + (v - m) * (v - m), 0) / a.length); }
function fmt(n) { return n.toFixed(1); }

function analyze(name, file) {
  const { fn } = loadParticles(file);
  console.log(`\n===== ${name} =====`);
  const times = [0, 0.1, 0.5, 1.0, 2.0];
  const states = {};
  for (const t of times) states[t] = fn(t);
  // determinism: เรียกซ้ำที่ t=0.5 ต้องได้ผลเดิมทุกตัว
  const again = fn(0.5);
  let det = true;
  for (const k of ['spout', 'splash', 'snow']) {
    if (states[0.5][k].length !== again[k].length) { det = false; break; }
    for (let i = 0; i < states[0.5][k].length; i++) {
      if (states[0.5][k][i].x !== again[k][i].x || states[0.5][k][i].y !== again[k][i].y) { det = false; break; }
    }
    if (!det) break;
  }
  for (const t of times) {
    console.log(`counts t=${t}: spout ${states[t].spout.length} / splash ${states[t].splash.length} / snow ${states[t].snow.length} (เต็ม 250/400/80)`);
  }
  console.log(`deterministic (เรียกซ้ำ t=0.5 ได้ผลเดิม): ${det}`);

  // --- Spout: วัด v0/มุมที่เวลาแรกสุดที่มีตัวอย่าง ≥50 จุด ---
  const spT = states[0].spout.length >= 50 ? 0 : 0.1;
  const sp = states[spT].spout;
  const spV0 = sp.map(p => Math.hypot(p.vx, p.vy));
  const spAng = sp.map(p => Math.atan2(p.vx, -p.vy) * 180 / Math.PI); // 0 = ขึ้นตรง
  const spInCone = spAng.filter(a => Math.abs(a) <= 15).length / spAng.length * 100;
  const spOrigin = [mean(sp.map(p => p.x)), mean(sp.map(p => p.y))];
  console.log(`SPOUT measured @t=${spT} (n=${sp.length}): v0 mean ${fmt(mean(spV0))} std ${fmt(std(spV0))} px/s (ต้อง ~N(540,60); ถ้าวัดที่ t=0.1 vy โดน g ดึงไป ~29 px/s แล้ว) | angle from vertical: mean ${fmt(mean(spAng))}° max|angle| ${fmt(Math.max(...spAng.map(Math.abs)))}° | in 15° cone: ${spInCone.toFixed(1)}% | pos mean (${fmt(spOrigin[0])},${fmt(spOrigin[1])}) (กำเนิด ~(360,700))`);
  for (const t of [0.5, 1.0, 2.0]) {
    console.log(`SPOUT t=${t}: mean vy ${fmt(mean(states[t].spout.map(p => p.vy)))} px/s | mean y ${fmt(mean(states[t].spout.map(p => p.y)))} px`);
  }
  console.log(`SPOUT samples t=0.5 (3 จุดแรก): ${states[0.5].spout.slice(0, 3).map(p => `[${fmt(p.x)},${fmt(p.y)}]`).join(' ')}`);
  console.log(`SPOUT samples t=1.0 (3 จุดแรก): ${states[1.0].spout.slice(0, 3).map(p => `[${fmt(p.x)},${fmt(p.y)}]`).join(' ')}`);

  // --- Splash: วัดมุม/ความเร็วที่เวลาแรกสุดที่มีตัวอย่าง ≥50 จุด ---
  const slT = states[0].splash.length >= 50 ? 0 : 0.1;
  const sl = states[slT].splash;
  const slAng = sl.map(p => Math.atan2(-p.vy, Math.abs(p.vx)) * 180 / Math.PI);
  const slInRange = slAng.filter(a => a >= 30 && a <= 75).length / slAng.length * 100;
  const slV = sl.map(p => Math.hypot(p.vx, p.vy));
  const slLeft = sl.filter(p => p.vx < 0).length / sl.length * 100;
  const slOrigin = [mean(sl.map(p => p.x)), mean(sl.map(p => p.y))];
  console.log(`SPLASH measured @t=${slT} (n=${sl.length}): angle above horizontal mean ${fmt(mean(slAng))}° range ${fmt(Math.min(...slAng))}–${fmt(Math.max(...slAng))}° | in 30–75°: ${slInRange.toFixed(1)}% | speed mean ${fmt(mean(slV))} min ${fmt(Math.min(...slV))} max ${fmt(Math.max(...slV))} px/s | vx<0 (ซ้าย): ${slLeft.toFixed(1)}% (ต้อง ~50%) | pos mean (${fmt(slOrigin[0])},${fmt(slOrigin[1])}) (กำเนิด ~(360,900))`);
  for (const t of [0.5, 1.0, 2.0]) {
    console.log(`SPLASH t=${t}: mean vy ${fmt(mean(states[t].splash.map(p => p.vy)))} px/s | mean y ${fmt(mean(states[t].splash.map(p => p.y)))} px`);
  }
  console.log(`SPLASH samples t=0.5 (3 จุดแรก): ${states[0.5].splash.slice(0, 3).map(p => `[${fmt(p.x)},${fmt(p.y)}]`).join(' ')}`);
  console.log(`SPLASH samples t=1.0 (3 จุดแรก): ${states[1.0].splash.slice(0, 3).map(p => `[${fmt(p.x)},${fmt(p.y)}]`).join(' ')}`);

  // --- Snow: ลอยตัวขึ้น (mean y ลดลง) + Brownian (spread x โตตามเวลา) ---
  const sn0 = states[0].snow;
  const snX0 = sn0.map(p => p.x), snY0 = sn0.map(p => p.y);
  console.log(`SNOW t=0: n=${sn0.length} x range ${fmt(Math.min(...snX0))}–${fmt(Math.max(...snX0))} (ต้อง ~0–720) | y range ${fmt(Math.min(...snY0))}–${fmt(Math.max(...snY0))} (ต้อง ~0–1280) | mean vy ${fmt(mean(sn0.map(p => p.vy)))} px/s (ต้องเป็นลบ = ลอยขึ้น)`);
  for (const t of [0.5, 1.0, 2.0]) {
    const dx = states[t].snow.map((p, i) => p.x - snX0[i]);
    const dy = states[t].snow.map((p, i) => p.y - snY0[i]);
    console.log(`SNOW t=${t}: mean dy ${fmt(mean(dy))} px (ต้องเป็นลบ = ลอยขึ้น) | std(dx) ${fmt(std(dx))} px | std(dy) ${fmt(std(dy))} px (Brownian: spread ต้องโตตามเวลา) | mean y ${fmt(mean(states[t].snow.map(p => p.y)))}`);
  }
  console.log(`SNOW samples t=1.0 (3 จุดแรก): ${states[1.0].snow.slice(0, 3).map(p => `[${fmt(p.x)},${fmt(p.y)}]`).join(' ')}`);
  return { det, spT, spV0mean: mean(spV0), spV0std: std(spV0), spInCone, slT, slInRange, slLeft };
}

const opus = analyze('OPUS (particles_opus.js)', 'particles_opus.js');
const flash = analyze('FLASH (particles_flash.js)', 'particles_flash.js');
console.log('\n===== SUMMARY =====');
console.log(`Opus : det ${opus.det} spout v0 @t=${opus.spT} ${opus.spV0mean.toFixed(1)}±${opus.spV0std.toFixed(1)} cone ${opus.spInCone.toFixed(1)}% | splash 30-75° @t=${opus.slT} ${opus.slInRange.toFixed(1)}% left ${opus.slLeft.toFixed(1)}%`);
console.log(`Flash: det ${flash.det} spout v0 @t=${flash.spT} ${flash.spV0mean.toFixed(1)}±${flash.spV0std.toFixed(1)} cone ${flash.spInCone.toFixed(1)}% | splash 30-75° @t=${flash.slT} ${flash.slInRange.toFixed(1)}% left ${flash.slLeft.toFixed(1)}%`);
