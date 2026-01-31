# Failure Sink Implementation

## Overview

This document describes the implementation of a centralized "failure sink" for the Haven Player upload queue. The failure sink prevents downstream stages from running when an upstream stage fails, ensuring efficient resource utilization and clear error tracking.

## Problem

Previously, when a stage failed (e.g., FileCoin upload failed due to encryption error), downstream stages (e.g., VLM analysis) would continue to run, wasting resources and creating confusing error states.

Example from the issue:
```
UploadWorker Upload failed at stage encryption for /home/tower/Downloads/disorder/...
Error: Filecoin upload failed - Lit Protocol encryption failed: localStorage is not available
[Later...]
VLM analysis continued to run even though upload failed
```

## Solution

A centralized failure tracking mechanism that:
1. Marks jobs as failed when any stage fails
2. Prevents downstream stages from running
3. Provides clear error tracking and reporting

## Implementation

### Database Schema Changes

Added new fields to `upload_queue` table:

```python
# Overall status and failure sink
overall_status: Mapped[str] = mapped_column(String, default='pending', nullable=False, index=True)

# Which stage failed (if overall_status is 'failed')
failed_stage: Mapped[str] = mapped_column(String, nullable=True, index=True)

# When the failure occurred
failed_at: Mapped[datetime] = mapped_column(DateTime, nullable=True)

# Detailed error message for the failure
failure_reason: Mapped[str] = mapped_column(Text, nullable=True)
```

### Model Changes

Added helper methods to `UploadQueue` model:

```python
def is_overall_failed(self) -> bool:
    """Check if the overall job has failed (in the failure sink)."""
    return self.overall_status == 'failed'

def can_proceed(self) -> bool:
    """Check if downstream stages can proceed."""
    return self.overall_status != 'failed'

def mark_as_failed(self, stage: str, reason: str) -> None:
    """Mark the job as failed in the failure sink."""
    from datetime import datetime, timezone
    self.overall_status = 'failed'
    self.failed_stage = stage
    self.failed_at = datetime.now(timezone.utc)
    self.failure_reason = reason

def update_overall_status(self) -> None:
    """Update overall status based on individual stage statuses."""
    # If already failed, stay failed
    if self.overall_status == 'failed':
        return

    # Check if any stage is processing
    if (self.status == 'processing' or
        self.vlm_analysis_status == 'processing' or
        self.vlm_json_upload_status == 'processing' or
        self.arkiv_sync_status == 'syncing'):
        self.overall_status = 'processing'
        return

    # Check if all required stages are completed
    upload_complete = self.status == 'completed'
    vlm_complete = (self.vlm_analysis_status in ['completed', 'skipped'] or
                   self.vlm_analysis_status is None)
    vlm_json_complete = (self.vlm_json_upload_status in ['completed', 'skipped'] or
                        self.vlm_json_upload_status is None)
    arkiv_complete = (self.arkiv_sync_status in ['completed', 'skipped'] or
                     self.arkiv_sync_status is None)

    if upload_complete and vlm_complete and vlm_json_complete and arkiv_complete:
        self.overall_status = 'completed'
    else:
        self.overall_status = 'processing'
```

### API Changes

#### Upload Status Endpoint

When upload fails:
1. Marks job as failed in failure sink
2. Skips VLM analysis if it's pending
3. Updates overall status

```python
# If upload failed, mark as failed in the failure sink
if update_data.status == 'failed':
    queue_entry.mark_as_failed(
        stage='upload',
        reason=update_data.error or 'Unknown upload error'
    )
    # Skip VLM analysis since upload failed
    if queue_entry.vlm_analysis_status == 'pending':
        queue_entry.vlm_analysis_status = 'skipped'
        queue_entry.vlm_analysis_error = f"Upload failed: {update_data.error or 'Unknown error'}"
        logger.info(f"Skipping VLM analysis for {queue_entry.video_path} due to upload failure")
elif update_data.status == 'completed':
    # Upload completed successfully, update overall status
    queue_entry.update_overall_status()
```

#### VLM Analysis Status Endpoint

