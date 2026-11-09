const { test } = require('node:test');
const assert = require('node:assert/strict');
const { diagnose } = require('../scripts/doctor.cjs');
const ok = { platform: 'linux', arch: 'x64', nodeVersion: 'v24.0.0', run: (name) => name === 'npm' ? '11.0.0' : name.startsWith('python') ? 'Python 3.12' : 'version', exists: () => true, packageInstalled: () => true, browserOverride: '', browsers: ['chromium', 'chromium-browser', 'google-chrome', 'google-chrome-stable'] };
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
