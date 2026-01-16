"""
OpenRing service for authenticating and interacting with Ring APIs.

Provides typed auth flows, device discovery, and live-view negotiation.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone, timedelta
import uuid
from typing import Optional, Mapping, Protocol, Sequence

import httpx


class HttpResponse(Protocol):
    status_code: int
    text: str

    def json(self) -> object: ...


class HttpClient(Protocol):
    async def request(
        self,
        method: str,
        url: str,
        headers: Optional[Mapping[str, str]] = None,
        json: Optional[Mapping[str, object]] = None,
    ) -> HttpResponse: ...

    async def aclose(self) -> None: ...


class OpenRingAuthError(Exception):
    """Base auth error for Ring authentication."""


class OpenRingInvalidCredentials(OpenRingAuthError):
    """Raised when credentials are invalid."""


class OpenRingInvalidTwoFactorCode(OpenRingAuthError):
    """Raised when 2FA code is invalid."""


class OpenRingTwoFactorRequired(OpenRingAuthError):
    """Raised when 2FA is required."""

    def __init__(self, prompt: str, tsv_state: Optional[str], phone: Optional[str]):
        super().__init__(prompt)
        self.prompt = prompt
        self.tsv_state = tsv_state
        self.phone = phone


class OpenRingRateLimited(OpenRingAuthError):
    """Raised when Ring rate limits the auth request."""


class OpenRingApiError(Exception):
    """Raised when Ring API returns an error."""

    def __init__(self, message: str, status_code: int):
        super().__init__(message)
        self.status_code = status_code


@dataclass(frozen=True)
class OpenRingTokens:
    access_token: str
    refresh_token: str
    expires_in: int
    scope: str
    token_type: str
    expires_at: datetime

    @classmethod
    def from_payload(cls, payload: Mapping[str, object], now: datetime) -> "OpenRingTokens":
        access_token = _require_str(payload.get("access_token"), "access_token")
        refresh_token = _require_str(payload.get("refresh_token"), "refresh_token")
        expires_in = _require_int(payload.get("expires_in"), "expires_in")
        scope = _require_str(payload.get("scope"), "scope")
        token_type = _require_str(payload.get("token_type"), "token_type")
        expires_at = now + timedelta(seconds=expires_in)
        return cls(
            access_token=access_token,
            refresh_token=refresh_token,
            expires_in=expires_in,
            scope=scope,
            token_type=token_type,
            expires_at=expires_at,
        )


@dataclass(frozen=True)
class RingDeviceAlerts:
    connection: Optional[str]
    battery: Optional[str]


@dataclass(frozen=True)
class RingDevice:
    id: int
    description: str
    device_id: str
    kind: str
    location_id: Optional[str]
    alerts: Optional[RingDeviceAlerts]

    @property
    def is_online(self) -> bool:
        if self.alerts and self.alerts.connection:
            return self.alerts.connection != "offline"
        return True

    @classmethod
    def from_payload(cls, payload: Mapping[str, object]) -> Optional["RingDevice"]:
        raw_id = payload.get("id")
        device_id = _coerce_int(raw_id)
        if device_id is None:
            return None

        description = _coerce_str(payload.get("description")) or "Unknown"
        device_id_value = _coerce_str(payload.get("device_id")) or str(device_id)
        kind = _coerce_str(payload.get("kind")) or "unknown"
        location_id = _coerce_str(payload.get("location_id"))
        alerts_payload = payload.get("alerts")
        alerts = None
        if isinstance(alerts_payload, Mapping):
            alerts = RingDeviceAlerts(
                connection=_coerce_str(alerts_payload.get("connection")),
                battery=_coerce_str(alerts_payload.get("battery")),
            )

        return cls(
            id=device_id,
            description=description,
            device_id=device_id_value,
            kind=kind,
            location_id=location_id,
            alerts=alerts,
        )


@dataclass(frozen=True)
class LiveViewStartResponse:
    session_id: str
    answer_sdp: str


class OpenRingService:
    """Client for Ring APIs used by the OpenRing plugin."""

    OAUTH_URL = "https://oauth.ring.com/oauth/token"
    CLIENTS_API = "https://api.ring.com/clients_api/"
    DEVICES_URL = CLIENTS_API + "ring_devices"
    LIVE_VIEW_START = "https://api.ring.com/integrations/v1/liveview/start"
    LIVE_VIEW_END = "https://api.ring.com/integrations/v1/liveview/end"
    LIVE_VIEW_OPTIONS = "https://api.ring.com/integrations/v1/liveview/options"
    USER_AGENT = "android:com.ringapp"

    def __init__(
        self,
        access_token: Optional[str] = None,
        refresh_token: Optional[str] = None,
        hardware_id: Optional[str] = None,
        http_client: Optional[HttpClient] = None,
    ):
        self._access_token = access_token
        self._refresh_token = refresh_token
        self._hardware_id = hardware_id
        self._owns_client = http_client is None
        self._client = http_client or httpx.AsyncClient(timeout=30.0)

    @property
    def access_token(self) -> Optional[str]:
        return self._access_token

    @property
    def refresh_token(self) -> Optional[str]:
        return self._refresh_token

    @property
    def hardware_id(self) -> Optional[str]:
        return self._hardware_id

    def set_tokens(self, tokens: OpenRingTokens) -> None:
        self._access_token = tokens.access_token
        self._refresh_token = tokens.refresh_token

    def set_hardware_id(self, hardware_id: str) -> None:
        self._hardware_id = hardware_id

    async def close(self) -> None:
        if self._owns_client:
            await self._client.aclose()

    @staticmethod
    def generate_hardware_id() -> str:
        return str(uuid.uuid4())

    async def login(
        self,
        email: str,
        password: str,
        two_factor_code: Optional[str] = None,
    ) -> OpenRingTokens:
        if not self._hardware_id:
            raise OpenRingAuthError("hardware_id is required for login")
        tokens = await self._authenticate(
            email=email,
            password=password,
            refresh_token=None,
            two_factor_code=two_factor_code,
        )
        self.set_tokens(tokens)
        return tokens

    async def refresh_access_token(self, refresh_token: Optional[str] = None) -> OpenRingTokens:
        if not self._hardware_id:
            raise OpenRingAuthError("hardware_id is required for refresh")
        token_value = refresh_token or self._refresh_token
        if not token_value:
            raise OpenRingAuthError("refresh_token is required for refresh")
        tokens = await self._authenticate(
            email=None,
            password=None,
            refresh_token=token_value,
            two_factor_code=None,
        )
        self.set_tokens(tokens)
        return tokens

    async def fetch_devices(self) -> list[RingDevice]:
        response = await self._api_request("GET", self.DEVICES_URL)
        payload = _ensure_dict(response)
        devices: list[RingDevice] = []
        for key in ("doorbots", "authorized_doorbots", "stickup_cams", "chimes"):
            items = payload.get(key)
            if isinstance(items, Sequence):
                for item in items:
                    if isinstance(item, Mapping):
                        device = RingDevice.from_payload(item)
                        if device:
                            devices.append(device)
        return devices

    async def start_live_view(
        self,
        device_id: int,
        session_id: str,
        offer_sdp: str,
    ) -> LiveViewStartResponse:
        body = {
            "session_id": session_id,
            "device_id": device_id,
            "sdp": offer_sdp,
            "protocol": "webrtc",
        }
        response = await self._api_request("POST", self.LIVE_VIEW_START, body=body)
        payload = _ensure_dict(response)
        answer_sdp = _coerce_str(payload.get("sdp"))
        if not answer_sdp:
            raise OpenRingApiError("Missing SDP answer from Ring", 200)
        return LiveViewStartResponse(session_id=session_id, answer_sdp=answer_sdp)

    async def end_live_view(self, session_id: str) -> None:
        await self._api_request("POST", self.LIVE_VIEW_END, body={"session_id": session_id})

    async def activate_camera(self, session_id: str) -> None:
        body = {
            "session_id": session_id,
            "actions": ["turn_off_stealth_mode"],
        }
        await self._api_request("PATCH", self.LIVE_VIEW_OPTIONS, body=body)

    async def _authenticate(
        self,
        email: Optional[str],
        password: Optional[str],
        refresh_token: Optional[str],
        two_factor_code: Optional[str],
    ) -> OpenRingTokens:
        body: dict[str, object] = {
            "client_id": "ring_official_android",
            "scope": "client",
        }

        if refresh_token:
            body["grant_type"] = "refresh_token"
            body["refresh_token"] = refresh_token
        elif email and password:
            body["grant_type"] = "password"
            body["username"] = email
            body["password"] = password
        else:
            raise OpenRingAuthError("Missing credentials")

        headers = {
            "Content-Type": "application/json",
            "2fa-support": "true",
            "2fa-code": two_factor_code or "",
            "User-Agent": self.USER_AGENT,
            "hardware_id": self._hardware_id or "",
        }

        response = await self._client.request(
            "POST",
            self.OAUTH_URL,
            headers=headers,
            json=body,
        )

        if response.status_code == 200:
            payload = _ensure_dict(response)
            now = datetime.now(timezone.utc)
            return OpenRingTokens.from_payload(payload, now)

        if response.status_code == 412:
            payload = _ensure_dict(response)
            prompt, tsv_state, phone = _build_two_factor_prompt(payload)
            raise OpenRingTwoFactorRequired(prompt, tsv_state, phone)

        if response.status_code in (400, 401):
            payload = _ensure_dict(response)
            error_description = _coerce_str(payload.get("error_description")) or ""
            if "Verification Code" in error_description:
                raise OpenRingInvalidTwoFactorCode(error_description)
            raise OpenRingInvalidCredentials(error_description or "Invalid credentials")

        if response.status_code == 429:
            raise OpenRingRateLimited("Rate limited by Ring")

        raise OpenRingAuthError(f"Unexpected auth response: {response.status_code}")

    async def _api_request(
        self,
        method: str,
        url: str,
        body: Optional[Mapping[str, object]] = None,
    ) -> Mapping[str, object]:
        if not self._access_token:
            raise OpenRingApiError("Missing access token", 401)
        if not self._hardware_id:
            raise OpenRingApiError("Missing hardware_id", 401)

        headers = {
            "Authorization": f"Bearer {self._access_token}",
            "Content-Type": "application/json",
            "Accept": "application/json",
            "User-Agent": self.USER_AGENT,
            "hardware_id": self._hardware_id,
        }

        response = await self._client.request(
            method,
            url,
            headers=headers,
            json=body,
        )

        if 200 <= response.status_code < 300:
            payload = _ensure_dict(response)
            return payload

        if response.status_code == 401:
            raise OpenRingApiError("Unauthorized", 401)
        if response.status_code == 404:
            raise OpenRingApiError("Not found", 404)
        if response.status_code == 429:
            raise OpenRingApiError("Rate limited", 429)

        raise OpenRingApiError(
            f"Ring API error {response.status_code}: {response.text}",
            response.status_code,
        )


def _ensure_dict(response: HttpResponse) -> Mapping[str, object]:
    try:
        payload = response.json()
    except Exception:
        return {}
    if isinstance(payload, Mapping):
        return payload
    return {}


def _build_two_factor_prompt(
    payload: Mapping[str, object],
) -> tuple[str, Optional[str], Optional[str]]:
    tsv_state = _coerce_str(payload.get("tsv_state"))
    phone = _coerce_str(payload.get("phone"))
    if tsv_state and phone:
        return f"Enter the code sent to {phone} via {tsv_state}", tsv_state, phone
    return "Enter the verification code sent to your phone/email", tsv_state, phone


def _require_str(value: object, field_name: str) -> str:
    if isinstance(value, str) and value.strip():
        return value
    raise OpenRingAuthError(f"Missing or invalid {field_name}")


def _require_int(value: object, field_name: str) -> int:
    if isinstance(value, int):
        return value
    if isinstance(value, str):
        try:
            return int(value)
        except ValueError as exc:
            raise OpenRingAuthError(f"Invalid {field_name}") from exc
    raise OpenRingAuthError(f"Missing or invalid {field_name}")


def _coerce_str(value: object) -> Optional[str]:
    if isinstance(value, str):
        return value
    return None


def _coerce_int(value: object) -> Optional[int]:
    if isinstance(value, int):
        return value
    if isinstance(value, str):
        try:
            return int(value)
        except ValueError:
            return None
    return None
