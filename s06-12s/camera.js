/**
 * camera.js — v3 (S06, คำวิจารณ์ Opus §16.8: ค4 + ข1 + ข7)
 * เปลี่ยนจาก v2:
 *   - ซูมสัมพัทธ์ 1.0→1.12 ช่วง Beat โซนาร์/หอย (Opus ค4: ซูม 1.0→1.15 —
 *     ใช้ 1.12 แทน 1.15 เพื่อให้ขอบขวาหอย (world x≈649) ยังอยู่ในเฟรมที่
 *     scale 0.82·1.12=0.918; วัด margin จริงใน test_breach.js)
 *     สเกลฐานคง 0.82x เหมือน v2 (L=300 เล็กลงแล้ว ไม่ต้องซูมออกตอนบิน)
 *   - ตามวาฬ: cx = กึ่งกลาง extent โครงร่างวาฬจริง (รวมครีบ/หาง — Opus ค1:
 *     เช็กทุกจุดของโครงร่าง ไม่ใช่แค่ 12 จุดกระดูก); ช่วง Beat 1 รวม
 *     กล่องหอยเข้าไปด้วยเพื่อให้วาฬ+หอยอยู่ในเฟรมพร้อมกัน
 *   - สั่นตอนกระแทกน้ำ: 6px·exp(−t/0.25)·noise นาน 0.4 วิ (Opus ค4)
 *   - Vertical Pan ผูก T_APEX/T_REENTRY/T_SETTLE ใหม่ (7.855/8.799/10.4)
 *   - cy คำนวณจาก WATER_Y=760 (v2 hardcode 900)
 *
 * พิกัด: world 720x1280 (y ชี้ลง, ผิวน้ำ WATER_Y=760), จอ Render คือ
 *   x ∈ [SPLIT=274, 720] (กว้าง 446), y ∈ [0, 1280]
 *   screenX = 274 + 223 + (wx − camCx)·scale
 *   screenY = 640 + (wy − camCy)·scale
 */

const CAM = {
  SCALE_SWIM: 0.82,     // สเกลโลกฐานฝั่ง Render (คงเดิม v2)
  ZOOM_BEAT1: 1.12,     // ซูมสัมพัทธ์ช่วง Beat โซนาร์/หอย (Opus ค4: 1.0→1.15, ใช้ 1.12)
  WATER_BEAT1: 520,     // Vertical Pan: ผิวน้ำบนจอช่วง Beat 1
  WATER_BREACH: 900,    // Vertical Pan: ผิวน้ำบนจอช่วง Breach
  T_ZOOM_START: 1.5,    // เริ่มซูมเข้าตอน ping แรก
  T_ZOOM_FULL: 3.0,     // ซูมเต็มที่ตอน ping 3
  SHAKE_AMP: 6,         // สั่นตอนกระแทกน้ำ 6 px (Opus ค4)
  SHAKE_TAU: 0.25,      // สั่นจาง exp(−t/0.25)
  SHAKE_DUR: 0.4,       // สั่นนาน 0.4 วิ
};

// ตำแหน่งผิวน้ำบนจอ (px) ณ เวลา t
function waterScreenY(t) {
  const B = BREACH;
  if (t < B.T_LAUNCH) return CAM.WATER_BEAT1;
  if (t < B.T_APEX) {
    const s = smooth01((t - B.T_LAUNCH) / (B.T_APEX - B.T_LAUNCH));
    return CAM.WATER_BEAT1 + (CAM.WATER_BREACH - CAM.WATER_BEAT1) * s;
  }
  if (t < B.T_REENTRY) return CAM.WATER_BREACH;
  if (t < B.T_SETTLE) {
    const s = smooth01((t - B.T_REENTRY) / (B.T_SETTLE - B.T_REENTRY));
    return CAM.WATER_BREACH + (CAM.WATER_BEAT1 - CAM.WATER_BREACH) * s;
  }
  return CAM.WATER_BEAT1;
}

