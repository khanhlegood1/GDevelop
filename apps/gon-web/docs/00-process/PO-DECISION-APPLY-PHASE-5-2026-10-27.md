# PO Decision — Apply-5: GonLearningEvents — event học phát sinh trong game (2026-10-27)

**Kết luận: SHIPPED — chờ PO xác nhận.** Extension runtime **GonLearningEvents** chạy thật trong GDJS Runtime: chạm vào node → `objective_viewed`, xem đủ mọi node → `checkpoint_reached` — gửi thẳng về `POST /v1/game-sessions/{id}/events`.

## 1. Kiến trúc (theo quy ước chính thức của GDJS)

- **Runtime extension** `src/gdjs-extensions/GonLearningEvents/gonlearningevents.ts` → esbuild → `public/gdjs/Extensions/GonLearningEvents/gonlearningevents.js` (manifest 69 file, cuối list). Namespace `gdjs.evtTools.gonLearningEvents` đúng pattern extension GDevelop (`Extensions/Leaderboards/leaderboardstools.ts`): `sendGameEvent(eventType, dataJson)` + `pointIsOnObject()`.
- **Scene code generated** `src/lib/gdjs-scene-code.ts`: sinh module `gdjs["MainSceneCode"] = { func, idToCallbackMap }` — chính quy ước `RuntimeScene.setEventsGeneratedCodeFunction` dùng để chạy events (libGD generate khi export; GON sinh bằng generator **tĩnh, data-driven** — mọi dữ liệu graph chỉ lọt qua `JSON.stringify`, vẫn đúng FE-10: không tự viết game code tự do).
- **Bridge** trong launcher: `window.__gonSendEvent` — fetch `/api/csrf` + POST batch `gon.game-events/1.0` (same-origin cookie, CSRF header, Idempotency-Key, clientEventId unique, sequence tự tăng). Game không cần biết auth.

## 2. Hành vi trong game (mỗi frame, template cố định)

- Chuột thả trên AABB object node chưa xem → `objective_viewed` (nodeId + title, `source: "gdjs_in_game"`) + object hiện ✅ và đổi màu xanh.
- Tất cả node đã xem (biến scene `GonState`) → `checkpoint_reached` (`checkpointId: "all_nodes_viewed"`) đúng một lần.
- `session_completed` vẫn từ nút ✅ (overlay + app) — tránh bỏ dở giữa chừng.

## 3. Bằng chứng

- `./node_modules/.bin/tsc --noEmit` PASS (extension runtime thuộc môi trường GDJS — exclude khỏi tsconfig app như đúng vai trò của nó; build esbuild thật 1.4KB).
- `vitest run tests/production` → **204/204** (27 files; +8 test `gon-learning-events.test.ts`: object GonNode riêng, specs map, code chứa đủ event/tool calls, **code parse + chạy được với runtime scene giả**, source checks extension/bridge/wiring).
- Live port 3000: launcher 200 (có `__gonSendEvent`) · extension 200 · manifest 69 file · API nhận đúng chuỗi event game gửi: `session_started → active`, `objective_viewed` + `checkpoint_reached` (payload `source: gdjs_in_game`) → 200.

**Trung thực:** như Apply-4, canvas + click thật cần PO kiểm bằng preview (Học & Boss Proof → 🎮 → chạm từng dòng node trong game, xem đổi màu ✅). Metadata extension cho editor GDevelop (JsExtension declaration để kéo vào GDevelop IDE) chưa làm — ghi nợ.

## 4. Queue sau Apply-5

JsExtension declaration (editor GDevelop) · rubric `validatedLearningEffect` (checkpoint có điểm thật) · KOL token backend (P05+) · artifact embeds (P04) · VS2–VS5 · Storybook D-SB-02…06 · P05 verdict + P06 Go-Live (final call PO).
