/**
 * applyPolish — บีน (Muse Spark) เขียนเองตามบรีฟเดียวกับ Opus/Flash
 * ใส่เอฟเฟกต์ภาพ 4 อย่างตามลำดับบนพิกเซล RGBA เดิม (Canvas 2D ImageData)
 *   1) Motion blur แนวนอน รัศมีโตตาม |speed| (speed=0 → ไม่เบลอเลย)
 *   2) Subsurface scattering แบบง่าย: แสงซึมข้ามขอบ + โทนอุ่น (บวกอย่างเดียว ภาพไม่มืดลง)
 *   3) Chromatic aberration (แดงขวา น้ำเงินซ้าย 1–2 px เฉพาะที่ขอบสว่าง สเกลตาม mask) + bloom เบาๆ
 *   4) Film grain แบบ temporal: seed = floor(t·30) เปลี่ยนทุกเฟรม deterministic
 *
 * บทเรียน Prompt Vault รายการที่ 6 ที่ใส่ไว้ตั้งแต่ต้น:
 * - grain strength ~6 และถ่วงความแรงตามความสว่าง (แรงสุดที่โทนกลาง เบาที่เงา/ไฮไลต์)
 * - chromatic shift 1–2 px สเกลตามความแรงของขอบ ไม่ใช่ค่าคงที่
 * - ค่าแอมพลิจูดทุกตัวเป็นค่าบวก (ค่าสัมบูรณ์ ห้ามติดลบ)
 *
 * @param {Uint8ClampedArray} data ยาว width*height*4 (RGBA, แกน y ชี้ลง)
 * @param {number} width
 * @param {number} height
 * @param {number} t เวลา (วินาที)
 * @param {number} speed ความเร็วหัววาฬ (px/s) จาก telemetry ที่มี surge 2ω แล้ว
 * @returns {Uint8ClampedArray} อาร์เรย์ data เดิมที่แก้แล้ว
 */
