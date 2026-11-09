/**
 * telemetry(t) — บีน (Muse Spark) เขียนเองตามบรีฟเดียวกับ Opus/Flash
 * ค่า telemetry ของวาฬว่ายน้ำแบบ travelling wave (N = 12 จุด) สำหรับ Canvas 2D
 * แกน x ชี้ขวา (ทิศที่วาฬว่าย) แกน y ชี้ลง (แบบ Canvas) จุด i=0 คือหัว i=11 คือปลายหาง
 *
 * บทเรียน Prompt Vault รายการที่ 5 ที่ใส่ไว้ตั้งแต่ต้น:
 * - amplitude ต้องคืนเป็นค่าสัมบูรณ์ |tail displacement| (≥0 เสมอ ห้ามติดลบ)
 * - ความเร็วเดินหน้าต้องมี surge ที่ความถี่ 2ω (x_head มีเทอม S·sin(2ωt))
 * - ใช้ค่าคงที่ L/ω/A_MAX ชุดเดียวกับ spine ขั้นที่ 1 ของตัวเอง (L=400, ω=π, A_MAX=48)
 *
 * ค่าคงที่:
 * N = 12, L = 400 px, OMEGA = 2π·0.5 rad/s, DPHI ≈ 0.5712 rad ต่อข้อ (2π/11)
 * A_MAX = 48 px, A_HEAD = 0.05 (หัวขยับ 5% ของหาง), U0 = 120 px/s, S = 4 px
 * X0, Y0 = 100, 200 px (ตำแหน่งหัว/เส้นกึ่งกลางที่ t=0 — ตรงกับ spine_bean.js)
 * แรงต้าน: drag = 0.5·ρ·Cd·A·v², ρ=1025 kg/m³, Cd=0.05, A=3 m², PX_PER_M=24 px/m
 *
 * สูตร: x_i(t) = X0 + U0·t + S·sin(2ωt) − s_i·L ; y_i(t) = Y0 + a(s_i)·sin(ωt − i·Δφ)
 * a(s) = A_MAX·(A_HEAD + (1−A_HEAD)·s²)
 *
 * @param {number} t เวลาเป็นวินาที
 * @returns {{speed:number, pitch:number, amplitude:number, drag:number}}
 */
function telemetry(t) {
  t = Number.isFinite(t) ? t : 0;
  const N = 12;
  const L = 400;
  const OMEGA = 2 * Math.PI * 0.5;
  const DPHI = 0.5712; // = 2π/(N-1) ≈ 0.5712 rad ต่อข้อ (เขียนเป็นตัวเลขเพื่อให้สคริปต์ทดสอบอ่านค่าได้เหมือนไฟล์ครู/นักเรียน)
  const A_MAX = 48;
  const A_HEAD = 0.05;
  const U0 = 120;
  const S = 4;
  const X0 = 100, Y0 = 200;
  const RHO = 1025, CD = 0.05, AREA = 3, PX_PER_M = 24;

  const ampAt = (s) => A_MAX * (A_HEAD + (1 - A_HEAD) * s * s);
  function spinePoints(tt) {
    const pts = new Array(N);
    const baseX = X0 + U0 * tt + S * Math.sin(2 * OMEGA * tt);
    for (let i = 0; i < N; i++) {
      const s = i / (N - 1);
      pts[i] = { x: baseX - s * L, y: Y0 + ampAt(s) * Math.sin(OMEGA * tt - i * DPHI) };
    }
    return pts;
  }
  const pts = spinePoints(t);
  const head = pts[0], tail = pts[N - 1];
  // speed: อนุพันธ์วิเคราะห์ของตำแหน่งหัว — vx = U0 + 2ωS·cos(2ωt), vy = a(0)·ω·cos(ωt)
  const vx = U0 + 2 * OMEGA * S * Math.cos(2 * OMEGA * t);
  const vy = ampAt(0) * OMEGA * Math.cos(OMEGA * t);
  const speed = Math.hypot(vx, vy);
  // pitch: มุมของเวกเตอร์หาง→หัว (แกน y ชี้ลง จึงกลับเครื่องหมายให้บวก = หัวเชิดขึ้น)
  const pitch = Math.atan2(-(head.y - tail.y), head.x - tail.x) * 180 / Math.PI;
  // amplitude: ค่าสัมบูรณ์ของระยะที่ปลายหางเบนจากเส้นกึ่งกลาง (≥0 เสมอ)
  const amplitude = Math.abs(tail.y - Y0);
  // drag: F = 0.5·ρ·Cd·A·v² แปลงความเร็ว px/s → m/s ก่อน
  const vMs = speed / PX_PER_M;
  const drag = 0.5 * RHO * CD * AREA * vMs * vMs;
  return { speed, pitch, amplitude, drag };
}
