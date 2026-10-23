# Storybook trong GON monorepo — Phạm vi, ảnh hưởng và quyết định core GDevelop cho PO

> **Mục đích:** Ghi nhận Storybook là gì trong dự án này, nó ảnh hưởng những phần nào, và tập hợp các quyết định PO cần chốt **sau khi GON lên production** để sửa core GDevelop cho phù hợp.<br>
> **Người ghi:** Agent GON trên `arena/04f82c2a-gdevelop`, 23/10/2026.<br>
> **Neo dữ liệu:** PR #19, head `3a5af0faaa1ceab90d69d370c093e25f032e79a2` (2 commit `587f6e4` Storybook GON + `3a5af0f` WIP R1.5 scaffolding).<br>
> **Ranh giới:** Tài liệu này **không** thay đổi trạng thái P05 (**IN REVIEW — NOT YET PASS**), không phải bằng chứng production/staging, không quyết định P06 hay Go-Live. Mọi mục `D-SB-*` là **đề xuất chờ PO quyết định**, không phải quyết định đã ban hành.

---

## 1. Storybook là gì trong dự án này

Storybook là công cụ frontend workshop: build và trưng bày UI ở dạng cô lập (không cần backend), kèm docs, controls, play tests và accessibility checks. Trong repo `khanhlegood1/GDevelop` hiện có **hai Storybook hoàn toàn tách biệt** — một cái thuộc **core GDevelop (IDE)** và một cái mới thuộc **GON**:

| | **A. GDevelop IDE Storybook** | **B. GON Storybook** |
|---|---|---|
| Vị trí | `newIDE/app` (core GDevelop) | `apps/gon-web` (sản phẩm GON) |
| Phiên bản | Storybook **7.4.6** | Storybook **10.6.3** |
| Framework | `@storybook/react-webpack5` + `@storybook/preset-create-react-app`; code **Flow/JS** | `@storybook/nextjs-vite` + **Vite 8.3.5**; TypeScript strict + React 19 |
| Stories | `newIDE/app/src/stories/` (decorators, mocks, `everything-else.stories.js`) — UI GDevelop IDE | `apps/gon-web/src/components/Vs1App.stories.tsx` + `apps/gon-web/src/stories/` — màn hình GON VS1 + Design System |
| Điểm gắn GDevelop core | **Có**: `.storybook/preview-head.html` inject `libGD.js` (GDevelop.js), `ThemeDecorator`, `I18nProviderDecorator`, `GDevelopJsInitializerDecorator` | **Không**: không load GDevelop.js, không đụng `Core/`, `GDJS/`, `Extensions/`, `newIDE/` |
| Chạy local | `npm run storybook` cổng **9009**; output `newIDE/app/build-storybook/` | `npm run storybook` cổng **6006**; output `apps/gon-web/storybook-static/` (git-ignored) |
| CI | `.github/workflows/build-storybook.yml` — trigger **mọi push mọi nhánh** (`branches: ["**"]`, không path filter), Node **16**, build → sync S3 `gdevelop-storybook` → comment link vào PR → Chromatic (manual) | Job `GON Storybook` trong `.github/workflows/gon-ci.yml` — path filter `apps/gon-web/**`, Node **22**, chỉ build tĩnh, **không publish** ra ngoài |
| Tiêu thụ khác | `newIDE/visual-tests` dùng Storybook (URL hoặc static build) làm visual regression | Không có consumer nào khác ngoài review/CI |
| Trạng thái 23/10/2026 | **`build-storybook` FAIL** trên PR #19 (và các PR #15–#18 trước đó) | **`GON Storybook` PASS** trên PR #19 (31s) |

## 2. GON Storybook (PR #19) là gì

- **21 catalog entries**: 1 trang Overview + **12 stories chạy component `Vs1App` thật** (signed-out, thiếu Auth config, onboarding 18+/consent, workspace Search/Brew, Search cần làm rõ, Output Explorer, Journey Player Retrieval/Boss, Lifelong Progress, Proof Vault, bootstrap lỗi 503, loading) + **7 Design System stories** (foundations, controls, forms/consent, candidate/proof cards, learning flow, lifelong levels, feedback).
- **Mock API deterministic** trong trình duyệt (`src/stories/gonStorybookApi.ts`, `gonFixtures.ts`): chặn `/v1/*`, `/api/*`, trả đúng envelope `{data}` / `{data,page}` / Problem Details, mô phỏng dev sign-in → attestation → ranking → Journey/attempt/XP/Proof trong bộ nhớ tab. **Không** gọi backend, Google OAuth, PostgreSQL, GCS, Gemini hay ADK.
- **Ranh giới trung thực được giữ trong stories**: 18+ là self-attestation (không "xác minh giấy tờ"), `metadata_only` không bao giờ trình bày như đã đọc transcript, Brew tạo `draft_private` không auto-publish, XP chỉ ghi sau rubric pass, similarity không kết luận gian lận, proof ngoài không nâng Issuer-verified, `NumericLevel = floor(LifetimeXP/100)` không trần với Forever mở từ Lv.35+.
- Docs đầu vào: [`src/stories/Introduction.mdx`](../../src/stories/Introduction.mdx) và [`src/README.md`](../../src/README.md).

