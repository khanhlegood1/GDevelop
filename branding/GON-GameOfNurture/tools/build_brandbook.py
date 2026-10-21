#!/usr/bin/env python3
"""
GON Brandbook PDF builder (ReportLab canvas, 16:9 landscape like POAP short brandbook).
Layout grammar inspired by POAP (paper bg, chunky display titles, left text / right visual,
scalloped footer) — all GON artwork, colours and copy are original to GON.
Run: /tmp/venv-branding/bin/python tools/build_brandbook.py
"""
import pathlib, math
from reportlab.lib.pagesizes import landscape
from reportlab.lib.units import mm
from reportlab.lib.colors import HexColor, white, black
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.lib.utils import simpleSplit, ImageReader

ROOT = pathlib.Path(__file__).resolve().parent.parent
FONTS = ROOT / "tools" / "fonts-ttf"
OUT = ROOT / "02-Brandbook" / "GON-Brandbook-2026.pdf"
PNG = ROOT / "01-Logo" / "png"
TPL = ROOT / "04-Templates" / "png"
ILL = ROOT / "assets-illustration"

W, H = 960, 540  # points, 16:9
INK = HexColor("#12261E"); BODY = HexColor("#44564F"); PAPER = HexColor("#FFF9EE")
G500 = HexColor("#18B26B"); G700 = HexColor("#0C7746"); G800 = HexColor("#0B5C38")
G300 = HexColor("#6FD9A7"); G100 = HexColor("#D3F5E3"); G50 = HexColor("#EAFBF2")
SUN = HexColor("#FFC93C"); SUN500 = HexColor("#FFB020"); SKY = HexColor("#1499D6")
SKY700 = HexColor("#0A5E8C"); CORAL = HexColor("#FF6B57"); BERRY = HexColor("#7C6BE0")
LINE = HexColor("#DCE8E1"); CREAM = HexColor("#FFF3D6"); RED = HexColor("#D64541")

for name, f in [("BalooXB", "Baloo2-ExtraBold.ttf"), ("BalooB", "Baloo2-Bold.ttf"),
                ("BeVN", "BeVietnamPro-Regular.ttf"), ("BeVN-M", "BeVietnamPro-Medium.ttf"),
                ("BeVN-SB", "BeVietnamPro-SemiBold.ttf"), ("BeVN-B", "BeVietnamPro-Bold.ttf"),
                ("BeVN-XB", "BeVietnamPro-ExtraBold.ttf")]:
    pdfmetrics.registerFont(TTFont(name, str(FONTS / f)))
pdfmetrics.registerFont(TTFont("DejaVu", "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"))

def Y(top):  # top-down -> reportlab bottom-up
    return H - top

class P:
    def __init__(self, c, n, bg=PAPER):
        self.c = c; self.n = n
        c.setFillColor(bg); c.rect(0, 0, W, H, stroke=0, fill=1)
    # --- primitives (top-down coords) ---
    def rect(self, x, t, w, h, fill=None, stroke=None, r=0, sw=1):
        c = self.c; c.saveState()
        if fill: c.setFillColor(fill)
        if stroke: c.setStrokeColor(stroke); c.setLineWidth(sw)
        p = c.beginPath(); p.roundRect(x, Y(t + h), w, h, r); c.drawPath(p, stroke=1 if stroke else 0, fill=1 if fill else 0)
        c.restoreState()
    def circle(self, cx, ct, r, fill=None, stroke=None, sw=1):
        c = self.c; c.saveState()
        if fill: c.setFillColor(fill)
        if stroke: c.setStrokeColor(stroke); c.setLineWidth(sw)
        c.circle(cx, Y(ct), r, stroke=1 if stroke else 0, fill=1 if fill else 0); c.restoreState()
    def line(self, x1, t1, x2, t2, color=LINE, sw=1, dash=None):
        c = self.c; c.saveState(); c.setStrokeColor(color); c.setLineWidth(sw)
        if dash: c.setDash(*dash)
        c.line(x1, Y(t1), x2, Y(t2)); c.restoreState()
    def txt(self, s, x, t, font="BeVN", size=11, color=INK, anchor="start", leading=None):
        c = self.c; c.saveState(); c.setFont(font, size); c.setFillColor(color)
        fn = {"start": c.drawString, "middle": c.drawCentredString, "end": c.drawRightString}[anchor]
        fn(x, Y(t + size), s); c.restoreState()
    def para(self, s, x, t, w, font="BeVN", size=10.5, color=BODY, leading=15, anchor="start"):
        lines = simpleSplit(s, font, size, w)
        for i, ln in enumerate(lines):
            xx = x if anchor == "start" else x + w / 2
            self.txt(ln, xx, t + i * leading, font, size, color, anchor)
        return t + len(lines) * leading
    def img(self, path, x, t, w=None, h=None):
        im = ImageReader(str(path)); iw, ih = im.getSize()
        if w and not h: h = ih * w / iw
        if h and not w: w = iw * h / ih
        self.c.drawImage(im, x, Y(t + h), w, h, mask="auto", preserveAspectRatio=False)
        return w, h
    def squiggle(self, x, t, w, color=G500):
        c = self.c; c.saveState(); c.setStrokeColor(color); c.setLineWidth(2); c.setLineCap(1)
        p = c.beginPath()
        for i in range(int(w) + 1):
            yy = Y(t) + 3 * math.sin(i / 7.0)
            (p.moveTo if i == 0 else p.lineTo)(x + i, yy)
        c.drawPath(p); c.restoreState()
    # --- brand chrome ---
    def title(self, lines, x=54, t=58, size=30, color=INK, shadow=G300):
        if isinstance(lines, str): lines = [lines]
        for i, ln in enumerate(lines):
            self.txt(ln, x + 2.2, t + i * (size + 4) + 2.2, "BalooXB", size, shadow)
            self.txt(ln, x, t + i * (size + 4), "BalooXB", size, color)
        self.squiggle(x + 2, t + len(lines) * (size + 4) + 6, 86)
        return t + len(lines) * (size + 4) + 22
    def kicker(self, s, x=54, t=34, color=G700):
        w = pdfmetrics.stringWidth(s, "BeVN-B", 9) + 26
        self.rect(x, t, w, 20, fill=G50, r=10)
        self.txt(s, x + 13, t + 4.5, "BeVN-B", 9, color)
    def footer(self, note=None):
        c = self.c; c.saveState(); c.setFillColor(G50)
        for i in range(25): c.circle(20 + i * 40, -8, 21, stroke=0, fill=1)
        c.restoreState()
        self.txt("*", W - 56, H - 34, "DejaVu", 10, G700)
        self.txt(f"{self.n:02d}", W - 42, H - 35, "BeVN-B", 9, G700)
        if note: self.txt(note, 54, H - 35, "BeVN", 7.5, BODY)
    def pill(self, s, x, t, fill=SUN, color=INK, size=9.5, font="BeVN-B"):
        w = pdfmetrics.stringWidth(s, font, size) + 26
        self.rect(x, t, w, 22, fill=fill, r=11); self.txt(s, x + 13, t + 5, font, size, color)
        return w
    def bullet(self, head, body, x, t, w, dot=G500):
        self.circle(x + 5, t + 7, 5, fill=dot)
        end = t
        if head: self.txt(head, x + 18, t, "BeVN-B", 10.5, INK); end = t + 15
        return self.para(body, x + 18, end, w - 18, size=9.8, leading=14) + 8
    def newpage(self):
        self.footer(); self.c.showPage()

TOTAL = 30
def page(c, n, bg=PAPER):
    c.setPageSize((W, H)); return P(c, n, bg)

# =====================================================================
def p01_cover(c):
    p = page(c, 1)
    p.img(ILL / "gon-hero-cover.jpg", 330, 0, w=630)
    # soften left edge of illustration into paper
    for i in range(14):
        p.rect(330 + i * 4, 0, 4, H, fill=PAPER)
        p.c.setFillColor(PAPER)
    p.img(PNG / "gon-icon@512.png", 54, 118, w=96)
    y = p.title(["GON", "BRANDBOOK"], t=222, size=41)
    p.txt("GAME OF NURTURE", 56, y + 2, "BeVN-XB", 13, G700)
    p.para("Bộ nhận diện thương hiệu cho nền tảng game giáo dục — trẻ em và người lớn, mọi lứa tuổi.", 56, y + 30, 250, size=11, leading=16)
    p.pill("Chơi. Học. Lớn khôn.", 56, y + 86)
    p.txt("2026 — Phiên bản đầy đủ v1.0 · Play. Learn. Grow.", 56, H - 62, "BeVN-SB", 9, BODY)
    p.newpage()

