# P02 — User Flows

> 🔁 **Cập nhật PO — 24/10/2026 (tối muộn) — quyết định sản phẩm mới:** Persona đầu ra (🔬 PhD / Nghiên cứu · 🎬 KOL / Sáng tạo · 🎈 Giải trí · 🚀 Nâng cao) và các Độ sâu **không hiện ra cho user chọn** — mặc định **chạy tất cả các tổ hợp**, xuất nhiều output như feed TikTok. Output user chọn chính là Persona đầu ra của họ, đồng thời là tín hiệu **Arena** và **dấu chân đẳng cấp**. **Màn hình Brew và màn hình Arena đã được gộp vào chung màn hình Khám phá.** Nội dung dưới đây giữ nguyên làm tư liệu nền; chi tiết & trạng thái triển khai: [`PO-DECISION-UNIFIED-DISCOVER-2026-10-24.md`](../00-process/PO-DECISION-UNIFIED-DISCOVER-2026-10-24.md).

> 🗄️ **Cập nhật PO — 24/10/2026 (23:36) — IndexedDB cho toàn bộ dự án:** toàn bộ dữ liệu phía client chuyển sang **IndexedDB** (localStorage chỉ còn fallback + nguồn migrate một lần); trang **Khám phá mang theo dữ liệu từ thanh tìm kiếm** (đồng bộ tất cả dữ liệu, hai chiều). Chi tiết: [`PO-DECISION-STORAGE-INDEXEDDB-2026-10-24.md`](../00-process/PO-DECISION-STORAGE-INDEXEDDB-2026-10-24.md) — code chính: `src/lib/browser-storage.ts`.

> **Trạng thái:** APPROVED tại P02 — Product Owner đã duyệt ngày 22/10/2026<br>
> **Cách đọc:** Mỗi flow có điểm vào, quyết định của user, phản hồi hệ thống, lối thoát/lỗi và tiêu chí hoàn thành. Tên trạng thái bám [Interaction States & Content](INTERACTION-STATES-AND-CONTENT.md).

## F01 — Lần đầu: 18+, đăng nhập và chọn cá nhân hóa

```mermaid
flowchart TD
    A["Nhận invite / mở GON"] --> B["SCR-01"]
    B --> C{"Xác nhận đủ 18+ và điều khoản?"}
    C -->|"Chưa đủ 18+"| D["Blocked state: không vào Alpha"]
    C -->|"Thiếu điều khoản"| E["Inline error, giữ nguyên lựa chọn"]
    C -->|"Hợp lệ"| F["Chọn bật/tắt footprint"]
    F --> G["Đăng nhập Google"]
    G --> H["SCR-02"]
```

**Quy tắc:**

- Không yêu cầu upload giấy tờ.
- Lựa chọn cá nhân hóa có hai phương án cân bằng; nút từ chối không bị làm mờ như dark pattern.
- Nếu OAuth lỗi/hết phiên, quay lại đúng `SCR-01` kèm thông báo và giữ lựa chọn consent không nhạy cảm.
- Không tạo public profile ở onboarding.

**Hoàn thành khi:** user tới `SCR-02` và thấy trạng thái privacy mặc định của project tương lai.

**Prototype:** checkbox validation, lựa chọn “Tôi chưa đủ 18 tuổi”, mock Google CTA.

## F02 — Tạo input và nhận trạng thái artifact trung thực

```mermaid
flowchart TD
    A["SCR-02 · nhập text/link/file/image"] --> B["Chọn mục tiêu, Learning Mode, thời gian"]
    B --> C["Xem danh sách Source Artifacts"]
    C --> D{"Artifact sẵn sàng?"}
    D -->|"Đã đọc"| E["Có thể tìm kiếm"]
    D -->|"Metadata-only / partial"| F["Cảnh báo phạm vi đã đọc"]
    F --> G["User sửa, thay nguồn hoặc tiếp tục có hiểu biết"]
    G --> E
    D -->|"Lỗi/không an toàn"| H["Blocked hoặc failed state"]
    H --> I["Xóa/thay artifact hoặc dừng an toàn"]
    E --> J["SCR-03"]
```

