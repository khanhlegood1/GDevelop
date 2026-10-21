# Đặc tả sản phẩm GON.org — Heroes 18+

**Phiên bản:** 2.2 · **Ngày:** 22/10/2026 · **Trạng thái:** prototype tại `apps/gon-web/` đã triển khai Lifelong Numeric Level `gon-level-v1`; requirement Trending/Personalized Fork/Output Arena và White Paper ở tài liệu bổ sung liên kết bên dưới

## Tuyên ngôn

> **GON — Game Of Nurture.** Biến mọi điều bạn tò mò — một dòng chữ, một file, một bức ảnh, một video hay một đường link — thành hành trình **Search → 10+ Output → Arena Vote → Fork → Learn → Proof → Become**.

GON dành cho người trưởng thành **18+**: người trẻ đang xây năng lực, người đi làm học lại/học chéo, nhà sáng tạo giáo dục và những Hero cộng đồng như người hiến máu/tình nguyện. Cảm hứng vận hành đến từ ZOFO — Zero to Forever: AI Coach, Daily Quest, XP/Level/Guild và Proof. Trong GON, **Numeric Level là trục số vô hạn từ Lv.0** theo `floor(Lifetime XP/100)`; Zero → Forever là các Era, với Forever mở tại Lv.35+ chứ không phải đích cuối. GON không sao chép số liệu, logo, token hay tuyên bố y khoa của ZOFO.

## Sáu bước bắt buộc

| Bước | Trải nghiệm | Tiêu chí xong |
|---|---|---|
| 1. Sign in | Google + xác nhận 18+; giải thích dữ liệu sẽ lưu thành dự án học | Có Hero profile và consent rõ ràng |
| 2. Search anything | Text/file/ảnh/video/link vào một composer; chọn goal, depth, privacy | Mọi input trở thành Source Artifact có hash/provenance |
| 3. Explore or Brew | Full-text + vector 768D; có kết quả thì học ngay, thiếu thì “Brew Your Topic” | Không bao giờ kết thúc bằng trang “không có kết quả” trống rỗng |
| 4. Choose & Fork | Ít nhất 10 output được xếp hạng bằng trend chất lượng + footprint cá nhân; user Arena-vote, chọn/merge rồi Fork thành Journey Branch riêng | Branch có upstream, version, mục tiêu và attribution; ranking có lý do hiển thị |
| 5. Learn by quest | AI Coach vs Quest/Game, khái niệm, quest thật, flashcards, reorder, quiz, Boss Proof | Hoàn thành tạo XP và bằng chứng hệ thống |
| 6. Grow for life | `Lv.N · Era` vô hạn, timeline, Proof Vault, chủ đề liên quan, Daily Quest | Mỗi 100 Lifetime XP lên một Numeric Level; Forever mở ở Lv.35 và vẫn có Lv.36+; mỗi input mở một nhánh hành trình có thể quay lại |

## Thuật ngữ chuẩn

