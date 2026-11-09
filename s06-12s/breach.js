/**
 * breach.js — v3 (S06 เต็ม 12 วิ, คำวิจารณ์ Opus §16.8 — 5 อันดับแรก)
 * เปลี่ยนจาก v2 (แผน Argon) ตามสูตร Opus:
 *   ข4: G ค่าเดียวทั้งโปรเจกต์ G = 9.81·24 = 235.4 px/s²
 *       (วาฬ/อนุภาค/คลื่น/telemetry ใช้ G ตัวเดียวกัน — ดู gerstner_v3.js,
 *        particles_v3.js; telemetry ใช้ PX_PER_M=24 เดียวกัน)
 *   ข5/ค2: L = 300 px, น้ำลึก 440 px (ผิวน้ำ y=760, ทราย y=1200)
 *       Apex ศูนย์กลางเหนือน้ำ 105 px (= 0.35L)
 *   ข2: แอมพลิจูดคลื่นว่ายน้ำใหม่ A(u) = L·(0.005 + 0.095·u³)
 *       (หัว 0.5%L, กลางตัว ~1.7%L, หาง 10%L — เลิกโค้งแบบปลาไหลของ v2)
 *   ข3/ข6/ข8: วิถีคำนวณฟิสิกส์รอบเดียว — เร่งใต้น้ำ (Anticipation +
 *       Thrust Hermite คงเดิมตามที่ล็อก) → โปรเจกไทล์ g เดียว →
 *       ω เชิงมุมคงที่ในอากาศ → ใต้น้ำหน่วง exp(−4·dt) + โมเมนตัม
 *       เดินหน้าต่อ (ห้าม lerp x กลับจุดเดิม)
 *   ข7: ลงน้ำมุม ≤15° (θ จาก 70° ที่พ้นน้ำ ลดคงที่ −31.8°/s จน 10° ที่แตะน้ำ)
 *       + เทสต์ max(outline.y) < sandY − 8
 * ล็อกไว้ไม่เปลี่ยน (ฟิลิปสั่ง 2026-11-09 02:20):
 *   - เลย์เอาต์แบ่งจอเหมือนเดิม (Drawing 274px / Render 446px)
 *   - จังหวะ Anticipation/settle 5.33–5.75s + Hermite 5.75–6.00s เหมือน v2
 *   - จังหวะพ่นน้ำที่ Apex
 *   - CA เก็บไว้เหมือน v2 (ดู draw.js — polish_bean.js ไม่แตะ)
 * ไทม์ไลน์ใหม่ (คำนวณจากฟิสิกส์ ไม่ใช่คีย์เฟรม):
 *   T_LAUNCH 6.000 / tExit (ศูนย์กลางพ้นน้ำ) 6.910 / T_APEX 7.855 /
 *   T_REENTRY (ศูนย์กลางแตะน้ำ) 8.799 / T_SETTLE 10.400 / T_END 12.0
 *   C0=[440,1060], V0=[-80,-436.7] (|V0|≈443.9, มุมพุ่ง ~70°)
 *   vy ที่ผิวน้ำ 222.3 px/s (9.3 m/s), อยู่เหนือน้ำ (ศูนย์กลาง) ~1.89 วิ
 */

// ---- ค่าคงที่โลก (ใช้ร่วมกันทั้งโปรเจกต์ — draw/camera/shell อ่านจากนี่) ----
const WATER_Y = 760;   // ผิวน้ำ (v2: 900) — Opus ค2: น้ำลึก 440 px
const SAND_Y = 1200;   // พื้นทราย (v2: 1180)
const PX_PER_M = 24;   // 24 px = 1 m (ตรงกับ telemetry_bean.js)
const G_WORLD = 235.4; // g เดียวทั้งโปรเจกต์ = 9.81·24 (Opus ข4)

