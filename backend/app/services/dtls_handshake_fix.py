"""
Enhanced DTLS handshake implementation to prevent infinite loops.

This module provides patched versions of aiortc's DTLS handshake methods
with timeout protection and detailed logging to prevent the infinite loop
issue that occurs with Ring WebRTC connections.
"""

import asyncio
import logging
import time
from typing import Optional

logger = logging.getLogger(__name__)

# Constants for handshake protection
HANDSHAKE_TIMEOUT = 30.0  # Absolute timeout for entire handshake
POLL_INTERVAL = 1.0  # Interval for polling handshake progress
MAX_WANT_READ_ERRORS = 50  # Maximum consecutive WantReadErrors before giving up


class DTLSHandshakeTimeout(Exception):
    """Raised when DTLS handshake exceeds maximum time limit."""
    pass


class DTLSHandshakeStuck(Exception):
    """Raised when DTLS handshake appears stuck in a loop."""
    pass


def classify_dtls_packet(data: bytes) -> str:
    """Classify a DTLS packet by content type and handshake type."""
    if not data:
        return "Empty"
    
    content_type = data[0]
    content_types = {
        20: "ChangeCipherSpec",
        21: "Alert", 
        22: "Handshake",
        23: "ApplicationData",
        25: "Heartbeat"
    }
    msg_type = content_types.get(content_type, f"Unknown({content_type})")
    
    # For handshake messages, get the handshake type
    if content_type == 22 and len(data) > 13:
        hs_type = data[13]
        hs_types = {
            0: "HelloRequest",
            1: "ClientHello",
            2: "ServerHello", 
            3: "HelloVerifyRequest",
            11: "Certificate",
            12: "ServerKeyExchange",
            13: "CertificateRequest",
            14: "ServerHelloDone",
            15: "CertificateVerify",
            16: "ClientKeyExchange",
            20: "Finished"
        }
        msg_type += f" [{hs_types.get(hs_type, f'HS({hs_type})')}]"
    
    return msg_type


