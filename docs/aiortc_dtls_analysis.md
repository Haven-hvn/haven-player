# aiortc DTLS Handshake Analysis - Ring Compatibility Issue

## Executive Summary

**Root Cause**: Ring's WebRTC server violates the SDP protocol by claiming `setup:active` (DTLS client role) in their answer but never actually initiating the DTLS handshake (sending ClientHello). This causes aiortc to wait indefinitely for a ClientHello that never comes.

**Verdict**: This is a **Ring server bug**, not an aiortc bug. However, aiortc can be patched to work around Ring's non-compliant behavior.

---

## Detailed Analysis

### 1. SDP Setup Attribute Protocol (RFC 4145/5763)

The `a=setup:` attribute in SDP determines DTLS roles:

| SDP Value | DTLS Role | Behavior |
|-----------|-----------|----------|
| `setup:active` | Client | Sends ClientHello (initiates handshake) |
| `setup:passive` | Server | Waits for ClientHello |
| `setup:actpass` | Either | Can be client or server (offer only) |

**RFC Rules for Offer/Answer**:
- Offerer can use `actpass`, `active`, or `passive`
- If offerer is `actpass`, answerer chooses `active` or `passive`
- If offerer is `active`, answerer MUST be `passive`
- If offerer is `passive`, answerer MUST be `active`

### 2. What Ring Does (Non-Compliant Behavior)

| Scenario | Our Offer | Ring's Answer | Expected | Result |
|----------|-----------|---------------|----------|--------|
| Default | `setup:actpass` | `setup:active` | Ring sends ClientHello | Ring never sends ClientHello |
| Forced active | `setup:active` | `setup:active` | N/A (invalid) | Protocol violation - both claim client |

**Ring's answer claims `setup:active`** (DTLS client) but Ring never actually sends a ClientHello. This suggests Ring's implementation has a bug where they:
1. Incorrectly set `setup:active` in their SDP answer, OR
2. Expect the other party to always initiate DTLS regardless of SDP

### 3. How aiortc Handles This (Correctly Per Spec)

**File: `aiortc/sdp.py` (lines 21-22)**
```python
DTLS_ROLE_SETUP = {"auto": "actpass", "client": "active", "server": "passive"}
DTLS_SETUP_ROLE = {"actpass": "auto", "active": "client", "passive": "server"}
```

**File: `aiortc/rtcpeerconnection.py` (lines 996-1001)**
```python
# set DTLS role
if description.type == "offer" and media.dtls.role == "client":
    dtlsTransport._set_role(role="server")
if description.type == "answer":
    dtlsTransport._set_role(
        role="server" if media.dtls.role == "client" else "client"
    )
```

When processing Ring's answer with `setup:active`:
- `"active"` → `role="client"` (Ring claims client role)
- aiortc becomes `"server"` (inverse of client)

**File: `aiortc/rtcdtlstransport.py` (lines 522-525)**
```python
if self._role == "server":
    self._ssl.set_accept_state()  # Wait for ClientHello
else:
    self._ssl.set_connect_state()  # Send ClientHello
```

aiortc sets `set_accept_state()` and waits for Ring's ClientHello - which never comes.

### 4. Why Your SDP Modification Doesn't Work

Your current code in `openring_aiortc_recorder.py`:
```python
if "a=setup:actpass" in offer_sdp:
    offer_sdp = offer_sdp.replace("a=setup:actpass", "a=setup:active")
```

This forces `setup:active` in your offer, meaning "I will be DTLS client."

**Expected Ring response**: `setup:passive` (Ring becomes server)
**Actual Ring response**: `setup:active` (Ring also claims client - **protocol violation**)

aiortc's logic:
1. Remote answer has `setup:active` 
2. Parse: `"active"` → `role="client"`
3. Set our role: `"server" if "client" else "client"` → we become `"server"`
4. Call `set_accept_state()` and wait for ClientHello

Result: **Deadlock** - aiortc waits for Ring to send ClientHello, but Ring never does.

---

## Code Locations Summary

| Component | File | Lines | Purpose |
|-----------|------|-------|---------|
| SDP role mapping | `sdp.py` | 21-22 | Maps setup attributes to DTLS roles |
| Answer role processing | `rtcpeerconnection.py` | 996-1001 | Sets DTLS role from remote answer |
| Offer role (createAnswer) | `rtcpeerconnection.py` | 590-593 | Sets role for our answer |
| DTLS handshake start | `rtcdtlstransport.py` | 517-525 | Initializes SSL client/server state |
| DTLS handshake loop | `rtcdtlstransport.py` | 409-429 | Performs handshake with retry |
| Connection state update | `rtcpeerconnection.py` | 1270-1304 | Updates connectionState |

---

## Fix Options