const BREACH = {
  T_STEER: 4.5,       // f135 เริ่ม Steer (เบนขวาเข้าจุดปล่อย)
  T_PRE: 5.3333,      // f160 เริ่ม Pre-Breach / Anticipation
  T_ANT_END: 5.75,     // f172.5 จบ Anticipation — เริ่ม Thrust
  T_LAUNCH: 6.0,       // f180/f181 จุดปล่อย
  // T_APEX/T_REENTRY คำนวณจาก V0/G (ดูข้างล่าง — ไม่ใช่คีย์เฟรมตายตัว):
  //   vy0 = √(2·G·(C0y − apexY)) = √(2·235.4·(1060−655)) = 436.7 px/s
  //   t_apex = vy0/G = 1.855 s → Apex t = 7.855, apexY = 760−105 = 655
  //   vy ที่ผิวน้ำ = √(vy0² − 2G·(C0y−760)) = 222.3 px/s
  //   τ_exit = (vy0 − 222.3)/G = 0.910 s → tExit = 6.910
  //   τ_reentry = (vy0 + 222.3)/G = 2.799 s → T_REENTRY = 8.799
  T_APEX: 7.855,       // จุดสูงสุดพาราโบลา (ศูนย์กลาง y=655)
  T_REENTRY: 8.799,    // f264 ศูนย์กลางกลับถึงผิวน้ำ y=760
  T_SETTLE: 10.4,      // f312 โมชันนิ่งแล้ว (สปริง θ หน่วงวิกฤต ω0=2.5)
  T_END: 12.0,
  STEER_X: 80,         // เบนขวา 80 px (จากจุดว่าย ~360 ไปจุดปล่อย 440)
  STEER_Y: 20,         // Steer ดำลง 20 px ด้วย
  CHARGE: 0.12,        // จุดชาร์จถอยหลังตามทิศ V0 0.12 วิ (~53 px)
  C0: [440, 1060],     // จุดปล่อย (ศูนย์กลางลำตัว) — ใต้ผิวน้ำ 300 px
  V0: [-80, -436.7],   // ความเร็วต้น px/s — มุมพุ่ง atan(436.7/80) ≈ 79.6° จากแนวราบ?
                       // (มุมจากแนวราบ = atan(436.7/80) ≈ 79.6°; Opus ว่า ~70° คือมุม
                       //  ของเวกเตอร์ที่ผิวน้ำ: atan(222.3/80) ≈ 70.2° — ตรงสูตร)
  G: G_WORLD,          // แรงโน้มถ่วงวาฬ px/s² — ค่าเดียวกับอนุภาค/คลื่น/telemetry
  THETA_PRE: 20 * Math.PI / 180,    // มุมหัวตอนจบ Pre-Breach (เงยขึ้น)
                       // v3: 20° (ไม่ใช่ 35° แบบ v2) — ที่ 35° หางห้อยต่ำถึง
                       // y≈1198 ตอน Anticipation (C_ANT ลึก 1112 + หาง 150·sin35°)
                       // ชนพื้นทราย (เทสต์ max outline.y < 1192); ที่ 20°
                       // หางห้อยแค่ 150·sin20° ≈ 51 px → ผ่านเทสต์ + หางพ้นหอยด้วย
  THETA_EXIT: 70 * Math.PI / 180,   // มุมหัวตอนพ้นน้ำ (ตรงทิศความเร็วที่ผิวน้ำ)
  THETA_ENTRY: 10 * Math.PI / 180,  // มุมหัวตอนกลับแตะน้ำ (ตบข้าง ≤15° — Opus ข7)
  OMEGA_THETA: -31.76 * Math.PI / 180, // ความเร็วเชิงมุมคงที่ในอากาศ (rad/s)
                                     // = (10°−70°)/1.889 วิ ≈ −31.8°/s
  OMEGA_SPRING: 2.5,   // ω0 สปริงหน่วงวิกฤตคืน θ หลังแตะน้ำ (Opus ข8, ~1.5 วิ)
  WAVE_FLIGHT: 0.15,  // แอมพลิจูดคลื่นตอนบิน (เทียบกับว่ายน้ำ = 1.0)
  ARCH: 28,            // Dorsal Arch สูงสุด 28 px ตอนบิน (คงเดิมจาก v2)
  L: 300,              // ความยาวลำตัว px (v2: 400) — Opus ข5/ค1
  WMAX: 37.5,          // ครึ่งความกว้างลำตัวสูงสุด px (= 0.125·L, เท่าอัตรา v2)
};

