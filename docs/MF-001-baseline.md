# MF-001 — Baseline audit

ตรวจวันที่ 2026-11-09; repository `liplnwza548/motionforge`; default branch `main`; `git ls-remote --symref origin HEAD refs/heads/main` ยืนยัน SHA `5b1407c7cfca24f27060f87a5b80219ec2d3c1ff` ตรง expected baseline และ local HEAD ก่อนสร้าง branch. Git status สะอาดก่อนเริ่ม; branch `codex/mf-001-baseline` สร้างจาก commit ดังกล่าว

## สภาพแวดล้อมและผลจริง

Linux x86_64 kernel 6.18.57, Node 24.22.1, Python 3.12.14, Chromium 156.0.8078.79, FFmpeg 7.1.5. ไม่มี Windows สำหรับทดสอบ. คำสั่งรันจาก repository root:

| คำสั่ง | ผล | exit | หลักฐานและสาเหตุ |
|---|---|---:|---|
| `node s06-60s/test_physics_60s.js` | PASS | 0 | 11 passed, 0 failed |
| `node s06-60s/test_shots60.js` | PASS | 0 | 28 passed, 0 failed |
| `node s06-12s/test_breach.js` | FAIL ก่อนเริ่ม assertions | 1 | ENOENT `/workspace/motionforge/spine_bean.js`; test มองที่ parent แต่ไฟล์อยู่ `benchmark/spine_bean.js` |
| `node s06-60s/render60.js --start 0 --end 0` | FAIL | 1 | Cannot find module `/home/hatch/workspace/mascot-test/node_modules/puppeteer-core` |

ชุด 12 วินาทีไม่ได้รัน assertions จึงนับจำนวน pass ไม่ได้ ไม่ใช่ 92 ผ่าน. ผลทั้งหมดเกิดจากการรันจริง ไม่ใช่การอ้าง README.

## Architecture และ pipeline

S06 60s ใช้ physics60, shots60, whale60, water60, particles60, camera60, shell60 และ draw60; index.html โหลด physics และ loader60 แยก scope ของโมดูล ก่อนเรียก drawFrame. render60 ใช้ Puppeteer/Chromium ผ่าน Python HTTP server, screenshot PNG ที่ 720×1280 30fps แล้ว FFmpeg ประกอบ H.264 และเสียง. build_audio ใช้ input WAV, amix และ loudnorm; build_60s ประกอบวิดีโอและ mux. S06 12s และ benchmark แยกโฟลเดอร์; skill/SKILL.md เป็นคำแนะนำ storyboard และ QC สำหรับ agent ไม่ใช่ installer อัตโนมัติ.

## Confirmed issues

