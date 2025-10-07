## Frame Reception Design

Pattern: async producer/consumer with bounded queues per track.

### Sources
- Video: `VideoStream(track)` or direct RTP via `TrackRemote.ReadRTP()` + depacketizer.
- Audio: `AudioStream(track)` or direct RTP + Opus depacketization.

### Recommended
- High-level iterators for simplicity; fall back to direct RTP + `samplebuilder` for precise control.

### Backpressure
- Per-track ring buffer (size 100–300). Policy: drop oldest on overflow.
- Separate encoder workers; avoid blocking producers.

### Reliability
- Set read deadlines (track-level) to detect stalls and trigger PLI for video.
- On first subscription, send immediate PLI; repeat until first keyframe.
- Monitor RTCP (RR, NACK) to infer downstream health; resend as needed.

### Errors
- On iterator exceptions/timeouts: attempt recovery (PLI, resubscribe); if persistent, escalate.
- On FFI pressure (Go→Python): batch frame transfers or use zero-copy buffers when possible.


