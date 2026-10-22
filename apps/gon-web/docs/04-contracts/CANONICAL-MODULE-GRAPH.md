# P03 — Canonical Module Graph

> **Trạng thái:** APPROVED tại P03 — Product Owner đã duyệt ngày 22/10/2026<br>
> **Schema:** [`gon.module-graph/1.0`](schemas/canonical-module-graph.schema.json)<br>
> **Ví dụ hợp lệ:** [`examples/module-graph-viral-music.json`](examples/module-graph-viral-music.json)

## 1. Mục đích

Canonical Module Graph là biểu diễn học tập duy nhất mà Brew tạo ra và mọi renderer dùng chung. Nó ngăn mỗi định dạng tự phát minh nội dung, thứ tự học, rubric hoặc citation riêng.

```text
Search/Brew/Creator
  → ModuleVersion(graph)
      ├─ Web Player (bắt buộc Alpha)
      ├─ Infographic/Image brief
      ├─ Video script/storyboard
      ├─ Easy Task/Teach-back
      └─ GDevelop template (VS4)
```

Graph mô tả **học gì, vì sao, theo thứ tự nào, bằng bằng chứng nào**. Graph không chứa CSS, tọa độ UI, XP do client tự cộng hoặc logic quyền.

## 2. Cấu trúc cấp cao

```json
{
  "schemaVersion": "gon.module-graph/1.0",
  "module": {
    "title": "...",
    "summary": "...",
    "locale": "vi-VN",
    "estimatedMinutes": 30,
    "difficulty": "intermediate",
    "outcomes": [],
    "concepts": [],
    "prerequisites": [],
    "safetyNotices": []
  },
  "sources": [],
  "nodes": [],
  "edges": [],
  "rubrics": [],
  "renderTargets": [],
  "provenance": {}
}
```

### 2.1 Module metadata

- `title`, `summary`, `locale` bắt buộc.
- `outcomes[]`: kết quả quan sát được, mỗi outcome có `id`, `statement`, `conceptIds`.
- `concepts[]`: concept lõi/hỗ trợ/prerequisite; concept có `id`, `name`, `description`.
- `safetyNotices[]`: disclaimer/giới hạn theo loại chủ đề; không thay thế moderation.
- `estimatedMinutes` là ước lượng cho UX, không phải điều kiện mastery.

### 2.2 Sources

Mỗi `sources[]` có:

- `id` ổn định trong graph;
- `kind`: `user_artifact`, `external_web`, `external_video`, `dataset`, `creator_reference`;
- `title`, `uri?`, `artifactId?`, `retrievedAt?`;
- `rightsStatus`: `user_provided`, `link_only`, `licensed`, `public_reference`, `unknown`;
- `locators[]`: trang, timestamp, section hoặc span khi biết.

AI generator chỉ được dùng `sourceId` có trong evidence bundle đã cung cấp. URL do model tự bịa không có trong bundle bị validator loại.

## 3. Node types

| Type | Vai trò | Có thể gate mastery? |
|---|---|---:|
| `concept` | Giải thích có citation | Không, tối đa Exposed |
| `diagnostic` | Hỏi chẩn đoán ban đầu | Không trực tiếp |
| `retrieval` | Tự nhớ/giải thích trước đáp án | Có — Recall |
| `quiz` | Câu hỏi có giải thích | Có, theo rubric |
| `flashcard_deck` | Ôn truy hồi | Có khi có attempt được chấm |
| `reorder` | Sắp xếp quy trình/quan hệ | Có |
| `transfer` | Áp dụng tình huống mới | Có — Apply |
| `reflection` | Phản tư có cấu trúc | Chỉ khi rubric yêu cầu |
| `boss_proof` | Tạo artifact cuối | Có — Create |
| `teach_back` | Dạy lại bằng lời/artifact | Có — Teach |
| `media_brief` | Brief infographic/video/image | Không tự nó |
| `game_template` | Cấu hình template game VS4 | Chỉ qua game events đã xác thực |

Mỗi node có:

- `id`, `type`, `title`, `conceptIds`;
- `content` theo type;
- `citations[]` với `sourceId`, `locator`, `support` (`supports`, `background`, `contrasts`);
- `estimatedMinutes?`;
- `accessibility`: `textAlternative`, `transcript?`, `keyboardEquivalent?`;
- `assessment` khi là node được chấm, gồm `rubricId`, `masteryTarget` và `revealPolicy` cho đáp án mẫu (`after_submit`, `immediate`, `never`).

### 3.1 Nội dung theo node

- `concept`: đoạn giải thích dạng block text có cấu trúc, ví dụ và non-example.
- `retrieval/transfer/teach_back`: prompt, constraints, sample answer bị khóa theo policy.
- `quiz`: choices, đáp án đúng lưu server-side trong graph version nhưng player projection loại đáp án trước submit.
- `reorder`: items bị xáo trộn bởi runtime; graph lưu thứ tự đúng dạng server-only field khi projection.
- `boss_proof`: artifact yêu cầu, disclosure bắt buộc, rubric ref.
- `game_template`: templateId/version, learning variables và event mapping; không chứa executable code tùy ý.

