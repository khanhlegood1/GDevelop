# Workspace tự host: dự án và tài nguyên trên máy Ubuntu

## Phạm vi

Bản Docker này có backend Node.js không phụ thuộc npm bên thứ ba. Nginx bảo vệ
**toàn bộ editor và API** bằng HTTP Basic Auth. Backend không publish cổng ra host.
Cấu hình dùng chung một workspace cho người biết mật khẩu; **không có tài khoản,
phân quyền, cách ly tenant, lịch sử phiên bản hay tự động hợp nhất thay đổi**.
Chỉ cho người đáng tin truy cập: game có thể chứa JavaScript do tác giả viết.

Dữ liệu nằm trong named volume `workspace-data` của Compose (tên thực thường là
`gdevelop_workspace-data`). Không nằm trong cache Chrome, không nằm trong image,
và không được gửi lên GDevelop Cloud bởi provider này. Xóa volume hoặc chạy
`docker compose down -v` sẽ xóa dữ liệu! Đổi tên thư mục/project Compose có thể chọn
volume khác; kiểm tra mount bằng `docker inspect` trước khi di chuyển triển khai.

### Giới hạn phiên bản đầu

- 32 MiB mỗi request (file hoặc project JSON); quota workspace 1 GiB.
- Cho phép upload PNG/JPEG/WebP, âm thanh phổ biến, MP4/WebM, TTF/OTF, GLB và JSON
  tùy loại resource. Tối đa 20 file một lần chọn, upload tuần tự.
- Không nhận HTML/SVG/JavaScript hay các định dạng nhiều file như glTF với file phụ,
  Spine, bitmap font. JSON/tilemap có tham chiếu file ngoài không tự nhập các file đó.
- Asset được gán ID ngẫu nhiên, không ghi đè theo tên file. Save/Open project giữ
  tham chiếu tới asset. Tài nguyên URL từ template/store vẫn là URL bên ngoài:
  **không hứa dự án offline hoàn toàn**, không sao chép private cloud resources.
- Save là thao tác thủ công. Chỉ báo thành công sau khi server ghi xong. Không có
  autosave. Nếu mất mạng, hết quota hay xung đột, giữ tab và sao lưu trước khi đóng.
- Blob URL tạm thời không được lưu như tài nguyên bền vững; cần nhập file gốc bằng
  “Upload to this server”.
- Hai tab cùng sửa: save dùng version token; tab dùng bản cũ bị 409 thay vì âm thầm
  ghi đè. Mở lại bản mới hoặc Save As thành bản sao sau khi giữ bản sửa hiện tại.
- Chưa có nút xóa project/asset hoặc dọn asset mồ côi. File upload chưa được Save
  vào project vẫn chiếm dung lượng; không tự xóa file trong volume nếu chưa kiểm tra
  tham chiếu và sao lưu.
- Tích hợp AI/cloud và lỗi CORS từ upstream không được sửa bằng provider này.

## Cập nhật máy Multipass đang dùng

1. Lưu/xuất các dự án đang mở trước khi thay image. Không reset site data khi chưa lưu.
2. Trong VM, cập nhật repo tới commit/nhánh chứa thay đổi này. Nếu PR chưa merge,
   không chỉ `git pull master` rồi mong thấy tính năng mới. Kiểm tra `git status`
   và giữ lại thay đổi riêng của bạn, không dùng reset/clean để né xung đột.
3. Mở shell Ubuntu (từ Terminal của Mac):

```sh
multipass shell gdevelop
cd ~/GDevelop
bash deploy/setup-storage-auth.sh
```

Nhập username riêng và mật khẩu ít nhất 12 ký tự. Mật khẩu không hiện trên màn hình;
file chỉ chứa SHA-512 crypt hash. File `deploy/secrets/htpasswd` được bỏ qua bởi Git
và Docker build context. Không gửi file này vào chat. Thiếu file sẽ làm triển khai
thất bại thay vì chạy workspace không có mật khẩu. Script không ghi đè credential cũ.
Nếu bind-mount báo permission denied, xác nhận file có mode 644 để UID Nginx đọc;
thư mục trên host vẫn có mode 700.

```sh
sudo docker compose build --pull
sudo docker compose up -d
sudo docker compose ps
sudo docker compose logs --tail=80 storage editor
curl -f http://127.0.0.1:8080/healthz
```