async def logged_do_handshake(self, device_id: Optional[int] = None) -> None:
    """
    Enhanced DTLS handshake with timeout protection and detailed logging.
    
    This is a replacement for RTCDtlsTransport._do_handshake() that prevents
    infinite loops by adding:
    - Absolute timeout protection (30 seconds)
    - Maximum WantReadError limit
    - Detailed progress logging
    - Device ID tracking for debugging
    
    Args:
        device_id: Optional device ID for logging context
    """
    device_ctx = f"device_id={device_id} " if device_id else ""
    start_time = time.time()
    deadline = start_time + HANDSHAKE_TIMEOUT
    want_read_count = 0
    last_progress_time = start_time
    last_cipher = None
    
    logger.info(f"Starting enhanced DTLS handshake: {device_ctx}role={self._role}")
    
    try:
        while not self.encrypted:
            current_time = time.time()
            
            # Check absolute timeout
            if current_time >= deadline:
                elapsed = current_time - start_time
                logger.error(
                    f"DTLS handshake timeout after {elapsed:.1f}s: {device_ctx}role={self._role} "
                    f"state={self._state} encrypted={self.encrypted} want_read_errors={want_read_count}"
                )
                self.__log_debug("x DTLS handshake failed (timeout)")
                self._set_state(self.State.FAILED)
                raise DTLSHandshakeTimeout(
                    f"DTLS handshake timed out after {elapsed:.1f} seconds"
                )
            
            # Check for stuck state (no progress for too long)
            if current_time - last_progress_time > 10.0:
                elapsed = current_time - last_progress_time
                logger.warning(
                    f"DTLS handshake appears stuck: {device_ctx}role={self._role} "
                    f"no progress for {elapsed:.1f}s state={self._state} "
                    f"encrypted={self.encrypted} want_read_errors={want_read_count}"
                )
                # Don't fail immediately, but log warning
            
            try:
                # Log current SSL state before handshake attempt
                cipher_before = None
                try:
                    cipher_before = self._ssl.get_cipher_name()
                except Exception:
                    pass
                
                logger.debug(
                    f"DTLS handshake attempt: {device_ctx}role={self._role} "
                    f"state={self._state} cipher_before={cipher_before} "
                    f"want_read_errors={want_read_count} time_elapsed={current_time - start_time:.1f}s"
                )
                
                self._ssl.do_handshake()
                
                # Handshake progress made - reset counters
                want_read_count = 0
                last_progress_time = current_time
                
                # Log successful handshake step
                try:
                    cipher_after = self._ssl.get_cipher_name()
                    if cipher_after != cipher_before:
                        logger.info(
                            f"DTLS handshake progress: {device_ctx}role={self._role} "
                            f"cipher changed from {cipher_before} to {cipher_after}"
                        )
                        last_cipher = cipher_after
                except Exception:
                    pass
                
            except self.SSL.WantReadError:
                want_read_count += 1
                logger.debug(
                    f"DTLS handshake WantReadError #{want_read_count}: {device_ctx}role={self._role}"
                )
                
                # Check if we're stuck in WantReadError loop
                if want_read_count > MAX_WANT_READ_ERRORS:
                    elapsed = current_time - start_time
                    logger.error(
                        f"DTLS handshake stuck in WantReadError loop: {device_ctx}role={self._role} "
                        f"after {want_read_count} errors in {elapsed:.1f}s"
                    )
                    self.__log_debug("x DTLS handshake failed (stuck in WantReadError loop)")
                    self._set_state(self.State.FAILED)
                    raise DTLSHandshakeStuck(
                        f"DTLS handshake stuck after {want_read_count} WantReadErrors"
                    )
                
                await self._write_ssl()
                
                # Try to receive next packet with timeout
                packet_received = False
                try:
                    # Use shorter timeout to make progress visible
                    data = await asyncio.wait_for(self.transport._recv(), timeout=2.0)
                    packet_received = True
                    
                    # Log what we received
                    if data:
                        first_byte = data[0]
                        if first_byte > 19 and first_byte < 64:
                            # DTLS packet
                            msg_type = classify_dtls_packet(data)
                            logger.info(
                                f"DTLS handshake received: {device_ctx}role={self._role} "
                                f"type={msg_type} len={len(data)}"
                            )
                        elif first_byte > 127 and first_byte < 192:
                            # RTP/RTCP - ignore during handshake
                            logger.debug(
                                f"DTLS handshake received RTP/RTCP packet: {device_ctx}len={len(data)}"
                            )
                        else:
                            logger.warning(
                                f"DTLS handshake received unknown packet: {device_ctx}first_byte={first_byte} len={len(data)}"
                            )
                        
                        # Process the packet
                        self._ssl.bio_write(data)
                        last_progress_time = current_time
                        
                except asyncio.TimeoutError:
                    logger.debug(
                        f"DTLS handshake receive timeout: {device_ctx}role={self._role} "
                        f"no packet in 2.0s, continuing"
                    )
                except Exception as e:
                    logger.warning(
                        f"DTLS handshake receive error: {device_ctx}role={self._role} {e}"
                    )
                
                # If no packet received, check if we should try a retransmit
                if not packet_received and want_read_count % 10 == 0:
                    logger.info(
                        f"DTLS handshake checking timeout: {device_ctx}role={self._role} "
                        f"want_read_errors={want_read_count}"
                    )
                    timeout = self._ssl.DTLSv1_get_timeout()
                    if timeout is not None and timeout <= 0:
                        logger.info(
                            f"DTLS handshake forcing timeout: {device_ctx}role={self._role}"
                        )
                        self._ssl.DTLSv1_handle_timeout()
                        await self._write_ssl()
                        last_progress_time = current_time
                
            except self.SSL.Error as exc:
                elapsed = current_time - start_time
                logger.error(
                    f"DTLS handshake SSL error after {elapsed:.1f}s: {device_ctx}role={self._role} {exc}"
                )
                self.__log_debug("x DTLS handshake failed (SSL error %s)", exc)
                self._set_state(self.State.FAILED)
                return
                
        # Handshake completed successfully
        elapsed = time.time() - start_time
        final_cipher = None
        try:
            final_cipher = self._ssl.get_cipher_name()
        except Exception:
            pass
            
        logger.info(
            f"DTLS handshake completed successfully: {device_ctx}role={self._role} "
            f"elapsed={elapsed:.1f}s cipher={final_cipher}"
        )
        self.encrypted = True
        
    except DTLSHandshakeTimeout as e:
        logger.error(f"DTLS handshake fatal timeout: {device_ctx}{e}")
        raise
    except DTLSHandshakeStuck as e:
        logger.error(f"DTLS handshake fatal stuck state: {device_ctx}{e}")
        raise
    except ConnectionError:
        elapsed = time.time() - start_time
        logger.error(f"DTLS handshake connection error after {elapsed:.1f}s: {device_ctx}role={self._role}")
        self.__log_debug("x DTLS handshake failed (connection error)")
        self._set_state(self.State.FAILED)
        return
    except Exception as e:
        elapsed = time.time() - start_time
        logger.error(f"DTLS handshake unexpected error after {elapsed:.1f}s: {device_ctx}role={self._role} {e}")
        self.__log_debug("x DTLS handshake failed (unexpected error %s)", e)
        self._set_state(self.State.FAILED)
        return


