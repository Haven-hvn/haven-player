## Timing and Synchronization

### RTP Domains
- Video timestamp clock: 90 kHz
- Opus audio timestamp clock: 48 kHz

### Strategy
1. Derive per-track media time from RTP timestamps: \( t = (ts - ts0) / rate \).
2. Choose a common epoch per recording: `t0 = min(first_video_time, first_audio_time)`; set PTS to \( t - t0 \).
3. For late-join, do not attempt absolute wall-clock alignment; align relative to first received frames.
4. Use depacketizer/samplebuilder to handle reordering/jitter; use their durations for PTS increments.

### DTS/PTS
- For codecs without B-frames (VP8, AV1 in typical live), `DTS == PTS`.
- H.264 baseline/constrained baseline: assume no B-frames; still `DTS == PTS`. If B-frames present, use decoder reorder queue to compute DTS.

### Discontinuities
- Detect RTP timestamp jumps; if gap exceeds threshold, start a new segment (or insert encoder discontinuity) to keep muxers consistent.
- On audio-only or video-only gaps, stretch/silence-pad minimally or let muxer timestamp gaps stand.

### A/V Alignment
- Maintain running offsets: `offset = video_pts - audio_pts`; keep |offset| < 60 ms.
- If drift grows, prefer dropping late video frames or duplicating audio silence frames minimally.


