#!/usr/bin/env bash
# Build a 1080p Ken Burns story cut from recovered ChatGPT stills.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SCENES="$ROOT/scenes"
OUT_DIR="$ROOT/build"
AUDIO="$ROOT/audio/Mike_Paine_Stoned_Again_2.mp3"
OUT="$OUT_DIR/Mike_Paine_Stoned_Again_2_Cursor_Cut.mp4"
WORKDIR="$OUT_DIR/work"
DURATION="${DURATION:-192.56}"
FPS=30
W=1920
H=1080

mkdir -p "$OUT_DIR" "$WORKDIR"
rm -rf "$WORKDIR"/*
mapfile -t IMAGES < <(ls -1 "$SCENES"/*.png | sort)
N=${#IMAGES[@]}
if (( N < 1 )); then
  echo "No scenes in $SCENES" >&2
  exit 1
fi

read -r SLICE FRAMES <<< "$(python3 - <<PY
d=float("$DURATION"); n=int("$N"); fps=int("$FPS")
slice=d/n
frames=max(1, int(round(slice*fps)))
print(f"{slice:.6f} {frames}")
PY
)"
echo "Building $N scenes × ${FRAMES} frames (~${SLICE}s) → ${DURATION}s @ ${W}x${H}"

clips=()
i=0
for img in "${IMAGES[@]}"; do
  i=$((i+1))
  if (( i % 2 == 1 )); then
    zexpr="min(1.12,1+0.12*on/${FRAMES})"
  else
    zexpr="max(1.0,1.12-0.12*on/${FRAMES})"
  fi
  clip="$WORKDIR/clip_$(printf '%02d' "$i").mp4"
  ffmpeg -y -hide_banner -loglevel error \
    -loop 1 -i "$img" \
    -vf "scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},zoompan=z='${zexpr}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${FRAMES}:s=${W}x${H}:fps=${FPS},format=yuv420p" \
    -frames:v "$FRAMES" -r "$FPS" -an "$clip"
  clips+=("$clip")
done

list="$WORKDIR/concat.txt"
: > "$list"
for c in "${clips[@]}"; do
  printf "file '%s'\n" "$c" >> "$list"
done

video_only="$WORKDIR/video_only.mp4"
ffmpeg -y -hide_banner -loglevel error -f concat -safe 0 -i "$list" -c copy "$video_only"

trimmed="$WORKDIR/trimmed.mp4"
ffmpeg -y -hide_banner -loglevel error -i "$video_only" -t "$DURATION" \
  -c:v libx264 -preset veryfast -crf 18 -pix_fmt yuv420p "$trimmed"

if [[ -f "$AUDIO" ]]; then
  echo "Muxing real audio: $AUDIO"
  ffmpeg -y -hide_banner -loglevel error \
    -i "$trimmed" -i "$AUDIO" \
    -map 0:v:0 -map 1:a:0 \
    -c:v copy -c:a aac -b:a 192k \
    -shortest -movflags +faststart \
    "$OUT"
else
  echo "No audio file yet — silent 3:12 preview (add audio/Mike_Paine_Stoned_Again_2.mp3 and rebuild)"
  ffmpeg -y -hide_banner -loglevel error \
    -i "$trimmed" -f lavfi -i anullsrc=r=44100:cl=stereo \
    -map 0:v:0 -map 1:a:0 \
    -c:v copy -c:a aac -b:a 192k \
    -t "$DURATION" -movflags +faststart \
    "$OUT"
fi

ffprobe -v error -show_entries format=duration -show_entries stream=width,height,codec_type -of compact=p=0 "$OUT"
ls -lh "$OUT"
echo "Wrote $OUT"
