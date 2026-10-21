# GON White Paper

## Lifelong Learning, Infinite Numeric Levels, XP & Learning Token Accounting

**GON — Game Of Nurture · GON.org**<br>
**Version:** 1.0 · **Ngày ban hành:** 22/10/2026<br>
**Phạm vi:** Nền tảng học tập dạng game cho người trưởng thành 18+<br>
**Trạng thái:** Đặc tả mô hình tiến trình chuẩn của GON; prototype hiện tại đã triển khai công thức level số vô hạn ở client. Token được mô tả như một cơ chế ghi nhận/kế toán tương lai, **không phải** một tài sản đã phát hành, chào bán hay cam kết giá trị tài chính.<br>
**Bản PDF để chia sẻ:** [`GON-WHITEPAPER.pdf`](GON-WHITEPAPER.pdf) — được sinh tự động từ chính file Markdown này bằng [`../tools/build_whitepaper.py`](../tools/build_whitepaper.py); khi có khác biệt, Markdown là nguồn sự thật.

---

## Tóm tắt điều hành

Học tập là hành trình suốt đời. Vì vậy, cấp độ của GON **không dừng ở Forever**.

Từ phiên bản này, trục tiến trình chính của GON là **Numeric Level — cấp số vô hạn, xuất hiện ngay từ XP đầu tiên**:

```text
Numeric Level = floor(Lifetime XP / 100)
```

Mỗi **100 Lifetime XP** tương ứng đúng **1 Numeric Level**. Người học bắt đầu ở `Lv.0`, lên `Lv.1` tại 100 XP, `Lv.12` tại 1.200 XP, mở **Forever Era** tại `Lv.35` với 3.500 XP, rồi tiếp tục `Lv.36`, `Lv.37`, `Lv.100`, `Lv.1.000`… mà không có level cuối.

Các tên **Zero, Awaken, Explorer, Guardian, Hero, Legend, Forever** không còn là bảy “cấp cuối”. Chúng là **Era** — những kỷ nguyên/cột mốc kể chuyện nằm trên trục level số:

| Era | Numeric Level | Lifetime XP bắt đầu |
|---|---:|---:|
| Zero | Lv.0 | 0 |
| Awaken | Lv.1–2 | 100 |
| Explorer | Lv.3–6 | 300 |
| Guardian | Lv.7–11 | 700 |
| Hero | Lv.12–19 | 1.200 |
| Legend | Lv.20–34 | 2.000 |
| Forever | **Lv.35+** | **3.500+** |

Cùng một sổ cái học tập có thể làm cơ sở cho **Learning Token Accounting** trong tương lai: level đối chiếu với **Lifetime Earned Token** — tổng token/credit học tập đã kiếm được từ hành động học hợp lệ — chứ không đối chiếu với số dư có thể chi tiêu, mua bán hoặc chuyển nhượng. Do đó, tiêu token không làm tụt level; mua hoặc nhận token từ người khác cũng không mua được level.

Nguyên tắc ngắn gọn:

> **XP ghi lại việc học đã được xác thực. Numeric Level biến XP tích lũy suốt đời thành một trục tiến bộ không trần. Era kể câu chuyện trưởng thành. Proof chứng minh năng lực thật.**

## 1. Vấn đề của mô hình level hữu hạn

Mô hình cũ của GON V2 có bảy mốc: Zero (0), Awaken (100), Explorer (300), Guardian (700), Hero (1.200), Legend (2.000) và Forever (3.500). Cấu trúc này dễ truyền thông nhưng tạo ra ba mâu thuẫn:

1. **Forever bị hiểu là đích cuối** dù thông điệp của nó là học tập suốt đời.
2. Sau 3.500 XP, XP vẫn tăng nhưng level không còn thay đổi; giao diện phải hiển thị `next = null`, làm mất cảm giác bước tiếp theo.
3. Một tên gọi duy nhất không phân biệt được người vừa chạm 3.500 XP với người đã tích lũy 10.000, 100.000 hay 1.000.000 XP qua nhiều năm học và đóng góp.

White Paper này thay mô hình hữu hạn bằng một hệ hai lớp:

- **Numeric Level:** trục số chính, chính xác, vô hạn, tăng đều theo Lifetime XP ngay từ đầu.
- **Era:** lớp ý nghĩa và bản sắc; Forever là Era mở, không phải điểm kết thúc.

## 2. Định nghĩa chuẩn

### 2.1 Lifetime XP

