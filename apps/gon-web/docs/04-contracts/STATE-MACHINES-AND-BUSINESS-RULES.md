# P03 — State Machines & Business Rules

> 🔁 **Cập nhật PO — 24/10/2026 (tối muộn) — quyết định sản phẩm mới:** Persona đầu ra (🔬 PhD / Nghiên cứu · 🎬 KOL / Sáng tạo · 🎈 Giải trí · 🚀 Nâng cao) và các Độ sâu **không hiện ra cho user chọn** — mặc định **chạy tất cả các tổ hợp**, xuất nhiều output như feed TikTok. Output user chọn chính là Persona đầu ra của họ, đồng thời là tín hiệu **Arena** và **dấu chân đẳng cấp**. **Màn hình Brew và màn hình Arena đã được gộp vào chung màn hình Khám phá.** Nội dung dưới đây giữ nguyên làm tư liệu nền; chi tiết & trạng thái triển khai: [`PO-DECISION-UNIFIED-DISCOVER-2026-10-24.md`](../00-process/PO-DECISION-UNIFIED-DISCOVER-2026-10-24.md). Không thay đổi hợp đồng P03 đã chốt — nếu việc triển khai cần đụng contract thì đi qua quy trình thay đổi P03.

> **Trạng thái:** APPROVED tại P03 — Product Owner đã duyệt ngày 22/10/2026<br>
> **Mục tiêu:** Mọi màn P02 nhận trạng thái máy rõ ràng; client không tự suy ra quyền, XP, mastery hay verification từ màu sắc/thời gian xem.

## 1. Quy ước chuyển trạng thái

- Chuyển trạng thái chỉ qua command/event phía server có actor và request ID.
- Trạng thái terminal không tự quay lại active; muốn làm lại tạo attempt/job/version mới.
- Mọi transition quan trọng ghi domain event/audit tối thiểu.
- Lỗi được phân biệt `retryable` và `terminal`; UI nhận next action tương ứng.
- Xóa/ẩn bởi policy có thể chặn truy cập mà không ghi đè lịch sử học hợp lệ.

## 2. Account và onboarding

```text
invited → onboarding → active
active → suspended → active
active/suspended → deletion_pending → deleted
```

Quy tắc:

- `active` chỉ sau Google identity + invite hợp lệ (Private Alpha) + 18+ attestation + terms.
- Chọn personalization không được chặn quyền học lõi.
- `suspended`: không tạo project/Brew/vote/report mới trừ appeal/data request theo policy.
- Deep link khi chưa active được lưu dạng đích nội bộ an toàn; sau onboarding server kiểm tra lại quyền.

## 3. Source Artifact và extraction

### 3.1 Safety status

```text
pending_scan → allowed
             → blocked
             → needs_review
```

### 3.2 Extraction status

```text
queued → processing → ready
                   → partial
                   → metadata_only
                   → unsupported
                   → failed_retryable → queued
                   → failed_terminal
                   → blocked
```

Quy tắc hiển thị:

- `ready`: phần nội dung dự kiến đã có chunk.
- `partial`: có chunk nhưng thiếu trang/transcript/OCR hoặc một phần file.
- `metadata_only`: chỉ có title/description/thumbnail/metadata; không claim đã đọc nội dung chính.
- Artifact lỗi không làm mất project hoặc artifact hợp lệ khác.
- File thực thi, archive nguy hiểm, URL SSRF/private-network và MIME mismatch nghiêm trọng bị `blocked`.
- Xóa artifact chuyển tombstone ngay; chunks/embeddings bị loại khỏi search trước khi xóa vật lý hoàn tất.

## 4. Project workspace projection

Project không cần một state machine nghiệp vụ phức tạp riêng. `status` hiển thị được suy ra có thứ tự ưu tiên:

1. `blocked` nếu không còn artifact usable vì policy;
2. `processing` nếu artifact/search/Brew job đang chạy;
3. `needs_decision` nếu cần clarification, xác nhận Brew hoặc chọn candidate;
4. `learning` nếu có active journey;
5. `ready` nếu có candidate set;
6. `draft` nếu mới tạo;
7. `archived/deleted` theo lifecycle.

`nextAction` là enum máy: `add_input`, `wait_for_processing`, `answer_clarification`, `confirm_brew`, `choose_learning_path`, `continue_journey`, `review_proof`, `fix_artifact`, `none`.

## 5. SearchAttempt

```text
queued → running → completed
                 → failed
                 → cancelled
```

Khi `completed`, `verdict` bắt buộc thuộc:

- `found`
- `related`
- `missing`
- `needs_clarification`
- `blocked_by_policy`

Attempt bất biến sau completed. Sửa input/trả lời clarification tạo attempt mới và snapshot artifact versions mới.

