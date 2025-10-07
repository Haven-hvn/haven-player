## Lifecycle Management

### Start Sequence (gated)
1. Connect: wait for `PeerConnectionState=Connected` and ICE ∈ {Connected, Completed}.
2. Subscribe: wait for required pubs `subscribed=true` and `OnTrack` per track.
3. Media ready: wait for first sample per required track; for video, PLI retry loop.
4. Start encoders and muxer; begin processing.

### Running
- Monitor connection states; tolerate `Disconnected` up to `Tice_grace`.
- Watch for `track ended`/`participant left`; policy: continue with remaining tracks or stop.
- Periodic RTCP (PLI/FIR/REMB/TWCC) management.

### Stop Sequence
1. Signal stop: cease new frame intake, let queues drain.
2. Flush sample builders; stop encoder workers.
3. Finalize muxer/container; ensure indices/moov written.
4. Close RTCP/PeerConnection; free buffers.

### Failure Handling
- Mid-recording failures trigger graceful stop with `Tflush` budget; if exceeded, force close but keep container valid where possible.
- On reconnection policies, optionally attempt ICE restart via SDK; if unsupported, stop.


