# GON ADK contract service — container image for Cloud Run (P06-S1).
#
# Build context: apps/gon-adk. The locked P03 contracts live outside this
# context (apps/gon-web/docs/04-contracts) and are staged into ./docs-contracts
# by deploy/gcp/40-deploy-adk.sh before `gcloud builds submit` — the service
# refuses P03 drift by reading contracts only from that staged copy
# (GON_CONTRACTS_DIR=/app/contracts).
#
# Runtime deps come exclusively from the hashed requirements.lock (R1.12
# supply-chain lock); the package itself is imported via PYTHONPATH so no
# build-time dependency resolution happens inside the image.
#
# STATUS: NOT RUN in the dev sandbox — syntax-reviewed only.

FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONPATH=/app/src \
    PORT=8080
WORKDIR /app
RUN groupadd --system --gid 1001 gon && useradd --system --uid 1001 --gid gon gon

COPY requirements.lock ./
RUN pip install --no-cache-dir --require-hashes -r requirements.lock

COPY pyproject.toml README.md ./
COPY src/gon_adk ./src/gon_adk
COPY docs-contracts ./contracts

ENV GON_CONTRACTS_DIR=/app/contracts
USER gon
EXPOSE 8080
CMD ["sh", "-c", "exec python -m uvicorn gon_adk.main:app --host 0.0.0.0 --port ${PORT}"]