**Lifetime XP (LXP)** là tổng XP học tập hợp lệ mà một tài khoản đã tích lũy trên GON, sau khi áp dụng các bút toán điều chỉnh/thu hồi do gian lận hoặc lỗi hệ thống được xác minh.

`state.xp` trong prototype hiện tại được diễn giải là Lifetime XP khi di trú sang mô hình này.

### 2.2 Numeric Level

**Numeric Level** là cấp số chính của người học. Ký hiệu hiển thị chuẩn là `Lv.N`, ví dụ `Lv.0`, `Lv.12`, `Lv.35`, `Lv.240`.

Numeric Level:

- Bắt đầu từ 0;
- Không có giá trị tối đa;
- Không reset theo mùa;
- Không giảm khi user chi tiêu token/credit;
- Chỉ thay đổi khi Lifetime XP hợp lệ thay đổi.

### 2.3 Era

**Era** là kỷ nguyên bản sắc bao phủ một khoảng Numeric Level. Era dùng cho kể chuyện, badge, màu sắc, đặc quyền cộng đồng và các mốc trưởng thành. Era không thay thế Numeric Level.

Hiển thị chuẩn luôn có cả hai lớp:

```text
Lv.12 · Hero Era
Lv.35 · Forever Era
Lv.128 · Forever Era
```

### 2.4 Forever Era

**Forever Era** bắt đầu tại `Lv.35` / 3.500 Lifetime XP và mở vô hạn. “Forever” có nghĩa là học tập, sáng tạo và phục vụ đã trở thành lối sống; nó không có nghĩa người học đã biết mọi thứ hay hoàn thành hành trình.

Từ Forever trở đi, số level vẫn là thước đo nhìn thấy chính:

```text
Forever Lv.35 → Forever Lv.36 → Forever Lv.50 → Forever Lv.100 → …
```

### 2.5 Learning Token và Lifetime Earned Token

Tài liệu này dùng **Learning Token** như tên làm việc cho đơn vị ghi nhận/thưởng học tập có thể được triển khai trong tương lai. Ở thời điểm White Paper 1.0:

- GON chưa phát hành token giao dịch;
- Prototype không có ví, token balance hay cam kết đổi XP thành tiền;
- Mọi tỷ lệ dưới đây là **quy ước kế toán thiết kế**, phải được phê duyệt pháp lý và công bố riêng trước khi áp dụng thật.

Ba đại lượng phải tách biệt:

| Đại lượng | Ý nghĩa | Ảnh hưởng level? |
|---|---|---|
| `LifetimeXP` | Tổng XP học hợp lệ tích lũy suốt đời | **Có — đây là cơ sở chuẩn của Numeric Level** |
| `LifetimeEarnedToken` | Tổng Learning Token/credit đã kiếm được từ sự kiện học hợp lệ | Chỉ dùng để đối chiếu nếu token được phát hành từ cùng sổ cái học tập |
| `SpendableTokenBalance` | Số dư hiện có sau chi tiêu/chuyển nhượng/khóa/mở khóa | **Không** |

## 3. Công thức level chuẩn `gon-level-v1`

### 3.1 Hằng số

```text
XP_PER_LEVEL = 100
FOREVER_LEVEL = 35
FOREVER_XP = 3.500
LEVEL_FORMULA_VERSION = "gon-level-v1"
```

### 3.2 Công thức

Cho `LXP` là Lifetime XP nguyên, không âm:

```text
NumericLevel(LXP) = floor(LXP / 100)
XPInCurrentLevel = LXP mod 100
LevelStartXP = NumericLevel × 100
NextLevelXP = (NumericLevel + 1) × 100
RemainingXP = NextLevelXP − LXP
ProgressInLevel = XPInCurrentLevel / 100
```

Không tồn tại `MaxLevel`, `FinalLevel` hay trạng thái sản phẩm “đã hoàn thành mọi level”.

### 3.3 Era tương ứng

```text
Era(LXP) =
  Zero      nếu    0 ≤ LXP < 100
  Awaken    nếu  100 ≤ LXP < 300
  Explorer  nếu  300 ≤ LXP < 700
  Guardian  nếu  700 ≤ LXP < 1.200
  Hero      nếu 1.200 ≤ LXP < 2.000
  Legend    nếu 2.000 ≤ LXP < 3.500
  Forever   nếu LXP ≥ 3.500
```

### 3.4 Vector kiểm thử bắt buộc

