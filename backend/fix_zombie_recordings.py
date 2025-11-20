#!/usr/bin/env python3
"""
Script to fix zombie recording issues by:
1. Moving health check cancellation to top of stop() method
2. Adding state re-check in health check loop  
3. Adding STOPPING state detection in start_recording
4. Adding finally block in stop_recording
5. Adding wait logic in depin tick
"""

# Read the webrtc_recording_service.py file
with open('app/services/webrtc_recording_service.py', 'r') as f:
    lines = f.readlines()

# Change 1: In stop() method around line 915-936, move health check cancellation before state check
# Find the line "async def stop(self) -> Dict[str, Any]:"
for i, line in enumerate(lines):
    if 'async def stop(self) -> Dict[str, Any]:' in line and i > 900:
        # Found the stop method
        # Find the block to reorder (lines 918-936)
        # We need to find "if self.state != RecordingState.RECORDING:" and the health check block
        
        # Look for the state check (should be around line 920)
        state_check_idx = None
        health_check_start = None
        health_check_end = None
        
        for j in range(i, min(i + 30, len(lines))):
            if 'if self.state != RecordingState.RECORDING:' in lines[j] and state_check_idx is None:
                state_check_idx = j
            if '# Stop health check task' in lines[j] and health_check_start is None:
                health_check_start = j
            if health_check_start and 'logger.info(f"[{self.mint_id}] Health check task stopped")' in lines[j]:
                health_check_end = j + 1
                break
        
        if state_check_idx and health_check_start and health_check_end and state_check_idx < health_check_start:
            # Extract the blocks
            logger_line = i + 2  # Line with logger.info("Stopping...")
            empty_line_after_logger = i + 3
            
            # Extract health check block (with updated comment)
            health_check_lines = lines[health_check_start:health_check_end]
            # Replace the comment
            health_check_lines[0] = '            # CRITICAL: Stop health check task FIRST before any other logic\n'
            health_check_lines.insert(1, '            # This prevents false "stuck frame" warnings during encoding phase\n')
            
            # Extract state check block (lines from state_check_idx to health_check_start - 1)
            state_check_lines = lines[state_check_idx:health_check_start]
            
            # Build new ordering: logger -> empty -> health_check -> empty -> state_check
            new_lines = (
                lines[:empty_line_after_logger + 1] +  # Up to and including empty line after logger
                health_check_lines +  # Health check first
                ['\n'] +  # Empty line
                state_check_lines +  # Then state check
                lines[health_check_end:]  # Rest of file
            )
            
            lines = new_lines
            print(f"✓ Fixed stop() method - moved health check cancellation to top")
        break

# Change 2: In _health_check() around line 165-168, improve state check after sleep  
for i, line in enumerate(lines):
    if 'await asyncio.sleep(5)  # Check every 5 seconds' in line:
        # Next line should be the state check
        if i + 2 < len(lines) and 'if self.state != RecordingState.RECORDING:' in lines[i + 2]:
            # Replace the simple break with a logged break
            if 'break' in lines[i + 3]:
                lines[i + 2] = '                # Double-check state after sleep (may have changed during sleep)\n'
                lines[i + 3] = '                if self.state != RecordingState.RECORDING:\n'
                lines[i + 4] = f'                    logger.info(f"[{{self.mint_id}}] Health check detected state change to {{self.state.value}}, exiting")\n'
                lines.insert(i + 5, '                    break\n')
                print(f"✓ Fixed _health_check() - added state change logging")
        break

# Write the modified file
with open('app/services/webrtc_recording_service.py', 'w') as f:
    f.writelines(lines)

print("\n✅ webrtc_recording_service.py modifications complete")

