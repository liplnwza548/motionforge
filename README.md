# MotionForge

A frame-by-frame motion-graphics engine for vertical video (9:16).
Animation is **drawn with code** using HTML5 Canvas, headless Chromium and FFmpeg.
Deterministic and byte-identical rendering are goals that remain **unverified**;
see the [baseline audit](docs/MF-001-baseline.md).

> **Status: in active development.** The flagship demo is **S06 — a 60-second
> split-screen marine-kinematics short** (`s06-60s/`), currently at **Master v3**
> (720×1280, 30fps, 1,800 frames, 60.000s, −16.41 LUFS / TP −1.13).
> A 12-second version of the same scene lives in `s06-12s/`.

## What is in this repo

| Path | What it is |
|---|---|
| `s06-60s/` | S06 60s **Master v3** engine — physics, whale spine, Gerstner water, particles, camera, shots director, shell + pearl, renderer (`render60.js`), tests, build scripts. No frames, no video, no audio files (see below). |
| `s06-12s/` | S06 12s v3 engine — the earlier, shorter version of the same scene. |
| `benchmark/` | The 5-step model comparison that produced the formulas in the Prompt Vault: Spine, Gerstner waves, Particle Engine, Telemetry Linkage, Visual Polish — each implemented three times (Opus as teacher, Flash as student, Bean) with test scripts. |
| `skill/` | **MotionForge One-Prompt** skill (`SKILL.md`) — turn one topic prompt into a storyboard, build spec and QC checklist. |
| `docs/` | Full history: the benchmark report (`FLASH-VS-OPUS-BENCHMARK.md`), storyboards, build briefs, Gemini's blueprint / director notes / verdict, the physics audit of Gemini's blueprint, and the current status file (`STATUS-2026-11-09.md`). |

The Prompt Vault — the six reusable formulas (spine, Gerstner, particles,
telemetry, polish) with their known weaknesses and fixes — is documented in
`docs/FLASH-VS-OPUS-BENCHMARK.md` §3.

## Installation readiness

Run `npm ci` then `npm run doctor` to check dependencies; see [MF-002 readiness](docs/MF-002-readiness.md) for Windows and Linux instructions and known legacy renderer limitations. A successful doctor checks dependencies; it does **not** establish that MP4 production works.

## Legacy S06 60s commands (currently blocked)

The commands below document the original workflow. They are currently blocked on a fresh checkout by machine-specific dependencies, Chromium and temporary paths, and an obsolete HTTP URL. Installing dependencies or passing doctor does not fix those paths. Audio assembly has additional missing assets and filename mismatches. See [MF-001](docs/MF-001-baseline.md).

```bash
# 1. Smoke test — render a single frame (frame 0)
node s06-60s/render60.js --start 0 --end 0

# 2. Full render — 1,800 frames into s06-60s/frames/ (takes ~4–15 min)
node s06-60s/render60.js

# 3. Assemble the silent video, then mux with the audio mix
./s06-60s/build_60s.sh
```

Tests first (no browser needed for physics):

```bash
node s06-60s/test_physics_60s.js   # expect 11/11
node s06-60s/test_shots60.js       # expect 28/28
node s06-12s/test_breach.js        # currently fails before assertions: missing parent-relative file
```

The legacy renderer hardcodes its own temporary directory, so setting `TMPDIR`
alone does not resolve its machine-specific paths. Its historical timings and
output quality have not been independently reproduced in this checkout.

## Audio (not included)

Audio files are **not** in this repo — they are third-party, license by license.
`s06-60s/audio/SOURCES_60s.md` lists every cue, its source and its license:

- BGM + most SFX: **Mixkit Free License**
- Sonar ping: **SoundBible, CC-BY 3.0 — credit `Sound effects by Mike Koenig
  (SoundBible.com)`** if you publish
- Whale spout (A10): **Public Domain** (fws.gov field recording)

The intended workflow uses files listed in `SOURCES_60s.md` under `s06-60s/audio/`
and `./s06-60s/build_audio_60s.sh`; the audio input/output contract and missing
assets still block reproducing the complete build. Target loudness is
**−16 LUFS, true peak ≤ −1.0 dB**.

## Locked rules (do not change silently)

- **One gravity for the whole project: `g = 235.4`.** Whale, particles, waves
  and telemetry must all use the same value.
- **Draw organs in the spine's local frame**, never in world coordinates.
- **Post clips are full-screen render only** — no debug panels, telemetry
  numbers or debug text in the published frame.
- **Never overwrite an existing version.** v1/v2/v3 are kept side by side;
  a new version gets a new folder and a new file name.
- **A shot lasts 2–4 seconds; the image must keep moving** — nothing holds
  still for long.
- Verify against real frames: any claim about what a frame shows must be
  checked by extracting that frame from the rendered mp4 and looking at it.

## Current open items (2026-11-09)

The 60s Master v3 is delivered and awaiting the owner's final verdict on three
points — see `docs/STATUS-2026-11-09.md` for the full picture:

1. A pectoral-fin tip (~90 px) still peeks in at the top-right corner of shot 18
   — accept it, or lift the whale a further ~+200 px (one constant + re-render
   shot 18 only, ~5 min).
2. The A13 shell-close reverb tail is correct in the file but ~30 dB under the
   BGM in the mix — may be inaudible.
3. The BGM runs 1–4 dB quieter than v2 in some sections (loudnorm side effect).

## License

No license file is included yet — all rights reserved by default. Do not add
one without the owner's decision.
