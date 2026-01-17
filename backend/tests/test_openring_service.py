from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Mapping, Optional

import pytest

from app.services.openring_service import (
    OpenRingService,
    RingDevice,
    _extract_device_payloads,
    _sequence_length,
    _summarize_device_payload,
)


@dataclass(frozen=True)
class FakeResponse:
    status_code: int
    payload: Mapping[str, object]

    @property
    def text(self) -> str:
        return json.dumps(self.payload)

    def json(self) -> object:
        return self.payload


class FakeClient:
    def __init__(self, response: FakeResponse) -> None:
        self._response = response
        self.requests: list[tuple[str, str]] = []
        self.closed = False

    async def request(
        self,
        method: str,
        url: str,
        headers: Optional[Mapping[str, str]] = None,
        json: Optional[Mapping[str, object]] = None,
    ) -> FakeResponse:
        self.requests.append((method, url))
        return self._response

    async def aclose(self) -> None:
        self.closed = True


def _device_payload(device_id: int) -> Mapping[str, object]:
    return {
        "id": device_id,
        "description": f"Device {device_id}",
        "device_id": str(device_id),
        "kind": "doorbell",
    }


@pytest.mark.asyncio
async def test_fetch_devices_accepts_devices_key() -> None:
    payload = {"devices": [_device_payload(1)]}
    response = FakeResponse(status_code=200, payload=payload)
    client = FakeClient(response)
    service = OpenRingService(
        access_token="token",
        refresh_token="refresh",
        hardware_id="hardware",
        http_client=client,
    )

    devices = await service.fetch_devices()

    assert len(devices) == 1
    assert isinstance(devices[0], RingDevice)
    assert devices[0].id == 1
    assert devices[0].description == "Device 1"


@pytest.mark.asyncio
async def test_fetch_devices_accepts_all_devices_key() -> None:
    payload = {"all_devices": [_device_payload(2), _device_payload(3)]}
    response = FakeResponse(status_code=200, payload=payload)
    client = FakeClient(response)
    service = OpenRingService(
        access_token="token",
        refresh_token="refresh",
        hardware_id="hardware",
        http_client=client,
    )

    devices = await service.fetch_devices()

    assert [device.id for device in devices] == [2, 3]


@pytest.mark.asyncio
async def test_fetch_devices_returns_empty_when_no_devices() -> None:
    payload = {"devices": []}
    response = FakeResponse(status_code=200, payload=payload)
    client = FakeClient(response)
    service = OpenRingService(
        access_token="token",
        refresh_token="refresh",
        hardware_id="hardware",
        http_client=client,
    )

    devices = await service.fetch_devices()

    assert devices == []


def test_extract_device_payloads_combines_sources() -> None:
    payload = {
        "doorbots": [_device_payload(10)],
        "devices": [_device_payload(11)],
    }

    items = _extract_device_payloads(payload)

    assert len(items) == 2
    assert items[0]["id"] == 10
    assert items[1]["id"] == 11


def test_sequence_length_handles_non_sequences() -> None:
    assert _sequence_length([1, 2, 3]) == 3
    assert _sequence_length("not-a-sequence") is None


def test_summarize_device_payload_counts_sequences() -> None:
    payload = {
        "doorbots": [_device_payload(1)],
        "authorized_doorbots": [],
        "devices": "unexpected",
    }

    summary = _summarize_device_payload(payload)

    assert summary["doorbots"] == 1
    assert summary["authorized_doorbots"] == 0
    assert summary["devices"] is None
from __future__ import annotations

from datetime import datetime, timezone
import pytest

from app.services.openring_service import (
    OpenRingService,
    OpenRingTokens,
    OpenRingAuthError,
    OpenRingTwoFactorRequired,
    OpenRingInvalidCredentials,
    OpenRingInvalidTwoFactorCode,
    OpenRingApiError,
    RingDevice,
    _build_two_factor_prompt,
    _ensure_dict,
)


class FakeResponse:
    def __init__(self, status_code: int, payload: object, text: str = ""):
        self.status_code = status_code
        self._payload = payload
        self.text = text

    def json(self) -> object:
        if isinstance(self._payload, Exception):
            raise self._payload
        return self._payload


