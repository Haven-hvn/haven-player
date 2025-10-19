### Haven Player backend: research brief to fix video packets not being written (aiortc/PyAV path)

This brief compiles the most relevant logs and code excerpts to help a research agent think deeply about the WebRTC/RTC pipeline and propose a concrete plan to implement a robust, working recording backend for Haven Player. The frame processing pipeline is correct by assumption; the issue is that encoded packets are not being produced/written even though frames are received and a file is created (~48KB) but never grows.

### What to deliver
- A short diagnosis of why no packets are produced with the current aiortc/PyAV approach.
- A step-by-step plan (with alternatives) to implement a reliable recording path that produces valid media (MP4/MPEG-TS/WebM), integrates correctly with LiveKit and Pion, and survives dynamic resolution changes, muted audio, and clock/PTS drift.
- A concrete API/flow diagram showing where to attach to LiveKit/Pion, how to extract frames with correct timing, how to set encoder `time_base`/PTS/DTS, and when to flush/rotate files.
- Risks, test plan, and instrumentation to validate correctness in CI.

### Recent run logs (symptom)
```
uvicorn app.main:app --reload
... StreamManager initialized ... Track subscribed: 1 ... Track subscribed: 2 ...
... POST /api/live-sessions/start 200 ...
[mint] [TELEMETRY] Frame 1 → NO PACKETS (PTS=0, last_pts=0)
[mint] No packets generated from frame 0 (streak: 1)
[mint] [TELEMETRY] Frame 2 → NO PACKETS (PTS=1, last_pts=1)
...
[mint] ❌ CRITICAL: 10 consecutive frames produced no packets!
[mint] Last PTS: 4608, time_base: 1/15360
[mint] Frame: 1920x1080, format: yuv420p
[mint] Encoder: libx264, Container: mp4
...
[mint] ❌ Memory usage too high: 1017.3MB - stopping recording
... POST /api/recording/start 200 ... GET /api/recording/status ... 200
```

Key observation: frames are received, container/stream created, PTS computed, but `video_stream.encode(frame)` yields zero packets repeatedly, then memory grows due to retained frames/buffers.

### Architectural context
- We subscribe to a LiveKit room, pick the streamer participant, and acquire `RemoteVideoTrack`/`RemoteAudioTrack`.
- Frames are pulled via `rtc.VideoStream(self.video_track)` / `rtc.AudioStream(self.audio_track)`.
- We normalize video frames to PyAV `yuv420p` and set `pts/time_base` before encoding.
- Container/streams are configured dynamically; for MP4 we use H.264/AAC; for MPEG-TS also allowed.

### Key code excerpts

Container and stream setup (explicit time_bases and codecs):
```python
# backend/app/services/webrtc_recording_service.py (excerpt)
self.container = av.open(str(self.output_path), mode='w', format=output_format)
self.video_stream = self.container.add_stream(self.config['video_codec'], rate=self.config['fps'])
self.video_stream.width = self.config['width']
self.video_stream.height = self.config['height']
self.video_stream.pix_fmt = 'yuv420p'
self.video_stream.time_base = Fraction(1, self.config['fps'])

self.audio_stream = self.container.add_stream(self.config['audio_codec'], rate=48000)
self.audio_stream.codec_context.sample_rate = 48000
# layout set to stereo; format left native to AAC (fltp)
self.audio_stream.time_base = Fraction(1, 48000)
```

PTS calculation and encode/mux loop (telemetry shows zero packets):
```python
# backend/app/services/webrtc_recording_service.py (excerpt)
tb = self.video_stream.time_base
if hasattr(frame, 'timestamp_us') and frame.timestamp_us is not None:
    if self.first_video_timestamp_us is None:
        self.first_video_timestamp_us = frame.timestamp_us
    delta_us = max(0, frame.timestamp_us - self.first_video_timestamp_us)
    pts = int((delta_us / 1_000_000) * tb.denominator)
else:
    pts = self.video_frames_written * (tb.denominator // self.config['fps'])
av_frame.pts = pts
av_frame.time_base = tb

packets = self.video_stream.encode(av_frame)
for packet in packets:
    self.container.mux(packet)
# telemetry: often 0 packets per frame, streak increases → CRITICAL
```

LiveKit room connection and track subscription:
```python
# backend/app/services/stream_manager.py (excerpt)
room = rtc.Room()
await self._setup_room_handlers(room)
await room.connect(livekit_url, token, rtc.RoomOptions(auto_subscribe=True))
...
@room.on("track_subscribed")
def on_track_subscribed(track, publication, participant):
    print(f"Track subscribed: {track.kind} from {participant.sid}")
    # Recording relies on direct track reference; frame streaming is optional
```