def p02_index(c):
    p = page(c, 2); p.kicker("MỤC LỤC · INDEX")
    y = p.title(["CHÀO MỪNG ĐẾN", "VỚI VƯỜN GON"], size=26)
    p.para("Đây là nơi vũ trụ GON bắt đầu. Hãy đi từ hạt giống của thương hiệu — lý do GON tồn tại — đến những ứng dụng xa nhất: trong game, trong lớp học và trong tay phụ huynh.", 54, y, 330, size=11, leading=16)
    p.para("Cấu trúc sách học theo POAP Brandbook (Logo, Typography, Color, Partnerships, Integrators) và mở rộng thêm nền tảng, giọng nói, an toàn trẻ em — những điều một thương hiệu giáo dục bắt buộc phải có.", 54, y + 88, 330, size=10, leading=15)
    p.pill("Đọc kèm: README.md + gon-tokens.css", 54, y + 176, fill=G100, color=G800)
    rows = [("01", "Nền tảng thương hiệu", "GON là gì · sứ mệnh · mọi lứa tuổi", "03"),
            ("02", "Logo", "cấu tạo · khoảng thở · đơn sắc · đừng làm", "07"),
            ("03", "Typography", "Baloo 2 + Be Vietnam Pro", "13"),
            ("04", "Màu sắc", "bảng màu · tương phản WCAG", "15"),
            ("05", "Hình ảnh & linh vật", "minh họa · Gon Mầm · họa tiết", "18"),
            ("06", "Giọng nói & nội dung", "tính năng · thang tuyên bố", "21"),
            ("07", "Đối tác & tích hợp", "co-brand · Powered by · huy hiệu", "23"),
            ("08", "Ứng dụng & sản phẩm", "GDevelop · an toàn · quản trị", "25")]
    t = 92
    for no, name, desc, pg in rows:
        p.circle(505, t + 12, 15, fill=G700); p.txt(no, 505, t + 7.5, "BalooB", 10, white, "middle")
        p.txt(name, 532, t, "BalooB", 14.5, INK); p.txt(desc, 532, t + 19, "BeVN", 9, BODY)
        p.txt(f"tr. {pg}", 890, t + 4, "BeVN-B", 9.5, G700, "end"); t += 52
    p.newpage()

def p03_what(c):
    p = page(c, 3); p.kicker("01 · NỀN TẢNG THƯƠNG HIỆU")
    y = p.title(["GON LÀ GÌ?"])
    p.para("GON — Game Of Nurture là nền tảng game giáo dục cho mobile, web và desktop: biến thời gian chơi thành thời gian học. Mỗi trò chơi ngắn rèn một kỹ năng nền tảng với độ khó tự thích ứng theo từng người chơi.", 54, y, 360, size=11, leading=16)
    p.para("Điểm khác biệt so với mặt bằng game giáo dục: GON phục vụ vòng đời học tập trọn vẹn — bé 3 tuổi, học sinh, thanh thiếu niên, người đi làm, phụ huynh và ông bà luyện trí não — trong một hệ sinh thái an toàn duy nhất.", 54, y + 86, 360, size=11, leading=16)
    yy = y + 176
    yy = p.bullet("Nuôi dưỡng (Nurture)", "Học như trồng cây: đúng nhịp, đúng nhu cầu, không ép trái chín.", 54, yy, 360, G500)
    yy = p.bullet("Qua trò chơi (Game)", "Tò mò và niềm vui thuần khiết là động cơ — không phải cơ chế gây nghiện.", 54, yy, 360, SUN500)
    x = 470
    feats = [("Thích ứng từng người", "Độ khó uốn theo nhịp học, gồm trẻ cần hỗ trợ đặc biệt.", G500),
             ("Kỹ năng cho tương lai", "Trí nhớ làm việc và kỹ năng điều hành — nền của học tập suốt đời.", SKY),
             ("Người lớn thấy tiến bộ", "Báo cáo rõ ràng cho phụ huynh và giáo viên.", SUN500),
             ("Chỉ có game, an toàn", "Không quảng cáo, không chat lạ, không mua hàng ẩn.", CORAL)]
    t = 104
    for h, b, col in feats:
        p.rect(x, t, 420, 82, fill=white, stroke=LINE, r=16)
        p.circle(x + 30, t + 30, 13, fill=col)
        p.txt(h, x + 56, t + 14, "BalooB", 14, INK); p.para(b, x + 56, t + 38, 330, size=9.8, leading=14); t += 96
    p.newpage()

def p04_mission(c):
    p = page(c, 4); p.kicker("01 · SỨ MỆNH — TẦM NHÌN — GIÁ TRỊ")
    y = p.title(["GIEO MẦM HÔM NAY,", "GẶT TƯƠNG LAI"], size=27)
    p.rect(54, y, 400, 92, fill=INK, r=16)
    p.txt("SỨ MỆNH", 74, y + 12, "BeVN-XB", 10, SUN)
    p.para("Giúp mọi người — ở mọi lứa tuổi, mọi khả năng — học vui và lớn khôn mỗi ngày qua những trò chơi an toàn, tử tế.", 74, y + 32, 362, "BeVN-SB", 11.5, white, 16)
    p.rect(54, y + 106, 400, 92, fill=G50, stroke=LINE, r=16)
    p.txt("TẦM NHÌN", 74, y + 118, "BeVN-XB", 10, G700)
    p.para("Một thế giới nơi chơi game là cách học được tin cậy nhất trong mỗi gia đình và lớp học.", 74, y + 138, 362, "BeVN-SB", 11.5, INK, 16)
    p.pill("Lời hứa: Học vui — an toàn — thấy tiến bộ", 54, y + 214)
    vals = [("Nuôi dưỡng", "Tôn trọng nhịp riêng của mỗi người học.", G500),
            ("Vui thuần khiết", "Tò mò dẫn đường; không thủ thuật gây nghiện.", SUN500),
            ("Khoa học & trung thực", "Thiết kế có căn cứ; tuyên bố có chừng mực.", SKY),
            ("An toàn trước hết", "Riêng tư và sức khỏe của trẻ không đánh đổi.", CORAL),
            ("Hòa nhập cho tất cả", "Mọi lứa tuổi, mọi khả năng đều được chào đón.", BERRY)]
    t = 110
    for i, (h, b, col) in enumerate(vals):
        xx = 500 if i < 3 else 500; tt = t + (i if i < 3 else i) * 76
        p.circle(520, tt + 14, 14, fill=col); p.txt(str(i + 1), 520, tt + 9, "BalooB", 11, white, "middle")
        p.txt(h, 546, tt, "BalooB", 14, INK); p.para(b, 546, tt + 22, 340, size=9.8, leading=14)
    p.newpage()

def p05_audience(c):
    p = page(c, 5); p.kicker("01 · MỌI LỨA TUỔI — KIẾN TRÚC CẤP ĐỘ")
    y = p.title(["MỘT KHU VƯỜN,", "MỌI MÙA HỌC"], size=27)
    p.para("Hệ cấp độ của GON mượn vòng đời của cây. Cùng một thương hiệu, sắc thái \"vui\" giảm dần và \"thành tựu\" tăng dần theo tuổi — để người lớn không bao giờ thấy mình đang dùng đồ trẻ con.", 54, y, 350, size=10.5, leading=15.5)
    p.para("Trẻ có nhu cầu hỗ trợ đặc biệt không bị tách thành một \"nhánh riêng\" — các tùy chọn hỗ trợ (chữ lớn, thêm thời gian, giảm chuyển động...) có mặt ở mọi cấp.", 54, y + 92, 350, size=10.5, leading=15.5)
    tiers = [("HẠT", "Seed · 3–5", "Khám phá giác quan, số đầu tiên", SUN),
             ("MẦM", "Sprout · 6–8", "Đọc, đếm, ghi nhớ, tập trung", G500),
             ("CHỒI", "Sapling · 9–12", "Tư duy, lập kế hoạch, sáng tạo", SKY),
             ("CÂY", "Tree · 13–17", "Kỹ năng học sâu, thử thách nhóm", BERRY),
             ("VƯỜN", "Grove · 18+", "Luyện trí não, học cùng con, ông bà", G800)]
    t = 104
    for name, sub, desc, col in tiers:
        p.rect(460, t, 436, 64, fill=white, stroke=LINE, r=14)
        p.rect(460, t, 14, 64, fill=col, r=7)
        p.txt(name, 492, t + 10, "BalooXB", 17, INK); p.txt(sub, 492, t + 36, "BeVN-B", 9, G700)
        p.para(desc, 660, t + 14, 220, size=9.8, leading=14); t += 76
    p.pill("Màu nhấn theo cấp — xem tr. 16", 460, t + 2, fill=G100, color=G800)
    p.newpage()

