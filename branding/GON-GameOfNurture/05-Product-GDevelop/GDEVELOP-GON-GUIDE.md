# Chuyển module GON sang GDevelop — bản Heroes 18+

Prototype `apps/gon-web` có nút **Xuất GDevelop blueprint**. File xuất là đặc tả Markdown để dựng game; chưa phải project `.json` của GDevelop và không nên quảng cáo là “one-click export” cho tới khi converter được xây/kiểm thử. Requirement đích V2.1 nằm tại [`../07-Product-AI/GON-TRENDING-PERSONALIZED-OUTPUT-REQUIREMENTS.md`](../07-Product-AI/GON-TRENDING-PERSONALIZED-OUTPUT-REQUIREMENTS.md).

## Nguyên tắc đích: một Canonical Module Graph, nhiều renderer

GON không lưu mỗi bài học như một video hoặc một game tách rời. Nội dung chuẩn gồm learning outcome, concept graph, nguồn/citation, quest, assessment, rubric, media brief và Boss Proof. Từ cùng một graph:

- Web render thành lesson/quest map tương tác;
- GDevelop render thành game có scene, event, variable, branching và simulation;
- Media worker render infographic, chuỗi ảnh/comic, video script/storyboard/caption;
- Task renderer tạo checklist và nhiệm vụ đời thật.

Khi user sửa game, thay outcome hoặc thêm scene, thay đổi trở thành một commit trong Journey Branch/Fork của họ thay vì ghi đè module gốc. Mọi renderer dùng chung version, attribution và trạng thái nguồn.

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
| 10+ Output Candidates | Output Explorer chọn mechanic/route trước khi render; mỗi output có `OutputID`, `Version`, `Format`, `Difficulty` |
| Arena vote | Hai bản game/output được so sánh theo rubric; kết quả lưu `ArenaMatchID`, không biến vote sở thích thành điểm đúng/sai |
| Journey Fork | Project copy có `UpstreamModuleID`, `BranchID`, `ParentCommitID`; scene/event sửa đổi được ghi thành Branch Commit |
| Trend/Creator | Hiển thị attribution và số liệu chỉ khi backend có dữ liệu thật; game không tự tăng Creator Score ở client |
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

Game nên nhận Canonical Module Graph qua JSON có schema/version và gửi event về endpoint có xác thực: `game_started`, `choice_made`, `quest_completed`, `quiz_submitted`, `flashcard_reviewed`, `artifact_created`, `boss_proof_submitted`. Mỗi event có `event_id`, `branch_id`, `output_version` và idempotency key. Server—not client—mới quyết định XP/chứng nhận/Creator Score chính thức; chống sửa biến/điểm ở client. Dữ liệu cá nhân và proof công khai cần consent riêng.

## Checklist phát hành

- [ ] Chạy hết quest/quiz/Boss trong bản export thật, không chỉ preview editor
- [ ] XP không cộng lặp khi tải lại scene/retry request (idempotency)
- [ ] Cùng module graph render được ít nhất web path và GDevelop path mà không lệch nguồn/outcome
- [ ] Có bản text/web tương đương cho user không chơi game; video/ảnh có caption/alt text
- [ ] Fork giữ upstream/attribution và thay đổi scene/event được ghi thành Branch Commit
- [ ] Nguồn/tác giả của ảnh, nhạc, video có giấy phép; credit hiển thị
- [ ] Mọi khẳng định AI có trạng thái nguồn/cảnh báo chưa kiểm chứng khi cần
- [ ] Proof chỉ ghi “verified” sau đối chiếu issuer; ảnh tự tải là Source-linked
- [ ] Kiểm thử với người dùng 18+ và người dùng công nghệ hỗ trợ trước khi gắn nhãn accessible
