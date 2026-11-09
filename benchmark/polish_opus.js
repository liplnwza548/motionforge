/**
 * applyPolish — ใส่เอฟเฟกต์ภาพ 4 อย่างตามลำดับบนพิกเซล RGBA เดิม (Canvas 2D ImageData)
 *   1) Motion blur แนวนอน ทิ้งรอยไปด้านหลังทิศที่หัววาฬเคลื่อนที่ รัศมีโตตาม |speed|
 *   2) Subsurface scattering แบบง่าย: ให้แสงซึมข้ามขอบบริเวณสว่าง + โทนอุ่น (บวกค่าเท่านั้น ภาพไม่มืดลง)
 *   3) Chromatic aberration (แดงเลื่อนขวา น้ำเงินเลื่อนซ้าย 1–2 px เฉพาะที่ขอบสว่าง) + bloom เบาๆ
 *   4) Film grain แบบ temporal: seed = floor(t * 30) เปลี่ยนทุกเฟรม
 *
 * @param {Uint8ClampedArray} data  ยาว width*height*4 (RGBA, แกน y ชี้ลง)
 * @param {number} width
 * @param {number} height
 * @param {number} t      เวลา (วินาที)
 * @param {number} speed  ความเร็วหัววาฬ (px/s) ของเฟรมนี้จาก telemetry ที่มี surge 2× ความถี่สะบัดอยู่แล้ว
 *                        เครื่องหมายบอกทิศ (+ = ไปขวา, − = ไปซ้าย) ขนาดใช้เป็นรัศมีเบลอ
 * @returns {Uint8ClampedArray} อาร์เรย์ data เดิมที่แก้แล้ว
 */
