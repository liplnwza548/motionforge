#!/bin/bash
# build_60s.sh — ประกอบ S06 60 วิ v3 จากเฟรม + เสียง (รันหลัง render60.js เสร็จ)
# ขั้นตอน: 1) วิดีโอ silent จากเฟรม 2) มิกซ์เสียง (ถ้ายังไม่มีให้รัน build_audio_60s.sh ก่อน)
# 3) limiter -2 dB ที่ wav (กัน AAC overshoot) 4) mux เป็น s06_60s_v3.mp4
set -e
D="$(cd "$(dirname "$0")" && pwd)"
cd "$D"
[ -f work-audio/mix_final_60s.wav ] || { echo "MISSING work-audio/mix_final_60s.wav — run ./build_audio_60s.sh first"; exit 1; }
[ -f work-audio/mix_final_tp15.wav ] || { echo "MISSING work-audio/mix_final_tp15.wav — run ./build_audio_60s.sh first"; exit 1; }

ffmpeg -y -v error -framerate 30 -i frames/frame-%04d.png -c:v libx264 -pix_fmt yuv420p -crf 18 -r 30 work-video-silent.mp4
ffmpeg -y -v error -i work-audio/mix_final_tp15.wav -af "alimiter=limit=0.794:attack=5:release=50:level=false" work-audio/mix_final_limited.wav
ffmpeg -y -v error -i work-video-silent.mp4 -i work-audio/mix_final_limited.wav -c:v copy -c:a aac -b:a 192k -shortest s06_60s_v3.mp4
echo BUILD-DONE
ffprobe -v error -show_entries stream=codec_name,width,height,r_frame_rate,nb_frames,duration -show_entries format=duration,size -of default=noprint_wrappers=1 s06_60s_v3.mp4
ffmpeg -v info -i s06_60s_v3.mp4 -af loudnorm=I=-16:TP=-1.0:LRA=11:print_format=json -f null - 2> qc/loudness_final.txt || true
grep -E '"(input_i|input_tp|input_lra)"' qc/loudness_final.txt
