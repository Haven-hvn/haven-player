"""
aiortc-based recorder for Ring live view sessions.

Establishes a WebRTC connection, records segmented media files, and invokes
callbacks when segments complete.

REFERENCE IMPLEMENTATION: open-ring/app/OpenRingPackage/Sources/RingClient/LiveViewSession.swift
"""

from __future__ import annotations

import asyncio
from dataclasses import dataclass
from datetime import datetime, timezone
import inspect
import time
import logging
from pathlib import Path
from typing import Awaitable, Callable, Optional, Protocol

from app.services.openring_service import OpenRingService, IceServer

logger = logging.getLogger(__name__)

# Enable aiortc debug logging if AIORTC_DEBUG=1 is set
import os
if os.environ.get("AIORTC_DEBUG", "").lower() in ("1", "true", "yes"):
    logging.getLogger("aiortc").setLevel(logging.DEBUG)
    logging.getLogger("aioice").setLevel(logging.DEBUG)
    logger.info("aiortc/aioice debug logging enabled")

# Apply DTLS handshake fix if RING_DTLS_FIX=1 is set
if os.environ.get("RING_DTLS_FIX", "").lower() in ("1", "true", "yes"):
    try:
        from .dtls_handshake_fix import apply_dtls_handshake_fix
        if apply_dtls_handshake_fix():
            logger.info("DTLS handshake fix applied successfully")
        else:
            logger.warning("Failed to apply DTLS handshake fix")
    except Exception as e:
        logger.warning(f"Could not apply DTLS handshake fix: {e}")


def log_dtls_cipher_info() -> None:
    """Log available DTLS cipher suites and SRTP profiles for diagnostics."""
    try:
        from OpenSSL import SSL, crypto
        import ssl
        
        # Log OpenSSL version
        logger.info("OpenSSL version: %s", ssl.OPENSSL_VERSION)
        
        # Create a test DTLS context to check available ciphers
        ctx = SSL.Context(SSL.DTLS_METHOD)
        
        # aiortc's default cipher list
        aiortc_ciphers = b"ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-ECDSA-CHACHA20-POLY1305:ECDHE-ECDSA-AES128-SHA:ECDHE-ECDSA-AES256-SHA"
        
        # Extended cipher list including RSA variants (Ring might need these)
        extended_ciphers = (
            b"ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-ECDSA-CHACHA20-POLY1305:"
            b"ECDHE-ECDSA-AES128-SHA:ECDHE-ECDSA-AES256-SHA:"
            b"ECDHE-RSA-AES128-GCM-SHA256:ECDHE-RSA-AES256-GCM-SHA384:"
            b"ECDHE-RSA-AES128-SHA:ECDHE-RSA-AES256-SHA:"
            b"AES128-GCM-SHA256:AES256-GCM-SHA384"
        )
        
        logger.info("aiortc default DTLS ciphers: %s", aiortc_ciphers.decode())
        
        # Check which ciphers are actually available
        try:
            ctx.set_cipher_list(aiortc_ciphers)
            logger.info("aiortc ciphers are available in this OpenSSL build")
        except SSL.Error as e:
            logger.warning("Some aiortc ciphers may not be available: %s", e)
        
    except Exception as e:
        logger.debug("Could not log DTLS cipher info: %s", e)


def get_dtls_transport_diagnostics(dtls_transport: object) -> dict[str, object]:
    """Extract detailed diagnostics from a DTLS transport."""
    diagnostics: dict[str, object] = {}
    
    try:
        diagnostics["state"] = getattr(dtls_transport, "state", "unknown")
        diagnostics["role"] = getattr(dtls_transport, "_role", "unknown")
        diagnostics["encrypted"] = getattr(dtls_transport, "encrypted", False)
        
        ssl_conn = getattr(dtls_transport, "_ssl", None)
        if ssl_conn:
            try:
                # Get negotiated cipher
                cipher = ssl_conn.get_cipher_name()
                diagnostics["negotiated_cipher"] = cipher
            except Exception:
                diagnostics["negotiated_cipher"] = "not_negotiated_yet"
            
            try:
                # Get cipher list
                cipher_list = ssl_conn.get_cipher_list()
                diagnostics["available_ciphers"] = cipher_list[:5] if cipher_list else []
            except Exception:
                pass
            
            try:
                # Get SRTP profile
                srtp_profile = ssl_conn.get_selected_srtp_profile()
                diagnostics["srtp_profile"] = srtp_profile.decode() if srtp_profile else None
            except Exception:
                diagnostics["srtp_profile"] = "not_negotiated_yet"
            
            try:
                # Get peer certificate info
                peer_cert = ssl_conn.get_peer_certificate()
                if peer_cert:
                    diagnostics["peer_cert_subject"] = str(peer_cert.get_subject())
                    diagnostics["peer_cert_issuer"] = str(peer_cert.get_issuer())
            except Exception:
                pass
            
            try:
                # Get DTLS-specific info
                timeout = ssl_conn.DTLSv1_get_timeout()
                diagnostics["dtls_timeout"] = timeout
            except Exception:
                pass
            
            try:
                # Check if there's pending data
                diagnostics["want_read"] = ssl_conn.want_read()
                diagnostics["want_write"] = ssl_conn.want_write()
            except Exception:
                pass
                
    except Exception as e:
        diagnostics["error"] = str(e)
    
    return diagnostics


