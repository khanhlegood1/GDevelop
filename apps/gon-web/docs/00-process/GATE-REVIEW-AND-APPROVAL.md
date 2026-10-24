# Review và phê duyệt Gate — Hướng dẫn cho Product Owner

> **Mục đích:** giúp PO duyệt nhanh nhưng không bỏ sót quyết định có tác động lâu dài.<br>
> **Áp dụng:** G0, P01–P06 và từng vertical slice lớn trong P04.<br>
> **Review tổng toàn dự án:** xem [R0 — Final Review Package](R0-FINAL-REVIEW-PACKAGE.md) (biên niên sử + checklist phán quyết một trang).

## 1. PO cần xem gì ở mỗi gate?

### G0 — Source & Architecture

- [ ] Tính năng nào dùng FastChat, WSIC, GDevelop hay GON tự xây?
- [ ] Có tính năng nào bị hiểu nhầm là “đã có sẵn” trong upstream không?
- [ ] Mức reuse có đúng mong muốn: dependency, port code, reimplement pattern, reference-only hay reject?
- [ ] Repository và ranh giới component có dễ quản trị không?
- [ ] Các quyết định bị hoãn sang P01/P03 có đúng là chưa cần khóa ngay không?

### P01 — Requirements

- [ ] Persona và bài toán có đúng người dùng 18+ mục tiêu không?
- [ ] Must/Should/Could/Won't có đúng thứ tự giá trị không?
- [ ] Acceptance criteria có đo được không?
- [ ] Success metric có khuyến khích học thật thay vì gian lận/tương tác rỗng không?
- [ ] Non-goals có bảo vệ dự án khỏi scope phình không?

### P02 — UX

- [ ] Người dùng có hiểu input vừa là tìm kiếm vừa là nội dung học không?
- [ ] Khi không có kết quả, Brew có rõ ràng và không gây cảm giác lỗi không?
- [ ] Arena vote, Fork, XP/Level và Proof có dễ hiểu không?
- [ ] Trạng thái chờ AI, lỗi, hết quota, nội dung bị từ chối được xử lý thế nào?
- [ ] Mobile, bàn phím, contrast, font tiếng Việt và accessibility có đạt mức tối thiểu đã thống nhất không?

### P03 — API/Data

- [ ] Dữ liệu nào được lưu, lưu bao lâu, ai được xem?
- [ ] Vendor/chi phí/lock-in có chấp nhận được không?
- [ ] XP, vote và Proof có chống sửa/gian lận ở phía server không?
- [ ] Embedding/model version thay đổi thì dữ liệu cũ xử lý ra sao?
- [ ] API/event contract có đủ ổn định để frontend, agent và GDevelop cùng dùng không?

### P04 — Build

- [ ] Demo có chạy đúng acceptance criteria đã duyệt không?
- [ ] Phần nào là thật, mock, simulated hoặc stub?
- [ ] Test/evidence có bao phủ logic lõi và lỗi quan trọng không?
- [ ] Code được port có ghi nguồn/giấy phép và đã qua scan chưa?
- [ ] Có thay đổi ngoài scope không?

### P05 — NFR/Security

- [ ] Rủi ro còn lại là gì và ai chịu trách nhiệm xử lý?
- [ ] Dữ liệu cá nhân, file/link người dùng, chứng chỉ và footprint được bảo vệ ra sao?
- [ ] AI có thể bị lạm dụng để tốn chi phí, tạo nội dung sai/độc hoặc rò rỉ prompt/data không?
- [ ] Hệ thống chịu tải, backup/restore và rollback đã diễn tập chưa?
- [ ] Có ngoại lệ bảo mật nào đang được xin chấp nhận không?

### P06 — Deployment/Go-Live

- [ ] Đây là staging hay production?
- [ ] Ai có quyền truy cập secrets và dữ liệu production?
- [ ] Rollback mất bao lâu, điều kiện kích hoạt là gì?
- [ ] Monitoring/alert và người trực incident là ai?
- [ ] PO có ra quyết định **Go** riêng bằng văn bản trong PR/release note không?

## 2. Ba cách PO phản hồi

### A. Approve

PO xác nhận artifacts đạt tiêu chí và cho phép mở gate tiếp theo. Nên ghi rõ phạm vi được duyệt và điều kiện kèm theo nếu có.

Mẫu:

```text
APPROVED — Gate 0 version <commit/PR>.
Cho phép bắt đầu P01 trong phạm vi đã ghi.
Điều kiện kèm theo: <nếu có>.
```

### B. Request Changes

PO nêu điểm chưa đạt theo artifact/tiêu chí. Gate quay lại `CHANGES REQUESTED`; AI sửa và gửi lại cùng gate, không mở gate tiếp theo.

Mẫu:

```text
CHANGES REQUESTED — Gate 0.
1. <điểm cần sửa>
2. <điểm cần làm rõ>
Chưa bắt đầu P01.
```

