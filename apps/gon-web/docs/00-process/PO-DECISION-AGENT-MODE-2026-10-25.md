# Quyết định PO — Agent Mode (arena.ai) áp vào GON: Journey Agent + 5 tín hiệu

- **ID quyết định:** `PO-2026-10-25-AGENT-MODE` (FE-Confirm-12)
- **Ngày:** 25/10/2026
- **Kênh:** chat Arena — PO hỏi *"Tính năng Agent Mode của arena.ai làm gì? Chạy pipeline ntn? Nên áp dụng vào GON ra sao?"* → nhận báo cáo phân tích → **"Ok làm đi"** (duyệt triển khai trong khuôn khổ ủy quyền liên tục 24/10).
- **Code chính:** `src/lib/product-decisions.ts` → `JOURNEY_AGENT_DECISION`
- **Demo:** `ux-prototype/standalone/index.html` v2.10 — khối **🤖 Journey Agent** trong Khám phá + tab **Agent (Net Improvement)** trong Leaderboard.

---

## 1. Nghiên cứu: Agent Mode của arena.ai là gì (nguồn công khai, truy cập 25/10/2026)

Ra mắt **04/06/2026** — mở rộng triết lý leaderboard của arena.ai từ *"so sánh câu trả lời"* sang **"đo công việc thật do agent làm"**.

**Khác các mode cũ (Battle/Side-by-side/Direct = 1 prompt → 1 câu trả lời → vote):**
Agent Mode nhận **một yêu cầu phức tạp** (deep research, dựng website, build app, debug code, sinh ảnh, viết báo cáo) và **agent tự lập kế hoạch, tự dùng tools để làm trọn việc** — user không phải bẻ task thành chục prompt.

**Bộ tools** (từ help.arena.ai + methodology):
- 🔎 web search · 🌐 fetch_page · 📎 upload file
- 💻 **bash trong sandbox riêng** (tool dùng nhiều nhất; timeout tới 1800s) — chạy code, git, test, cài package
- 📝 read_file / write_file (sản xuất artifact thật) · 🎨 sinh ảnh · ❓ chủ động hỏi lại làm rõ
- Tích hợp GitHub: clone repo vào sandbox → agent commit branch làm việc → **mở pull request**, review ở tab Diff

**Cách họ ĐO agent (phần đắt giá nhất):** session dài quá không thể vote cặp A/B như chat nên Agent Arena dùng **randomized trial + causal inference** — model gán ngẫu nhiên mỗi phiên → tính **Net Improvement** (tốt/kém bao nhiêu điểm % so với "model trung bình") theo **5 tín hiệu**:

| Tín hiệu | Nghĩa | Trọng số |
|---|---|---|
| ✅ Confirmed success | user xác nhận task xong thật | 1× |
| 🗣️ Praise vs complaint | khen nhiều hơn chê | 1× |
| 🎯 Steerability | sửa đúng ý khi user chỉnh hướng | 1× |
| 🔧 Bash recovery | hồi phục nhanh sau lệnh lỗi | **0.5×** |
| 👻 Tool hallucination | bịa tool không tồn tại / khai việc chưa làm | 1× |

Quy mô công bố: 160K+ task thật, 2.06M tool calls (bash 936K · write_file 550K · web_search 276K) trong 7 ngày — không prompt tuyển chọn, không evaluator trả phí.

## 2. Áp vào GON — mapping 5 tín hiệu (điểm nhận ra: GON đã có sẵn đủ "5 tín hiệu" dưới dạng học tập)

| Agent Arena (arena.ai) | GON tương đương (đÃ CÓ từ các slice trước) |
|---|---|
| ✅ Confirmed success | 💜 **"Đã hiểu thật"** — chỉ mở qua checkpoint/bài chơi GDevelop thật (learningEvents), không tự khai |
| 🗣️ Praise vs complaint | bộ social rail (tim · bình luận · 💜) và phản hồi 👎 chưa đạt của Journey Agent |
| 🎯 Steerability | 🎨 **Remix** — người học chỉnh hướng, output sinh lại theo ý |
| 🔧 Bash recovery | 🧪 **Brew** — query yếu/không kết quả → tự phục hồi bằng sinh module đầy đủ |
| 👻 Tool hallucination | **khai man**: agent khai "đã kiểm tra understanding" mà không có learningEvents → bị chặn, XP không tính |

**Kiến trúc chốt — "Hành trình học là một agent task":**
1. **GON Journey Agent** (orchestrator = Google ADK, đúng stack WSIC/Gate 0): nhận **một** đầu vào duy nhất (query + nội dung học) → tự thực thi trọn lộ trình 7 bước: `plan → eval_query → brew_module → gen_payload → gd_render → checkpoint → grant_xp`. Người học không bấm từng bước.
2. **Checkpoint là "confirmed success" của GON**: XP chỉ tính khi có learningEvents thật từ GDJS về `/api/v1` (hợp đồng P03) — trả lời đúng fail mode nguy hiểm nhất mà Arena ghi nhận ("claiming checks they never performed").
3. **Agent Leaderboard kiểu causal**: mỗi phiên gán **ngẫu nhiên** một orchestrator kín tên → Net Improvement theo 5 tín hiệu → biết cấu hình agent **dạy tốt thật** chứ không chỉ trả lời hay. GON arena hiện vote nội dung; đây là tầng nâng cấp — đo **toàn bộ hành trình học**.
4. **Không làm sandbox từ đầu, không bash tự do cho learner**: agent-tools là tools ADK (search/retrieval/render) — an toàn hơn và đỡ chi phí; arena production vẫn nền FastChat (Gate 0).