def patch_aiortc_dtls_logging() -> bool:
    """
    Patch aiortc's DTLS transport to add detailed packet logging.
    This helps debug DTLS handshake issues by showing what's being sent/received.
    """
    try:
        from aiortc import rtcdtlstransport
        import asyncio
        
        # Store original methods
        original_write_ssl = rtcdtlstransport.RTCDtlsTransport._write_ssl
        original_recv_next = rtcdtlstransport.RTCDtlsTransport._recv_next
        
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
        
        async def logged_write_ssl(self):
            """Log outgoing DTLS data."""
            try:
                data = self._ssl.bio_read(1500)
            except Exception:
                data = b""
            
            if data:
                msg_type = classify_dtls_packet(data)
                logger.info(
                    "DTLS SEND: role=%s type=%s len=%d",
                    self._role, msg_type, len(data)
                )
                
                await self.transport._send(data)
                self._RTCDtlsTransport__tx_bytes += len(data)
                self._RTCDtlsTransport__tx_packets += 1
        
        async def logged_recv_next(self):
            """Log incoming packets to see what we're receiving."""
            # Get timeout
            timeout = None
            if not self.encrypted:
                timeout = self._ssl.DTLSv1_get_timeout()
            
            # Receive next datagram with logging
            try:
                if timeout is not None:
                    try:
                        data = await asyncio.wait_for(self.transport._recv(), timeout=timeout)
                    except asyncio.TimeoutError:
                        logger.debug("DTLS RECV: timeout (%.2fs), handling retransmit", timeout)
                        self._ssl.DTLSv1_handle_timeout()
                        await self._write_ssl()
                        return
                else:
                    # Log that we're waiting (only occasionally to avoid spam)
                    data = await self.transport._recv()
                
                # Log what we received
                first_byte = data[0] if data else 0
                if first_byte > 19 and first_byte < 64:
                    # DTLS packet
                    msg_type = classify_dtls_packet(data)
                    logger.info(
                        "DTLS RECV: role=%s type=%s len=%d encrypted=%s",
                        self._role, msg_type, len(data), self.encrypted
                    )
                elif first_byte > 127 and first_byte < 192:
                    # RTP/RTCP packet - log summary only
                    logger.debug("DTLS RECV: RTP/RTCP packet len=%d", len(data))
                else:
                    logger.info(
                        "DTLS RECV: Unknown packet first_byte=%d len=%d",
                        first_byte, len(data)
                    )
                
                # Process the packet (copied from original _recv_next)
                self._RTCDtlsTransport__rx_bytes += len(data)
                self._RTCDtlsTransport__rx_packets += 1
                
                if first_byte > 19 and first_byte < 64:
                    # DTLS
                    self._ssl.bio_write(data)
                    try:
                        decrypted = self._ssl.recv(1500)
                    except rtcdtlstransport.SSL.ZeroReturnError:
                        decrypted = None
                    except rtcdtlstransport.SSL.Error as e:
                        logger.warning("DTLS SSL.Error during recv: %s", e)
                        decrypted = b""
                    await self._write_ssl()
                    if decrypted is None:
                        logger.info("DTLS shutdown by remote party")
                        raise ConnectionError
                    elif decrypted and self._data_receiver:
                        await self._data_receiver._handle_data(decrypted)
                elif first_byte > 127 and first_byte < 192 and self._rx_srtp:
                    # SRTP / SRTCP
                    from aiortc import clock
                    from aiortc.rtp import is_rtcp
                    import pylibsrtp
                    arrival_time_ms = clock.current_ms()
                    try:
                        if is_rtcp(data):
                            data = self._rx_srtp.unprotect_rtcp(data)
                            await self._handle_rtcp_data(data)
                        else:
                            data = self._rx_srtp.unprotect(data)
                            await self._handle_rtp_data(data, arrival_time_ms=arrival_time_ms)
                    except pylibsrtp.Error as exc:
                        logger.debug("SRTP unprotect failed: %s", exc)
                        
            except Exception as e:
                logger.warning("DTLS RECV error: %s", e)
                raise
        
        # Apply patches
        rtcdtlstransport.RTCDtlsTransport._write_ssl = logged_write_ssl
        rtcdtlstransport.RTCDtlsTransport._recv_next = logged_recv_next
        logger.info("Patched aiortc DTLS transport for detailed packet logging (send + recv)")
        return True
        
    except Exception as e:
        logger.warning("Failed to patch aiortc DTLS logging: %s", e)
        return False


# Optionally enable DTLS packet logging if RING_DTLS_DEBUG=1
if os.environ.get("RING_DTLS_DEBUG", "").lower() in ("1", "true", "yes"):
    patch_aiortc_dtls_logging()


# Log cipher info at module load time
log_dtls_cipher_info()


