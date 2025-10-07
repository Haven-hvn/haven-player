## WebRTC Connection → Subscription → Recording State Machine

States: `DISCONNECTED → CONNECTING → CONNECTED → SUBSCRIBED → RECORDING → STOPPING → STOPPED`

```
DISCONNECTED --connect()--> CONNECTING --ICE+DTLS OK--> CONNECTED --OnTrack all--> SUBSCRIBED --first frames--> RECORDING --stop--> STOPPING --> STOPPED
         ^                                    |                                   |                   |              
         |------------------------------------|-----------------------------------|-------------------|---------------
                                         (errors/timeouts → recovery or stop)
```

Key gates:
- CONNECTED requires `PeerConnectionState=Connected` and ICE ∈ {Connected, Completed}.
- SUBSCRIBED requires required publications `subscribed=True` and `OnTrack` fired per track.
- RECORDING requires first complete frame/sample from each required track.

Timeouts (defaults): `Tconnect=15s`, `Tice_grace=10s`, `Tsubscribe=5s`, `Tmedia_start=3s`, `Tflush=5s`.


