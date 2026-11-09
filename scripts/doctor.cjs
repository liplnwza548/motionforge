#!/usr/bin/env node
'use strict';
const path = require('node:path');
const fs = require('node:fs');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');

function diagnose(ctx) {
  const checks = [];
  const add = (status, message) => checks.push({ status, message });
  const probe = (cmd, args = ['--version']) => ctx.run(cmd, args);
  add('PASS', `OS: ${ctx.platform} ${ctx.arch}`);
  if (!['linux', 'win32'].includes(ctx.platform)) add('WARN', 'Only Linux and Windows are targeted; this OS is unverified.');
  const major = Number(ctx.nodeVersion.match(/^v(\d+)/)?.[1]);
  add(major >= 18 ? 'PASS' : 'FAIL', `Node ${ctx.nodeVersion}; use Node 18 or newer.`);
  const npm = probe('npm');
  add(npm ? 'PASS' : 'FAIL', npm ? `npm: ${npm}` : 'npm missing; install Node.js with npm and reopen your terminal.');
  for (const [cmd, label] of [['ffmpeg', 'FFmpeg'], ['ffprobe', 'ffprobe']]) {
    const version = probe(cmd, ['-version']);
    add(version ? 'PASS' : 'FAIL', version ? `${label}: ${version}` : `${label} missing; install FFmpeg and add its bin directory to PATH.`);
  }
  const python = ['python3', 'python'].map(n => probe(n)).find(v => v && /^Python 3\./.test(v));
  add(python ? 'PASS' : 'FAIL', python ? `Python: ${python}` : 'Python missing; install Python 3 and add it to PATH (required by legacy HTTP server).');
  const packageOk = ctx.packageInstalled();
  add(packageOk ? 'PASS' : 'FAIL', packageOk ? 'puppeteer-core installed locally.' : 'puppeteer-core missing; run npm ci in the repository.');
  const browserCandidates = ctx.browserOverride ? [ctx.browserOverride] : ctx.browsers;
  const browser = browserCandidates.map(name => ({ name, version: probe(name) })).find(x => x.version && /^(?:Chromium|Google Chrome|Microsoft Edge)\s+\d+(?:\.\d+)+(?:\s|$)/i.test(x.version.trim()));
  add(browser ? 'PASS' : 'FAIL', browser ? `Browser: ${browser.name} (${browser.version})` : 'Browser missing or invalid; install Chromium/Chrome, add it to PATH, or set MOTIONFORGE_BROWSER to its executable path.');
  const missing = ['s06-60s/index.html', 's06-60s/render60.js', 's06-60s/draw60.js', 's06-60s/physics60.js', 's06-60s/loader60.js', 's06-60s/build_60s.sh', 's06-60s/build_audio_60s.sh', 's06-12s/test_breach.js'].filter(f => !ctx.exists(f));
  add(missing.length ? 'FAIL' : 'PASS', missing.length ? `Repository files missing: ${missing.join(', ')}; restore the checkout.` : 'Required repository files present.');
  add('WARN', 'Legacy 12-second renderer retains VM paths and obsolete URLs; 60-second PNG render is available via npm run render. See docs/MF-003-standard-render.md.');
  add('WARN', 'Audio assets and mix filenames require separate work; full video output is not validated.');
  return checks;
}
function browserCandidates(platform, env) {
  return platform === 'win32' ? ['chrome', 'msedge', ...[env.PROGRAMFILES, env['PROGRAMFILES(X86)'], env.LOCALAPPDATA].filter(Boolean).flatMap(dir => [path.win32.join(dir, 'Google', 'Chrome', 'Application', 'chrome.exe'), path.win32.join(dir, 'Microsoft', 'Edge', 'Application', 'msedge.exe')])] : ['chromium', 'chromium-browser', 'google-chrome', 'google-chrome-stable', 'microsoft-edge', 'microsoft-edge-stable'];
}
function commandSpec(platform, cmd, args) {
  return platform === 'win32' && cmd === 'npm' ? { command: 'cmd.exe', args: ['/d', '/s', '/c', 'npm.cmd --version'] } : { command: cmd, args };
}
function main() {
  const candidates = browserCandidates(process.platform, process.env);
  const run = (cmd, args) => {
    const spec = commandSpec(process.platform, cmd, args);
    const r = spawnSync(spec.command, spec.args, { encoding: 'utf8', timeout: 5000, windowsHide: true });
    return !r.error && r.status === 0 ? (r.stdout || r.stderr).trim().split(/\r?\n/)[0] || 'available' : null;
  };
  const checks = diagnose({ platform: process.platform, arch: process.arch, nodeVersion: process.version, run, browsers: candidates, browserOverride: process.env.MOTIONFORGE_BROWSER || '', exists: f => fs.existsSync(path.join(root, f)), packageInstalled: () => { try { require.resolve(path.join(root, 'node_modules', 'puppeteer-core')); return true; } catch { return false; } } });
  for (const c of checks) console.log(`[${c.status}] ${c.message}`);
  return checks.some(c => c.status === 'FAIL') ? 1 : 0;
}
module.exports = { diagnose, main, browserCandidates, commandSpec };
if (require.main === module) process.exitCode = main();