def patch_aiortc_cipher_list() -> bool:
    """
    Patch aiortc to use extended cipher list including RSA variants.
    
    aiortc by default only supports ECDHE-ECDSA ciphers, which require
    an ECDSA certificate. Some servers (possibly Ring) may only support
    RSA-based ciphers.
    
    This patch extends the cipher list to include both ECDSA and RSA variants.
    
    Returns True if patching was successful.
    """
    try:
        from aiortc import rtcdtlstransport
        from OpenSSL import SSL
        
        # Store original method
        original_create_ssl_context = rtcdtlstransport.RTCCertificate._create_ssl_context
        
        def patched_create_ssl_context(self, srtp_profiles):
            ctx = SSL.Context(SSL.DTLS_METHOD)
            ctx.set_verify(
                SSL.VERIFY_PEER | SSL.VERIFY_FAIL_IF_NO_PEER_CERT, lambda *args: True
            )
            ctx.use_certificate(self._cert)
            ctx.use_privatekey(self._key)
            
            # Extended cipher list including RSA variants
            # This is broader than aiortc's default ECDSA-only list
            extended_ciphers = (
                b"ECDHE-ECDSA-AES128-GCM-SHA256:"
                b"ECDHE-ECDSA-CHACHA20-POLY1305:"
                b"ECDHE-ECDSA-AES128-SHA:"
                b"ECDHE-ECDSA-AES256-SHA:"
                b"ECDHE-RSA-AES128-GCM-SHA256:"
                b"ECDHE-RSA-AES256-GCM-SHA384:"
                b"ECDHE-RSA-CHACHA20-POLY1305:"
                b"ECDHE-RSA-AES128-SHA:"
                b"ECDHE-RSA-AES256-SHA:"
                b"AES128-GCM-SHA256:"
                b"AES256-GCM-SHA384:"
                b"AES128-SHA:"
                b"AES256-SHA"
            )
            
            try:
                ctx.set_cipher_list(extended_ciphers)
                logger.info("Using extended DTLS cipher list (includes RSA variants)")
            except SSL.Error:
                # Fall back to original if extended list fails
                ctx.set_cipher_list(
                    b"ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-ECDSA-CHACHA20-POLY1305:"
                    b"ECDHE-ECDSA-AES128-SHA:ECDHE-ECDSA-AES256-SHA"
                )
                logger.warning("Extended cipher list failed, using original aiortc ciphers")
            
            ctx.set_tlsext_use_srtp(b":".join(x.openssl_profile for x in srtp_profiles))
            return ctx
        
        # Apply patch
        rtcdtlstransport.RTCCertificate._create_ssl_context = patched_create_ssl_context
        logger.info("Successfully patched aiortc to use extended DTLS cipher list")
        return True
        
    except Exception as e:
        logger.warning("Failed to patch aiortc cipher list: %s", e)
        return False


def patch_aiortc_rsa_certificate() -> bool:
    """
    Patch aiortc to generate RSA certificates instead of ECDSA.
    
    aiortc by default generates ECDSA certificates (SECP256R1), but some servers
    may only accept RSA certificates for DTLS handshake.
    
    Returns True if patching was successful.
    """
    try:
        from aiortc import rtcdtlstransport
        from cryptography.hazmat.primitives.asymmetric import rsa
        from cryptography.hazmat.backends import default_backend
        from cryptography import x509
        from cryptography.hazmat.primitives import hashes
        import datetime
        import binascii
        
        def generate_rsa_certificate(key):
            """Generate certificate for RSA key."""
            name = x509.Name([
                x509.NameAttribute(
                    x509.NameOID.COMMON_NAME,
                    binascii.hexlify(os.urandom(16)).decode("ascii"),
                )
            ])
            now = datetime.datetime.now(tz=datetime.timezone.utc)
            builder = (
                x509.CertificateBuilder()
                .subject_name(name)
                .issuer_name(name)
                .public_key(key.public_key())
                .serial_number(x509.random_serial_number())
                .not_valid_before(now - datetime.timedelta(days=1))
                .not_valid_after(now + datetime.timedelta(days=30))
            )
            return builder.sign(key, hashes.SHA256(), default_backend())
        
        # Store original method
        original_generate = rtcdtlstransport.RTCCertificate.generateCertificate
        
        @classmethod
        def patched_generate_certificate(cls):
            """Generate RSA certificate instead of ECDSA."""
            # Generate 2048-bit RSA key
            key = rsa.generate_private_key(
                public_exponent=65537,
                key_size=2048,
                backend=default_backend()
            )
            cert = generate_rsa_certificate(key)
            logger.info("Generated RSA certificate for DTLS (instead of ECDSA)")
            return cls(key=key, cert=cert)
        
        # Apply patch
        rtcdtlstransport.RTCCertificate.generateCertificate = patched_generate_certificate
        logger.info("Successfully patched aiortc to use RSA certificates")
        return True
        
    except Exception as e:
        logger.warning("Failed to patch aiortc for RSA certificates: %s", e)
        return False


# Optionally patch aiortc cipher list if RING_EXTENDED_CIPHERS=1
if os.environ.get("RING_EXTENDED_CIPHERS", "").lower() in ("1", "true", "yes"):
    patch_aiortc_cipher_list()

# Optionally use RSA certificates if RING_RSA_CERT=1
if os.environ.get("RING_RSA_CERT", "").lower() in ("1", "true", "yes"):
    patch_aiortc_rsa_certificate()


class OpenRingRecorderDependencyError(RuntimeError):
    """Raised when aiortc dependencies are missing."""


class MediaStreamTrackProtocol(Protocol):
    kind: str


class SessionDescriptionProtocol(Protocol):
    sdp: str
    type: str


class MediaRecorderProtocol(Protocol):
    def addTrack(self, track: MediaStreamTrackProtocol) -> None: ...

    def start(self) -> Awaitable[None] | None: ...

    def stop(self) -> Awaitable[None] | None: ...


class MediaRelayProtocol(Protocol):
    def subscribe(
        self, track: MediaStreamTrackProtocol, buffered: bool = True
    ) -> MediaStreamTrackProtocol: ...


