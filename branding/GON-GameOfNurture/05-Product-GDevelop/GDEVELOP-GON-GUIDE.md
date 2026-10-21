# Chuyển module GON sang GDevelop — bản Heroes 18+

Prototype `apps/gon-web` có nút **Xuất GDevelop blueprint**. File xuất là đặc tả Markdown để dựng game; chưa phải project `.json` của GDevelop và không nên quảng cáo là “one-click export” cho tới khi converter được xây/kiểm thử.

## Ánh xạ module → game

| GON module | GDevelop |
|---|---|
| Learning outcome | Objective text + biến `OutcomeName`, điều kiện thắng Boss |
| Source Artifact | Scene mở đầu: tóm tắt nguồn, hash/provenance, nút mở nguồn được phép |
| 3–5 concepts | 3–5 màn/level hoặc node trên bản đồ quest |
| 5 quests | External events/quest objects; biến `Quest_01..05_Done` dạng boolean |
| Flashcards | Card scene có lật thẻ và nút Nhớ/Chưa nhớ; lưu lịch ôn |
| Reorder | Draggable objects + kiểm tra mảng thứ tự |
| Quiz | Biến `QuizScore`, điều kiện `>= 2/3` (hoặc rubric của module) |
| AI Coach vs Quest Path | Hai tuyến route trên map; lựa chọn ghi vào `ArenaPath`, không khóa người học khỏi nội dung lõi |
| XP/level | Global variables `XP`, `HeroLevel`; ngưỡng Zero 0 / Awaken 100 / Explorer 300 / Guardian 700 / Hero 1200 / Legend 2000 / Forever 3500 |
| Boss Proof | Scene nộp sản phẩm/giải thích; chỉ hoàn thành khi đạt rubric, không chỉ bấm nút |
| Proof/badge | Biến `BadgeID`, `ProofHash`, `VerificationLevel`; hiển thị cấp xác minh đúng sự thật |

## Quy tắc hình ảnh/UI 18+

- Dùng tokens trong `../03-Color-Typography/gon-tokens.css`: Midnight nền chủ đạo, Emerald tiến trình, Gold thành tựu/Brew, Crimson hành động nhân văn, Cyan dữ liệu/proof.
- Font Be Vietnam Pro (ExtraBold cho title). Test chuỗi: `Ă Â Đ Ê Ô Ơ Ư ă â đ ê ô ơ ư á à ả ã ạ 0123456789`.
- Vùng chạm ≥48px, focus rõ, không dùng màu đơn độc để báo đúng/sai; hỗ trợ giảm chuyển động.
- Không dùng mascot Gon Mầm, blocks trẻ em hay ảnh trong `assets-illustration/legacy-v1-children/` cho bản 18+.
- Made-with phải tôn trọng ghi công của GDevelop và asset bên thứ ba; “Made with GON” không thay thế credit engine.

## Kết nối backend (production)

Game nên nhận module qua JSON có schema và gửi event về endpoint có xác thực: `quest_completed`, `quiz_submitted`, `flashcard_reviewed`, `boss_proof_submitted`. Server—not client—mới quyết định XP/chứng nhận chính thức; chống sửa biến/điểm ở client. Dữ liệu cá nhân và proof công khai cần consent riêng.

## Checklist phát hành

- [ ] Chạy hết quest/quiz/Boss trong bản export thật, không chỉ preview editor
- [ ] XP không cộng lặp khi tải lại scene/retry request (idempotency)
- [ ] Nguồn/tác giả của ảnh, nhạc, video có giấy phép; credit hiển thị
- [ ] Mọi khẳng định AI có trạng thái nguồn/cảnh báo chưa kiểm chứng khi cần
- [ ] Proof chỉ ghi “verified” sau đối chiếu issuer; ảnh tự tải là Source-linked
- [ ] Kiểm thử với người dùng 18+ và người dùng công nghệ hỗ trợ trước khi gắn nhãn accessible
