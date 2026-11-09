# MF-003 — Standard S06 frame renderer

## Architecture and usage

The existing `s06-60s/render60.js` is the sole 60-second renderer entry point. It uses local `puppeteer-core`, shared doctor browser candidates, and an ephemeral HTTP server bound to 127.0.0.1 serving the existing S06 page and modules. It waits for initialization and `drawFrame`, detects page, network and HTTP errors, and closes browser/server on success and failure. Scene drawing, physics, timeline (30 fps), and output dimensions (720×1280) are unchanged. No MP4 or audio generation is included.

Install the [MF-002 prerequisites](MF-002-readiness.md), then from repository root on Linux or Windows:

```sh
npm ci
npm run doctor
npm run render:smoke
npm run render -- --scene s06-60s --start 1179 --end 1179 --out-dir renders/event
```

The output range is inclusive, from 0 through 1800; defaults are 0–1799. Default output is `renders/s06-60s`, smoke output is `renders/smoke`; both are Git-ignored. Relative `--out-dir` is resolved against the working directory, and paths with spaces may be quoted. Existing target frame files cause failure: use a fresh directory; no files are overwritten or silently resumed. The old `s06-60s/frames` directory is refused. To use another browser set `MOTIONFORGE_BROWSER` to its executable: Linux `export MOTIONFORGE_BROWSER='/path/to/chromium'`, Windows PowerShell `$env:MOTIONFORGE_BROWSER = 'C:\Path With Spaces\chrome.exe'`. Otherwise Chromium, Chrome or Edge is searched using the doctor candidates and a version probe. Browser version identification does not certify Puppeteer compatibility.

Chrome sandboxing remains enabled by default. In an isolated, trusted container where the OS cannot support it, an explicit `--no-sandbox` renderer argument is available (e.g. append after `npm run render --`); disabling it reduces browser security. Do not use this option for untrusted content. SIGINT/SIGTERM request browser closure and normal resource cleanup; existing completed frames are retained.

## Evidence

[Commands, environment and exit codes](evidence/MF-003/run.txt), [PNG sizes, hashes and decoded extrema](evidence/MF-003/images.txt), [reproducibility and range observation](evidence/MF-003/reproducibility.txt). stdout and stderr for each command are beside the run record. Debian 13 x86_64, Node 24.22.1 and Chromium 156 were used; real Windows execution is **UNVERIFIED**. Simulated Windows path handling is covered by automated tests.

- `npm ci`, doctor, and all 17 automated tests passed; tests cover invalid scene/range, invalid browser, launch failure, missing page/asset handling, existing output and cleanup after failures. Existing physics 11/11 and shots 28/28 match baseline.
- Real separate browser sessions produced PNG frame 0 twice and frame 1179 twice; frames were decoded with Pillow, 720×1280 with non-uniform pixel channels, and inspected visually for nonblank output. No page or resource errors were reported. Owner visual approval has not been requested or claimed. Generated files are ignored and are not in Git.
- Frame 0 matched SHA-256 in these two sessions only. Frame 1179 differed between the two sessions; bubble randomness is a plausible cause from MF-001, not an established causal diagnosis. No general determinism claim follows.
- Linux clean-checkout validation: see `clean-checkout.txt` in the evidence directory for the final result.

## Limitations and handoff

Windows execution, browser versions other than the tested Chromium, full clips, MP4 and audio remain unverified. Licensed audio assets and filename mismatch remain unresolved. Legacy 12-second test/renderer remain broken as in MF-001. Randomness and sequential-versus-seek visual equivalence are outside this ticket. A browser process crash can leave completed frames; rerun in a new output directory. Chrome descendants may appear as defunct processes when the container's PID 1 does not reap them, although no live browser or server should remain after normal completion.

Recommend the next approved ticket address its roadmap scope; a future task should establish deterministic rendering and audio contracts with separate acceptance tests. Do not infer a production-ready video factory from this PNG smoke test.
