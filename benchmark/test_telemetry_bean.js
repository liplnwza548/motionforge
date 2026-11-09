// สคริปต์ทดสอบเดียวกันสำหรับ telemetry_bean.js และ telemetry_bean.js
// โหลด telemetry(t) จากแต่ละไฟล์ แล้วเทียบค่าที่ t = 0, 0.25, 0.5, 0.75, 1.0, 1.5, 2.0 วิ
// ตรวจ: คืน {speed,pitch,amplitude,drag} ครบไหม, เปลี่ยนตามเวลาไหม, deterministic ไหม,
// min-max ตลอด t 0-4 วิ, drag โตตาม speed^2 ไหม (drag/speed^2 ต้องคงที่),
// cross-check กับ spine ของตัวเอง: สร้างตำแหน่งหัว/หางขึ้นใหม่จากค่าคงที่ที่โมเดล
// ประกาศไว้ในไฟล์ของตัวเอง (L, omega, dphi, A_MAX, head ratio, V0/U0, S) แล้วเทียบ
// speed กับอนุพันธ์เชิงตัวเลขของตำแหน่งหัว และ pitch กับมุมเส้นหัว-หางที่สร้างขึ้นใหม่
const fs = require('fs');
const path = require('path');

function loadTelemetry(file) {
  const code = fs.readFileSync(path.join(__dirname, file), 'utf8');
  const fn = new Function(code + '\n; return telemetry;');
  return { tel: fn(), code };
}

// ดึงค่าคงที่จากข้อความในไฟล์ของโมเดลเอง (regex ง่ายๆ — ค่าอยู่ในโค้ด/คอมเมนต์ของไฟล์นั้น)
function parseConsts(code) {
  const num = (re) => { const m = code.match(re); return m ? parseFloat(m[1]) : null; };
  // สำคัญ: ต้องลองรูป 2πf ก่อน เพราะ /OMEGA = 2 * Math.PI * 0.5/ จะโดน regex ตัวเลขธรรมดาจับเลข 2 ตัวแรกผิด
  let omega = null;
  const f = num(/OMEGA\s*=\s*2\s*\*\s*Math\.PI\s*\*\s*([\d.]+)/);
  if (f !== null) omega = 2 * Math.PI * f;
  if (omega === null) omega = num(/OMEGA\s*=\s*([\d.]+)/);
  const dphi = num(/DPHI\s*=\s*([\d.]+)/) ?? num(/DELTA_PHI\s*=\s*([\d.]+)/);
  const L = num(/const L\s*=\s*([\d.]+)/);
  const aMax = num(/A_MAX\s*=\s*([\d.]+)/);
  const headRatio = num(/A_HEAD\s*=\s*([\d.]+)/) ?? num(/HEAD_AMP_RATIO\s*=\s*([\d.]+)/);
  const v0 = num(/U0\s*=\s*([\d.]+)/) ?? num(/V0\s*=\s*([\d.]+)/);
  const S = num(/const S\s*=\s*([\d.]+)/) ?? 0;
  return { omega, dphi, L, aMax, headRatio, v0, S };
}

// ตำแหน่งหัว/หางที่สร้างขึ้นใหม่จากสูตร travelling wave ของโมเดลเอง
// head: x = V0*t (+S*sin(2wt) ถ้ามี), y = A_head*sin(wt) ; tail: y = A_MAX*sin(wt-11*dphi), x = head.x - L
function headTail(c, t) {
  const aHead = c.aMax * c.headRatio;
  const xh = c.v0 * t + c.S * Math.sin(2 * c.omega * t);
  const yh = aHead * Math.sin(c.omega * t);
  const yt = c.aMax * Math.sin(c.omega * t - 11 * c.dphi);
  return { xh, yh, xt: xh - c.L, yt };
}

function pearson(xs, ys) {
  const n = xs.length, mx = xs.reduce((a, b) => a + b, 0) / n, my = ys.reduce((a, b) => a + b, 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) { sxy += (xs[i] - mx) * (ys[i] - my); sxx += (xs[i] - mx) ** 2; syy += (ys[i] - my) ** 2; }
  return sxy / Math.sqrt(sxx * syy);
}

