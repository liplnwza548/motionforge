#!/bin/bash
# build_audio_60s.sh — มิกซ์เสียง S06 60 วิ v3 จากไฟล์ใน s06-60s-v3/audio/ + loudnorm -16 LUFS / TP -1.0
# (ก๊อปจาก v2 — เปลี่ยนเฉพาะ A05/A13 ตามบรีฟ v3 จุด 4; คิวเวลา/offset อื่นเหมือน v2 ทุกอย่าง)
# จุดเริ่มวาง = เวลาคิว − attack offset (วัดจริงทุกไฟล์โดยลูกมือเสียง ดู audio/SOURCES_60s.md)
#   A02/A03/A04 ping +0.42 | A06 chime +0.23 | A07 thrust +0.55 | A09 splash +0.38 / whoosh layer +1.08
#   A10 spout +0.33 (ไฟล์ใหม่ a10_spout_breath.wav เสียงพ่นวาฬจริง Public Domain; เวลารูจมูกพ้นผิว ~35.73 — พีคตก 35.73; เกน +8dB เพราะไฟล์เบา)
#   A11 splashdown +0.04 (หัวแตะน้ำ ~39.31) | A13 close +0.03 (ไฟล์ใหม่ v3 a13_shell_subthud_reverb.wav = subthud เดิม + หางรีเวิร์บใต้น้ำ decay ~0.3 วิ)
#   A05 stone +1.02 (ไฟล์ใหม่ v3 a05_shell_stone_gain.wav = shell_stone เดิม + เกน +4.5 dB + limiter กันคลิปที่ −1.2 dBFS; เริ่ม 17.20 พีคตก 18.22 กลางช่วงหอยเปิด)
#   A01 BGM 0.4x เฟดเข้า 1 วิ / ออก 58.5–60 | A03 ping +2dB | A08 rush +7dB | A07 ตัดใช้แค่ 0–1.30 วิ/ครั้ง
set -e
D="$(cd "$(dirname "$0")" && pwd)"
A="$D/audio"
W="$D/work-audio"; mkdir -p "$W"
SPOUT_CUE="${SPOUT_CUE:-35.73}"   # เวลารูจมูกพ้นผิวน้ำจริง (physics60.js คำนวณ: รูจมูกพ้น 35.578 + ดีเลย์หายใจออก 0.15 = 35.728; เทสต์ผ่าน 10/10)
cd "$D"

# แปลงเวลาคิวเป็นมิลลิวินาทีสำหรับ adelay
# A01 0 | A02 7580 | A03 11080 | A04 16580 | A05 17200 | A06 20270
# A07a 28950 A07b 30250 | A08 32000 | A09 splash 35620 whoosh 34920
# A10 = (SPOUT_CUE-0.33)*1000 | A11 39270 | A12 41000 | A13 55170
SPOUT_START_MS=$(python3 -c "print(int(round(($SPOUT_CUE-0.33)*1000)))")

ffmpeg -y -v error \
 -i "$A/a01_bgm_ambient.wav" \
 -i "$A/a02_ping.wav" -i "$A/a03_ping.wav" -i "$A/a04_ping.wav" \
 -i "$A/a05_shell_stone_gain.wav" -i "$A/a06_pearl_chime.wav" \
 -i "$A/a07_tail_thrust.wav" -i "$A/a07_tail_thrust.wav" \
 -i "$A/a08_water_rush.wav" \
 -i "$A/a09_breach_heavy.wav" -i "$A/a09_breach_whoosh_layer.wav" \
 -i "$A/a10_spout_breath.wav" -i "$A/a11_splashdown.wav" \
 -i "$A/a12_bubbles_fizzle.wav" -i "$A/a13_shell_subthud_reverb.wav" \
 -filter_complex "\
[0:a]atrim=0:60,afade=t=in:st=0:d=1,afade=t=out:st=58.5:d=1.5,volume=0.4[bgm];\
[1:a]adelay=7580|7580,volume=1.0[p1];\
[2:a]adelay=11080|11080,volume=1.26[p2];\
[3:a]adelay=16580|16580,volume=1.0[p3];\
[4:a]adelay=17200|17200,volume=1.0[cr];\
[5:a]adelay=20270|20270,volume=1.0[ch];\
[6:a]atrim=0:1.3,adelay=28950|28950,volume=1.0[t1];\
[7:a]atrim=0:1.3,adelay=30250|30250,volume=1.0[t2];\
[8:a]adelay=32000|32000,volume=2.24[ru];\
[9:a]adelay=35620|35620,volume=1.0[br];\
[10:a]adelay=34920|34920,volume=0.9[bw];\
[11:a]adelay=${SPOUT_START_MS}|${SPOUT_START_MS},volume=2.51[sp];\
[12:a]adelay=39270|39270,volume=1.0[sd];\
[13:a]adelay=41000|41000,volume=1.0[bu];\
[14:a]adelay=55170|55170,volume=1.0[cl];\
[bgm][p1][p2][p3][cr][ch][t1][t2][ru][br][bw][sp][sd][bu][cl]amix=inputs=15:normalize=0,atrim=0:60[aout]" \
 -map "[aout]" -ar 48000 -ac 2 "$W/mix_raw_60s.wav"

# loudnorm 2-pass เป้า -16 LUFS / TP -1.0 / LRA 11
ffmpeg -v info -i "$W/mix_raw_60s.wav" -af loudnorm=I=-16:TP=-1.0:LRA=11:print_format=json -f null - 2> "$W/ln_pass1.txt" || true
python3 - "$W/ln_pass1.txt" "$W/mix_raw_60s.wav" "$W/mix_norm_60s.wav" <<'EOF'
import json, subprocess, sys
log = open(sys.argv[1]).read()
j = json.loads(log[log.index('{'):log.rindex('}')+1])
cmd = ['ffmpeg','-y','-v','error','-i',sys.argv[2],'-af',
 'loudnorm=I=-16:TP=-1.0:LRA=11:measured_I=%s:measured_TP=%s:measured_LRA=%s:measured_thresh=%s:offset=%s:linear=true' % (
  j['input_i'], j['input_tp'], j['input_lra'], j['input_thresh'], j['target_offset']),
 '-ar','48000','-ac','2', sys.argv[3]]
print('pass1:', {k: j[k] for k in ('input_i','input_tp','input_lra','input_thresh','target_offset')})
subprocess.run(cmd, check=True)
EOF

ffmpeg -v info -i "$W/mix_norm_60s.wav" -af loudnorm=I=-16:TP=-1.0:LRA=11:print_format=json -f null - 2> "$W/ln_final.txt" || true
echo "AUDIO-MIX-DONE (spout cue used: $SPOUT_CUE s, file start ${SPOUT_START_MS} ms)"
ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1 "$W/mix_norm_60s.wav"