// เวลาที่ศูนย์กลางพ้นน้ำ / อยู่ในอากาศ (คำนวณจาก V0/G — ใช้ทั่วไฟล์)
const T_EXIT = BREACH.T_LAUNCH + (Math.abs(BREACH.V0[1]) - 222.34) / BREACH.G; // ≈ 6.910
const T_AIR = BREACH.T_REENTRY - T_EXIT; // ≈ 1.889 วิ

// จุดชาร์จพลังตอนจบ Anticipation: ถอยหลังตามทิศ V0 0.12 วิ
// C_ANT = C0 − V0·0.12 = [449.6, 1112.4] — วาฬกดตัวลง ~42 px จากจุดหลัง Steer
function breachChargePoint() {
  const B = BREACH;
  return [B.C0[0] - B.V0[0] * B.CHARGE, B.C0[1] - B.V0[1] * B.CHARGE];
}

function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
function smooth01(v) { const x = clamp01(v); return x * x * (3 - 2 * x); }
function easeOut01(v) { const x = clamp01(v); return 1 - (1 - x) * (1 - x); }
function easeInOutCubic(v) {
  const x = clamp01(v);
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}
function normAngle(a) { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; }

// ---- โครงกระดูกว่ายน้ำ (local, จุดศูนย์กลางที่ 0,0) — Opus ข2 ----
// A(u) = L·(0.005 + 0.095·u³), u = i/11; ω = π rad/s (0.5 Hz);
// Δφ = 2π/11 ≈ 0.5712 rad/ข้อ; arc-length correction รักษาความยาวท่อนคงที่
function localSpine(t) {
  const L = BREACH.L, N = 12;
  const OMEGA = Math.PI, DPHI = (2 * Math.PI) / (N - 1), SEG = L / (N - 1);
  const pts = [];
  let x = -L / 2, prevY = 0;
  for (let i = 0; i < N; i++) {
    const u = i / (N - 1);
    const A = L * (0.005 + 0.095 * u * u * u);
    const y = A * Math.sin(OMEGA * t - i * DPHI);
    if (i > 0) {
      const dy = y - prevY;
      x += Math.sqrt(Math.max(SEG * SEG - dy * dy, 0));
    }
    pts.push([x, y]);
    prevY = y;
  }
  // จัดกึ่งกลางตามแกน x (centroid x = 0)
  let cx = 0;
  for (const p of pts) cx += p[0];
  cx /= pts.length;
  return pts.map(([px, py]) => [px - cx, py]);
}

// จุดศูนย์กลางลำตัวตอนว่ายน้ำ (localSpine แปลมา: x+360, y+1050)
function swimCentroid(t) {
  const pts = localSpine(t).map(([x, y]) => [x + 360, y + 1050]);
  let cx = 0, cy = 0;
  for (const p of pts) { cx += p[0]; cy += p[1]; }
  return { pts, c: [cx / pts.length, cy / pts.length] };
}

// จุดศูนย์กลางลำตัวตอนว่ายน้ำ + Steer เบนขวาเข้าจุดปล่อย (คงเดิมจาก v2)
// [4.5, 5.33]: เบนขวา 0→80 px + ดำลง 0→20 px แบบ smooth01
// หลัง 5.33: ค้าง (+80, +20) — Anticipation/Thrust ต่อจากจุดนี้
function steerBase(t) {
  const B = BREACH;
  const sc = swimCentroid(t).c;
  if (t < B.T_STEER) return sc;
  if (t < B.T_PRE) {
    const s = smooth01((t - B.T_STEER) / (B.T_PRE - B.T_STEER));
    return [sc[0] + B.STEER_X * s, sc[1] + B.STEER_Y * s];
  }
  return [sc[0] + B.STEER_X, sc[1] + B.STEER_Y];
}