Reference: LiveKit server Room (Go) subscribes and manages tracks; participant activation and autosubscribe behavior:
```go
// livekit/pkg/rtc/room.go (excerpt)
func (r *Room) Join(participant types.LocalParticipant, ...) error {
    participant.OnTrackPublished(r.onTrackPublished)
    ...
}
func (r *Room) onTrackPublished(participant types.LocalParticipant, track types.MediaTrack) {
    // subscribe existing participants to new track
    existingParticipant.SubscribeToTrack(track.ID(), false)
}
```

### Constraints and known-good assumptions
- Frame extraction and normalization are assumed correct. The primary bug is likely in RTC timing/PTS, encoder configuration, or stream/container semantics when sourcing from LiveKit/Pion.
- Codecs/containers must be compatible: for MP4, H.264/AAC; for WebM, VP9/Opus; for MPEG-TS, H.264/AAC.
- We must support dynamic resolution, muted audio, and handle long-gaps/backpressure.

### What to research and design
- RTC pipeline timing:
  - How LiveKit Python SDK exposes frame timestamps: `VideoStream` event `frame.timestamp_us` semantics (origin, monotonicity) and relation to RTP timestamp and `time_base` needed by encoders.
  - The correct mapping from RTP/monotonic time to encoder PTS/DTS for PyAV/FFmpeg encoders (x264) to avoid zero-packet outputs. Validate if `av_frame.time_base` must match `video_stream.codec_context.time_base` or container time base, and whether we must set `video_stream.codec_context.framerate`/`time_base` vs stream-level `time_base`.
  - Whether `self.video_stream.encode()` requires consecutive frames up to reordering window before output, and if we must flush periodically to avoid long GOP causing no packets early on.

- Encoder configuration correctness:
  - For `libx264` in MP4, ensure we set `time_base`, `framerate`, `gop_size`, `profile`, and pixel format; confirm if x264 expects `time_base` as 1/framerate or if setting `codec_context.time_base` and `stream.time_base` both is needed.
  - For audio AAC: resampling s16→fltp and ensuring `layout`, `sample_rate`, and `time_base` match; confirm that audio encoding produces packets even when video does not, and how MP4 muxer behaves when one stream has no packets.

- Container semantics:
  - MP4 vs MPEG-TS for live recording: MP4 typically buffers until moov; consider `movflags +frag_keyframe+empty_moov+default_base_moof`-style options when applicable via PyAV to force progressive writes. Alternatively, use MPEG-TS during capture and post-process to MP4.
  - Investigate if PyAV requires `container.start_time`/`container.write_header` options or `stream.options` (e.g., `tune`, `preset`, `movflags`, `crf`, `g`) to yield packets per frame.

- LiveKit/Pion interplay:
  - Validate that the LiveKit Python SDK’s `VideoStream` returns frames in decode order and with stable timestamps; confirm any need to convert from RTP timestamp units to microseconds.
  - Confirm that auto-subscribe ensures we receive full-resolution frames and not simulcast layers with low frame cadence unless selected; if simulcast/SVC is active, select a layer.

- Robustness features:
  - Dynamic resolution handling: when source dims change, whether PyAV requires closing/recreating the video stream or if `reformat` is sufficient; design a rotation strategy.
  - Memory control: ensure frames/packets are released; consider bounded queues and backpressure; instrument RSS and object counts.

### Proposed deliverables in the plan
- Minimal reproducible encode loop that produces packets from synthetic frames with the same `time_base`/PTS logic; expand to LiveKit frames.
- Specific PyAV encoder/stream settings to guarantee packet output per frame or per GOP; include options set via `container.add_stream(..., options={...})` if needed.
- Strategy matrix:
  - A) Keep PyAV direct encoding; fix PTS/encoder options; use MPEG-TS for robustness.
  - B) Use FFmpeg subprocess with `-use_wallclock_as_timestamps 1` and proper `-r`/`-vsync` to sidestep PyAV PTS handling.
  - C) Use LiveKit Egress or Server-SDK side egress as a baseline.

### Pointers to source modules
- backend/app/services/webrtc_recording_service.py
- backend/app/services/stream_manager.py
- backend/app/services/live_session_service.py
- livekit/pkg/rtc/room.go (server reference)
- webrtc/ (pion/webrtc v4 code, RTP/RTCP and timing semantics)

### Additional code references (LiveKit and Pion/webrtc)

Pion webrtc: inbound RTP entry points (how frames are delivered to receivers)
```116:158:/Users/david/Documents/GitHub/haven-player/webrtc/track_remote.go
func (t *TrackRemote) Read(b []byte) (n int, attributes interceptor.Attributes, err error) {
    t.mu.RLock()
    receiver := t.receiver
    peeked := t.peeked != nil
    t.mu.RUnlock()

    if peeked {
        t.mu.Lock()
        data := t.peeked
        attributes = t.peekedAttributes

        t.peeked = nil
        t.peekedAttributes = nil
        t.mu.Unlock()
        // ...
    }

    // If there's no separate RTX track, wait for and return a packet from the main track
    n, attributes, err = receiver.readRTP(b, t)
    if err != nil {
        return n, attributes, err
    }

    err = t.checkAndUpdateTrack(b)

    return n, attributes, err
}
```

