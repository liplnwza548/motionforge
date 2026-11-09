/**
 * คำนวณพิกัด 12 จุดของแนวกระดูกสันหลังวาฬ (N=12) สำหรับ Canvas 2D
 * จำลองการว่ายน้ำแบบ Travelling Wave เดินทางจากหัวไปยังหาง (Dorsoventral wave)
 *
 * @param {number} t - เวลาปัจจุบัน (วินาที) เช่น ค่าที่ได้จาก performance.now() / 1000
 * @returns {Array<[number, number]>} อาร์เรย์พิกัด 12 จุด [[x0, y0], [x1, y1], ..., [x11, y11]]
 */
function spinePoints(t) {
  // ===================== ค่าคงที่หลัก (Constants) =====================
  const N = 12;              // จำนวนข้อกระดูกสันหลัง (i = 0 คือหัว, i = 11 คือปลายหาง)
  const L = 360;             // ความยาวลำตัวรวม (Body Length L) หน่วย: พิกเซล
  const OMEGA = 3.6;         // ความถี่เชิงมุม (Angular Frequency ω) หน่วย: rad/s (~0.57 รอบ/วินาที)
  const PHASE_OFFSET = 0.35; // Phase lag ต่อข้อต่อ (Phase offset per joint) หน่วย: rad (~20 องศา/ข้อ)
  const MAX_AMPLITUDE = 48;  // แอมพลิจูดสูงสุดที่ปลายหาง (Max Amplitude A_max) หน่วย: พิกเซล

  // พิกัดจุดอ้างอิงตำแหน่งหัววาฬบนผืนผ้าใบ Canvas
  const originX = 120;
  const originY = 250;

  const points = [];
  const segmentLength = L / (N - 1); // ระยะห่างแนวแกน X ระหว่างแต่ละข้อต่อ

  for (let i = 0; i < N; i++) {
    // อัตราส่วนตำแหน่งตามแนวกระดูกสันหลัง u ∈ [0, 1] (0 = หัว, 1 = ปลายหาง)
    const u = i / (N - 1);

    // 1. แอมพลิจูดเพิ่มขึ้นแบบไม่เป็นเชิงเส้น (Non-linear Envelope):
    //    - ส่วนหัว (u=0) ขยับน้อยมาก (~4% ของ A_max) เพื่อรักษาเสถียรภาพการนำทาง
    //    - แอมพลิจูดจะค่อยๆ ขยายตัวแบบยกกำลังสอง (u^2) สู่โคนหางและแพนหาง (Fluke)
    const amplitude = MAX_AMPLITUDE * (0.04 + 0.96 * Math.pow(u, 2));

    // 2. คลื่นเดินทาง (Travelling Wave Phase):
    //    - การใช้เครื่องหมายลบ (- i * PHASE_OFFSET) ทำให้สันคลื่นเดินทางจากหัว (i=0) ไปหาง (i=11)
    //    - แต่ละข้อต่อจะมี delay ตามลำดับ ทำให้ไม่เกิดการแกว่งพร้อมกันทั้งตัวแบบ sine เดี่ยว
    const phase = OMEGA * t - (i * PHASE_OFFSET);

    // 3. คำนวณพิกัด [x, y]
    const x = originX + (i * segmentLength);
    const y = originY + amplitude * Math.sin(phase);

    points.push([x, y]);
  }

  return points;
}
