# P03 — Identity, Authorization, Privacy & Retention

> **Trạng thái:** IN REVIEW tại P03<br>
> **Mục tiêu:** Đảm bảo dữ liệu học private của user này không bao giờ trở thành dữ liệu tìm/gợi ý/đọc được của user khác trong Private Alpha.

## 1. Identity

### 1.1 Google sign-in

- Dùng Google OAuth/OIDC qua provider/framework đã Audit ở P04; baseline đề xuất Auth.js.
- Danh tính domain là `UserAccount.id`; Google `sub` lưu trong `IdentityLink`.
- Email có thể thay đổi nên không làm khóa chính hay owner key.
- Không nhận mật khẩu Google trong GON và không tự viết OAuth flow thủ công.

### 1.2 Session

- Database session phía server để có thể thu hồi khi tài khoản bị đình chỉ/xóa.
- Cookie: `HttpOnly`, `Secure`, `SameSite=Lax`, path hẹp nhất khả thi.
- Session/token không xuất hiện trong URL, log, analytics hay client storage.
- Deep link sau login chỉ chấp nhận đường dẫn nội bộ đã validate; không open redirect.

### 1.3 Invite và 18+

Private Alpha yêu cầu invite hợp lệ trước khi tạo dữ liệu học. Invite code chỉ lưu hash và có expiry/redeem một lần. Invite link được web server đổi thành cookie HttpOnly ngắn hạn trước OAuth; sau Google callback, `createAgeAttestation` redeem invite từ cookie đó (hoặc `inviteCode` nhập tay), ghi attestation/consent và chuyển tài khoản sang `active` trong cùng một transaction. Invite hết hạn/đã redeem không tạo tài khoản active và không để lại attestation mồ côi.

18+ là **self-attestation**:

- ghi method, terms/privacy versions và thời điểm;
- không gọi là xác minh giấy tờ;
- thay đổi policy tuổi ở public launch cần rà soát riêng tại P05/legal.

## 2. Authorization model

### 2.1 Actor

- `learner`: user 18+ active.
- `creator`: không phải role tách rời; là learner khi tạo/remix artifact/module.
- `reviewer`: role grant có scope.
- `admin`: vận hành/feature flag/role grant.
- `service`: worker/ADK/provider adapter với quyền hẹp theo job.

### 2.2 Quy tắc mặc định

1. Default deny.
2. Mọi query có owner phải lọc theo owner từ session.
3. Mọi mutation kiểm tra trạng thái tài khoản + owner/role + state transition.
4. Reviewer chỉ xem case/target được giao hoặc queue theo scope; không có quyền duyệt toàn bộ Proof Vault.
5. Admin không mặc nhiên đọc raw answer/proof nếu không có case/audit reason.
6. Service account chỉ thao tác trên aggregate của job được giao; ADK không có DB write credential.
7. Không dùng việc ẩn menu ở client thay cho server authorization.

### 2.3 Ma trận quyền tối thiểu

| Đối tượng/hành động | Owner learner | Learner khác | Reviewer | Admin | Service |
|---|---|---|---|---|---|
| Project/artifact của mình | CRUD theo state | Không | Chỉ khi có case | Theo case/audit | Job scope |
| Module draft_private của mình | Đọc/học/Fork | Không | Khi được gửi review/report | Theo case | Job tạo mới qua API worker |
| Module internal_reviewed | Đọc/Fork | Đọc/Fork | Review | Quản trị | Index |
| Journey/attempt của mình | CRUD theo state | Không | Item được giao | Theo case | Assessment job |
| XP ledger của mình | Đọc | Không | Điều tra có scope | Reversal có audit | Posting từ assessment transaction |
| Proof của mình | CRUD metadata | Không | Item được giao | Revoke có audit | System proof creation |
| Footprint của mình | Xem nhóm/tắt/xóa | Không | Không mặc định | Không mặc định | Ranking khi consent |
| Report của mình | Tạo/đọc status | Không | Xử lý case | Xử lý/escalate | Tạo notification |
| Feature flag | Đọc trạng thái ảnh hưởng UI | Đọc trạng thái ảnh hưởng UI | Không sửa | Sửa có audit | Đọc |

## 3. Visibility và search isolation

- `private`: chỉ owner và operator có case hợp lệ.
- `internal_reviewed`: learner trong Private Alpha được tìm/đọc theo policy.
- AI draft của user không vào catalog chung khi chưa review.
- Artifact/chunk private không được dùng làm candidate/citation cho user khác.
- Trend ở VS5 chỉ dùng aggregate đã qua ngưỡng mẫu/ẩn danh hóa; không trả footprint của từng user.

Mọi endpoint có ID phải chống enumeration: không có quyền thường trả 404 như không tồn tại.

## 4. Consent theo mục đích

| Purpose | Mặc định | Hệ quả khi tắt |
|---|---|---|
| `essential_service` | Điều khoản sử dụng, không phải optional consent | Không dùng dịch vụ lõi |
| `personalization_footprint` | User chọn ở SCR-01; UI không preselect gây áp lực ngoài lựa chọn đã duyệt | Ranking mới không dùng footprint |
| `product_analytics` | Tách khỏi footprint ranking; chỉ sự kiện tối thiểu đã công bố | Không ghi analytics tùy chọn |
| `ai_model_training` | **Không bật trong Alpha** | Không dùng dữ liệu user để huấn luyện mô hình |
| `external_social_connection` | **Không có trong Alpha** | Không đọc TikTok/Facebook/YouTube footprint |

