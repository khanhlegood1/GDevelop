# Staging verification package (P05-R1.15)

> **Trạng thái:** package + local evidence HOÀN TẤT; **staging thật NOT RUN**
> (chờ hạ tầng của PO — xem `staging-checklist.md` §0).

Gói này là phần "thực thi được" của P05 re-review: mọi probe chạy được local
đã chạy và lưu kết quả; mọi probe cần hạ tầng thật được chuyển thành checklist
chạy lại được cho P06.

## Nội dung

| Tệp | Vai trò |
|---|---|
| `run-local-probes.sh` | Chạy 4 phase probe local: DAST-equivalent (default policy), benchmark baseline + heavy (relaxed guards — đo latency), guard-engagement (default policy, kỳ vọng 429). Tự start/stop dev server tươi cho từng phase. |
| `results/local-*.json` | Output thô của lần chạy evidence gần nhất (kèm timestamp UTC). |
| `results/dev-server-*.log` | Log server của lần chạy (git-ignored). |
| `staging-checklist.md` | Runbook P06: mỗi blocker `B-P05-01`…`B-P05-09` → tiên quyết, lệnh chạy, tiêu chí đạt trên hạ tầng thật. |

## Chạy lại local

```bash
cd apps/gon-web
bash deploy/staging-verification/run-local-probes.sh
```

Yêu cầu: Node 22 + `npm ci` đã chạy; port 3000 free (script tự kiểm tra và
tự start server; nếu đã có server chạy nó sẽ tái sử dụng — kết quả khi đó có
thể nhiễm state, hãy dừng server trước). Exit 0 = cả 4 phase đạt.

## Phân loại bằng chứng (rất quan trọng)

- Benchmark/probe local dùng **memory store + Dev Auth** — KHÔNG phải bằng
  chứng SLO staging (NFR-PERF-01…06 cần PostgreSQL thật + tải thật).
- Guard-engagement chỉ chứng minh **tầng origin**; edge (Cloud Armor/
  Cloudflare) là NOT RUN.
- DAST-equivalent 7 check KHÔNG thay thế ZAP/Burp/pentest độc lập.
- Chi tiết kết quả + diễn giải: [P05-R1.15 evidence](../../docs/06-nfr/P05-R1.15-STAGING-VERIFICATION-PACKAGE.md).