## 3. GON Storybook ảnh hưởng những phần nào

Bằng chứng grep `.next` sau `npm run build` ngày 23/10/2026: **không** tìm thấy `Vs1App.stories`, `gonFixtures`, `gonStorybookApi`, `GonDesignSystem` hay `storybook` trong `.next/static` và `.next/server` — stories **không** rò rỉ vào production bundle.

| Phần | Ảnh hưởng? | Chi tiết |
|---|---|---|
| Production bundle / runtime Next.js | **Không** | Stories chỉ nằm trong pipeline Vite của Storybook; không route, không import nào từ `app/` dẫn tới stories. Runtime `lib/api.ts`/`Vs1App.tsx` không đổi vì Storybook. |
| `npm run typecheck` | **Có** | `tsconfig` include `**/*.ts(x)` kéo `.storybook/` + stories vào typecheck (cố ý: type-safe theo DTO thật). Đổi DTO server phải sửa stories hoặc typecheck fail. |
| Dependencies | **Có, dev-only** | +6 devDeps (`storybook`, `@storybook/nextjs-vite`, `@storybook/addon-docs/a11y/links`, `vite@8.3.5`), ~260 packages mới trong `package-lock.json`. Không vào production install. `npm audit` 0 high. `vite@8.3.5` nằm trong peer range của `vitest@5.0.5` (tests 68/68 vẫn pass). |
| npm scripts | **Có** | `storybook`, `storybook:build`, `storybook:smoke` trong `apps/gon-web/package.json`. |
| CI GON (`gon-ci.yml`) | **Có** | Job mới `GON Storybook` chạy `storybook:build` trên mọi PR/push chạm `apps/gon-web/**` (PR #19: pass, 31s). |
| CI / checks GDevelop core | **Có gián tiếp — điểm quan trọng nhất** | `build-storybook.yml` trigger **mọi push** nên PR GON vẫn chạy Storybook IDE. Trên PR #19: `build-storybook` **fail** → tổng trạng thái PR `UNSTABLE` dù toàn bộ job GON pass. Đây là nguồn "UNSTABLE kinh niên" của các PR GON (#15–#19). |
| Git / artifacts | **Có** | `storybook-static/` được git-ignore; không commit artifact. GDevelop IDE Storybook thì publish S3 + comment PR (pipeline riêng của core). |
| Bảo mật / vận hành dev | **Có** | Dev server bind `0.0.0.0` để Arena preview (Storybook cảnh báo WebSocket/MCP channel có thể ghi file khi mở mạng). CI build offline, không publish. Dùng ngoài sandbox nên cân nhắc `--host 127.0.0.1`. |
| Source core GDevelop (`Core/`, `GDJS/`, `GDevelop.js`, `Extensions/`, `newIDE/`) | **Không** | PR #19 không sửa bất kỳ file nào của core. GON Storybook chạy hoàn toàn độc lập với GDevelop.js. |

## 4. Bằng chứng đã kiểm chứng (23/10/2026, head `3a5af0f`)

| Kiểm chứng | Kết quả |
|---|---|
| `npm run storybook:build` | Thành công; `index.json` **21 entries**; chỉ có warning `use client` directive/chunk-size của Vite |
| `npm run typecheck` | Pass |
| `npm test` | 68/68 (9 files) |
| `npm audit --audit-level=high` | 0 vulnerabilities |
| `npm run build` (Next production) | Pass; grep `.next` **không** thấy module story nào |
| Live smoke | Manager/iframe/`index.json` HTTP 200 |
| PR #19 checks | `GON Web`, `GON ADK`, `GON Contracts`, **`GON Storybook`** pass; `extract-translations` pass; **`build-storybook` (GDevelop core) fail** → `UNSTABLE` |

## 5. Các quyết định PO cần chốt sau khi GON lên production

> Mỗi mục dưới đây là **quyết định chờ PO**. Không mục nào được thực thi trước khi PO chọn, trừ khi PO giao riêng thành slice có phạm vi/audit theo quy trình Gate.

### D-SB-01 — Storybook của GDevelop IDE đang fail và kéo mọi PR GON thành UNSTABLE

**Hiện trạng:** `build-storybook.yml` chạy trên mọi push; `newIDE/app` dùng Storybook 7.4.6 + CRA preset + Node 16, fail lặp lại từ PR #15 đến PR #19. Job này không liên quan code GON.

| Option | Phạm vi sửa | Ưu/nhược |
|---|---|---|
| (a) **Path-filter workflow** `build-storybook.yml` chỉ chạy khi chạm `newIDE/**`, `Core/**`, `GDJS/**`, workflow | Chỉ sửa YAML CI, **không sửa core** | Hết UNSTABLE cho PR GON ngay; không sửa được Storybook IDE đang hỏng |
| (b) **Nâng cấp Storybook IDE** 7.4.6 → bản được hỗ trợ (VD 10.x) | Sửa core/newIDE lớn: bỏ `storyStoreV7`, `preset-create-react-app`, Flow→TS hoặc compat, `preview-head` libGD.js, `newIDE/visual-tests` | Trả lại visual-test/preview cho IDE; tốn slice riêng + regression |
| (c) **Retire Storybook IDE**; visual-tests chạy từ artifact/URL khác | Sửa pipeline + visual-tests | Giảm chi phí duy trì; mất workshop IDE |

**Khuyến nghị:** làm **(a) trước** (an toàn, không đụng core), để (b)/(c) thành slice GDevelop-core riêng sau production.

### D-SB-02 — Một Storybook chung hay hai Storybook tách biệt

**Khuyến nghị: GIỮ TÁCH.** Stack khác nhau (Next 16/React 19/TS vs CRA/Flow), major khác nhau (10 vs 7), đối tượng khác nhau (GON product UX vs GDevelop IDE components), **không share component nào**. Gộp = phải sửa core GDevelop lớn, lợi ích thấp. Nếu cần "một cửa", có thể để hai job cùng xuất link trong PR thay vì gộp codebase.

### D-SB-03 — Nếu PO vẫn muốn sửa core GDevelop "cho hợp lý với Storybook"

Các touchpoint **thực sự nằm trong core GDevelop** (mọi thay đổi cần slice/audit riêng, tuân thủ Gate 0 về license/security):

1. `newIDE/app/.storybook/preview-head.html` — khởi tạo `libGD.js` cho stories IDE.
2. `newIDE/app/src/stories/*Decorator.js` — `ThemeDecorator`, `I18nProviderDecorator`, `GDevelopJsInitializerDecorator`, `BrowserDropDownMenuDisablerDecorator`.
3. `newIDE/visual-tests/lib/StorybookServer.js`, `StorybookSuite.js`, `visual-tests/storybook-tests/` — phụ thuộc `build-storybook`/story IDs của IDE.
4. `.github/workflows/build-storybook.yml` + `newIDE/app/scripts/comment-storybook-links-on-pull-request.js` — pipeline S3 `gdevelop-storybook`, PR comments, Chromatic manual.
5. Node 16 → 22 trong workflow IDE (đồng bộ toolchain với GON CI).
6. (Tùy chọn) Cho phép GDevelop.js/game-template preview trong GON Storybook — sẽ phải load `libGD.js`, làm nặng thêm và mở lại rủi ro core; **không khuyến nghị**.

### D-SB-04 — Publish GON Storybook để PO review sau production

**Hiện trạng:** chỉ chạy local/CI build, không publish. Options: (a) giữ local như nay; (b) upload artifact GitHub Actions nội bộ mỗi PR; (c) S3/Chromatic riêng cho GON. **Khuyến nghị:** (b) trước khi cân nhắc (c), tránh lộ stories/metadata khi chưa cần.

### D-SB-05 — Tách component trong `Vs1App` (thuộc GON web, không phải core GDevelop)

Design System stories hiện là **pattern specimens** vì `Vs1App` là component nguyên khối. Nếu PO muốn Design System thành component library thật (controls/autodocs đúng nghĩa), cần refactor UI core của GON web (Button/Field/Badge/Panel/... thành component riêng). Đây là việc của GON web, tách khỏi quyết định core GDevelop.

### D-SB-06 — Chính sách typecheck stories và dev-server binding

**Khuyến nghị:** giữ stories trong `npm run typecheck` (bắt vỡ hợp đồng DTO sớm); chuẩn hoá host binding — `0.0.0.0` chỉ khi chạy trong sandbox preview, mặc định localhost cho developer; CI tiếp tục build offline.

## 6. Ranh giới của bản ghi này

1. P05 vẫn **IN REVIEW — NOT YET PASS**; các blocker `B-P05-01`…`B-P05-09` không đổi vì Storybook.
2. Storybook là bằng chứng **frontend/hermetic**, không chứng minh Google OAuth, PostgreSQL, GCS, Gemini/ADK, staging hay production.
3. PR #19 còn commit `3a5af0f` (WIP R1.5 scaffolding — chưa nối service/worker/ai_runs) không thuộc phạm vi Storybook và **không** hoàn tất P05-R1.5.
4. Nội dung `D-SB-*` chỉ có hiệu lực khi PO chọn option bằng quyết định riêng; số liệu CI neo vào head `3a5af0f` ngày 23/10/2026.

## 7. Tài liệu liên quan

- [GON Storybook Overview](../../src/stories/Introduction.mdx)
- [Production source guide](../../src/README.md)
- [P05 NFR & Well-Architected Review](../06-nfr/README.md)
- [P04 — Vertical Slice Build](README.md)
- Workflow GDevelop IDE: [`.github/workflows/build-storybook.yml`](../../../../.github/workflows/build-storybook.yml)
- Workflow GON: [`.github/workflows/gon-ci.yml`](../../../../.github/workflows/gon-ci.yml)