// ออฟเซตหลังแตะน้ำ (โมเมนตัมเดินหน้าต่อ — Opus ข8: ห้าม lerp x กลับจุดเดิม)
// R = ce − sc0 + off(T_RET): องค์ประกอบ x ค้างถาวร (วาฬจบทางซ้ายของจุดว่ายเดิม
// ~163 px — กล้องตามวาฬอยู่แล้วจึงไม่หลุดเฟรม); องค์ประกอบ y จางกลับด้วย f
// หลัง T_RET = T_REENTRY + 0.8 วิ จนถึง T_SETTLE
const T_RET = BREACH.T_REENTRY + 0.8;
function postReentryOffset() {
  const B = BREACH;
  const tau = B.T_REENTRY - B.T_LAUNCH;
  const ce = [B.C0[0] + B.V0[0] * tau, B.C0[1] + B.V0[1] * tau + 0.5 * B.G * tau * tau];
  const vEntry = [B.V0[0], B.V0[1] + B.G * tau];
  const sc0 = swimCentroid(B.T_REENTRY).c;
  const vSwim0 = swimCentroidVel(B.T_REENTRY);
  const dt1 = T_RET - B.T_REENTRY;
  const e1 = Math.exp(-4 * dt1);
  const off = [
    (vEntry[0] - vSwim0[0]) * 0.25 * (1 - e1),
    (vEntry[1] - vSwim0[1]) * 0.25 * (1 - e1),
  ];
  return [ce[0] - sc0[0] + off[0], ce[1] - sc0[1] + off[1]];
}

// ศูนย์กลางลำตัว C(t) — ต่อเนื่องทุกช่วง (C¹ ที่จุดปล่อย t=6.00)
function breachCenter(t) {
  const B = BREACH;
  if (t < B.T_PRE) return steerBase(t); // ว่ายน้ำ (+ Steer เบนขวาตั้งแต่ 4.50 วิ)
  if (t < B.T_ANT_END) {
    // Anticipation (ล็อกไว้เหมือน v2): ดำดิ่งจากจุดหลัง Steer ลงไปที่จุดชาร์จ
    // smooth01 อนุพันธ์เป็น 0 ทั้งสองปลาย → ความเร็ว→0 ที่ t=5.75 (กดตัวนิ่ง)
    const s = smooth01((t - B.T_PRE) / (B.T_ANT_END - B.T_PRE));
    const sc = steerBase(t);
    const ca = breachChargePoint();
    return [sc[0] + (ca[0] - sc[0]) * s, sc[1] + (ca[1] - sc[1]) * s];
  }
  if (t < B.T_LAUNCH) {
    // Thrust (ล็อกไว้เหมือน v2): Cubic Hermite จาก C_ANT → C0 ใน 0.25 วิ
    // m0 = 0 (ต่อจาก Anticipation ที่ความเร็ว 0), m1 = V0 → C¹ ที่ t=6.00
    const h = B.T_LAUNCH - B.T_ANT_END; // 0.25
    const u = (t - B.T_ANT_END) / h;
    const u2 = u * u, u3 = u2 * u;
    const h00 = 2 * u3 - 3 * u2 + 1, h01 = -2 * u3 + 3 * u2, h11 = u3 - u2;
    const ca = breachChargePoint();
    return [
      h00 * ca[0] + h01 * B.C0[0] + h11 * h * B.V0[0],
      h00 * ca[1] + h01 * B.C0[1] + h11 * h * B.V0[1],
    ];
  }
  if (t <= B.T_REENTRY) {
    // พาราโบลาเดียวทั้งช่วงบิน: C = C0 + v0·τ + (0, ½gτ²), g = 235.4 ค่าเดียว
    const tau = t - B.T_LAUNCH;
    return [B.C0[0] + B.V0[0] * tau, B.C0[1] + B.V0[1] * tau + 0.5 * B.G * tau * tau];
  }
  // หลังแตะน้ำ: หน่วงใต้น้ำ v *= exp(−4·dt) (Opus ข7: ระยะจม ≈ 222/4 ≈ 56 px)
  const tau = B.T_REENTRY - B.T_LAUNCH;
  const ce = [B.C0[0] + B.V0[0] * tau, B.C0[1] + B.V0[1] * tau + 0.5 * B.G * tau * tau];
  const vEntry = [B.V0[0], B.V0[1] + B.G * tau];
  const sc0 = swimCentroid(B.T_REENTRY).c;
  const vSwim0 = swimCentroidVel(B.T_REENTRY);
  const sc = swimCentroid(t).c;
  if (t < T_RET) {
    const dt = t - B.T_REENTRY;
    const e = Math.exp(-4 * dt);
    const ox = (vEntry[0] - vSwim0[0]) * 0.25 * (1 - e);
    const oy = (vEntry[1] - vSwim0[1]) * 0.25 * (1 - e);
    return [ce[0] + (sc[0] - sc0[0]) + ox, ce[1] + (sc[1] - sc0[1]) + oy];
  }
  // หลัง T_RET: x ค้างตามโมเมนตัม (ไม่ lerp กลับ), y จางกลับสู่ระดับว่ายน้ำ
  const R = postReentryOffset();
  if (t < B.T_SETTLE) {
    const f = 1 - smooth01((t - T_RET) / (B.T_SETTLE - T_RET));
    return [sc[0] + R[0], sc[1] + R[1] * f];
  }
  return [sc[0] + R[0], sc[1]];
}

