/**
 * ฟังก์ชันจำลองสถานะอนุภาค 3 ชนิดสำหรับฉากวาฬพุ่งพ้นน้ำ (Canvas 2D: 720x1280 px, y ชี้ลง)
 * 
 * @param {number} t - เวลาในหน่วยวินาที (seconds)
 * @returns {{ spout: Array<{x: number, y: number, vx: number, vy: number}>,
 *             splash: Array<{x: number, y: number, vx: number, vy: number}>,
 *             snow: Array<{x: number, y: number, vx: number, vy: number}> }}
 */
function particleState(t) {
  // =========================================================================
  // ค่าคงที่จำลองระบบ (SIMULATION CONSTANTS)
  // =========================================================================
  // 1. ขนาดฉากและแกนพิกัด (Canvas Dimensions: แกน y ชี้ลง)
  const CANVAS_WIDTH = 720;               // ความกว้างฉาก (พิกเซล)
  const CANVAS_HEIGHT = 1280;             // ความสูงฉาก (พิกเซล)

  // 2. ซีดสุ่มคงที่ (Random Seed)
  const SEED = 42;                        // Seed ตายตัวเพื่อให้ผลลัพธ์ซ้ำเดิมทุกครั้ง

  // 3. แรงโน้มถ่วงและแรงต้านอากาศ (Gravity & Drag)
  const G = 294;                          // ความเร่งโน้มถ่วงลงล่าง g = 294 px/s²
  const DRAG = 0.0;                       // สัมประสิทธิ์แรงต้านเชิงเส้น (0 = วิถีพาราโบลาบริสุทธิ์ตามโจทย์, ปรับเป็น > 0 ได้)

  // 4. Emitter (ก): น้ำพุวาฬ (Spout)
  const SPOUT_COUNT = 250;                // จำนวนอนุภาค 250 จุด
  const SPOUT_ORIGIN_X = 360;             // จุดกำเนิดแกน x = 360 px
  const SPOUT_ORIGIN_Y = 700;             // จุดกำเนิดแกน y = 700 px (ช่องพ่นน้ำวาฬ)
  const SPOUT_CONE_DEG = 15;              // กรวยการพุ่งกว้างรวม 15 องศา (±7.5 องศารอบแนวดิ่งขึ้น)
  const SPOUT_V0_MEAN = 540;              // ค่าเฉลี่ยความเร็วต้น 540 px/s (Handoff 18 * 30 px/s)
  const SPOUT_V0_STD = 60;                // ส่วนเบี่ยงเบนมาตรฐานความเร็วต้น 60 px/s (Handoff 2 * 30 px/s)

  // 5. Emitter (ข): น้ำกระจายผิวน้ำ (Splash)
  const SPLASH_COUNT = 400;               // จำนวนอนุภาค 400 จุด
  const SPLASH_ORIGIN_X = 360;            // จุดกำเนิดแกน x = 360 px
  const SPLASH_ORIGIN_Y = 900;            // จุดกำเนิดแกน y = 900 px (ระดับผิวน้ำ)
  const SPLASH_ANGLE_MIN_DEG = 30;        // มุมต่ำสุดเหนือแนวราบ 30 องศา
  const SPLASH_ANGLE_MAX_DEG = 75;        // มุมสูงสุดเหนือแนวราบ 75 องศา
  const SPLASH_V0_MIN = 260;              // ความเร็วต้นต่ำสุด 260 px/s
  const SPLASH_V0_MAX = 620;              // ความเร็วต้นสูงสุด 620 px/s

  // 6. Emitter (ค): หิมะทะเล / ฟองอากาศใต้น้ำ (Marine Snow / Bubbles)
  const SNOW_COUNT = 80;                  // จำนวนอนุภาค 80 จุด
  const SNOW_MIN_X = 0;                   // ขอบเขตการกระจายแกน x ต่ำสุด
  const SNOW_MAX_X = 720;                 // ขอบเขตการกระจายแกน x สูงสุด
  const SNOW_MIN_Y = 0;                   // ขอบเขตการกระจายแกน y ต่ำสุด
  const SNOW_MAX_Y = 1280;                // ขอบเขตการกระจายแกน y สูงสุด
  const SNOW_BUOYANCY_MIN = 22;           // ความเร็วลอยตัวขึ้นช้าๆ ต่ำสุด 22 px/s
  const SNOW_BUOYANCY_MAX = 38;           // ความเร็วลอยตัวขึ้นช้าๆ สูงสุด 38 px/s
  const SNOW_BROWNIAN_NOISE = 14;         // แอมพลิจูด Brownian Noise สุ่มส่ายไปมา (px)
  // =========================================================================

  // -------------------------------------------------------------------------
  // ตัวสร้างตัวเลขสุ่มแบบกำหนด Seed (Mulberry32 PRNG & Box-Muller Gaussian)
  // -------------------------------------------------------------------------
  function createPRNG(s) {
    let state = s >>> 0;
    return function() {
      state = (state + 0x6D2B79F5) >>> 0;
      let z = Math.imul(state ^ (state >>> 15), 1 | state);
      z = (z + Math.imul(z ^ (z >>> 7), 61 | z)) ^ z;
      return ((z ^ (z >>> 14)) >>> 0) / 4294967296;
    };
  }

  function randomGaussian(rng, mean, std) {
    let u1 = rng();
    while (u1 <= 1e-12) u1 = rng(); // ป้องกัน log(0)
    const u2 = rng();
    const z0 = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
    return mean + z0 * std;
  }

  // -------------------------------------------------------------------------
  // กำหนดสภาพเริ่มต้นของอนุภาคครั้งแรก (Lazy Initialization ด้วย Seed 42)
  // -------------------------------------------------------------------------
  if (!particleState._cache) {
    const rng = createPRNG(SEED);

    // (ก) สร้างพารามิเตอร์เริ่มต้นของ Spout (250 จุด)
    const spoutDefs = [];
    for (let i = 0; i < SPOUT_COUNT; i++) {
      // แนวดิ่งขึ้นบนแกน y-down คือมุม -90 องศา (-π/2 rad)
      const coneHalfAngleRad = (SPOUT_CONE_DEG * 0.5) * (Math.PI / 180);
      const angle = -Math.PI / 2 + (rng() * 2 - 1) * coneHalfAngleRad;
      const v0 = randomGaussian(rng, SPOUT_V0_MEAN, SPOUT_V0_STD);
      spoutDefs.push({
        x0: SPOUT_ORIGIN_X,
        y0: SPOUT_ORIGIN_Y,
        vx0: v0 * Math.cos(angle),
        vy0: v0 * Math.sin(angle)
      });
    }

    // (ข) สร้างพารามิเตอร์เริ่มต้นของ Splash (400 จุด)
    const splashDefs = [];
    for (let i = 0; i < SPLASH_COUNT; i++) {
      // สมมาตรซ้าย-ขวา: ครึ่งหนึ่งไปขวา (+1) อีกครึ่งหนึ่งไปซ้าย (-1)
      const side = (i % 2 === 0) ? 1 : -1;
      const elevDeg = SPLASH_ANGLE_MIN_DEG + rng() * (SPLASH_ANGLE_MAX_DEG - SPLASH_ANGLE_MIN_DEG);
      const elevRad = elevDeg * (Math.PI / 180);
      const v0 = SPLASH_V0_MIN + rng() * (SPLASH_V0_MAX - SPLASH_V0_MIN);
      splashDefs.push({
        x0: SPLASH_ORIGIN_X,
        y0: SPLASH_ORIGIN_Y,
        vx0: side * v0 * Math.cos(elevRad),
        vy0: -v0 * Math.sin(elevRad) // พุ่งขึ้นบนแกน y-down เป็นค่าลบ
      });
    }

    // (ค) สร้างพารามิเตอร์เริ่มต้นของ Marine Snow / Bubbles (80 จุด)
    const snowDefs = [];
    for (let i = 0; i < SNOW_COUNT; i++) {
      snowDefs.push({
        x0: SNOW_MIN_X + rng() * (SNOW_MAX_X - SNOW_MIN_X),
        y0: SNOW_MIN_Y + rng() * (SNOW_MAX_Y - SNOW_MIN_Y),
        vBuoyancy: -(SNOW_BUOYANCY_MIN + rng() * (SNOW_BUOYANCY_MAX - SNOW_BUOYANCY_MIN)), // ลอยขึ้น = ติดลบ
        vxDrift: (rng() - 0.5) * 4.0,                                                      // กระแสน้ำแนวนอนอ่อนๆ
        // พารามิเตอร์ฮาร์มอนิกสังเคราะห์ Brownian Walk ให้ต่อเนื่องตามเวลา t
        w1: 0.8 + rng() * 1.4,
        w2: 2.2 + rng() * 2.5,
        phiX1: rng() * Math.PI * 2,
        phiX2: rng() * Math.PI * 2,
        phiY1: rng() * Math.PI * 2,
        phiY2: rng() * Math.PI * 2
      });
    }

    particleState._cache = { spoutDefs, splashDefs, snowDefs };
  }

  const { spoutDefs, splashDefs, snowDefs } = particleState._cache;

  // -------------------------------------------------------------------------
  // คำนวณฟิสิกส์ตำแหน่งและความเร็ว ณ เวลา t
  // -------------------------------------------------------------------------

  // ฟังก์ชันคำนวณการเคลื่อนที่วิถีโค้งภายใต้แรงโน้มถ่วง G (และ Drag ถ้ามี)
  function computeBallistic(p0) {
    if (DRAG > 0) {
      const expTerm = Math.exp(-DRAG * t);
      const vx = p0.vx0 * expTerm;
      const vy = (p0.vy0 - G / DRAG) * expTerm + (G / DRAG);
      const x = p0.x0 + (p0.vx0 / DRAG) * (1 - expTerm);
      const y = p0.y0 + (G / DRAG) * t + ((p0.vy0 - G / DRAG) / DRAG) * (1 - expTerm);
      return { x, y, vx, vy };
    }
    // โค้ดกรณี Drag = 0: วิถีพาราโบลามาตรฐาน
    return {
      x: p0.x0 + p0.vx0 * t,
      y: p0.y0 + p0.vy0 * t + 0.5 * G * t * t,
      vx: p0.vx0,
      vy: p0.vy0 + G * t
    };
  }

  // 1. ประมวลผล Spout (250 อนุภาค)
  const spout = new Array(SPOUT_COUNT);
  for (let i = 0; i < SPOUT_COUNT; i++) {
    spout[i] = computeBallistic(spoutDefs[i]);
  }

  // 2. ประมวลผล Splash (400 อนุภาค)
  const splash = new Array(SPLASH_COUNT);
  for (let i = 0; i < SPLASH_COUNT; i++) {
    splash[i] = computeBallistic(splashDefs[i]);
  }

  // 3. ประมวลผล Marine Snow / Bubbles (80 อนุภาค)
  const snow = new Array(SNOW_COUNT);
  for (let i = 0; i < SNOW_COUNT; i++) {
    const sd = snowDefs[i];
    // Brownian Noise และอนุพันธ์เทียบเวลา (Velocity component)
    const noiseX = SNOW_BROWNIAN_NOISE * (Math.sin(sd.w1 * t + sd.phiX1) + 0.4 * Math.sin(sd.w2 * t + sd.phiX2));
    const noiseVx = SNOW_BROWNIAN_NOISE * (sd.w1 * Math.cos(sd.w1 * t + sd.phiX1) + 0.4 * sd.w2 * Math.cos(sd.w2 * t + sd.phiX2));

    const noiseY = (SNOW_BROWNIAN_NOISE * 0.45) * (Math.cos(sd.w1 * t + sd.phiY1) + 0.4 * Math.cos(sd.w2 * t + sd.phiY2));
    const noiseVy = -(SNOW_BROWNIAN_NOISE * 0.45) * (sd.w1 * Math.sin(sd.w1 * t + sd.phiY1) + 0.4 * sd.w2 * Math.sin(sd.w2 * t + sd.phiY2));

    const rawX = sd.x0 + sd.vxDrift * t + noiseX;
    const rawY = sd.y0 + sd.vBuoyancy * t + noiseY;

    // Wrap ขอบจอ 720x1280 ให้อนุภาควนกลับมาตลอดเวลา
    const wrappedX = ((rawX % CANVAS_WIDTH) + CANVAS_WIDTH) % CANVAS_WIDTH;
    const wrappedY = ((rawY % CANVAS_HEIGHT) + CANVAS_HEIGHT) % CANVAS_HEIGHT;

    snow[i] = {
      x: wrappedX,
      y: wrappedY,
      vx: sd.vxDrift + noiseVx,
      vy: sd.vBuoyancy + noiseVy
    };
  }

  return { spout, splash, snow };
}