## 6. Async Job và BrewJob

### 6.1 Job chung

```text
queued → running → succeeded
                 → needs_input → queued
                 → failed_retryable → queued
                 → failed_terminal
                 → cancelled
```

### 6.2 Brew steps

```text
validate_request
→ topic_and_safety_check
→ build_evidence_bundle
→ generate_module_graph
→ design_assessments
→ verify_citations
→ safety_and_policy_review
→ persist_draft
→ build_candidate_set
→ succeeded
```

Quy tắc:

- Double-click cùng idempotency key trả cùng job.
- Job active cùng fingerprint trả job hiện tại.
- `needs_input` nêu field/câu hỏi cụ thể; bổ sung không tạo logical request mới.
- Retry chỉ cho lỗi hạ tầng/provider tạm thời hoặc schema repair theo giới hạn.
- Cancel không xóa checkpoint đã ghi nhưng không công bố module chưa qua gate.
- `succeeded` chỉ khi ModuleVersion đã persist dạng `draft_private` và CandidateSet sẵn sàng hoặc có shortfall reason rõ.
- Kill switch chặn job mới; job đang chạy được policy quyết định dừng an toàn và thông báo trung thực.

## 7. Module và publication

```text
draft_private → pending_review → internal_reviewed
              → hidden
              → retired
internal_reviewed → hidden → pending_review/internal_reviewed theo quyết định mới
```

- AI Brew luôn bắt đầu `draft_private`.
- Không có transition tự động sang reviewed/public.
- User chỉ học module private của mình hoặc `internal_reviewed` trong Alpha.
- `hidden` do moderation chặn truy cập mới; branch hiện có nhận placeholder/next step theo policy, không âm thầm xóa XP/proof đã posted nếu chưa có quyết định reversal.

Grounding status độc lập với publication:

```text
unverified → partially_cited → citation_checked
```

## 8. CandidateSet và RankingSnapshot

CandidateSet:

```text
building → ready
         → ready_with_shortfall
         → failed
         → stale
```

RankingSnapshot bất biến. Nó thành `stale` cho mục đích hiển thị khi:

- mode thay đổi;
- personalization tắt/bật;
- candidate bị hidden/policy thay đổi;
- candidate set có version mới;
- quá `staleAt`.

Client tạo snapshot mới qua `POST /projects/{projectId}/ranking-snapshots`; không sửa snapshot cũ.

## 9. ArenaMatch và Vote

```text
open → voted
open → expired
open → cancelled
open → invalidated
```

- Match chỉ tạo từ hai candidate eligible thuộc cùng project/candidate set.
- Trước vote, API không trả candidateId/title/creator/model gốc.
- Một user có tối đa một valid vote/match. Gửi lại cùng payload/idempotency trả kết quả cũ.
- Alpha không sửa vote sau `voted`.
- `merge` ghi vote trước; candidate hợp nhất có thể tạo đồng bộ từ template hoặc qua job. Nếu job chưa xong, response nói pending.
- Candidate bị hidden trước vote làm match `invalidated`; sau vote, lịch sử giữ nguyên nhưng không dùng để Fork candidate bị gỡ.

## 10. JourneyBranch và BranchCommit

```text
active → completed
active → archived
active/completed → deleted
```

- Fork khóa `upstreamModuleVersionId` và attribution snapshot.
- Nếu đã có active branch cùng owner + upstream, `ifExists=return_existing` trả branch đó; `create_new` mới tạo thêm.
- `completed` khi Boss Proof của module đạt và các node bắt buộc hoàn tất; user vẫn có thể học optional/teach-back.
- BranchCommit append-only sau các sự kiện học có ý nghĩa. Sửa draft attempt không thành commit.
- Upstream version mới chỉ tạo thông báo ở VS3; không tự nâng branch.

## 11. LearningAttempt và assessment

```text
draft → submitted → assessing → passed
                              → needs_revision
                              → pending_human_review → passed/needs_revision/rejected
                              → rejected
```

- Draft autosave dùng `version`; submit khóa nội dung của attempt đó.
- Muốn sửa sau `needs_revision`, tạo attemptNumber mới hoặc draft revision liên kết attempt cũ; không sửa bài đã chấm.
- Sample answer reveal sau submit theo node policy.
- Attempt passed là điều kiện tạo mastery/XP/commit trong cùng transaction nghiệp vụ.
- Pending human review không cộng XP và không tạo System-recorded Proof.

### 11.1 Mastery mapping

| Bằng chứng | Mức tối đa được ghi |
|---|---|
| Mở/đọc concept | `exposed` |
| Retrieval/quiz recall đạt rubric | `recall` |
| Transfer/reorder tình huống mới đạt rubric | `apply` |
| Boss artifact đạt rubric | `create` |
| Teach-back đạt rubric | `teach` |