class PeerConnectionProtocol(Protocol):
    def addTransceiver(self, kind: str, direction: str) -> None: ...

    def on(
        self, event: str
    ) -> Callable[[Callable[[MediaStreamTrackProtocol], None]], Callable[[MediaStreamTrackProtocol], None]]: ...

    def createOffer(self) -> Awaitable[SessionDescriptionProtocol] | SessionDescriptionProtocol: ...

    def setLocalDescription(
        self, description: SessionDescriptionProtocol
    ) -> Awaitable[None] | None: ...

    def setRemoteDescription(
        self, description: SessionDescriptionProtocol
    ) -> Awaitable[None] | None: ...

    @property
    def localDescription(self) -> SessionDescriptionProtocol | None: ...

    @property
    def iceGatheringState(self) -> str: ...

    @property
    def connectionState(self) -> str: ...

    @property
    def iceConnectionState(self) -> str: ...

    def close(self) -> Awaitable[None] | None: ...


SessionDescriptionFactory = Callable[[str, str], SessionDescriptionProtocol]
PeerConnectionFactory = Callable[[Optional[object]], PeerConnectionProtocol]
MediaRecorderFactory = Callable[[str], MediaRecorderProtocol]
MediaRelayFactory = Callable[[], MediaRelayProtocol]
SegmentCallback = Callable[[Path], Awaitable[None] | None]


@dataclass(frozen=True)
class RecorderSegment:
    path: Path
    started_at: datetime


class DiagnosticTrackWrapper:
    """Wrapper that logs frame reception for debugging."""
    
    def __init__(
        self,
        track: MediaStreamTrackProtocol,
        device_id: int,
        session_id: str,
    ):
        self._track = track
        self._device_id = device_id
        self._session_id = session_id
        self._frame_count = 0
        self._first_frame_logged = False
    
    @property
    def kind(self) -> str:
        return self._track.kind
    
    @property
    def readyState(self) -> str:
        return getattr(self._track, 'readyState', 'unknown')
    
    @property
    def id(self) -> str:
        return getattr(self._track, 'id', 'unknown')
    
    async def recv(self) -> object:
        """Receive a frame and log it for debugging."""
        frame = await self._track.recv()  # type: ignore[attr-defined]
        self._frame_count += 1
        if not self._first_frame_logged:
            self._first_frame_logged = True
            logger.info(
                "First frame received: device_id=%s session_id=%s track_kind=%s frame_type=%s",
                self._device_id, self._session_id, self.kind, type(frame).__name__
            )
        elif self._frame_count % 100 == 0:
            logger.debug(
                "Frame progress: device_id=%s session_id=%s track_kind=%s frame_count=%s",
                self._device_id, self._session_id, self.kind, self._frame_count
            )
        return frame


