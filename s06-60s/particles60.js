/**
 * particles60.js — MotionForge S06 60 วินาที: อนุภาค (Fixed-size Object Pool)
 * สูตร ballistic + drag เชิงเส้นแบบ analytic คัดลอกแนวคิดจาก particles_v3.js
 * (สูตรปิด gravity + linear drag — ไม่สะสม error จาก timestep; g = 235.4)
 * บทเรียน Vault รายการที่ 4: กรวย Spout 15° = ครึ่งมุม; snow/Brownian ต้องเป็น
 * random walk จริง — ที่นี่ใช้ random walk แบบ knot 0.25 วิ (คัดลอกแนว v3)
 *
 * กฎเหล็ก: ห้าม particles.push() โดยไม่ลบ — ทุก system ใช้ ParticlePool
 * ขนาดตายตัว (preallocate ตอนสร้าง; spawn เต็มแล้วคืน −1, ไม่มีงอกเพิ่ม)
 * 1,800 เฟรมต่อเนื่องต้องไม่รั่วหน่วยความจำ
 */
'use strict';

let P60 = null;
if (typeof require !== 'undefined') {
  try { P60 = require('./physics60.js'); } catch (e) { P60 = null; }
}
if (!P60 && typeof globalThis !== 'undefined' && globalThis.PHYSICS60) P60 = globalThis.PHYSICS60;

function p60() {
  if (!P60) throw new Error('particles60.js needs physics60.js loaded first');
  return P60;
}
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

// ---- Fixed-size Object Pool ----
// slots สร้างครั้งเดียวตอน new (ไม่โตอีก); freeStack เก็บ index ว่าง (LIFO)
// spawn() เต็ม → คืน −1 (ไม่สร้างเพิ่ม); kill() คืน slot ให้ pool
class ParticlePool {
  constructor(capacity) {
    this.capacity = capacity;
    this.slots = [];
    for (let i = 0; i < capacity; i++) {
      this.slots.push({
        alive: false, x: 0, y: 0, vx: 0, vy: 0, x0: 0, y0: 0, vx0: 0, vy0: 0,
        tb: 0, life: 0, maxLife: 1, size: 2, drag: 0, grav: 1, kind: 0,
        seed: 0, hue: 0,
      });
    }
    this.freeStack = [];
    for (let i = capacity - 1; i >= 0; i--) this.freeStack.push(i);
    this.aliveCount = 0;
  }
  spawn(props) {
    if (this.freeStack.length === 0) return -1;
    const i = this.freeStack.pop();
    const s = this.slots[i];
    s.alive = true; s.life = props.maxLife || 1; s.maxLife = props.maxLife || 1;
    s.x = props.x || 0; s.y = props.y || 0;
    s.vx = props.vx || 0; s.vy = props.vy || 0;
    s.x0 = s.x; s.y0 = s.y; s.vx0 = s.vx; s.vy0 = s.vy;
    s.tb = props.tb || 0; s.size = props.size || 2;
    s.drag = props.drag || 0; s.grav = props.grav === undefined ? 1 : props.grav;
    s.kind = props.kind || 0; s.seed = props.seed || 0; s.hue = props.hue || 0;
    this.aliveCount++;
    return i;
  }
  kill(i) {
    const s = this.slots[i];
    if (!s.alive) return;
    s.alive = false;
    this.freeStack.push(i);
    this.aliveCount--;
  }
  // ก้าวเวลาแบบ analytic (สูตรปิด — ตรงกับ particles_v3.js ballistic):
  //  v(t) = vt + (v0 − vt)·e^(−kτ);  x = x0 + vx0·(1−e^(−kτ))/k
  //  y = y0 + vt·τ + (vy0 − vt)·(1−e^(−kτ))/k; vt = g/k
  // อนุภาคที่ life หมด → kill คืน pool ทันที
  update(dt, tNow) {
    const P = p60();
    const G = P.G60;
    for (let i = 0; i < this.capacity; i++) {
      const s = this.slots[i];
      if (!s.alive) continue;
      s.life -= dt;
      if (s.life <= 0) { this.kill(i); continue; }
      const age = tNow - s.tb;
      if (age < 0) continue;
      if (s.drag > 1e-9) {
        const k = s.drag, e = Math.exp(-k * age);
        const vt = (G * s.grav) / k, f = (1 - e) / k;
        s.x = s.x0 + s.vx0 * f;
        s.y = s.y0 + vt * age + (s.vy0 - vt) * f;
        s.vx = s.vx0 * e;
        s.vy = vt + (s.vy0 - vt) * e;
      } else {
        s.x = s.x0 + s.vx0 * age;
        s.y = s.y0 + s.vy0 * age + 0.5 * G * s.grav * age * age;
        s.vx = s.vx0;
        s.vy = s.vy0 + G * s.grav * age;
      }
    }
  }
  forEachAlive(fn) {
    for (let i = 0; i < this.capacity; i++) {
      if (this.slots[i].alive) fn(this.slots[i], i);
    }
  }
}

