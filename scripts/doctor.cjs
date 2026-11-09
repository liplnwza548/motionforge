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
  const browser = browserCandidates.map(name => ({ name, version: probe(name) })).find(x => x.version);
  add(browser ? 'PASS' : 'FAIL', browser ? `Browser: ${browser.name} (${browser.version})` : 'Browser missing or invalid; install Chromium/Chrome, add it to PATH, or set MOTIONFORGE_BROWSER to its executable path.');
  const missing = ['s06-60s/index.html', 's06-60s/render60.js', 's06-60s/draw60.js', 's06-60s/physics60.js', 's06-60s/loader60.js', 's06-60s/build_60s.sh', 's06-60s/build_audio_60s.sh', 's06-12s/test_breach.js'].filter(f => !ctx.exists(f));
  add(missing.length ? 'FAIL' : 'PASS', missing.length ? `Repository files missing: ${missing.join(', ')}; restore the checkout.` : 'Required repository files present.');
  add('WARN', 'Legacy renderer hardcodes VM paths and obsolete URLs; installed tools do not make it portable. See docs/MF-001-baseline.md.');
  add('WARN', 'Audio assets and mix filenames require separate work; full video output is not validated.');
  return checks;
}
function main() {
  const windows = process.platform === 'win32';
  const candidates = windows ? ['chrome', 'msedge', ...[process.env.PROGRAMFILES, process.env['PROGRAMFILES(X86)'], process.env.LOCALAPPDATA].filter(Boolean).flatMap(dir => [path.join(dir, 'Google', 'Chrome', 'Application', 'chrome.exe'), path.join(dir, 'Microsoft', 'Edge', 'Application', 'msedge.exe')])] : ['chromium', 'chromium-browser', 'google-chrome', 'google-chrome-stable'];
  const run = (cmd, args) => {
    const actual = windows && cmd === 'npm' ? 'npm.cmd' : cmd;
    // npm.cmd is a fixed command; other paths are never passed through a shell.
    const r = windows && cmd === 'npm' ? spawnSync('cmd.exe', ['/d', '/s', '/c', 'npm.cmd --version'], { encoding: 'utf8', timeout: 5000, windowsHide: true }) : spawnSync(actual, args, { encoding: 'utf8', timeout: 5000, windowsHide: true });
    return !r.error && r.status === 0 ? (r.stdout || r.stderr).trim().split(/\r?\n/)[0] || 'available' : null;
  };
  const checks = diagnose({ platform: process.platform, arch: process.arch, nodeVersion: process.version, run, browsers: candidates, browserOverride: process.env.MOTIONFORGE_BROWSER || '', exists: f => fs.existsSync(path.join(root, f)), packageInstalled: () => { try { require.resolve(path.join(root, 'node_modules', 'puppeteer-core')); return true; } catch { return false; } } });
  for (const c of checks) console.log(`[${c.status}] ${c.message}`);
  return checks.some(c => c.status === 'FAIL') ? 1 : 0;
}
module.exports = { diagnose, main };
if (require.main === module) process.exitCode = main();