class OpenRingAiortcRecorder:
    """Record Ring live view sessions into fixed-length segments.

    REFERENCE IMPLEMENTATION: open-ring/app/OpenRingPackage/Sources/RingClient/LiveViewSession.swift
    
    KEY DEVIATIONS FROM WORKING SWIFT IMPLEMENTATION:
    1. Uses aiortc instead of libwebrtc (different underlying library)
    2. Python async/await vs Swift async concurrency model
    3. aiortc API has different surface area than libwebrtc
    """

    def __init__(
        self,
        service: OpenRingService,
        device_id: int,
        session_id: str,
        output_dir: Path,
        segment_duration: float,
        on_segment_complete: Optional[SegmentCallback] = None,
        peer_connection_factory: Optional[PeerConnectionFactory] = None,
        session_description_factory: Optional[SessionDescriptionFactory] = None,
        media_recorder_factory: Optional[MediaRecorderFactory] = None,
        media_relay_factory: Optional[MediaRelayFactory] = None,
        track_wait_timeout: float = 15.0,
        ice_gathering_timeout: float = 5.0,
        time_provider: Optional[Callable[[], float]] = None,
    ):
        if segment_duration <= 0:
            raise ValueError("segment_duration must be positive")
        self._service = service
        self._device_id = device_id
        self._session_id = session_id
        self._output_dir = output_dir
        self._segment_duration = segment_duration
        self._on_segment_complete = on_segment_complete
        self._track_wait_timeout = track_wait_timeout
        self._ice_gathering_timeout = ice_gathering_timeout
        self._time_provider = time_provider or time.time

        self._peer_connection_factory = peer_connection_factory or _load_peer_connection_factory()
        self._session_description_factory = (
            session_description_factory or _load_session_description_factory()
        )
        self._media_recorder_factory = media_recorder_factory or _load_media_recorder_factory()
        self._media_relay_factory = media_relay_factory or _load_media_relay_factory()

        self._peer_connection: Optional[PeerConnectionProtocol] = None
        self._media_relay: Optional[MediaRelayProtocol] = None
        self._segment_task: Optional[asyncio.Task[None]] = None
        self._stop_event = asyncio.Event()
        self._track_ready = asyncio.Event()
        self._connection_ready = asyncio.Event()
        self._remote_tracks: list[MediaStreamTrackProtocol] = []
        self._segment_index = 0
        self._running = False
        self._connection_timeout = 30.0

    @property
    def is_running(self) -> bool:
        return self._running

    async def start(self) -> None:
        """Start the live view session.
        
        REFERENCE: LiveViewSession.swift:start() async throws
        
        Workflow:
        1. Create peer connection with STUN servers (like Swift)
        2. Generate local offer
        3. Send offer to Ring API via start_live_view
        4. Set Ring's answer as remote description
        5. Activate camera (parallel with step 4, like Swift)
        6. Wait for tracks and start recording
        
        KEY DIFFERENCE: Swift uses libwebrtc which handles DTLS internally,
        whereas aiortc's DTLS implementation may need workarounds.
        """
        if self._running:
            raise RuntimeError("Recorder already running")

        logger.info(
            "Starting OpenRing recorder: device_id=%s session_id=%s output_dir=%s segment_duration=%s",
            self._device_id,
            self._session_id,
            self._output_dir,
            self._segment_duration,
        )
        self._output_dir.mkdir(parents=True, exist_ok=True)
        self._media_relay = self._media_relay_factory()
        
        # Use STUN servers like the working Swift implementation
        # Ring's working implementation uses: stun:stun.l.google.com:19302 and stun:stun.ring.com:3478
        stun_servers = [
            IceServer(urls=["stun:stun.l.google.com:19302"]),
            IceServer(urls=["stun:stun.ring.com:3478"]),
        ]
        rtc_config = _build_rtc_configuration(stun_servers)
        if rtc_config:
            logger.info(
                "Creating peer connection with STUN servers: device_id=%s",
                self._device_id
            )
            self._peer_connection = self._peer_connection_factory(rtc_config)
        else:
            logger.warning(
                "Creating peer connection WITHOUT STUN servers (may fail): device_id=%s",
                self._device_id
            )
            self._peer_connection = self._peer_connection_factory(None)
        
        self._peer_connection.on("track")(self._handle_track)
        self._peer_connection.on("connectionstatechange")(self._handle_connection_state_change)
        self._peer_connection.on("iceconnectionstatechange")(self._handle_ice_connection_state_change)
        self._peer_connection.on("signalingstatechange")(self._handle_signaling_state_change)
        
        # KEY IMPORTANT CONFIGURATION:
        # Ring requires bidirectional audio negotiation for DTLS to complete properly?
        # Swift implementation adds audio transceiver with direction: sendrecv
        # Swift: audioSource + localAudioTrack + transceiver init with sendrecv + streamIds
        self._peer_connection.addTransceiver("audio", direction="sendrecv")  # MATCHES SWIFT
        self._peer_connection.addTransceiver("video", direction="recvonly")  # MATCHES SWIFT
        logger.info("Added transceivers: device_id=%s audio=sendrecv video=recvonly (matches Swift)", self._device_id)

        offer = await _maybe_await(self._peer_connection.createOffer())
        await _maybe_await(self._peer_connection.setLocalDescription(offer))
        
        # Wait for ICE gathering (matches Swift waitForIceGathering with 2s timeout + early exit)
        await _wait_for_ice_gathering_complete(self._peer_connection, self._ice_gathering_timeout)
        
        local_description = self._peer_connection.localDescription
        offer_sdp = local_description.sdp if local_description else offer.sdp
        
        # Log our offer SDP for comparison with working Swift implementation
        logger.info(
            "Local SDP: device_id=%s fingerprints=%s setup=%s",
            self._device_id,
            [l.strip() for l in offer_sdp.split('\n') if 'fingerprint' in l.lower()],
            [l.strip() for l in offer_sdp.split('\n') if 'a=setup:' in l.lower()]
        )

        # REFERENCE: Swift calls startLiveView(offerSdp:)
        logger.debug("Sending offer to Ring API: device_id=%s", self._device_id)
        response = await self._service.start_live_view(
            device_id=self._device_id,
            session_id=self._session_id,
            offer_sdp=offer_sdp,
        )
        
        # Log Ring's answer SDP for comparison
        remote_sdp = response.answer_sdp
        if remote_sdp:
            answer_lines = remote_sdp.split('\n')
            logger.info(
                "Ring SDP: device_id=%s fingerprints=%s setup=%s has_video=%s candidate_count=%s",
                self._device_id,
                [l.strip() for l in answer_lines if 'fingerprint' in l.lower()],
                [l.strip() for l in answer_lines if 'a=setup:' in l.lower()],
                any('m=video' in l for l in answer_lines),
                sum(1 for l in answer_lines if 'a=candidate' in l)
            )

        # KEY DECISION POINT: How to handle DTLS setup negotiation
        #
        # Swift/libwebrtc handles this automatically correctly.
        # aiortc may need special handling.
        #
        # ENVIRONMENT VARIABLES FOR TESTING:
        # - RING_DTLS_STRATEGY=no_patch (default): Trust Ring's SDP as-is (matches Swift)
        # - RING_DTLS_STRATEGY=force_client: Force ourselves to be DTLS client
        # - RING_DTLS_STRATEGY=force_server: Force Ring to be DTLS client
        #
        dtls_strategy = os.environ.get("RING_DTLS_STRATEGY", "no_patch")
        
        if dtls_strategy == "no_patch":
            # Trust Ring's SDP as-is - matches Swift implementation
            logger.info("DTLS Strategy: no_patch - Using Ring's SDP as-is (matches Swift working implementation)")
            answer_sdp_to_use = remote_sdp
        elif dtls_strategy == "force_client":
            # We will be client, Ring should be server
            answer_sdp_to_use = remote_sdp.replace("a=setup:active", "a=setup:passive") if remote_sdp else remote_sdp
            answer_sdp_to_use = answer_sdp_to_use.replace("a=setup:actpass", "a=setup:active") if answer_sdp_to_use else answer_sdp_to_use
            logger.info("DTLS Strategy: force_client - We will send ClientHello, Ring should respond")
        elif dtls_strategy == "force_server":
            # Explicitly set setup:passive in our offer (we are server)
            offer_sdp = offer_sdp.replace("a=setup:actpass", "a=setup:passive")
            answer_sdp_to_use = remote_sdp
            logger.info("DTLS Strategy: force_server - Ring must send ClientHello, we respond")
        else:
            logger.warning("Unknown DTLS strategy: %s, using no_patch", dtls_strategy)
            answer_sdp_to_use = remote_sdp

        remote_description = self._session_description_factory(answer_sdp_to_use, "answer")
        
        # REFERENCE: Swift runs setRemoteDescription and activateCamera in parallel
        logger.info("Setting remote description and activating camera in parallel: device_id=%s (matches Swift)", self._device_id)
        async def set_remote_desc() -> None:
            await _maybe_await(self._peer_connection.setRemoteDescription(remote_description))
            signaling_state = getattr(self._peer_connection, 'signalingState', 'unknown')
            logger.info("After setRemoteDescription: device_id=%s signaling_state=%s", self._device_id, signaling_state)
        
        async def activate_cam() -> None:
            try:
                await self._service.activate_camera(self._session_id)
                logger.info("Camera activated successfully: device_id=%s", self._device_id)
            except Exception as e:
                logger.warning("Failed to activate camera: device_id=%s error=%s", self._device_id, e)
                # Don't re-raise - camera activation failure might not be critical
        
        # Execute both in parallel (matches Swift's async let activationTask = activateCamera())
        await asyncio.gather(set_remote_desc(), activate_cam())
        
        # Wait for signaling state to become stable
        try:
            await asyncio.wait_for(
                _wait_for_signaling_stable(self._peer_connection),
                timeout=10.0
            )
        except asyncio.TimeoutError:
            logger.warning("Signaling state did not become stable within timeout")

        # KEY DEVIL IN THE DETAILS:
        # Swift/libwebrtc automatically does DTLS handshake in background after setRemoteDescription.
        # aiortc's _connect() is supposed to do this, but may have timing issues.
        #
        # Check if DTLS transport is working properly
        await self._check_webrtc_connection_state()
        
        logger.info("Live view session established for device_id=%s session_id=%s (matching Swift workflow)", 
                   self._device_id, self._session_id)

        # Start segment recording loop
        self._segment_task = asyncio.create_task(self._segment_loop())
        self._running = True

    async def stop(self) -> None:
        """Stop the session.
        
        REFERENCE: LiveViewSession.swift:stop() async
        """
        if not self._running:
            return
        logger.info("Stopping OpenRing recorder: device_id=%s session_id=%s segments_created=%s", 
                   self._device_id, self._session_id, self._segment_index)
        self._stop_event.set()
        if self._segment_task:
            await self._segment_task
        if self._peer_connection:
            await _maybe_await(self._peer_connection.close())
        try:
            await self._service.end_live_view(self._session_id)
        except Exception as e:
            logger.warning("Failed to end live view session: %s", e)
        self._running = False
        logger.info("OpenRing recorder stopped: device_id=%s", self._device_id)

    def _handle_track(self, track: MediaStreamTrackProtocol) -> None:
        """Handle incoming remote tracks.
        
        REFERENCE: PeerConnectionDelegate:peerConnection(_:didAdd:)
        """
        # Log track state details for debugging
        track_state = getattr(track, 'readyState', 'unknown')
        track_id = getattr(track, 'id', 'unknown')
        logger.info(
            "Received remote track: device_id=%s session_id=%s track_kind=%s track_id=%s "
            "track_state=%s total_tracks=%s",
            self._device_id, self._session_id, track.kind, track_id,
            track_state, len(self._remote_tracks) + 1
        )
        self._remote_tracks.append(track)
        self._track_ready.set()

    def _handle_connection_state_change(self, *args: object) -> None:
        """Handle WebRTC connection state changes."""
        state = getattr(self._peer_connection, 'connectionState', 'unknown')
        logger.info(
            "WebRTC connection state changed: device_id=%s session_id=%s state=%s",
            self._device_id, self._session_id, state
        )
        if state == "connected":
            self._connection_ready.set()
        elif state in ("failed", "closed", "disconnected"):
            logger.warning(
                "WebRTC connection lost: device_id=%s session_id=%s state=%s",
                self._device_id, self._session_id, state
            )

    def _handle_ice_connection_state_change(self, *args: object) -> None:
        """Handle ICE connection state changes."""
        state = getattr(self._peer_connection, 'iceConnectionState', 'unknown')
        logger.info(
            "ICE connection state changed: device_id=%s session_id=%s state=%s",
            self._device_id, self._session_id, state
        )
        # Also trigger connection ready on ICE connected (backup for connectionState)
        if state == "connected" or state == "completed":
            self._connection_ready.set()

    def _handle_signaling_state_change(self, *args: object) -> None:
        """Handle signaling state changes."""
        state = getattr(self._peer_connection, 'signalingState', 'unknown')
        logger.info(
            "Signaling state changed: device_id=%s session_id=%s state=%s",
            self._device_id, self._session_id, state
        )

    async def _check_webrtc_connection_state(self) -> None:
        """Check if WebRTC connection is established properly.
        
        This is a crucial step - we need DTLS to complete for media to flow.
        aiortc may have different behavior than libwebrtc used in Swift.
        """
        # Wait for connection to establish (ICE + DTLS)
        try:
            await asyncio.wait_for(
                _wait_for_connection_established(self._peer_connection),
                timeout=self._connection_timeout
            )
            logger.info(
                "WebRTC connection established: device_id=%s session_id=%s",
                self._device_id, self._session_id
            )
        except asyncio.TimeoutError:
            conn_state = getattr(self._peer_connection, 'connectionState', 'unknown')
            ice_state = getattr(self._peer_connection, 'iceConnectionState', 'unknown')
            logger.warning(
                "WebRTC connection did not fully establish: device_id=%s conn=%s ice=%s",
                self._device_id, conn_state, ice_state
            )
            # Continue anyway - sometimes media flows even if state isn't "connected"

    async def _segment_loop(self) -> None:
        """Main loop for recording segments."""
        logger.info("Segment loop starting: device_id=%s session_id=%s waiting_for_tracks timeout=%s",
                   self._device_id, self._session_id, self._track_wait_timeout)
        
        try:
            await asyncio.wait_for(self._track_ready.wait(), timeout=self._track_wait_timeout)
            logger.info("Tracks received: device_id=%s session_id=%s track_count=%s",
                       self._device_id, self._session_id, len(self._remote_tracks))
        except asyncio.TimeoutError:
            logger.error("Timed out waiting for remote tracks: device_id=%s session_id=%s timeout=%s",
                        self._device_id, self._session_id, self._track_wait_timeout)
            return
        
        # Log track details for debugging
        for track in self._remote_tracks:
            track_state = getattr(track, 'readyState', 'unknown')
            track_id = getattr(track, 'id', 'unknown')
            track_enabled = getattr(track, 'enabled', 'unknown')
            logger.info(
                "Track details: device_id=%s track_kind=%s track_id=%s state=%s enabled=%s",
                self._device_id, track.kind, track_id, track_state, track_enabled
            )
        
        # Probe for frames before starting recording (detect if no media flowing)
        probe_success = await self._probe_for_frames()
        if not probe_success:
            logger.warning(
                "Frame probe failed - media may not be flowing: device_id=%s session_id=%s",
                self._device_id, self._session_id
            )
            # Continue anyway - sometimes first probe fails but recording works

        # Start recording segments
        while not self._stop_event.is_set():
            segment = self._next_segment()
            logger.info("Creating segment: device_id=%s session_id=%s segment_index=%s path=%s",
                       self._device_id, self._session_id, self._segment_index - 1, segment.path)
            
            recorder = self._media_recorder_factory(str(segment.path))
            
            # Use MediaRelay to subscribe to tracks for each segment
            for track in list(self._remote_tracks):
                if self._media_relay:
                    relayed_track = self._media_relay.subscribe(track, buffered=False)
                    recorder.addTrack(relayed_track)
                else:
                    recorder.addTrack(track)

            try:
                await _maybe_await(recorder.start())
                logger.info("Segment recording started: device_id=%s segment_path=%s duration=%s",
                           self._device_id, segment.path, self._segment_duration)
                
                # Wait for segment duration or stop signal
                try:
                    await asyncio.wait_for(self._stop_event.wait(), timeout=self._segment_duration)
                except asyncio.TimeoutError:
                    pass  # Segment duration elapsed, continue to next segment
                
                await _maybe_await(recorder.stop())
                
                # Check if file was created successfully
                file_exists = segment.path.exists()
                file_size = segment.path.stat().st_size if file_exists else None
                logger.info("Segment recording completed: device_id=%s segment_path=%s exists=%s size=%s",
                           self._device_id, segment.path, file_exists, file_size)
                
                if not file_exists or file_size == 0:
                    logger.error(
                        "RECORDING FAILED - No media data received: device_id=%s path=%s. "
                        "WebRTC connection is not receiving media from Ring.",
                        self._device_id, segment.path
                    )

                if self._on_segment_complete:
                    await _maybe_await(self._on_segment_complete(segment.path))
                    
            except Exception as exc:
                logger.error("Error recording segment: device_id=%s segment_path=%s error=%s",
                            self._device_id, segment.path, exc, exc_info=True)

    async def _probe_for_frames(self, timeout: float = 10.0) -> bool:
        """Probe tracks to verify frames are being received.
        
        Returns True if frames are flowing, False otherwise.
        """
        if not self._remote_tracks or not self._media_relay:
            logger.warning("Cannot probe for frames: no tracks or relay available")
            return False
        
        # Find video track to probe
        video_tracks = [t for t in self._remote_tracks if t.kind == "video"]
        if not video_tracks:
            logger.warning("No video track found for probing")
            return False
        
        logger.info("Probing for frames: device_id=%s session_id=%s timeout=%s",
                   self._device_id, self._session_id, timeout)
        
        video_track = video_tracks[0]
        probe_track = self._media_relay.subscribe(video_track, buffered=False)
        
        try:
            # Try to receive a single frame
            recv_method = getattr(probe_track, 'recv', None)
            if not recv_method:
                logger.warning("Probe track has no recv method")
                return False
            
            frame = await asyncio.wait_for(recv_method(), timeout=timeout)
            
            # Log frame info
            frame_type = type(frame).__name__
            frame_info = ""
            if hasattr(frame, 'width') and hasattr(frame, 'height'):
                frame_info = f" size={frame.width}x{frame.height}"
            if hasattr(frame, 'pts'):
                frame_info += f" pts={frame.pts}"
            
            logger.info("Frame probe SUCCESS: device_id=%s session_id=%s frame_type=%s%s",
                       self._device_id, self._session_id, frame_type, frame_info)
            return True
            
        except asyncio.TimeoutError:
            logger.error("Frame probe FAILED - No frames received within %ss: device_id=%s session_id=%s",
                        timeout, self._device_id, self._session_id)
            return False
        except Exception as exc:
            logger.error("Frame probe ERROR: device_id=%s session_id=%s error=%s",
                        self._device_id, self._session_id, exc, exc_info=True)
            return False

    def _next_segment(self) -> RecorderSegment:
        """Generate next segment path."""
        timestamp = datetime.fromtimestamp(self._time_provider(), tz=timezone.utc)
        filename = (
            f"ring_{self._device_id}_{timestamp.strftime('%Y%m%dT%H%M%SZ')}_{self._segment_index}.mp4"
        )
        self._segment_index += 1
        segment = RecorderSegment(path=self._output_dir / filename, started_at=timestamp)
        return segment