| Lifetime XP | Numeric Level | Era | XP tới level tiếp theo |
|---:|---:|---|---:|
| 0 | Lv.0 | Zero | 100 |
| 90 | Lv.0 | Zero | 10 |
| 100 | Lv.1 | Awaken | 100 |
| 299 | Lv.2 | Awaken | 1 |
| 300 | Lv.3 | Explorer | 100 |
| 1.250 | Lv.12 | Hero | 50 |
| 3.499 | Lv.34 | Legend | 1 |
| 3.500 | Lv.35 | Forever | 100 |
| 3.599 | Lv.35 | Forever | 1 |
| 3.600 | Lv.36 | Forever | 100 |
| 9.999 | Lv.99 | Forever | 1 |
| 10.000 | Lv.100 | Forever | 100 |
| 123.456 | Lv.1.234 | Forever | 44 |
| 1.000.000 | Lv.10.000 | Forever | 100 |

## 4. XP và Token tương ứng như thế nào?

### 4.1 Một sổ cái học tập, hai cách trình bày không được trộn lẫn

Nguồn sự thật là **sổ cái sự kiện học tập hợp lệ**. Từ sổ cái đó:

1. Hệ thống cộng XP vào `LifetimeXP` để tính Numeric Level và Era.
2. Nếu chính sách Learning Token được kích hoạt trong tương lai, cùng sự kiện có thể phát sinh `LifetimeEarnedToken` theo tỷ lệ đã công bố của phiên bản chính sách tại thời điểm sự kiện xảy ra.
3. Số dư chi tiêu được tính riêng từ phát hành, chi tiêu, chuyển nhượng, khóa, thu hồi hoặc các nghiệp vụ hợp lệ khác.

Thiết kế khởi điểm được White Paper đề xuất cho giai đoạn kế toán nội bộ là **1 XP hợp lệ ↔ 1 Learning Token Credit đã kiếm được**. Khi đó hai biểu thức cho cùng một level:

```text
Lv = floor(LifetimeXP / 100)
   = floor(LifetimeEarnedToken / 100)   // chỉ khi chính sách phát hành là 1:1
```

Sự tương ứng này dựa trên **tổng đã kiếm được suốt đời**, không dựa trên số dư hiện tại.

### 4.2 Những hành động không tạo level

Các hành động sau không được tự tạo Lifetime XP hoặc Lifetime Earned Token phục vụ level:

- Mua token/credit;
- Nhận chuyển nhượng từ người khác;
- Nắm giữ token lâu;
- Like, share, view hoặc click thuần túy;
- Tự bấm hoàn thành khi chưa qua kiểm tra theo rubric;
- Fork rỗng, vote vòng lặp, artifact sao chép hoặc proof giả.

### 4.3 Chi tiêu không làm tụt level

Nếu một user có 10.000 Lifetime XP, họ ở `Lv.100 · Forever`. Nếu tương lai họ dùng một phần Learning Token có thể chi tiêu, `SpendableTokenBalance` giảm nhưng `LifetimeXP` và `LifetimeEarnedToken` không giảm; level vẫn là `Lv.100`.

Nguyên tắc này ngăn hai lỗi nghiêm trọng:

- Người giàu mua token để mua danh hiệu học tập;
- Người học bị “tụt cấp” vì đã dùng phần thưởng của mình.

### 4.4 Điều chỉnh và thu hồi

XP/token phát sinh từ gian lận, trùng lặp hoặc lỗi hệ thống có thể bị điều chỉnh bằng bút toán đảo có lý do, chứng cứ và quyền khiếu nại. Khi `LifetimeXP` hợp lệ giảm, Numeric Level được tính lại theo cùng công thức. Không được âm thầm sửa số dư mà không có audit trail.

## 5. XP được tạo ra từ đâu?

Level chỉ có ý nghĩa khi XP đại diện cho học tập thật. XP production phải gắn với sự kiện có thể kiểm chứng ở mức phù hợp:

| Nhóm sự kiện | Ví dụ | Điều kiện ghi XP |
|---|---|---|
| Khởi tạo hành trình | Tạo project từ input, chốt mục tiêu | XP nhỏ, chống tạo project rác |
| Truy hồi | Quiz, flashcard, teach-back | Đạt ngưỡng rubric; câu hỏi có biến thể |
| Thực hành | Quest, reorder, simulation, game milestone | Server xác nhận event và idempotency |
| Sáng tạo | Artifact, infographic, video, game, bài viết | Có sản phẩm và provenance |
| Chuyển giao | Áp dụng sang tình huống mới | Câu trả lời/artifact không sao chép nguyên mẫu |
| Tác động thật | Boss Proof, hoạt động cộng đồng | Rubric và cấp xác minh proof rõ ràng |
| Dạy lại/đóng góp | Mentor, module được người khác học đạt mastery | Tính theo downstream learning đã xác thực, không chỉ like/share |