**Quy tắc:**

- Text gõ trực tiếp luôn là một Source Artifact, không biến mất khi thêm link/file.
- User có thể xóa từng artifact trước khi search; xóa trong lúc đang xử lý phải hủy hoặc đánh dấu không dùng kết quả của artifact đó.
- Hệ thống không nói “đã hiểu video/file” nếu chỉ có metadata.
- File/URL lỗi không làm mất phần text còn hợp lệ.

**Hoàn thành khi:** ít nhất một artifact hợp lệ được ghi nhận và Project Stepper chuyển sang bước Tìm/Brew.

## F03 — Search có kết quả: Found hoặc Related

```mermaid
flowchart TD
    A["SCR-03 · đang đối chiếu"] --> B{"Verdict"}
    B -->|"FOUND"| C["Hiện module khớp + gaps nếu có"]
    B -->|"RELATED"| D["Hiện phần khớp và phần thiếu"]
    C --> E["SCR-05 · Hướng học"]
    D --> F{"User chọn gì?"}
    F -->|"Học nền tảng sẵn có"| E
    F -->|"Brew phần thiếu"| G["F04"]
    F -->|"Sửa input"| H["SCR-02, giữ artifact"]
```

**Quy tắc:**

- `FOUND` vẫn hiển thị version, nguồn/citation status, định dạng, thời lượng và điều kiện tiên quyết.
- `RELATED` phải nói rõ “khớp X, thiếu Y”; không làm giả mức khớp bằng một phần trăm duy nhất.
- User luôn có thể quay lại sửa input.

**Hoàn thành khi:** user chọn một đường rõ ràng tới `SCR-05`, `SCR-04` hoặc quay về `SCR-02`.

## F04 — Missing/Clarify/Blocked và Brew có xác nhận

```mermaid
flowchart TD
    A["SCR-03"] --> B{"Verdict"}
    B -->|"MISSING"| C["Giải thích kho tri thức chưa có phần này"]
    B -->|"NEEDS_CLARIFICATION"| D["Đưa tối đa vài câu hỏi ngắn"]
    B -->|"BLOCKED"| E["Dừng an toàn + lý do nhóm"]
    D --> C
    C --> F["SCR-04 · Brew confirmation"]
    F --> G{"User xác nhận?"}
    G -->|"Không"| H["Lưu project / sửa input"]
    G -->|"Có"| I["Queued → Processing"]
    I --> J{"Kết quả job"}
    J -->|"Ready"| K["AI draft riêng tư → SCR-05"]
    J -->|"Needs input"| L["Hỏi đúng phần thiếu, không tạo job trùng"]
    J -->|"Failed"| M["Giữ input, thử lại an toàn hoặc liên hệ hỗ trợ"]
    E --> N["Gợi ý thay thế an toàn nếu phù hợp"]
```

**Quy tắc:**

- Không tự chạy Brew khi user chưa xác nhận.
- Double-click/refresh không tạo cảm giác hai job; nút bị disable và trạng thái job được khôi phục khi quay lại.
- Progress dùng bước có chữ thay vì spinner vô hạn: kiểm tra chủ đề → nguồn/citation → module graph → quest/rubric → sẵn sàng.
- Ready không đồng nghĩa reviewed/public.

**Hoàn thành khi:** module draft sẵn sàng ở `SCR-05`, user chủ động dừng/sửa, hoặc có trạng thái failed/needs-input có đường tiếp theo.

## F05 — Khám phá 10+ Hướng học và kiểm soát ranking

```mermaid
flowchart TD
    A["SCR-05"] --> B["Đọc ranking explanation"]
    B --> C{"Thao tác"}
    C -->|"Đổi Learning Mode"| D["Sắp xếp lại + đổi lý do"]
    C -->|"Tắt cá nhân hóa"| E["Ranking chung từ input hiện tại"]
    C -->|"Lọc cụm/format"| F["Thu hẹp danh sách"]
    C -->|"Lưu / Không phù hợp"| G["Ghi tín hiệu và cập nhật danh sách"]
    C -->|"Chọn 2 để so sánh"| H["F06"]
    C -->|"Tạo hành trình của tôi"| I["F07"]
    D --> A
    E --> A
    F --> A
    G --> A
```

