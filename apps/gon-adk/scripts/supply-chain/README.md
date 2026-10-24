# Supply-chain tooling — GON ADK (P05-R1.12)

> Trạng thái: lock + SBOM + exception gate **đã kiểm chứng local** (PyPI/npm
> sandbox). Việc **phát hành SBOM tới kho artifact của tổ chức** và quét bởi
> nền tảng thứ ba (Dependency-Track/Container scanning) thuộc P06/ops —
> **NOT RUN**.

## Tệp

| Tệp | Việc làm |
|---|---|
| `../../requirements.lock` | Khóa toàn bộ transitives + sha256. CI cài bằng `pip install --require-hashes -r requirements.lock` rồi `pip install -e . --no-deps`. |
| `../../sbom.cdx.json` | SBOM CycloneDX 1.5 sinh từ lock (74 components). |
| `../../../gon-web/sbom.cdx.json` | SBOM CycloneDX 1.5 của npm graph (262 components, `npm sbom` built-in — không thêm dependency). |
| `security-exceptions.toml` | Ngoại lệ bảo mật **có quản trị**: mỗi CVE bị bỏ qua phải có compensating controls + ngày hết hạn. Cấm `--ignore-vuln` trần trong CI. |
| `check-exceptions.py` | Cổng audit: `pip-audit` trên **lock** (không phải môi trường tooling) + 3 quy tắc: finding phải có exception hợp lệ; exception hết hạn → FAIL; exception stale (fix đã có) → FAIL. |
| `generate-sbom.sh` | Tái tạo lock + 2 SBOM bằng tooling ghim `pip-tools==7.6.2`, `cyclonedx-bom==5.1.0`. |

## Vòng đời

1. Sửa dependency (`pyproject.toml`) → chạy `generate-sbom.sh` → commit cả
   `requirements.lock` + 2 SBOM.
2. CI (job GON ADK) cài từ lock và chạy `check-exceptions.py` thay cho
   `pip_audit --ignore-vuln`.
3. Khi `check-exceptions.py` báo **stale exception** = upstream đã sửa CVE →
   nâng pin trong `pyproject.toml`, xóa exception, regenerate lock/SBOM.
4. Khi báo **expired** → đánh giá lại rủi ro: gia hạn có lý do mới hoặc ép
   nâng/thay upstream.