async def _wait_for_signaling_stable(pc: PeerConnectionProtocol) -> None:
    """Wait for signaling state to become stable."""
    while True:
        state = getattr(pc, 'signalingState', 'unknown')
        if state == "stable":
            return
        await asyncio.sleep(0.1)


async def _wait_for_connection_established(pc: PeerConnectionProtocol) -> None:
    """Wait for WebRTC connection to be fully established."""
    while True:
        conn_state = getattr(pc, 'connectionState', 'unknown')
        if conn_state == "connected":
            return
        elif conn_state in ("failed", "closed", "disconnected"):
            raise ConnectionError(f"Connection failed: {conn_state}")
        await asyncio.sleep(0.1)


async def _wait_for_ice_gathering_complete(
    peer_connection: PeerConnectionProtocol, timeout: float
) -> None:
    """Wait for ICE gathering to complete, with early exit like Swift implementation."""
    state = getattr(peer_connection, "iceGatheringState", None)
    if state in (None, "complete"):
        logger.debug("ICE gathering already complete")
        return
    
    logger.debug("Waiting for ICE gathering: initial_state=%s timeout=%s", state, timeout)
    event = asyncio.Event()
    start_time = asyncio.get_event_loop().time()

    @peer_connection.on("icegatheringstatechange")
    def on_state_change(_: object = None) -> None:
        new_state = getattr(peer_connection, "iceGatheringState", None)
        logger.debug("ICE gathering state changed: state=%s", new_state)
        if new_state == "complete":
            event.set()
        
        # Early exit: Check if we have at least 2 candidates (host + srflx)
        # This matches the Swift implementation's early exit logic
        try:
            local_desc = getattr(peer_connection, "localDescription", None)
            if local_desc:
                sdp = getattr(local_desc, "sdp", "")
                candidate_count = sdp.count("a=candidate")
                if candidate_count >= 2:
                    logger.debug("ICE early exit with %d candidates", candidate_count)
                    event.set()
        except Exception:
            pass

    try:
        await asyncio.wait_for(event.wait(), timeout=timeout)
        elapsed = asyncio.get_event_loop().time() - start_time
        final_state = getattr(peer_connection, "iceGatheringState", None)
        logger.debug("ICE gathering completed: state=%s elapsed=%.2fs", final_state, elapsed)
    except asyncio.TimeoutError:
        elapsed = asyncio.get_event_loop().time() - start_time
        logger.warning("ICE gathering timeout after %.2fs, proceeding with available candidates", elapsed)