**Quy tắc:**

- Màn hình đầu tiên làm rõ tổng số hướng và có đường tới toàn bộ 10+ hướng; Top 3 nổi bật không được giấu phần còn lại.
- Card luôn có thời lượng, format, độ khó, artifact đầu ra, nguồn/citation state và “vì sao hiện ở đây”.
- “Không phù hợp” là tín hiệu preference, không phải report nội dung sai. Report là hành động riêng.
- Nếu chỉ còn ít hơn số hướng tối thiểu khả thi, hiển thị empty-recovery: bỏ lọc, hiện lại mục đã ẩn, sửa input hoặc Brew thêm.

**Hoàn thành khi:** user Fork, vào Arena hoặc lưu lại để quay lại sau.

## F06 — Blind Arena

```mermaid
flowchart TD
    A["SCR-05 · chọn 2 hoặc Top 2"] --> B["SCR-06 · Output A/B ẩn danh"]
    B --> C{"Vote"}
    C -->|"Trái / Phải"| D["Ghi vote một lần + reveal"]
    C -->|"Hòa"| E["Giữ cả hai + reveal"]
    C -->|"Cả hai chưa tốt"| F["Đề xuất hướng khác / Brew lại + reveal"]
    C -->|"Merge"| G["Tạo đề xuất hành trình hợp nhất + reveal"]
    D --> H{"Bước tiếp theo"}
    E --> H
    G --> H
    H -->|"Tạo hành trình của tôi"| I["F07"]
    H -->|"Quay lại danh sách"| J["SCR-05"]
    F --> J
```

**Quy tắc:**

- Trước vote không lộ model/agent/creator/title gốc nếu title làm lộ danh tính; chỉ lộ đủ summary/format/artifact để đánh giá công bằng.
- Vote là thao tác một lần trong prototype. Production có thể cho sửa trong cửa sổ P03 định nghĩa, nhưng phải ngăn double-submit.
- Không có XP cho vote. Nếu có tín hiệu đóng góp trong tương lai, không tính vào Learning Level.
- Sau vote, giải thích ranking cá nhân thay đổi theo nhóm tín hiệu; không hiển thị công thức giả hoặc điểm “đúng”.

**Hoàn thành khi:** user biết kết quả vote ảnh hưởng gì và có CTA rõ tới Fork hoặc quay lại danh sách.

## F07 — Tạo hành trình riêng từ một hướng học

```mermaid
flowchart TD
    A["SCR-05/06 · Tạo hành trình của tôi"] --> B["SCR-07 · xác nhận Fork"]
    B --> C["Hiện upstream version, attribution, Private"]
    C --> D{"Tạo hành trình?"}
    D -->|"Hủy"| E["Quay lại, không thay đổi"]
    D -->|"Tạo"| F["Journey Branch riêng"]
    F --> G["SCR-08 · Module Player"]
```

**Quy tắc:**

- Lần đầu cần giải thích một câu: bản gốc không đổi; thay đổi/progress nằm trong hành trình của user.
- Private là mặc định, không có checkbox “public” gây nhầm trong Alpha.
- Nếu user đã có branch từ cùng module version, hỏi tiếp tục branch cũ hay tạo branch mới thay vì lặng lẽ tạo trùng.

**Hoàn thành khi:** Branch Header chỉ rõ upstream, attribution, privacy và bước học hiện tại.

## F08 — Học thật: Concept → Retrieval → Transfer

```mermaid
flowchart TD
    A["SCR-08 · Concept có citation"] --> B["Exposed"]
    B --> C["Retrieval: đáp án bị khóa"]
    C --> D{"Submit"}
    D -->|"Chưa đạt"| E["Feedback theo rubric + gợi ý học lại"]
    E --> C
    D -->|"Đạt"| F["Recall + hiện đáp án tham chiếu"]
    F --> G["Transfer: tình huống mới"]
    G --> H{"Rubric"}
    H -->|"Chưa đạt"| I["Sửa Branch Commit"]
    I --> G
    H -->|"Đạt"| J["Apply → mở Boss Proof"]
```

