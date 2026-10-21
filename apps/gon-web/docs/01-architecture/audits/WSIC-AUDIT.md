# Thẻ Audit nguồn — WSIC

> **Gate:** G0<br>
> **Repository Audit:** [`khanhlegood1/wsic`](https://github.com/khanhlegood1/wsic)<br>
> **Snapshot:** `2723e6d53edde3f282d80c4185b3a9d5192e8692` — 14/10/2026<br>
> **Giấy phép:** MIT<br>
> **Kết luận Gate 0:** **DÙNG LÀM NGUỒN CHÍNH CHO SEARCH 768D / BREW / ADK PATTERNS — PHẢI THIẾT KẾ LẠI TRUST BOUNDARY TRƯỚC PRODUCTION**

## 1. Phạm vi Audit

Đã kiểm tra tĩnh:

- `LICENSE`, README, `package.json`, `docs/architecture.md`, `docs/search-system.md`, `docs/topic-generation.md`, `docs/configuration.md`.
- `convex/schema.ts`, `convex/search.ts`, `convex/embeddings.ts`, `convex/topics.ts`, `convex/users.ts`, `convex/notifications.ts`.
- `components/pages/SearchResults.tsx`.
- `app/api/queue-topic-request/route.ts`, auth routes và health route.
- `generator_api/app.py`.
- `agents/topic-checker/agent.py` và `agents/topic-generator/agent.py`.
- Tests Python hiện có và sự vắng mặt của `.github/workflows` trong snapshot.
- `npm audit --package-lock-only --json` trên lockfile của snapshot.

Chưa chạy WSIC end-to-end bằng credentials thật và chưa đánh giá chất lượng nội dung AI bằng bộ eval của GON.

## 2. Năng lực khớp trực tiếp với GON

### 2.1 Gemini embedding 768D và vector search

- `convex/schema.ts` khai báo vector index `by_embedding` với **768 dimensions**.
- `convex/embeddings.ts` dùng `GoogleGenAI.models.embedContent`, model `gemini-embedding-001`, `SEMANTIC_SIMILARITY`, `outputDimensionality: 768`, sau đó `ctx.vectorSearch`.
- `searchSimilarTopicsByTerm` biến search term thành embedding và trả published topics kèm score.
- `convex/search.ts` có nhánh tìm kiếm title/full-text bổ trợ.

Đây là nền gần nhất với yêu cầu Semantic Search 768D của GON.

### 2.2 Brew Your Topic khi kết quả không đủ tốt

`SearchResults.tsx` phân loại kết quả có score cao hơn ngưỡng `NEXT_PUBLIC_SIMILARITY_SCORE` (mặc định `0.85`). Khi không có nội dung đủ phù hợp, UI chuyển sang **Brew Your Topic** thay vì chỉ báo rỗng.

Luồng gồm:

```text
Search → vectorscore/threshold → Brew CTA
  → POST /api/queue-topic-request
  → QStash (retry/delay)
  → Flask Generator API
  → ADK Topic Checker → ADK Topic Generator
  → Convex topics/blocks/embeddings → notification
```

### 2.3 Google ADK multi-agent generation

- `agents/topic-checker/agent.py`: một `LlmAgent` dùng `gemini-2.5-flash`, output schema `VALID`/`INVALID`, có tool tạo bad-topic notification.
- `agents/topic-generator/agent.py`: một `SequentialAgent` với các bước research brief, quiz, research deep, reorder, real-world impact, final quiz, summary/flashcards, category/tags/description, thumbnail, assembler và Convex inserter.
- Các bước dùng Pydantic output schemas/`output_key` để truyền trạng thái.

Đây là pattern tốt để GON tiến hóa thành pipeline sinh **Canonical Module Graph**, nhưng số agent, thứ tự, chi phí và điểm dừng cần được thiết kế/eval lại tại P03/P04.

### 2.4 Khối học tập và dữ liệu tương tác

Schema WSIC đã có:

- topics/categories/tags;
- embeddings;
- blocks với research, impact, summary/flashcards, quiz, reorder, final quiz;
- `userTopicInteractions`;
- notifications;
- counters views/likes/shares và một công thức trending cơ bản theo tương tác 24 giờ + tổng tương tác + age decay.

Các khái niệm này hữu ích cho GON, nhưng chưa phải Canonical Module Graph, Journey Fork, Proof hay personal footprint recommender hoàn chỉnh.

### 2.5 Async/retry và auth pattern

- QStash route dùng retry/delay cho job sinh topic.
- Generator API ánh xạ lỗi không thể retry bằng HTTP `489` và header `Upstash-NonRetryable-Error`.
- Better Auth được cấu hình với PostgreSQL `Pool`, email/password, Google OAuth, anonymous guest và cookie cache.

GON có thể học các pattern này; lựa chọn vendor chính thức thuộc P03.

## 3. Quyết định reuse theo thành phần

| Thành phần | Quyết định | Điều kiện |
|---|---|---|
| Embedding call 768D + vector index concept | **Port có sửa hoặc Adapt** | Tách khỏi Convex nếu P03 chọn DB khác; thêm model/version/chunk metadata |
| `searchSimilarTopicsByTerm` | **Adapt** | Thêm auth/rate limit, hybrid search, threshold calibration và không trả raw vectors |
| Brew CTA/threshold flow | **Pattern reimplementation** | UX và eligibility theo P01/P02; server quyết định Brew, client không tự quyết chi phí |
| Topic Checker prompt/schema | **Ứng viên Adapt** | Eval với dữ liệu VI/EN, bỏ quyền ghi DB trực tiếp khỏi agent nếu không cần |
| Topic Generator agent schemas/prompts | **Ứng viên Adapt từng phần** | Tách thành Canonical Module Graph stages; đo chi phí/chất lượng; citation/provenance bắt buộc |
| Generator API session/retry mapping | **Pattern** | Thêm signed callbacks/auth, schema validation, timeout, idempotency và structured errors |
| Convex schema topics/blocks/interactions | **Adapt khái niệm** | Thiết kế lại authorization và lifecycle; không sao chép public mutation model |
| Better Auth + Google config | **Pattern/ứng viên dependency tại P03** | Cập nhật phiên bản, bỏ anonymous nếu không thuộc scope, rà soát session policy |
| QStash queue route | **Pattern** | Thêm auth, quota, validation, dedupe và signed delivery |
| Trending counters/formula | **Primitive tham khảo** | GON tự xây trend/footprint ranking và chống thao túng |

## 4. Rủi ro và nợ kỹ thuật nhìn thấy

### Nguồn gốc: authorization/data-access boundary

Trong các Convex functions đã kiểm tra, không thấy `ctx.auth.getUserIdentity()` hoặc kiểm tra danh tính tương đương trước các thao tác nhạy cảm. Nhiều function được export dưới dạng public `query`/`mutation`/`action` và tin `userId` do caller truyền.

Ví dụ đáng chú ý:

- `topics:createTopic` được ghi là public function và đặt `isPublished: true` ngay khi insert.
- `topics:publishTopic`, `topics:deleteTopic` là public mutations theo `topicId`.
- `embeddings:createEmbedding`, `deleteEmbedding`, `deleteEmbeddingsByTopic` là mutations có thể thay đổi/xóa vector.
- Một số public queries trả **full embedding vectors**.
- Notification/interaction functions nhận `userId` từ args thay vì suy ra từ authenticated identity trong phần code đã kiểm tra.

**Hệ quả:** không được mang nguyên mô hình data-access này sang GON production. Mọi write path phải suy ra actor từ session/token tin cậy, kiểm tra quyền theo resource và có Audit log.

### Nguồn gốc: lạm dụng chi phí AI và callback trust

- Handler queue đã kiểm tra chưa thể hiện auth, schema validation chặt, quota hay rate limit trước khi publish job lên QStash.
- Generator API nhận `user_id` từ JSON body; tại Gate 0 chưa thấy chữ ký QStash/webhook verification hay service auth rõ ràng trong các handler chính.
- ADK tools có thể ghi trực tiếp vào Convex. Nếu agent bị prompt-injection hoặc output bị thao túng, blast radius lớn hơn mức cần thiết.
- `publish_immediately` mặc định `True`; kết hợp với `createTopic` tự đặt published khiến nội dung AI có thể công khai trước moderation/provenance review.

GON cần: authenticated Brew request, dedupe theo normalized topic/input hash, quota/budget, job ownership, signed callbacks, agent tools tối thiểu theo nguyên tắc least privilege và trạng thái `draft → safety/review → published` theo policy P01/P03.

### Nguồn gốc/Nguồn gốc: diagnostics endpoint

Route health/auth đã kiểm tra trả thông tin hiện diện biến môi trường và chẩn đoán database/table (không lộ secret values trong phần Audit). Comment trong dự án cũng cho thấy đây là endpoint tạm để gỡ lỗi đăng nhập. Endpoint dạng này không được đưa sang production nếu chưa có auth và giảm thông tin.

### Nguồn gốc: dependencies tại thời điểm Audit

`npm audit --package-lock-only` trên lockfile snapshot báo **38 vulnerabilities**: 2 low, 8 moderate, 25 high, 3 critical; tổng 692 dependencies được thống kê. Trong nhóm nghiêm trọng có các dependency trực tiếp như `next` và `better-auth` theo advisory tại thời điểm chạy Audit.

Con số này không tự động chứng minh mọi lỗ hổng đều khai thác được trong WSIC, nhưng đủ để kết luận:

- không dùng lại lockfile nguyên trạng;
- tạo dependency baseline mới tại P03;
- cập nhật/pin versions;
- chạy SCA/SBOM và kiểm thử hồi quy trước khi port.

### Nguồn gốc: kiểm thử, CI và vận hành

- Snapshot không có `.github/workflows`.
- Chỉ tìm thấy hai file test Python: `generator_api/test_parse_json.py` và `agents/topic-generator/test_insertion.py`.
- Chưa thấy bộ test TypeScript cho search/auth/data authorization hoặc contract test cho toàn pipeline trong snapshot.
- Pipeline 11 bước tuần tự có nguy cơ latency/chi phí cao và khó phục hồi từng phần; cần stage checkpoints, partial results và cancellation tại P03.

### Nguồn gốc: dịch vụ ngoài chưa được GON duyệt

Topic Generator dùng thêm các hướng như Exa/Serper cho research/image search. Các dịch vụ này kéo theo chi phí, điều khoản sử dụng, bản quyền nội dung/hình ảnh và dữ liệu gửi ra ngoài. Gate 0 không tự động duyệt chúng cho GON; P03 phải quyết bằng ADR/evaluation.

## 5. Điều kiện bắt buộc khi chuyển sang GON

1. Thiết kế lại identity/authorization: không tin `userId` từ client/agent payload.
2. Raw embedding vectors là dữ liệu nội bộ; không public query mặc định.
3. Search/Brew có rate limit, quota, deduplication, idempotency key và budget alarms.
4. Agent không giữ quyền publish/delete trực tiếp; service layer kiểm tra schema, policy và provenance trước khi ghi/publish.
5. Nội dung AI có trạng thái review/moderation; không mặc định public.
6. Mọi external research/media source phải có URL, thời gian truy xuất, license/usage note và citation mapping vào module.
7. Cập nhật dependencies và chạy `npm audit`/SCA trên baseline mới; không copy lockfile cũ.
8. Bổ sung unit/contract/AI-eval tests cho checker, từng generator stage, assembler và insertion.
9. Ghi MIT attribution, upstream URL/commit và modifications cho mọi phần được port.

## 6. Kết luận cho PO

WSIC là nguồn gần nhất với trái tim Search → Brew → Module của GON. Tuy nhiên, phần đáng dùng là:

- embedding/vector-search contract;
- Brew flow;
- ADK checker/generator patterns;
- block/schema và async job ideas.

Phần **không** được bê nguyên là trust boundary hiện tại: public mutations, caller-supplied user IDs, auto-publish, diagnostics và dependency baseline.