Các giới hạn chống lạm phát và farm XP phải gồm:

- Idempotency cho mỗi event;
- Giới hạn lặp cùng một hành động/nội dung;
- Daily/quest caps được công bố;
- Giảm XP cho luyện lại thuần túy nhưng vẫn khuyến khích ôn giãn cách;
- Phát hiện bot, tài khoản clone, vote ring và artifact sao chép;
- Tách XP tự khai khỏi XP được hệ thống hoặc issuer xác nhận khi hiển thị thành tích trọng yếu.

Prototype hiện tại cho một số XP qua thao tác client để minh họa vòng lặp. Production phải chuyển quyết định cộng XP chính thức về server.

## 6. Level toàn cục không thay thế năng lực theo chủ đề

Numeric Level là thước đo **tích lũy học tập hợp lệ trên toàn bộ hành trình**. Nó không tự chứng minh người dùng là chuyên gia trong mọi lĩnh vực, có học hàm, chứng chỉ nghề, tình trạng sức khỏe hay khả năng tài chính.

GON phải duy trì đồng thời:

1. **Global Numeric Level:** cấp số suốt đời từ tổng Lifetime XP.
2. **Era:** bản sắc/kỷ nguyên trưởng thành.
3. **Topic Mastery:** mức nắm từng concept/chủ đề — Exposed, Recall, Apply, Create, Teach.
4. **Proof Verification Level:** Self-declared, Source-linked, System-recorded, Issuer-verified, Anchored.

Ví dụ, một creator ở `Lv.240 · Forever` có thể vẫn là người mới `Exposed` trong thống kê y sinh. UI và thuật toán gợi ý phải tôn trọng sự khác nhau này.

## 7. Forever Cycles và cột mốc dài hạn

Forever không reset level và không dùng cơ chế prestige làm mất số đã tích lũy. Để hành trình nhiều năm vẫn có nhịp ăn mừng, GON có thể phát hành các **Forever Cycle** và legacy milestone chồng lên Numeric Level:

- Mỗi 10 level trong Forever là một chu kỳ hiển thị phụ, ví dụ Lv.35–44, Lv.45–54;
- Lv.50, Lv.100, Lv.250, Lv.500, Lv.1.000 có thể nhận Legacy Proof/Badge riêng;
- Season/Guild leaderboard có thể reset theo mùa, nhưng **Lifetime XP và Numeric Level không reset**;
- Người học có thể đặt mục tiêu năm, ví dụ “từ Lv.128 lên Lv.180”, thay vì bị ép vào một đích cuối nhân tạo.

Cycle chỉ là lớp trình bày/kỷ niệm. Công thức level không đổi và không có điểm dừng.

## 8. Quy tắc giao diện và ngôn ngữ

Mọi tài liệu, web, game và export của GON phải tuân thủ:

1. Hiển thị trục chính dưới dạng **`Lv.N · Era`**, ví dụ `Lv.12 · Hero`, `Lv.128 · Forever`.
2. Gọi 3.500 XP là **ngưỡng mở Forever Era**, không gọi là “level cuối”, “max level”, “hoàn thành hành trình”.
3. Thanh progress chính thể hiện tiến độ trong 100 XP của Numeric Level hiện tại; tiến độ mở Era tiếp theo là thông tin phụ.
4. Luôn có “còn X XP tới `Lv.N+1`”; không tồn tại trạng thái next rỗng vì chạm trần.
5. Roadmap Era phải ghi khoảng số: Zero `Lv.0`, Hero `Lv.12–19`, Forever `Lv.35+`.
6. Nếu hiển thị token, phân biệt rõ `Lifetime Earned` với `Spendable Balance`; không dùng số dư ví để suy ra cấp học.
7. Không dùng level toàn cục làm bằng chứng chuyên môn, y tế hoặc tài chính.
8. Số XP/level lớn phải được định dạng theo locale và dùng số nguyên có độ chính xác phù hợp ở backend; không ép vào số thực có thể mất chính xác.

## 9. Mô hình dữ liệu và hợp đồng kỹ thuật

### 9.1 Sổ cái XP

Mỗi bút toán XP tối thiểu gồm:

