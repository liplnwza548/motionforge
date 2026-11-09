/**
 * gerstnerPoint(x, t) — บีน (Muse Spark) เขียนเองตามบรีฟเดียวกับ Opus/Flash
 * ผิวน้ำแบบ Gerstner 4 ระลอก (N = 4) มุมมองด้านข้าง สำหรับ Canvas 2D
 *
 * θᵢ = kᵢ·Dxᵢ·x − ωᵢ·t + φᵢ
 * x' = x + Σ qᵢ·Aᵢ·Dxᵢ·cos θᵢ   (แนวนอน: ดึงจุดเข้าหายอดคลื่น → ยอดแหลม ท้องกว้าง)
 * y  = Σ Aᵢ·sin θᵢ              (แนวตั้ง: ความสูงเหนือระดับน้ำนิ่ง)
 * qᵢ = Qᵢ·(Aᵢ/ΣA) / (kᵢ·Aᵢ)     normalize กันผิวน้ำม้วนเป็นลูป
 *
 * ค่าคงที่ (ตามบทเรียน Prompt Vault รายการที่ 3 — Q คลื่นหลัก ≥ 0.6 และ
 * ω มาจาก ω = √(g·k) ด้วย g เดียวกันทุกตัว, g = 235.4 px/s² = 9.81 × 24 px/m (ค่าเดียวทั้งโปรเจกต์ — Opus ข4)):
 *   λ=320 → k=0.019635 → ω=2.1500 | λ=190 → k=0.033069 → ω=2.7900
 *   λ=115 → k=0.054636 → ω=3.5860 | λ= 70 → k=0.089760 → ω=4.5970
 *   ΣA = 14 + 8 + 4.5 + 2.5 = 29 px
 *
 * @param {number} x ตำแหน่งแนวนอนตั้งต้น (พิกเซล)
 * @param {number} t เวลา (วินาที)
 * @returns {[number, number]} [x', y] โดย y คือความสูงเทียบ y = 0 (บวก = ขึ้น)
 */
function gerstnerPoint(x, t) {
  const N = 4;
  const SUM_A = 29.0;
  const WAVES = [
    //  A (px)    λ (px)   dir (°)    ω (rad/s)    Q           φ (rad)
    { A: 14.0, L: 320, dir:   0, w: 2.1500, Q: 0.90, phi: 0.0 },
    { A:  8.0, L: 190, dir:  18, w: 2.7900, Q: 0.80, phi: 1.7 },
    { A:  4.5, L: 115, dir: -32, w: 3.5860, Q: 0.70, phi: 4.1 },
    { A:  2.5, L:  70, dir: 200, w: 4.5970, Q: 0.60, phi: 2.6 },
  ];
  let xp = x;
  let y = 0;
  for (let i = 0; i < N; i++) {
    const { A, L, dir, w, Q, phi } = WAVES[i];
    const k = (2 * Math.PI) / L;
    const Dx = Math.cos((dir * Math.PI) / 180);
    const theta = k * Dx * x - w * t + phi;
    const q = (Q * (A / SUM_A)) / (k * A);
    xp += q * A * Dx * Math.cos(theta);
    y += A * Math.sin(theta);
  }
  return [xp, y];
}
