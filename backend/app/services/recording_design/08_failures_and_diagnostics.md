## Failure Modes and Mitigations

### Participant leaves
- Action: stop or downgrade policy; finalize file.

### Network interruption
- Tolerate `Disconnected` up to `Tice_grace`; on `Failed`, stop with flush.

### Codec unsupported
- Skip track, continue others; log codec and publication sid.

### No keyframe on late-join
- Send periodic PLI (1s interval, 5 tries); if still none, stop with reason.

### Encoder backpressure
- Drop oldest frames in ring; surface metric; avoid unbounded growth.

## Diagnostic Checklist

- Connection
  - room.connected == true
  - ICE ∈ {Connected, Completed}
  - DTLS == Connected

- Tracks
  - publications discovered > 0
  - subscribed == true
  - OnTrack fired per required pub
  - first RTP observed (timestamp, ssrc, payload type)

- Media
  - first video keyframe time
  - samplebuilder pops > 0
  - encoder queue size bounded

- Output
  - bytes written > 0
  - muxer finalized == true