function applyPolish(data, width, height, t, speed) {
  // ค่าคงที่ (แอมพลิจูดทุกตัวเป็นค่าบวก)
  const BLUR_MAX_RADIUS = 12; // รัศมีเบลอสูงสุด (px)
  const BLUR_K = 0.02;        // รัศมี(px) = k·|speed| → 300 px/s ≈ 6 px
  const SSS_RADIUS = 2;       // รัศมี SSS (px)
  const SSS_STRENGTH = 0.35;  // ความแรง SSS (0..1)
  const SSS_WARMTH = 5;       // โทนอุ่นสูงสุด (0..255)
  const CA_SHIFT_MIN = 1.0, CA_SHIFT_MAX = 2.0; // shift ที่ขอบ (px)
  const CA_EDGE_NORM = 40;    // gradient ที่ถือว่าเป็นขอบเต็มที่
  const CA_BRIGHT_LO = 150, CA_BRIGHT_HI = 230;
  const BLOOM_THRESHOLD = 200, BLOOM_RADIUS = 4, BLOOM_STRENGTH = 0.2;
  const GRAIN_STRENGTH = 6;   // แอมพลิจูด grain สูงสุด ±6
  const GRAIN_FPS = 30;       // seed เฟรม = floor(t·30)

  const W = width | 0, H = height | 0;
  if (!data || W <= 0 || H <= 0 || data.length < W * H * 4) return data;
  const N = W * H, N4 = N * 4;
  const buf = new Float32Array(N4);
  buf.set(data.subarray(0, N4));

  const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
  const smoothstep = (e0, e1, v) => { const x = clamp01((v - e0) / (e1 - e0)); return x * x * (3 - 2 * x); };
  function hash32(a) {
    a |= 0;
    a = Math.imul(a ^ (a >>> 16), 0x7feb352d);
    a = Math.imul(a ^ (a >>> 15), 0x846ca68b);
    return (a ^ (a >>> 16)) >>> 0;
  }
  // box blur ช่องเดียว แยกแกน ขอบ clamp: src → dst (tmp คือที่พักงาน)
  function boxBlur(src, dst, tmp, r) {
    if (r < 1) { dst.set(src); return; }
    const inv = 1 / (2 * r + 1);
    for (let y = 0; y < H; y++) {
      const row = y * W; let acc = 0;
      for (let k = -r; k <= r; k++) acc += src[row + Math.min(W - 1, Math.max(0, k))];
      for (let x = 0; x < W; x++) {
        tmp[row + x] = acc * inv;
        acc += src[row + Math.min(W - 1, x + r + 1)] - src[row + Math.max(0, x - r)];
      }
    }
    for (let x = 0; x < W; x++) {
      let acc = 0;
      for (let k = -r; k <= r; k++) acc += tmp[Math.min(H - 1, Math.max(0, k)) * W + x];
      for (let y = 0; y < H; y++) {
        dst[y * W + x] = acc * inv;
        acc += tmp[Math.min(H - 1, y + r + 1) * W + x] - tmp[Math.max(0, y - r) * W + x];
      }
    }
  }
  function sampleX(arr, y, fx, c) {
    if (fx < 0) fx = 0; else if (fx > W - 1) fx = W - 1;
    const x0 = Math.floor(fx), x1 = x0 < W - 1 ? x0 + 1 : x0, a = fx - x0, row = y * W;
    return arr[(row + x0) * 4 + c] * (1 - a) + arr[(row + x1) * 4 + c] * a;
  }
  const lum = new Float32Array(N);
  function computeLuma() {
    for (let i = 0, p = 0; i < N; i++, p += 4) lum[i] = 0.2126 * buf[p] + 0.7152 * buf[p + 1] + 0.0722 * buf[p + 2];
  }

  // 1) MOTION BLUR แนวนอน — รัศมีจำนวนเต็มจาก |speed| (0 → ข้ามทั้งขั้น)
  const spd = Number.isFinite(speed) ? speed : 0;
  const blurR = Math.round(Math.min(BLUR_MAX_RADIUS, BLUR_K * Math.abs(spd)));
  if (blurR > 0) {
    const dir = spd > 0 ? 1 : -1;
    const rowSrc = new Float32Array(W * 4);
    for (let y = 0; y < H; y++) {
      const base = y * W * 4;
      rowSrc.set(buf.subarray(base, base + W * 4));
      for (let x = 0; x < W; x++) {
        // เฉลี่ยพิกเซลจากฝั่งหน้า (x + dir·j, j=0..blurR) → รอยเบลอตกด้านหลังวัตถุ
        for (let c = 0; c < 3; c++) {
          let sum = 0;
          for (let j = 0; j <= blurR; j++) sum += rowSrc[Math.min(W - 1, Math.max(0, x + dir * j)) * 4 + c];
          buf[base + x * 4 + c] = sum / (blurR + 1);
        }
      }
    }
  }

  // 2) SUBSURFACE SCATTERING — แสงสว่างซึมข้ามขอบ + โทนอุ่น (บวกอย่างเดียว)
  const lumB = new Float32Array(N), tmp = new Float32Array(N);
  computeLuma();
  boxBlur(lum, lumB, tmp, SSS_RADIUS);
  for (let i = 0, p = 0; i < N; i++, p += 4) {
    const bright = clamp01(lumB[i] / 255);
    const spill = Math.max(0, lumB[i] - lum[i]) * SSS_STRENGTH * bright;
    const warm = SSS_WARMTH * bright * bright;
    buf[p] += spill + warm;
    buf[p + 1] += spill * 0.85 + warm * 0.4;
    buf[p + 2] += spill * 0.65;
  }

  // 3) CHROMATIC ABERRATION + BLOOM
  computeLuma();
  const brightPass = new Float32Array(N);
  for (let i = 0; i < N; i++) brightPass[i] = Math.max(0, lum[i] - BLOOM_THRESHOLD);
  const bloom = lumB;
  boxBlur(brightPass, bloom, tmp, BLOOM_RADIUS);
  const src = buf.slice();
  for (let y = 0; y < H; y++) {
    const row = y * W, yu = y > 0 ? y - 1 : y, yd = y < H - 1 ? y + 1 : y;
    for (let x = 0; x < W; x++) {
      const i = row + x, p = i * 4;
      const xl = x > 0 ? x - 1 : x, xr = x < W - 1 ? x + 1 : x;
      const lC = lum[i], lL = lum[row + xl], lR = lum[row + xr];
      const lU = lum[yu * W + x], lD = lum[yd * W + x];
      const grad = 0.5 * (Math.abs(lR - lL) + Math.abs(lD - lU));
      const localMax = Math.max(lC, lL, lR, lU, lD);
      const mask = clamp01(grad / CA_EDGE_NORM) * smoothstep(CA_BRIGHT_LO, CA_BRIGHT_HI, localMax);
      let r = src[p], b = src[p + 2];
      if (mask > 0) {
        const s = CA_SHIFT_MIN + (CA_SHIFT_MAX - CA_SHIFT_MIN) * mask; // 1..2 px สเกลตาม mask
        r += (sampleX(src, y, x - s, 0) - r) * mask;
        b += (sampleX(src, y, x + s, 2) - b) * mask;
      }
      const bl = bloom[i] * BLOOM_STRENGTH;
      buf[p] = r + bl;
      buf[p + 1] = src[p + 1] + bl * 0.95;
      buf[p + 2] = b + bl * 0.9;
    }
  }

  // 4) FILM GRAIN (TEMPORAL) — seed จากเลขเฟรม floor(t·30), กระจายสามเหลี่ยม ถ่วงตามความสว่าง
  const frame = Number.isFinite(t) ? Math.floor(t * GRAIN_FPS) : 0;
  const seed = hash32(Math.imul(frame | 0, 0x9e3779b1) ^ 0x5bd1e995);
  const INV_2_32 = 1 / 4294967296;
  for (let i = 0, p = 0; i < N; i++, p += 4) {
    const h1 = hash32((i << 1) ^ seed), h2 = hash32(((i << 1) | 1) ^ seed);
    const nz = (h1 + h2) * INV_2_32 - 1; // สามเหลี่ยม [-1,1) ค่าเฉลี่ย 0
    const l = clamp01((0.2126 * buf[p] + 0.7152 * buf[p + 1] + 0.0722 * buf[p + 2]) / 255);
    const w = 0.5 + 2 * l * (1 - l); // แรงสุดที่โทนกลาง เบาที่เงา/ไฮไลต์
    const g = nz * GRAIN_STRENGTH * w;
    buf[p] += g; buf[p + 1] += g; buf[p + 2] += g;
  }

  for (let k = 0; k < N4; k++) data[k] = buf[k];
  return data;
}
