const { test } = require('node:test');
const assert = require('node:assert/strict');
const { diagnose } = require('../scripts/doctor.cjs');
const ok = { platform: 'linux', arch: 'x64', nodeVersion: 'v24.0.0', run: (name) => name === 'npm' ? '11.0.0' : name.startsWith('python') ? 'Python 3.12' : name.includes('chrome') || name === 'chromium' ? 'Chromium 130.0.0.0' : 'version', exists: () => true, packageInstalled: () => true, browserOverride: '', browsers: ['chromium', 'chromium-browser', 'google-chrome', 'google-chrome-stable'] };
const result = (options = {}) => diagnose({ ...ok, ...options });
test('reports ready when required tools and files are available', () => {
  const checks = result();
  assert.equal(checks.some(c => c.status === 'FAIL'), false);
  assert.ok(checks.some(c => c.status === 'WARN' && /legacy/i.test(c.message)));
});
test('reports missing ffmpeg and browser as blocking with guidance', () => {
  const checks = result({ run: name => ['ffmpeg', 'chromium', 'chromium-browser', 'google-chrome', 'google-chrome-stable'].includes(name) ? null : name.startsWith('python') ? 'Python 3.12' : 'version' });
  assert.ok(checks.some(c => c.status === 'FAIL' && /FFmpeg/.test(c.message)));
  assert.ok(checks.some(c => c.status === 'FAIL' && /browser/i.test(c.message)));
});
test('reports missing package, python and repository files', () => {
  const checks = result({ packageInstalled: () => false, exists: () => false, run: name => name === 'python3' || name === 'python' ? null : name.startsWith('python') ? 'Python 3.12' : 'version' });
  for (const pattern of [/puppeteer-core/, /Python/, /repository/i]) assert.ok(checks.some(c => c.status === 'FAIL' && pattern.test(c.message)));
});
test('invalid explicit browser path is blocking even if another browser exists', () => {
  const checks = result({browserOverride: '/bad/browser', run: name => name === '/bad/browser' ? null : name.startsWith('python') ? 'Python 3.12' : 'version'});
  assert.ok(checks.some(c => c.status === 'FAIL' && /browser/i.test(c.message)));
});

test('recognizes Chromium, Chrome and Edge version strings', () => {
  for (const version of ['Chromium 156.0.8078.79', 'Google Chrome 130.0.1.2', 'Microsoft Edge 130.0.2.3']) {
    const checks = result({ browserOverride: 'browser', run: name => name === 'browser' ? version : name.startsWith('python') ? 'Python 3.12' : '1.0' });
    assert.ok(checks.some(c => c.status === 'PASS' && c.message.startsWith('Browser:')), version);
  }
});
test('rejects unrelated successful version response and malformed browser identity', () => {
  for (const version of ['Python 3.12.14', 'Chromium helper 2.0', 'Google Chrome', 'Microsoft Edge nope']) {
    const checks = result({ browserOverride: 'not-a-browser', run: name => name === 'not-a-browser' ? version : name.startsWith('python') ? 'Python 3.12' : '1.0' });
    assert.ok(checks.some(c => c.status === 'FAIL' && /Browser/.test(c.message)), version);
  }
});
test('Windows discovery includes Chrome and Edge in common installation paths', () => {
  const { browserCandidates } = require('../scripts/doctor.cjs');
  const candidates = browserCandidates('win32', { PROGRAMFILES: 'C:\\Program Files', LOCALAPPDATA: 'C:\\Users\\Test\\AppData\\Local' });
  assert.ok(candidates.includes('chrome'));
  assert.ok(candidates.includes('msedge'));
  assert.ok(candidates.includes('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'));
  assert.ok(candidates.includes('C:\\Users\\Test\\AppData\\Local\\Microsoft\\Edge\\Application\\msedge.exe'));
});
test('Windows npm probe uses cmd without putting browser paths in shell commands', () => {
  const { commandSpec } = require('../scripts/doctor.cjs');
  assert.deepEqual(commandSpec('win32', 'npm', ['--version']), { command: 'cmd.exe', args: ['/d', '/s', '/c', 'npm.cmd --version'] });
  assert.deepEqual(commandSpec('win32', 'C:\\Program Files\\Browser\\chrome.exe', ['--version']), { command: 'C:\\Program Files\\Browser\\chrome.exe', args: ['--version'] });
});
