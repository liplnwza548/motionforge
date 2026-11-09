/**
 * spinePoints(t) — ตำแหน่งจุดกระดูกสันหลังวาฬ 12 จุด สำหรับ Canvas 2D
 * คลื่นเดินจากหัวไปหาง (head → tail travelling wave) ในแนวตั้ง (dorso-ventral)
 *
 * ค่าคงที่ที่ใช้:
 *   L      = 400 px                 ความยาวลำตัว (หัวถึงโคนหาง/fluke)
 *   N      = 12                     จำนวนจุดกระดูกสันหลัง
 *   f      = 0.5 Hz                 ความถี่การโบกหาง
 *   ω      = 2πf = π ≈ 3.1416 rad/s ความถี่เชิงมุม
 *   λ      = 1.0 L                  ความยาวคลื่นบนลำตัว (ทั้งตัวยาว 1 ลูกคลื่น)
 *   Δφ     = 2π/(N-1) ≈ 0.5712 rad  (≈ 32.7°) phase lag ต่อข้อ
 *   A_MAX  = 0.12 L = 48 px         แอมพลิจูดสูงสุด (ที่ปลายหาง)
 *   A(s)   = A_MAX·(0.05 + 0.25s + 0.70s²), s = 0 (หัว) … 1 (หาง)
 *            → หัว ≈ 2.4 px, กลางตัว ≈ 16.8 px, หาง = 48 px
 *   X0, Y0 = (100, 200)             ตำแหน่งหัวบน canvas
 *
 * y_i(t) = Y0 + A(s_i) · sin(ω·t − i·Δφ)
 *   เครื่องหมายลบหน้า i·Δφ ทำให้ข้อถัดไปช้ากว่าข้อก่อนหน้า คลื่นจึงเดินจากหัวไปหาง
 * x_i ใช้วางต่อกันทีละท่อนยาว L/(N-1) เท่ากันทุกท่อน ลำตัวจึงไม่ยืดหรือหดขณะโค้ง
 *
 * @param {number} t เวลา (วินาที)
 * @returns {Array<[number, number]>} อาร์เรย์พิกัด [x, y] 12 จุด เรียงจากหัว (index 0) ไปหาง (index 11)
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
