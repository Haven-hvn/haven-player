## Track Subscription Protocol

Goals:
- Ensure publications become active RTP sources (not just listed).
- Guarantee `OnTrack` after subscription; request keyframe on late-join.
- Handle muted/paused, simulcast layer selection, and timeouts.

Principles:
- Publication existence ≠ packet flow; rely on `OnTrack`/first RTP.
- Even with `auto_subscribe`, confirm `pub.subscribed==true`.
- Consider subscription complete only after first RTP packet observed.

Sequence:
1. Discover target participant and publications (audio/video).
2. For each desired publication: `set_subscribed(true)` if not already.
3. Wait for `OnTrack(track, receiver)` per pub (with `Tsubscribe`).
4. For video tracks: send RTCP PLI immediately; repeat if no keyframe.
5. If simulcast: set preferred spatial/temporal layers, then PLI.
6. Validate codec support; skip/diagnose unsupported codecs.

Timeouts & Retries:
- `Tsubscribe=5s` to observe `OnTrack` after subscribing.
- If expired: re-issue subscribe and log diagnostics.
- For video start: send PLI every 1s up to 5s until first keyframe.

Diagnostics:
- Log pub.sid, kind, subscribed flag, `OnTrack` timestamp, first RTP arrival.
- Record codec (`track.Codec().MimeType`) and SSRC.