- **Source Artifact:** input gốc (text/file/ảnh/video/link) kèm hash và quyền riêng tư.
- **Learning Project:** một input/chủ đề được lưu thành dự án game hoá.
- **Learning Arena:** màn hình so sánh AI Coach Path và Quest/Game Path.
- **Brew Your Topic:** pipeline Google ADK tạo module khi kho nội dung chưa có kết quả đủ sát.
- **Boss Proof:** nhiệm vụ cuối yêu cầu sản phẩm/giải thích kiểm chứng được, không chỉ bấm hoàn thành.
- **Proof Vault:** kho POAP/SBT, Facebook, YouTube, ảnh chứng chỉ, chứng chỉ/chứng nhận và bằng chứng hệ thống.
- **Lifetime XP:** tổng XP từ hành động học hợp lệ tích lũy suốt đời, sau điều chỉnh/thu hồi có audit.
- **Numeric Level:** cấp số chính `Lv.N = floor(Lifetime XP / 100)`, bắt đầu ở Lv.0 và không có giới hạn trên.
- **Era:** lớp bản sắc phủ lên Numeric Level — Zero Lv.0, Awaken Lv.1–2, Explorer Lv.3–6, Guardian Lv.7–11, Hero Lv.12–19, Legend Lv.20–34, Forever Lv.35+.
- **Lifetime Earned Token:** nếu Learning Token được triển khai trong tương lai, đây là tổng token/credit đã kiếm được từ học tập hợp lệ và dùng để đối chiếu level; nó khác số dư có thể chi tiêu, mua hoặc nhận chuyển nhượng.
- **Hero Journey:** trục `Lv.0 · Zero → Lv.35 · Forever → Lv.36, Lv.37…` kéo dài suốt đời.
- **Output Candidate:** một hướng học/kết quả cụ thể được đề xuất từ input, có format, độ khó, trend/fit/quality và artifact cuối.
- **Personal Learning Footprint:** dấu chân mục tiêu, lựa chọn, vote, mastery, Fork và proof mà user đồng ý dùng cho cá nhân hoá.
- **Journey Fork/Branch:** bản sao có lineage của output/Success Path để user phát triển cá nhân hoá như Fork trên GitHub.
- **Success Path:** hành trình công khai có bằng chứng từ mindset/quyết định đến hành động, kết quả và điểm không thể sao chép nguyên vẹn.
- **Canonical Module Graph:** module trung lập định dạng để render thành web, game GDevelop, infographic, hình ảnh, video brief và task.

## Mô hình Lifelong Level chuẩn

Nguồn chuẩn: [`GON-WHITEPAPER.md`](GON-WHITEPAPER.md) · [PDF](GON-WHITEPAPER.pdf), công thức `gon-level-v1`.

```text
Numeric Level = floor(Lifetime XP / 100)
Next Level XP = (Numeric Level + 1) × 100
```

| Era | Numeric Level | Lifetime XP |
|---|---|---:|
| Zero | Lv.0 | 0+ |
| Awaken | Lv.1–2 | 100+ |
| Explorer | Lv.3–6 | 300+ |
| Guardian | Lv.7–11 | 700+ |
| Hero | Lv.12–19 | 1.200+ |
| Legend | Lv.20–34 | 2.000+ |
| Forever | Lv.35+ ∞ | 3.500+ |

- Hiển thị chuẩn là `Lv.N · Era`, kèm Lifetime XP và XP còn thiếu tới `Lv.N+1`; không tồn tại max/final level.
- XP chỉ được ghi khi hành động học đạt rule/rubric. Level toàn cục không thay thế Topic Mastery, credential hay cấp xác minh proof.
- Learning Token chưa được phát hành trong prototype. Nếu triển khai theo thiết kế 1 XP hợp lệ ↔ 1 Lifetime Earned Token Credit, level tương ứng `floor(Lifetime Earned Token/100)`. Chi tiêu token không làm tụt level; mua/nhận token không làm tăng level.
- Season/guild có thể reset bảng mùa nhưng không reset Lifetime XP hay Numeric Level.

## Nguồn bằng chứng được chấp nhận ở mức “gắn vào hồ sơ”

POAP/SBT, bài/ảnh Facebook, video YouTube, ảnh chụp chứng chỉ, file chứng chỉ/chứng nhận, link tổ chức và kết quả do GON ghi. **Được gắn** không có nghĩa **đã xác minh**. UI phải luôn hiển thị một trong năm cấp: Self-declared, Source-linked, System-recorded, Issuer-verified, Anchored.

## Module tối thiểu do Brew sinh