Pion webrtc: receiver wiring and actual RTP read
```498:511:/Users/david/Documents/GitHub/haven-player/webrtc/rtpreceiver.go
func (r *RTPReceiver) readRTP(b []byte, reader *TrackRemote) (n int, a interceptor.Attributes, err error) {
    select {
    case <-r.received:
    case <-r.closed:
        return 0, nil, io.EOF
    }

    if t := r.streamsForTrack(reader); t != nil {
        return t.rtpInterceptor.Read(b, a)
    }

    return 0, nil, fmt.Errorf("%w: %d", errRTPReceiverWithSSRCTrackStreamNotFound, reader.SSRC())
}
```

Pion webrtc: sender side (useful for understanding pacing and RTP timestamp expectations)
```301:371:/Users/david/Documents/GitHub/haven-player/webrtc/rtpsender.go
func (r *RTPSender) Send(parameters RTPSendParameters) error {
    // ... binds local stream and writes RTP via srtpWriterFuture
    rtpInterceptor := r.api.interceptor.BindLocalStream(
        &trackEncoding.streamInfo,
        interceptor.RTPWriterFunc(func(header *rtp.Header, payload []byte, _ interceptor.Attributes) (int, error) {
            return srtpStream.WriteRTP(header, payload)
        }),
    )
    // ...
}
```

LiveKit SFU: abstraction around Pion `TrackRemote`
```5:14:/Users/david/Documents/GitHub/haven-player/livekit/pkg/sfu/track_remote.go
type TrackRemote interface {
    ID() string
    RID() string
    Msid() string
    SSRC() webrtc.SSRC
    StreamID() string
    Kind() webrtc.RTPCodecType
    Codec() webrtc.RTPCodecParameters
    RTCTrack() *webrtc.TrackRemote
}
```

LiveKit RTP stats: sender-side timing, frames, jitter; RTP timestamp math
```389:584:/Users/david/Documents/GitHub/haven-player/livekit/pkg/sfu/rtpstats/rtpstats_sender.go
func (r *RTPStatsSender) Update(
    packetTime int64,
    extSequenceNumber uint64,
    extTimestamp uint64,
    marker bool,
    hdrSize int,
    payloadSize int,
    paddingSize int,
    isOutOfOrder bool,
) {
    // ... initialization using extStartTS, extStartSN
    // frames incremented on marker bit; jitter updated from RTP TS vs packetTime
    if !isDuplicate {
        if payloadSize == 0 {
            // padding
        } else {
            if marker { r.frames++ }
            jitter := r.updateJitter(extTimestamp, packetTime)
            // ...
        }
    }
}
```

LiveKit RTP stats: expected RTP timestamp from wallclock (mapping reference)
```808:821:/Users/david/Documents/GitHub/haven-player/livekit/pkg/sfu/rtpstats/rtpstats_sender.go
func (r *RTPStatsSender) GetExpectedRTPTimestamp(at time.Time) (expectedTSExt uint64, err error) {
    if r.firstTime == 0 { err = errors.New("uninitialized"); return }
    timeDiff := at.Sub(time.Unix(0, r.firstTime))
    expectedRTPDiff := timeDiff.Nanoseconds() * int64(r.params.ClockRate) / 1e9
    expectedTSExt = r.extStartTS + uint64(expectedRTPDiff)
    return
}
```

LiveKit test client: track writer pacing and sample durations (outbound reference)
```153:176:/Users/david/Documents/GitHub/haven-player/livekit/test/client/trackwriter.go
sleepTime := time.Millisecond * time.Duration((float32(w.ivfheader.TimebaseNumerator)/float32(w.ivfheader.TimebaseDenominator))*1000)
for {
    if w.ctx.Err() != nil { return }
    frame, _, err := w.ivf.ParseNextFrame()
    if err == io.EOF { w.onWriteComplete(); return }
    time.Sleep(sleepTime)
    if err = w.track.WriteSample(media.Sample{Data: frame, Duration: time.Second}); err != nil { return }
}
```

### Acceptance tests to include (CI)
- Encode 5s of frames at 30 FPS; verify file size grows > 100KB and playable in `ffprobe`.
- Vary `timestamp_us` gaps, out-of-order frames; ensure packets still produced and PTS monotonic after correction.
- Dynamic resolution change mid-stream; verify recording continues and file is valid.
- Audio-only and video-only modes; MP4/WebM/MPEG-TS.