async def _maybe_await(value: Awaitable[None] | None | object) -> object:
    """Await if value is awaitable, otherwise return as-is."""
    if inspect.isawaitable(value):
        return await value
    return value


def _load_peer_connection_factory() -> PeerConnectionFactory:
    """Load RTCPeerConnection factory."""
    try:
        from aiortc import RTCPeerConnection
    except Exception as exc:
        raise OpenRingRecorderDependencyError("aiortc is required for OpenRing recorder") from exc
    
    def create_peer_connection(config: Optional[object] = None) -> PeerConnectionProtocol:
        if config is not None:
            return RTCPeerConnection(configuration=config)  # type: ignore[arg-type]
        return RTCPeerConnection()
    
    return create_peer_connection


def _load_session_description_factory() -> SessionDescriptionFactory:
    """Load RTCSessionDescription factory."""
    try:
        from aiortc import RTCSessionDescription
    except Exception as exc:
        raise OpenRingRecorderDependencyError("aiortc is required for OpenRing recorder") from exc
    return RTCSessionDescription


def _load_media_recorder_factory() -> MediaRecorderFactory:
    """Load MediaRecorder factory."""
    try:
        from aiortc.contrib.media import MediaRecorder
    except Exception as exc:
        raise OpenRingRecorderDependencyError("aiortc is required for OpenRing recorder") from exc
    return MediaRecorder