// ความเร็ว centroid ว่ายน้ำ (อนุพันธ์ตัวเลข)
function swimCentroidVel(t) {
  const dt = 0.01;
  const a = swimCentroid(Math.max(0, t - dt)).c, b = swimCentroid(t + dt).c;
  return [(b[0] - a[0]) / (2 * dt), (b[1] - a[1]) / (2 * dt)];
}

// ความเร็วของศูนย์กลางลำตัว (px/s) — ใช้คำนวณ telemetry โหมด breach
function breachCenterVel(t) {
  const B = BREACH;
  if (t < B.T_LAUNCH) {
    const dt = 0.005;
    const a = breachCenter(Math.max(0, t - dt)), b = breachCenter(t + dt);
    return [(b[0] - a[0]) / (2 * dt), (b[1] - a[1]) / (2 * dt)];
  }
  if (t <= B.T_REENTRY) {
    const tau = t - B.T_LAUNCH;
    return [B.V0[0], B.V0[1] + B.G * tau];
  }
  // หลังแตะน้ำ: อนุพันธ์ตัวเลขของ breachCenter (นิยามเป็นท่อน — analytic จะยาว)
  const dt = 0.005;
  const a = breachCenter(Math.max(0, t - dt)), b = breachCenter(Math.min(B.T_END, t + dt));
  const span = Math.min(B.T_END, t + dt) - Math.max(0, t - dt);
  return [(b[0] - a[0]) / span, (b[1] - a[1]) / span];
}

// มุมลำตัว θ(t) (rad) — Opus ข6/ข7/ข8
//   ใต้น้ำ→พ้นน้ำ: 35° → 70° แบบ smooth01 (ตรงทิศความเร็วที่ผิวน้ำพอดี)
//   ในอากาศ: ω คงที่ −31.76°/s (70° → 10° ตลอด 1.889 วิ — ไม่มีแรงบิด)
//   หลังแตะน้ำ: สปริงหน่วงวิกฤต ω0=2.5 (C¹ ต่อจาก ω อากาศ, กลับ 0° ใน ~1.5 วิ)
function breachTheta(t) {
  const B = BREACH;
  if (t < B.T_PRE) return 0;
  if (t < B.T_ANT_END) return B.THETA_PRE * easeOut01((t - B.T_PRE) / (B.T_ANT_END - B.T_PRE));
  if (t < B.T_LAUNCH) return B.THETA_PRE; // Thrust: หัวค้าง 35° แล้วพุ่ง
  if (t < T_EXIT) {
    const s = smooth01((t - B.T_LAUNCH) / (T_EXIT - B.T_LAUNCH));
    return B.THETA_PRE + (B.THETA_EXIT - B.THETA_PRE) * s;
  }
  if (t <= B.T_REENTRY) {
    return B.THETA_EXIT + B.OMEGA_THETA * (t - T_EXIT);
  }
  if (t < B.T_SETTLE) {
    // สปริงหน่วงวิกฤต: θ(τ) = (A + Bτ)·e^{−ω0τ}, A=θ0, B=ωv0+ω0·θ0
    const tau = t - B.T_REENTRY;
    const th0 = B.THETA_ENTRY, wv0 = B.OMEGA_THETA, w0 = B.OMEGA_SPRING;
    return (th0 + (wv0 + w0 * th0) * tau) * Math.exp(-w0 * tau);
  }
  return 0;
}

