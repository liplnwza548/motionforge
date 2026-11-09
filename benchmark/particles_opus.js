/**
 * particleState(t) — จำลองอนุภาค 3 emitter สำหรับฉากวาฬพุ่งพ้นน้ำ (Canvas 2D)
 * ฉาก 720x1280 px, แกน y ชี้ลง (+y = ลง), หน่วย: px, px/s, s
 * ผลลัพธ์: { spout:[{x,y,vx,vy}], splash:[...], snow:[...] }
 *
 * ผลซ้ำได้ (deterministic):
 *  - ค่าตั้งต้นของทุกอนุภาคสุ่มจาก mulberry32(seed=42) ลำดับตายตัว แล้วแคชไว้
 *  - Spout/Splash ใช้สูตรปิด (analytic) ของ gravity + linear drag จึงไม่สะสม error จาก timestep
 *  - Brownian ของ snow ใช้ random walk ที่สุ่มจาก hash(seed, อนุภาค, ลำดับ knot) ไม่ขึ้นกับลำดับการเรียก
 *  => particleState(t) ให้ผลเดิมเสมอ จะเรียกเวลาไหนก่อนหลังหรือกระโดดข้ามเวลาก็ได้
 */
function particleState(t) {
  // ======================= ค่าคงที่ทั่วไป =======================
  const W = 720, H = 1280;        // ขนาดฉาก (px)
  const SEED = 42;                // seed ตายตัว
  const G = 294;                  // แรงโน้มถ่วง px/s² (= 9.8 m/s² × 30 px/m), ชี้ +y (ลง)
  const WATER_Y = 900;            // ระดับผิวน้ำ: อนุภาค spout/splash ที่ตกลงต่ำกว่านี้ถือว่าจมน้ำแล้ว (ตัดออก)

  // ======================= (ก) SPOUT =======================
  const SPOUT_N = 250;                     // จำนวนจุด
  const SPOUT_X = 360, SPOUT_Y = 700;      // จุดกำเนิด (รูหายใจวาฬ)
  const SPOUT_CONE_HALF_DEG = 15;          // กรวย: เบี่ยงจากแนวดิ่งขึ้นได้สูงสุด 15° (สุ่มสม่ำเสมอตามมุมตัน แล้วฉายลง 2D)
  const SPOUT_V_MEAN = 540;                // v0 เฉลี่ย px/s  (Handoff v0 ~ N(18,2) m/s × 30)
  const SPOUT_V_SD = 60;                   // v0 SD px/s
  const SPOUT_V_CLIP_SIGMA = 3;            // ตัดหาง Gaussian ที่ ±3σ (v0 อยู่ในช่วง 360..720)
  const SPOUT_DRAG = 0.6;                  // linear drag k (1/s): a = g − k·v  (ละอองหมอกเบา)
  const SPOUT_T0 = 0.0;                    // เวลาเริ่มพ่น (s)
  const SPOUT_EMIT = 0.8;                  // ช่วงเวลาปล่อยอนุภาค (s): เวลาเกิดแต่ละจุด ~ U(T0, T0+EMIT)

  // ======================= (ข) SPLASH =======================
  const SPLASH_N = 400;                    // จำนวนจุด (ซ้าย 200 / ขวา 200 สลับกัน)
  const SPLASH_X = 360, SPLASH_Y = 900;    // จุดกำเนิดที่ผิวน้ำ
  const SPLASH_ANG_MIN_DEG = 30;           // มุมเหนือแนวราบต่ำสุด
  const SPLASH_ANG_MAX_DEG = 75;           // มุมเหนือแนวราบสูงสุด (สุ่ม U(30,75))
  const SPLASH_V_MEAN = 380;               // v0 เฉลี่ย px/s
  const SPLASH_V_SD = 90;                  // v0 SD px/s  (ความเร็วต้นต่างกันแต่ละจุด)
  const SPLASH_V_MIN = 150, SPLASH_V_MAX = 650; // clamp v0
  const SPLASH_DRAG = 0.35;                // linear drag k (1/s): หยดน้ำหนักกว่าละออง drag จึงน้อยกว่า
  const SPLASH_T0 = 0.0;                   // เวลาเริ่มกระเซ็น (s)
  const SPLASH_EMIT = 0.2;                 // ช่วงเวลาปล่อย (s)

  // ======================= (ค) MARINE SNOW / BUBBLES =======================
  const SNOW_N = 80;                       // จำนวนจุด
  const SNOW_RISE_MIN = 15;                // ความเร็วลอยตัวขึ้นคงที่ (buoyancy) ต่ำสุด px/s
  const SNOW_RISE_MAX = 30;                // สูงสุด px/s (สุ่มรายจุด U(15,30))
  const SNOW_NOISE_SIGMA = 6;              // Brownian σ (px/√s): หลัง 1 s เคลื่อนสุ่ม RMS ~6 px ต่อแกน
  const SNOW_NOISE_DT = 0.25;              // ระยะห่าง knot ของ random walk (s), ต่อ knot ด้วย Catmull-Rom ให้ความเร็วต่อเนื่อง
  // กระจายเริ่มต้น x ∈ [0,720), y ∈ [0,1280) และวนกลับ (wrap) เมื่อหลุดขอบ

  // ======================= ตัวช่วย =======================
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let r = Math.imul(a ^ (a >>> 15), 1 | a);
      r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
      return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
    };
  }
  function gauss(rng) { // Box-Muller
    const u1 = 1 - rng(), u2 = rng();
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  }
  function fmix(h) { // murmur3 finalizer
    h ^= h >>> 16; h = Math.imul(h, 0x85EBCA6B);
    h ^= h >>> 13; h = Math.imul(h, 0xC2B2AE35);
    h ^= h >>> 16; return h >>> 0;
  }
  function hash3(a, b, c) { return fmix((fmix((fmix(a) ^ b) >>> 0) + c) | 0); }
  function hashGauss(i, j) { // N(0,1) แบบไม่ขึ้นกับลำดับการเรียก
    const u1 = (hash3(SEED, i, 2 * j) + 0.5) / 4294967296;
    const u2 = (hash3(SEED, i, 2 * j + 1) + 0.5) / 4294967296;
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  }
  function wrap(v, m) { return ((v % m) + m) % m; }
  function ballistic(p, k, tau) { // สูตรปิด: dv/dt = (0,G) − k·v
    if (k > 1e-9) {
      const e = Math.exp(-k * tau), vt = G / k, f = (1 - e) / k;
      return { x: p.x0 + p.vx0 * f, y: p.y0 + vt * tau + (p.vy0 - vt) * f,
               vx: p.vx0 * e, vy: vt + (p.vy0 - vt) * e };
    }
    return { x: p.x0 + p.vx0 * tau, y: p.y0 + p.vy0 * tau + 0.5 * G * tau * tau,
             vx: p.vx0, vy: p.vy0 + G * tau };
  }

  // ======================= สร้างค่าตั้งต้น (ครั้งเดียว แล้วแคช) =======================
  if (!particleState._cache) {
    const rng = mulberry32(SEED);
    const D2R = Math.PI / 180;

    const spout = [];
    const cosMax = Math.cos(SPOUT_CONE_HALF_DEG * D2R);
    for (let i = 0; i < SPOUT_N; i++) {
      let z; do { z = gauss(rng); } while (Math.abs(z) > SPOUT_V_CLIP_SIGMA);
      const v0 = SPOUT_V_MEAN + SPOUT_V_SD * z;
      const cosT = 1 - rng() * (1 - cosMax);           // สม่ำเสมอตามมุมตันในกรวย
      const sinT = Math.sqrt(1 - cosT * cosT);
      const phi = 2 * Math.PI * rng();                 // azimuth แล้วฉายลงระนาบภาพ
      spout.push({ x0: SPOUT_X, y0: SPOUT_Y,
                   vx0: v0 * sinT * Math.cos(phi), vy0: -v0 * cosT,
                   tb: SPOUT_T0 + rng() * SPOUT_EMIT });
    }

    const splash = [];
    for (let i = 0; i < SPLASH_N; i++) {
      const side = (i % 2 === 0) ? 1 : -1;             // ซ้าย/ขวา สมมาตร 200:200
      const ang = (SPLASH_ANG_MIN_DEG + rng() * (SPLASH_ANG_MAX_DEG - SPLASH_ANG_MIN_DEG)) * D2R;
      const v0 = Math.min(SPLASH_V_MAX, Math.max(SPLASH_V_MIN, SPLASH_V_MEAN + SPLASH_V_SD * gauss(rng)));
      splash.push({ x0: SPLASH_X, y0: SPLASH_Y,
                    vx0: side * v0 * Math.cos(ang), vy0: -v0 * Math.sin(ang),
                    tb: SPLASH_T0 + rng() * SPLASH_EMIT });
    }

    const snow = [];
    for (let i = 0; i < SNOW_N; i++) {
      snow.push({ x0: rng() * W, y0: rng() * H,
                  rise: SNOW_RISE_MIN + rng() * (SNOW_RISE_MAX - SNOW_RISE_MIN) });
    }
    particleState._cache = { spout, splash, snow };
  }
  const C = particleState._cache;

  // ======================= ประเมิน ณ เวลา t =======================
  const out = { spout: [], splash: [], snow: [] };

  // (ก)+(ข): จะรวมอนุภาคเมื่อเกิดแล้ว (t ≥ tb) และยังไม่ตกกลับลงต่ำกว่าผิวน้ำ
  for (const p of C.spout) {
    const tau = t - p.tb; if (tau < 0) continue;
    const s = ballistic(p, SPOUT_DRAG, tau);
    if (s.vy > 0 && s.y > WATER_Y) continue;
    out.spout.push(s);
  }
  for (const p of C.splash) {
    const tau = t - p.tb; if (tau < 0) continue;
    const s = ballistic(p, SPLASH_DRAG, tau);
    if (s.vy > 0 && s.y > WATER_Y) continue;
    out.splash.push(s);
  }

  // (ค): ลอยขึ้นด้วยความเร็วคงที่ + Brownian (random walk ที่ต่อ knot ด้วย Catmull-Rom)
  const ts = Math.max(0, t);
  const n = Math.floor(ts / SNOW_NOISE_DT), u = ts / SNOW_NOISE_DT - n;
  const step = SNOW_NOISE_SIGMA * Math.sqrt(SNOW_NOISE_DT);
  const u2 = u * u, u3 = u2 * u;
  function brown(stream) { // คืน [offset, velocity] โดย offset(0) = 0
    // arr[j] = W_{j-1}, j = 0..n+3  (W_{-1} = 0)
    let w = 0, w0 = 0, p0 = 0, p1 = 0, p2 = 0, p3 = 0;
    for (let j = 0; j <= n + 3; j++) {
      if (j > 0) w += step * hashGauss(stream, j);
      if (j === 1) w0 = w;
      if (j === n) p0 = w; else if (j === n + 1) p1 = w;
      else if (j === n + 2) p2 = w; else if (j === n + 3) p3 = w;
    }
    const a = -p0 + p2, b = 2 * p0 - 5 * p1 + 4 * p2 - p3, c = -p0 + 3 * p1 - 3 * p2 + p3;
    const pos = 0.5 * (2 * p1 + a * u + b * u2 + c * u3);
    const dpdu = 0.5 * (a + 2 * b * u + 3 * c * u2);
    return [pos - w0, dpdu / SNOW_NOISE_DT];
  }
  for (let i = 0; i < C.snow.length; i++) {
    const p = C.snow[i];
    const bx = brown(i * 2), by = brown(i * 2 + 1);
    out.snow.push({
      x: wrap(p.x0 + bx[0], W),
      y: wrap(p.y0 - p.rise * ts + by[0], H),
      vx: bx[1],
      vy: -p.rise + by[1],
    });
  }
  return out;
}

/* ตัวอย่างใช้กับ Canvas 2D:
const ctx = document.querySelector('canvas').getContext('2d'); // canvas 720x1280
function draw(ms) {
  const s = particleState(ms / 1000);
  ctx.clearRect(0, 0, 720, 1280);
  ctx.fillStyle = '#fff';
  for (const p of [...s.spout, ...s.splash, ...s.snow]) ctx.fillRect(p.x - 1.5, p.y - 1.5, 3, 3);
  requestAnimationFrame(draw);
}
requestAnimationFrame(draw);
*/
