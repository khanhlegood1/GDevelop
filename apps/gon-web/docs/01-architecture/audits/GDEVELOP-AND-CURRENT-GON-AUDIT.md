# Thẻ Audit nguồn — GDevelop & GON hiện tại

> **Gate:** G0<br>
> **Repository:** [`khanhlegood1/GDevelop`](https://github.com/khanhlegood1/GDevelop)<br>
> **Baseline đầu Gate 0:** `c1cd266e47117b37fe5158eddc0d51158b52561a`<br>
> **Giấy phép:** Core, GDJS, newIDE và Extensions theo MIT; tên/logo GDevelop thuộc quyền của Florian Rival theo `LICENSE.md`<br>
> **Kết luận Gate 0:** **PRODUCTION MONOREPO & GAME DIRECTION — PROTOTYPE CHƯA PHẢI PRODUCTION PLATFORM**

## 1. GDevelop cung cấp gì cho GON?

| Khu vực | Vai trò kỹ thuật | Ý nghĩa với GON |
|---|---|---|
| `Core` | Mô tả cấu trúc game/project | Nghiên cứu cách biểu diễn scene/object/event khi sinh game từ module |
| `GDJS/Runtime` | Game engine TypeScript dùng PixiJS cho 2D và Three.js cho 3D/WebGL | Ứng viên runtime để chạy game học tập trên web |
| `GDevelop.js` | WASM/JavaScript bindings | Cầu nối tiềm năng giữa web tooling và Core |
| `newIDE` | React/Electron editor | Tham chiếu cho authoring/template workflow; không mặc định nhúng toàn bộ editor vào GON |
| `Extensions` | Objects, behaviors và tích hợp game | Kho template/cơ chế để biến kiến thức thành nhiệm vụ/game ngắn |

`GDJS/package.json` trong baseline dùng PixiJS `7.4.2`, kiểu Three.js `0.185.1`, esbuild và có scripts type-check/build/test. Điều này ủng hộ hướng dùng GDevelop cho game runtime/templates/export sau khi P03 làm spike tích hợp.

## 2. GON hiện tại trong repository có gì?

### 2.1 Prototype `apps/gon-web`

Prototype tĩnh đã minh họa:

- cổng 18+ và Google sign-in dạng demo;
- Universal Input cho text/URL;
- `classifyUrl` phân biệt YouTube/Facebook/web;
- `createEmbedding768` deterministic phía client cho demo;
- `searchCorpus` và ngưỡng tìm thấy/Brew;
- `createBrewModule` sinh module mẫu phía client;
- Arena/journey/proof ở mức prototype;
- `calculateLevel` không giới hạn theo `floor(LifetimeXP / 100)`;
- lưu trạng thái bằng `localStorage`.

Tại thời điểm Gate 0, lệnh kiểm chứng hiện có:

```text
node --test apps/gon-web/tests/app.test.js
# 5 tests — 5 pass, 0 fail
```

Bộ test bao phủ demo embedding 768D, URL classification, search/Brew threshold, Brew module contract mẫu và lifelong levels.

### 2.2 Tài sản sản phẩm/thương hiệu

Repository hiện là nguồn sự thật cho:

- đặc tả GON.org 18+;
- yêu cầu trending, footprint, Journey Fork, vote và creator path;
- White Paper 1.0 và contract `gon-level-v1`;
- brandbook, logo, design tokens và nội dung VI/EN;
- hướng dẫn dùng GDevelop cho GON.

Đây là lý do Gate 0 giữ production code trong cùng monorepo thay vì tách một repo mới làm đứt truy vết sản phẩm.

## 3. Điều GDevelop/GON hiện tại chưa cung cấp

Prototype chưa có:

- OAuth/Google identity thật và authorization phía server;
- Gemini embeddings/generation thật;
- Google ADK agents chạy production;
- vector database hay search index thật;
- upload/OCR/ASR/transcription và quét an toàn file/URL;
- XP Ledger phía server, vote ledger và chống gian lận;
- Journey Fork có version graph thật;
- Proof verification với POAP/mạng xã hội/chứng chỉ;
- trend/footprint recommender thật;
- GDevelop exporter từ Canonical Module Graph;
- CI/CD, observability và vận hành production riêng cho GON.

Vì vậy không được mô tả prototype là nền tảng production. Giá trị của prototype là **product/UX probe + contract mẫu + công thức level đã test**, không phải backend.

## 4. Quyết định reuse

| Thành phần | Quyết định | Ghi chú |
|---|---|---|
| GON product spec/White Paper/brand tokens | **Canonical inputs** | P01/P02 phải truy vết về các tài liệu này; thay đổi công thức level cần quyết định riêng |
| Lifelong level formula/test vectors | **Evolve** | Chuyển phép tính hiển thị thành projection từ server XP Ledger tại P03/P04 |
| Prototype UX/UI | **Đầu vào cho P02** | PO có thể giữ, sửa hoặc thay; không khóa frontend framework tại G0 |
| Demo embedding/search/Brew trong `app.js` | **Reference/prototype only** | Production dùng Gemini/vector/ADK theo P03; không dùng deterministic demo embedding làm semantic search thật |
| GDJS runtime | **Ứng viên tích hợp** | P03 spike: nhúng runtime hay sinh project/export |
| Core/project format | **Nghiên cứu tại P03** | Cần kiểm chứng mức ổn định của format và cách sinh scene/events an toàn |
| newIDE nguyên bản | **Không nhúng mặc định** | Chỉ cân nhắc nếu P01 xác định nhu cầu authoring nâng cao |
| GDevelop name/logo | **Không dùng như thương hiệu GON** | Tôn trọng giới hạn thương hiệu trong `LICENSE.md` |

## 5. Câu hỏi tích hợp phải trả lời tại P03

1. GON nên sinh một GDevelop project hoàn chỉnh, điền dữ liệu vào template cố định, hay chạy GDJS runtime với scene được cấu hình động?
2. Canonical Module Graph ánh xạ sang scene/object/event/variable nào?
3. Game gửi telemetry về GON bằng contract gì để server xác thực completion/XP?
4. Asset ảnh/âm thanh/video do AI/người dùng cung cấp được kiểm duyệt và đóng gói thế nào?
5. Người dùng có được tải project về mở trong GDevelop IDE không, và quyền sở hữu/asset license ghi ra sao?
6. Hiệu năng/kích thước bundle trên mobile và accessibility của game được đo thế nào?

## 6. Rủi ro khi dùng chung monorepo

| Rủi ro | Giảm thiểu |
|---|---|
| Monorepo GDevelop rất lớn; thay đổi GON có thể vô tình chạm engine/IDE | PR GON giới hạn path, code owners/review khi chạm `Core`, `GDJS`, `newIDE`, `Extensions` |
| Nhịp phát triển IDE/engine khác nhịp sản phẩm GON | Version/pin integration points; adapter boundary thay vì sửa sâu upstream nội bộ khi chưa cần |
| Prototype tĩnh làm PO/người dùng tưởng tính năng AI đã thật | Gắn nhãn demo/simulated rõ; P04 chỉ tuyên bố thật theo evidence |
| Tài liệu GON nằm rải rác giữa branding và kỹ thuật | `apps/gon-web/docs` là cổng kỹ thuật; branding giữ brand/product assets và liên kết hai chiều |

## 7. Kết luận cho PO

GDevelop là **nhà** của GON và là hướng đúng cho lớp game. WSIC/FastChat bổ sung năng lực AI/Arena mà GDevelop không nhằm cung cấp. Ngược lại, GDevelop không nên bị ép làm backend web, vector database, identity provider hay XP ledger chỉ vì mã GON nằm cùng monorepo.
