# Tự host GDevelop Web Editor trên VPS (Docker + Nginx)

Bộ cấu hình này **chuẩn bị cho triển khai**, chưa tự tạo VPS, DNS hay chứng chỉ.
Nó phục vụ editor React dạng production và game runtime bằng Nginx, không chạy
React dev-server và không phụ thuộc vòng đời sandbox Arena.

## Phạm vi và giới hạn

- Core `libGD.js`/`libGD.wasm` được import từ `newIDE/app/vendor/libGD` và kiểm tra SHA-256.
- Runtime được build từ repo, đóng gói ở `/GDJS/Runtime` và tải từ cùng origin với editor.
- Docker build chạy `npm run build`, bao gồm tải editor phụ Piskel/JFXR/Yarn từ GitHub releases.
  VPS/build runner cần truy cập npm, GitHub và các host chứa release assets. Đây không phải build offline.
- Không tự host tài khoản, lưu trữ cloud, AI, Asset Store, khóa học, multiplayer backend
  hoặc dịch vụ cloud build/export của GDevelop. Những tính năng này có thể không dùng
  được trên tên miền riêng, cần khóa/API và cấu hình origin của nhà cung cấp.
- Có backend workspace riêng (`storage`) lưu project JSON và tài nguyên vào named volume
  `workspace-data`. Đây là **một workspace dùng chung**, không có phân quyền từng người,
  không phải bản thay thế tài khoản/cloud của GDevelop. Xem [hướng dẫn lưu trữ](Storage.vi.md).
- Bắt buộc tạo mật khẩu workspace trước khi chạy. Không dùng dự án
  “Don't save this project now” cho công việc quan trọng.
- Tên và logo GDevelop có quyền sở hữu riêng; xem README và LICENSE trước khi vận hành công khai.
- Bản core vendored có build commit không xác định. Cần thử dự án thực tế, không chỉ
  kiểm tra Docker build hay HTTP 200. Không tự động cập nhật riêng một file core.

## 1. Chuẩn bị

Ví dụ dưới đây dành cho **Ubuntu 24.04 LTS**, có quyền sudo:

- Khuyến nghị **8 GB RAM trở lên, 2–4 vCPU, 20 GB ổ đĩa trống để build**. Bundler
  được giới hạn heap 6 GB, tổng RAM cần nhiều hơn heap. VPS nhỏ có thể chỉ chạy image
  đã build ở máy/CI khác; không nên cố build trên máy 1–2 GB RAM.
- Một tên miền, ví dụ `editor.example.com`, trỏ bản ghi A tới IPv4 VPS. Chỉ thêm AAAA
  nếu IPv6 đã hoạt động. Thay toàn bộ tên miền ví dụ bằng tên miền của bạn.
- Mở inbound TCP 80/443 trong firewall nhà cung cấp và hệ điều hành; giữ cổng SSH
  thực tế của bạn. **Không mở cổng 8080 ra Internet**.

```sh
sudo apt update
sudo apt install -y docker.io docker-compose-v2 nginx certbot python3-certbot-nginx git
sudo systemctl enable --now docker nginx
sudo docker compose version

git clone https://github.com/khanhlegood1/GDevelop.git
cd GDevelop
# Dùng commit/nhánh đã có Dockerfile này; nếu chưa merge, checkout nhánh chứa thay đổi
# trong bản clone trên VPS. Sau khi merge, nên pin một commit đã kiểm thử.
```

Các thao tác git trên VPS là của bạn, không yêu cầu gửi mật khẩu/token vào chat.

## 2. Build và chạy

Tạo mật khẩu workspace trước lần chạy đầu (nhập tại máy chủ, không gửi vào chat):

```sh
bash deploy/setup-storage-auth.sh
```


Chạy tại thư mục gốc repo (cùng vị trí `compose.yaml`):

```sh
# Chạy một lần trước lần triển khai đầu tiên:
# bash deploy/setup-storage-auth.sh
sudo docker compose build --pull
sudo docker compose up -d
sudo docker compose ps
sudo docker compose logs --tail=100 editor
curl -f http://127.0.0.1:8080/healthz
curl -u YOUR_WORKSPACE_USER -fI http://127.0.0.1:8080/libGD.wasm
curl -u YOUR_WORKSPACE_USER -fI http://127.0.0.1:8080/GDJS/Runtime/index.html
```

Container chạy Nginx không phải root trên cổng 8080, chỉ được publish ở loopback
`127.0.0.1:8080`. Health check chỉ kiểm tra Nginx, không chứng minh editor/game hoạt động.
Build không mang `.git` vào image. Docker tính SHA-256 từ nội dung build context và
truyền vào version metadata để cache key của core/service worker đổi khi source đổi.
Giá trị này là dấu vân tay nội dung, không phải Git commit; ghi lại Git commit riêng.

## 3. Reverse proxy và HTTPS

