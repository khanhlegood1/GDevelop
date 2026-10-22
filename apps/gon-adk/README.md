# GON ADK Contract Service — P04 harness

Python service tách riêng cho TopicCheck, GenerateModule và AssessAttempt theo P03/ADR-0005. Service **stateless**:

- không có database credential;
- không ghi/publish ModuleVersion;
- không nhận Google session của người dùng;
- không công cụ nào ngoài model call đã cấu hình;
- mọi output phải qua P03 JSON Schema + semantic validation trước khi GON web được phép persist.

## Trạng thái trung thực

Đã implement và có thể test local:

- FastAPI endpoints `/healthz`, `/v1/topic-check`, `/v1/generate-module`, `/v1/assess-attempt`;
- service-token authentication và fail-closed nếu chưa cấu hình;
- `local` deterministic provider cho contract tests;
- citation/source allowlist theo evidence bundle;
- Google ADK agent definitions cho checker/generator/assessor bằng `google-adk==2.12.0`.

Chưa được chứng minh:

- chưa gọi Gemini thật vì sandbox không có Google credentials/model được PO cấu hình;
- chưa nối TypeScript `GonService` sang HTTP provider này;
- chưa có durable job worker/Cloud Tasks/Cloud Run deployment;
- S-P03-03 vẫn **NOT RUN** cho tới khi chạy Google provider với credentials kiểm thử và ghi kết quả vào P04 evidence.

## Chạy local

```bash
cd apps/gon-adk
python3 -m venv .venv
.venv/bin/python -m pip install -e '.[dev]'
GON_ADK_PROVIDER=local \
GON_ADK_SERVICE_TOKEN='change-me-local-only' \
.venv/bin/python -m uvicorn gon_adk.main:app --host 0.0.0.0 --port 8000
```

Kiểm tra:

```bash
curl http://localhost:8000/healthz
.venv/bin/python -m pytest
```

Trong monorepo, service tự tìm schema tại `apps/gon-web/docs/04-contracts`. Khi đóng gói/deploy riêng, đặt:

```bash
GON_CONTRACTS_DIR=/absolute/path/to/apps/gon-web/docs/04-contracts
```

Không copy/sửa schema riêng trong service; P03 contracts là nguồn sự thật.

## Google provider

```bash
GON_ADK_PROVIDER=google
GON_ADK_MODEL='<model-id-được-cấu-hình-cho-môi-trường>'
GON_ADK_SERVICE_TOKEN='<secret-từ-secret-manager>'
# cộng GOOGLE_API_KEY, hoặc ADC/Vertex variables theo môi trường triển khai
```

Nếu thiếu model hoặc credentials, endpoint trả `503 PROVIDER_NOT_CONFIGURED`. Service không tự đoán model ID và không fallback sang local provider ở chế độ Google.

Mỗi request Google tạo một ADK in-memory session mới với actor nội bộ `gon-worker`; không dùng user ID làm ADK session identity. Evidence/answer được dặn là dữ liệu không tin cậy trong instruction, nhưng lớp bảo vệ quyết định vẫn là schema/semantic validator và TypeScript policy service.

## Ranh giới tích hợp còn lại trong P04

1. TypeScript worker tạo job command đã xác thực từ PostgreSQL outbox.
2. Worker gọi service bằng service identity/token rotation ở P05/P06.
3. TypeScript validate lại output, kiểm quota/cost, lưu AiRun và chỉ persist `draft_private` sau citation/safety gates.
4. Provider timeout/5xx được job retry; JSON sai tối đa một repair attempt theo P03; safety block là terminal.
5. Chạy S-P03-03: structured output hợp lệ, citation ngoài bundle bị reject, retry cùng fingerprint không tạo module thứ hai.