**Quy tắc:**

- Mỗi concept quan trọng liên kết tới citation hoặc nhãn unverified cần review.
- Paste dài không mặc nhiên bị kết tội gian lận; UX tập trung vào follow-up/rubric và khai báo nguồn/AI. Cơ chế integrity chi tiết thuộc P03/P05.
- User có thể lưu nháp và thoát. “Bỏ qua” trong prototype chỉ phục vụ review UX; production bỏ qua bước gating thì không mở khóa XP/Boss nếu P01 yêu cầu.
- Feedback phải nói phần nào đạt, phần nào thiếu và hành động sửa cụ thể.

**Hoàn thành khi:** Mastery tăng theo bằng chứng hành vi học và Boss Proof được mở đúng điều kiện.

## F09 — Boss Proof: nộp, sửa, đạt

```mermaid
flowchart TD
    A["SCR-09 · đọc rubric trước"] --> B["Tạo/gắn artifact"]
    B --> C["Khai nguồn, AI assistance và thay đổi của mình"]
    C --> D["Nộp"]
    D --> E{"Kết quả"}
    E -->|"Đạt"| F["System-recorded Proof"]
    E -->|"Cần sửa"| G["Feedback theo từng rubric"]
    E -->|"Cần human review"| H["Pending + kỳ vọng xử lý"]
    G --> B
    H --> I["Thông báo khi có quyết định"]
    F --> J["Cập nhật Mastery + Lifetime XP từ server"]
    J --> K["SCR-10/11"]
```

**Quy tắc:**

- Rubric xuất hiện trước khi làm, không chỉ ở màn hình kết quả.
- Artifact private vẫn có thể đạt System-recorded; user không bị ép công khai để có proof.
- Nếu kết quả cần sửa, giữ artifact/nháp và chỉ rõ field/rubric cần sửa.
- Màn hình thành công tách ba dòng: Proof level, Mastery mới, XP/Level mới.

**Hoàn thành khi:** Proof xuất hiện trong Vault với verification label và liên kết về Journey Branch.

## F10 — Gắn bằng chứng ngoài GON

```mermaid
flowchart TD
    A["SCR-11 · Thêm proof"] --> B["Chọn link / ảnh / mô tả"]
    B --> C["Chọn loại bằng chứng"]
    C --> D["Hiển thị mức xác minh đúng"]
    D --> E{"Có issuer verification thật?"}
    E -->|"Không"| F["Self-declared hoặc Source-linked"]
    E -->|"Có integration được duyệt"| G["Issuer-verified"]
    F --> H["Liên kết tùy chọn tới Journey"]
    G --> H
```

**Quy tắc:**

- Upload ảnh chứng chỉ không tự nâng mức xác minh.
- Link Facebook/YouTube/POAP chỉ chứng minh nguồn tồn tại ở mức Source-linked cho tới khi có quy trình đối chiếu được duyệt.
- Proof ngoài không tự cộng XP cốt lõi nếu không đi qua assessment/policy ở P03.

**Hoàn thành khi:** user hiểu điều proof chứng minh được và điều chưa chứng minh được.

## F11 — Tắt/xóa cá nhân hóa

```mermaid
flowchart TD
    A["SCR-05 hoặc SCR-12"] --> B{"Hành động"}
    B -->|"Tắt footprint ranking"| C["Xác nhận phạm vi"]
    C --> D["Ranking chuyển sang input hiện tại + tiêu chí chung"]
    B -->|"Không quan tâm chủ đề"| E["Giảm/ẩn nhóm gợi ý"]
    B -->|"Yêu cầu xóa footprint"| F["Mô tả dữ liệu và hậu quả"]
    F --> G["Xác nhận"]
    G --> H["Trạng thái đang xử lý"]
    H --> I["Biên nhận hoàn tất / phần phải giữ theo policy"]
```

