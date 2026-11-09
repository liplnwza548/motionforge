# MF-002 — Dependency and installation readiness

## Scope and changes

Adds a read-only Node doctor, pinned `puppeteer-core` dependency and npm lockfile, and automated checks. It does not change S06 physics, renderer or audio. The doctor checks executable availability/version, Node >=18, npm, Python 3, local package resolution, browser, repository files, OS and architecture. It returns 1 for FAIL and 0 for PASS/WARN. Browser detection tries PATH and common Windows Chrome/Edge locations; set `MOTIONFORGE_BROWSER` to an executable to override discovery. A specified invalid path fails even if another browser is installed. `--version` checks availability, not browser/Puppeteer protocol compatibility.

A successful doctor means the checked prerequisites exist; it does not certify end-to-end rendering. Legacy renderers hardcode VM-specific paths and obsolete URLs and do not use the local package or browser override. MF-001 also identifies broken 12s paths, missing licensed audio, incompatible audio mix filenames and unverified determinism; these remain outstanding.

## Install and run

Install Node.js 18 or later (including npm), Python 3, FFmpeg with ffprobe, and Chromium or Chrome from trusted sources. Make each available on PATH. Project dependencies install locally; `puppeteer-core` does not download a browser. Doctor does not install software and requires no administrator privileges. System installation permissions depend on the chosen distribution and environment.

On Linux, from the repository root:

```sh
npm ci
npm run doctor
npm test
# Optional browser override:
MOTIONFORGE_BROWSER=/path/to/chromium npm run doctor
```

On Windows PowerShell, from the repository root:

```powershell
npm ci
npm run doctor
npm test
# Optional browser override:
$env:MOTIONFORGE_BROWSER = 'C:\Path\To\chrome.exe'
npm run doctor
Remove-Item Env:MOTIONFORGE_BROWSER
```

If npm is unavailable, reinstall Node with npm and reopen the terminal. If FFmpeg/ffprobe or Python are missing, install them and update PATH. Install a Chromium-compatible browser or set the override. If a repository file is missing, restore the checkout. For package errors run `npm ci`. Legacy Bash audio scripts require a suitable shell on Windows and are not covered by doctor compatibility checks.

## Results and evidence

[Commands, versions, environment and exit codes](evidence/MF-002/run.txt) link by filename to captured stdout and stderr in that directory. Evidence was collected on Linux x86_64, Node 24.22.1, npm 11.9.0. Paths were redacted; no Windows runtime was available.

| Check | Status | Evidence |
|---|---|---|
| `npm ci` from lockfile | VERIFIED, exit 0 | [stdout](evidence/MF-002/install.stdout.txt), [stderr](evidence/MF-002/install.stderr.txt) |
| `npm run doctor` | VERIFIED, exit 0 with 2 WARN | [stdout](evidence/MF-002/doctor.stdout.txt), [stderr](evidence/MF-002/doctor.stderr.txt) |
| Invalid browser override | VERIFIED negative check, exit 1 | [stdout](evidence/MF-002/doctor-invalid-browser.stdout.txt), [stderr](evidence/MF-002/doctor-invalid-browser.stderr.txt) |
| `npm test` | VERIFIED, 4 tests pass | [stdout](evidence/MF-002/doctor-tests.stdout.txt), [stderr](evidence/MF-002/doctor-tests.stderr.txt); tests simulate missing FFmpeg/browser/package/Python/files |
| Physics / shots | VERIFIED, 11/11 and 28/28, unchanged from MF-001 | [physics](evidence/MF-002/physics.stdout.txt), [shots](evidence/MF-002/shots.stdout.txt); stderr files in evidence directory |
| Windows | UNVERIFIED | Instructions and implementation have not been run on Windows. |
| Full render/audio | BLOCKED / UNVERIFIED | Legacy paths and missing assets remain; no MP4 rendering claim. |

## Acceptance and handoff

- [x] Lockfile installation, positive doctor and automated negative checks verified on Linux.
- [x] Existing physics and shot tests match MF-001 baseline.
- [x] Known renderer and audio issues remain visible; no engine changes.
- [ ] Windows execution verified (requires a Windows environment).
- [ ] End-to-end output verified (out of scope).

Recommend MF-003 define and test a portable renderer configuration and frame reproducibility, subject to the approved roadmap. Do not assume the local package changes the legacy renderer's hardcoded imports.