`healthz` công khai, không có dữ liệu người dùng. Kiểm tra API bắt buộc đăng nhập:

```sh
# Không có mật khẩu: phải trả 401
curl -I http://127.0.0.1:8080/api/storage/projects
# Thay YOUR_USER bằng username; curl hỏi mật khẩu, không đưa mật khẩu vào history:
curl -u YOUR_USER http://127.0.0.1:8080/api/storage/projects
```

Vẫn dùng SSH tunnel trên Mac như trước và mở **http://localhost:8080**.
Trình duyệt sẽ hỏi username/mật khẩu workspace vừa tạo (khác với GDevelop Cloud).
Dùng HTTPS nếu mở ra Internet. HTTP chỉ phù hợp loopback trong SSH tunnel; không
truyền Basic Auth qua HTTP trên LAN/Internet. Không publish cổng backend 3001.

## Sử dụng và kiểm chứng

- Tạo game: chọn nơi lưu **“This server (private workspace)”**. Nếu trình duyệt nhớ
  “Don't save this project now”, tự đổi lựa chọn sang server.
- Thêm Sprite → chọn ảnh từ Mac → **Upload to this server**. Không cần lưu lên Cloud.
- Kéo Sprite vào scene, **Save** (Ctrl/Cmd+S hoặc menu) rồi **Preview**.
- Đóng/mở lại editor → menu Open → **This server (private workspace)** → chọn project.
  Provider xuất hiện cả trong Open và Save As; không phải trong danh sách cloud games.
- Kiểm tra ảnh và scene còn nguyên. Thử restart container rồi mở lại project.
- **Download a copy** tạo ZIP có các file workspace được nhúng thành asset tương đối;
  cần kiểm tra ZIP tải xong và giữ ngoài VM. Public URL bên ngoài vẫn có thể phụ thuộc mạng.
  Mở ZIP trong GDevelop Desktop theo chức năng có sẵn. Phiên bản này chưa nhập lại ZIP
  trực tiếp vào provider server; muốn khôi phục đầy đủ workspace hãy dùng backup volume.
- Thử hai tab để xác nhận save bản cũ bị từ chối. Không mở lại/refresh tab còn sửa
  trước khi tải bản sao.

## Sao lưu và khôi phục toàn bộ workspace

Chạy trong `~/GDevelop` trong Ubuntu. Tạm dừng dịch vụ để backup nhất quán:

```sh
sudo docker compose stop
sudo docker compose run --rm -T --no-deps --user root --entrypoint tar storage -C /data -czf - . > workspace-backup.tar.gz
sudo docker compose up -d
ls -lh workspace-backup.tar.gz
```

Từ một Terminal trên Mac, chép backup ra ngoài VM:

```sh
multipass transfer gdevelop:/home/ubuntu/GDevelop/workspace-backup.tar.gz ./workspace-backup.tar.gz
```

Giữ thêm bản sao credential (riêng tư), repo commit, Compose project name và cấu hình.
Backup chứa dữ liệu riêng tư; mã hóa/hạn chế truy cập khi lưu ngoài máy.

Khôi phục vào volume **trống**, từ backup tin cậy, dùng cùng Compose project name:

```sh
sudo docker compose stop
# Đảm bảo volume đích trống; không nhập đè lên một workspace đang có dữ liệu.
sudo docker compose run --rm -T --no-deps --user root --entrypoint tar storage -C /data -xzf - < workspace-backup.tar.gz
sudo docker compose up -d
```

Không xóa volume hiện tại để thử restore nếu đó là bản dữ liệu duy nhất. Nên thử
restore ở một Compose project tách biệt trước. Không cho container khác mount volume
để ghi đồng thời; cơ chế khóa ghi chỉ bảo vệ một instance backend.

## Kiểm thử trước khi coi bản triển khai sẵn sàng

```sh
node --test deploy/storage/server.test.js
sudo docker compose config --quiet
sudo docker compose build
sudo docker compose run --rm --no-deps editor nginx -t
sudo docker compose up -d
```

Sau đó chạy checklist browser ở trên. Unit/API test không thay thế test Docker/Nginx
thực tế, xác thực, upload, Save/Open và game Preview trên ARM64/HTTPS.
