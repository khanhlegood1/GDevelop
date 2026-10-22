# P03 — Migration & Backward Compatibility Plan

> **Trạng thái:** **APPROVED — Product Owner đã duyệt P03 ngày 22/10/2026**<br>
> **Quyết định liên quan:** `D-P03-14`<br>
> **Mục đích:** cho phép P04 tiến hóa database/API/schema mà không phá Journey đang học, ModuleVersion đã Fork, XP Ledger, Proof, vote hoặc dữ liệu private cũ.

## 1. Nguyên tắc

1. **Additive trước, breaking sau:** trong cùng major version chỉ thêm field/endpoint/enum có fallback; không đổi nghĩa hoặc xóa field.
2. **Dữ liệu lịch sử bất biến:** Module Graph, RankingSnapshot, Arena vote, XP entries, ProofVerificationEvent và audit records đã ghi không bị viết lại để “đẹp theo schema mới”.
3. **Đọc được quá khứ:** code mới phải đọc được version đang được hỗ trợ trước khi được phép ghi version mới.
4. **Migration có thể dừng/diễn lại an toàn:** backfill theo lô, có checkpoint, idempotent và không phụ thuộc vào một lần chạy duy nhất.
5. **Không rollback bằng cách phá dữ liệu:** rollback ứng dụng dùng code/flag tương thích với schema đã expand; sửa dữ liệu tiến về phía trước bằng migration mới có Audit.
6. **Mọi thay đổi contract đi cùng fixture/test:** OpenAPI, JSON Schema, examples, mock responses và traceability thay đổi trong cùng PR với code P04.

## 2. Các bề mặt có version độc lập

| Bề mặt | Version hiện tại đề xuất | Quy tắc tương thích |
|---|---|---|
| HTTP API | `/v1`, OpenAPI document `1.0.0-proposed-p03` | Additive trong `/v1`; breaking change cần major mới hoặc ADR + thời gian hỗ trợ song song |
| Canonical Module Graph | `gon.module-graph/1.0` | ModuleVersion cũ giữ nguyên; chuyển đổi chỉ tạo projection/version mới |
| Domain events | `eventVersion` theo từng `eventType` | Consumer bỏ qua field lạ; thay đổi phá vỡ phải tăng version và giữ handler cũ tới khi outbox/DLQ sạch |
| Async jobs | `gon.job/1.0` | Worker phải xử lý job version cũ còn trong hàng đợi trước khi gỡ handler |
| ADK agent I/O | `gon.agent.* /1.0` | Worker/API validate cả input/output; agent mới không được ghi DB hoặc publish trực tiếp |
| Embedding | `gon-semantic-v1`, 768D | Không trộn vector của hai profile trong cùng phép so sánh; profile mới chạy song song trước cutover |
| Search policy | `search-policy-v0` seed | SearchAttempt lưu policy version; ngưỡng mới chỉ áp dụng cho search mới |
| Ranking | `ranking-rules-v1` | Snapshot cũ bất biến; rule mới tạo snapshot mới, không xếp lại lịch sử âm thầm |
| XP | `xp-rules-v1`, level formula `gon-level-v1` | Entry cũ giữ rule version; sửa sai bằng reversal có audit, không sửa delta tại chỗ |
| Game events | `gon.game-events/1.0` | Session khóa template/schema version; event cũ vẫn được validate tới khi session hết hạn |
| Database schema | Migration tuyến tính của P04 | Expand–migrate–contract; không xóa cột/bảng ngay trong release đổi hành vi |

## 3. Phân loại thay đổi

### 3.1 Được phép trong cùng major

- Thêm endpoint mới hoặc query parameter tùy chọn.
- Thêm response field mới mà client cũ có thể bỏ qua.
- Thêm request field tùy chọn có default an toàn.
- Thêm enum value khi client được yêu cầu hiển thị trạng thái generic nếu chưa biết.
- Thêm index, bảng mới hoặc cột nullable/defaulted không đổi nghĩa dữ liệu cũ.
- Thêm event type mới; consumer cũ không bị buộc xử lý.

### 3.2 Bị cấm trong cùng major

- Xóa/đổi tên field, endpoint, event type hoặc error code đã công bố.
- Đổi kiểu dữ liệu, đơn vị, timezone, thứ tự pagination hoặc nghĩa của status.
- Làm một field đang optional thành bắt buộc đối với client cũ.
- Thu hẹp quyền truy cập theo cách làm dữ liệu hợp lệ cũ biến mất mà không có tombstone/thông báo.
- Dùng lại một ID/code đã xóa cho nghĩa khác.
- Viết lại ModuleVersion/RankingSnapshot/XP/vote lịch sử để phù hợp rule mới.

### 3.3 Khi bắt buộc breaking change

1. Ghi ADR hoặc amendment chỉ rõ lý do, dữ liệu bị ảnh hưởng và phương án thay thế.
2. Tăng major API/schema hoặc tạo surface mới song song.
3. Giữ reader/handler cũ cho tới khi dữ liệu, hàng đợi và client được hỗ trợ đã sạch.
4. Cung cấp migration fixture từ version cũ sang mới và test một Journey/Proof/vote thật ở dạng dữ liệu mẫu.
5. PO duyệt riêng nếu thay đổi ảnh hưởng XP/Level, Proof verification, quyền riêng tư hoặc hành vi đã hứa trong P01/P02.