// วาดอนุภาคเป็นเส้นแคปซูลยืดตามความเร็ว (v3 A6 — ไม่ใช่เม็ดกลมรัศมีคงที่)
function drawCapsule(ctx, x, y, vx, vy, color, width) {
  const k = 0.03;
  ctx.strokeStyle = color; ctx.lineWidth = width; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - vx * k, y - vy * k); ctx.stroke();
}

// ---- ระบบฟองอากาศ: ลอยขึ้น (v_y < 0) สลายที่ผิวน้ำ ----
function createBubbleSystem(capacity) {
  const P = p60();
  const pool = new ParticlePool(capacity || 400);
  return {
    pool, kind: 'bubbles',
    // ปล่อยฟอง n เม็ดที่ (x, y) ณ เวลา tNow: ลอยขึ้น 20–60 px/s + แกว่งข้างเล็กน้อย
    // tb = tNow (เวลาเกิดจริง) — pool.update คำนวณตำแหน่งแบบ analytic จาก tb
    emit(x, y, n, tNow, rng) {
      const r = rng || mulberry32((Math.random() * 1e9) | 0);
      const t0 = (typeof tNow === 'number') ? tNow : 0;
      let spawned = 0;
      for (let k = 0; k < n; k++) {
        const rise = 20 + r() * 40;
        const idx = pool.spawn({
          x: x + (r() - 0.5) * 30, y: y + (r() - 0.5) * 20,
          vx: 0, vy: -rise, tb: t0, maxLife: 8,
          size: 1.5 + r() * 3.5, drag: 0, grav: 0, kind: 1, seed: r() * 10,
        });
        if (idx < 0) break;
        spawned++;
      }
      return spawned;
    },
    update(dt, tNow) {
      pool.update(dt, tNow); // analytic: y = y0 + vy·age แล้ว (ห้ามบวก vy·dt ซ้ำ)
      // สลายเมื่อแตะผิวน้ำ + แกว่งข้างแบบ sine
      pool.forEachAlive((s, i) => {
        if (s.kind !== 1) return;
        if (s.y <= P.Y_SURFACE60 + 2) { pool.kill(i); return; }
        s.x += Math.sin(tNow * 3 + s.seed) * 12 * dt;
      });
    },
    draw(ctx) { drawBubbleParticleSystem(ctx, this); },
  };
}
function drawBubbleParticleSystem(ctx, sys) {
  ctx.save();
  sys.pool.forEachAlive((s) => {
    if (s.kind !== 1) return;
    const a = Math.max(0, Math.min(1, s.life / s.maxLife));
    ctx.strokeStyle = `rgba(200,235,255,${(0.55 * a).toFixed(3)})`;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = `rgba(255,255,255,${(0.35 * a).toFixed(3)})`;
    ctx.beginPath();
    ctx.arc(s.x - s.size * 0.3, s.y - s.size * 0.3, s.size * 0.3, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.restore();
}

// ---- ระบบละอองน้ำ splash 2 ระยะ ----
// ระยะ 1 (ฉีกผิวน้ำขาขึ้น): จุดกำเนิด = จุดหัวพ้นผิว (~306, 760) ตอน ~35.6–36.5 วิ
// ระยะ 2 (กระแทกตกกระทบ): จุดกำเนิด = จุดหัวแตะน้ำ (684, 760) ตอน ~39.31 วิ
// แต่ละระยะปล่อยซ้าย/ขวาสมมาตร 200:200 (แบบ v3), มุมเหนือแนวราบ 30–75°
function createSplashSystem(capacity) {
  const pool = new ParticlePool(capacity || 800);
  return {
    pool, kind: 'splash',
    emitBurst(x, y, tNow, n, vMean, vSd, drag, life) {
      const rng = mulberry32(42 + Math.floor(tNow * 1000));
      let spawned = 0;
      for (let k = 0; k < n; k++) {
        const side = (k % 2 === 0) ? 1 : -1;
        const ang = (30 + rng() * 45) * Math.PI / 180;
        let v0 = vMean + vSd * gauss(rng);
        v0 = Math.min(650, Math.max(150, v0));
        const idx = pool.spawn({
          x, y, vx: side * v0 * Math.cos(ang), vy: -v0 * Math.sin(ang),
          tb: tNow, maxLife: life || 1.6,
          size: 1.5 + rng() * 2.5, drag, grav: 1, kind: 2, seed: rng() * 10,
        });
        if (idx < 0) break;
        spawned++;
      }
      return spawned;
    },
    // ระยะ 1: แรงปานกลาง (v ~380) ปล่อยทยอย 0.2 วิ
    // + ริ้วคลื่นทะลุผิว kind-5 (v2 ข้อ 3 P1): 3 วงซ้อน เหลื่อม 0.08 วิ
    //   ใช้ค่าคงที่เดียวกับ water60.breachRipples60 (r0=20, ขยาย 80 px/s,
    //   เฟดหมดใน 0.8 วิ/วง) แต่ anchor ที่ T_BREACH=36.00 (ไม่ใช่ headExit
    //   ~35.58 ที่เรียก emit นี้) — วงสุดท้ายหมดอายุ 36.96 วิ < 37.00 ✓
    //   เก็บ delay รวมไว้ใน seed; drawSplashPlume คำนวณอายุวงจาก
    //   (maxLife − life) − seed จึงไม่ต้องพึ่ง tb
    emitBreachSpray(x, y, tNow) {
      const spawned = this.emitBurst(x, y, tNow, 200, 380, 90, 0.35, 1.4);
      const P = p60();
      const delayBase = Math.max(0, P.BREACH60.T_BREACH - tNow);
      for (let i = 0; i < 3; i++) {
        const stagger = i * 0.08;
        pool.spawn({
          x, y, vx: 0, vy: 0, tb: tNow, maxLife: delayBase + stagger + 0.8,
          size: 0, drag: 0, grav: 0, kind: 5, seed: delayBase + stagger, hue: 0,
        });
      }
      return spawned;
    },
    // ระยะ 2: แรงกว่า (v ~520) ม่านน้ำยักษ์
    // + ม่านน้ำด้านข้าง kind-2 (v2 ข้อ 2): 160 เม็ดกระจายตลอดแนวลำตัวที่ฟาด
    //   ลงน้ำ (หาง→หัว ณ เวลาแตะน้ำ pitch −55°) ไม่ใช่แค่ฟองตรงหัว —
    //   กระเด็นออกด้านข้างตั้งฉากกับลำตัวทั้งสองฝั่ง + ชี้ขึ้น
    //   v3 จุด 2: ความเร็วข้างของม่านน้ำ = ±150–220 px/s (เดิม 120–340);
    //   ส่วน burst 400 เม็ดคงความเร็วเดิมของ v2 ไว้ (เฟรม F1185 ต้องเหมือนเดิม)
    //   — เฟรมแรกที่ชนเห็นวาฬชัดได้จาก opacity เริ่ม 0.6 ใน drawSplashPlume
    emitSplashdown(x, y, tNow) {
      const spawned = this.emitBurst(x, y, tNow, 400, 520, 110, 0.35, 1.8);
      const P = p60();
      const tT = tNow;
      const c = P.breachCenterAtTime(tT);
      const pr = P.breachPitchDegAtTau(tT - P.BREACH60.T_BREACH) * Math.PI / 180;
      const dir = [Math.cos(pr), Math.sin(pr)];          // หาง → หัว
      const nrm = [-dir[1], dir[0]];                     // ตั้งฉากลำตัว
      const head = [c[0] + 150 * dir[0], c[1] + 150 * dir[1]];
      const tail = [c[0] - 150 * dir[0], c[1] - 150 * dir[1]];
      const rng = mulberry32(777 + Math.floor(tNow * 1000));
      for (let k = 0; k < 160; k++) {
        const u = (k + rng()) / 160;                      // กระจายทั่วแนวลำตัว
        const jx = (rng() - 0.5) * 40, jy = (rng() - 0.5) * 40;
        const px = tail[0] + u * (head[0] - tail[0]) + nrm[0] * jx;
        const py = tail[1] + u * (head[1] - tail[1]) + nrm[1] * jx + jy * 0.3;
        const side = (k % 2 === 0) ? 1 : -1;
        const vPerp = side * (150 + rng() * 70);         // กระเด็นข้าง (v3 จุด 2: ±150–220 px/s ตามบรีฟ — เดิม 120–340)
        const vUp = -(60 + rng() * 180);                  // ชี้ขึ้น
        const vAlong = (rng() - 0.5) * 60;
        pool.spawn({
          x: px, y: py,
          vx: nrm[0] * vPerp + dir[0] * vAlong,
          vy: nrm[1] * vPerp + vUp + dir[1] * vAlong,
          tb: tNow, maxLife: 1.0 + rng() * 0.8,
          size: 2 + rng() * 3, drag: 0.35, grav: 1, kind: 2, seed: rng() * 10,
        });
      }
      return spawned;
    },
    update(dt, tNow) { pool.update(dt, tNow); },
    draw(ctx) { drawSplashPlume(ctx, this); },
  };
}
// v3 (จุด 2): เฟรมแรกของการชนเริ่มจาก opacity 0.6 แล้วค่อยๆ ขึ้นเต็มในเวลานี้
// (เฟดอินแบบเชิงเส้น — ที่อายุ >= 0.12 วิ (เฟรมที่ 4 หลังชน) กลับเป็นค่าเดิม v2
//  ทุกประการ ดังนั้นเฟรม F1185 (อายุ 0.185 วิ) เหมือนเดิม)
const SPLASH_FIRST_ALPHA = 0.6;  // opacity เริ่มต้นของอนุภาค splash kind-2
const SPLASH_FADE_IN = 0.12;     // วิ — เวลาที่ใช้เฟดจาก 0.6 ขึ้นเต็ม
function drawSplashPlume(ctx, sys) {
  ctx.save();
  sys.pool.forEachAlive((s) => {
    if (s.kind === 5) {
      // ริ้วคลื่นทะลุผิว (v2 ข้อ 3): วงรีแบนขยาย 80 px/s เฟดใน 0.8 วิ
      // อายุวง = เวลาตั้งแต่ spawn − delay ที่เก็บใน seed
      const age = (s.maxLife - s.life) - s.seed;
      if (age < 0 || age > 0.8) return;
      const r = 20 + 80 * age;
      const a = 0.7 * (1 - age / 0.8);
      ctx.strokeStyle = `rgba(235,245,255,${a.toFixed(3)})`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.ellipse(s.x, s.y, r, r * 0.28, 0, 0, Math.PI * 2);
      ctx.stroke();
      return;
    }
    if (s.kind !== 2) return;
    const a = Math.max(0, Math.min(1, s.life / s.maxLife));
    // v3 (จุด 2): เฟรมแรกของการชน (age 0) วาดที่ opacity 0.6 — ไม่ใช่ขาวทึบ
    // ทันที — ฟอร์มวาฬที่แตะผิวน้ำยังเห็นชัด แล้วจึงระเบิดเป็นม่านน้ำในเฟรมถัดไป
    // (age = maxLife − life ตามแบบ kind-5; ramp 0.75 -> 1.0 ใน 0.12 วิ
    //  คูณกับฐาน 0.8 ได้ 0.6 ที่ age 0 พอดี และกลับเป็นค่า v2 เดิมที่ age >= 0.12)
    const age = s.maxLife - s.life;
    const ramp = (SPLASH_FIRST_ALPHA / 0.8) + (1 - SPLASH_FIRST_ALPHA / 0.8) * Math.min(age / SPLASH_FADE_IN, 1);
    drawCapsule(ctx, s.x, s.y, s.vx, s.vy, `rgba(235,245,255,${(0.8 * a * ramp).toFixed(3)})`, s.size);
  });
  ctx.restore();
}

// ---- ระบบประกายทองรอบไข่มุก ----
// ไข่มุกอยู่ที่ (SHELL_HINGE.x − 52, SHELL_HINGE.y − 8) ≈ (345, 1187) (ตาม shell.js v3)
function createSparkleSystem(capacity) {
  const P = p60();
  const pool = new ParticlePool(capacity || 120);
  const pearl = [P.SONAR60.SHELL_HINGE[0] - 52, P.SONAR60.SHELL_HINGE[1] - 8];
  return {
    pool, kind: 'sparkles', pearl,
    emit(n, tNow, rng) {
      const r = rng || mulberry32(99);
      let spawned = 0;
      for (let k = 0; k < n; k++) {
        const ang = r() * Math.PI * 2;
        const rad = 18 + r() * 45;
        const idx = pool.spawn({
          x: pearl[0] + Math.cos(ang) * rad, y: pearl[1] + Math.sin(ang) * rad * 0.6,
          vx: 0, vy: 0, tb: tNow, maxLife: 1.2 + r() * 1.2,
          size: 1 + r() * 2.5, drag: 0, grav: 0, kind: 3, seed: ang, hue: rad,
        });
        if (idx < 0) break;
        spawned++;
      }
      return spawned;
    },
    update(dt, tNow) {
      pool.update(dt, tNow);
      // โคจรวอบไข่มุกช้าๆ (วงรี) + กระพริบ
      pool.forEachAlive((s) => {
        if (s.kind !== 3) return;
        const age = tNow - s.tb;
        const ang = s.seed + age * 0.5;
        s.x = pearl[0] + Math.cos(ang) * s.hue;
        s.y = pearl[1] + Math.sin(ang) * s.hue * 0.6 - age * 4;
      });
    },
    draw(ctx) {
      ctx.save();
      pool.forEachAlive((s) => {
        if (s.kind !== 3) return;
        const tw = 0.5 + 0.5 * Math.sin(s.seed * 7 + s.life * 9);
        const a = Math.max(0, Math.min(1, s.life / s.maxLife)) * tw;
        ctx.fillStyle = `rgba(255,215,110,${a.toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.restore();
    },
  };
}

// ---- ระบบพ่นน้ำ (spout): พ่นเมื่อรูจมูกพ้นผิวน้ำเท่านั้น ----
// กรวยครึ่งมุม 15° (Vault #4), v0 ~ N(540, 60) px/s, drag 0.6, ปล่อย 0.8 วิ
function createSpoutSystem(capacity) {
  const P = p60();
  const pool = new ParticlePool(capacity || 250);
  return {
    pool, kind: 'spout', emitting: false, emitUntil: 0,
    // เรียกทุกเฟรม: เปิดปล่อยเมื่อรูจมูกพ้นน้ำ (ประตูฟิสิกส์ — ไม่พ่นใต้น้ำ)
    update(dt, tNow) {
      const above = P.isNostrilAboveWater(tNow);
      const tSpout = P.spoutStartTime();
      if (above && tNow >= tSpout && tNow <= tSpout + 0.8) {
        if (!this.emitting) { this.emitting = true; this.emitUntil = tSpout + 0.8; }
        const n = P.whaleNostrilAt(tNow);
        const rng = mulberry32(1234 + Math.floor(tNow * 300));
        // ปล่อย ~8 เม็ด/เฟรม (250 เม็ด / 0.8 วิ ที่ 30fps ≈ 10/เฟรม — คุมด้วย pool)
        for (let k = 0; k < 8; k++) {
          let z; do { z = gauss(rng); } while (Math.abs(z) > 3);
          const v0 = 540 + 60 * z;
          const th = (rng() * 2 - 1) * 15 * Math.PI / 180;
          pool.spawn({
            x: n[0], y: n[1],
            vx: v0 * Math.sin(th), vy: -v0 * Math.cos(th),
            tb: tNow, maxLife: 1.6, size: 1.5 + rng() * 2.5,
            drag: 0.6, grav: 1, kind: 4, seed: rng() * 10,
          });
        }
      } else if (tNow > this.emitUntil) {
        this.emitting = false;
      }
      pool.update(dt, tNow);
    },
    draw(ctx) {
      ctx.save();
      pool.forEachAlive((s) => {
        if (s.kind !== 4) return;
        const a = Math.max(0, Math.min(1, s.life / s.maxLife));
        drawCapsule(ctx, s.x, s.y, s.vx, s.vy, `rgba(240,248,255,${(0.75 * a).toFixed(3)})`, s.size);
      });
      ctx.restore();
    },
  };
}

// ---- อนุภาคหิมะ/ตะกอนลอย (ambient): Brownian random walk จริง (Vault #4) ----
// knot ทุก 0.25 วิ สะสม increment N(0, σ²·dt), σ = 6 px/√s — คัดลอกแนว v3
function createAmbientSystem(capacity, tMax) {
  const P = p60();
  const N = capacity || 80;
  const DT = 0.25, SIGMA = 6, TMAX = tMax || 60;
  const rng = mulberry32(42);
  const nKnot = Math.round(TMAX / DT);
  const step = SIGMA * Math.sqrt(DT);
  const items = [];
  for (let i = 0; i < N; i++) {
    const wx = [0], wy = [0];
    for (let k = 1; k <= nKnot; k++) {
      wx.push(wx[k - 1] + step * gauss(rng));
      wy.push(wy[k - 1] + step * gauss(rng));
    }
    items.push({
      x0: rng() * P.W60, y0: rng() * P.H60,
      rise: 15 + rng() * 15, wx, wy,
    });
  }
  return {
    kind: 'ambient', items, nKnot, dt: DT,
    // คืนตำแหน่ง ณ เวลา t (pure function — ไม่ใช้ pool เพราะไม่เกิด/ตาย)
    at(t) {
      const ts = Math.max(0, t);
      const kf = Math.min(ts / DT, nKnot - 1);
      const k0 = Math.floor(kf), u = kf - k0;
      return items.map((p) => {
        const bx = p.wx[k0] + (p.wx[k0 + 1] - p.wx[k0]) * u;
        const by = p.wy[k0] + (p.wy[k0 + 1] - p.wy[k0]) * u;
        const wrap = (v, m) => (((v % m) + m) % m);
        return {
          x: wrap(p.x0 + bx, P.W60),
          y: wrap(p.y0 - p.rise * ts + by, P.H60),
        };
      });
    },
    draw(ctx, t) {
      ctx.save();
      ctx.fillStyle = 'rgba(220,235,245,0.5)';
      for (const pt of this.at(t)) {
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, 1.4, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    },
  };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    ParticlePool, drawCapsule, createBubbleSystem, drawBubbleParticleSystem,
    createSplashSystem, drawSplashPlume, SPLASH_FIRST_ALPHA, SPLASH_FADE_IN,
    createSparkleSystem,
    createSpoutSystem, createAmbientSystem, mulberry32, gauss,
  };
}