## 3. Triển khai demo v2.10 (standalone/index.html)

- **Khối 🤖 Journey Agent** trong Khám phá (sau khối Arena):
  - Nút **"🚀 Chạy Journey Agent (1 lệnh)"** — dùng đúng query + nội dung hiện có của trang.
  - **Trace 7 bước** chạy dần kiểu tool-call (mỗi bước gắn tag `tool: plan` … `tool: grant_xp`) — mô phỏng agent trace của Agent Mode.
  - **🎭 orchestrator ẩn danh** trong lúc chạy — **gán ngẫu nhiên** từ pool 3 cấu hình (gemini-orchestrator · fast-orchestrator · brew-first-orchestrator), chỉ **mở nhãn sau khi xong** (nguyên tắc mù của arena.ai).
  - Query yếu → tag **"🔧 tín hiệu recovery: query yếu → Brew"**; hành trình ghi `recovered` vào state.
  - Khi xong: **+25 XP** · reveal orchestrator · hàng phản hồi **"✅ Hành trình xong tốt"** (Confirmed success, +5 XP) / **"👎 Chưa đạt"** (complaint) · "🔁 Chạy lại (orchestrator ngẫu nhiên)".
  - **Bảng "5 tín hiệu Agent Arena → map sang GON"** cập nhật live từ state (số lần checkpoint/remix/brew, khen–chê, 0 vụ khai man).
- **Tab "🤖 Agent (Net Improvement)"** (thứ 3) trong Leaderboard: 3 orchestrator × 5 cột tín hiệu + cột **Net** (trung bình có trọng số, **recovery ×0.5** như bash recovery của Arena), xếp theo Net, mũi tên ↑↓, hàng "👉 phiên của bạn" chính là orchestrator của hành trình vừa chạy.
- **POAP:** mỗi phiên Journey Agent thành 1 event timeline (`🤖 Journey Agent: topic → orchestrator (🔧 recovery) · ✅/👎`).
- **Flow F14** trong Sơ đồ xác nhận FE (14/14 flows).
- State mới: `S.agentJourneys` (IndexedDB) — `{topic, orch, recovered, confirmed, t}`.

**E2E:** 163/163 pass (145 cũ + 18 mới: F14 toàn luồng, POAP, tab Agent, map 14/14). Nhãn trung thực: trace/pipeline/số liệu leaderboard là **mô phỏng timer-based trong demo** — không phải bằng chứng hạ tầng thật.

## 4. Production path

- Orchestrator: **Google ADK** multi-agent (WSIC), model gán ngẫu nhiên mỗi phiên học, ghi log phiên để tính Net Improvement về sau.
- Confirmed success = **GonLearningEvents thật** từ GDJS Runtime về `/api/v1` (P03) — nguồn duy nhất cho XP hiểu thật; mọi claim "đã kiểm tra" không có event → từ chối (honesty gate).
- Bảng Agent Leaderboard production: window 7 ngày, trọng số như demo (recovery ×0.5), CI/hiệu số nhân quả khi đủ lượng phiên; chống gian lận phản hồi (cooldown, 1 confirm/phiên).
- Không cấp bash/terminal tự do cho phía người học; tools đóng góp theo whitelist ADK.

## 5. Nguồn tham khảo

- https://arena.ai/ (trang chủ — Battle/Agent/Side-by-side/Direct, reCAPTCHA)
- https://arena.ai/blog/agent-mode (blog ra mắt Agent Mode 27/08 cập nhật; công bố gốc 04/06/2026)
- https://help.arena.ai/articles/5432423882-how-to-use-agent-mode (cách dùng + Agent Leaderboard 5 tín hiệu + Net Improvement)
- https://help.arena.ai/articles/1655691990-how-to-use-coding-in-agent-mode (GitHub integration: sandbox copy, commit/PR, Diff)
- https://x.com/arena/status/2062566749418233981 (Agent Arena methodology: 160K task, 2.06M tool calls, phân bố tools)
- Phân tích tổng hợp đã trình PO trong chat 25/10 (bảng mapping 5 tín hiệu ↔ GON).

## 6. Liên kết chéo

- Ủy quyền: [`PO-CONTINUOUS-DELEGATION-2026-10-24.md`](PO-CONTINUOUS-DELEGATION-2026-10-24.md) — hàng FE-Confirm-12
- Trước đó: [`PO-DECISION-ARENA-AI-PATTERN-2026-10-24.md`](PO-DECISION-ARENA-AI-PATTERN-2026-10-24.md) (FE-Confirm-9/11) · [`PO-DECISION-GDEVELOP-INTEGRATION-2026-10-24.md`](PO-DECISION-GDEVELOP-INTEGRATION-2026-10-24.md) (FE-Confirm-10 — payload có kiểu dùng lại ở bước `gen_payload`)
- Demo: [`../../ux-prototype/standalone/index.html`](../../ux-prototype/standalone/index.html) · E2E: [`../../ux-prototype/standalone/tests/e2e.js`](../../ux-prototype/standalone/tests/e2e.js)
