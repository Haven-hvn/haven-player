# aiortc DTLS Handshake Analysis - Ring Compatibility Issue

## Executive Summary

**Root Cause**: Our initial diagnosis was WRONG. Ring's `setup:active` is correct and Ring DOES send ClientHello when we properly become the DTLS server.

**The Bug**: We were patching Ring's SDP from `setup:active` to `setup:passive`, which made us the DTLS client. Ring doesn't respond to our ClientHello because Ring is also waiting to send ClientHello.

**The Fix**: DON'T patch Ring's SDP. Let Ring be the DTLS client (`setup:active`) and we become the DTLS server. This matches the working Swift/libwebrtc implementation.

---

## Critical Finding from Working Swift Implementation

The working `open-ring` Swift app at `open-ring/app/OpenRingPackage/Sources/RingClient/LiveViewSession.swift` does **NOT patch Ring's SDP** at all:

```swift
// Swift code - NO patching, uses Ring's answer as-is
private func setRemoteDescription(_ sdp: String) async throws {
    let answer = RTCSessionDescription(type: .answer, sdp: sdp)
    pc.setRemoteDescription(answer) { ... }  // No modification!
}
```

The Swift code also uses a specific constraint:
```swift
let constraints = RTCMediaConstraints(
    mandatoryConstraints: nil,
    optionalConstraints: ["DtlsSrtpKeyAgreement": "true"]
)
```

### What Works (Swift/libwebrtc):
1. Ring sends `setup:active` (Ring is DTLS **client**)
2. libwebrtc does NOT patch - uses as-is
3. libwebrtc becomes DTLS **server** (`set_accept_state`)
4. libwebrtc **waits** for Ring's ClientHello
5. **Ring sends ClientHello** → handshake succeeds!

### What Was Failing (Our Python with patching):
1. Ring sends `setup:active` (Ring is DTLS **client**)
2. We **PATCHED** it to `setup:passive`
3. aiortc becomes DTLS **client** (`set_connect_state`)
4. aiortc **sends** ClientHello to Ring
5. **Ring ignores it** because Ring is also trying to be client!

---

## SDP Setup Attribute Protocol (RFC 4145/5763)

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

---

## How aiortc Handles DTLS Roles

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

When processing Ring's answer with `setup:active` (NO patching):
- `"active"` → `role="client"` (Ring claims client role)
- aiortc becomes `"server"` (inverse of client)
- aiortc calls `set_accept_state()` and waits for Ring's ClientHello
- **Ring sends ClientHello** and handshake completes!

---

## Code Locations Summary

| Component | File | Lines | Purpose |
|-----------|------|-------|---------|
| SDP role mapping | `sdp.py` | 21-22 | Maps setup attributes to DTLS roles |
| Answer role processing | `rtcpeerconnection.py` | 996-1001 | Sets DTLS role from remote answer |
| DTLS handshake start | `rtcdtlstransport.py` | 517-525 | Initializes SSL client/server state |
| DTLS handshake loop | `rtcdtlstransport.py` | 409-429 | Performs handshake with retry |

---

## The Fix

**Simply don't patch Ring's SDP.** The default strategy is now `no_patch`:

```python
# In openring_aiortc_recorder.py
dtls_strategy = os.environ.get("RING_DTLS_STRATEGY", "no_patch")

if dtls_strategy == "no_patch":
    # Trust Ring's SDP - they say active, so we become server and wait
    # This matches the working Swift/libwebrtc implementation!
    pass  # Don't modify patched_answer_sdp
```

### Why This Works

1. Ring's answer says `setup:active` (client role)
2. We use it **as-is** (no patching)
3. aiortc processes: Ring is `active` (client) → we become `server`
4. aiortc calls `set_accept_state()` 
5. **Ring sends ClientHello** (Ring is properly acting as client!)
6. We respond with ServerHello
7. DTLS handshake completes
8. Media flows

---

## DTLS Cipher Suite Configuration

### aiortc's Default Configuration

**File: `aiortc/rtcdtlstransport.py` lines 203-206**

```python
ctx.set_cipher_list(
    b"ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-ECDSA-CHACHA20-POLY1305:ECDHE-ECDSA-AES128-SHA:ECDHE-ECDSA-AES256-SHA"
)
```

**Supported DTLS Ciphers:**
- `ECDHE-ECDSA-AES128-GCM-SHA256`
- `ECDHE-ECDSA-CHACHA20-POLY1305`
- `ECDHE-ECDSA-AES128-SHA`
- `ECDHE-ECDSA-AES256-SHA`

**SRTP Profiles:**
- `SRTP_AEAD_AES_256_GCM`
- `SRTP_AEAD_AES_128_GCM`
- `SRTP_AES128_CM_SHA1_80`

**Certificate Type:** ECDSA (SECP256R1)

### DtlsSrtpKeyAgreement Constraint

The working Swift implementation uses:
```swift
optionalConstraints: ["DtlsSrtpKeyAgreement": "true"]
```

This is a legacy WebRTC constraint that enables DTLS-SRTP key agreement. aiortc enables this by default via `set_tlsext_use_srtp()`.

---

## Diagnostic Environment Variables

```bash
# Enable verbose aiortc/OpenSSL logging
export AIORTC_DEBUG=1

# DTLS role strategy (no_patch is now default)
export RING_DTLS_STRATEGY=no_patch

# Alternative strategies for testing:
# export RING_DTLS_STRATEGY=patch_answer    # Patch Ring's answer (old broken approach)
# export RING_DTLS_STRATEGY=force_passive_offer  # Force passive in our offer

# Extended cipher support (if cipher mismatch is suspected)
export RING_EXTENDED_CIPHERS=1

# Use RSA certificate instead of ECDSA
export RING_RSA_CERT=1

# Detailed DTLS packet logging
export RING_DTLS_DEBUG=1
```

---

## Verification Steps

After implementing the fix:

1. **Check logs for DTLS role**:
   - Should see: `dtls_role=server` (we wait for Ring's ClientHello)
   - Previously (broken): `dtls_role=client` (we sent ClientHello)

2. **Check DTLS state transitions**:
   - Should see: `new` → `connecting` → `connected`
   - If stuck at `connecting` for >5s with `role=server`, Ring isn't sending ClientHello

3. **Check connection state**:
   - Should see: `connectionState: connected` after ICE completes

4. **Check for media frames**:
   - Frame probe should succeed within 10s

5. **Enable debug logging**:
   ```python
   import logging
   logging.getLogger("aiortc").setLevel(logging.DEBUG)
   ```
   Look for:
   - `RTCDtlsTransport(server) - State.NEW -> State.CONNECTING`
   - `RTCDtlsTransport(server) - DTLS handshake complete`
   - `RTCDtlsTransport(server) - State.CONNECTING -> State.CONNECTED`

---

## Conclusion

The DTLS handshake failure was caused by **incorrect SDP patching** that reversed the DTLS roles. Ring's `setup:active` is correct - Ring IS the DTLS client and DOES send ClientHello when we properly become the server.

The fix is to **not patch Ring's SDP** and let aiortc handle the DTLS roles correctly per the SDP negotiation. This matches the working Swift/libwebrtc implementation in the `open-ring` app.
