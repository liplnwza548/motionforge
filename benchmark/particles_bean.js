/**
 * particleState(t) — บีน (Muse Spark) เขียนเองตามบรีฟเดียวกับ Opus/Flash
 * จำลองอนุภาค 3 emitter สำหรับฉากวาฬพุ่งพ้นน้ำ (Canvas 2D)
 * ฉาก 720x1280 px, แกน y ชี้ลง (+y = ลง), หน่วย: px, px/s, s
 * คืน { spout: [{x,y,vx,vy}], splash: [...], snow: [...] }
 *
 * บทเรียน Prompt Vault รายการที่ 4 ที่ใส่ไว้ตั้งแต่ต้น:
 * - กรวย Spout 15° หมายถึงครึ่งมุม (±15° จากแนวดิ่ง)
 * - Brownian ของ snow ต้องเป็น random walk จริง (std ∝ √t) ไม่ใช่ผลรวมไซน์
 *   ที่นี่ใช้ random walk แบบ knot ทุก 0.25 วิ สะสม increment จริง แล้ว interp เชิงเส้น
 * - ค่าตั้งต้นสุ่มจาก mulberry32(seed=42) ลำดับตายตัว แล้วแคชไว้ → deterministic
 * - Spout/Splash ใช้สูตรปิดของ gravity + linear drag (ไม่สะสม error จาก timestep)
 */