1. **สูง — renderer ไม่ portable:** `s06-60s/render60.js:15,40,66,74,96` hardcode Puppeteer, Chromium, temp และ URL `/s06-60s-v3/index.html` ซึ่งไม่ตรง `s06-60s/index.html`. `s06-12s/render.js:9,18,21,29` มีพาธเดิมและ URL `/s06-full-v3/` เช่นกัน. ผลรันต้นฉบับข้างต้นยืนยัน blocker แรก; URL ที่เหลือยืนยันจากโค้ด ไม่ใช่ผล runtime.
2. **สูง — build เสียงไม่ต่อกัน:** `s06-60s/build_audio_60s.sh:53-67` สร้าง `mix_norm_60s.wav` แต่ `build_60s.sh:8-12` ต้องการทั้ง `mix_final_60s.wav` และ `mix_final_tp15.wav`. ไม่พบการสร้างสองชื่อนี้ใน script เสียง. ไฟล์เสียงที่มีลิขสิทธิ์ไม่ได้อยู่ใน repo จึงยังไม่ทดสอบมิกซ์จริง; ดู `audio/SOURCES_60s.md`.
3. **สูง — test และหน้า 12s อ้างตำแหน่งผิด:** `test_breach.js:12-17` โหลด spine และ telemetry จาก parent; `index.html` อ้างไฟล์เหล่านี้และ polish จาก parent แต่ไฟล์อยู่ benchmark. test ล้มจริงตามตาราง.
4. **กลาง — dependency management:** ไม่มี package.json หรือ lockfile ใน checkout; renderer ใช้ absolute require, ไม่มีคำสั่งติดตั้ง Puppeteer แบบ reproducible ใน repo. สคริปต์ build ใช้ Bash และ Python, FFmpeg, Chromium ซึ่งไม่ได้จัดเตรียมด้วย installer ของ repo.
5. **กลาง — deterministic ยังไม่รับประกัน:** `particles60.js:128` ใช้ Math.random เมื่อไม่มี RNG; `draw60.js:115-125` เรียก bubble emit โดยไม่ส่ง RNG. `draw60.js:97-135` replay particles และ `draw60.js:447-459` เก็บสถานะ whale และ reset เมื่อข้ามเฟรม; comment ระบุ warm-up ต่างกันระหว่างลำดับต่อเนื่องกับ seek. จึงไม่อาจยืนยันคำอ้าง README ว่าแต่ละเฟรมเป็น pure function ของเวลา หรือ byte-for-byte reproducible. ยังไม่ได้เปรียบเทียบภาพ/hash แบบควบคุม.
6. **กลาง — engine ผูกกับเรื่อง S06:** shots, physics, assets และเวลาเฉพาะวาฬ/หอย; skill ให้แนวทางแต่ยังไม่พิสูจน์การสร้างหัวข้อใหม่แบบติดตั้งแล้วใช้งานอัตโนมัติ.

## Portability และข้อจำกัด

- **Verified:** Git remote read สำเร็จ; tests 60s รันได้บน Linux เครื่องนี้; renderer ต้นฉบับล้มตามข้างต้น. Chromium, FFmpeg และ Node มีอยู่แล้ว ไม่ได้พิสูจน์ติดตั้งเครื่องใหม่.
- **Unverified:** Windows, fresh Linux clone end-to-end, local agent ติดตั้งและผลิตวิดีโอได้จริง, non-admin install ของ dependencies ทุกตัว, rendering ซ้ำ byte-identical และภาพจาก sequential เทียบกับ seek. Bash scripts เป็นช่องว่าง Windows แต่ไม่ได้ทดสอบ Windows.
- **Blocked:** full audio/mux ต้องใช้ licensed audio ที่ไม่รวมใน repo และแก้ความไม่ตรงของชื่อไฟล์; ไม่ได้ render คลิปเต็มหรือ claim QC ภาพ/เสียง.

ใน cloud onboarding ก่อน audit มีการใช้ adapter ภายนอก checkout ปรับพาธในหน่วยความจำและสร้าง PNG เฟรม 0, 1080, 1650 ภายใต้ ignored `s06-60s/frames/`; นี่ไม่ใช่การพิสูจน์ renderer ต้นฉบับหรือคลิปเต็ม และไฟล์ ignored ไม่ได้รวมใน commit. ไม่ได้ตรวจภาพเหล่านั้นด้วยตา.

## ข้อเสนอสำหรับ ticket ถัดไป

เสนอ MF-002 สำรวจและออกแบบ dependency manifest/lockfile, ค่าพาธและ browser ที่กำหนดได้สำหรับ Windows/Linux พร้อม smoke test ในเครื่องใหม่; จัดลำดับ audio contract และ determinism เป็นงานที่ต้องมี acceptance tests แยก. ไม่เริ่ม implementation หรือเปลี่ยน physics ใน MF-001.

## เกณฑ์รับงาน

ตรวจ baseline, tests, pipeline, portability และจัดทำ audit แล้ว; test 12s กับ renderer พบปัญหาจริง ไม่ใช่หลักฐานว่าผ่าน. การปิด MF-001 ยังต้องมี commit, push และ PR ให้ owner review; ไม่ merge main. ผล GitHub ต้องตรวจจากสถานะ PR จริง.