function analyze(name, file) {
  const { tel, code } = loadTelemetry(file);
  const c = parseConsts(code);
  console.log(`\n===== ${name} =====`);
  console.log(`consts parsed from own file: L=${c.L} omega=${c.omega?.toFixed(4)} dphi=${c.dphi} A_MAX=${c.aMax} headRatio=${c.headRatio} V0/U0=${c.v0} S=${c.S}`);
  const times = [0, 0.25, 0.5, 0.75, 1.0, 1.5, 2.0];
  const rows = times.map(t => ({ t, ...tel(t) }));
  for (const r of rows) {
    console.log(`t=${r.t.toFixed(2)} speed=${r.speed.toFixed(2)} px/s pitch=${r.pitch.toFixed(2)} deg amp=${r.amplitude.toFixed(2)} px drag=${r.drag.toFixed(1)} N`);
  }
  // รูปแบบคืนค่าครบ + finite
  const keysOk = rows.every(r => ['speed', 'pitch', 'amplitude', 'drag'].every(k => Number.isFinite(r[k])));
  console.log(`returns {speed,pitch,amplitude,drag} finite at all 7 times: ${keysOk}`);
  // deterministic: เรียกซ้ำ
  const det = times.every(t => { const a = tel(t), b = tel(t); return a.speed === b.speed && a.pitch === b.pitch && a.amplitude === b.amplitude && a.drag === b.drag; });
  console.log(`deterministic (repeat call identical): ${det}`);
  // สแกน t 0-4 วิ ทีละ 0.01
  const scan = [];
  for (let k = 0; k <= 400; k++) scan.push({ t: k * 0.01, ...tel(k * 0.01) });
  const mm = (key) => { const v = scan.map(s => s[key]); return [Math.min(...v), Math.max(...v)]; };
  const [spMin, spMax] = mm('speed'), [piMin, piMax] = mm('pitch'), [amMin, amMax] = mm('amplitude'), [drMin, drMax] = mm('drag');
  console.log(`min-max t=0-4s: speed ${spMin.toFixed(2)}..${spMax.toFixed(2)} | pitch ${piMin.toFixed(2)}..${piMax.toFixed(2)} | amp ${amMin.toFixed(2)}..${amMax.toFixed(2)} | drag ${drMin.toFixed(1)}..${drMax.toFixed(1)}`);
  const varies = [spMin !== spMax, piMin !== piMax, amMin !== amMax, drMin !== drMax];
  console.log(`varies with t (speed/pitch/amp/drag): ${varies.map(v => v ? 'yes' : 'NO').join('/')}`);
  console.log(`amp ever negative (signed displacement, not |.|): ${amMin < 0 ? 'YES ' + amMin.toFixed(2) : 'no'}`);
  // drag โตตาม speed^2: drag/speed^2 ต้องคงที่
  const ratios = scan.map(s => s.drag / (s.speed * s.speed));
  const rMin = Math.min(...ratios), rMax = Math.max(...ratios);
  console.log(`drag/speed^2: min ${rMin.toFixed(6)} max ${rMax.toFixed(6)} spread ${(((rMax - rMin) / rMin) * 100).toFixed(4)}% (constant => drag = k*speed^2 exactly)`);
  const rSpeedDrag = pearson(scan.map(s => s.speed), scan.map(s => s.drag));
  const rSpeedAmp = pearson(scan.map(s => s.speed), scan.map(s => Math.abs(s.amplitude)));
  console.log(`Pearson r(speed,drag)=${rSpeedDrag.toFixed(4)} | r(speed,|amp|)=${rSpeedAmp.toFixed(4)}`);
  // cross-check กับ spine ของตัวเอง: อนุพันธ์เชิงตัวเลขของหัว + มุมหัว-หาง
  const dt = 0.001;
  let maxSpeedErr = 0, maxPitchErr = 0, maxAmpErr = 0;
  for (const { t } of scan.filter((_, i) => i % 10 === 0)) {
    const h1 = headTail(c, t - dt), h2 = headTail(c, t + dt), h0 = headTail(c, t);
    const vx = (h2.xh - h1.xh) / (2 * dt), vy = (h2.yh - h1.yh) / (2 * dt);
    const numSpeed = Math.hypot(vx, vy);
    const numPitch = Math.atan2(-(h0.yh - h0.yt), h0.xh - h0.xt) * 180 / Math.PI;
    const rep = tel(t);
    maxSpeedErr = Math.max(maxSpeedErr, Math.abs(rep.speed - numSpeed) / numSpeed * 100);
    maxPitchErr = Math.max(maxPitchErr, Math.abs(rep.pitch - numPitch));
    // amplitude: BEAN ใช้ |tail disp|, BEAN ใช้ signed — เทียบทั้งสองแบบ รายงานแบบที่ตรงกว่า
    const signedAmp = h0.yt, absAmp = Math.abs(h0.yt);
    const err = Math.min(Math.abs(rep.amplitude - signedAmp), Math.abs(rep.amplitude - absAmp));
    maxAmpErr = Math.max(maxAmpErr, err);
  }
  console.log(`cross-check vs own spine (41 sampled t): max speed err ${maxSpeedErr.toFixed(3)}% | max pitch err ${maxPitchErr.toFixed(3)} deg | max amp err ${maxAmpErr.toFixed(3)} px`);
  // คาบของ speed: ต้องซ้ำทุก 2*pi/omega
  const period = 2 * Math.PI / c.omega;
  const perErr = Math.max(...[0, 0.5, 1.0].map(t => Math.abs(tel(t + period).speed - tel(t).speed)));
  console.log(`speed period check (period 2pi/omega=${period.toFixed(3)}s): max |speed(t+T)-speed(t)| = ${perErr.toFixed(4)} px/s`);
  return { rows, mm: { spMin, spMax, piMin, piMax, amMin, amMax, drMin, drMax }, det, keysOk, ratioSpreadPct: (rMax - rMin) / rMin * 100, rSpeedDrag, rSpeedAmp, maxSpeedErr, maxPitchErr, maxAmpErr, period };
}