def p06_personality(c):
    p = page(c, 6); p.kicker("01 · TÍNH CÁCH THƯƠNG HIỆU")
    y = p.title(["VUI NHƯ BẠN CHƠI,", "TIN NHƯ NGƯỜI THẦY"], size=26)
    p.para("GON đứng giữa hai cực quen thuộc của ngành: không \"học thuật khô khan\", cũng không \"giải trí ồn ào\". Thanh trượt dưới đây là kim chỉ nam khi viết, vẽ và làm game.", 54, y, 380, size=10.5, leading=15.5)
    sliders = [("Nghiêm túc", "Vui tươi", 0.68), ("Người lớn", "Trẻ thơ", 0.42),
               ("Kỹ thuật", "Ấm áp", 0.74), ("Thận trọng", "Táo bạo", 0.45)]
    t = y + 86
    for a, b, v in sliders:
        p.txt(a, 54, t, "BeVN-B", 9.5, BODY); p.txt(b, 430, t, "BeVN-B", 9.5, BODY, "end")
        p.rect(54, t + 20, 376, 10, fill=G100, r=5); p.circle(54 + 376 * v, t + 25, 11, fill=G700, stroke=white, sw=2.5); t += 52
    # audience dial table
    x, t = 790 - 310, 110
    p.txt("CHỈNH \"ĐỘ VUI\" THEO NGƯỜI XEM", x, t, "BeVN-XB", 11, G700); t += 28
    rows = [("Trẻ 3–8", "Linh vật + màu bậc 400–500, câu ngắn, khen nhiều"),
            ("Học sinh 9–17", "Ít linh vật, nhấn thử thách và thành tích"),
            ("Phụ huynh/GV", "Không linh vật, số liệu, trích nguồn rõ ràng"),
            ("Người lớn 18+", "Ngôn ngữ \"luyện trí não\", Bảng màu sâu (700–800)")]
    for h, b in rows:
        p.rect(x, t, 410, 66, fill=white, stroke=LINE, r=14)
        p.txt(h, x + 18, t + 9, "BalooB", 12.5, INK); p.para(b, x + 18, t + 31, 376, size=9.5, leading=13.5); t += 78
    p.newpage()

def p07_logo(c):
    p = page(c, 7); p.kicker("02 · LOGO — LOGO CHÍNH")
    y = p.title(["DẤU HIỆU", "\"MẦM CHƠI\""], size=28)
    p.para("Chữ G liền khối là vòng tăng trưởng khép kín của việc học. Thanh ngang chữ G trở thành mặt đất — từ đó mầm cây mọc lên. Lá phải màu nắng nghiêng như nút Play: học bắt đầu bằng một cú chạm chơi.", 54, y, 340, size=10.5, leading=15.5)
    yy = y + 104
    yy = p.bullet("Dễ nhớ", "Silhouette chữ G + mầm nhận ra ở 24px và ở dạng đơn sắc.", 54, yy, 340)
    yy = p.bullet("Khác biệt", "Không dùng rosette/huy chương kiểu POAP — tránh nhầm lẫn nhãn hiệu.", 54, yy, 340, SUN500)
    p.pill("Tải: 01-Logo/svg + png", 54, yy + 4, fill=G100, color=G800)
    p.rect(470, 120, 420, 300, fill=white, stroke=LINE, r=22)
    p.img(PNG / "gon-logo-horizontal@512.png", 510, 190, w=340)
    p.txt("Lockup ngang — mặc định", 680, 384, "BeVN-B", 9, BODY, "middle")
    p.txt("Wordmark đã convert outline (Baloo 2) — không cần cài font khi in ấn.", 470, 436, "BeVN", 8.5, BODY)
    p.newpage()

def p08_construction(c):
    p = page(c, 8); p.kicker("02 · CẤU TẠO & LƯỚI")
    y = p.title(["CẤU TẠO", "TRÊN LƯỚI 240"])
    specs = [("Vòng G", "Tâm (120,122), bán kính 82, nét 30, mở ở −52° và kết thúc hướng đông (0°) để gặp thanh ngang."),
             ("Thanh G = đất", "Ngang qua tâm, nét 30 — mảnh đất mà mầm mọc lên."),
             ("Mầm", "Thân tại x=110; lá trái xanh 400 nghiêng −46°, lá phải nắng nghiêng +48° (pointeur Play)."),
             ("Hạt nắng", "Chấm tròn r=9 tại chân thân, trên thanh G: hạt giống/hạt nắng.")]
    yy = y
    for h, b in specs: yy = p.bullet(h, b, 54, yy, 350)
    p.para("Toàn bộ tọa độ nằm trong tools/generate_logos.py — sửa thương hiệu bằng cách sửa tham số, không vẽ tay lại.", 54, yy + 6, 340, size=9.5, leading=14)
    # construction visual
    gx, gt, gs = 520, 120, 300
    p.rect(gx, gt, gs, gs, fill=white, stroke=LINE, r=16)
    for i in range(7):
        p.line(gx + 18 + i * 44, gt + 12, gx + 18 + i * 44, gt + gs - 12, G100, 0.8)
        p.line(gx + 12, gt + 18 + i * 44, gx + gs - 12, gt + 18 + i * 44, G100, 0.8)
    p.circle(gx + 150, gt + 150, 112, stroke=SUN500, sw=1.4)
    p.circle(gx + 150, gt + 150, 76, stroke=SKY, sw=1.2)
    p.img(PNG / "gon-icon@512.png", gx + 38, gt + 38, w=224)
    p.txt("R82 · nét 30 · đơn vị lưới 240", gx + 150, gt + gs + 14, "BeVN-B", 9, BODY, "middle")
    p.newpage()

def swatch(p, x, t, w, h, hexcol, name, meta, txtcol=None):
    col = HexColor(hexcol); p.rect(x, t, w, h, fill=col, stroke=LINE, r=12)
    tc = txtcol or (INK if hexcol in ("#FFC93C", "#EAFBF2", "#FFF9EE", "#FFFFFF", "#FFDD7A") else white)
    p.txt(name, x + 12, t + 10, "BeVN-XB", 10, tc)
    p.txt(hexcol, x + 12, t + h - 20, "BeVN-B", 9, tc)
    p.txt(meta, x + 2, t + h + 6, "BeVN", 7.8, BODY)

def p09_clearspace(c):
    p = page(c, 9); p.kicker("02 · KHOẢNG THỞ (CLEAR SPACE)")
    y = p.title(["CHO MẦM", "KHÔNG GIAN LỚN"])
    p.para("Giữ vùng trống quanh logo để dấu hiệu luôn đọc rõ và không bị yếu tố khác \"chen\" vào. Đơn vị x bằng chiều cao thanh ngang chữ G (12,5% bề rộng biểu tượng).", 54, y, 340, size=10.5, leading=15.5)
    yy = y + 96
    yy = p.bullet("Tối thiểu 1x mọi phía", "Cho cả lockup ngang, xếp chồng và icon đứng một mình.", 54, yy, 340)
    yy = p.bullet("Ưu tiên 2x trên bìa/hero", "Khi logo đóng vai chính trên trang bìa hoặc màn hình mở đầu game.", 54, yy, 340, SUN500)
    p.rect(460, 130, 436, 280, fill=white, stroke=LINE, r=18)
    # clearspace frame: logo bbox approx x534..822 (w288) t205..296
    p.c.saveState(); p.c.setStrokeColor(SKY); p.c.setLineWidth(1.3); p.c.setDash(5, 5)
    p.c.rect(508, Y(322), 340, 143, stroke=1, fill=0); p.c.restoreState()
    p.img(PNG / "gon-logo-horizontal@512.png", 534, 205, w=288)
    for (tx, tt, lb) in [(678, 158, "x"), (678, 330, "x"), (486, 238, "x"), (856, 238, "x")]:
        p.circle(tx + 6, tt + 7, 11, fill=SUN); p.txt(lb, tx + 6, tt + 2, "BalooB", 10, INK, "middle")
    p.txt("Vùng x: không chữ, không hình, không mép trang", 678, 376, "BeVN-B", 9, BODY, "middle")
    p.newpage()

