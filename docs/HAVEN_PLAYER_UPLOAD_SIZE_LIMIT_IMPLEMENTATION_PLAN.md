# Haven-Player Filecoin Upload Size Limit Implementation Plan

**Document Version:** 1.0  
**Date:** 2025-01-31  
**Based On:** `@filoz/synapse-sdk` UPLOAD_SIZE_LIMIT_HANDLING_PLAN.md  
**Applies To:** Haven-Player Filecoin upload functionality  
**Target Audience:** Developers, Architects

---

## 1. Executive Summary

Haven-Player must implement pre-flight size validation for Filecoin uploads to account for the **hard upload size limit of approximately 1 GiB** (1,065,353,216 bytes) per file enforced by the Synapse SDK.

**Key Requirements:**
- Validate file size BEFORE encryption/CAR creation
- Account for encryption overhead (~35% for base64 encoding)
- Account for CAR file overhead (~1%)
- Provide clear user feedback for size violations
- Route oversized files to the existing failure sink

---

## 2. Haven-Player Architecture Overview

```
Plugin Download / Manual Upload
       │
       ▼
Backend API: POST /upload-queue
       │
       ├─► [SIZE VALIDATION] ◄───► Fail Sink (failed, error_stage='size_validation')
       │
       ▼
UploadQueue (pending)
       │
       ▼
UploadWorker (main process)
       │
       ▼
processUpload()
       │
       ├─► [SIZE VALIDATION] ◄───► Fail Sink (failed, error_stage='size_validation')
       │
       ▼
uploadVideoToFilecoin()
       │
       ├─► [SIZE VALIDATION] ◄───► Throw Error
       │
       ▼
Filecoin Upload
```

---

## 3. Size Constants and Validation Logic

### 3.1 Size Limits

| Constant | Value | Description |
|----------|-------|-------------|
| `MAX_UPLOAD_SIZE` | 1,065,353,216 bytes (~1 GiB) | Maximum upload size from Synapse SDK |
| `MIN_UPLOAD_SIZE` | 127 bytes | Minimum size for PieceCIDv2 calculation |
| `ENCRYPTION_OVERHEAD_FACTOR` | 1.35 | Base64 encoding overhead (~35%) |
| `CAR_OVERHEAD_FACTOR` | 1.01 | CAR file overhead (~1%) |
| `SAFETY_MARGIN` | 1.05 | Additional 5% safety margin |

### 3.2 Effective Limits

| Scenario | Max Original Size | Calculation |
|----------|------------------|-------------|
| Unencrypted | ~1,005 MB | 1.065 GB / 1.01 / 1.05 |
| Encrypted | ~744 MB | 1.065 GB / 1.35 / 1.01 / 1.05 |

---

## 4. Implementation Checklist

### Phase 1: Frontend Validation
- [ ] Add size constants to `frontend/src/services/filecoinService.ts`
- [ ] Add `validateFilecoinUploadSize()` function
- [ ] Add `validateFileForFilecoinUpload()` helper
- [ ] Add `formatBytes()` utility
- [ ] Integrate validation into `uploadVideoToFilecoin()` (at START)
- [ ] Integrate validation into `uploadWorker.processUpload()` (after file read)
- [ ] Update error handling for size validation errors

### Phase 2: Backend Validation
- [ ] Create `backend/app/services/filecoin_size_limits.py`
- [ ] Add `FilecoinSizeLimits` class with constants
- [ ] Add `SizeValidationReason` enum
- [ ] Add `FilecoinSizeValidationResult` dataclass
- [ ] Add `validate_filecoin_upload_size()` function
- [ ] Integrate validation into `add_to_upload_queue()` API endpoint
- [ ] Update error responses with size validation details

### Phase 3: UI Updates
- [ ] Add size limit info to `FilecoinConfigModal.tsx`
- [ ] Show size validation errors in `UploadWorkerConfig.tsx`
- [ ] Add user-friendly error messages
- [ ] Display effective limits based on encryption setting

### Phase 4: Testing
- [ ] Write unit tests for size validation functions
- [ ] Write integration tests for upload flow
- [ ] Test boundary conditions (1 GiB, 1 GiB + 1 byte)
- [ ] Test with encryption enabled/disabled
- [ ] Verify fail sink entries are created correctly
- [ ] Test UI error display