```text
entry_id
account_id
source_event_id
source_type
xp_delta
lifetime_xp_after
formula_version = "gon-level-v1"
rule_version
idempotency_key
status (posted | pending | reversed | rejected)
reversal_of (nullable)
created_at
actor/system
evidence_reference
```

`LifetimeXP` có thể được cache trong hồ sơ người dùng, nhưng phải tái tính được từ sổ cái.

### 9.2 Bản ghi level phái sinh

```text
account_id
lifetime_xp
numeric_level
era_key
level_start_xp
next_level_xp
xp_in_current_level
remaining_xp
formula_version
computed_at
```

Numeric Level là dữ liệu phái sinh từ Lifetime XP, không phải một số dư độc lập có thể bị sửa lệch.

### 9.3 Sổ cái token tương lai

Nếu Learning Token được triển khai, cần các trường tách biệt cho:

```text
lifetime_earned_token
spendable_token_balance
locked_token_balance
lifetime_spent_token
lifetime_transferred_in
lifetime_transferred_out
```

Chỉ `lifetime_earned_token` từ sự kiện học hợp lệ mới được dùng để đối chiếu tương đương level theo chính sách phát hành. Giao dịch mua, bán, tặng hoặc nhận không làm tăng đại lượng này.

### 9.4 Tính bất biến của công thức

- Công thức có version (`gon-level-v1`) và ngày hiệu lực.
- Thay đổi `XP_PER_LEVEL` hoặc ngưỡng Era là thay đổi governance lớn: phải công bố trước, có kế hoạch migration và nguyên tắc không làm mất tiến bộ đã kiếm hợp lệ một cách tùy tiện.
- Tỷ lệ phát hành XP/token cho hành động mới có thể điều chỉnh hướng tương lai để chống lạm phát; không bí mật viết lại lịch sử.
- Mọi export/API phải trả `formulaVersion` cùng level.

## 10. Migration từ GON V2

Người dùng và dữ liệu cũ được di trú không mất điểm:

| Dữ liệu V2 | Diễn giải V2.1/White Paper 1.0 |
|---|---|
| `xp` tích lũy | `LifetimeXP` |
| Zero 0 | Zero Era bắt đầu ở Lv.0 |
| Awaken 100 | Awaken Era bắt đầu ở Lv.1 |
| Explorer 300 | Explorer Era bắt đầu ở Lv.3 |
| Guardian 700 | Guardian Era bắt đầu ở Lv.7 |
| Hero 1.200 | Hero Era bắt đầu ở Lv.12 |
| Legend 2.000 | Legend Era bắt đầu ở Lv.20 |
| Forever 3.500 | Forever Era bắt đầu ở Lv.35 và mở vô hạn |
| `next = null` sau Forever | Bị loại bỏ; luôn có `Lv.N+1` |

Ví dụ: tài khoản cũ có 3.500 XP trước đây hiển thị “Forever — không còn level tiếp theo”. Sau migration, tài khoản hiển thị `Lv.35 · Forever`, cần thêm 100 XP để lên `Lv.36`.

## 11. Governance, minh bạch và giới hạn tuyên bố

### 11.1 Những điều GON được nói

- “Mỗi 100 Lifetime XP bằng một Numeric Level.”
- “Forever bắt đầu ở Lv.35 và không có level cuối.”
- “Level phản ánh tổng hành động học hợp lệ đã tích lũy theo quy tắc hiện hành.”
- “Learning Token, nếu được phát hành, sẽ có sổ cái và điều khoản riêng.”

### 11.2 Những điều GON không được nói

- Không nói XP/token có giá thị trường, lợi nhuận, khả năng đổi tiền hoặc biến người dùng thành triệu phú khi chưa có cơ chế hợp pháp và bằng chứng.
- Không nói level cao đồng nghĩa chuyên gia ở mọi chủ đề.
- Không nói đạt Forever là đã “học xong”.
- Không dùng level/XP để quyết định điều kiện y tế như đủ điều kiện hiến máu.
- Không cho phép mua level trực tiếp hoặc dùng số dư token chuyển nhượng làm cấp học.

### 11.3 Pháp lý token

Bất kỳ token có thể chuyển nhượng, marketplace, chia sẻ doanh thu, staking, phần thưởng tiền mặt hoặc cơ chế tương tự nào đều nằm ngoài White Paper 1.0 cho tới khi có đánh giá pháp lý, thuế, KYC/AML khi áp dụng, điều khoản creator/người dùng, quản trị rủi ro và công bố minh bạch theo từng thị trường. POAP/SBT dùng cho proof không tự động biến XP thành tài sản tài chính.