```sh
sudo cp deploy/host-nginx.conf.example /etc/nginx/sites-available/gdevelop
sudo nano /etc/nginx/sites-available/gdevelop
# Thay editor.example.com bằng tên miền thật trước khi tiếp tục.
sudo ln -s /etc/nginx/sites-available/gdevelop /etc/nginx/sites-enabled/gdevelop
sudo nginx -t
sudo systemctl reload nginx

# Khi DNS đã trỏ đúng và HTTP cổng 80 truy cập được từ Internet:
sudo certbot --nginx -d editor.example.com --redirect
sudo certbot renew --dry-run
```

Mở **https://editor.example.com**. HTTPS là bắt buộc cho service worker và game preview
trên tên miền công khai; thử bằng `http://IP-VPS` không đủ để kiểm tra tính năng này.
Cấu hình phục vụ ở **gốc domain**, không hỗ trợ subpath `/editor/` trong hướng dẫn này.
Không cần WebSocket dev-server trong production.

## 4. Kiểm tra sau triển khai

```sh
curl -u YOUR_WORKSPACE_USER -fI https://editor.example.com/
curl -u YOUR_WORKSPACE_USER -fI https://editor.example.com/service-worker.js
curl -u YOUR_WORKSPACE_USER -fI https://editor.example.com/libGD.wasm
curl -u YOUR_WORKSPACE_USER -fI https://editor.example.com/GDJS/Runtime/index.html
# Phải là 404, không phải 200 với nội dung HTML:
curl -u YOUR_WORKSPACE_USER -I https://editor.example.com/missing-file.wasm
```

Trong trình duyệt:

1. Mở editor, kiểm tra console không có lỗi khởi tạo core.
2. Create → Create new game → Empty project → Don't save this project now.
3. Thêm object, mở scene/events và chạy Preview; cho phép pop-up nếu trình duyệt chặn.
4. Network phải tải runtime từ `/GDJS/`, không gọi `localhost:5002` hay runtime upstream.
5. Thử lưu/xuất và mở lại dự án theo phương thức có sẵn trước khi dùng cho công việc thật.
6. Thử trên trình duyệt mới/ẩn danh để phát hiện service worker cũ hoặc cache cũ.

Nginx trả `application/wasm` nhờ MIME mặc định của image, không cache cứng HTML,
service worker hay core, và trả 404 cho asset thiếu. `/browser_sw_preview/` do service
worker phía trình duyệt phục vụ; truy cập trực tiếp bằng curl sẽ trả 404 và là bình thường.
Nếu CDN Workbox không truy cập được, service worker vẫn đăng ký cho preview, nhưng
không có chức năng cache offline của Workbox.

## 5. Cập nhật, rollback và sao lưu

Trước mỗi lần cập nhật, ghi lại commit hiện tại và giữ image cũ:

```sh
sudo docker image tag gdevelop-self-hosted:local gdevelop-self-hosted:previous
# Sau khi đã lấy commit mới bạn muốn triển khai:
sudo docker compose build --pull
sudo docker compose up -d
sudo docker compose ps
```

Rollback về image trước đó (không dùng --build):

```sh
sudo docker image tag gdevelop-self-hosted:previous gdevelop-self-hosted:local
sudo docker compose up -d --no-build --force-recreate
```

Sao lưu cấu hình host Nginx, thông tin commit/image và dữ liệu dự án do người dùng lưu
riêng. `docker compose down` dừng editor; `restart: unless-stopped` khởi động lại khi
Docker/máy chủ reboot, nhưng không khôi phục các dự án chưa lưu ở tab trình duyệt.
Không tự động xóa các image cũ trước khi xác nhận bản mới hoạt động.

## Khắc phục sự cố

- **502 từ host Nginx:** kiểm tra `docker compose ps`, logs, healthz trên loopback,
  `sudo nginx -t` và `/var/log/nginx/error.log`.
- **Build hết RAM:** build trên runner/máy có RAM lớn hơn và chuyển image bằng
  `docker save`/`docker load` hoặc registry riêng; không thay bằng dev-server.
- **Download editor phụ lỗi:** kiểm tra Internet tới GitHub release/CDN. Không tắt
  kiểm tra TLS hoặc checksum để né lỗi.
- **Preview trắng:** kiểm tra HTTPS, service worker trong DevTools → Application,
  `/GDJS/Runtime/` và pop-up. Chỉ xóa cache/site data sau khi đã lưu dự án.
- **Tài khoản/AI/store không dùng được:** đây là tích hợp cloud, không phải backend
  được triển khai bằng bộ Docker này.
- **SANDBOX NOT FOUND:** chỉ liên quan link sandbox cũ. Dùng domain VPS, không dùng
  link `.e2b.app` cho bản production.

## Kiểm chứng bộ cấu hình

Trên máy có Docker, kiểm tra cấu hình rồi build thực tế:

```sh
sudo docker compose config --quiet
sudo docker compose build
sudo docker compose run --rm --no-deps editor nginx -t
sudo docker compose up -d
```

Các lệnh này và smoke test trình duyệt phải hoàn tất trên VPS/build runner trước khi
coi deployment sẵn sàng. Việc thêm cấu hình vào repo không đồng nghĩa đã triển khai VPS.