### Phase 5: Documentation
- [ ] Update API documentation
- [ ] Add inline code comments
- [ ] Document size limits in user-facing docs
- [ ] Create troubleshooting guide

---

## 5. Key Code Changes

### 5.1 Frontend: filecoinService.ts

Add at top of file:

```typescript
// ============================================
// Filecoin Upload Size Limits
// ============================================
const MAX_UPLOAD_SIZE = 1_065_353_216; // ~1 GiB
const MIN_UPLOAD_SIZE = 127;
const ENCRYPTION_OVERHEAD_FACTOR = 1.35;
const CAR_OVERHEAD_FACTOR = 1.01;
const SAFETY_MARGIN = 1.05;

export interface FilecoinSizeValidationResult {
  valid: boolean;
  reason?: 'TOO_SMALL' | 'TOO_LARGE' | 'ENCRYPTION_WOULD_EXCEED' | 'CAR_WOULD_EXCEED';
  originalSize: number;
  projectedSize: number;
  maxAllowed: number;
  encryptionEnabled: boolean;
  errorMessage?: string;
  userMessage?: string;
}

export function validateFilecoinUploadSize(
  fileSize: number,
  encryptionEnabled: boolean = false
): FilecoinSizeValidationResult {
  // Implementation...
}
```

### 5.2 Backend: filecoin_size_limits.py

Create new file:

```python
class FilecoinSizeLimits:
    MAX_UPLOAD_SIZE = 1_065_353_216
    MIN_UPLOAD_SIZE = 127
    ENCRYPTION_OVERHEAD_FACTOR = 1.35
    CAR_OVERHEAD_FACTOR = 1.01
    SAFETY_MARGIN = 1.05

def validate_filecoin_upload_size(file_size: int, encryption_enabled: bool = False):
    # Implementation...
```

---

## 6. User Experience Guidelines

### 6.1 Error Messages

| Scenario | User Message |
|----------|--------------|
| File too small | "File is too small. Minimum size is 127 bytes." |
| File too large (unencrypted) | "File (1.5 GB) exceeds 1.00 GB maximum upload size. Please compress or split the file." |
| File too large (encrypted) | "File (800 MB) would exceed 1.00 GB limit after encryption. Try disabling encryption or compressing the file." |

### 6.2 UI Feedback

Add to FilecoinConfigModal:
- Show maximum upload size (1 GB)
- Show effective limit when encryption enabled (~744 MB)
- Display warning when file approaches limit

---

## 7. Monitoring and Metrics

Track these metrics:
- `upload_size_validation_rejection_rate` - Alert if > 5%
- `avg_rejected_file_size` - Track trend
- `encryption_enabled_rejection_rate` - Track separately
- `fail_sink_queue_depth` - Alert if > 100

---

## 8. Future Considerations

### 8.1 SDK Roadmap Alignment

Monitor for:
- Native chunking support (may eliminate 1 GiB limit)
- Sub-piece aggregation
- Streaming upload improvements

### 8.2 When to Revisit This Plan

- SDK version updates
- Curio PDP server releases
- Changes to file size requirements
- User feedback on limitations

### 8.3 Long-term Strategies

1. **Client-side chunking**: Split large videos before upload
2. **Tiered storage**: Automatic < 1 GB, manual > 1 GB
3. **Provider partnerships**: Custom handling for large files
4. **Compression**: Suggest video compression for oversized files

---

## 9. References

- Synapse SDK Constants: `packages/synapse-sdk/src/utils/constants.ts`
- Synapse Core Piece: `packages/synapse-core/src/piece.ts`
- Filecoin FRC-0069: https://github.com/filecoin-project/FIPs/blob/master/FRCs/frc-0069.md
- Haven-Player UploadQueue Model: `backend/app/models/upload_queue.py`
- Haven-Player UploadWorker: `frontend/src/services/uploadWorker.ts`

---

**Document Maintenance:**
- Review quarterly or on SDK updates
- Update size limits when Curio PDP changes
- Incorporate user feedback
