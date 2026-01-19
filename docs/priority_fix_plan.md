# Priority Fix Plan

## Logical Flow of the Fix

The logs show multiple issues compound to cause the ultimate failure. Here's the priority order:

### Priority 1: RSA Certificates + Extended Ciphers (CRITICAL)

**Status**: ENABLED via env vars `RING_EXTENDED_CIPHERS=1` and `RING_RSA_CERT=1`

**Why**: Ring's servers likely cannot handle ECDSA-only cipher suites. The working Swift/libwebrtc handles this automatically by using a more compatible cipher list.

**Impact**: Generates proper certificate and cipher list BEFORE Ring sees our offer.

**Testing**: 
1. Verify RSA cert being used (check logs for "Generated RSA certificate")
2. Verify extended cipher list (check logs for "Using extended DTLS cipher list")
3. Run test without SDP patch (no_patch strategy)

**Expected Result**: Ring accepts the handshake and DTLS completes without SDP manipulation.

### Priority 2: DTLS Strategy Selection (CRITICAL - Current Focus)

**Current Strategy**: `no_patch` (waiting for Ring to send ClientHello as they claim they will)

**Problem**: Even with proper ciphers, Ring claims to be DTLS client (`setup:active`) but fails to send ClientHello. Cipher mismatch + broken ClientHello = double failure.

**Immediate Action Needed**:

We should test the `patch_answer` strategy which:
1. Receives Ring's SDP answer with `setup:active`
2. Patches it to `setup:passive` (we become client)
3. We send ClientHello immediately
4. Bypasses Ring's broken DTLS initiator

**Test Commands**:
```bash
# Test 1: RSA certs + extended ciphers + no patch (current)
# Keep current env vars and run test - may still fail

# Test 2: RSA certs + extended ciphers + patch_answer (next)
RING_DTLS_STRATEGY=patch_answer python -m pytest tests/test_openring_aiortc_recorder.py::test_simple_recording -xvs

# Combined test environment
export RING_EXTENDED_CIPHERS=1
export RING_RSA_CERT=1
export RING_DTLS_STRATEGY=patch_answer
export RING_IMMEDIATE_CLIENT=1  # Optional: force client role in offer
```

### Priority 3: Filter Logic Restructure (NEEDS IMPROVEMENT)

**Current SIKE Filter Flow** (BACKWARDS):
1. Send offer with ECDSA-only ciphers ❌
2. Ring rejects or struggles with handshake ❌
3. Remove ECDSA ciphers from cached answer ❌ (too late!)

**Correct Filter Flow** (what we need):
1. Generate offer with RSA certs + extended ciphers ✅
2. Ring receives compatible offer ✅
3. Either send as-is OR patch answer if Ring claims active but never sends ClientHello ✅

**Implementation Plan**:
- Modify SIKE filter to patch offer BEFORE sending to Ring
- Remove or disable late-stage ECDSA removal (it's pointless)
- Add early offer patching (modify our offer before Ring sees it)

### Priority 4: Verify ICE Candidate Compatibility

**Current Status**: Using STUN servers (good!) as per Swift implementation:
- `stun:stun.l.google.com:19302`
- `stun:stun.ring.com:3478`

**Check if Ring provides ICE servers**: The logs show they respond to `/liveview/start` but may provide ICE servers in the response. We need to extract and use these:

```python
# In start_live_view response
if response.ice_servers:
    # Restart peer connection with these servers if different
    logger.info("Ring provided ICE servers - should be used for optimal connectivity")
```

### Priority 5: Add `force_passive_in_offer` Strategy

**Purpose**: Explicitly tell Ring "we are the server, you MUST be client" from the start.

**Why this matters**: Prevents any ambiguity about DTLS roles.

**How to implement**:
```python
if dtls_strategy == "force_passive_in_offer":
    # Modify OUR offer to say "we are passive/server"
    offer_sdp = offer_sdp.replace("a=setup:actpass", "a=setup:passive")
    # Ring must respond with "I am active/client" AND actually send ClientHello
```

**Testing**:
```bash
export RING_DTLS_STRATEGY=force_passive_in_offer
python -m pytest tests/test_openring_aiortc_recorder.py::test_simple_recording -xvs
```

## Summary

**Current Issue**: We're getting 50% of the solution right (RSA + extended ciphers) but failing on the other 50% (Ring won't send ClientHello).

**Next Steps**:
1. ✅ RSA certs are enabled
2. ✅ Extended ciphers are enabled  
3. ❌ Need to test `patch_answer` strategy (force client role after Ring flakes out)
4. ❌ Need to implement `force_passive_in_offer` strategy (prevent Ring from claiming client role)
5. ❌ Fix SIKE filter to patch offer before Ring sees it

**Expected Success Path**:
```
With RSA certs + extended ciphers + patch_answer:
→ Ring claims to be client
→ We patch answer to make us the client
→ We send ClientHello immediately  
→ Ring responds as DTLS server
→ DTLS completes, SRTP flows, media arrives
```

## Test Execution Order

```bash
# Test 1: What we have now (may fail)
export RING_EXTENDED_CIPHERS=1
export RING_RSA_CERT=1
export RING_DTLS_STRATEGY=no_patch
python -m pytest tests/test_openring_aiortc_recorder.py::test_simple_recording -xvs

# Test 2: PATCH ANSWER (most likely to work)
export RING_DTLS_STRATEGY=patch_answer
python -m pytest tests/test_openring_aiortc_recorder.py::test_simple_recording -xvs

# Test 3: Force passive in offer (explicit role assignment)
export RING_DTLS_STRATEGY=force_passive_in_offer
python -m pytest tests/test_openring_aiortc_recorder.py::test_simple_recording -xvs

# Test 4: Combined patch_answer + immediate client if needed
export RING_DTLS_STRATEGY=patch_answer
export RING_IMMEDIATE_CLIENT=1
python -m pytest tests/test_openring_aiortc_recorder.py::test_simple_recording -xvs
```

## Rollback Plan

If `patch_answer` strategy works but we want to optimize:
- Remove SDP patch once Ring's DTLS initiator is fixed
- Keep RSA + extended ciphers for compatibility
- Monitor logs for handshake success rate
