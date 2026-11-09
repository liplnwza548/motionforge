// วัดค่าเริ่มต้นตรงจาก seeded cache + วัด snow แบบ unwrap (แก้ wrap ขอบฉาก)
// เหตุผล (บันทึกไว้ใน §9.5 ของ benchmark แล้ว): วัด v0/มุมจากสถานะที่ t>0 ตรงๆ ไม่ได้
// เพราะ g/drag บิดค่าไปแล้ว และวัด spread ของ snow แบบตรงๆ ไม่ได้เพราะ wrap ทำให้ dx กระโดด ~720 px
const fs = require('fs');
const path = require('path');
const code = fs.readFileSync(path.join(__dirname, 'particles_bean.js'), 'utf8');
const particleState = new Function(code + '\n; return particleState;')();
particleState(0); // สร้าง cache
const C = particleState._cache;
const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;
const std = (a) => { const m = mean(a); return Math.sqrt(a.reduce((s, v) => s + (v - m) * (v - m), 0) / a.length); };
// Spout: ค่าตั้งต้นตรงจาก cache (vx0, vy0)
const spV0 = C.spout.map((p) => Math.hypot(p.vx0, p.vy0));
const spAng = C.spout.map((p) => (Math.atan2(p.vx0, -p.vy0) * 180) / Math.PI);
console.log(`SPOUT initial (n=${C.spout.length}): v0 mean ${mean(spV0).toFixed(1)} std ${std(spV0).toFixed(1)} px/s (ต้อง N(540,60)) | angle max|.| ${Math.max(...spAng.map(Math.abs)).toFixed(2)}° in ±15°: ${(spAng.filter((a) => Math.abs(a) <= 15).length / spAng.length * 100).toFixed(1)}%`);
// Splash: ค่าตั้งต้นตรงจาก cache
const slAng = C.splash.map((p) => (Math.atan2(-p.vy0, Math.abs(p.vx0)) * 180) / Math.PI);
const slV = C.splash.map((p) => Math.hypot(p.vx0, p.vy0));
const slLeft = C.splash.filter((p) => p.vx0 < 0).length / C.splash.length * 100;
console.log(`SPLASH initial (n=${C.splash.length}): angle mean ${mean(slAng).toFixed(1)}° range ${Math.min(...slAng).toFixed(1)}–${Math.max(...slAng).toFixed(1)}° in 30–75°: ${(slAng.filter((a) => a >= 30 && a <= 75).length / slAng.length * 100).toFixed(1)}% | v0 mean ${mean(slV).toFixed(1)} min ${Math.min(...slV).toFixed(1)} max ${Math.max(...slV).toFixed(1)} | vx<0: ${slLeft.toFixed(1)}%`);
// Snow: spread แบบ unwrap (dx วนในช่วง [-360,360], dy ในช่วง [-640,640])
const s0 = particleState(0).snow;
const unwrap = (d, m) => ((d + m / 2) % m + m) % m - m / 2;
for (const t of [0.5, 1.0, 2.0]) {
  const st = particleState(t).snow;
  const dx = st.map((p, i) => unwrap(p.x - s0[i].x, 720));
  const dy = st.map((p, i) => unwrap(p.y - s0[i].y, 1280));
  console.log(`SNOW t=${t}: mean dy ${mean(dy).toFixed(1)} px (ต้องเป็นลบ = ลอยขึ้น) | std(dx) ${std(dx).toFixed(1)} px | std(dy) ${std(dy).toFixed(1)} px | ratio std(dx) vs t=0.5: ${(std(dx) / 4.9).toFixed(2)} (random walk จริงต้องโตตาม √t: t=1 → 1.41×, t=2 → 2.00×)`);
}