async def enhanced_run(self) -> None:
    """
    Enhanced version of RTCDtlsTransport.__run() with handshake monitoring.
    
    This method monitors the DTLS connection state and provides additional
    logging and error handling for stuck handshakes.
    """
    handshake_monitor_task = None
    
    try:
        # Start handshake monitoring if we're still connecting
        if self._state == self.State.CONNECTING:
            handshake_monitor_task = asyncio.create_task(self._monitor_handshake_progress())
        
        # Continue with normal packet processing loop
        while True:
            await self._recv_next()
            
    except ConnectionError:
        for receiver in self._rtp_router.receivers:
            receiver._handle_disconnect()
    except Exception as exc:
        if not isinstance(exc, asyncio.CancelledError):
            self.__log_warning(traceback.format_exc())
        raise exc
    finally:
        # Cancel handshake monitor if running
        if handshake_monitor_task and not handshake_monitor_task.done():
            handshake_monitor_task.cancel()
            try:
                await handshake_monitor_task
            except asyncio.CancelledError:
                pass
        
        self._set_state(self.State.CLOSED)


async def _monitor_handshake_progress(self) -> None:
    """
    Monitor DTLS handshake progress and provide diagnostic logging.
    
    This task runs in parallel with the handshake to provide periodic
    status updates and detect stuck states.
    """
    import datetime
    
    device_id = getattr(self, '_device_id', None)
    device_ctx = f"device_id={device_id} " if device_id else ""
    start_time = time.time()
    poll_count = 0
    
    logger.info(f"Starting handshake monitor: {device_ctx}role={self._role}")
    
    while self._state == self.State.CONNECTING and not self.encrypted:
        poll_count += 1
        current_time = time.time()
        elapsed = current_time - start_time
        
        try:
            # Get current handshake diagnostics
            cipher = None
            try:
                cipher = self._ssl.get_cipher_name()
            except Exception:
                pass
                
            timeout = None
            try:
                timeout = self._ssl.DTLSv1_get_timeout()
            except Exception:
                pass
                
            want_read = None
            try:
                want_read = self._ssl.want_read()
            except Exception:
                pass
                
            want_write = None
            try:
                want_write = self._ssl.want_write()
            except Exception:
                pass
            
            # Log handshake status
            logger.info(
                f"DTLS handshake monitor poll {poll_count}: {device_ctx}role={self._role} "
                f"elapsed={elapsed:.1f}s state={self._state} encrypted={self.encrypted} "
                f"cipher={cipher} timeout={timeout} want_read={want_read} want_write={want_write}"
            )
            
            # Check for potential stuck state
            if elapsed > 15.0 and not cipher:
                logger.warning(
                    f"DTLS handshake taking unusually long: {device_ctx}role={self._role} "
                    f"{elapsed:.1f}s elapsed, no cipher negotiated yet"
                )
            
            # Wait for next poll interval
            await asyncio.sleep(POLL_INTERVAL)
            
        except asyncio.CancelledError:
            logger.info(f"Handshake monitor cancelled: {device_ctx}")
            break
        except Exception as e:
            logger.warning(f"Handshake monitor error: {device_ctx}{e}")
            await asyncio.sleep(POLL_INTERVAL)
    
    # Final status
    final_state = self._state
    final_encrypted = self.encrypted
    total_elapsed = time.time() - start_time
    
    if final_encrypted:
        logger.info(
            f"Handshake monitor completed successfully: {device_ctx}role={self._role} "
            f"elapsed={total_elapsed:.1f}s state={final_state} encrypted={final_encrypted}"
        )
    else:
        logger.warning(
            f"Handshake monitor ended without encryption: {device_ctx}role={self._role} "
            f"elapsed={total_elapsed:.1f}s state={final_state} encrypted={final_encrypted}"
        )


def set_device_id(dtls_transport, device_id: int) -> None:
    """Set device ID on a DTLS transport for enhanced logging."""
    if hasattr(dtls_transport, '_device_id'):
        dtls_transport._device_id = device_id


def apply_dtls_handshake_fix() -> bool:
    """
    Apply the enhanced DTLS handshake fix to aiortc.
    
    Returns True if patching was successful.
    """
    try:
        from aiortc import rtcdtlstransport
        
        # Store original methods
        original_do_handshake = rtcdtlstransport.RTCDtlsTransport._do_handshake
        original_run = rtcdtlstransport.RTCDtlsTransport.__run
        
        # Apply patches
        rtcdtlstransport.RTCDtlsTransport._do_handshake = logged_do_handshake
        rtcdtlstransport.RTCDtlsTransport.__run = enhanced_run
        rtcdtlstransport.RTCDtlsTransport._monitor_handshake_progress = _monitor_handshake_progress
        
        # Add helper attributes for tracking
        rtcdtlstransport.RTCDtlsTransport._device_id = None
        
        logger.info("Successfully applied enhanced DTLS handshake fix")
        return True
        
    except Exception as e:
        logger.error(f"Failed to apply DTLS handshake fix: {e}")
        return False


# Auto-apply fix if RING_DTLS_FIX=1 is set
if __name__ == "__main__":
    import os
    if os.environ.get("RING_DTLS_FIX", "").lower() in ("1", "true", "yes"):
        apply_dtls_handshake_fix()
