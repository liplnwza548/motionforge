#!/bin/bash
# build_s06v3.sh — ประกอบ S06 v3: วิดีโอจากเฟรม + มิกซ์เสียงใหม่ (splash 8.905 วิ) + loudnorm -16 LUFS / TP -1.0
# สูตรเสียง = preview_mix_12s.wav ทุกประการ ยกเว้นคิวที่ขยับตามฟิสิกส์ v3:
#   splash ย้าย 9.73 -> 8.905 (หัวแตะน้ำ v3 ที่ tHeadDownCross=8.905 — พีคของไฟล์ splash
#     อยู่ +0.40 วิหลังจุดเริ่ม (≈9.31 วิ) เพราะ attack offset; ถ้าฟิลิปสั่งให้พีคตรงภาพ
#     ต้องเลื่อนจุดเริ่มเป็น 8.505 — ดูสตอรี่บอร์ด v3 §คิวเสียง)
#   hiss ย้าย 8.35-10.85 -> 7.86-10.36 (Apex v3 ที่ 7.855)
#   BGM 01 (ลด 0.4x + เฟดแล้ว) 1.0 | ambience_02 ลูป 0.5 เฟดหัว 0.5/ท้าย 1 วิ | ambience_01 ฟอง 0.50-6.35 ที่ 0.6
#   ping 01 x3 ที่ 1.50/2.27/3.00 ที่ 0.9 (วง ping 2 ชนหอยที่ hit≈1.96 วิ) | whoosh 01 ที่ 6.03 ที่ 1.0 | splash 01 ที่ 8.905 ที่ 1.0
# หมายเหตุ: สคริปต์นี้ยังไม่ได้รันในรอบโค้ด+เทสต์ — สายเรนเดอร์จะรันตอนเรนเดอร์เฟรม 360 เฟรมครบ
set -e
D="$(cd "$(dirname "$0")" && pwd)"
A="$D/../s06-full/audio-v2"
W="$D/work-audio"; mkdir -p "$W"
cd "$D"

# 1) วิดีโอ silent จากเฟรม
ffmpeg -y -v error -framerate 30 -i frames/frame-%04d.png -c:v libx264 -pix_fmt yuv420p -crf 18 -r 30 work-video-silent.mp4

# 2) มิกซ์ดิบจาก stems
ffmpeg -y -v error \
 -i "$A/bgm_ambient_01.wav" \
 -stream_loop 1 -i "$A/sfx_ambience_02.wav" \
 -i "$A/sfx_ambience_01.wav" \
 -i "$A/sfx_ping_01.wav" -i "$A/sfx_ping_01.wav" -i "$A/sfx_ping_01.wav" \
 -i "$A/sfx_whoosh_01.wav" -i "$A/sfx_hiss_01.wav" -i "$A/sfx_splash_01.wav" \
 -filter_complex "\
[1:a]atrim=0:12,afade=t=in:st=0:d=0.5,afade=t=out:st=11:d=1,volume=0.5[amb2];\
[2:a]adelay=500|500,volume=0.6[amb1];\
[3:a]adelay=1500|1500,volume=0.9[p1];\
[4:a]adelay=2270|2270,volume=0.9[p2];\
[5:a]adelay=3000|3000,volume=0.9[p3];\
[6:a]adelay=6030|6030,volume=1.0[wh];\
[7:a]adelay=7860|7860,afade=t=in:st=7.86:d=0.3,afade=t=out:st=9.86:d=0.5,volume=0.8[hi];\
[8:a]adelay=8905|8905,volume=1.0[sp];\
[0:a][amb2][amb1][p1][p2][p3][wh][hi][sp]amix=inputs=9:normalize=0,atrim=0:12[aout]" \
 -map "[aout]" -ar 48000 -ac 2 "$W/mix_raw_v3.wav"

# 3) loudnorm 2-pass เป้า -16 LUFS / TP -1.0 / LRA 11
ffmpeg -v info -i "$W/mix_raw_v3.wav" -af loudnorm=I=-16:TP=-1.0:LRA=11:print_format=json -f null - 2> "$W/ln_pass1.txt" || true
python3 - "$W/ln_pass1.txt" "$W/mix_raw_v3.wav" "$W/mix_norm_v3.wav" <<'EOF'
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

# 4) วัดมิกซ์สุดท้าย + mux เข้าวิดีโอ
ffmpeg -v info -i "$W/mix_norm_v3.wav" -af loudnorm=I=-16:TP=-1.0:LRA=11:print_format=json -f null - 2> "$W/ln_final.txt" || true
ffmpeg -y -v error -i work-video-silent.mp4 -i "$W/mix_norm_v3.wav" -c:v copy -c:a aac -b:a 192k -shortest s06_full_v3_12s.mp4
echo BUILD-DONE
ffprobe -v error -show_entries stream=codec_name,width,height,r_frame_rate,nb_frames,duration -show_entries format=duration -of default=noprint_wrappers=1 s06_full_v3_12s.mp4