1. Learning brief và câu hỏi trọng tâm
2. 3–5 khái niệm lõi có nguồn
3. 5 quest tăng dần: khám phá → phân tích → thực hành → bằng chứng → chia sẻ/phục vụ
4. Flashcards truy hồi chủ động
5. Reorder/process challenge
6. Quiz có giải thích
7. Boss Proof ngoài đời thật
8. Related topics và Daily Quest tiếp nối
9. Nhiều output tiếp theo được xếp hạng bằng trend + footprint, sẵn sàng cho Arena vote/Fork
10. Render đa định dạng từ cùng Canonical Module Graph khi user chọn web, GDevelop, infographic, video hoặc task

## Requirement bổ sung V2.1

Tài liệu chi tiết: [`GON-TRENDING-PERSONALIZED-OUTPUT-REQUIREMENTS.md`](GON-TRENDING-PERSONALIZED-OUTPUT-REQUIREMENTS.md). Quy tắc level/XP/token không được suy diễn riêng trong từng tính năng; mọi output/Fork/reward phải quay về White Paper và `gon-level-v1`.

- Một input phải mở ra nhiều output, không khóa user vào một đáp án. Trend của GON dựa trên learner độc lập hoàn thành, Fork tạo artifact và proof — like/share chỉ là tín hiệu phụ.
- Researcher/tiến sĩ, KOL/creator, người đi làm, người học giải trí và Community Hero dùng các Learning Mode khác nhau nên cùng một input có thứ hạng output khác nhau.
- Output Arena cho phép vote trái/phải/hoà/cả hai chưa tốt/merge; điểm cặp và leaderboard phải có độ tin cậy, chống gian lận và không biến sở thích số đông thành xác minh sự thật.
- Mỗi user Fork một hành trình riêng với commit/diff/merge. Output bùng nổ nhờ giá trị học thật có thể đưa creator thành tiếng nói uy tín trong ngách, nhưng GON không hứa hẹn nổi tiếng hay thu nhập.
- Học theo trend chỉ được tính hoàn thành khi user truy hồi, giải thích, chuyển giao, sáng tạo và nộp proof; sao chép nguyên trào lưu không đủ điều kiện nhận badge lớn.

## Điều không làm

- Không phục vụ/định vị cho trẻ em trong master brand v2; mascot và cấp Hạt→Vườn của v1 đã nghỉ hưu.
- Không tạo cảm giác đã xác minh y tế/chứng chỉ khi mới chỉ có ảnh/link.
- Không dùng số liệu thành viên/lượt hiến/quest của ZOFO làm số liệu của GON.
- Không hứa hẹn token sinh lời hoặc ai cũng sẽ thành triệu phú/KOL sau một đêm; XP là điểm học tập nội bộ và token chưa được phát hành cho tới khi có pháp lý/giá trị được công bố hợp lệ.
- Không gọi Forever là level cuối/max level, không reset Numeric Level theo mùa, không cho mua level bằng token và không hạ level khi user chi tiêu token.
- Không tối ưu thuật toán cho lượt lướt/like/share thuần tuý, không khuếch đại trend chưa qua cổng chất lượng và không suy luận thuộc tính nhạy cảm để cá nhân hoá.
- Không cho AI Coach chẩn đoán bệnh hoặc thay thế cơ quan hiến máu/chuyên gia y tế.

## Chỉ số sản phẩm nên đo (không bịa số hiện tại)

- Tỷ lệ input tạo thành project; tỷ lệ search `found/related/missing`; thời gian Brew.
- Tỷ lệ hoàn thành quest/quiz/Boss Proof; chất lượng proof theo cấp.
- Độ chính xác search trên tập truy vấn gán nhãn; tỷ lệ claim có citation đạt grounding.
- Retention theo Daily Quest mà không dùng cơ chế gây nghiện/cưỡng ép.
- Verified Learning Gain, tỷ lệ output được chọn → Fork → hoàn thành/proof, độ đa dạng cá nhân hoá và downstream mastery do creator tạo ra.
- Phân phối Numeric Level/Era, tốc độ tăng Lifetime XP theo nguồn, XP bị reversal và dấu hiệu lạm phát/farm XP.