## 4. Database: expand–migrate–contract

### Giai đoạn 0 — Chuẩn bị

- Ghi rõ migration owner, bảng/aggregate bị ảnh hưởng, ước lượng số dòng và cửa sổ khóa.
- Chụp kiểm chứng trước thay đổi: counts theo owner/status/version, checksum các ledger quan trọng và truy vấn authorization mẫu.
- Chuẩn bị feature flag để tắt đường ghi mới mà không cần rollback schema.

### Giai đoạn 1 — Expand

- Thêm bảng/cột/index mới ở dạng nullable hoặc có default an toàn.
- Thêm constraint theo hướng không phá dòng cũ; với PostgreSQL, cân nhắc `NOT VALID` rồi validate sau backfill và tạo index không khóa dài khi phù hợp.
- Code phát hành ở giai đoạn này vẫn đọc/ghi được schema cũ.

### Giai đoạn 2 — Dual-compatible writes

- Ghi dữ liệu mới vào cả cấu trúc cũ/mới khi cần, hoặc ghi cấu trúc mới kèm projection tương thích cho reader cũ.
- Mọi ghi song song phải nằm trong cùng transaction nghiệp vụ hoặc có outbox/reconciliation job truy vết được.
- Không để client tự quyết định version dữ liệu được ghi.

### Giai đoạn 3 — Backfill

- Chạy theo lô nhỏ có thứ tự ổn định, checkpoint và khả năng chạy lại.
- Mỗi lô ghi số dòng đã xử lý, số lỗi, aggregate cuối cùng và correlation ID; lỗi một dòng không được âm thầm biến thành dữ liệu rỗng.
- Tôn trọng `deletedAt`, visibility và retention: dữ liệu đã tombstone không được “hồi sinh” qua backfill.
- Với JSONB graph, backfill chỉ tạo projection/index phụ; không sửa snapshot gốc.

### Giai đoạn 4 — Switch reads

- Bật reader mới cho nhóm nhỏ/feature flag, so sánh kết quả với reader cũ trên cùng tập kiểm chứng.
- Kiểm tra riêng các aggregate: Project workspace, SearchAttempt, Output Explorer, Journey Player, Progress và Proof Vault.
- Nếu sai lệch, tắt flag và quay lại reader cũ; dữ liệu expand giữ nguyên để điều tra.

### Giai đoạn 5 — Switch writes và ổn định

- Chỉ chuyển writer sau khi reader mới chứng minh đúng.
- Giữ đường tương thích cũ ít nhất qua một release ổn định hoặc tới khi hàng đợi/session/client cũ không còn, tùy mốc nào đến sau.
- Theo dõi error codes, job DLQ, search verdict distribution, XP reversals và authorization denials bất thường.

### Giai đoạn 6 — Contract

- Gỡ cột/bảng/handler cũ bằng migration riêng, sau khi có bằng chứng không còn reader/writer/job dùng chúng.
- Không gộp contract vào cùng release vừa chuyển hành vi.
- Cập nhật ERD/schema docs và xóa fixture cũ chỉ khi version đó chính thức hết hỗ trợ.

## 5. API và client compatibility

- Client phải bỏ qua field lạ và không suy ra quyền từ việc một field có mặt.
- Server không dựa vào client để lọc private data; nâng cấp authorization có hiệu lực ngay cả với client cũ.
- Error `code` là contract ổn định; message hiển thị qua `messageKey` có thể địa phương hóa mà không đổi code.
- Enum lạ phải đi vào trạng thái generic an toàn ở frontend, không crash và không hiển thị thành công giả.
- Cursor pagination là opaque; server có thể đổi cách mã hóa cursor nhưng phải chấp nhận cursor đã phát hành cho tới khi hết phiên sử dụng hợp lý hoặc trả lỗi có next action rõ.
- `Idempotency-Key` và version/ETag semantics không được đổi nghĩa trong `/v1`.
- Khi một endpoint bị thay thế, OpenAPI ghi `deprecated: true`, tài liệu nêu endpoint thay thế và chỉ gỡ ở major tiếp theo.

## 6. Module Graph, renderer và Journey

- `ModuleVersion.graph` là snapshot bất biến kèm `schemaVersion` và content hash.
- Reader mới đọc mọi graph version còn được Alpha hỗ trợ. Nếu cần upcast để render, upcast diễn ra trong bộ nhớ/read projection; bản lưu không thay đổi.
- Nếu việc sửa nội dung là cần thiết, tạo `ModuleVersion` mới. JourneyBranch cũ tiếp tục trỏ vào version đã Fork; chỉ người học mới chủ động chuyển khi có UX/policy riêng.
- Node type mới phải có web/text fallback. Renderer không hiểu node có nghĩa vụ báo unsupported an toàn, không bỏ qua assessment bắt buộc rồi vẫn đánh dấu hoàn thành.
- Rubric mới chỉ áp dụng cho ModuleVersion/attempt mới. Attempt đã nộp được chấm theo rubric đã snapshot tại thời điểm học.

