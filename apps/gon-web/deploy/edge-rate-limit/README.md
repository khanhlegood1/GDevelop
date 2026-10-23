# Edge rate-limit module (P05-R1.10) — deployment packaging

> **Trạng thái: NOT RUN — chờ chạy trên hạ tầng thật.** Các tệp trong thư mục
> này là **manifest/recipe đóng gói sẵn** cho edge/origin rate limiting của
> GON. Sandbox phát triển không có Cloud Armor/Cloud Run/nginx thật, không
> load-test được — vì vậy **không có kết quả hiệu năng/throttling nào được
> claim ở đây**. Mọi con số limit là policy đề xuất, chỉnh theo quan sát
> staging sau khi deploy.

## Phân lớp bảo vệ (defence in depth)

| Lớp | Vị trí | Trạng thái | Ghi chú |
|---|---|---|---|
| L1 Edge | Cloud Armor / nginx / Cloudflare (tệp trong thư mục này) | **NOT RUN** | Giới hạn per-IP theo request rate, chặn volumetric floods trước khi chạm app |
| L2 Origin HTTP | `src/server/abuse-controls.ts` + `routes.ts` (`getAbuseController`) | **local/hermetic verified** | Token bucket per-IP + per-user, flood guard idempotent; state PostgreSQL chia sẻ (`0010_abuse_cost_controls.sql`) |
| L3 Domain service | `service.ts` (`enforceUserRateLimit`) | **local/hermetic verified** | Chặn ngay cả khi caller không đi qua HTTP (worker/script) |
| L4 Persistent quotas | `quota_reservations` (P05-R1.6) | **local/hermetic verified** | Giới hạn sản phẩm (search/brew/artifact/cost budget) — không phải rate |

Nguyên tắc chung: **fail-closed với flood, exempt idempotent replay** — client
retry cùng `Idempotency-Key` không bao giờ tự khóa mình; flood distinct request
vẫn bị phạt.

## Tệp

- `cloud-armor-policy.yaml` — Cloud Armor rate-limit ban policy gợi ý cho
  `GON_TRUST_PROXY_HEADERS=1` (Cloud Run/Load Balancer ghi đè
  `X-Forwarded-For`). Chèn vào backend policy của LB.
- `nginx-ratelimit.conf` — snippet `limit_req_zone`/`limit_req` cho origin
  nginx (dùng được cả cho local staging).
- `cloudflare-worker.js` — worker edge tối giản (token bucket in-memory per
  PoP) — optional, chỉ khi front bằng Cloudflare.

## Cấu hình app đi kèm (env)

```
GON_TRUST_PROXY_HEADERS=1        # BẮT BUỘC khi đã có edge tin cậy ghi đè XFF
GON_ABUSE_HASH_SALT=<random>     # salt hash IP (không lưu IP thô xuống DB)
GON_ABUSE_IP_READ_CAPACITY=240   # burst tokens/IP cho GET
GON_ABUSE_IP_WRITE_CAPACITY=120  # burst tokens/IP cho mutation
GON_ABUSE_USER_READ_CAPACITY=600
GON_ABUSE_USER_WRITE_CAPACITY=600
GON_ABUSE_FLOOD_STRIKE_LIMIT=120 # distinct request / 10s trước khi phạt
GON_ABUSE_BLOCK_BASE_MS=30000    # lần phạt đầu 30s, nhân đôi mỗi lần tái phạm
```

## Checklist chạy trên hạ tầng thật (NOT RUN)

1. Áp `cloud-armor-policy.yaml` (hoặc snippet nginx) trước khi mở public.
2. Đặt `GON_TRUST_PROXY_HEADERS=1` **chỉ khi** edge đã ghi đè
   `X-Forwarded-For` (nếu không, IP bucket suy biến về "unverified" — xem
   evidence P05-R1.10).
3. Chạy load test (k6/vegeta) trên staging: kỳ vọng 429 + `Retry-After` khi
   vượt bucket, quan sát `abuse_rate_buckets`/`abuse_flood_strikes` trong
   PostgreSQL (nhiều instance phải share state).
4. Xác nhận budget alert hook: bắn test alert qua `budgetAlertSink`/webhook
   (R1.11 gắn deliver), log `budget_alert` observable.
5. Ghi kết quả vào evidence doc — không sửa các claim local/hermetic ở trên.