def p10_minimum(c):
    p = page(c, 10); p.kicker("02 · KÍCH THƯỚC TỐI THIỂU")
    y = p.title(["NHỎ MÀ", "VẪN ĐỌC RÕ"])
    p.para("Dưới ngưỡng tối thiểu, mầm hai lá sẽ bết lại. Khi đó hãy chuyển sang bản rút gọn một lá — giống nguyên tắc POAP dành một bản logo riêng cho cỡ nhỏ.", 54, y, 340, size=10.5, leading=15.5)
    yy = y + 92
    for h, b in [("Icon", "kỹ thuật số ≥ 24 px · in ấn ≥ 8 mm"), ("Lockup có chữ", "kỹ thuật số ≥ 96 px · in ấn ≥ 25 mm"), ("Favicon 16 px", "chỉ dùng gon-icon-small / favicon.ico đã xuất sẵn")]:
        yy = p.bullet(h, b, 54, yy, 340)
    p.rect(460, 120, 436, 150, fill=white, stroke=LINE, r=16)
    p.txt("GIẢM DẦN (hiển thị tương đối)", 478, 134, "BeVN-XB", 9, G700)
    x = 486
    for wpt, lb in [(86, "96px"), (58, "64px"), (34, "32px"), (26, "24px")]:
        p.img(PNG / "gon-icon@512.png", x, 168 + (86 - wpt) / 2, w=wpt); p.txt(lb, x + wpt / 2, 246, "BeVN-B", 8.5, BODY, "middle"); x += wpt + 34
    p.rect(460, 292, 210, 132, fill=G50, stroke=LINE, r=16)
    p.img(PNG / "gon-icon@512.png", 522, 310, w=84); p.txt("Bản đủ: ≥ 32 px", 565, 398, "BeVN-B", 9, INK, "middle")
    p.rect(686, 292, 210, 132, fill=CREAM, stroke=LINE, r=16)
    p.img(PNG / "gon-icon-small@512.png", 748, 310, w=84); p.txt("Bản rút gọn: < 32 px", 791, 398, "BeVN-B", 9, INK, "middle")
    p.newpage()

