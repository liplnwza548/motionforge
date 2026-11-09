/**
 * spinePoints(t) — บีน (Muse Spark) เขียนเองตามบรีฟเดียวกับ Opus/Flash
 * ตำแหน่งจุดกระดูกสันหลังวาฬ 12 จุด สำหรับ Canvas 2D
 * คลื่นเดินจากหัวไปหาง (travelling wave) ไม่ใช่ sine เดี่ยวทั้งตัว
 *
 * ค่าคงที่ที่ใช้ (ตามสูตร Handoff §4.1 + บทเรียน Prompt Vault รายการที่ 2):
 *   L      = 400 px                 ความยาวลำตัว
 *   N      = 12                     จำนวนจุด
 *   f      = 0.5 Hz                 ความถี่การโบกหาง
 *   OMEGA  = 2πf = π ≈ 3.1416 rad/s ความถี่เชิงมุม
 *   λ      = 1.0 L                  ความยาวคลื่น (ทั้งตัว 1 ลูกคลื่น)
 *   DPHI   = 2π/(N-1) ≈ 0.5712 rad  phase lag ต่อข้อ (~32.7°)
 *   A_MAX  = 0.12 L = 48 px         แอมพลิจูดสูงสุดที่ปลายหาง
 *   A(s)   = A_MAX·(0.05 + 0.25s + 0.70s²), s = 0 (หัว) … 1 (หาง)
 *   X0, Y0 = (100, 200)             ตำแหน่งหัวบน canvas
 *   arc-length correction: x += sqrt(SEG² − dy²) ทุกท่อน — รักษาความยาวท่อนคงที่
 *
 * y_i(t) = Y0 + A(s_i) · sin(ω·t − i·Δφ)
 *
 * @param {number} t เวลา (วินาที)
 * @returns {Array<[number, number]>} พิกัด [x, y] 12 จุด เรียงจากหัวไปหาง
 */
function spinePoints(t) {
  const L = 400;
  const N = 12;
  const OMEGA = 2 * Math.PI * 0.5;
  const DPHI = (2 * Math.PI) / (N - 1);
  const A_MAX = 0.12 * L;
  const X0 = 100, Y0 = 200;
  const SEG = L / (N - 1);

  const pts = [];
  let x = X0;
  let prevY = 0;

  for (let i = 0; i < N; i++) {
    const s = i / (N - 1);
    const A = A_MAX * (0.05 + 0.25 * s + 0.70 * s * s);
    const y = Y0 + A * Math.sin(OMEGA * t - i * DPHI);
    if (i > 0) {
      const dy = y - prevY;
      x += Math.sqrt(Math.max(SEG * SEG - dy * dy, 0));
    }
    pts.push([x, y]);
    prevY = y;
  }
  return pts;
}