// มุมหมุนรอบแกนลำตัว (axial roll, rad) — 0° → 90° ด้วยความเร็วคงที่ในอากาศ
// (Opus ข6: หมุนรอบแกนลำตัว 0→90° ด้วยความเร็วคงที่เพื่อให้ลงน้ำแบบตบข้าง)
function rollPhi(t) {
  if (t < T_EXIT) return 0;
  if (t <= BREACH.T_REENTRY) return (Math.PI / 2) * ((t - T_EXIT) / T_AIR);
  if (t < BREACH.T_SETTLE) return (Math.PI / 2) * Math.exp(-(t - BREACH.T_REENTRY) / 0.8);
  return 0;
}

// แฟกเตอร์แอมพลิจูดคลื่น w(t): 1.0 ว่ายน้ำ → 0.15 ตอนบิน → 1.0 หลังกลับลงน้ำ
function breachWave(t) {
  const B = BREACH;
  if (t < B.T_LAUNCH) return 1.0;
  if (t < B.T_LAUNCH + 0.5) return 1.0 + (B.WAVE_FLIGHT - 1.0) * smooth01((t - B.T_LAUNCH) / 0.5);
  if (t <= B.T_REENTRY) return B.WAVE_FLIGHT;
  if (t < B.T_SETTLE) return B.WAVE_FLIGHT + (1.0 - B.WAVE_FLIGHT) * smooth01((t - B.T_REENTRY) / (B.T_SETTLE - B.T_REENTRY));
  return 1.0;
}

// แฟกเตอร์ Dorsal Arch — 0 ตอนว่ายน้ำ → 1 ตอนบิน → จางหมดที่ T_REENTRY
// (v3: เลิกใช้ค่าคงที่ 10.02 ตกค้างของ v2 — จางตาม T_REENTRY ที่คำนวณจากฟิสิกส์)
function breachArchK(t) {
  const B = BREACH;
  if (t < B.T_LAUNCH) return 0;
  if (t < B.T_LAUNCH + 0.5) return smooth01((t - B.T_LAUNCH) / 0.5);
  if (t <= B.T_REENTRY - 0.3) return 1;
  if (t <= B.T_REENTRY) return 1 - smooth01((t - (B.T_REENTRY - 0.3)) / 0.3);
  return 0;
}

// ---- โปรไฟล์ความกว้างลำตัว (Opus ก1) ----
// monotone cubic ผ่านจุดคุม (u, w/Wmax): (0,0) (0.05,0.55) (0.25,1.0)
// (0.5,0.85) (0.75,0.4) (0.9,0.15) (1,0.08) — ใช้ smoothstep ระหว่างจุดคุม
// ซึ่ง monotone ในแต่ละช่วงโดยสร้าง (อนุพันธ์เป็น 0 ที่จุดคุม — โค้งนุ่ม ไม่หักมุม)
const BODY_WIDTH_KNOTS = [[0, 0], [0.05, 0.55], [0.25, 1.0], [0.5, 0.85], [0.75, 0.4], [0.9, 0.15], [1, 0.08]];
function bodyWidthOpus(u) {
  const K = BODY_WIDTH_KNOTS;
  if (u <= 0) return K[0][1] * BREACH.WMAX;
  if (u >= 1) return K[K.length - 1][1] * BREACH.WMAX;
  for (let i = 0; i < K.length - 1; i++) {
    if (u <= K[i + 1][0]) {
      const s = smooth01((u - K[i][0]) / (K[i + 1][0] - K[i][0]));
      return (K[i][1] + (K[i + 1][1] - K[i][1]) * s) * BREACH.WMAX;
    }
  }
  return BREACH.WMAX;
}