function codeLines(file) {
  const txt = fs.readFileSync(path.join(__dirname, file), 'utf8');
  const noBlock = txt.replace(/\/\*[\s\S]*?\*\//g, '');
  const code = noBlock.split('\n').filter(l => l.trim() && !l.trim().startsWith('//'));
  return { total: txt.split('\n').length, codeOnly: code.length };
}

const opus = analyze('BEAN (telemetry_bean.js)', 'telemetry_bean.js');
const flash = analyze('BEAN (telemetry_bean.js)', 'telemetry_bean.js');
console.log('\n===== CODE LENGTH (new criterion: code-only lines, excl. comments/blank) =====');
for (const f of ['telemetry_bean.js', 'telemetry_bean.js']) {
  const { total, codeOnly } = codeLines(f);
  console.log(`${f}: total ${total} lines, code-only ${codeOnly} lines => ${codeOnly <= 60 ? 2 : codeOnly <= 120 ? 1 : 0} pts (<=60:2, 61-120:1, >120:0)`);
}
console.log('\n===== SUMMARY =====');
console.log(`BEAN : speed ${opus.mm.spMin.toFixed(1)}..${opus.mm.spMax.toFixed(1)} pitch ${opus.mm.piMin.toFixed(1)}..${opus.mm.piMax.toFixed(1)} amp ${opus.mm.amMin.toFixed(1)}..${opus.mm.amMax.toFixed(1)} drag ${opus.mm.drMin.toFixed(0)}..${opus.mm.drMax.toFixed(0)} | drag/speed^2 spread ${opus.ratioSpreadPct.toFixed(4)}% | cross speed err ${opus.maxSpeedErr.toFixed(2)}% pitch err ${opus.maxPitchErr.toFixed(2)}deg`);
console.log(`BEAN: speed ${flash.mm.spMin.toFixed(1)}..${flash.mm.spMax.toFixed(1)} pitch ${flash.mm.piMin.toFixed(1)}..${flash.mm.piMax.toFixed(1)} amp ${flash.mm.amMin.toFixed(1)}..${flash.mm.amMax.toFixed(1)} drag ${flash.mm.drMin.toFixed(0)}..${flash.mm.drMax.toFixed(0)} | drag/speed^2 spread ${flash.ratioSpreadPct.toFixed(4)}% | cross speed err ${flash.maxSpeedErr.toFixed(2)}% pitch err ${flash.maxPitchErr.toFixed(2)}deg`);
