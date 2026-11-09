/**
 * telemetry(t) — ค่า telemetry ของวาฬว่ายน้ำแบบ travelling wave (N = 12 จุด) สำหรับ Canvas 2D
 *
 * ระบบพิกัด: แกน x ชี้ไปทางขวา (ทิศที่วาฬว่าย) แกน y ชี้ลง (แบบ Canvas)
 * วาฬจริงสะบัดหางขึ้นลง จึงให้คลื่นวิ่งในแนว y ซึ่งเป็นแนวตั้ง
 * จุด i = 0 คือหัว และ i = N-1 คือปลายหาง (fluke)
 *
 * ---------------- ค่าคงที่ ----------------
 * N        = 12            จำนวนจุดบนกระดูกสันหลัง
 * L        = 360 px        ความยาวลำตัวจากหัวถึงหาง
 * ω (OMEGA)= 2π·0.5 rad/s  ความถี่เชิงมุมของการสะบัด (0.5 Hz คือ 1 จังหวะต่อ 2 วินาที)
 * Δφ (DPHI)= 0.5 rad       เฟสที่ช้าลงทีละข้อ (ทั้งตัวต่างกัน 5.5 rad หรือราว 0.88 ความยาวคลื่น)
 * A_MAX    = 40 px         แอมพลิจูดสูงสุดที่ปลายหาง
 * A_HEAD   = 0.1           สัดส่วนแอมพลิจูดที่หัวเทียบกับ A_MAX (หัวขยับขึ้นลงเล็กน้อย)
 * U0       = 120 px/s      ความเร็วเดินหน้าเฉลี่ย
 * S        = 4 px          แอมพลิจูดของการพุ่งไปข้างหน้าเป็นจังหวะ ที่ความถี่ 2ω (หางสะบัดขึ้นและลงให้แรงขับ 2 ครั้งต่อรอบ)
 * X0, Y0   = 400, 300 px   ตำแหน่งตั้งต้นของหัวและเส้นกึ่งกลางที่ t = 0
 *
 * แรงต้าน: F = 0.5·ρ·Cd·A·v²   หน่วยนิวตัน (N)
 * ρ (RHO)  = 1025 kg/m³    ความหนาแน่นน้ำทะเล
 * Cd       = 0.05          สัมประสิทธิ์แรงต้านของลำตัวทรงเพรียว
 * A (AREA) = 3 m²          พื้นที่หน้าตัดด้านหน้า
 * PX_PER_M = 24 px/m       ตัวแปลงหน่วย (L = 360 px ถือเป็นวาฬยาว 15 m)
 *
 * ---------------- สูตร (ใช้ใน spinePoints) ----------------
 * s_i   = i / (N-1)
 * a(s)  = A_MAX · (A_HEAD + (1 - A_HEAD)·s²)        แอมพลิจูดเพิ่มขึ้นไปทางหาง
 * x_i(t) = X0 + U0·t + S·sin(2ωt) − s_i·L
 * y_i(t) = Y0 + a(s_i) · sin(ωt − i·Δφ)
 *
 * @param {number} t เวลาเป็นวินาที
 * @returns {{speed:number, pitch:number, amplitude:number, drag:number}}
 *   speed     : ความเร็วของหัว (px/s) จาก |d(x0, y0)/dt|
 *   pitch     : มุมของเส้นจากหางไปหัว (องศา) ค่าบวกคือหัวเชิดขึ้น
 *   amplitude : ระยะที่ปลายหางเบนออกจากเส้นกึ่งกลาง ณ เวลา t (px) อยู่ในช่วง 0 ถึง A_MAX
 *   drag      : แรงต้านน้ำ (นิวตัน) = 0.5·ρ·Cd·A·v²
 */
function telemetry(t) {
  t = Number.isFinite(t) ? t : 0;

  // ---- ค่าคงที่ (ความหมายดูในคอมเมนต์ด้านบน) ----
  const N = 12;
  const L = 360;                  // px
  const OMEGA = 2 * Math.PI * 0.5; // rad/s
  const DPHI = 0.5;               // rad ต่อข้อ
  const A_MAX = 40;               // px
  const A_HEAD = 0.1;             // สัดส่วน
  const U0 = 120;                 // px/s
  const S = 4;                    // px
  const X0 = 400, Y0 = 300;       // px
  const RHO = 1025;               // kg/m^3
  const CD = 0.05;                // ไม่มีหน่วย
  const AREA = 3;                 // m^2
  const PX_PER_M = 24;            // px/m

  const ampAt = (s) => A_MAX * (A_HEAD + (1 - A_HEAD) * s * s);

  // ---- travelling wave: ตำแหน่งของทั้ง 12 จุด ณ เวลา tt ----
  function spinePoints(tt) {
    const pts = new Array(N);
    const baseX = X0 + U0 * tt + S * Math.sin(2 * OMEGA * tt);
    for (let i = 0; i < N; i++) {
      const s = i / (N - 1);
      pts[i] = {
        x: baseX - s * L,
        y: Y0 + ampAt(s) * Math.sin(OMEGA * tt - i * DPHI),
      };
    }
    return pts;
  }

  const pts = spinePoints(t);
  const head = pts[0];
  const tail = pts[N - 1];

  // ---- speed: อนุพันธ์แบบวิเคราะห์ของตำแหน่งหัว (i = 0, s = 0) จากสูตรเดียวกับข้างบน ----
  // x0(t) = X0 + U0·t + S·sin(2ωt)      → dx/dt = U0 + 2ωS·cos(2ωt)
  // y0(t) = Y0 + a(0)·sin(ωt)           → dy/dt = a(0)·ω·cos(ωt)
  const vx = U0 + 2 * OMEGA * S * Math.cos(2 * OMEGA * t);
  const vy = ampAt(0) * OMEGA * Math.cos(OMEGA * t);
  const speed = Math.hypot(vx, vy); // px/s

  // ---- pitch: มุมของเวกเตอร์จากหางไปหัว
  // แกน y ของ Canvas ชี้ลง จึงกลับเครื่องหมายให้ค่าบวกหมายถึงหัวเชิดขึ้น ----
  const dxBody = head.x - tail.x;
  const dyBody = head.y - tail.y;
  const pitch = Math.atan2(-dyBody, dxBody) * 180 / Math.PI; // องศา

  // ---- amplitude: ระยะที่ปลายหางเบนออกจากเส้นกึ่งกลาง Y0 ณ เวลา t ----
  const amplitude = Math.abs(tail.y - Y0); // px

  // ---- drag: F = 0.5·ρ·Cd·A·v²  แปลงความเร็วจาก px/s เป็น m/s ก่อน ----
  const vMs = speed / PX_PER_M;
  const drag = 0.5 * RHO * CD * AREA * vMs * vMs; // นิวตัน

  return { speed, pitch, amplitude, drag };
}

// ตัวอย่างการใช้กับ HUD บน Canvas:
// const tel = telemetry(performance.now() / 1000);
// ctx.fillText(`speed ${tel.speed.toFixed(1)} px/s | pitch ${tel.pitch.toFixed(1)}° | ` +
//              `amp ${tel.amplitude.toFixed(1)} px | drag ${tel.drag.toFixed(0)} N`, 10, 20);