**Quy tắc:**

- Tắt cá nhân hóa không xóa project/journey/proof và không chặn học.
- Xóa footprint là luồng riêng, có xác nhận và biên nhận; không dùng toggle làm giả đã xóa.
- Sau khi tắt, ranking explanation thay đổi ngay trong UX contract.

**Hoàn thành khi:** user nhận trạng thái rõ ràng và quay lại học mà không bị “phạt”.

## F12 — Report và trạng thái kiểm duyệt

```mermaid
flowchart TD
    A["Module / Output / Proof"] --> B["Báo cáo nội dung"]
    B --> C["Chọn lý do + chi tiết"]
    C --> D["Gửi kèm version đích"]
    D --> E["SCR-15 · Đã tiếp nhận"]
    E --> F{"Reviewer quyết định"}
    F -->|"Nội dung ổn"| G["Đóng report + lý do tóm tắt"]
    F -->|"Cần sửa/ẩn"| H["Creator nhận yêu cầu, learner thấy trạng thái"]
    F -->|"Vi phạm"| I["Ẩn/gỡ và ghi audit"]
```

**Quy tắc:**

- Report không phải nút “Không phù hợp”. Hai hành động có nhãn, hệ quả và nơi đặt khác nhau.
- Reporter không thấy dữ liệu private của creator; creator không thấy danh tính reporter nếu policy bảo vệ danh tính.
- Nội dung đang bị review có banner trạng thái; user không bị mất branch/progress đã hợp lệ chỉ vì upstream bị ẩn, trừ quyết định policy ở P03/P05.

**Hoàn thành khi:** mọi phía biết version nào bị ảnh hưởng và bước tiếp theo.

## F13 — Reviewer xử lý AI draft/report

```mermaid
flowchart TD
    A["SCR-16 · Queue theo rủi ro"] --> B["Mở đúng version"]
    B --> C["Xem nguồn, citation, lineage được phép"]
    C --> D{"Quyết định"}
    D -->|"Approve nội bộ"| E["Đổi trạng thái reviewed/internal"]
    D -->|"Request changes"| F["Ghi yêu cầu có cấu trúc"]
    D -->|"Hide / Escalate"| G["Ẩn ngay + audit"]
    E --> H["Thông báo creator"]
    F --> H
    G --> H
```

**Quy tắc:** reviewer không sửa trực tiếp branch/private proof của learner. Mọi quyết định có lý do và timestamp.

## F14 — Khôi phục phiên, lỗi mạng và quay lại sau

```mermaid
flowchart TD
    A["Mở thông báo / deep link / quay lại app"] --> B{"Phiên hợp lệ?"}
    B -->|"Không"| C["Đăng nhập lại"]
    C --> D["Trả về đích ban đầu"]
    B -->|"Có"| D
    D --> E{"Trạng thái hiện tại"}
    E -->|"Job đang chạy"| F["SCR-04 cùng job"]
    E -->|"Job xong"| G["SCR-05 / module ready"]
    E -->|"Nháp học"| H["SCR-08 đúng bước"]
    E -->|"Đã bị ẩn/hết quyền"| I["Permission/removed state"]
    E -->|"Mất mạng"| J["Offline banner + giữ nháp cục bộ nếu P03 cho phép"]
```

**Quy tắc:**

- Submit quan trọng phải có trạng thái `đang gửi`, `đã ghi nhận`, hoặc `không chắc chắn — kiểm tra lại`; user không bấm lặp vô hạn.
- Offline có thể cho đọc nội dung đã tải và soạn nháp, nhưng không hiển thị XP/Proof như đã được server xác nhận.
- Session-expired state giữ đích quay lại an toàn và không lộ dữ liệu private.

## Các flow chưa thuộc Private Alpha

P02 không thiết kế flow cho public profile, public leaderboard, theo dõi/follow, marketplace, mua bán token, rút tiền, quảng cáo footprint hay Success Path công khai. Nếu PO muốn đưa vào sau, đó là thay đổi P01/scope chứ không phải hệ quả tự nhiên của P02.