// จุดบนลำตัวใน local frame: attach(u, s) — u ตำแหน่งตามลำตัว 0..1,
// s ระยะตั้งฉาก −1 (หลัง) .. +1 (ท้อง), ใช้ T/N ของ spine (Opus ก2)
function attachPoint(pts, u, s) {
  const n = pts.length;
  const x = clamp01(u) * (n - 1);
  const i0 = Math.max(0, Math.min(n - 2, Math.floor(x)));
  const f = x - i0;
  const px = pts[i0][0] + (pts[i0 + 1][0] - pts[i0][0]) * f;
  const py = pts[i0][1] + (pts[i0 + 1][1] - pts[i0][1]) * f;
  const a = pts[Math.max(0, i0 - 1)], b = pts[Math.min(n - 1, i0 + 2)];
  const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy) || 1;
  const tx = dx / len, ty = dy / len, nx = -ty, ny = tx;
  const w = Math.max(2, bodyWidthOpus(clamp01(u)));
  return { x: px + nx * w * s, y: py + ny * w * s, ang: Math.atan2(ty, tx), tx, ty, nx, ny };
}

// จุด spine 12 จุดในพิกัดโลก (world 720x1280) ณ เวลา t
function whalePointsS06(t) {
  const sc = swimCentroid(t);
  const C = breachCenter(t);
  const th = breachTheta(t);
  const w = breachWave(t);
  const archK = breachArchK(t);
  const cos = Math.cos(th), sin = Math.sin(th);
  // local: x ตามแนวลำตัว, y = คลื่นว่ายน้ำ (attenuate ตอนบิน) ลบ Dorsal Arch
  const local = sc.pts.map(([x, y], i) => {
    const u = i / (sc.pts.length - 1);
    const arch = BREACH.ARCH * Math.sin(u * Math.PI) * archK;
    return [x - sc.c[0], (y - sc.c[1]) * w - arch];
  });
  // arc-length compensation: rescale แบบ uniform ให้ความยาวรวมกลับเป็น L=300 เป๊ะ
  let len = 0;
  for (let i = 1; i < local.length; i++) len += Math.hypot(local[i][0] - local[i - 1][0], local[i][1] - local[i - 1][1]);
  const k = len > 0 ? BREACH.L / len : 1;
  return local.map(([lx, ly]) => {
    lx *= k; ly *= k;
    return [C[0] + lx * cos - ly * sin, C[1] + lx * sin + ly * cos];
  });
}

// โครงร่างวาฬ (outline) — จุดขอบทั้งสองฝั่ง (±bodyWidth) + ปลายหาง fluke
// ใช้ในเทสต์ (ไม่หลุดขอบ/ไม่ทะลุทราย/หางไม่แตะหอย/ตาอยู่ในตัว) และกล้อง
function whaleOutlinePoints(t) {
  const pts = whalePointsS06(t);
  const n = pts.length;
  const phi = rollPhi(t);
  const rollK = 0.95 + 0.05 * Math.abs(Math.cos(phi)); // ก4: บีบหนาต่ำสุด 0.95
  const out = [];
  for (let s of [-1, 1]) {
    for (let i = 0; i < n; i++) {
      const u = i / (n - 1);
      const w = Math.max(2, bodyWidthOpus(u)) * rollK;
      const p = pts[i];
      const aa = pts[Math.max(0, i - 1)], bb = pts[Math.min(n - 1, i + 1)];
      const dx = bb[0] - aa[0], dy = bb[1] - aa[1], len = Math.hypot(dx, dy) || 1;
      const nx = -dy / len, ny = dx / len;
      out.push([p[0] + nx * w * s, p[1] + ny * w * s]);
    }
  }
  // ปลายหาง fluke 4 จุด (สูตรเดียวกับ drawWhale — ยาว 30/18 px = 0.1L/0.06L
  // ตามสูตร Opus ก3; v2 ใช้ 45/26 ซึ่งยาวเกินจนหางแตะหอย+จมทราย)
  const tail = pts[11], prev = pts[10];
  const ang = Math.atan2(tail[1] - prev[1], tail[0] - prev[0]);
  for (const s of [-1, 1]) {
    const a1 = ang + s * 0.5, a2 = ang + s * 1.05;
    out.push([tail[0] + Math.cos(a1) * 30, tail[1] + Math.sin(a1) * 30]);
    out.push([tail[0] + Math.cos(a2) * 18, tail[1] + Math.sin(a2) * 18]);
  }
  return out;
}

