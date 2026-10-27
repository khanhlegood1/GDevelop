# PO Decision — Apply-7: GonLearningEvents thành extension chuẩn GDevelop (2026-10-27)

**Kết luận: SHIPPED — chờ PO xác nhận.** Extension giờ nằm đúng chỗ chuẩn của monorepo (`Extensions/GonLearningEvents/`) với đầy đủ declaration (JsExtension.js) + runtime (gonlearningevents.ts), cùng cấu trúc như các extension chính thức của GDevelop.

## 1. Những gì đã làm

- **`Extensions/GonLearningEvents/JsExtension.js`** (mới): declaration chuẩn GDevelop 5 theo pattern `Extensions/DeviceVibration/JsExtension.js`:
  - Action **SendGameEvent** (eventType selector đủ 7 giá trị P03 + data JSON)
  - Action **SendObjectiveViewed** (nodeId + title tuỳ chọn)
  - Condition **PointIsOnObject** (x, y, object) — helper "chạm node"
  - `includeFile` → `Extensions/GonLearningEvents/gonlearningevents.js`; `functionName` → `gdjs.evtTools.gonLearningEvents.*`
- **Runtime move** từ `apps/gon-web/src/gdjs-extensions/` → `Extensions/GonLearningEvents/gonlearningevents.ts` (single source of truth ở đúng chỗ chuẩn); bổ sung `sendObjectiveViewed` + `pointIsOnObjectCondition` (chấp nhận cả gọi trực tiếp lẫn objects-list của events GDevelop).
- Build script serve runtime build mới (69 file manifest giữ nguyên); tsconfig app dọn exclude không còn cần.

## 2. Bằng chứng

- `tsc` binary thật PASS · battery **208/208** (28 files; +4 test `gon-extension-declaration.test.ts` chạy `createExtension` với mock gd chainable: đủ 2 actions + 1 condition, includeFile/functionName khớp namespace runtime, mọi functionName tồn tại thật trong source, sanity tests rỗng).
- `node scripts/build-gdjs-launcher.mjs` PASS — runtime build esbuild + serve 69 file.

**Trung thực:** sandbox không có libGD binary nên chưa chạy được `loadExtension` thật của GDevelop editor — lần import đầu vào GDevelop IDE (PO có thể tự mở) là bước verify cuối.

## 3. Queue sau Apply-7

KOL token backend (cần mở rộng hợp đồng — P03 đang LOCKED, chờ PO quyết) · artifact embeds (P04) · VS2–VS5 · Storybook D-SB-02…06 · P05 verdict + P06 Go-Live (final call PO).
