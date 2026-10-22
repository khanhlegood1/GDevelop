from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path


def _flag(name: str, default: bool = False) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def _default_contracts_dir() -> Path:
    # apps/gon-adk/src/gon_adk/config.py -> apps/
    apps_dir = Path(__file__).resolve().parents[3]
    return apps_dir / "gon-web" / "docs" / "04-contracts"


@dataclass(frozen=True)
class Settings:
    service_token: str | None
    allow_unauthenticated_local: bool
    provider: str
    model_id: str | None
    contracts_dir: Path
    request_timeout_seconds: float
    max_body_bytes: int
    environment: str = "local"

    @property
    def unauthenticated_local_enabled(self) -> bool:
        """The local no-token mode must never become effective elsewhere."""

        return self.allow_unauthenticated_local and self.environment.strip().lower() == "local"

    @classmethod
    def from_env(cls) -> "Settings":
        contracts_dir = Path(
            os.getenv("GON_CONTRACTS_DIR", str(_default_contracts_dir()))
        ).expanduser()
        return cls(
            service_token=os.getenv("GON_ADK_SERVICE_TOKEN") or None,
            allow_unauthenticated_local=_flag(
                "GON_ADK_ALLOW_UNAUTHENTICATED_LOCAL", False
            ),
            provider=os.getenv("GON_ADK_PROVIDER", "local").strip().lower(),
            model_id=os.getenv("GON_ADK_MODEL") or None,
            contracts_dir=contracts_dir,
            request_timeout_seconds=float(
                os.getenv("GON_ADK_REQUEST_TIMEOUT_SECONDS", "120")
            ),
            max_body_bytes=int(os.getenv("GON_ADK_MAX_BODY_BYTES", "2500000")),
            environment=os.getenv("GON_ADK_ENV", "local").strip().lower(),
        )

    @property
    def google_credentials_configured(self) -> bool:
        """Return a boolean only; never expose credential material."""

        if os.getenv("GOOGLE_API_KEY"):
            return True
        # Vertex AI / ADC path used by Google ADK deployments.
        return bool(
            os.getenv("GOOGLE_CLOUD_PROJECT")
            and os.getenv("GOOGLE_CLOUD_LOCATION")
        ) or bool(os.getenv("GOOGLE_APPLICATION_CREDENTIALS"))