## 7. Event, job và ADK upgrades

- Producer chỉ phát hành event version mới sau khi consumer production đã hiểu cả cũ và mới.
- Outbox/DLQ replay giữ `eventId`, aggregate và correlation gốc; consumer idempotent theo `eventId`.
- Job payload tăng version phải có handler song song cho payload cũ còn queued/leased.
- Thay model/prompt/agent không đổi schema lặng lẽ: `AiRun` ghi model, prompt template, pipeline và schema versions để tái lập quyết định.
- Output agent không đạt schema mới bị từ chối ở worker; không nới validation chỉ để job “thành công”.

## 8. Embedding/search-profile migration

1. Tạo profile mới độc lập, gồm model/version, dimensions, normalization, chunking và distance.
2. Re-embed theo job có quota/checkpoint vào cột/index riêng; dữ liệu nguồn/chunk không bị ghi đè mất truy vết.
3. Chạy shadow evaluation trên bộ truy vấn đã gán nhãn và so sánh false-found/false-missing, latency, cost theo ngôn ngữ/loại artifact.
4. Cutover bằng policy version mới chỉ cho SearchAttempt mới; kết quả cũ giữ policy/profile đã dùng.
5. Giữ profile cũ ở chế độ đọc/rollback cho tới khi cửa sổ đánh giá kết thúc; sau đó xóa vector cũ theo retention đã duyệt.
6. Không bao giờ tính similarity giữa hai vector khác profile như thể cùng một không gian.

## 9. Ranking, XP và Proof khi rule thay đổi

- Ranking rule mới không viết lại `RankingSnapshot` cũ và không biến vote cũ thành bằng chứng chất lượng tuyệt đối.
- XP rule mới chỉ áp dụng cho learning event mới. Nếu phát hiện ghi sai, tạo reversal/adjustment theo quy trình review; Lifetime XP được tính lại từ ledger sau reversal.
- Đổi công thức level phải có formula version mới và quyết định PO riêng vì thuộc cam kết sản phẩm/White Paper.
- Tiêu chuẩn Proof verification mới không tự nâng/hạ cấp proof cũ; thay đổi cấp phải thành `ProofVerificationEvent` có verifier/reason.

## 10. Dữ liệu prototype hiện có

Hai prototype trong `apps/gon-web` dùng dữ liệu mô phỏng/`localStorage` để chứng minh UX và logic. Chúng **không phải nguồn sự thật production**:

- P04 không tự động nhập XP, Proof, vote hoặc journey từ `localStorage` thành dữ liệu server đã xác minh.
- Nếu sau này cần import demo, phải có hành động opt-in của người dùng, ánh xạ trường rõ ràng và mọi bằng chứng nhập vào bắt đầu ở mức self-declared/draft phù hợp.
- Seed module cho Alpha được tạo qua cùng Module Graph validation/provenance gates; không sao chép nguyên trạng dữ liệu demo không rõ nguồn.

## 11. Rollback và forward-fix

| Tình huống | Cách xử lý ưu tiên |
|---|---|
| Reader mới trả sai aggregate | Tắt feature flag, quay lại reader cũ; giữ schema expand |
| Writer mới tạo dữ liệu không hợp lệ | Tắt writer/kill switch, đóng băng aggregate bị ảnh hưởng, sửa bằng migration tiến và audit |
| Backfill lỗi giữa chừng | Dừng job, dùng checkpoint; sửa transformer rồi chạy lại idempotent |
| Event/job version mới làm DLQ tăng | Dừng producer version mới, giữ consumer song song, replay sau khi sửa |
| Search profile mới gây false-found | Quay policy về profile cũ cho search mới; không sửa SearchAttempt lịch sử |
| XP/Proof bị ảnh hưởng | Đóng băng phát hành liên quan, review từng entry và tạo reversal/verification event, không sửa tay tại chỗ |
| Lộ dữ liệu private do migration | Thu hồi quyền/kill switch trước, Audit phạm vi, sau đó mới forward-fix và báo gate P05/PO |

## 12. Bằng chứng bắt buộc cho mỗi migration ở P04

- Migration chạy được trên database rỗng và trên fixture giống dữ liệu của release trước.
- Test authorization trước/sau: user A không đọc được Project/Artifact/Journey/Proof private của user B.
- Golden fixtures cho mọi schema version còn hỗ trợ, không chỉ version mới nhất.
- Kiểm tổng XP, số vote hợp lệ, số ModuleVersion, số Proof theo level và lineage trước/sau backfill.
- Contract validator và contract tests của API/agent/event/job/game đều đạt.
- Có ghi chú release: version được thêm, version còn hỗ trợ, thời điểm dự kiến contract và flag dùng để rollback hành vi.

Kế hoạch này là contract tiến hóa, không tự nó chứng minh migration production đã an toàn. P05 vẫn phải diễn tập backup/restore và rà soát bảo mật trên implementation thật trước P06.