Public API không trả nguyên canonical graph nếu graph chứa đáp án. P04 tạo **player projection** và trả qua field `playerGraph`, loại `correctChoiceIds`, sample answer chưa đến lúc reveal và internal scoring notes.

## 4. Edges và điều kiện mở khóa

`edges[]` có `fromNodeId`, `toNodeId`, `type`:

- `sequence`
- `prerequisite`
- `remediation`
- `optional`

Graph phải:

- không có node/edge ID trùng;
- không có edge tới node không tồn tại;
- phần prerequisite không có chu trình;
- một node Boss chỉ mở khi các gate được module khai báo đã đạt;
- node không tới được từ điểm bắt đầu phải được đánh dấu optional hoặc bị validator cảnh báo.

Mặc định module Alpha có đường tuyến tính dễ hiểu:

```text
Diagnostic (optional)
→ Concepts
→ Retrieval
→ Transfer
→ Boss Proof
→ Teach-back/Delayed Review (optional)
```

## 5. Rubric

Mỗi rubric có:

- `id`, `version`, `title`;
- `criteria[]`: `id`, `description`, `weight`, `required`;
- `passRule`: `all_required` hoặc `weighted_threshold` có threshold;
- `evidenceTypes`: text, artifact, choice, game events, teach-back;
- `feedbackGuidance`;
- `xpRuleId` tham chiếu rule phía server, không chứa số XP để client tự tin.

`masteryTarget` (`recall`/`apply`/`create`/`teach`) nằm trong `node.assessment`, không nằm trong rubric; cùng một rubric vì thế có thể được một node dùng cho đúng mức bằng chứng của node đó.

Rubric được snapshot trong ModuleVersion. AssessmentResult ghi tiêu chí nào đạt/chưa đạt thay vì chỉ một điểm tổng.

## 6. Provenance và trust

`provenance` tối thiểu:

```json
{
  "createdByType": "ai_assisted",
  "sourceArtifactIds": ["art_..."],
  "generation": {
    "brewJobId": "job_...",
    "agentPipelineVersion": "brew-v1",
    "modelIds": ["configured-at-runtime"],
    "promptTemplateVersions": ["module-generator-v1"]
  },
  "attribution": {
    "displayName": "GON AI draft",
    "upstreamModuleVersionId": null
  }
}
```

- Claim quan trọng không có citation phải được liệt kê trong `quality.unverifiedClaimIds`.
- `quality.citationCoverage` do validator tính, không do generator tự khai làm bằng chứng duy nhất.
- Graph không lưu raw chain-of-thought, API key, provider payload hay thông tin user không cần cho học tập.

## 7. Renderer contract

### Web

- Renderer bắt buộc trong Private Alpha.
- Tôn trọng edge/gating/rubric và text alternatives.
- Media lỗi vẫn còn text summary để học tiếp.

### Infographic/Image/Video

- Chỉ xuất brief/storyboard/script từ node đã có citation.
- Asset phát sinh có provenance và rights status; không dùng thumbnail không rõ quyền làm bằng chứng nội dung.

### GDevelop

- Graph node `game_template` chỉ map sang template đã duyệt.
- Biến game gồm concept, prompt, choices/parameters và event mapping.
- Game không nhận đáp án/rubric bí mật để tự chấm XP; server xác thực events.

## 8. Versioning

- Thay đổi cộng field optional giữ `1.0` nếu schema validator cũ vẫn đọc được.
- Thêm node type là thay đổi có rủi ro: renderer cũ phải bỏ qua an toàn hoặc từ chối bằng lỗi rõ; thường cần minor/major tùy tác động và ADR.
- Sửa graph của một module tạo `ModuleVersion` mới; không migration âm thầm graph của branch đang học.
- Khi schema major thay đổi, player phải đọc được version cũ còn branch active hoặc có converter tạo version mới để user chọn nâng cấp.

## 9. Validation gates trước khi ModuleVersion ready

1. JSON Schema valid.
2. ID/edge/concept/rubric references hợp lệ.
3. Ít nhất outcome, concept lõi, retrieval, transfer và Boss Proof theo PRD.
4. Node được chấm có rubric và mastery target.
5. Claim quan trọng có citation hoặc unverified label.
6. Không có URL/source ngoài evidence bundle.
7. Safety/policy scan hoàn tất.
8. Player projection không lộ đáp án.
9. Content hash được tính trên graph canonical sau khi chuẩn hóa key order ở implementation P04.

Thiếu một gate bắt buộc: BrewJob không chuyển `ready`; chuyển `needs_input`, `failed_retryable` hoặc `failed_terminal` tùy lỗi.
