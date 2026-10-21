# Thẻ Audit nguồn — FastChat

> **Gate:** G0<br>
> **Repository Audit:** [`khanhlegood1/FastChat`](https://github.com/khanhlegood1/FastChat)<br>
> **Snapshot:** `587d5cfa1609a43d192cedb8441cac3c17db105d` — 02/06/2025<br>
> **Package:** `fschat 0.2.36`<br>
> **Giấy phép:** Apache-2.0<br>
> **Kết luận Gate 0:** **DÙNG LÀM NGUỒN CHÍNH CHO ARENA/VOTING PATTERNS — KHÔNG BÊ NGUYÊN VÀO PRODUCTION**

## 1. Phạm vi Audit

Đã kiểm tra tĩnh:

- `LICENSE`, README và `pyproject.toml`.
- `fastchat/serve/gradio_block_arena_anony.py` (655 dòng).
- `fastchat/serve/gradio_block_arena_named.py` (512 dòng).
- `fastchat/serve/gradio_web_server.py` (1.146 dòng).
- `fastchat/serve/api_provider.py` (1.347 dòng).
- `fastchat/serve/monitor/rating_systems.py`, `elo_analysis.py`, `monitor.py`.
- Danh sách tests và GitHub Actions workflow.

Chưa chạy FastChat với model thật, chưa SAST/SCA đầy đủ và chưa kiểm chứng mọi provider. Các việc đó chỉ cần thực hiện trên đúng phần được đề xuất port tại P04.

## 2. Năng lực khớp trực tiếp với GON

### 2.1 Arena ẩn danh và có tên

FastChat có hai biến thể:

- **Anonymous Arena:** hai model được chọn, nhãn bị ẩn cho tới khi vote; người dùng so sánh hai chatbot side-by-side.
- **Named Arena:** người dùng biết/chọn model ở hai phía.

Các handler đã có:

- `vote_last_response`;
- `leftvote_last_response`, `rightvote_last_response`;
- `tievote_last_response`, `bothbad_vote_last_response`;
- `regenerate`, `add_text`, clear/new conversation và share.

Điều này khớp với yêu cầu GON: hai output/module cạnh tranh, vote trái/phải/hòa/cả hai chưa tốt, tạo lại và vòng mới.

### 2.2 Pairwise rating và leaderboard nghiên cứu

`rating_systems.py` cung cấp các hướng:

- Elo online (`compute_elo`);
- bootstrap Elo;
- Bradley–Terry (`compute_bt`);
- bootstrap Bradley–Terry;
- style-control/contextual Bradley–Terry để giảm thiên lệch do độ dài/định dạng.

`elo_analysis.py` và `monitor.py` có thêm phân tích pairwise win fraction, battle counts, confidence/bootstrap và leaderboard. Đây là phần có giá trị thuật toán cao nhất đối với GON.

### 2.3 Provider dispatch đa model

`api_provider.py` điều phối nhiều loại API/model, gồm OpenAI-compatible, Anthropic, Gemini, Mistral, NVIDIA, Vertex, Cohere, Reka và các nhà cung cấp khác. Giá trị chính là **ý tưởng adapter hóa**: một conversation contract chung có thể được chuyển đổi cho từng provider.

### 2.4 Conversation state

`State`/conversation serialization cho thấy cách giữ model, messages, output phụ và metadata của từng phía. GON có thể học mô hình snapshot này để đảm bảo vote luôn gắn với đúng output version đã hiển thị.

## 3. Quyết định reuse theo thành phần

| Thành phần | Quyết định | Lý do |
|---|---|---|
| Anonymous/named Arena state machine | **Pattern reimplementation** | Hành vi đúng nhu cầu nhưng code gắn chặt Gradio, global state và logging hiện tại |
| Vote choices left/right/tie/both-bad | **Pattern reimplementation** | GON cần vote ledger phía server, identity/eligibility và chống trùng |
| Elo/Bradley–Terry trong `rating_systems.py` | **Ứng viên Port có điều kiện** | Thuật toán tương đối độc lập; cần test vectors, bỏ phụ thuộc không cần thiết và review bản quyền/NOTICE trước khi port |
| Style-control ranking | **Nghiên cứu tại P03/P04** | Hữu ích để tránh output dài/định dạng đẹp thắng không công bằng; cần dữ liệu GON để hiệu chuẩn |
| `api_provider.py` | **Pattern, không port nguyên** | File lớn, nhiều provider/SDK cũ và cấu hình safety không phù hợp mặc định |
| Controller/model workers/GPU serving | **Reject cho MVP** | GON ưu tiên API/ADK managed services; tự host model làm tăng chi phí/vận hành |
| Gradio UI/monolith | **Reject cho production web** | GON đã có brand/UX riêng; cần web app/API có auth, accessibility và telemetry đúng sản phẩm |
| JSONL conversation/vote logs | **Reject** | Không thay thế database/ledger, khó kiểm soát privacy/retention/integrity |

## 4. Rủi ro và nợ kỹ thuật nhìn thấy

### Nguồn gốc: bảo mật và riêng tư — không sao chép hành vi mặc định

- Arena handlers ghi IP ở nhiều thao tác; vote payload gắn IP lấy từ request headers.
- `get_ip` tin `cf-connecting-ip`/`x-forwarded-for`; nếu deployment không có proxy tin cậy đúng cách, IP có thể bị giả mạo.
- Một số đường moderation/limit ghi cả nội dung text của người dùng vào log.
- Conversation/vote được append vào file JSONL cục bộ. Cách này không đáp ứng mặc định các yêu cầu về phân quyền, mã hóa, retention, xóa dữ liệu, chống sửa và khôi phục của GON.
- Moderation là tùy chọn theo cấu hình, không phải policy production hoàn chỉnh.
- Trong `api_provider.py`, một số đường Gemini/Vertex đặt nhiều harm-category thresholds ở `BLOCK_NONE`. **Không được sao chép** các thiết lập này; GON phải có safety policy riêng tại P03/P05.

### Nguồn gốc: kiến trúc và bảo trì

- Anonymous/Named/Gradio server là các file lớn, trùng lặp nhiều và gắn UI với business logic.
- Vote chủ yếu dựa trên trạng thái UI/IP, chưa phải authenticated vote ledger có idempotency key, eligibility rules hay anti-collusion.
- Rating code là phân tích batch/research; GON cần quyết định tại P03 là tính online, batch hay hybrid và cách xử lý output mới ít vote.
- Provider layer dùng nhiều request/SDK khác nhau trong một file; khó test và khó áp chính sách timeout/retry/cost đồng nhất.

### Trung bình: dependencies và kiểm thử

- Package yêu cầu Python `>=3.8`; nhiều dependency không có upper bound chặt.
- Optional groups chứa Torch/Transformers/Accelerate/PEFT và nhiều SDK nặng. GON không cần kéo toàn bộ vào Arena.
- Workflow hiện tại dùng Python 3.10, cài `.[dev]`, chạy pylint giới hạn và Black check; workflow không chạy bộ unit test đầy đủ.
- Tests hiện có thiên về CLI/API/model serving và load test; tại Gate 0 chưa thấy test tự động chuyên cho Arena vote/rating đủ để port mà không viết test mới.

## 5. Điều kiện bắt buộc nếu port bất kỳ code nào

1. Chỉ port phạm vi hẹp đã nêu trong PR P04; ưu tiên thuật toán rating.
2. Ghi upstream URL, snapshot commit, Apache-2.0, NOTICE/attribution và mọi thay đổi.
3. Tạo test vectors độc lập cho win/loss/tie/both-bad, thứ tự trận, bootstrap seed và trường hợp ít dữ liệu.
4. Tách thuật toán khỏi pandas/scipy nếu không cần, hoặc pin dependencies và chạy SCA.
5. Không port logging IP/raw text, JSONL storage và `BLOCK_NONE` safety settings.
6. GON API phải xác thực người vote, kiểm tra output snapshot/version, idempotency và rate limit phía server.
7. Leaderboard phải hiển thị số vote/khoảng tin cậy hoặc trạng thái “chưa đủ dữ liệu”, không biến vài vote thành hạng tuyệt đối.

## 6. Kết luận cho PO

FastChat **đúng là nguồn nên dùng cho Arena**, nhưng giá trị nằm ở:

- state machine so sánh hai phía;
- bộ lựa chọn vote;
- pairwise Elo/Bradley–Terry;
- ý tưởng provider adapters.

GON không nên dùng FastChat làm web framework, nơi lưu vote, hệ identity/privacy hay nền tảng model serving cho MVP.