Mastery không giảm chỉ vì thời gian trôi qua; `reviewDueAt` tạo nhu cầu ôn. Reversal của bằng chứng duy nhất có thể tính lại mastery từ evidence còn hợp lệ.

## 12. XP rules v1

### 12.1 XP được đề xuất tại D-P03-11

| Rule | Sự kiện hợp lệ | XP |
|---|---|---:|
| `xp.retrieval_pass.v1` | Retrieval/quiz recall đầu tiên đạt cho một node/rubric scope | 10 |
| `xp.transfer_pass.v1` | Transfer/reorder apply đầu tiên đạt cho một node/rubric scope | 15 |
| `xp.boss_proof_pass.v1` | Boss/Create đầu tiên đạt cho module branch | 35 |
| `xp.teach_back_pass.v1` | Teach-back đầu tiên đạt cho concept/module scope | 20 |
| `xp.delayed_review_pass.v1` | Delayed review đạt sau khoảng giãn cách cấu hình | 5 |

Không XP cho: xem, click hoàn thành, like/share, Fork rỗng, Arena vote, lưu candidate, gắn external proof, chơi game không có server-validated outcome.

### 12.2 Uniqueness và reversal

- `sourceEventId` xác định duy nhất một lần đạt hợp lệ đầu tiên theo `user + branch + node + rubricVersion + rule`.
- Làm lại để học vẫn được feedback/mastery evidence mới nhưng không cộng XP cùng scope lần hai.
- Reversal tạo entry âm trỏ entry gốc, có actor/reason; không sửa/xóa entry gốc.
- Lifetime XP không âm; nếu reversal làm projection âm do dữ liệu lỗi, hệ thống chặn transaction và tạo ops alert thay vì clamp âm thầm.
- `numericLevel = floor(lifetimeXp / 100)`; Era theo White Paper; luôn có level tiếp theo.

## 13. Proof và verification

```text
active ↔ pending_verification
active → revoked
active → superseded
active/pending_verification → deleted
```

- External proof tạo mới chỉ ở `self_declared` hoặc `source_linked`.
- System proof chỉ server tạo từ Boss passed; `verificationLevel=system_recorded`.
- `issuer_verified` cần verification event từ issuer/verifier được cấu hình. `anchored` giữ chỗ ngoài Alpha và API từ chối khi chưa có integration.
- Revoke không xóa lịch sử verification event; UI không còn hiển thị proof như đang hợp lệ.
- Proof bị revoke không tự động reversal XP trừ khi assessment/evidence gốc cũng bị kết luận không hợp lệ qua quy trình riêng.

## 14. Personalization và DataRequest

Consent:

```text
not_set → granted ↔ denied
granted/denied → withdrawn (tương đương denied cho dùng mới + yêu cầu xử lý dữ liệu theo policy)
```

DataRequest:

```text
received → processing → completed
                     → partially_completed
                     → rejected
                     → failed
```

- Tắt personalization dừng dùng footprint cho ranking mới ngay khi request thành công.
- Delete footprint là async; response trả request ID và thời hạn công bố.
- Xóa account tombstone quyền truy cập trước, sau đó xóa/ẩn danh hóa theo retention matrix; audit tối thiểu không chứa raw content.

## 15. Report và ModerationCase

Report:

```text
received → triaged → action_taken
                   → no_action
                   → escalated
                   → closed
```

Moderation actions: `dismiss`, `request_changes`, `hide`, `restore`, `approve_internal`, `escalate`, `revoke_proof`, `reverse_xp` (chỉ với policy/audit phù hợp).

- Target luôn gắn version cụ thể.
- Reporter chỉ thấy trạng thái của report mình; creator chỉ thấy yêu cầu sửa liên quan nội dung mình.
- Action nguy hiểm cần structured reason; admin/reviewer không sửa trực tiếp branch/private proof của learner ngoài trạng thái policy được phép.

## 16. Feature flags/kill switches

| Key | Khi tắt |
|---|---|
| `brew_enabled` | Từ chối Brew mới bằng `BREW_DISABLED`; search/journey sẵn có vẫn hoạt động |
| `internal_publish_enabled` | Không chuyển module mới sang reviewed/catalog |
| `trend_enabled` | Ranking bỏ internal trend signal |
| `game_events_enabled` | Không ghi learning effect mới từ game; web path vẫn dùng được |
| `arena_enabled` | Không tạo match mới; user vẫn chọn candidate trực tiếp |

Đổi flag là admin action có audit và version; client nhận trạng thái qua bootstrap/workspace thay vì tự đoán từ lỗi.
