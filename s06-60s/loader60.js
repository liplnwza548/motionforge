/**
 * loader60.js — โหลดโมดูล S06 60 วิ แบบแยก scope ต่อไฟล์
 *
 * ปัญหา: โมดูลขั้นที่ 1 ทุกไฟล์ (whale60/camera60/water60/particles60)
 * ประกาศ `let P60` + helper (`clamp01`/`smooth01`/...) ระดับ top-level ซ้ำกัน
 * โหลดด้วย <script src> ตรงๆ จะ SyntaxError ตั้งแต่ไฟล์ที่สอง:
 *   "Identifier 'P60' has already been declared"
 * และห้ามแก้ไฟล์โมดูลขั้นที่ 1 — จึงโหลดด้วยวิธีนี้แทน:
 *   fetch โค้ด -> eval ใน IIFE ต่อไฟล์ (scope แยกกัน ไม่ชนกัน)
 *   -> แปะเฉพาะชื่อที่ export ลง window (draw60.js เรียกชื่อพวกนี้
 *      แบบ bare name ซึ่ง resolve ผ่าน window ได้)
 * โมดูลแต่ละไฟล์อ้างถึงกันแค่ผ่าน window.PHYSICS60 (bridge ใน index.html)
 * จึงไม่มีปัญหาข้ามไฟล์ตอนโหลด
 */
'use strict';

const MODULES60 = [
  { src: 'whale60.js', exports: ['WARMUP_FRAMES', 'WhaleState', 'localSpine', 'spineLength', 'computeSpineNodes', 'bodyWidth60', 'WMAX60', 'rollPhi60', 'waveAmp60', 'whaleSpineAt', 'whaleOutlinePoints', 'drawWhale60', 'sampleSpline', 'smoothPath'] },
  { src: 'camera60.js', exports: ['SHOT_CAM60', 'shakeNoise', 'shakeEnvelope', 'cameraFor', 'setVirtualCamera', 'applyCamera', 'worldToScreen', 'screenToWorld', 'smoothCamera'] },
  { src: 'water60.js', exports: ['GERSTNER_WAVES', 'GERSTNER_SUM_A', 'gerstnerPoint', 'surfaceYAt', 'BREACH_BULGE_X', 'BULGE_MAX', 'SPREAD_SPEED', 'bulgeAt', 'spreadWaveAt', 'whiteWaterAt', 'drawDynamicWaterSurface', 'drawSonarWave', 'drawSonarPing', 'drawCausticRays', 'drawSandFloor', 'drawSeaweed', 'SEAWEED_LAYERS', 'mulberry32'] },
  { src: 'particles60.js', exports: ['ParticlePool', 'drawCapsule', 'createBubbleSystem', 'drawBubbleParticleSystem', 'createSplashSystem', 'drawSplashPlume', 'SPLASH_FIRST_ALPHA', 'SPLASH_FADE_IN', 'createSparkleSystem', 'createSpoutSystem', 'createAmbientSystem', 'mulberry32', 'gauss'] },
  { src: 'shell60.js', exports: ['SHELL60', 'shellAngle60', 'shellPearlGlow60', 'shellPearlHalo60', 'shellEchoRing60', 'shellPulseRings60', 'shellQuad', 'shellHalfPath', 'shellRidges', 'shellOutlinePoints60', 'drawShellLower60', 'drawGoldenLight60', 'drawPearl60', 'drawShellUpper60', 'drawShell60'] },
  { src: 'shots60.js', exports: ['POSE_KEYS', 'COIL', 'coilPoint', 'coilPolylineLength', 'coilPointAtArc', 'coilArcAt', 'whaleCenter60', 'whalePitch60', 'whaleRoll60', 'whaleAmp60', 'whaleSpeed60', 'whaleVelocity60', 'whalePoseAt', 'ping3Staging'] },
  { src: 'draw60.js', exports: [] }, // draw60 ตั้ง window.drawFrame / window.__done เอง
];

async function loadModules60() {
  for (const m of MODULES60) {
    const res = await fetch(m.src);
    if (!res.ok) throw new Error(`load ${m.src}: HTTP ${res.status}`);
    const code = await res.text();
    const names = m.exports.join(', ');
    // IIFE แยก scope; return เฉพาะชื่อที่ export
    const factory = new Function(`return (function(){ ${code} ; return { ${names} }; })();`);
    const exp = factory();
    for (const n of m.exports) window[n] = exp[n];
  }
}
window.loadModules60 = loadModules60;