function particleState(t) {
  const W = 720, H = 1280;
  const SEED = 42;
  const G = 294; // px/s² (= 9.8 × 30 px/m), ชี้ +y (ลง)
  const WATER_Y = 900; // อนุภาค spout/splash ที่ตกลงต่ำกว่านี้ถือว่าจมน้ำแล้ว (ตัดออก)

  // (ก) SPOUT: 250 จุด จาก (360,700) กรวยครึ่งมุม 15° v0 ~ N(540,60) px/s
  const SPOUT_N = 250, SPOUT_X = 360, SPOUT_Y = 700;
  const SPOUT_CONE_HALF_DEG = 15;
  const SPOUT_V_MEAN = 540, SPOUT_V_SD = 60, SPOUT_V_CLIP_SIGMA = 3;
  const SPOUT_DRAG = 0.6, SPOUT_EMIT = 0.8; // ปล่อยทยอย t=0–0.8 วิ
  // (ข) SPLASH: 400 จุด จาก (360,900) มุมเหนือแนวราบ U(30,75)° v0 ~ N(380,90) clamp 150–650
  const SPLASH_N = 400, SPLASH_X = 360, SPLASH_Y = 900;
  const SPLASH_ANG_MIN_DEG = 30, SPLASH_ANG_MAX_DEG = 75;
  const SPLASH_V_MEAN = 380, SPLASH_V_SD = 90, SPLASH_V_MIN = 150, SPLASH_V_MAX = 650;
  const SPLASH_DRAG = 0.35, SPLASH_EMIT = 0.2; // ปล่อยทยอย t=0–0.2 วิ
  // (ค) SNOW: 80 จุด ลอยตัวขึ้น U(15,30) px/s + Brownian random walk σ=6 px/√s knot 0.25 วิ
  const SNOW_N = 80, SNOW_RISE_MIN = 15, SNOW_RISE_MAX = 30;
  const SNOW_NOISE_SIGMA = 6, SNOW_NOISE_DT = 0.25, SNOW_T_MAX = 12; // knot ครอบคลุม t 0–12 วิ

  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let r = Math.imul(a ^ (a >>> 15), 1 | a);
      r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
      return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
    };
  }
  function gauss(rng) {
    const u1 = 1 - rng(), u2 = rng();
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  }
  function wrap(v, m) { return ((v % m) + m) % m; }
  function ballistic(p, k, tau) {
    if (k > 1e-9) {
      const e = Math.exp(-k * tau), vt = G / k, f = (1 - e) / k;
      return { x: p.x0 + p.vx0 * f, y: p.y0 + vt * tau + (p.vy0 - vt) * f,
               vx: p.vx0 * e, vy: vt + (p.vy0 - vt) * e };
    }
    return { x: p.x0 + p.vx0 * tau, y: p.y0 + p.vy0 * tau + 0.5 * G * tau * tau,
             vx: p.vx0, vy: p.vy0 + G * tau };
  }

  if (!particleState._cache) {
    const rng = mulberry32(SEED);
    const D2R = Math.PI / 180;
    const spout = [];
    for (let i = 0; i < SPOUT_N; i++) {
      let z; do { z = gauss(rng); } while (Math.abs(z) > SPOUT_V_CLIP_SIGMA);
      const v0 = SPOUT_V_MEAN + SPOUT_V_SD * z;
      // มุมจากแนวดิ่งสุ่มสม่ำเสมอในช่วง ±15° (ครึ่งมุม) แล้วฉายลง 2D ผ่าน azimuth
      const th = (rng() * 2 - 1) * SPOUT_CONE_HALF_DEG * D2R;
      spout.push({ x0: SPOUT_X, y0: SPOUT_Y,
                   vx0: v0 * Math.sin(th), vy0: -v0 * Math.cos(th),
                   tb: rng() * SPOUT_EMIT });
    }
    const splash = [];
    for (let i = 0; i < SPLASH_N; i++) {
      const side = (i % 2 === 0) ? 1 : -1; // ซ้าย/ขวา สมมาตร 200:200
      const ang = (SPLASH_ANG_MIN_DEG + rng() * (SPLASH_ANG_MAX_DEG - SPLASH_ANG_MIN_DEG)) * D2R;
      const v0 = Math.min(SPLASH_V_MAX, Math.max(SPLASH_V_MIN, SPLASH_V_MEAN + SPLASH_V_SD * gauss(rng)));
      splash.push({ x0: SPLASH_X, y0: SPLASH_Y,
                    vx0: side * v0 * Math.cos(ang), vy0: -v0 * Math.sin(ang),
                    tb: rng() * SPLASH_EMIT });
    }
    // snow: random walk จริง — ต่อ knot ทุก 0.25 วิ สะสม increment N(0, σ²·dt)
    // เก็บ cumulative W[k] ไว้ แล้ว interp เชิงเส้นที่เวลา t (ความเร็ว = ความชันระหว่าง knot)
    const nKnot = Math.round(SNOW_T_MAX / SNOW_NOISE_DT);
    const step = SNOW_NOISE_SIGMA * Math.sqrt(SNOW_NOISE_DT);
    const snow = [];
    for (let i = 0; i < SNOW_N; i++) {
      const wx = [0], wy = [0];
      for (let k = 1; k <= nKnot; k++) { wx.push(wx[k - 1] + step * gauss(rng)); wy.push(wy[k - 1] + step * gauss(rng)); }
      snow.push({ x0: rng() * W, y0: rng() * H,
                  rise: SNOW_RISE_MIN + rng() * (SNOW_RISE_MAX - SNOW_RISE_MIN), wx, wy });
    }
    particleState._cache = { spout, splash, snow, nKnot };
  }
  const C = particleState._cache;
  const out = { spout: [], splash: [], snow: [] };
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
  const ts = Math.max(0, t);
  const kf = Math.min(ts / SNOW_NOISE_DT, C.nKnot - 1);
  const k0 = Math.floor(kf), u = kf - k0;
  for (const p of C.snow) {
    const bx = p.wx[k0] + (p.wx[k0 + 1] - p.wx[k0]) * u;
    const by = p.wy[k0] + (p.wy[k0 + 1] - p.wy[k0]) * u;
    const vx = (p.wx[k0 + 1] - p.wx[k0]) / SNOW_NOISE_DT;
    const vy = (p.wy[k0 + 1] - p.wy[k0]) / SNOW_NOISE_DT;
    out.snow.push({ x: wrap(p.x0 + bx, W), y: wrap(p.y0 - p.rise * ts + by, H), vx, vy: -p.rise + vy });
  }
  return out;
}