function applyPolish(data, width, height, t, speed) {
  // ======================= ค่าคงที่ (แอมพลิจูดทุกตัวเป็นค่าบวก) =======================
  // --- 1) Motion blur ---
  const BLUR_MAX_RADIUS = 12;   // รัศมีเบลอสูงสุด (px)
  const BLUR_K = 0.02;          // k: รัศมี(px) = k * |speed|(px/s) → 300 px/s ≈ 6 px, ชนเพดาน 12 px ที่ 600 px/s
  // --- 2) Subsurface scattering ---
  const SSS_RADIUS = 2;         // รัศมี SSS (px) box blur ความสว่างแยกแกน (หน้าต่าง 5x5)
  const SSS_STRENGTH = 0.35;    // ความแรง SSS: สัดส่วนแสงที่ซึมข้ามขอบ (0..1)
  const SSS_WARMTH = 5;         // โทนอุ่นที่เติมสูงสุด (หน่วย 0..255) เมื่อสว่างเต็ม
  // --- 3) Chromatic aberration + bloom ---
  const CA_SHIFT_MIN = 1.0;     // ระยะ shift ต่ำสุด (px) ที่ขอบสว่างอ่อน
  const CA_SHIFT_MAX = 2.0;     // ระยะ shift สูงสุด (px) ที่ขอบสว่างเต็ม
  const CA_EDGE_NORM = 40;      // gradient ความสว่าง (0..255) ที่ถือว่าเป็นขอบเต็มที่
  const CA_BRIGHT_LO = 150;     // ความสว่างต่ำกว่านี้ไม่ทำ CA
  const CA_BRIGHT_HI = 230;     // ความสว่างตั้งแต่นี้ทำ CA เต็ม
  const BLOOM_THRESHOLD = 200;  // เฉพาะส่วนที่สว่างเกินค่านี้ถึงเรืองแสง
  const BLOOM_RADIUS = 4;       // รัศมี bloom (px)
  const BLOOM_STRENGTH = 0.2;   // ความแรง bloom (เบาๆ)
  // --- 4) Film grain ---
  const GRAIN_STRENGTH = 6;     // ความแรง grain: แอมพลิจูดสูงสุด ±6 (หน่วย 0..255)
  const GRAIN_FPS = 30;         // seed ของเฟรม = floor(t * 30)
  // ==================================================================================

  const W = width | 0, H = height | 0;
  if (!data || W <= 0 || H <= 0 || data.length < W * H * 4) return data;
  const N = W * H;
  const N4 = N * 4;

  // บัฟเฟอร์ float ทำงานทั้งหมด แล้ว clamp ครั้งเดียวตอนเขียนกลับ (ไม่สะสม rounding ระหว่างขั้น)
  const buf = new Float32Array(N4);
  buf.set(data.subarray(0, N4));

  // ---------- helpers ----------
  const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
  const smoothstep = (e0, e1, v) => {
    const x = clamp01((v - e0) / (e1 - e0));
    return x * x * (3 - 2 * x);
  };
  // integer hash (อิง lowbias32) → uint32
  function hash32(a) {
    a |= 0;
    a = Math.imul(a ^ (a >>> 16), 0x7feb352d);
    a = Math.imul(a ^ (a >>> 15), 0x846ca68b);
    return (a ^ (a >>> 16)) >>> 0;
  }
  // box blur ช่องเดียว แยกแกน ขอบแบบ clamp: src → dst (tmp คือที่พักงาน ต้องเป็นคนละอาร์เรย์กัน)
  function boxBlur(src, dst, tmp, r) {
    if (r < 1) { dst.set(src); return; }
    const inv = 1 / (2 * r + 1);
    for (let y = 0; y < H; y++) {               // แนวนอน: src → tmp
      const row = y * W;
      let acc = 0;
      for (let k = -r; k <= r; k++) acc += src[row + Math.min(W - 1, Math.max(0, k))];
      for (let x = 0; x < W; x++) {
        tmp[row + x] = acc * inv;
        acc += src[row + Math.min(W - 1, x + r + 1)] - src[row + Math.max(0, x - r)];
      }
    }
    for (let x = 0; x < W; x++) {               // แนวตั้ง: tmp → dst
      let acc = 0;
      for (let k = -r; k <= r; k++) acc += tmp[Math.min(H - 1, Math.max(0, k)) * W + x];
      for (let y = 0; y < H; y++) {
        dst[y * W + x] = acc * inv;
        acc += tmp[Math.min(H - 1, y + r + 1) * W + x] - tmp[Math.max(0, y - r) * W + x];
      }
    }
  }
  // อ่านค่าช่อง c ที่ตำแหน่ง x แบบทศนิยม (linear interpolation แนวนอน, ขอบ clamp)
  function sampleX(arr, y, fx, c) {
    if (fx < 0) fx = 0; else if (fx > W - 1) fx = W - 1;
    const x0 = Math.floor(fx);
    const x1 = x0 < W - 1 ? x0 + 1 : x0;
    const a = fx - x0;
    const row = y * W;
    return arr[(row + x0) * 4 + c] * (1 - a) + arr[(row + x1) * 4 + c] * a;
  }
  const lum = new Float32Array(N);
  function computeLuma() {
    for (let i = 0, p = 0; i < N; i++, p += 4) {
      lum[i] = 0.2126 * buf[p] + 0.7152 * buf[p + 1] + 0.0722 * buf[p + 2];
    }
  }

  // ======================= 1) MOTION BLUR (แนวนอน ตามทิศการเคลื่อนที่) =======================
  // รัศมีต่อเนื่องแบบทศนิยม: n แท็ปเต็ม + แท็ปท้ายน้ำหนัก f → เบลอโต/หดลื่นตาม surge ไม่กระตุก
  // speed = 0 (หรือไม่ใช่ตัวเลข) → blurR = 0 → ข้ามทั้งขั้น ไม่เบลอเลย
  const spd = Number.isFinite(speed) ? speed : 0;
  const blurR = Math.min(BLUR_MAX_RADIUS, BLUR_K * Math.abs(spd));
  if (blurR > 0) {
    const dir = spd > 0 ? 1 : -1;
    const n = Math.floor(blurR);
    const f = blurR - n;
    const norm = 1 / (n + 1 + f);
    const rowSrc = new Float32Array(W * 4);
    const pre = new Float64Array(W + 1);
    for (let y = 0; y < H; y++) {
      const base = y * W * 4;
      rowSrc.set(buf.subarray(base, base + W * 4));
      for (let c = 0; c < 4; c++) {             // เบลอ RGBA พร้อมกัน (สมมติว่าเฟรมทึบ เช่นฉากทะเลเต็มจอ)
        pre[0] = 0;
        for (let x = 0; x < W; x++) pre[x + 1] = pre[x] + rowSrc[x * 4 + c];
        const first = rowSrc[c];
        const last = rowSrc[(W - 1) * 4 + c];
        for (let x = 0; x < W; x++) {
          // พิกเซล x ดึงค่าจากฝั่ง "หน้า" (x + dir*j) → รอยเบลอไปตกอยู่ด้านหลังวัตถุที่กำลังเคลื่อน
          let sum;
          if (dir > 0) {
            const end = x + n;
            const hi = end < W - 1 ? end : W - 1;
            sum = pre[hi + 1] - pre[x] + (end - hi) * last;
            sum += f * rowSrc[Math.min(W - 1, end + 1) * 4 + c];
          } else {
            const start = x - n;
            const lo = start > 0 ? start : 0;
            sum = pre[x + 1] - pre[lo] + (lo - start) * first;
            sum += f * rowSrc[Math.max(0, start - 1) * 4 + c];
          }
          buf[base + x * 4 + c] = sum * norm;
        }
      }
    }
  }

  // ======================= 2) SUBSURFACE SCATTERING (แบบง่าย) =======================
  // แสงจากบริเวณสว่างซึมข้ามขอบไปฝั่งมืด (lumBlur − lum > 0) + เติมโทนอุ่นตามความสว่าง
  // ทุกเทอมเป็นการ "บวก" ค่าที่ ≥ 0 → ไม่มีพิกเซลไหนมืดลง และภาพรวมไม่มืดลง
  const lumB = new Float32Array(N);
  const tmp = new Float32Array(N);
  computeLuma();
  boxBlur(lum, lumB, tmp, SSS_RADIUS);
  for (let i = 0, p = 0; i < N; i++, p += 4) {
    const lb = lumB[i];
    const bright = clamp01(lb / 255);
    const spill = Math.max(0, lb - lum[i]) * SSS_STRENGTH * bright; // ≥ 0 เสมอ
    const warm = SSS_WARMTH * bright * bright;                       // ≥ 0 เสมอ
    buf[p]     += spill * 1.0 + warm;        // แดงมากสุด → อุ่น
    buf[p + 1] += spill * 0.85 + warm * 0.4;
    buf[p + 2] += spill * 0.65;
  }

  // ======================= 3) CHROMATIC ABERRATION + BLOOM เบาๆ =======================
  computeLuma();
  // bloom: bright-pass → blur (บวกอย่างเดียว)
  const brightPass = new Float32Array(N);
  for (let i = 0; i < N; i++) brightPass[i] = Math.max(0, lum[i] - BLOOM_THRESHOLD);
  const bloom = lumB; // lumB ไม่ได้ใช้แล้ว นำกลับมาใช้เป็นที่เก็บผล bloom
  boxBlur(brightPass, bloom, tmp, BLOOM_RADIUS);

  const src = buf.slice(); // snapshot ไว้ให้ CA อ่าน
  for (let y = 0; y < H; y++) {
    const row = y * W;
    const yu = y > 0 ? y - 1 : y;
    const yd = y < H - 1 ? y + 1 : y;
    for (let x = 0; x < W; x++) {
      const i = row + x;
      const p = i * 4;
      const xl = x > 0 ? x - 1 : x;
      const xr = x < W - 1 ? x + 1 : x;
      const lC = lum[i], lL = lum[row + xl], lR = lum[row + xr];
      const lU = lum[yu * W + x], lD = lum[yd * W + x];
      // mask = ความเป็นขอบ × ความสว่าง → CA เกิดเฉพาะที่ขอบสว่าง
      const grad = 0.5 * (Math.abs(lR - lL) + Math.abs(lD - lU));
      const localMax = Math.max(lC, lL, lR, lU, lD);
      const mask = clamp01(grad / CA_EDGE_NORM) * smoothstep(CA_BRIGHT_LO, CA_BRIGHT_HI, localMax);

      let r = src[p];
      let b = src[p + 2];
      if (mask > 0) {
        const s = CA_SHIFT_MIN + (CA_SHIFT_MAX - CA_SHIFT_MIN) * mask; // 1..2 px
        r += (sampleX(src, y, x - s, 0) - r) * mask; // แดงเลื่อนไปขวา: x รับค่าแดงจาก x − s
        b += (sampleX(src, y, x + s, 2) - b) * mask; // น้ำเงินเลื่อนไปซ้าย: x รับค่าน้ำเงินจาก x + s
      }
      const bl = bloom[i] * BLOOM_STRENGTH;          // ≥ 0
      buf[p]     = r + bl;
      buf[p + 1] = src[p + 1] + bl * 0.95;
      buf[p + 2] = b + bl * 0.9;
      // alpha (p+3) คงเดิม
    }
  }

  // ======================= 4) FILM GRAIN (TEMPORAL) =======================
  // seed มาจากเลขเฟรม floor(t * 30) → noise เปลี่ยนทุกเฟรม แต่เรนเดอร์ซ้ำเฟรมเดิมได้ผลเดิม (deterministic)
  const frame = Number.isFinite(t) ? Math.floor(t * GRAIN_FPS) : 0;
  const seed = hash32(Math.imul(frame | 0, 0x9e3779b1) ^ 0x5bd1e995);
  const INV_2_32 = 1 / 4294967296;
  for (let i = 0, p = 0; i < N; i++, p += 4) {
    const h1 = hash32((i << 1) ^ seed);
    const h2 = hash32(((i << 1) | 1) ^ seed);
    const nz = (h1 + h2) * INV_2_32 - 1;            // กระจายแบบสามเหลี่ยม [-1, 1) ค่าเฉลี่ย 0 → ไม่ทำให้ภาพมืด/สว่างขึ้นโดยรวม
    const l = clamp01((0.2126 * buf[p] + 0.7152 * buf[p + 1] + 0.0722 * buf[p + 2]) / 255);
    const w = 0.5 + 2 * l * (1 - l);                // แรงสุดที่โทนกลาง (1.0) เบาลงที่เงา/ไฮไลต์ (0.5)
    const g = nz * GRAIN_STRENGTH * w;              // monochrome grain
    buf[p] += g;
    buf[p + 1] += g;
    buf[p + 2] += g;
  }

  // ======================= เขียนกลับ (Uint8ClampedArray clamp 0..255 + ปัดเศษให้เอง) =======================
  for (let k = 0; k < N4; k++) data[k] = buf[k];
  return data;
}

/* ตัวอย่างใช้งานในลูปเรนเดอร์:
   const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
   applyPolish(img.data, img.width, img.height, t, headSpeedFromTelemetry(t)); // speed มี surge อยู่แล้ว
   ctx.putImageData(img, 0, 0);
*/