Before processing VLM analysis:
1. Checks if job can proceed
2. Returns 409 Conflict if job is in failure sink
3. Marks job as failed if VLM analysis fails

```python
# Check if job can proceed (not in failure sink)
if not queue_entry.can_proceed() and update_data.vlm_analysis_status == 'processing':
    logger.warning(f"Cannot process VLM analysis for {queue_entry.video_path} - job is in failure sink (failed at stage: {queue_entry.failed_stage})")
    raise HTTPException(
        status_code=409,
        detail=f"Cannot process VLM analysis - job is in failure sink (failed at stage: {queue_entry.failed_stage})"
    )

# If VLM analysis failed, mark as failed in the failure sink
if update_data.vlm_analysis_status == 'failed':
    queue_entry.mark_as_failed(
        stage='vlm_analysis',
        reason=update_data.vlm_analysis_error or 'Unknown VLM analysis error'
    )
elif update_data.vlm_analysis_status == 'completed':
    # VLM analysis completed successfully, update overall status
    queue_entry.update_overall_status()
```

### Worker Changes

#### VLM Analysis Worker

Before processing a VLM analysis job:
1. Checks if job can proceed
2. Skips job if it's in failure sink
3. Marks VLM analysis as skipped with appropriate error message

```python
# Check if job can proceed (not in failure sink)
if not queue_entry.can_proceed():
    logger.warning(f"Skipping VLM analysis for {queue_entry.video_path} - job failed at earlier stage: {queue_entry.failed_stage}")
    await self.mark_vlm_analysis_skipped(
        queue_id,
        f"Job failed at earlier stage: {queue_entry.failed_stage} - {queue_entry.failure_reason}"
    )
    return True
```

## Migration

A migration script was created to add the new fields to the database:

```bash
cd backend
. venv/bin/activate
python3 -m app.migrations.add_failure_sink_fields
```

The migration:
- Adds `overall_status` column with default value 'pending'
- Adds `failed_stage` column
- Adds `failed_at` column
- Adds `failure_reason` column
- Creates indexes on `overall_status` and `failed_stage` for efficient querying

## Testing

Comprehensive tests were added to verify failure sink functionality:

1. `test_mark_as_failed`: Verifies that `mark_as_failed()` correctly sets failure sink fields
2. `test_can_proceed`: Verifies that `can_proceed()` returns False for failed jobs
3. `test_update_overall_status`: Verifies that `update_overall_status()` correctly updates overall status
4. `test_failure_prevents_downstream`: Verifies that failure prevents downstream stages from running

Run tests with:

```bash
cd backend
. venv/bin/activate
pytest tests/test_failure_sink.py -v
```

## Benefits

1. **Resource Efficiency**: Downstream stages don't waste resources processing jobs that have already failed
2. **Clear Error Tracking**: Centralized failure tracking makes it easy to see which stage failed and why
3. **Prevents Cascading Failures**: Failed jobs don't cause downstream stages to fail
4. **Better User Experience**: Users get clear error messages about what failed and why
5. **Easier Debugging**: All failure information is centralized in one place

## Future Enhancements

Potential future improvements:

1. **Retry Logic**: Add automatic retry for certain types of failures
2. **Failure Notifications**: Send notifications when jobs fail
3. **Failure Analytics**: Track failure patterns to identify common issues
4. **Failure Recovery**: Allow manual retry of failed jobs
5. **Failure Dashboard**: UI to view and manage failed jobs

## Example Flow

### Before Failure Sink

```
1. Video enqueued for upload
2. Upload starts
3. Upload fails (encryption error)
4. VLM analysis starts (wastes resources)
5. VLM analysis fails (video not found)
6. Confusing error state
```

### After Failure Sink

```
1. Video enqueued for upload
2. Upload starts
3. Upload fails (encryption error)
4. Job marked as failed in failure sink
5. VLM analysis worker checks failure sink
6. VLM analysis skipped (job already failed)
7. Clear error state with detailed reason
```

## Conclusion

The failure sink implementation provides a robust mechanism for tracking and preventing cascading failures in the Haven Player upload queue. It ensures efficient resource utilization and provides clear error tracking for better debugging and user experience.