class FakeClient:
    def __init__(self, responses: list[FakeResponse]):
        self.responses = responses
        self.calls: list[dict[str, object]] = []
        self.closed = False

    async def request(
        self, method: str, url: str, headers: dict[str, str] | None = None, json: dict[str, object] | None = None
    ) -> FakeResponse:
        self.calls.append({"method": method, "url": url, "headers": headers, "json": json})
        return self.responses.pop(0)

    async def aclose(self) -> None:
        self.closed = True


@pytest.mark.asyncio
async def test_login_success_sets_tokens() -> None:
    response = FakeResponse(
        200,
        {
            "access_token": "access",
            "refresh_token": "refresh",
            "expires_in": 60,
            "scope": "client",
            "token_type": "bearer",
        },
    )
    client = FakeClient([response])
    service = OpenRingService(hardware_id="hw", http_client=client)

    tokens = await service.login(email="user@example.com", password="pw")

    assert tokens.access_token == "access"
    assert service.access_token == "access"


@pytest.mark.asyncio
async def test_login_two_factor_required() -> None:
    response = FakeResponse(
        412,
        {"tsv_state": "sms", "phone": "+15555555"},
    )
    service = OpenRingService(hardware_id="hw", http_client=FakeClient([response]))

    with pytest.raises(OpenRingTwoFactorRequired) as exc:
        await service.login(email="user@example.com", password="pw")

    assert "+15555555" in exc.value.prompt


@pytest.mark.asyncio
async def test_login_invalid_credentials() -> None:
    response = FakeResponse(401, {"error_description": "bad"})
    service = OpenRingService(hardware_id="hw", http_client=FakeClient([response]))

    with pytest.raises(OpenRingInvalidCredentials):
        await service.login(email="user@example.com", password="pw")


@pytest.mark.asyncio
async def test_login_invalid_two_factor_code() -> None:
    response = FakeResponse(400, {"error_description": "Verification Code invalid"})
    service = OpenRingService(hardware_id="hw", http_client=FakeClient([response]))

    with pytest.raises(OpenRingInvalidTwoFactorCode):
        await service.login(email="user@example.com", password="pw")


@pytest.mark.asyncio
async def test_refresh_access_token_uses_refresh_token() -> None:
    response = FakeResponse(
        200,
        {
            "access_token": "access",
            "refresh_token": "refresh",
            "expires_in": "120",
            "scope": "client",
            "token_type": "bearer",
        },
    )
    service = OpenRingService(
        refresh_token="refresh",
        hardware_id="hw",
        http_client=FakeClient([response]),
    )

    tokens = await service.refresh_access_token()

    assert tokens.expires_in == 120
    assert service.refresh_token == "refresh"


@pytest.mark.asyncio
async def test_login_requires_hardware_id() -> None:
    service = OpenRingService(http_client=FakeClient([]))
    with pytest.raises(OpenRingAuthError):
        await service.login(email="user@example.com", password="pw")


@pytest.mark.asyncio
async def test_refresh_requires_hardware_id() -> None:
    service = OpenRingService(refresh_token="refresh", http_client=FakeClient([]))
    with pytest.raises(OpenRingAuthError):
        await service.refresh_access_token()


@pytest.mark.asyncio
async def test_fetch_devices_parses_online_offline() -> None:
    response = FakeResponse(
        200,
        {
            "doorbots": [
                {
                    "id": 1,
                    "description": "Front Door",
                    "device_id": "dev1",
                    "kind": "doorbell",
                    "alerts": {"connection": "online"},
                },
                {
                    "id": "2",
                    "description": "Garage",
                    "device_id": "dev2",
                    "kind": "camera",
                    "alerts": {"connection": "offline"},
                },
            ]
        },
    )
    service = OpenRingService(
        access_token="access",
        hardware_id="hw",
        http_client=FakeClient([response]),
    )

    devices = await service.fetch_devices()

    assert len(devices) == 2
    assert devices[0].is_online is True
    assert devices[1].is_online is False


@pytest.mark.asyncio
async def test_fetch_devices_requires_token() -> None:
    service = OpenRingService(http_client=FakeClient([]))

    with pytest.raises(OpenRingApiError):
        await service.fetch_devices()