Việc gửi artifact tới AI/search provider để thực hiện yêu cầu của chính user là xử lý dịch vụ đã công bố; provider, loại dữ liệu và retention của provider phải được ghi ở P05 trước khi dùng dữ liệu thật.

## 5. Dữ liệu footprint được phép

Khi bật `personalization_footprint`, chỉ dùng trong GON:

- mục tiêu/mode user chọn;
- candidate save/hide/not-interested;
- Arena vote theo context;
- journey started/completed;
- attempt outcome và mastery level;
- artifact/proof được tạo thành công;
- format/topic đã hoàn thành.

Không mặc định dùng:

- dữ liệu ngoài GON;
- thuộc tính nhạy cảm suy luận;
- raw answer, raw proof hoặc nội dung file private làm feature hiển thị;
- dữ liệu y tế/hiến máu nhạy cảm để gây áp lực/xếp hạng.

## 6. Retention mặc định đề xuất tại D-P03-12

Các mốc này là đề xuất vận hành Alpha, cần PO/legal rà soát trước P06:

| Dữ liệu | Giữ | Khi user xóa |
|---|---|---|
| Account/profile | Khi tài khoản active | Tombstone ngay; xóa/ẩn danh hóa trong quy trình tối đa 30 ngày |
| Project/artifact/object | Khi project active | Chặn truy cập ngay; xóa object + derived chunks/embeddings tối đa 30 ngày |
| Extracted text/chunks | Cùng artifact | Loại khỏi search ngay; xóa theo artifact |
| Search/ranking snapshots | 12 tháng hoặc khi project bị xóa | Xóa cùng project; giữ aggregate không định danh nếu đã tách |
| ModuleVersion private | Cùng owner/branch còn dùng | Không xóa version đang là upstream của branch mà không tombstone/hướng dẫn |
| Attempt/assessment | Khi journey active | Theo journey/account deletion |
| XP ledger/audit tối thiểu | 24 tháng cho Alpha audit | Ẩn danh hóa actor khi account deletion hoàn tất nếu không còn nghĩa vụ giữ |
| Proof | Khi user giữ | Tombstone ngay; object xóa tối đa 30 ngày |
| Footprint event chi tiết | 180 ngày; aggregate không định danh có thể giữ lâu hơn | Dừng dùng ngay khi tắt; delete request hoàn tất tối đa 30 ngày |
| Job/AiRun metadata | 12 tháng | Xóa/ẩn danh hóa liên kết user theo account workflow |
| Application logs | 30–90 ngày theo P05 | Không chứa raw private content |
| Backups | Chu kỳ tối đa 30 ngày | Dữ liệu đã xóa biến mất sau chu kỳ backup; không khôi phục chọn lọc để dùng lại |

Nếu luật/policy yêu cầu giữ một phần lâu hơn, DataRequest phải nói rõ phạm vi và lý do ở mức phù hợp thay vì hứa đã xóa tuyệt đối ngay.

## 7. Export và deletion

### Export

Gói export tối thiểu gồm:

- profile/consent;
- projects/artifacts metadata và file của user;
- journeys/attempts/proofs;
- XP ledger;
- footprint categories/preferences.

Export được tạo async, link tải ngắn hạn, chỉ owner truy cập và có audit.

### Delete footprint

- Dừng dùng cho ranking mới ngay.
- Xóa FootprintEvent chi tiết và derived personalization features.
- Không xóa project/journey/proof/XP chỉ vì xóa footprint.
- Trả receipt khi hoàn tất.

### Delete account

- Thu hồi sessions và chặn truy cập.
- Xóa/tombstone projects, artifacts, journeys, proofs, footprint.
- Module đã `internal_reviewed` phải ẩn hoặc chuyển attribution thành dạng đã xóa theo policy; branch của user khác giữ snapshot học tập cần thiết nhưng không lộ dữ liệu chủ đã xóa ngoài attribution tối thiểu đã công bố.
- Audit log giữ hash/actor pseudonymous theo retention; không giữ raw content.

## 8. File/URL safety và quyền nội dung

- Không thực thi file upload; kiểm tra magic bytes/MIME, size và malware scan theo loại.
- Archive/executable bị từ chối trong Alpha mặc định.
- URL fetch chống SSRF/DNS rebinding; không theo redirect vào private network.
- Không vượt paywall/login hoặc điều khoản nền tảng để lấy transcript/nội dung.
- User khai `rightsBasis`; GON có report/takedown workflow. Khai báo của user không biến nội dung thành đã có license.

## 9. Audit bắt buộc

Audit các hành động:

- role grant/revoke;
- consent thay đổi;
- data export/delete;
- module publish/hide/restore;
- assessment human decision;
- XP reversal;
- proof verification/revoke;
- moderation action;
- feature flag/kill switch;
- admin truy cập dữ liệu private theo case.

Audit ghi actor, action, object, request/correlation, reason và before/after status/hash — không sao chép raw content không cần thiết.

## 10. Kiểm chứng bắt buộc ở P04/P05

- Authorization test cho từng endpoint với owner/non-owner/reviewer/admin/service.
- Search isolation test: module/journey/proof private không xuất hiện trong kết quả user khác.
- Tắt personalization rồi tạo ranking mới và chứng minh `personalFit` không được dùng.
- Delete artifact rồi chứng minh chunks/embeddings không còn được search.
- Signed URL hết hạn/khác owner không tải được object.
- Agent/service token của job A không đọc/ghi được aggregate job B.
- Log scan không chứa session token, API key, raw vector và raw private answer.
