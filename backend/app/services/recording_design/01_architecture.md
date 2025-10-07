## Recording System Architecture

```
[ LiveKit Room ] → [ Connection Manager ] → [ Track Discovery ] →
[ Subscription Manager ] → [ Frame Buffer ] → [ Encoder Queue ] → [ File Writer ]
```

- **Connection Manager**: Establishes signaling, ICE, DTLS. Tracks `PeerConnectionState`, `ICEConnectionState`.
- **Track Discovery**: Watches SDP/publications; correlates publications to `TrackRemote` via `OnTrack`.
- **Subscription Manager**: Ensures `subscribed=True` and `OnTrack` fired; issues RTCP PLI/FIR; selects simulcast layers.
- **Frame Buffer**: RTP depacketization and frame/sample assembly (e.g., Pion `samplebuilder`). Jitter handling.
- **Encoder Queue**: Bounded queues per track, backpressure policy, drop strategy, worker threads to encoders (FFmpeg/PyAV).
- **File Writer**: Muxer (MP4/WebM) with A/V sync, proper timestamps, clean finalization and moov writing.

### Design Goals
- Reliable late-join capture with immediate keyframe request.
- A/V sync using RTP timestamps and common epoch alignment.
- Bounded memory via queues; graceful degradation on backpressure.
- Clear diagnostics per lifecycle stage.