// แฟกเตอร์ซูมสัมพัทธ์ ณ เวลา t (1.0 → 1.12 ช่วงโซนาร์/หอย → 1.0 ตอนพุ่ง)
function zoomFactor(t) {
  const B = BREACH;
  if (t < CAM.T_ZOOM_START) return 1;
  if (t < CAM.T_ZOOM_FULL) return 1 + (CAM.ZOOM_BEAT1 - 1) * smooth01((t - CAM.T_ZOOM_START) / (CAM.T_ZOOM_FULL - CAM.T_ZOOM_START));
  if (t < B.T_PRE) return CAM.ZOOM_BEAT1;
  if (t < B.T_LAUNCH) return CAM.ZOOM_BEAT1 + (1 - CAM.ZOOM_BEAT1) * smooth01((t - B.T_PRE) / (B.T_LAUNCH - B.T_PRE));
  return 1;
}

// สเกลกล้อง ณ เวลา t
function cameraScale(t) {
  return CAM.SCALE_SWIM * zoomFactor(t);
}

// ปลายหาง fluke 4 จุด (สูตรเดียวกับ drawWhale/whaleOutlinePoints — ยาว 30/18 px)
function whaleFlukeTips(pts) {
  const tail = pts[11], prev = pts[10];
  const ang = Math.atan2(tail[1] - prev[1], tail[0] - prev[0]);
  const tips = [];
  for (const s of [-1, 1]) {
    const a1 = ang + s * 0.5, a2 = ang + s * 1.05;
    tips.push([tail[0] + Math.cos(a1) * 30, tail[1] + Math.sin(a1) * 30]);
    tips.push([tail[0] + Math.cos(a2) * 18, tail[1] + Math.sin(a2) * 18]);
  }
  return tips;
}

// จุดทั้งหมดของวาฬที่ใช้หาขอบเขต (โครงร่าง ±ความกว้าง + fluke)
function whaleExtentPoints(t) {
  return whaleOutlinePoints(t);
}

// พารามิเตอร์กล้อง {scale, cx, cy} ณ เวลา t
function cameraFor(t) {
  const scale = cameraScale(t);
  const ext = whaleExtentPoints(t);
  let minX = Infinity, maxX = -Infinity;
  for (const [x] of ext) { if (x < minX) minX = x; if (x > maxX) maxX = x; }
  // Beat 1: รวมกล่องหอย (SHELL.X−2R .. SHELL.X — hinge อยู่ขอบขวา) ให้วาฬ+หอยอยู่ในเฟรมพร้อมกัน
  if (t < BREACH.T_LAUNCH && typeof SHELL !== 'undefined') {
    minX = Math.min(minX, SHELL.X - 2 * SHELL.R);
    maxX = Math.max(maxX, SHELL.X);
  }
  const cx0 = (minX + maxX) / 2;
  let cx = cx0;
  let cy = WATER_Y + (640 - waterScreenY(t)) / scale;
  // สั่นตอนกระแทกน้ำ (หัวแตะผิวขาลง) — 6px·exp(−dt/0.25)·noise นาน 0.4 วิ
  const ev = breachEvents();
  const dtS = t - ev.tHeadDownCross;
  if (dtS >= 0 && dtS < CAM.SHAKE_DUR) {
    const s = CAM.SHAKE_AMP * Math.exp(-dtS / CAM.SHAKE_TAU);
    cx += s * Math.sin(t * 47);
    cy += s * 0.7 * Math.cos(t * 31);
  }
  return { scale, cx, cy };
}

// แปลงพิกัดโลก → พิกัดจอ (ใช้กล้อง ณ เวลา t)
function worldToScreen(wx, wy, t) {
  const cam = cameraFor(t);
  return [274 + 223 + (wx - cam.cx) * cam.scale, 640 + (wy - cam.cy) * cam.scale];
}

// ขอบเขตของวาฬบนจอ (px) — ใช้ในเทสต์ว่าวาฬไม่หลุดขอบเฟรม
function whaleScreenBounds(t) {
  const ext = whaleExtentPoints(t);
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const [x, y] of ext) {
    const [sx, sy] = worldToScreen(x, y, t);
    if (sx < minX) minX = sx; if (sx > maxX) maxX = sx;
    if (sy < minY) minY = sy; if (sy > maxY) maxY = sy;
  }
  return { minX, maxX, minY, maxY };
}