### C. Reject / Redirect

PO bác bỏ hướng hiện tại. AI phải lập ADR/đề xuất thay thế thay vì cố sửa nhỏ trên hướng đã bị bác.

Mẫu:

```text
REJECTED — <hướng bị bác>.
Lý do: <...>
Hướng cần nghiên cứu thay thế: <...>
```

## 3. Điều không được suy diễn thành phê duyệt

- “Tiếp tục” chỉ có nghĩa là tiếp tục công việc đang dở trong gate hiện tại, trừ khi PO nói rõ gate đã được duyệt.
- Việc xem demo không đồng nghĩa duyệt production.
- Việc merge tài liệu discovery không đồng nghĩa duyệt chi phí cloud, vendor, phát hành token hoặc thu thập dữ liệu thật.
- Việc duyệt một vertical slice không tự động duyệt toàn bộ roadmap.
- Test pass không thay thế acceptance của PO.

## 4. Mẫu PR cho một gate

```markdown
## Gate / Scope
- Gate:
- Requirement/ADR liên quan:
- Trong phạm vi:
- Ngoài phạm vi:

## Artifacts để duyệt
- ...

## Bằng chứng
- Test/build/scan đã chạy:
- Demo/screenshot:
- Phần chưa kiểm chứng:

## Quyết định cần PO xác nhận
1. ...

## Rủi ro và phương án giảm thiểu
- ...

## Rollback / cách thu hồi thay đổi
- ...

## Gate tiếp theo được đề xuất
- ...
```

## 5. Mẫu ghi quyết định rút gọn

Dùng khi quyết định chưa đủ lớn để thành ADR riêng:

| Ngày | Quyết định | Người duyệt | Artifact/PR | Ghi chú |
|---|---|---|---|---|
| 22/10/2026 | FastChat cho Arena; WSIC cho Search/Brew/ADK; GDevelop cho GON/game | PO | Gate 0 | Reuse có chọn lọc |
| 22/10/2026 | Production code ở `khanhlegood1/GDevelop` | PO | ADR-0001 | Không tạo repo production riêng tại Gate 0 |
| 22/10/2026 | Không wholesale-fork FastChat/WSIC | PO | ADR-0002 | Mọi port cần Audit |
| 22/10/2026 | **APPROVED Gate 0**, cho phép bắt đầu P01 | PO | Commit `5482dac` | Tại thời điểm đó, P01 vẫn cần phê duyệt riêng trước P02 (đã được duyệt ngay bên dưới) |
| 22/10/2026 | **APPROVED P01** và toàn bộ `D-P01-01`…`D-P01-14`, cho phép bắt đầu P02 | PO | Commit `9a09fa2` | Tại thời điểm đó, P02 vẫn cần phê duyệt riêng trước P03 (đã được duyệt ngay bên dưới) |
| 22/10/2026 | **APPROVED P02** và toàn bộ `D-P02-01`…`D-P02-12`, cho phép bắt đầu P03 | PO | Commit `33c2641` | Không có điều kiện cụ thể ngoài mẫu “<nếu có>”; usability test người dùng thật vẫn chưa thực hiện và được ghi là kiểm chứng còn mở trước P04 |
| 22/10/2026 | **APPROVED P03** và toàn bộ `D-P03-01`…`D-P03-14`, cho phép bắt đầu P04 với VS1 | PO | Commit `b4e6ec2` | Không có điều kiện cụ thể ngoài mẫu “<nếu có>”; các spike S-P03-01…04 và usability test thật vẫn phải xử lý trong P04 trước khi khóa production UI/release |
| 22/10/2026 | **APPROVED P04** toàn bộ và cho phép bắt đầu P05 | PO | PR #13; head `76eac200703ea0ac72907b43989b5a3dc73308d2`; merge `ef594dea3512f32dabe5c88b83ee6cb4ab24cc62` | PO để trống trường commit và không nêu điều kiện cụ thể ngoài mẫu “<nếu có>”; không suy diễn thêm mã quyết định `D-P04-*`. P05 và Go-Live vẫn cần duyệt riêng |

## 6. Quy tắc escalated decision

Phải dừng và xin PO quyết riêng trước khi:

- chọn vendor/cloud/database có chi phí hoặc lock-in đáng kể;
- lưu dữ liệu cá nhân/footprint thật;
- kết nối tài khoản mạng xã hội hoặc đọc dữ liệu bên thứ ba;
- phát hành/đổi điểm thành tài sản có giá trị chuyển nhượng;
- công khai journey/proof của người dùng theo mặc định;
- dùng nội dung người dùng để huấn luyện/đánh giá mô hình;
- deploy production hoặc bật thanh toán/quảng cáo;
- thay đổi công thức XP/Level đã ghi trong White Paper.