def _load_media_relay_factory() -> MediaRelayFactory:
    """Load MediaRelay factory."""
    try:
        from aiortc.contrib.media import MediaRelay
    except Exception as exc:
        raise OpenRingRecorderDependencyError("aiortc is required for OpenRing recorder") from exc
    return MediaRelay


def _build_rtc_configuration(ice_servers: list[IceServer]) -> Optional[object]:
    """Build RTCConfiguration with ICE servers for aiortc."""
    if not ice_servers:
        return None
    
    try:
        from aiortc import RTCConfiguration, RTCIceServer
        
        rtc_ice_servers = []
        for server in ice_servers:
            if server.username and server.credential:
                rtc_ice_servers.append(RTCIceServer(
                    urls=server.urls,
                    username=server.username,
                    credential=server.credential,
                ))
            else:
                rtc_ice_servers.append(RTCIceServer(urls=server.urls))
        
        if rtc_ice_servers:
            logger.info("Built RTCConfiguration with %d ICE servers", len(rtc_ice_servers))
            return RTCConfiguration(iceServers=rtc_ice_servers)
        return None
    except ImportError:
        logger.warning("RTCConfiguration not available in aiortc")
        return None
    except Exception as exc:
        logger.warning("Failed to build RTCConfiguration: %s", exc)
        return None