// เหตุการณ์สำคัญ (คำนวณครั้งเดียว แคชไว้) — ใช้วางคิวอนุภาค/เสียง/โฟม/ป้าย
let _breachEvents = null;
function breachEvents() {
  if (_breachEvents) return _breachEvents;
  const B = BREACH;
  let tHeadCross = null;
  for (let t = B.T_LAUNCH; t <= B.T_LAUNCH + 0.8; t += 0.005) {
    if (whalePointsS06(t)[0][1] < WATER_Y) { tHeadCross = t; break; }
  }
  // ศูนย์กลางทะลุผิวน้ำขาขึ้น: ½Gτ² + V0y·τ + (C0y − WATER_Y) = 0
  const disc = B.V0[1] * B.V0[1] - 2 * B.G * (B.C0[1] - WATER_Y);
  const tauC = (-B.V0[1] - Math.sqrt(disc)) / B.G;
  // หัวแตะผิวน้ำขาลงครั้งแรก (re-entry ที่แท้จริง — ป้าย RE-ENTRY/เสียง splash ยึดค่านี้)
  let tHeadDown = null, headDownX = null;
  let prevHeadY = whalePointsS06(B.T_APEX)[0][1];
  for (let t = B.T_APEX + 0.005; t <= B.T_REENTRY + 0.5; t += 0.005) {
    const p = whalePointsS06(t)[0];
    if (prevHeadY < WATER_Y && p[1] >= WATER_Y) { tHeadDown = t; headDownX = p[0]; break; }
    prevHeadY = p[1];
  }
  const ev = {
    tHeadCross: tHeadCross !== null ? tHeadCross : B.T_LAUNCH + 0.41,
    tCenterCross: B.T_LAUNCH + tauC,
    tHeadDownCross: tHeadDown !== null ? tHeadDown : B.T_REENTRY,
    reentryHeadX: headDownX !== null ? headDownX : 188.5,
    tExit: T_EXIT,
    tApex: B.T_APEX,
    tReentry: B.T_REENTRY,
    apexCenter: breachCenter(B.T_APEX),
    reentryCenter: breachCenter(B.T_REENTRY),
    crossX: whalePointsS06(tHeadCross !== null ? tHeadCross : B.T_LAUNCH + 0.41)[0][0],
  };
  _breachEvents = ev;
  return ev;
}

// White Water / Cavity: โฟมที่ผิวน้ำรอบจุดทะลุขาขึ้น — ขยายแล้วจางในช่วงบิน
function breachWhiteWater(t) {
  const ev = breachEvents();
  if (t < ev.tHeadCross) return null;
  if (t > BREACH.T_REENTRY + 1.2) return null;
  const age = t - ev.tHeadCross;
  const radius = 20 + Math.min(age, 1.5) * 45;
  let alpha = 0.85;
  if (t > BREACH.T_REENTRY) alpha = 0.85 * Math.max(0, 1 - (t - BREACH.T_REENTRY) / 1.2);
  return { x: ev.crossX, y: WATER_Y, radius, alpha };
}

// โฟมรอบจุดกลับลงน้ำ (หัวแตะผิวขาลง) — เกิดตรงจุดทะลุจริง ไม่ค้างที่ x เดิม
function breachWhiteWaterReentry(t) {
  const ev = breachEvents();
  if (t < ev.tHeadDownCross) return null;
  if (t > ev.tHeadDownCross + 1.2) return null;
  const age = t - ev.tHeadDownCross;
  return { x: ev.reentryHeadX, y: WATER_Y, radius: 20 + Math.min(age, 1.0) * 55, alpha: 0.9 * (1 - age / 1.2) };
}