@pytest.mark.asyncio
async def test_api_request_requires_hardware_id() -> None:
    service = OpenRingService(access_token="access", http_client=FakeClient([]))
    with pytest.raises(OpenRingApiError):
        await service._api_request("GET", "https://api.ring.com/test")


@pytest.mark.asyncio
async def test_start_live_view_missing_sdp_raises() -> None:
    response = FakeResponse(200, {})
    service = OpenRingService(
        access_token="access",
        hardware_id="hw",
        http_client=FakeClient([response]),
    )

    with pytest.raises(OpenRingApiError):
        await service.start_live_view(device_id=1, session_id="session", offer_sdp="offer")


@pytest.mark.asyncio
async def test_activate_camera_accepts_empty_response() -> None:
    response = FakeResponse(204, ValueError("empty"))
    service = OpenRingService(
        access_token="access",
        hardware_id="hw",
        http_client=FakeClient([response]),
    )

    await service.activate_camera("session")


@pytest.mark.asyncio
async def test_end_live_view_handles_empty_response() -> None:
    response = FakeResponse(200, ValueError("empty"))
    service = OpenRingService(
        access_token="access",
        hardware_id="hw",
        http_client=FakeClient([response]),
    )

    await service.end_live_view("session")


@pytest.mark.asyncio
async def test_api_request_error_paths() -> None:
    responses = [
        FakeResponse(401, {}),
        FakeResponse(404, {}),
        FakeResponse(429, {}),
        FakeResponse(500, {}, text="boom"),
    ]
    service = OpenRingService(
        access_token="access",
        hardware_id="hw",
        http_client=FakeClient(responses),
    )

    with pytest.raises(OpenRingApiError):
        await service._api_request("GET", "https://api.ring.com/test")


@pytest.mark.asyncio
async def test_authenticate_missing_credentials() -> None:
    service = OpenRingService(hardware_id="hw", http_client=FakeClient([]))
    with pytest.raises(OpenRingAuthError):
        await service._authenticate(email=None, password=None, refresh_token=None, two_factor_code=None)


@pytest.mark.asyncio
async def test_close_only_when_owned() -> None:
    client = FakeClient([])
    service = OpenRingService(http_client=client)
    await service.close()
    assert client.closed is False

    service._client = client
    service._owns_client = True
    await service.close()
    assert client.closed is True
    with pytest.raises(OpenRingApiError):
        await service._api_request("GET", "https://api.ring.com/test")
    with pytest.raises(OpenRingApiError):
        await service._api_request("GET", "https://api.ring.com/test")
    with pytest.raises(OpenRingApiError):
        await service._api_request("GET", "https://api.ring.com/test")


def test_two_factor_prompt_fallback() -> None:
    prompt, tsv_state, phone = _build_two_factor_prompt({})
    assert "verification code" in prompt.lower()
    assert tsv_state is None
    assert phone is None


def test_two_factor_prompt_with_phone() -> None:
    prompt, tsv_state, phone = _build_two_factor_prompt({"tsv_state": "sms", "phone": "+1"})
    assert "sms" in prompt
    assert tsv_state == "sms"
    assert phone == "+1"


def test_ensure_dict_handles_invalid_json() -> None:
    response = FakeResponse(200, ValueError("invalid"))
    assert _ensure_dict(response) == {}


def test_tokens_from_payload_invalid_expires() -> None:
    with pytest.raises(OpenRingAuthError):
        OpenRingTokens.from_payload(
            {
                "access_token": "access",
                "refresh_token": "refresh",
                "expires_in": "bad",
                "scope": "client",
                "token_type": "bearer",
            },
            datetime.now(timezone.utc),
        )


def test_ring_device_from_payload_invalid_id() -> None:
    assert RingDevice.from_payload({"id": "bad"}) is None


def test_tokens_from_payload_missing_access_token() -> None:
    with pytest.raises(OpenRingAuthError):
        OpenRingTokens.from_payload(
            {
                "refresh_token": "refresh",
                "expires_in": 60,
                "scope": "client",
                "token_type": "bearer",
            },
            datetime.now(timezone.utc),
        )
