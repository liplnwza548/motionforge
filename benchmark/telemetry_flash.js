/**
 * คำนวณค่า Telemetry ของวาฬว่ายน้ำแบบ Travelling Wave 12 จุด (N=12)
 * สำหรับใช้งานบน Canvas 2D
 * 
 * =========================================================================
 * ค่าคงที่จลนศาสตร์การเคลื่อนที่ของวาฬ (Kinematic Constants):
 * - N       = 12      : จำนวนจุดข้อต่อแนวกระดูกสันหลัง (Spine Points) หัว=0, หาง=11
 * - L       = 220     : ความยาวลำตัวตามแนวกระดูกสันหลัง (px)
 * - OMEGA   = 4.5     : ความถี่เชิงมุมของการกวัดแกว่งลำตัว (rad/s) (~0.71 Hz)
 * - DELTA_PHI = 0.38  : เฟสเยื้องระหว่างจุดกระดูกสันหลังที่ติดกัน (rad) (~21.8°)
 * - A_MAX   = 36      : แอมพลิจูดสูงสุดที่ส่วนปลายหาง/แพนหาง (px)
 * - HEAD_AMP_RATIO = 0.15 : อัตราส่วนแอมพลิจูดที่หัวต่อหาง (หัวส่าย ~15% ของหาง)
 * - V0      = 110     : ความเร็วพื้นฐานการเคลื่อนที่ไปข้างหน้าตามแนวราบ (px/s)
 * 
 * ค่าคงที่ทางชลศาสตร์และการคำนวณแรงต้านน้ำ (Hydrodynamic Constants):
 * - RHO     = 1025    : ความหนาแน่นของน้ำทะเล (kg/m³)
 * - CD      = 0.045   : สัมประสิทธิ์แรงต้านรูปทรงเพรียวของวาฬ (Drag Coefficient)
 * - A_FRONTAL = 1.6   : พื้นที่หน้าตัดปะทะน้ำของวาฬ (Frontal Reference Area, m²)
 * - PX_TO_M = 0.05    : อัตราแปลงพิกัด 1 px = 0.05 เมตร (ความยาววาฬ L=220px ≈ 11 เมตร)
 * - k       = 0.5 * RHO * CD * A_FRONTAL * (PX_TO_M^2) ≈ 0.09225
 *             (ตัวประกอบรวมสำหรับคำนวณ drag ในหน่วยนิวตัน N จาก speed ในหน่วย px/s)
 * =========================================================================
 * 
 * @param {number} t - เวลาปัจจุบัน (วินาที)
 * @returns {{ speed: number, pitch: number, amplitude: number, drag: number }}
 */
function telemetry(t) {
  // 1. นิยามพารามิเตอร์กระดูกสันหลังและคลื่น travelling wave
  const N = 12;
  const L = 220;                     // px
  const OMEGA = 4.5;                 // rad/s
  const DELTA_PHI = 0.38;            // rad per segment
  const A_MAX = 36;                  // px
  const HEAD_AMP_RATIO = 0.15;
  const A_HEAD = A_MAX * HEAD_AMP_RATIO; // 5.4 px (แอมพลิจูดการส่ายของหัว)
  const V0 = 110;                    // px/s (ความเร็วเดินหน้าตามแนวแกน X)

  // 2. คำนวณความเร็วหัววาฬ (speed) จากอนุพันธ์เทียบเวลา (Time Derivative)
  // ตำแหน่งหัวที่ t:
  // x_head(t) = V0 * t
  // y_head(t) = y_center + A_HEAD * sin(OMEGA * t)
  //
  // อนุพันธ์อันดับ 1 เทียบกับเวลา t:
  // dx_head/dt = V0
  // dy_head/dt = A_HEAD * OMEGA * cos(OMEGA * t)
  const vx_head = V0;
  const vy_head = A_HEAD * OMEGA * Math.cos(OMEGA * t);
  const speed = Math.hypot(vx_head, vy_head); // หน่วย: px/s

  // 3. คำนวณมุมเอียงลำตัว (pitch) จากเส้นเชื่อมหัว (i=0) ถึงหาง (i=11)
  // สูตร travelling wave สำหรับจุดที่ i:
  // y_i(t) = y_center + A_i * sin(OMEGA * t - i * DELTA_PHI)
  // x_i(t) = x_head(t) - i * (L / (N - 1))
  const tailIndex = N - 1; // 11
  const phaseTail = OMEGA * t - tailIndex * DELTA_PHI;
  const yHeadRel = A_HEAD * Math.sin(OMEGA * t);
  const yTailRel = A_MAX * Math.sin(phaseTail);

  // เวกเตอร์จากหางไปยังหัว (ทิศทางการพุ่งไปข้างหน้า):
  // dx = x_head - x_tail = L
  // dy = y_head - y_tail = yHeadRel - yTailRel
  // หมายเหตุบน Canvas 2D แกน Y ชี้ลง: ถ้าหัวยกสูงกว่าหาง (y_head < y_tail) ถือว่าหัวเชิด (pitch เป็นบวก)
  const dx = L;
  const dyCanvas = yHeadRel - yTailRel;
  const pitch = Math.atan2(-dyCanvas, dx) * (180 / Math.PI); // หน่วย: องศา (degrees)

  // 4. แอมพลิจูดสะบัดของหาง ณ เวลา t (instantaneous tail displacement)
  // ระยะเบี่ยงเบนจากแนวแกนกลางของแพนหาง (จุดที่ 11) ณ เวลา t
  const amplitude = A_MAX * Math.sin(phaseTail); // หน่วย: px (มีเครื่องหมายตามจังหวะสะบัดขึ้น-ลง)

  // 5. คำนวณแรงต้านน้ำ (Hydrodynamic Drag)
  // สูตร: Drag = 0.5 * rho * Cd * A_frontal * (speed_m_s)^2
  // แปลง speed จาก px/s เป็น m/s ก่อนคำนวณ เพื่อให้ได้แรงต้านในหน่วยสากล (นิวตัน: N)
  const RHO = 1025;       // kg/m³
  const CD = 0.045;       // ไร้หน่วย
  const A_FRONTAL = 1.6;  // m²
  const PX_TO_M = 0.05;   // 1 px = 0.05 m
  const speedMetersPerSec = speed * PX_TO_M;
  const drag = 0.5 * RHO * CD * A_FRONTAL * (speedMetersPerSec * speedMetersPerSec); // หน่วย: นิวตัน (N)

  return {
    speed,      // ความเร็วหัววาฬชั่วขณะ (px/s)
    pitch,      // มุมเอียงลำตัวหัว-หาง (องศา: +เชิดหัวขึ้น, -ก้มหัวลง)
    amplitude,  // ระยะเบี่ยงเบนสะบัดของหาง ณ เวลา t (px)
    drag        // แรงต้านของน้ำต่อตัววาฬ (N: นิวตัน)
  };
}
