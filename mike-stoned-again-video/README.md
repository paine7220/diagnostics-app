# Mike Paine — Stoned Again 2

**New project** (standalone — not Kathy health, not the vehicle diagnostics app).

Recovered from the ChatGPT share that hit a usage limit mid-handoff:

https://chatgpt.com/share/6ab6d018-951c-83ea-9c6f-64e395165ead

## Status

ChatGPT reported a finished master (`Mike_Paine_Stoned_Again_2_Official_Video.mp4`, **3:12.60**, 1080p, full stereo) but did not leave a downloadable MP4/MP3 on the public share.

This repo continues the work by:

1. Saving the **11 cinematic scene stills** that were visible on the share
2. Ordering them to the lyric story ChatGPT used
3. Building a **16:9 Ken Burns cut** with `ffmpeg`
4. Leaving a drop-in slot for the real track: `audio/Mike_Paine_Stoned_Again_2.mp3`

## Story order (from ChatGPT)

1. Opening — Mike + black pickup at dusk  
2. Cabin driveway start  
3–4. Gas station / three-way detour  
5–6. Closed hemp shop (comedy of the errand, no use shown)  
7. McDonald’s drive-thru **for the kids**  
8. Phone + tangled map detour (Happy Meals on the seat)  
9. Basement studio — making the song  
10. Stage chorus  
11. Night bag handoff / coming home beat  

Still missing from the share previews (were in ChatGPT’s claimed master):

- Sara Paine “goddess” cover still  
- Sara-with-the-paddle homecoming ending  

Drop those into `scenes/` as `00_cover_sara_goddess.png` and `12_homecoming_paddle.png` if you have them, then re-run the build.

## Build

```bash
# Optional: place the real song here (≈192.56s)
# audio/Mike_Paine_Stoned_Again_2.mp3

./scripts/build_video.sh
```

Outputs:

- `build/Mike_Paine_Stoned_Again_2_Cursor_Cut.mp4` — 1920×1080 story cut  
- Uses the MP3 when present; otherwise a silent bed so length stays ~3:12  

## Source

- Share title: “Still there check”  
- User ask: *Make a video like the others… Sara Paine goddess cover, then me; McDonald’s for the kids*  
- ChatGPT last note before usage limit: master QA passed; handoff blocked