### Option A: Force DTLS Client Role (Recommended)

Modify the SDP answer processing to force client role regardless of what Ring claims:

```python
# In openring_aiortc_recorder.py - after receiving Ring's answer
remote_sdp = response.answer_sdp

# Force Ring's answer to say "passive" so we become client
if "a=setup:active" in remote_sdp:
    remote_sdp = remote_sdp.replace("a=setup:active", "a=setup:passive")
    logger.info("Patched Ring's SDP: forcing setup:passive so we initiate DTLS")

remote_description = self._session_description_factory(remote_sdp, "answer")
```

This tells aiortc that Ring is `passive` (server), so aiortc becomes `client` and sends ClientHello.

### Option B: Patch RTCDtlsTransport to Always Be Client

Create a custom DTLS transport that always initiates:

```python
# Monkey-patch or subclass RTCDtlsTransport
class RingCompatibleDtlsTransport(RTCDtlsTransport):
    async def start(self, remoteParameters):
        # Force client role regardless of SDP negotiation
        self._role = "client"
        await super().start(remoteParameters)
```

### Option C: Modify aiortc Source Directly

Edit `aiortc/rtcpeerconnection.py` line 999-1001:

```python
if description.type == "answer":
    # Original: role="server" if media.dtls.role == "client" else "client"
    # Force client role for Ring compatibility
    dtlsTransport._set_role(role="client")  # Always be client
```

### Option D: Add DTLS Timeout with Role Switch

Add a timeout mechanism that retries with opposite role:

```python
# In _do_handshake or start()
try:
    await asyncio.wait_for(self._do_handshake(), timeout=5.0)
except asyncio.TimeoutError:
    if self._role == "server":
        logger.warning("DTLS server handshake timeout, retrying as client")
        self._role = "client"
        self._ssl.set_connect_state()
        await self._do_handshake()
```

---

## Recommended Solution

**Option A (SDP Patching)** is the safest and least invasive:

```python
# In openring_aiortc_recorder.py, around line 296

# Patch Ring's incorrect SDP before processing
remote_sdp = response.answer_sdp
if "a=setup:active" in remote_sdp:
    # Ring claims DTLS client but never sends ClientHello
    # Force them to be server so we initiate the handshake
    remote_sdp = remote_sdp.replace("a=setup:active", "a=setup:passive")
    logger.info(
        "Patched Ring SDP: changed setup:active to setup:passive "
        "(Ring bug workaround - they claim client but never initiate)"
    )

remote_description = self._session_description_factory(remote_sdp, "answer")
```

### Why This Works

1. Ring's answer claims `setup:active` (client role)
2. We patch it to `setup:passive` (server role)
3. aiortc processes: Ring is `passive` → we become `client`
4. aiortc calls `set_connect_state()` 
5. **We send ClientHello** instead of waiting for Ring
6. Ring accepts our ClientHello (they were waiting for it!)
7. DTLS handshake completes
8. Media flows

---

## Alternative: Different Library Assessment

If patching doesn't work, consider:

| Library | Pros | Cons |
|---------|------|------|
| **aiortc** (patched) | Python native, async, well-maintained | Requires workaround for Ring |
| **webrtc-rs** | Rust, very fast | Requires Python bindings |
| **libdatachannel** | C++, battle-tested | FFI complexity |
| **GStreamer webrtcbin** | Full-featured, plugins | Heavy dependency |

**Recommendation**: Stick with aiortc + SDP patching. It's the simplest solution and aiortc is otherwise well-suited for this use case.

---

## Verification Steps

After implementing the fix:

1. **Check DTLS state transitions**:
   - Should see: `new` → `connecting` → `connected`
   - If stuck at `connecting` for >5s, fix didn't work

2. **Check connection state**:
   - Should see: `connectionState: connected` after ICE completes
   - Previously stuck at `connectionState: connecting`

3. **Check for media frames**:
   - Frame probe should succeed within 10s
   - If still timing out, issue is elsewhere (codec, network, etc.)

4. **Enable debug logging**:
   ```python
   import logging
   logging.getLogger("aiortc").setLevel(logging.DEBUG)
   ```
   Look for:
   - `RTCDtlsTransport(client) - State.NEW -> State.CONNECTING`
   - `RTCDtlsTransport(client) - DTLS handshake complete`
   - `RTCDtlsTransport(client) - State.CONNECTING -> State.CONNECTED`

---

## Conclusion

The DTLS handshake failure is caused by **Ring's non-compliant SDP answer** claiming `setup:active` without actually initiating DTLS. The fix is to patch Ring's SDP to `setup:passive` so aiortc takes on the DTLS client role and initiates the handshake.

This is a targeted workaround for Ring's specific behavior and shouldn't affect other WebRTC connections.
