# PO Decision — Apply-4: GDJS Runtime launcher thật cho game session (2026-10-27)

**Kết luận: SHIPPED — chờ PO xác nhận.** `launchUrl` không còn null: game session giờ chạy trên **GDJS Runtime thật** (động cơ GDevelop, MIT), đúng ràng buộc FE-10: lấy động cơ GDJS (Runtime + project JSON có kiểu), KHÔNG đụng newIDE/C++, KHÔNG sinh game code.

## 1. Runtime thật — build bằng toolchain chính thức

- `node GDJS/scripts/build.js` (esbuild từng file .ts → .js) chạy thật trong repo — **903ms, PASS**.
- `apps/gon-web/scripts/build-gdjs-launcher.mjs`: build rồi copy **68 file** đúng danh sách *"Order is important"* của `GDJS/tests/karma.conf.js` (core + pixi-renderers + howler + fontfaceobserver + TextObject) vào `public/gdjs/` (~2.1MB) + `manifest.json` giữ thứ tự.
- `public/game-launch.html`: nhận project JSON qua postMessage (same-origin) → load runtime tuần tự theo manifest → khởi động `gdjs.RuntimeGame` **đúng pattern `GDJS/Runtime/index.html`** (createStandardCanvas → bindStandardEvents → loadAllAssets → startGameLoop) → nút ✅ trong game trả tín hiệu `complete` về app.

## 2. Project JSON có kiểu (FE-10: payload, không code)

- `src/lib/gdjs-launch.ts`: `gdjsProjectFromModuleGraph(config)` — interface đầy đủ (`GdjsProjectData`, `GdjsTextObjectData`, `GdjsInstanceData`, `GdjsLayoutData`…) mirror schema runtime thật (`GDJS/tests/games/Text.json`).
- Nội dung học render bằng **TextObject**: title, summary, từng node (type + phút ước lượng), outcomes, hướng dẫn hoàn thành; tự wrap ≤84 ký tự; windowHeight co giãn theo số dòng; nền #0b1226 đúng nhận diện GON.
- Config đầu vào là player graph **đã lọc** (không chứa sampleAnswer) — generator cũng không đọc trường ẩn (test chặn bằng source check).

## 3. Wiring

- Backend: `launchUrl: "/game-launch.html"` (thay null trung thực cũ) + test cập nhật.
- FE `GameSessionLauncher`: sau `session_started` → render iframe `/game-launch.html`, gửi `{project, sessionId}` qua postMessage khi iframe load; nghe `ready`/`complete`; nút hoàn thành trong game và ngoài app cùng gọi batch `session_completed` cũ.

## 4. Bằng chứng

- `./node_modules/.bin/tsc --noEmit` PASS (binary thật — phát hiện và sửa 1 lỗi TS sót từ Apply-3b do `npx` từng cài nhầm package giả `tsc@2.0.4`; đã ghi nhận khắc phục).
- `vitest run tests/production` → **196/196** (26 files; +8 test mới `gdjs-launch.test.ts`: generator schema, nội dung hiển thị, chặn rò đáp án, wrap, manifest & thứ tự, source checks).
- Live port 3000: `/game-launch.html` 200 · `/gdjs/manifest.json` 68 files (đầu: `libs/jshashtable.js`) · gd.js/pixi.js/runtimegame.js/textruntimeobject.js đều 200 · API tạo session trả `launchUrl: /game-launch.html`.

**Hạn chế ghi rõ (trung thực):** sandbox không có browser nên chưa tự verify được khung cảnh canvas render; PO mở preview (trang Học & Boss Proof → 🎮 Bắt đầu phiên học tương tác) để kiểm bằng mắt. Extension **GonLearningEvents** (event phát sinh trong game, vd checkpoint khi chạm object) chưa wired vào project JSON — bước kế tiếp.

## 5. Queue sau Apply-4

Extension GonLearningEvents thật trong game JSON (event trong game → /v1) · rubric `validatedLearningEffect` · xu hướng KOL token backend (P05+) · artifact embeds (P04) · VS2–VS5 · Storybook D-SB-02…06 · P05 verdict + P06 Go-Live (final call PO).