## 12. Lộ trình áp dụng

| Giai đoạn | Việc triển khai | Trạng thái tại White Paper 1.0 |
|---|---|---|
| **L0 — Prototype formula** | `Lv = floor(Lifetime XP/100)`, Era overlay, Forever Lv.35+ trong web prototype | **Đã triển khai ở client** |
| **L1 — Server XP Ledger** | Sổ cái XP phía server, idempotency, rule version, reversal/appeal | Chưa triển khai |
| **L2 — Mastery-aware XP** | XP dựa trên truy hồi, chuyển giao, artifact và retained mastery | Chưa triển khai đầy đủ |
| **L3 — Public Lifelong Profile** | Profile opt-in hiển thị Lv/Era/topic mastery/proof tách biệt | Chưa triển khai |
| **L4 — Learning Token Accounting** | Credit nội bộ hoặc cơ chế token sau phê duyệt pháp lý | Chưa phát hành |
| **L5 — Anchoring tuỳ chọn** | Neo proof/milestone bằng POAP/SBT mà không biến level thành số dư ví | Chưa triển khai |

## 13. Câu hỏi thường gặp

### Đạt Forever rồi có còn lên level không?

Có. Forever mở tại `Lv.35`. Sau đó mỗi thêm 100 Lifetime XP, người học tăng một Numeric Level: `Lv.36`, `Lv.37`, `Lv.38`…

### Nếu có 1.000.000 XP thì ở level nào?

`floor(1.000.000 / 100) = Lv.10.000`, thuộc Forever Era.

### Tiêu token có bị tụt level không?

Không. Level dựa trên Lifetime XP/Lifetime Earned, không dựa trên số dư có thể chi tiêu.

### Mua hoặc nhận token có lên level không?

Không. Chỉ XP/token được kiếm từ sự kiện học hợp lệ và ghi vào lifetime earned mới tương ứng với level.

### Level cao có nghĩa là giỏi mọi chủ đề không?

Không. Level toàn cục đo tích lũy học tập hợp lệ; năng lực cụ thể phải nhìn vào Topic Mastery và Proof theo từng lĩnh vực.

### Season mới có reset level không?

Không. Season có thể reset bảng xếp hạng hoặc mục tiêu mùa, nhưng Lifetime XP và Numeric Level là suốt đời.

### Nếu XP bị phát hiện gian lận thì sao?

Bút toán có thể bị đảo sau quy trình xác minh và khiếu nại. Level tính lại từ Lifetime XP hợp lệ còn lại.

## 14. Quyết định chuẩn hoá

White Paper 1.0 chốt các quyết định sau cho toàn bộ sản phẩm và tài liệu GON:

1. **Numeric Level là cấp chính và vô hạn ngay từ đầu.**
2. **1 Numeric Level = 100 Lifetime XP.**
3. **Zero → Legend là các Era hữu hạn; Forever là Era mở từ Lv.35+.**
4. **Không có max level, final level hay trạng thái “đã học xong”.**
5. **Token chỉ tương ứng với level qua Lifetime Earned từ học tập hợp lệ; số dư mua/chuyển/chi tiêu không quyết định level.**
6. **Level không thay thế Topic Mastery, credential hay Proof.**
7. **Mọi thay đổi công thức phải có version, migration và công bố minh bạch.**

---

## Tài liệu liên quan

- Đặc tả sản phẩm: [`GON-ORG-PRODUCT-SPEC-18PLUS.md`](GON-ORG-PRODUCT-SPEC-18PLUS.md)
- Requirement Trending/Personalized Fork: [`GON-TRENDING-PERSONALIZED-OUTPUT-REQUIREMENTS.md`](GON-TRENDING-PERSONALIZED-OUTPUT-REQUIREMENTS.md)
- Kiến trúc prototype/production: [`../../../apps/gon-web/ARCHITECTURE.md`](../../../apps/gon-web/ARCHITECTURE.md)
- Triển khai công thức prototype: [`../../../apps/gon-web/app.js`](../../../apps/gon-web/app.js)
- Kiểm thử level: [`../../../apps/gon-web/tests/app.test.js`](../../../apps/gon-web/tests/app.test.js)

*White Paper này là tài liệu thiết kế sản phẩm và quản trị tiến trình học tập. Nó không phải lời mời đầu tư, tư vấn tài chính, tư vấn pháp lý hoặc tư vấn y tế.*
