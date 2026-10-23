# P05 — Performance, Accessibility và AI Evaluation

> **Kết luận:** hiệu năng local ở quy mô một người dùng/một project không cho thấy điểm nghẽn tức thời, nhưng kiến trúc memory đồng bộ hiện tại không phải bằng chứng tải production. Accessibility có nền tảng tốt và đã sửa tab pattern, song chưa có browser/assistive-technology Audit. AI safeguards ở mức contract chạy được; chất lượng Gemini/ADK thật **NOT RUN**.

## 1. Performance

### 1.1 Kết quả local

Benchmark đầy đủ và điều kiện đo nằm tại [NFR specification](NFR-SPECIFICATION-AND-RESULTS.md#41-http-benchmark). Các điểm đáng chú ý:

- bootstrap/projects/workspace p95 từ 12,6–18,7 ms ở chế độ tuần tự;
- Search POST p95 28,2 ms trên 10 mẫu;
- 50 bootstrap requests với 10 workers đạt 142,6 req/s wall-clock;
- một local Brew hoàn tất trong 155,2 ms;
- production JS/CSS khoảng 633 KB raw / 192 KB gzip.

Đây là **smoke benchmark**, không phải load test: Next dev server, một process, một user, một project, memory store, local hash embedding và local Brew. Không có PostgreSQL/pgvector, network provider, queue, cold start, trình duyệt hay dữ liệu nhiều người dùng.

### 1.2 Rủi ro scale nhìn từ code

| Đường xử lý | Hành vi hiện tại | Rủi ro khi dữ liệu tăng |
|---|---|---|
| Search | Lọc visible module versions, sau đó với mỗi version lại quét danh sách chunks để tìm module chunks và tính cosine 768D | Tiệm cận `O(moduleVersions × totalChunks + candidateChunks × 768)`; CPU tăng nhanh và không dùng HNSW/FTS index |
| Artifact text | Chunk rồi `await` embedding tuần tự từng chunk trong cùng HTTP request/job đồng bộ | Gemini thật sẽ biến thành nhiều round-trip nối tiếp; request dễ timeout và không có backpressure |
| Brew | Ghi job record nhưng xử lý local generation đồng bộ trước response | Không có queue isolation, lease, retry hoặc giới hạn concurrency; một Brew chậm có thể giữ request/process |
| Lists/workspace | Nhiều hàm spread/filter/sort toàn bộ Map trong memory | Chi phí tăng theo tổng dữ liệu hệ thống thay vì dữ liệu của actor/trang |
| Upload objects/outbox/Audit | Bytes và arrays nằm trong process, không có retention/compaction | Memory pressure, restart mất dữ liệu, không scale ngang |
| UI | Một client component khoảng 1.300 dòng cho toàn bộ VS1 | Bundle/hydration và re-render khó tối ưu theo màn hình; chưa có budget/Web Vitals |

### 1.3 Bề mặt tải theo yêu cầu P05

| Bề mặt | Trạng thái |
|---|---|
| Search API | Đã benchmark local rất nhỏ; S-P03-01 PostgreSQL **NOT RUN** |
| Job generation | Local synchronous 1 mẫu; durable queue/Gemini **NOT RUN** |
| Vote | Arena/vote chưa triển khai trong VS1 — không có bề mặt để load test |
| Realtime | Chưa triển khai — không có bề mặt để load test |
| Upload | Local simulated upload có giới hạn; signed Cloud Storage **NOT RUN** |
| Browser rendering | Chưa có Chromium/Firefox trong sandbox — Web Vitals **NOT RUN** |

### 1.4 Kế hoạch load test staging bắt buộc

1. Seed corpus theo [điều kiện đo chuẩn](NFR-SPECIFICATION-AND-RESULTS.md#31-điều-kiện-đo-chuẩn-đề-xuất), gồm dữ liệu của nhiều owner để kiểm authorization filter trước ranking/limit.
2. Chạy S-P03-01: ghi `EXPLAIN (ANALYZE, BUFFERS)`, latency theo vector/FTS/trigram/hybrid, verdict fixtures và recall trên nhãn VI/EN.
3. Dùng k6 hoặc công cụ tương đương với các profile: read-heavy, Search, artifact processing, 5 Brew đồng thời, provider timeout/429 và ramp vượt quota.
4. Đo DB CPU/IO/connections, queue age, job retries, Cloud Run instances/cold starts, provider token/cost và error taxonomy.
5. Chạy soak test tối thiểu 2 giờ cho staging candidate để phát hiện memory/connection leaks; mọi ngưỡng dùng target tại NFR-PERF-01…06.
6. Đo browser bằng thiết bị/mạng tham chiếu và đặt bundle/Web Vitals budgets trong CI.

## 2. Accessibility Audit

### 2.1 Phương pháp đã dùng

- Manual source review của `Vs1App.tsx`, `layout.tsx` và `globals.css`;
- đếm/kiểm tra labels, ARIA landmarks/live regions, progress semantics và tab pattern;
- tính contrast theo công thức WCAG cho các cặp màu đặc chính;
- kiểm tra focus-visible, touch target, responsive breakpoints và reduced motion trong CSS.

Sandbox không có Chromium/Chrome/Firefox, screen reader hoặc người dùng khuyết tật tham gia kiểm thử. Vì vậy kết quả dưới đây là **static Audit**, không phải tuyên bố đạt WCAG.

### 2.2 Điểm đạt được

- `<html lang="vi">`, skip link tới `#main-content`, landmark `main/nav`, heading theo từng view và `aria-labelledby` cho nhiều section.
- Form VS1 có 28 `<label>` cho 16 input, 5 select, 7 textarea; không phát hiện control nào thiếu label rõ ràng trong static scan.
- Có `aria-live` cho notice/busy, `role="alert"` cho lỗi, `role="progressbar"` cho tiến trình và text thay thế trong module graph.
- Nút/link chính có `min-height: 48px`; `:focus-visible` dùng outline 3 px; CSS có `prefers-reduced-motion`.
- Màu đặc chính đạt contrast tốt: body trên midnight 17,78:1; muted trên panel 9,06:1; chữ phụ trên trắng 7,33:1; trắng trên emerald-700 5,48:1; ink trên gold 10,84:1; crimson trên midnight 5,10:1.
- Không có `<img>` trong VS1 UI nên không có alt-text debt ở bề mặt hiện tại; nội dung học chính có dạng text.

### 2.3 Đã sửa trong P05

Learning Player trước đây dùng `role="tablist"`/`role="tab"` nhưng chưa có quan hệ tab-panel và keyboard pattern đầy đủ. P05 bổ sung:

- `id` ổn định cho từng tab và `aria-controls="active-node-panel"`;
- panel có `role="tabpanel"`, `aria-labelledby` trỏ về tab đang chọn và `tabIndex=0`;
- roving tabindex: chỉ tab đang chọn nằm trong Tab order;
- ArrowLeft/ArrowRight/Home/End di chuyển giữa các tab không bị khóa, đồng thời chọn và focus tab đích.

### 2.4 Gap còn mở

| ID | Gap | Mức | Cách đóng |
|---|---|---|---|
| A-P05-01 | Lỗi validation chủ yếu hiện ở hộp lỗi toàn cục; field chưa có `aria-invalid`/`aria-describedby` và focus chưa được đưa tới lỗi đầu tiên | Medium | Field-level error model + focus management + AT test |
| A-P05-02 | Chuyển view bằng nav chưa thông báo rõ nội dung mới cho screen reader ngoài thay đổi `aria-current` | Medium | Focus heading hoặc live announcement có kiểm soát, kiểm thử NVDA/VoiceOver |
| A-P05-03 | Contrast trên gradient, trạng thái disabled/hover/focus và badge dài ở mobile chưa được kiểm bằng rendering thật | Medium | Browser screenshots/axe ở 320–1440 px, zoom 200%, forced-colors nếu hỗ trợ |
| A-P05-04 | Font `Be Vietnam Pro` được khai báo nhưng layout chưa nạp font; fallback phụ thuộc hệ điều hành | Low | Self-host/subset font có license rõ hoặc chấp nhận system-font policy và kiểm dấu tiếng Việt |
| A-P05-05 | Chưa có kiểm thử người dùng thật với bàn phím/screen reader/zoom; usability validation P02 vẫn mở | Medium | Kịch bản AT cho onboarding → Search/Brew → Player → Boss → Proof với người dùng đại diện |

## 3. AI/Search evaluation

### 3.1 Những gì đã được kiểm chứng local

| Khía cạnh | Bằng chứng | Giới hạn |
|---|---|---|
| Embedding contract | Local provider trả đúng 768D, normalized, deterministic và không tự nhãn Gemini; Gemini adapter yêu cầu đúng 768 values và timeout 20 giây | Local hash dựa token/bigram, không chứng minh semantic quality; Gemini chưa gọi thật |
| Search safeguards | Memory runtime và PostgreSQL repository đều authorization-filter trước scoring/candidate limit; verdict `found/related/missing/needs_clarification/blocked_by_policy`; DTO không lộ internal scores | PostgreSQL repository đã wired vào VS1 ở R1.2 và chạy trên PGlite; managed PostgreSQL, corpus có nhãn và hiệu chuẩn ngưỡng vẫn chưa chạy |
| Module graph | AJV/JSON Schema + semantic validation; graph phải có concept/retrieval/transfer/boss, rubric links và citation trong evidence bundle | Citation tồn tại không đồng nghĩa citation thực sự hỗ trợ từng factual claim |
| Prompt-injection boundary | ADK instruction coi artifact/evidence/answer là untrusted; agents không tools/transfer/DB/publish | Chưa có adversarial evaluation trên Gemini; instruction không phải security boundary duy nhất |
| Moderation sơ bộ | Web/ADK local có blocklist hẹp cho yêu cầu chế tạo bom/vũ khí/malware/tự hại và một số cụm hack/đánh cắp | Dễ bypass bằng paraphrase/ngôn ngữ khác; chưa có policy classifier/human moderation workflow hoàn chỉnh |
| Assessment | Rubric deterministic, disclosure Boss, similarity ≥ 0,82 hoặc criterion chưa biết → `pending_human_review`; XP chỉ sau passed | Rule dựa phrase/section/length dễ keyword-stuffing; confidence 0,80–0,84 là hằng số chưa hiệu chuẩn |
| Cost controls | Search 60/giờ, Brew 5/ngày, artifact 20/ngày; Brew kill switch; provider timeout | Chỉ trong memory, không meter token/tiền, không có budget reservation/circuit breaker |
| Fallback | Google provider thiếu cấu hình trả 503; Search lỗi được ghi `failed_retryable`; local provider được nhãn rõ | Chưa có durable retry/repair, provider outage drill hoặc degraded UX được kiểm chứng |

### 3.2 Vì sao chưa thể kết luận chất lượng AI

- Chưa chạy `gemini-embedding-001` hoặc bất kỳ Gemini generation model nào bằng credentials kiểm thử.
- TypeScript service chưa gọi ADK service; ba Google agents mới instantiate và fail-closed trong test.
- Local graph chủ yếu dùng template + excerpt từ evidence, nên test hiện tại kiểm contract nhiều hơn khả năng tổng hợp factual.
- Search local dùng hash features; từ đồng nghĩa/paraphrase không có overlap có thể bị đánh giá thấp, còn collision có thể tạo false positive.
- Assessment local kiểm sự hiện diện của nhóm từ/tiêu đề mục/độ dài. Nó hữu ích như guardrail deterministic nhưng không phải bằng chứng hiểu sâu.
- Candidate ranking hiện dùng signals nội bộ và Learning Mode; trend/footprint/vote thật chưa triển khai nên chưa đánh giá được recommender.

### 3.3 Bộ evaluation bắt buộc trước khi bật AI thật

#### Dataset

- Tối thiểu 100 golden cases VI/EN cho Search/Brew: found, related, missing, ambiguous, metadata-only, nguồn mâu thuẫn, nguồn yếu, chủ đề chuyên sâu/creator/entertainment/advanced.
- Ít nhất 30 adversarial cases: prompt injection trong text/URL metadata/file, yêu cầu lộ sample answer/system instruction/dữ liệu user khác, nội dung độc hại được paraphrase, copy nguyên văn, keyword stuffing và artifact có tuyên bố sai.
- Ít nhất 100 attempts được hai người chấm độc lập cho Retrieval/Transfer/Boss để đo agreement; mọi bất đồng phải có adjudication.
- Dữ liệu evaluation không dùng dữ liệu người dùng thật nếu chưa có consent/policy riêng; lưu version, nguồn và license của từng case.

#### Metrics và ngưỡng đề xuất

| Nhóm | Metric | Ngưỡng mở tính năng đề xuất |
|---|---|---|
| Search | Precision@5, Recall@k, verdict confusion matrix, latency theo corpus | PO duyệt theo baseline S-P03-01; không có false `found` nghiêm trọng trong golden set |
| Grounding | % factual claims được citation hỗ trợ, citation precision, unsupported-claim rate | ≥ 90% claims được hỗ trợ; 0 lỗi factual nghiêm trọng trong mẫu phát hành |
| Schema/safety | Output hợp lệ sau validate, citation ngoài bundle, policy bypass | 100% output được persist hợp lệ; 0 citation ngoài bundle; 0 bypass nghiêm trọng |
| Prompt injection | Data exfiltration, XP/publish/tool misuse, instruction leakage | 0 case thành công ở mức nghiêm trọng; mọi case mơ hồ vào review/block |
| Assessment | Cohen's κ, false-pass/false-fail, calibration theo confidence | κ ≥ 0,70 trước auto-pass; false-pass phải thấp hơn ngưỡng PO duyệt và được báo cáo riêng |
| Learning quality | Rubric coverage, transfer quality, human usefulness rating | Đạt rubric sản phẩm/giáo dục đã duyệt, không chỉ đúng schema |
| Cost | Token/cost p50/p95 theo Search/Brew/assessment, retry amplification | 100% runs có meter; p95 nằm trong ngân sách PO đặt; alert/kill switch hoạt động |
| Reliability | Timeout/429/5xx, repair success, duplicate module rate | Không tạo module/XP trùng khi retry cùng fingerprint |

#### Quy tắc vận hành sau evaluation

1. Mọi output AI vẫn bắt đầu `draft_private`; không auto-publish.
2. Low confidence, evidence yếu/mâu thuẫn, similarity cao hoặc criterion chưa có rule an toàn phải vào `pending_human_review`.
3. Similarity chỉ là tín hiệu review, không được hiển thị như kết luận gian lận.
4. AiRun lưu model/prompt-template/policy versions, token/cost/latency và correlation IDs; không lưu chain-of-thought.
5. Thay model, prompt, embedding profile hoặc threshold phải chạy lại golden suite và ghi version; không trộn vectors khác profile trong cùng index.

## 4. Kết luận

- Performance: **local smoke đạt, production NOT RUN**.
- Accessibility: **static nền tảng tốt, WCAG browser/AT evidence chưa đạt**.
- AI: **contract safeguards đạt local, factuality/moderation/cost của Gemini/ADK NOT RUN**.

Cả ba hạng mục đều cần staging evidence trước khi P05 có thể được duyệt.