def p11_variants(c):
    p = page(c, 11); p.kicker("02 · BIẾN THỂ & ĐƠN SẮC")
    y = p.title(["MỘT HỆ,", "NHIỀU HOÀN CẢNH"], size=27)
    p.para("Chỉ dùng các file chính thức trong 01-Logo/svg. Đơn sắc dành cho in 1 màu, khắc, thêu, watermark — không phải lối tắt để đổi màu tùy ý.", 54, y, 320, size=10.5, leading=15.5)
    p.para("Trên nền ảnh: ưu tiên đặt logo trong \"tấm thẻ\" Paper/Trắng bo góc 20px thay vì đè trực tiếp lên vùng rối.", 54, y + 86, 320, size=10.5, leading=15.5)
    cards = [(PNG / "gon-logo-horizontal@512.png", "Ngang — mặc định", 250),
             (PNG / "gon-logo-stacked@512.png", "Xếp chồng", 120),
             (PNG / "gon-app-icon-green@512.png", "App icon", 118),
             (PNG / "gon-logo-horizontal-reverse@512.png", "Âm bản trên Ink", 250),
             (PNG / "gon-logo-horizontal-mono-black@512.png", "Đơn sắc đen", 250),
             (PNG / "gon-icon-mono-green@512.png", "Đơn sắc xanh 700", 118)]
    x0, t0 = 420, 104
    for i, (im, lb, iw) in enumerate(cards):
        x = x0 + (i % 2) * 242; t = t0 + (i // 2) * 108
        p.rect(x, t, 228, 96, fill=white, stroke=LINE, r=14)
        if iw < 200:  # square assets (stacked/app/icon): fit by height inside the card
            _iw, _ih = ImageReader(str(im)).getSize(); _w = 60 * _iw / _ih
            w, h = p.img(im, x + 114 - _w / 2, t + 6, h=60)
        else:
            w, h = p.img(im, x + 114 - min(iw, 184) / 2, t + 8, w=min(iw, 184))
        p.txt(lb, x + 114, t + 74, "BeVN-B", 8.5, BODY, "middle")
    p.newpage()

def p12_donts(c):
    p = page(c, 12); p.kicker("02 · KHÔNG ĐƯỢC LÀM (DON'TS)")
    y = p.title(["ĐỪNG LÀM", "TỔN THƯƠNG MẦM"])
    p.para("Danh sách dưới đây không đầy đủ. Nguyên tắc chung: đừng chỉnh sửa logo — hãy dùng đúng file GON cung cấp (đúng tinh thần trang Don'ts của POAP).", 54, y, 330, size=10.5, leading=15.5)
    items = ["Kéo giãn / bóp méo", "Xoay nghiêng tùy ý", "Đổi màu ngoài palette", "Thêm bóng, viền, gradient",
             "Đặt trên nền rối", "Cắt xén logo", "Gõ lại chữ font khác", "Chồng chữ/hình lên logo"]
    icon = str(PNG / "gon-icon@512.png"); im = ImageReader(icon)
    x0, t0 = 430, 100
    for i, lb in enumerate(items):
        x = x0 + (i % 4) * 118; t = t0 + (i // 4) * 168
        p.rect(x, t, 106, 118, fill=white, stroke=LINE, r=12)
        cc = p.c; cc.saveState()
        clip = cc.beginPath(); clip.roundRect(x, Y(t + 118), 106, 118, 12); cc.clipPath(clip, stroke=0, fill=0)
        if i == 0: cc.drawImage(im, x + 8, Y(t + 92), 90, 78, mask="auto")
        elif i == 1:
            cc.translate(x + 53, Y(t + 52)); cc.rotate(-24); cc.drawImage(im, -34, -34, 68, 68, mask="auto")
        elif i == 2:
            cc.setFillColor(BERRY); cc.rect(x, Y(t + 118), 106, 118, stroke=0, fill=1)
            cc.drawImage(ImageReader(str(PNG / "gon-icon-mono-white@512.png")), x + 19, Y(t + 86), 68, 68, mask="auto")
        elif i == 3:
            cc.drawImage(ImageReader(str(PNG / "gon-icon-mono-black@512.png")), x + 24, Y(t + 92), 68, 68, mask="auto")
            cc.drawImage(im, x + 17, Y(t + 85), 68, 68, mask="auto")
        elif i == 4:
            cc.drawImage(ImageReader(str(ILL / "gon-classroom-play.jpg")), x, Y(t + 118), 150, 118)
            cc.drawImage(im, x + 19, Y(t + 86), 68, 68, mask="auto")
        elif i == 5: cc.drawImage(im, x + 38, Y(t + 110), 110, 110, mask="auto")
        elif i == 6:
            cc.setFont("DejaVu", 17); cc.setFillColor(INK); cc.drawString(x + 12, Y(t + 62), "Gon"); cc.setFont("DejaVu", 7); cc.drawString(x + 12, Y(t + 76), "GAME OF NURTURE")
        else:
            cc.drawImage(im, x + 19, Y(t + 86), 68, 68, mask="auto")
            cc.setFillColor(RED); cc.rect(x + 10, Y(t + 70), 86, 16, stroke=0, fill=1)
        cc.restoreState()
        p.line(x + 88, t + 10, x + 100, t + 22, RED, 2.4); p.line(x + 100, t + 10, x + 88, t + 22, RED, 2.4)
        p.para(lb, x + 4, t + 124, 100, "BeVN-B", 8.3, INK, 11.5, "middle")
    p.newpage()

def p13_typography(c):
    p = page(c, 13); p.kicker("03 · TYPOGRAPHY — FONT CHỮ")
    y = p.title(["BALOO 2 +", "BE VIETNAM PRO"], size=27)
    p.para("POAP chọn Rubik vì vui mà dễ đọc. GON cần thêm một điều sống còn: dấu tiếng Việt hoàn hảo. Vì vậy GON dùng Baloo 2 cho tiêu đề và Be Vietnam Pro cho nội dung — cả hai đều mã nguồn mở (OFL) và hỗ trợ đầy đủ tiếng Việt.", 54, y, 340, size=10.5, leading=15.5)
    p.rect(54, y + 112, 340, 104, fill=white, stroke=LINE, r=16)
    p.txt("Ă Â Đ Ê Ô Ơ Ư", 72, y + 126, "BalooXB", 21, INK)
    p.txt("ă â đ ê ô ơ ư á à ả ã ạ", 72, y + 156, "BeVN-SB", 15, G700)
    p.txt("Chuỗi kiểm tra dấu bắt buộc", 72, y + 188, "BeVN-B", 8.5, BODY)
    x = 460
    p.txt("BALOO 2", x, 104, "BalooXB", 40, INK)
    p.txt("Tiêu đề · logo · số điểm trong game", x + 2, 150, "BeVN-B", 9.5, G700)
    for i, (f, lb) in enumerate([("BalooB", "Baloo 2 Bold — Nuôi dưỡng trí tuệ"), ("BalooXB", "Baloo 2 ExtraBold — Chơi mà học!")]):
        p.txt(lb, x, 178 + i * 30, f, 14, INK)
    p.line(x, 248, x + 430, 248)
    p.txt("BE VIETNAM PRO", x, 262, "BeVN-XB", 24, INK)
    p.txt("Nội dung · giao diện · tài liệu phụ huynh/giáo viên", x + 2, 294, "BeVN-B", 9.5, G700)
    for i, f in enumerate(["BeVN", "BeVN-M", "BeVN-SB", "BeVN-B", "BeVN-XB"]):
        p.txt(f"{f.replace('BeVN','Be Vietnam Pro')} — Học vui mỗi ngày 0123456789", x, 320 + i * 24, f, 11, BODY if i < 2 else INK)
    p.newpage()

def p14_typeuse(c):
    p = page(c, 14); p.kicker("03 · PHÂN CẤP CHỮ & CÁCH DÙNG")
    y = p.title(["CHỮ RÕ,", "TRẺ MỚI ĐỌC VUI"])
    rules = [("Cỡ tối thiểu", "Trong game cho trẻ dưới 9 tuổi: chữ ≥16px; nút bấm ≥18px SemiBold."),
             ("Độ dài dòng", "45–75 ký tự/dòng cho người lớn; 25–40 cho trẻ mới biết đọc."),
             ("Giãn dòng", "Line-height 1,4–1,6. Không viết HOA cả đoạn dài — khó đọc với trẻ và người khó đọc (dyslexia)."),
             ("Số & điểm", "Số trong game dùng Baloo 2, căn phải trong bảng báo cáo cho phụ huynh.")]
    yy = y
    for h, b in rules: yy = p.bullet(h, b, 54, yy, 350)
    x, t = 470, 110
    scale = [("Display / Baloo XB 40", "Chơi. Học.", "BalooXB", 30), ("H1 / Baloo B 28", "Mầm học mới", "BalooB", 22),
             ("H2 / BeVN B 20", "Kỹ năng tuần này", "BeVN-B", 17), ("Body / BeVN 16", "Con đã hoàn thành 3 thử thách ghi nhớ.", "BeVN", 12.5),
             ("Caption / BeVN 13", "Cập nhật 21/10/2026 · Cấp Mầm", "BeVN", 10)]
    for lb, s, f, sz in scale:
        p.rect(x, t, 420, 56, fill=white, stroke=LINE, r=12)
        p.txt(lb, x + 14, t + 7, "BeVN-B", 8, G700); p.txt(s, x + 14, t + 22, f, sz, INK); t += 66
    p.newpage()

def p15_color_primary(c):
    p = page(c, 15); p.kicker("04 · MÀU SẮC — MÀU CHỦ ĐẠO")
    y = p.title(["XANH MẦM &", "NẮNG SỚM"])
    p.para("Màu là một phần sống còn của thương hiệu: xanh mầm nói \"tăng trưởng\", vàng nắng nói \"niềm vui và phần thưởng\", mực rừng (Forest Ink) giữ sự đáng tin cho người lớn.", 54, y, 360, size=10.5, leading=15.5)
    p.txt("THANG XANH MẦM 50–800", 54, y + 88, "BeVN-XB", 10, G700)
    greens = ["#EAFBF2", "#D3F5E3", "#A7EAC9", "#6FD9A7", "#3AC982", "#18B26B", "#0E9455", "#0C7746", "#0B5C38"]
    for i, hx in enumerate(greens):
        p.rect(54 + i * 41, y + 110, 37, 46, fill=HexColor(hx), stroke=LINE, r=8)
        p.txt(str([50, 100, 200, 300, 400, 500, 600, 700, 800][i]), 54 + i * 41 + 18.5, y + 160, "BeVN-B", 8, BODY, "middle")
    p.para("Quy tắc 60–25–15: 60% nền Paper/Trắng, 25% Xanh mầm, 15% màu nhấn (Nắng/Bầu trời/Hoa).", 54, y + 186, 360, size=10, leading=15)
    swatch(p, 480, 106, 196, 118, "#18B26B", "Sprout · Green 500", "RGB 24 178 107 · CMYK 87 0 40 30", INK)
    swatch(p, 692, 106, 196, 118, "#0C7746", "Leaf · Green 700", "RGB 12 119 70 · CMYK 90 0 41 53")
    swatch(p, 480, 262, 196, 118, "#12261E", "Forest Ink", "RGB 18 38 30 · CMYK 53 0 21 85")
    swatch(p, 692, 262, 196, 118, "#FFC93C", "Sunbeam 400", "RGB 255 201 60 · CMYK 0 21 76 0")
    p.newpage()

def p16_color_secondary(c):
    p = page(c, 16); p.kicker("04 · MÀU PHỤ & MÀU THEO CẤP")
    y = p.title(["BẦU TRỜI, HOA", "& QUẢ MỌNG"])
    p.para("Màu phụ mở rộng cảm xúc mà không phá nhận diện: Bầu trời = khám phá/tò mò, Hoa = năng lượng chơi, Quả mọng = sáng tạo cho tuổi teen và người lớn. Mỗi cấp tuổi mượn một màu nhấn (xem tr. 05).", 54, y, 360, size=10.5, leading=15.5)
    tiers = [("Hạt 3–5", "#FFC93C"), ("Mầm 6–8", "#18B26B"), ("Chồi 9–12", "#1499D6"), ("Cây 13–17", "#7C6BE0"), ("Vườn 18+", "#0B5C38")]
    xx = 54
    for lb, hx in tiers:
        p.circle(xx + 20, y + 128, 20, fill=HexColor(hx), stroke=LINE)
        p.txt(lb, xx + 20, y + 152, "BeVN-B", 8.5, BODY, "middle"); xx += 76
    p.para("Màu trung tính ấm (Paper, Cream) thay cho xám lạnh giúp GON khác biệt với các app công nghệ thuần túy và gần với giấy/sách của tuổi thơ.", 54, y + 192, 360, size=10, leading=15)
    swatch(p, 480, 106, 196, 104, "#1499D6", "Curiosity Sky 500", "RGB 20 153 214 · CMYK 91 29 0 16")
    swatch(p, 692, 106, 196, 104, "#FF6B57", "Coral Bloom 500", "RGB 255 107 87 · CMYK 0 58 66 0")
    swatch(p, 480, 248, 196, 104, "#7C6BE0", "Berry 500", "RGB 124 107 224 · CMYK 45 52 0 12")
    swatch(p, 692, 248, 196, 104, "#FFF9EE", "Paper", "RGB 255 249 238 · CMYK 0 2 7 0")
    p.newpage()

def p17_color_a11y(c):
    p = page(c, 17); p.kicker("04 · TƯƠNG PHẢN & HÒA NHẬP MÀU")
    y = p.title(["ĐẸP PHẢI", "ĐỌC ĐƯỢC"])
    p.para("Mọi cặp chữ/nền dưới đây đã đo theo WCAG 2.2. Chữ thường cần ≥4,5:1; chữ lớn ≥3:1. Không bao giờ dùng màu làm tín hiệu duy nhất (đúng/sai phải kèm biểu tượng và chữ) — vì trẻ mù màu và trẻ mới học.", 54, y, 350, size=10.5, leading=15.5)
    yy = y + 110
    yy = p.bullet("Nút chính", "Trắng trên Green 700 (5,61:1). Green 500 chỉ dùng cho đồ họa hoặc chữ Ink (5,76:1).", 54, yy, 350)
    yy = p.bullet("Vàng nắng", "Luôn đi với chữ Ink (10,34:1) — cấm chữ trắng trên vàng.", 54, yy, 350, SUN500)
    pairs = [("#12261E", "#FFF9EE", "15,16:1", "Chữ chính/Paper"), ("#FFFFFF", "#0C7746", "5,61:1", "Nút chính"),
             ("#12261E", "#FFC93C", "10,34:1", "Thưởng/Nắng"), ("#0A5E8C", "#FFFFFF", "7,02:1", "Liên kết"),
             ("#0B5C38", "#FFFFFF", "8,07:1", "Tiêu đề xanh"), ("#44564F", "#FFFFFF", "7,81:1", "Chữ phụ")]
    x, t = 470, 104
    for fg, bg, ratio, lb in pairs:
        p.rect(x, t, 204, 74, fill=HexColor(bg), stroke=LINE, r=12)
        p.txt("Aa Học vui", x + 14, t + 12, "BalooB", 14, HexColor(fg))
        p.txt(f"{lb} · {ratio}", x + 14, t + 46, "BeVN-B", 8.3, HexColor(fg))
        x += 218
        if x > 700: x = 470; t += 88
    p.rect(470, t + 4, 422, 54, fill=white, stroke=RED, r=12, sw=1.4)
    p.txt("CẤM: Trắng / Green 500 = 2,76:1 · Trắng / Vàng · Trắng / Coral cho chữ nhỏ", 486, t + 20, "BeVN-B", 9, RED)
    p.newpage()

def p18_mascot(c):
    p = page(c, 18); p.kicker("05 · LINH VẬT & MINH HỌA")
    y = p.title(["XIN CHÀO,", "GON MẦM!"])
    p.para("Gon Mầm là hạt giống có hai lá — người bạn đồng hành của trẻ 3–8 tuổi trong game và ấn phẩm gia đình. Gon Mầm khen nỗ lực, không chê bai; luôn ở tư thế mời chơi, không cầm sản phẩm quảng cáo.", 54, y, 350, size=10.5, leading=15.5)
    yy = y + 100
    yy = p.bullet("Dùng", "Màn hình trẻ em, bìa sách bài tập, sticker, sự kiện gia đình.", 54, yy, 350)
    yy = p.bullet("Không dùng", "Báo cáo phụ huynh trang trọng, tài liệu người lớn 18+, văn bản pháp lý — tránh cảm giác \"trẻ con hóa\" người lớn.", 54, yy, 350, CORAL)
    p.para("Minh họa trong sách này là phác thảo định hướng có hỗ trợ AI; bản thương mại nên được họa sĩ vẽ lại để độc bản và rõ quyền sử dụng. Logo không phải sản phẩm AI.", 54, yy + 4, 340, size=9.3, leading=13.5)
    p.rect(480, 104, 200, 300, fill=white, stroke=LINE, r=18)
    p.img(PNG / "gon-mascot-gon-mam@512.png", 505, 130, w=150)
    p.txt("Gon Mầm — bản gốc vector", 580, 352, "BeVN-B", 9, BODY, "middle")
    p.rect(696, 104, 200, 300, fill=white, stroke=LINE, r=18)
    p.img(PNG / "gon-badge-achievement@512.png", 721, 130, w=150)
    p.txt("Huy hiệu Hạt Nắng", 796, 352, "BeVN-B", 9, BODY, "middle")
    p.newpage()

def p19_pattern(c):
    p = page(c, 19); p.kicker("05 · HỌA TIẾT, BIỂU TƯỢNG, HÌNH KHỐI")
    y = p.title(["NGÔN NGỮ", "HÌNH TRÒN & LÁ"])
    p.para("Hệ hình của GON chỉ gồm hình tròn (hạt/nắng), chiếc lá và sóng đất. Bo góc lớn (12–28px) ở mọi thẻ và nút — không góc nhọn, vì an toàn cảm xúc cho trẻ cũng bắt đầu từ hình khối.", 54, y, 350, size=10.5, leading=15.5)
    yy = y + 100
    for h, b in [("Icon", "Lưới 24px, nét 2px bo tròn, luôn đi kèm nhãn chữ cho trẻ và người mù màu."),
                 ("Họa tiết Hạt", "Chấm màu + lá thưa trên nền Paper cho bao bì, bìa sau, nền sự kiện. Không đặt chữ nhỏ lên họa tiết."),
                 ("Ảnh/UI", "Bo góc ảnh 20px; bóng đổ mềm duy nhất: 0 8px 24px Ink 10%.")]:
        yy = p.bullet(h, b, 54, yy, 350)
    tx, ty = 470, 110
    for r in range(2):
        for cc2 in range(2):
            p.img(TPL / "gon-pattern-seeds-tile-288.png", tx + cc2 * 190, ty + r * 190, w=190)
    p.rect(tx, ty, 380, 380, fill=None, stroke=LINE, r=16)
    p.txt("Họa tiết Hạt giống — file gon-pattern-seeds-tile-288", tx + 190, ty + 392, "BeVN-B", 9, BODY, "middle")
    p.newpage()

def p20_imagery(c):
    p = page(c, 20); p.kicker("05 · HÌNH ẢNH CON NGƯỜI")
    y = p.title(["NGƯỜI THẬT,", "NIỀM VUI THẬT"])
    rules = [("Đa dạng tự nhiên", "Nhiều độ tuổi, giới, màu da, khả năng (kính, xe lăn, máy trợ thính) xuất hiện như người chơi bình đẳng — không làm \"nhân vật thương hại\"."),
             ("An toàn trẻ em", "Ảnh trẻ thật phải có đồng ý của người giám hộ; không lộ tên trường/địa chỉ; ưu tiên minh họa khi không chắc về quyền hình ảnh."),
             ("Khoảnh khắc", "Bắt cảnh cùng chơi, cùng cười, tay chạm màn hình — tránh ảnh trẻ ngồi một mình dán mắt vào máy trong phòng tối."),
             ("Không", "Không ảnh stock \"thiên tài nhí\" tạo áp lực; không so sánh trẻ thắng/thua; không đồ ăn/thương hiệu khác chen vào khung hình trẻ.")]
    yy = y
    for h, b in rules: yy = p.bullet(h, b, 54, yy, 350)
    p.img(ILL / "gon-classroom-play.jpg", 460, 118, w=436)
    p.rect(460, 118, 436, 269, fill=None, stroke=LINE, r=16)
    p.txt("Định hướng: lớp học hòa nhập, nhiều khả năng cùng chơi", 678, 398, "BeVN-B", 9, BODY, "middle")
    p.newpage()

def p21_voice(c):
    p = page(c, 21); p.kicker("06 · GIỌNG NÓI & TÊN GỌI")
    y = p.title(["NÓI NHƯ", "NGƯỜI BẠN LỚN"])
    p.para("Tên viết \"GON\" (luôn hoa) và đọc như \"gôn\". Lần đầu xuất hiện trong một tài liệu luôn viết đủ: GON — Game Of Nurture. Người chơi được gọi là \"người gieo mầm\"; không gọi người lớn là \"bé\".", 54, y, 350, size=10.5, leading=15.5)
    p.txt("TAGLINE", 54, y + 104, "BeVN-XB", 10, G700)
    p.txt("Chơi. Học. Lớn khôn.", 54, y + 124, "BalooXB", 20, INK)
    p.txt("Play. Learn. Grow.", 54, y + 156, "BalooB", 15, G700)
    rows = [("NÊN NÓI", "\"Sai cũng là một bước học. Thử lại nhé?\"", G700, G50),
            ("NÊN NÓI", "\"Con đã nhớ được 5 hình liên tiếp — hơn tuần trước!\"", G700, G50),
            ("KHÔNG NÓI", "\"Sai rồi! Mất lượt!\" / \"Con bạn đang thua bạn bè\"", RED, HexColor("#FDECEC")),
            ("KHÔNG NÓI", "Nhãn kỳ thị: \"trẻ chậm\", \"trẻ bình thường\"", RED, HexColor("#FDECEC"))]
    x, t = 470, 104
    for h, b, col, bg in rows:
        p.rect(x, t, 420, 70, fill=bg, stroke=LINE, r=14)
        p.txt(h, x + 16, t + 9, "BeVN-XB", 9, col); p.para(b, x + 16, t + 28, 390, "BeVN-SB", 10.5, INK, 15); t += 82
    p.pill("Ngân hàng câu chữ: 06-Content/CONTENT-VI-EN.md", x, t + 2, fill=G100, color=G800)
    p.newpage()

def p22_content(c):
    p = page(c, 22); p.kicker("06 · TÍNH NĂNG KỂ THÀNH NỘI DUNG")
    y = p.title(["SÁU LỜI HỨA", "CỦA GON"], size=28)
    p.para("Mọi trang web, quảng cáo và màn hình giới thiệu của GON kể quanh sáu lời hứa này — phát triển từ các tính năng cốt lõi của dòng game nuôi dưỡng, viết lại cho vòng đời học tập đầy đủ của GON.", 54, y, 340, size=10.5, leading=15.5)
    promises = ["Thích ứng từng người học", "Rèn trí nhớ & kỹ năng điều hành", "Người lớn thấy tiến bộ thật",
                "Chỉ có game — an toàn tuyệt đối", "Vui bằng tò mò, không gây nghiện", "Dựa trên khoa học, nói thật về bằng chứng"]
    x, t = 450, 100
    for i, s in enumerate(promises):
        p.rect(x, t, 448, 42, fill=white, stroke=LINE, r=12)
        p.circle(x + 24, t + 21, 12, fill=[G500, SKY, SUN500, CORAL, BERRY, G700][i])
        p.txt(str(i + 1), x + 24, t + 16, "BalooB", 10, white, "middle"); p.txt(s, x + 50, t + 13, "BalooB", 12.5, INK); t += 52
    yy = y + 96
    p.txt("THANG TUYÊN BỐ (CLAIM LADDER)", 54, yy, "BeVN-XB", 10, G700); yy += 22
    for h, b, col in [("Được nói ngay", "Không quảng cáo · thích ứng · báo cáo phụ huynh", G500),
                      ("Cần dữ liệu của GON", "\"Cải thiện X%\" — phải có nghiên cứu lưu hồ sơ", SUN500),
                      ("Không bao giờ", "Chẩn đoán/chữa trị · thay thế giáo viên, trị liệu", RED)]:
        yy = p.bullet(h, b, 54, yy, 340, col)
    p.para("GON hỗ trợ học tập — không phải thiết bị y tế.", 54, yy + 2, 340, "BeVN-B", 10, RED, 14)
    p.newpage()

def p23_cobrand(c):
    p = page(c, 23); p.kicker("07 · ĐỒNG THƯƠNG HIỆU (CO-BRANDING)")
    y = p.title(["ĐI CÙNG ĐỐI TÁC,", "VẪN LÀ GON"])
    rules = ["Dùng logo mặc định trên nền trắng/Paper khi có thể.",
             "Hai logo ngang hàng về kích thước thị giác; GON đứng trái để được đọc trước.",
             "Chia cách bằng dấu × hoặc vạch đứng, khoảng cách ≥ bề rộng icon G.",
             "Không lồng logo đối tác vào trong chữ G hay lên lá mầm.",
             "Nhiều đối tác: hàng ngang một trục, đều khoảng thở 1x."]
    yy = y
    for r in rules: yy = p.bullet("", r, 54, yy - 6, 350)
    p.rect(460, 130, 436, 120, fill=white, stroke=LINE, r=16)
    p.img(PNG / "gon-icon@512.png", 496, 158, w=64)
    p.txt("x", 600, 176, "BalooXB", 22, BODY, "middle")
    p.circle(668, 190, 32, fill=SKY); p.txt("P", 668, 179, "BalooXB", 18, white, "middle")
    p.txt("Đối tác (minh họa)", 740, 178, "BeVN-B", 10, BODY)
    p.txt("GON x Đối tác", 678, 222, "BeVN-B", 9, BODY, "middle")
    p.rect(460, 276, 436, 120, fill=white, stroke=LINE, r=16)
    p.img(PNG / "gon-logo-horizontal@512.png", 480, 318, w=170)
    p.line(678, 300, 678, 372, LINE, 2)
    p.circle(724, 336, 24, fill=SUN); p.circle(790, 336, 24, fill=CORAL); p.circle(856, 336, 24, fill=BERRY)
    p.txt("Hàng nhiều logo: GON đọc trước", 678, 372, "BeVN-B", 9, BODY, "middle")
    p.newpage()

def p24_integrators(c):
    p = page(c, 24); p.kicker("07 · TÍCH HỢP & HUY HIỆU THÀNH TÍCH")
    y = p.title(["POWERED BY GON,", "HẠT NẮNG GON"])
    p.para("Như POAP cho đối tác một huy hiệu \"Powered by\", GON cấp dấu nhận diện cho trường học, ứng dụng và game tích hợp nội dung GON — đặt ở vị trí dễ thấy, tuân thủ mọi quy tắc logo ở mục 02.", 54, y, 350, size=10.5, leading=15.5)
    p.img(PNG / "gon-powered-by@512.png", 54, y + 104, w=230)
    p.img(PNG / "gon-made-with@512.png", 54, y + 252, w=230)
    x = 460
    p.txt("HỆ HUY HIỆU \"HẠT NẮNG\" — MINH CHỨNG HỌC TẬP", x, 108, "BeVN-XB", 10.5, G700)
    p.img(PNG / "gon-badge-achievement@512.png", x + 10, 132, w=120)
    lv = [("Đồng mầm", "Hoàn thành kỹ năng lần đầu", HexColor("#C98A4B")), ("Bạc chồi", "Luyện đều 4 tuần", HexColor("#9AA5B1")),
          ("Vàng nắng", "Thành thạo một cụm kỹ năng", SUN500), ("Vườn xanh", "Hoàn thành lộ trình cấp", G700)]
    t = 132
    for h, b, col in lv:
        p.circle(x + 166, t + 14, 11, fill=col); p.txt(h, x + 190, t, "BalooB", 12, INK); p.txt(b, x + 190, t + 19, "BeVN", 9.3, BODY); t += 42
    p.para("Huy hiệu ghi nhận nỗ lực và tiến bộ so với chính mình — không xếp hạng trẻ với nhau, không đổi thành tiền, không \"hộp quà may rủi\". HUY HIỆU có thể in lên giấy khen (mẫu trong 04-Templates).", x, 318, 420, size=10, leading=15)
    p.newpage()

def p25_applications(c):
    p = page(c, 25); p.kicker("08 · ỨNG DỤNG TRUYỀN THÔNG & IN ẤN")
    y = p.title(["GON NGOÀI", "ĐỜI THẬT"])
    p.para("Bốn mẫu khóa cứng (locked templates) trong 04-Templates đủ cho 90% nhu cầu: bìa mạng xã hội, bài vuông, trang bìa thuyết trình và giấy khen. Chỉ thay chữ trong vùng cho phép — không dời logo, không đổi màu nền.", 54, y, 330, size=10.5, leading=15.5)
    yy = y + 110
    for h, b in [("Avatar", "gon-icon trên nền Paper, không kèm chữ."), ("Ảnh bìa sự kiện", "Tagline + Gon Mầm (chỉ sự kiện gia đình/trẻ em)."), ("Giấy khen", "Huy hiệu Hạt Nắng + kỹ năng cụ thể, tránh khen chung chung \"giỏi\".")]:
        yy = p.bullet(h, b, 54, yy, 330)
    p.img(TPL / "gon-social-cover-1640x924.png", 438, 92, w=452)
    p.img(TPL / "gon-certificate-a4-landscape.png", 438, 356, w=200)
    p.img(TPL / "gon-social-post-1080.png", 662, 356, w=132)
    p.newpage()

def p26_product(c):
    p = page(c, 26); p.kicker("08 · TRONG GAME (GDEVELOP)")
    y = p.title(["GIAO DIỆN", "CHƠI–HỌC"])
    rules = [("Nút chính", "Xanh 700, chữ trắng, cao ≥56px cho trẻ; vùng chạm ≥48px."),
             ("Một màn hình, một việc", "Trẻ không phải chọn giữa 5 nút cùng lúc."),
             ("Phản hồi tử tế", "Sai → gợi ý và thử lại; đúng → Hạt Nắng bay nhẹ, không pháo giấy chớp sáng."),
             ("Nghỉ cũng là học", "Hết phiên 10–15 phút (theo tuổi) gợi ý nghỉ — không \"chuỗi ngày\" gây sợ mất.")]
    yy = y
    for h, b in rules: yy = p.bullet(h, b, 54, yy, 340)
    # phone game mock
    x, t, w, h = 520, 92, 300, 400
    p.rect(x, t, w, h, fill=INK, r=30); p.rect(x + 10, t + 10, w - 20, h - 20, fill=PAPER, r=24)
    p.img(PNG / "gon-icon@512.png", x + 24, t + 24, w=40)
    p.txt("Cấp Mầm · Trí nhớ", x + 74, t + 30, "BalooB", 13, INK)
    p.rect(x + 24, t + 84, w - 48, 96, fill=white, stroke=LINE, r=16)
    p.txt("Nhớ thứ tự các lá!", x + w / 2, t + 98, "BalooB", 14, INK, "middle")
    for i, col in enumerate([G500, SUN, SKY, CORAL]):
        p.circle(x + 66 + i * 56, t + 148, 17, fill=col)
    p.rect(x + 24, t + 202, w - 48, 52, fill=G700, r=16); p.txt("Chơi tiếp", x + w / 2, t + 218, "BalooB", 14, white, "middle")
    p.rect(x + 24, t + 266, w - 48, 52, fill=SUN, r=16); p.txt("Nghỉ một lát", x + w / 2, t + 282, "BalooB", 14, INK, "middle")
    p.img(PNG / "gon-mascot-gon-mam@512.png", x + w / 2 - 34, t + 328, w=68)
    p.newpage()

def p27_safety(c):
    p = page(c, 27); p.kicker("08 · TIẾP CẬN & AN TOÀN TRẺ EM")
    y = p.title(["AN TOÀN LÀ", "TÍNH NĂNG SỐ 1"])
    p.para("Thương hiệu giáo dục cho trẻ chỉ đáng tin khi an toàn được thiết kế từ đầu — không phải khẩu hiệu dán sau cùng. Trang này là cam kết thiết kế, không thay thế tư vấn pháp lý.", 54, y, 350, size=10.5, leading=15.5)
    items = [("Tiếp cận (WCAG 2.2 AA)", "Tương phản tr. 17 · điều hướng bàn phím · nhãn cho trình đọc màn hình · tôn trọng giảm chuyển động · không chớp sáng >3 lần/giây."),
             ("Riêng tư trẻ em", "Thu thập tối thiểu · cổng phụ huynh cho liên kết ngoài · rà soát COPPA/GDPR-K và Nghị định 13/2023 trước khi phát hành."),
             ("Không mô hình đen", "Không quảng cáo hướng tới trẻ · không loot-box · không đếm ngược ép mua · không thông báo \"bạn bè đang vượt bạn\"."),
             ("Thời lượng lành mạnh", "Phiên ngắn theo tuổi, nhắc nghỉ, báo cáo thời gian cho phụ huynh — thiết kế cùng chuyên gia giáo dục.")]
    yy = y + 100
    for h, b in items: yy = p.bullet(h, b, 54, yy, 420)
    p.rect(540, 120, 350, 300, fill=INK, r=18)
    p.txt("CAM KẾT GON", 566, 142, "BeVN-XB", 11, SUN)
    for i, s in enumerate(["Không quảng cáo", "Không chat người lạ", "Không mua hàng ẩn", "Không gây nghiện", "Phụ huynh luôn nhìn thấy"]):
        p.circle(578, 190 + i * 44, 9, fill=G500)
        p.txt("✓".encode("utf-8").decode("utf-8"), 578, 183 + i * 44, "DejaVu", 10, white, "middle")
        p.txt(s, 598, 182 + i * 44, "BeVN-SB", 12, white)
    p.newpage()

def p28_motion(c):
    p = page(c, 28); p.kicker("08 · CHUYỂN ĐỘNG, ÂM THANH, SỰ KIỆN")
    y = p.title(["CHUYỂN ĐỘNG", "NHƯ CÂY LỚN"])
    rows = [("Chuyển động", "Mềm, nảy nhẹ (spring) 200–350ms; lá mầm \"gật đầu\" khi đúng. Mọi chuyển động lớn đều tắt khi người dùng bật giảm chuyển động."),
            ("Âm thanh", "Nhạc nền và hiệu ứng tắt độc lập; tiếng khen ngắn, không còi/kèn giật mình; không âm thanh dưới dạng \"máy đánh bạc\"."),
            ("Sự kiện & gian hàng", "Backdrop Paper + họa tiết Hạt thưa; Gon Mầm kích thước người thật chỉ ở khu gia đình; quầy trải nghiệm có ghế và tai nghe cho trẻ nhạy cảm âm thanh."),
            ("Bao bì & quà tặng", "Giấy tái chế in 2 màu (Xanh 700 + Nắng) quanh logo đơn sắc; sticker Hạt Nắng thay cho kẹo/đồ ngọt làm quà.")]
    yy = y
    for h, b in rows: yy = p.bullet(h, b, 54, yy, 430)
    x, t = 540, 120
    p.rect(x, t, 350, 132, fill=white, stroke=LINE, r=16)
    for i, lb in enumerate(["Hạt", "Nảy mầm", "Vươn lá", "Nở hoa"]):
        xx = x + 44 + i * 82
        p.circle(xx, t + 78, 9 + i * 4, fill=[SUN500, G500, G700, CORAL][i])
        p.txt(lb, xx, t + 104, "BeVN-B", 8.5, BODY, "middle")
        if i < 3: p.txt(">", xx + 40, t + 68, "BeVN-B", 13, BODY, "middle")
    p.txt("Vòng chuyển động thương hiệu", x + 175, t + 16, "BeVN-XB", 9.5, G700, "middle")
    p.img(TPL / "gon-slide-title-1920x1080.png", x, 272, w=350)
    p.txt("Mẫu trang bìa thuyết trình (04-Templates)", x + 175, 472, "BeVN-B", 9, BODY, "middle")
    p.newpage()

def p29_governance(c):
    p = page(c, 29); p.kicker("08 · QUẢN TRỊ & PHÁP LÝ THƯƠNG HIỆU")
    y = p.title(["GIỮ VƯỜN", "LUÔN GỌN GÀNG"])
    left = [("Nguồn duy nhất", "Mọi file lấy từ branding/GON-GameOfNurture trong repo; thay đổi qua pull request kèm ảnh so sánh trước/sau."),
            ("Đặt tên file", "gon-{loại}-{biến thể}@{kích thước}.png · SVG là bản gốc, PNG chỉ là bản xuất."),
            ("Phê duyệt", "Logo trên sản phẩm đối tác, tuyên bố hiệu quả, ảnh trẻ thật: cần duyệt thương hiệu + pháp lý trước phát hành."),
            ("Phiên bản", "Brandbook v1.0 · 21/10/2026. Ghi thay đổi vào README khi phát hành v1.1+.")]
    yy = y
    for h, b in left: yy = p.bullet(h, b, 54, yy, 400)
    x = 520
    p.rect(x, 110, 376, 310, fill=HexColor("#FDECEC"), stroke=RED, r=16, sw=1.2)
    p.txt("LƯU Ý TRƯỚC KHI RA MẮT", x + 20, 128, "BeVN-XB", 11, RED)
    notes = ["Tra cứu & đăng ký nhãn hiệu \"GON / Game Of Nurture\" — tên gần với \"Nurture Games\" cùng ngành, có rủi ro nhầm lẫn.",
             "Không sử dụng logo rosette, hình ảnh hay câu chữ của POAP và Nurture Games.",
             "Minh họa AI trong bản này cần vẽ lại/hoàn thiện và kiểm tra quyền trước thương mại hóa.",
             "Font Baloo 2 & Be Vietnam Pro theo OFL 1.1 — giữ ghi công giấy phép.",
             "Rà soát dữ liệu trẻ em và quảng cáo theo thị trường phát hành."]
    t = 154
    for n in notes:
        p.circle(x + 26, t + 7, 4.5, fill=RED); t = p.para(n, x + 40, t, 338, size=9.6, leading=13.5) + 9
    p.newpage()

def p30_back(c):
    p = page(c, 30, bg=INK)
    p.img(PNG / "gon-icon@512.png", W / 2 - 55, 96, w=110)
    p.txt("GON", W / 2, 216, "BalooXB", 44, white, "middle")
    p.txt("GAME OF NURTURE", W / 2, 264, "BeVN-XB", 13, G300, "middle")
    p.txt("Chơi. Học. Lớn khôn. — Play. Learn. Grow.", W / 2, 300, "BalooB", 16, SUN, "middle")
    p.para("GON BRANDBOOK 2026 — Phiên bản đầy đủ v1.0\nThiết kế tại Việt Nam, cho người học ở khắp nơi.\nLogo và hệ nhận diện: branding/GON-GameOfNurture (repo GDevelop, nhánh arena/735ff871-gdevelop)",
           W / 2 - 260, 350, 520, "BeVN", 10, G100, 15, "middle")
    p.txt("© 2026 GON — Game Of Nurture. Kiểm tra nhãn hiệu trước khi sử dụng thương mại.", W / 2, H - 56, "BeVN", 8.5, G300, "middle")
    p.footer()


PAGES = [p01_cover, p02_index, p03_what, p04_mission, p05_audience, p06_personality, p07_logo, p08_construction,
         p09_clearspace, p10_minimum, p11_variants, p12_donts, p13_typography, p14_typeuse,
         p15_color_primary, p16_color_secondary, p17_color_a11y,
         p18_mascot, p19_pattern, p20_imagery, p21_voice, p22_content, p23_cobrand, p24_integrators,
         p25_applications, p26_product, p27_safety, p28_motion, p29_governance, p30_back]

def main():
    from reportlab.pdfgen import canvas
    c = canvas.Canvas(str(OUT), pagesize=(W, H))
    c.setTitle("GON — Game Of Nurture · Brandbook 2026 v1.0")
    c.setAuthor("GON Branding (arena/735ff871-gdevelop)")
    c.setSubject("Logo va bo nhan dien thuong hieu GON — Game Of Nurture, game giao duc cho moi lua tuoi")
    for fn in PAGES: fn(c)
    c.save(); print(f"Wrote {OUT} ({len(PAGES)} pages)")

if __name__ == "__main__":
    main()
