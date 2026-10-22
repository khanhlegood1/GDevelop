from __future__ import annotations

import hmac
import json
import logging
import os
from typing import Any

from fastapi import Depends, FastAPI, Header, Request
from fastapi.responses import JSONResponse

from .config import Settings
from .contracts import (
    ContractCatalog,
    ContractValidationError,
    validate_assess_output_semantics,
    validate_generate_output_semantics,
    validate_topic_output_semantics,
)
from .errors import (
    ProviderNotConfiguredError,
    ProviderOutputError,
    ProviderUnavailableError,
)
from .google_provider import GoogleAdkProvider, adk_available
from .local_provider import LocalDeterministicProvider

logger = logging.getLogger("gon_adk")


def problem(
    status: int,
    code: str,
    title: str,
    detail: str,
    details: list[str] | None = None,
) -> JSONResponse:
    return JSONResponse(
        status_code=status,
        content={
            "type": f"https://gon.org/problems/adk/{code.lower().replace('_', '-')}",
            "title": title,
            "status": status,
            "code": code,
            "detail": detail,
            **({"details": details} if details else {}),
        },
    )


def create_app(settings: Settings | None = None) -> FastAPI:
    active_settings = settings or Settings.from_env()

    catalog: ContractCatalog | None
    catalog_error: str | None = None
    try:
        catalog = ContractCatalog(active_settings.contracts_dir)
    except Exception as exc:  # health must still explain the degraded state
        catalog = None
        catalog_error = type(exc).__name__

    if active_settings.provider == "local":
        provider: Any = LocalDeterministicProvider()
    elif active_settings.provider == "google":
        provider = GoogleAdkProvider(active_settings)
    else:
        provider = None

    app = FastAPI(
        title="GON ADK Contract Service",
        version="0.1.0",
        docs_url=None,
        redoc_url=None,
        openapi_url=None,
    )
    app.state.settings = active_settings
    app.state.catalog = catalog
    app.state.provider = provider

    def require_service_auth(
        x_gon_service_token: str | None = Header(default=None),
    ) -> JSONResponse | None:
        if active_settings.service_token:
            if not x_gon_service_token or not hmac.compare_digest(
                x_gon_service_token, active_settings.service_token
            ):
                return problem(
                    401,
                    "SERVICE_AUTH_FAILED",
                    "Service authentication failed",
                    "A valid X-GON-Service-Token header is required.",
                )
            return None
        if active_settings.unauthenticated_local_enabled:
            return None
        return problem(
            503,
            "SERVICE_AUTH_NOT_CONFIGURED",
            "Service authentication is not configured",
            "Set GON_ADK_SERVICE_TOKEN, or explicitly allow unauthenticated local development.",
        )

    async def parse_body(request: Request) -> dict[str, Any] | JSONResponse:
        def too_large() -> JSONResponse:
            return problem(
                413,
                "REQUEST_TOO_LARGE",
                "Request body too large",
                f"Body exceeds {active_settings.max_body_bytes} bytes.",
            )

        declared_length = request.headers.get("content-length")
        if declared_length:
            try:
                if int(declared_length) > active_settings.max_body_bytes:
                    return too_large()
            except ValueError:
                pass

        # Do not call request.body() first: chunked requests must be stopped
        # as soon as the streamed total crosses the configured limit.
        raw_parts: list[bytes] = []
        total_bytes = 0
        async for chunk in request.stream():
            total_bytes += len(chunk)
            if total_bytes > active_settings.max_body_bytes:
                return too_large()
            raw_parts.append(chunk)
        raw = b"".join(raw_parts)
        try:
            parsed = json.loads(raw.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError):
            return problem(
                400,
                "INVALID_JSON",
                "Invalid JSON",
                "Request body must be a UTF-8 JSON object.",
            )
        if not isinstance(parsed, dict):
            return problem(
                422,
                "INVALID_CONTRACT_INPUT",
                "Invalid contract input",
                "Request body must be a JSON object.",
            )
        return parsed

    def require_catalog() -> ContractCatalog | JSONResponse:
        if catalog is None:
            return problem(
                503,
                "CONTRACT_SCHEMAS_UNAVAILABLE",
                "Contract schemas unavailable",
                f"P03 schemas could not be loaded ({catalog_error}).",
            )
        return catalog

    def require_provider() -> Any | JSONResponse:
        if provider is None:
            return problem(
                503,
                "PROVIDER_NOT_CONFIGURED",
                "ADK provider is not configured",
                "GON_ADK_PROVIDER must be 'local' or 'google'.",
            )
        return provider

    async def execute(
        request: Request, operation: str, method_name: str
    ) -> JSONResponse:
        catalog_or_error = require_catalog()
        if isinstance(catalog_or_error, JSONResponse):
            return catalog_or_error
        provider_or_error = require_provider()
        if isinstance(provider_or_error, JSONResponse):
            return provider_or_error

        payload = await parse_body(request)
        if isinstance(payload, JSONResponse):
            return payload

        try:
            catalog_or_error.validate(f"{operation}_input", payload)
            output = await getattr(provider_or_error, method_name)(payload)
            if not isinstance(output, dict):
                raise ProviderOutputError("Provider returned a non-object value")
            catalog_or_error.validate(f"{operation}_output", output)

            if operation == "topic":
                validate_topic_output_semantics(output)
            elif operation == "generate":
                validate_generate_output_semantics(
                    catalog_or_error, output, payload
                )
            elif operation == "assess":
                validate_assess_output_semantics(output, payload)

            return JSONResponse(content=output)
        except ContractValidationError as exc:
            return problem(
                422,
                "CONTRACT_VALIDATION_FAILED",
                "Contract validation failed",
                str(exc),
                exc.details,
            )
        except ProviderNotConfiguredError as exc:
            return problem(
                503,
                "PROVIDER_NOT_CONFIGURED",
                "ADK provider is not configured",
                str(exc),
            )
        except ProviderOutputError as exc:
            return problem(
                502,
                "PROVIDER_OUTPUT_INVALID",
                "Provider output is invalid",
                str(exc),
            )
        except ProviderUnavailableError as exc:
            return problem(
                503,
                "PROVIDER_UNAVAILABLE",
                "ADK provider unavailable",
                str(exc),
            )
        except Exception:  # Never leak prompt/provider internals in API errors.
            logger.exception("Unhandled ADK service error")
            return problem(
                500,
                "INTERNAL_ERROR",
                "Internal ADK service error",
                "The request failed without persisting or publishing anything.",
            )

    @app.get("/healthz")
    async def healthz() -> dict[str, Any]:
        schemas_ready = catalog is not None
        auth_ready = bool(active_settings.service_token) or (
            active_settings.unauthenticated_local_enabled
        )
        return {
            "status": "ok" if schemas_ready and auth_ready else "degraded",
            "service": "gon-adk",
            "provider": active_settings.provider,
            "adkInstalled": adk_available(),
            "modelConfigured": bool(active_settings.model_id),
            "googleCredentialsConfigured": active_settings.google_credentials_configured,
            "schemasReady": schemas_ready,
            "databaseAccess": False,
            "publishAccess": False,
        }

    @app.post("/v1/topic-check")
    async def topic_check(
        request: Request,
        auth_error: JSONResponse | None = Depends(require_service_auth),
    ) -> JSONResponse:
        if auth_error:
            return auth_error
        return await execute(request, "topic", "topic_check")

    @app.post("/v1/generate-module")
    async def generate_module(
        request: Request,
        auth_error: JSONResponse | None = Depends(require_service_auth),
    ) -> JSONResponse:
        if auth_error:
            return auth_error
        return await execute(request, "generate", "generate_module")

    @app.post("/v1/assess-attempt")
    async def assess_attempt(
        request: Request,
        auth_error: JSONResponse | None = Depends(require_service_auth),
    ) -> JSONResponse:
        if auth_error:
            return auth_error
        return await execute(request, "assess", "assess_attempt")

    return app


app = create_app()


def run() -> None:
    import uvicorn

    uvicorn.run(
        "gon_adk.main:app",
        host=os.getenv("HOST", "0.0.0.0"),
        port=int(os.getenv("PORT", "8000")),
        reload=False,
    )
