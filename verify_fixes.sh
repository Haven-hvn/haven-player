#!/bin/bash

# Verification script for critical performance fixes
# Run this after implementing the fixes to verify everything is working

set -e

echo "🔍 Verifying Critical Fixes..."
echo ""

# Color codes
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Track failures
FAILURES=0

# Test 1: No container.mux() calls
echo "Test 1: Verifying no container.mux() calls..."
if grep -q "container\.mux(" backend/app/services/webrtc_recording_service.py; then
    echo -e "${RED}❌ FAIL: Found container.mux() calls${NC}"
    grep -n "container\.mux(" backend/app/services/webrtc_recording_service.py
    FAILURES=$((FAILURES + 1))
else
    echo -e "${GREEN}✅ PASS: No container.mux() calls found${NC}"
fi
echo ""

# Test 2: Flush threshold configured
echo "Test 2: Verifying buffered flushing (4MB threshold)..."
if grep -q "flush_threshold = 4 \* 1024 \* 1024" backend/app/services/webrtc_recording_service.py; then
    echo -e "${GREEN}✅ PASS: Flush threshold set to 4MB${NC}"
else
    echo -e "${RED}❌ FAIL: Flush threshold not found or incorrect${NC}"
    FAILURES=$((FAILURES + 1))
fi
echo ""

# Test 3: Temp file strategy
echo "Test 3: Verifying temp file crash recovery..."
if grep -q "temp_output_path" backend/app/services/webrtc_recording_service.py; then
    echo -e "${GREEN}✅ PASS: Temp file strategy implemented${NC}"
else
    echo -e "${RED}❌ FAIL: Temp file strategy not found${NC}"
    FAILURES=$((FAILURES + 1))
fi
echo ""

# Test 4: Audio uses direct write
echo "Test 4: Verifying audio uses direct write..."
if grep -A2 "self.audio_stream.encode" backend/app/services/webrtc_recording_service.py | grep -q "_write_packet_direct"; then
    echo -e "${GREEN}✅ PASS: Audio uses direct write${NC}"
else
    echo -e "${RED}❌ FAIL: Audio may not be using direct write${NC}"
    FAILURES=$((FAILURES + 1))
fi
echo ""

# Test 5: Direct write uses buffered flushing
echo "Test 5: Verifying buffered flushing logic..."
if grep -q "bytes_since_last_flush" backend/app/services/webrtc_recording_service.py; then
    echo -e "${GREEN}✅ PASS: Buffered flushing logic present${NC}"
else
    echo -e "${RED}❌ FAIL: Buffered flushing logic not found${NC}"
    FAILURES=$((FAILURES + 1))
fi
echo ""

# Test 6: Rename on completion
echo "Test 6: Verifying atomic rename on completion..."
if grep -q "temp_output_path.rename(self.final_output_path)" backend/app/services/webrtc_recording_service.py; then
    echo -e "${GREEN}✅ PASS: Atomic rename implemented${NC}"
else
    echo -e "${RED}❌ FAIL: Atomic rename not found${NC}"
    FAILURES=$((FAILURES + 1))
fi
echo ""

# Summary
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
if [ $FAILURES -eq 0 ]; then
    echo -e "${GREEN}✅ ALL TESTS PASSED${NC}"
    echo ""
    echo "Next steps:"
    echo "1. Start backend: uvicorn app.main:app --reload"
    echo "2. Start a recording"
    echo "3. Monitor memory: watch -n 5 'ps aux | grep python'"
    echo "4. Monitor file: watch -n 1 'ls -lh recordings/*.recording.ts'"
    echo "5. Check for continuous file growth every 1-2 seconds"
    echo "6. Verify memory stays at ~150-200MB"
    exit 0
else
    echo -e "${RED}❌ $FAILURES TEST(S) FAILED${NC}"
    echo ""
    echo "Please review the failed tests above and fix the issues."
    exit 1
fi

