## Core Pseudocode

```pseudo
class StreamRecorder:
    state: State
    room: Room
    tracks: Map[SID, Track]
    processors: Map[SID, FrameProcessor]
    encoder: EncoderQueue
    muxer: FileWriter

    async def connect_to_stream(url, token, auto_subscribe=True):
        state = CONNECTING
        room = await LiveKit.connect(url, token, auto_subscribe=auto_subscribe)
        set_handlers(room)
        await wait_connected(room)
        await subscribe_required_tracks(room)
        state = SUBSCRIBED

    async def start_recording(out_path):
        assert state == SUBSCRIBED
        encoder = EncoderQueue()
        muxer = FileWriter(out_path)
        for sid, track in tracks:
            p = FrameProcessor(track)
            processors[sid] = p
            spawn(p.run())
        await encoder.start()
        await muxer.start()
        state = RECORDING

    async def stop_recording():
        if state not in {RECORDING, SUBSCRIBED}: return
        state = STOPPING
        for p in processors.values(): await p.stop()
        await encoder.flush()
        await muxer.close()
        cleanup()
        state = STOPPED
```


