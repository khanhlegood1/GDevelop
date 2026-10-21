#!/usr/bin/env python3
"""
GON Brandbook PDF builder v2.2 (ReportLab canvas, 16:9 landscape).
The v2 book documents the adult 18+ repositioning: Midnight/Hero palette,
Be Vietnam Pro display type, AI learning arena, Brew, Proof of Learning and lifelong numeric levels.
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
INK = HexColor("#07111F"); BODY = HexColor("#44586E"); PAPER = HexColor("#F5F8FC")
G500 = HexColor("#12B981"); G700 = HexColor("#047857"); G800 = HexColor("#063F2A")
G300 = HexColor("#6EE7B7"); G100 = HexColor("#D1FAE5"); G50 = HexColor("#ECFDF5")
SUN = HexColor("#FFB703"); SUN500 = HexColor("#F59E0B"); SKY = HexColor("#0EA5C6")
SKY700 = HexColor("#0369A1"); CORAL = HexColor("#F04452"); BERRY = HexColor("#7C6BE0")
LINE = HexColor("#D7E3F0"); CREAM = HexColor("#FFF3D6"); RED = HexColor("#BD2038")

# Display aliases now point to Be Vietnam Pro: Baloo 2 is retired from the 18+ brand.
for name, f in [("BalooXB", "BeVietnamPro-ExtraBold.ttf"), ("BalooB", "BeVietnamPro-Bold.ttf"),
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

TOTAL = 32
_PAGE_NO = 0
def page(c, n=None, bg=PAPER):
    # Footer numbers follow PAGES order, so inserted product pages stay correct.
    global _PAGE_NO; _PAGE_NO += 1
    c.setPageSize((W, H)); return P(c, _PAGE_NO, bg)

# =====================================================================
def p01_cover(c):
    p = page(c, 1)
    p.img(ILL / "gon-heroes-18plus.jpg", 330, 0, w=630)
    # soften left edge of illustration into paper
    for i in range(14):
        p.rect(330 + i * 4, 0, 4, H, fill=PAPER)
        p.c.setFillColor(PAPER)
    p.img(PNG / "gon-icon@512.png", 54, 118, w=96)
    y = p.title(["GON", "BRANDBOOK"], t=222, size=41)
    p.txt("GAME OF NURTURE", 56, y + 2, "BeVN-XB", 13, G700)
    p.para("Bộ nhận diện và sản phẩm học tập dạng game cho người trưởng thành 18+: AI Search, Brew Your Topic, Quest, Proof of Learning và Level số suốt đời không trần.", 56, y + 30, 250, size=11, leading=16)
    p.pill("Become the Hero Within.", 56, y + 86)
    p.txt("2026 — Phiên bản v2.2 · Ingest. Learn. Prove. Become.", 56, H - 62, "BeVN-SB", 9, BODY)
    p.newpage()

def p02_index(c):
    p = page(c, 2); p.kicker("MỤC LỤC · INDEX")
    y = p.title(["CHÀO MỪNG ĐẾN", "VỚI GON 18+"], size=26)
    p.para("Bản v2 bắt đầu từ một thay đổi dứt khoát: GON không còn là thương hiệu trẻ em. Đây là hệ cho những Hero trưởng thành muốn biến tò mò thành năng lực và bằng chứng.", 54, y, 330, size=11, leading=16)
    p.para("Sách giữ khung nhận diện khóa cứng của v1 nhưng bổ sung kiến trúc AI, Brew, Proof, an toàn dữ liệu và mô hình Lifelong Numeric Level từ White Paper 1.0. Nguồn cảm hứng ZOFO được ghi rõ; số liệu và tài sản của ZOFO không được dùng như của GON.", 54, y + 88, 330, size=10, leading=15)
    p.pill("Đọc kèm: README.md + gon-tokens.css", 54, y + 176, fill=G100, color=G800)
    rows = [("01", "Nền tảng thương hiệu", "GON là gì · sứ mệnh · Level số vô hạn · Forever Lv.35+", "03"),
            ("02", "Logo", "cấu tạo · khoảng thở · đơn sắc · đừng làm", "07"),
            ("03", "Typography", "Be Vietnam Pro cho toàn hệ 18+", "13"),
            ("04", "Màu sắc", "bảng màu · tương phản WCAG", "15"),
            ("05", "Hình ảnh Hero", "không mascot trẻ con · họa tiết · người lớn", "18"),
            ("06", "Giọng nói & nội dung", "tính năng · thang tuyên bố", "21"),
            ("07", "Đối tác & tích hợp", "co-brand · Powered by · huy hiệu", "23"),
            ("08", "Ứng dụng & AI", "Arena · Brew · Proof · GDevelop", "25")]
    t = 92
    for no, name, desc, pg in rows:
        p.circle(505, t + 12, 15, fill=G700); p.txt(no, 505, t + 7.5, "BalooB", 10, white, "middle")
        p.txt(name, 532, t, "BalooB", 14.5, INK); p.txt(desc, 532, t + 19, "BeVN", 9, BODY)
        p.txt(f"tr. {pg}", 890, t + 4, "BeVN-B", 9.5, G700, "end"); t += 52
    p.newpage()

def p03_what(c):
    p = page(c, 3); p.kicker("01 · NỀN TẢNG THƯƠNG HIỆU 18+")
    y = p.title(["GON LÀ GÌ?"])
    p.para("GON — Game Of Nurture là nền tảng AI học tập dạng game cho người trưởng thành 18+. Người dùng đưa vào text, file, ảnh, video hoặc link; hệ thống vừa tìm kiếm bằng vector 768 chiều vừa biến input đó thành một dự án học tập.", 54, y, 360, size=11, leading=16)
    p.para("Khác biệt của GON là không có ngõ cụt: nếu kho nội dung chưa có module đủ sát, Brew Your Topic dùng multi-agent để tạo quest, flashcards, quiz và Boss Proof được cá nhân hoá.", 54, y + 98, 360, size=11, leading=16)
    yy = y + 188
    yy = p.bullet("Nuôi dưỡng (Nurture)", "Không ép học thuộc; thiết kế nhịp, phản hồi và bằng chứng để năng lực lớn bền.", 54, yy, 360, G500)
    yy = p.bullet("Bằng hành động (Game)", "Lifetime XP chỉ có ý nghĩa khi gắn với quest thật và kết quả kiểm chứng được; mỗi 100 XP tăng một Numeric Level không trần.", 54, yy, 360, SUN500)
    x = 470
    feats = [("Mọi input là một quest", "Text/file/ảnh/video/link đều trở thành Source Artifact có provenance.", G500),
             ("AI Coach + Quest Path", "Hai lộ trình song song kiểu Arena: giải thích hoặc hành động.", SKY),
             ("Search 768D", "Hiểu ngữ nghĩa, từ khóa và độ đặc thù của chủ đề.", SUN500),
             ("Proof of Learning", "POAP, chứng chỉ và hành trình được xếp đúng cấp xác minh.", CORAL)]
    t = 104
    for h, b, col in feats:
        p.rect(x, t, 420, 82, fill=white, stroke=LINE, r=16)
        p.circle(x + 30, t + 30, 13, fill=col)
        p.txt(h, x + 56, t + 14, "BalooB", 14, INK); p.para(b, x + 56, t + 38, 330, size=9.8, leading=14); t += 96
    p.newpage()
def p04_mission(c):
    p = page(c, 4); p.kicker("01 · SỨ MỆNH — TẦM NHÌN — GIÁ TRỊ")
    y = p.title(["ZERO HÔM NAY,", "HERO FOREVER"], size=27)
    p.rect(54, y, 400, 92, fill=INK, r=16)
    p.txt("SỨ MỆNH", 74, y + 12, "BeVN-XB", 10, SUN)
    p.para("Giúp người trưởng thành biến bất cứ điều gì họ quan tâm thành hành trình học tập có quest, tiến bộ nhìn thấy được và bằng chứng đáng tin.", 74, y + 32, 362, "BeVN-SB", 11.5, white, 16)
    p.rect(54, y + 106, 400, 92, fill=G50, stroke=LINE, r=16)
    p.txt("TẦM NHÌN", 74, y + 118, "BeVN-XB", 10, G700)
    p.para("Một cộng đồng nơi mỗi người đều có thể đi từ Zero thành Hero, đồng thời tạo tác động nhân văn thật ngoài đời.", 74, y + 138, 362, "BeVN-SB", 11.5, INK, 16)
    p.pill("Lời hứa: Học thật — làm thật — proof thật", 54, y + 214)
    vals = [("Nuôi dưỡng", "Tôn trọng nhịp và mục tiêu tự phát triển của người lớn.", G500),
            ("Anh hùng đời thường", "Khuyến khích phục vụ cộng đồng, gồm hiến máu nhân văn.", CORAL),
            ("Khoa học & trung thực", "Nội dung có nguồn; tuyên bố đúng mức bằng chứng.", SKY),
            ("Bằng chứng trước hết", "XP không thay thế năng lực và kết quả kiểm chứng.", SUN500),
            ("Riêng tư & tự quyết", "Người học kiểm soát dữ liệu và điều được công khai.", BERRY)]
    t = 110
    for i, (h, b, col) in enumerate(vals):
        xx = 500 if i < 3 else 500; tt = t + (i if i < 3 else i) * 76
        p.circle(520, tt + 14, 14, fill=col); p.txt(str(i + 1), 520, tt + 9, "BalooB", 11, white, "middle")
        p.txt(h, 546, tt, "BalooB", 14, INK); p.para(b, 546, tt + 22, 340, size=9.8, leading=14)
    p.newpage()

def p05_audience(c):
    p = page(c, 5); p.kicker("01 · CHỈ 18+ — LIFELONG NUMERIC LEVEL")
    y = p.title(["LEVEL SỐ", "SUỐT ĐỜI"], size=27)
    p.para("Học tập không có cấp cuối. Numeric Level là trục chính ngay từ XP đầu tiên: Lv = floor(Lifetime XP / 100). Các tên Zero đến Forever là Era kể chuyện trên cùng trục số.", 54, y, 350, size=10.5, leading=15.5)
    p.para("Forever không phải đích đến: Era này mở ở Lv.35 (3.500 XP), rồi tiếp tục Lv.36, Lv.37, Lv.100... Mỗi thêm 100 Lifetime XP là một level mới, không reset theo mùa.", 54, y + 92, 350, size=10.5, leading=15.5)
    p.para("Prototype chưa phát hành token. Nếu có Learning Token, level chỉ đối chiếu Lifetime Earned từ học tập hợp lệ; mua/chuyển token không lên cấp, tiêu token không tụt cấp. XP không nói lên tình trạng y tế.", 54, y + 196, 350, size=10.5, leading=15.5)
    p.pill("White Paper 1.0 · gon-level-v1 · không có max level", 54, y + 292, fill=G100, color=G800)
    tiers = [("ZERO", "Lv.0 · 0+ XP", "Bắt đầu một câu hỏi", HexColor("#64748B")),
             ("AWAKEN", "Lv.1–2 · 100+ XP", "Có project và nguồn đầu tiên", SKY),
             ("EXPLORER", "Lv.3–6 · 300+ XP", "Hoàn thành quest khám phá", G500),
             ("GUARDIAN", "Lv.7–11 · 700+ XP", "Chứng minh có trách nhiệm", G700),
             ("HERO", "Lv.12–19 · 1.200+ XP", "Tạo tác động thật", CORAL),
             ("LEGEND", "Lv.20–34 · 2.000+ XP", "Mentor và đóng góp module", BERRY),
             ("FOREVER", "Lv.35+ · 3.500+ XP", "Era mở vô hạn: Lv.36, 37, 100...", SUN500)]
    t = 96
    for name, sub, desc, col in tiers:
        p.rect(460, t, 436, 48, fill=white, stroke=LINE, r=12)
        p.rect(460, t, 12, 48, fill=col, r=6)
        p.txt(name, 488, t + 7, "BalooXB", 14, INK); p.txt(sub, 488, t + 28, "BeVN-B", 8, G700)
        p.para(desc, 650, t + 10, 226, size=9.3, leading=13); t += 57
    p.newpage()
def p06_personality(c):
    p = page(c, 6); p.kicker("01 · TÍNH CÁCH THƯƠNG HIỆU")
    y = p.title(["MẠNH NHƯ HERO,", "RÕ NHƯ COACH"], size=26)
    p.para("GON đứng giữa AI tool lạnh lùng và game ồn ào: quyết đoán, nhân văn, có hệ thống. Thanh trượt là kim chỉ nam khi viết, vẽ, làm game và chấm proof.", 54, y, 380, size=10.5, leading=15.5)
    sliders = [("Khô khan", "Truyền lực", 0.76), ("Trẻ con", "Trưởng thành", 0.88),
               ("Kỹ thuật", "Nhân văn", 0.66), ("Hứa hẹn", "Bằng chứng", 0.92)]
    t = y + 86
    for a, b, v in sliders:
        p.txt(a, 54, t, "BeVN-B", 9.5, BODY); p.txt(b, 430, t, "BeVN-B", 9.5, BODY, "end")
        p.rect(54, t + 20, 376, 10, fill=G100, r=5); p.circle(54 + 376 * v, t + 25, 11, fill=G700, stroke=white, sw=2.5); t += 52
    # audience dial table
    x, t = 790 - 310, 110
    p.txt("ÂM HƯỞNG THEO HERO PERSONA", x, t, "BeVN-XB", 11, G700); t += 28
    rows = [("Người mới 18–24", "Ngắn, hành động nhanh, Daily Quest và roadmap kỹ năng"),
            ("Người đi làm", "Tôn trọng thời gian; tóm tắt, ứng dụng việc làm, proof nghề nghiệp"),
            ("Hero cộng đồng", "Nhân văn, an toàn, ghi tác động mà không công khai ép buộc"),
            ("Creator/Guild", "Công cụ tạo module, rubric, credit và kiểm chứng minh bạch")]
    for h, b in rows:
        p.rect(x, t, 410, 66, fill=white, stroke=LINE, r=14)
        p.txt(h, x + 18, t + 9, "BalooB", 12.5, INK); p.para(b, x + 18, t + 31, 376, size=9.5, leading=13.5); t += 78
    p.newpage()

def p07_logo(c):
    p = page(c, 7); p.kicker("02 · LOGO — LOGO CHÍNH")
    y = p.title(["DẤU HIỆU", "\"G ORBIT HERO\""], size=28)
    p.para("Chữ G Midnight là vòng quỹ đạo tăng trưởng. Thanh G là điểm tựa; mầm Emerald là phát triển, lá Crimson là ngọn lửa/Play của hành động, chấm Gold là proof và tia sao là khoảnh khắc trở thành Hero.", 54, y, 340, size=10.5, leading=15.5)
    yy = y + 104
    yy = p.bullet("Dễ nhớ", "Silhouette chữ G + mầm nhận ra ở 24px và ở dạng đơn sắc.", 54, yy, 340)
    yy = p.bullet("Khác biệt", "Không dùng rosette/huy chương kiểu POAP — tránh nhầm lẫn nhãn hiệu.", 54, yy, 340, SUN500)
    p.pill("Tải: 01-Logo/svg + png", 54, yy + 4, fill=G100, color=G800)
    p.rect(470, 120, 420, 300, fill=white, stroke=LINE, r=22)
    p.img(PNG / "gon-logo-horizontal@512.png", 510, 190, w=340)
    p.txt("Lockup ngang — mặc định", 680, 384, "BeVN-B", 9, BODY, "middle")
    p.txt("Wordmark đã convert outline từ Be Vietnam Pro ExtraBold — không cần cài font.", 470, 436, "BeVN", 8.5, BODY)
    p.newpage()

def p08_construction(c):
    p = page(c, 8); p.kicker("02 · CẤU TẠO & LƯỚI")
    y = p.title(["CẤU TẠO", "TRÊN LƯỚI 240"])
    specs = [("Vòng G", "Tâm (120,122), bán kính 82, nét 30, mở ở −52° và kết thúc hướng đông (0°) để gặp thanh ngang."),
             ("Thanh G = đất", "Ngang qua tâm, nét 30 — mảnh đất mà mầm mọc lên."),
             ("Mầm / ngọn lửa", "Lá trái Emerald nghiêng −46°; lá phải Crimson nghiêng +48°, vừa là lửa nhân văn vừa là pointeur Play."),
             ("Proof seed & spark", "Chấm Gold r=9 tại chân thân; tia bốn cánh ở cửa mở chữ G đánh dấu khoảnh khắc bứt phá.")]
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
    tc = txtcol or (INK if hexcol in ("#FFB703", "#ECFDF5", "#F5F8FC", "#FFFFFF", "#38D5F5", "#FFDD7A") else white)
    p.txt(name, x + 12, t + 10, "BeVN-XB", 10, tc)
    p.txt(hexcol, x + 12, t + h - 20, "BeVN-B", 9, tc)
    p.txt(meta, x + 2, t + h + 6, "BeVN", 7.8, BODY)

def p09_clearspace(c):
    p = page(c, 9); p.kicker("02 · KHOẢNG THỞ (CLEAR SPACE)")
    y = p.title(["CHO HERO", "KHÔNG GIAN LỚN"])
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
    y = p.title(["ĐỪNG LÀM", "MÉO THƯƠNG HIỆU"])
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
            cc.drawImage(ImageReader(str(ILL / "legacy-v1-children/gon-classroom-play.jpg")), x, Y(t + 118), 150, 118)
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
    p = page(c, 13); p.kicker("03 · TYPOGRAPHY — FONT CHỮ 18+")
    y = p.title(["BE VIETNAM PRO", "MỘT TIẾNG NÓI"], size=27)
    p.para("Baloo 2 của v1 quá trẻ con cho định vị mới. GON v2 dùng một họ Be Vietnam Pro: ExtraBold cho logo/headline, các trọng lượng còn lại cho UI và nội dung. Font theo SIL OFL 1.1 và hỗ trợ dấu tiếng Việt hoàn chỉnh.", 54, y, 340, size=10.5, leading=15.5)
    p.rect(54, y + 118, 340, 104, fill=white, stroke=LINE, r=16)
    p.txt("Ă Â Đ Ê Ô Ơ Ư", 72, y + 132, "BeVN-XB", 21, INK)
    p.txt("ă â đ ê ô ơ ư á à ả ã ạ", 72, y + 164, "BeVN-SB", 15, G700)
    p.txt("Chuỗi kiểm tra dấu bắt buộc", 72, y + 194, "BeVN-B", 8.5, BODY)
    x = 460
    p.txt("BE VIETNAM PRO", x, 104, "BeVN-XB", 30, INK)
    p.txt("Logo · display · UI · tài liệu · dữ liệu", x + 2, 142, "BeVN-B", 9.5, G700)
    for i, (f, lb) in enumerate([("BeVN-XB", "ExtraBold — Become the Hero Within"), ("BeVN-B", "Bold — Brew Your Topic"), ("BeVN-SB", "SemiBold — Quest hôm nay"), ("BeVN-M", "Medium — AI Coach"), ("BeVN", "Regular — Proof cần đúng mức xác minh")]):
        p.txt(lb, x, 176 + i * 34, f, 14, INK if i < 3 else BODY)
    p.line(x, 362, x + 430, 362)
    p.txt("MONOSPACE HỆ THỐNG", x, 378, "BeVN-XB", 13, INK)
    p.txt("sha256:9f2c... · vector[768] · proof_id", x, 406, "DejaVu", 10.5, G700)
    p.newpage()
def p14_typeuse(c):
    p = page(c, 14); p.kicker("03 · PHÂN CẤP CHỮ & CÁCH DÙNG")
    y = p.title(["CHỮ RÕ CHO", "NGƯỜI LỚN BẬN RỘN"], size=27)
    rules = [("Cỡ tối thiểu", "Body web/game 15–16px; thông tin quyết định không dưới 13px."),
             ("Độ dài dòng", "45–75 ký tự cho nội dung dài; thẻ quest ưu tiên câu ngắn có động từ."),
             ("Giãn dòng", "Line-height 1,5–1,7. Viết HOA chỉ cho nhãn ngắn, không cho đoạn dài."),
             ("Số & proof", "XP/số liệu dùng SemiBold/ExtraBold; hash/token ID dùng monospace và cho phép sao chép.")]
    yy = y
    for h, b in rules: yy = p.bullet(h, b, 54, yy, 350)
    x, t = 470, 110
    scale = [("Display / BeVN XB", "Become.", "BeVN-XB", 29), ("H1 / BeVN XB", "Brew Your Topic", "BeVN-XB", 21),
             ("H2 / BeVN B", "Quest tuần này", "BeVN-B", 17), ("Body / BeVN", "Hoàn thành Boss Proof để mở badge.", "BeVN", 12.5),
             ("Caption / BeVN", "21/10/2026 · Guardian · 768D", "BeVN", 10)]
    for lb, s, f, sz in scale:
        p.rect(x, t, 420, 56, fill=white, stroke=LINE, r=12)
        p.txt(lb, x + 14, t + 7, "BeVN-B", 8, G700); p.txt(s, x + 14, t + 22, f, sz, INK); t += 66
    p.newpage()
def p15_color_primary(c):
    p = page(c, 15); p.kicker("04 · MÀU SẮC — MÀU CHỦ ĐẠO")
    y = p.title(["MIDNIGHT &", "ASCENT EMERALD"], size=27)
    p.para("Midnight là sân khấu chính của sản phẩm 18+. Emerald nói về tăng trưởng và tiến độ; Gold dành cho khoảnh khắc thành tựu/Brew. Bảng màu đủ trưởng thành cho dashboard, game và tài liệu đối tác.", 54, y, 360, size=10.5, leading=15.5)
    p.txt("ASCENT EMERALD 50–800", 54, y + 88, "BeVN-XB", 10, G700)
    greens = ["#ECFDF5", "#D1FAE5", "#A7F3D0", "#6EE7B7", "#34D399", "#12B981", "#059669", "#047857", "#063F2A"]
    for i, hx in enumerate(greens):
        p.rect(54 + i * 41, y + 110, 37, 46, fill=HexColor(hx), stroke=LINE, r=8)
        p.txt(str([50, 100, 200, 300, 400, 500, 600, 700, 800][i]), 54 + i * 41 + 18.5, y + 160, "BeVN-B", 8, BODY, "middle")
    p.para("Quy tắc sản phẩm: 60% Midnight/Paper, 25% Emerald, 15% Gold/Crimson/Cyan theo ngữ nghĩa — màu nhấn không dùng ngẫu nhiên.", 54, y + 186, 360, size=10, leading=15)
    swatch(p, 480, 106, 196, 118, "#12B981", "Ascent Emerald 500", "RGB 18 185 129 · CMYK 90 0 30 27", INK)
    swatch(p, 692, 106, 196, 118, "#047857", "Guardian Green 700", "RGB 4 120 87 · CMYK 97 0 28 53")
    swatch(p, 480, 262, 196, 118, "#07111F", "Midnight Hero", "RGB 7 17 31 · CMYK 77 45 0 88")
    swatch(p, 692, 262, 196, 118, "#FFB703", "Hero Gold", "RGB 255 183 3 · CMYK 0 28 99 0", INK)
    p.newpage()

def p16_color_secondary(c):
    p = page(c, 16); p.kicker("04 · MÀU PHỤ & MÀU THEO ERA")
    y = p.title(["LỬA NHÂN VĂN,", "ÁNH SÁNG PROOF"], size=27)
    p.para("Màu phụ mang ngữ nghĩa sản phẩm: Crimson = hiến máu/hành động nhân văn, Cyan = dữ liệu/proof/nguồn, Violet = sáng tạo cấp cao. Mỗi Era có một dấu màu; Numeric Level vẫn tăng vô hạn, riêng Forever dùng Gold cho toàn bộ Lv.35+.", 54, y, 360, size=10.5, leading=15.5)
    tiers = [("Zero Lv.0", "#64748B"), ("Awaken", "#0EA5C6"), ("Explorer", "#12B981"), ("Guardian", "#047857"), ("Hero", "#F04452"), ("Legend", "#7C6BE0"), ("Forever 35+", "#FFB703")]
    xx = 54
    for lb, hx in tiers:
        p.circle(xx + 20, y + 128, 20, fill=HexColor(hx), stroke=LINE)
        p.txt(lb, xx + 20, y + 152, "BeVN-B", 7.3, BODY, "middle"); xx += 51
    p.para("Signal Paper giữ tài liệu sáng, dễ in và đối tác dễ đọc; Midnight vẫn là môi trường chính của app/game.", 54, y + 192, 360, size=10, leading=15)
    swatch(p, 480, 106, 196, 104, "#38D5F5", "Proof Cyan 400", "RGB 56 213 245 · CMYK 77 13 0 4", INK)
    swatch(p, 692, 106, 196, 104, "#BD2038", "Humanity Crimson", "RGB 189 32 56 · CMYK 0 83 70 26")
    swatch(p, 480, 248, 196, 104, "#7C6BE0", "Legend Violet", "RGB 124 107 224 · CMYK 45 52 0 12")
    swatch(p, 692, 248, 196, 104, "#F5F8FC", "Signal Paper", "RGB 245 248 252 · CMYK 3 2 0 1")
    p.newpage()

def p17_color_a11y(c):
    p = page(c, 17); p.kicker("04 · TƯƠNG PHẢN & HÒA NHẬP MÀU")
    y = p.title(["ĐẸP PHẢI", "ĐỌC ĐƯỢC"])
    p.para("Mọi cặp chữ/nền dưới đây đã đo theo WCAG 2.2. Chữ thường cần ≥4,5:1; chữ lớn ≥3:1. Không bao giờ dùng màu làm tín hiệu duy nhất — trạng thái đúng/sai/proof luôn có biểu tượng và chữ.", 54, y, 350, size=10.5, leading=15.5)
    yy = y + 110
    yy = p.bullet("Nút chính", "Trắng trên Green 700 (5,48:1). Green 500 là màu tiến độ/đồ họa, không đặt chữ trắng nhỏ lên trên.", 54, yy, 350)
    yy = p.bullet("Hero Gold", "Luôn đi với chữ Midnight (10,84:1) — cấm chữ trắng trên vàng.", 54, yy, 350, SUN500)
    pairs = [("#07111F", "#F5F8FC", "17,78:1", "Chữ chính/Paper"), ("#FFFFFF", "#047857", "5,48:1", "Nút chính"),
             ("#07111F", "#FFB703", "10,84:1", "Brew/Thành tựu"), ("#FFFFFF", "#BD2038", "6,13:1", "Nhân văn"),
             ("#38D5F5", "#07111F", "10,82:1", "Proof trên tối"), ("#A8BDD2", "#07111F", "9,81:1", "Chữ phụ trên tối")]
    x, t = 470, 104
    for fg, bg, ratio, lb in pairs:
        p.rect(x, t, 204, 74, fill=HexColor(bg), stroke=LINE, r=12)
        p.txt("Aa Hero", x + 14, t + 12, "BalooB", 14, HexColor(fg))
        p.txt(f"{lb} · {ratio}", x + 14, t + 46, "BeVN-B", 8.3, HexColor(fg))
        x += 218
        if x > 700: x = 470; t += 88
    p.rect(470, t + 4, 422, 54, fill=white, stroke=RED, r=12, sw=1.4)
    p.txt("CẤM: Trắng / Green 500 cho chữ nhỏ · Trắng / Gold · Crimson 500 trên nền sáng", 486, t + 20, "BeVN-B", 9, RED)
    p.newpage()

def p18_mascot(c):
    p = page(c, 18); p.kicker("05 · HERO, KHÔNG MASCOT TRẺ CON")
    y = p.title(["NGƯỜI HỌC LÀ", "NHÂN VẬT CHÍNH"], size=27)
    p.para("Gon Mầm của v1 đã nghỉ hưu khỏi master brand 18+. Trong v2, nhân vật chính là chính Hero — người dùng, người hiến máu, mentor và cộng đồng — cùng các motif G Orbit, Hero Spark và badge bằng chứng.", 54, y, 350, size=10.5, leading=15.5)
    yy = y + 112
    yy = p.bullet("Dùng", "Ảnh/minh họa người lớn đang học, làm, phục vụ; badge; bản đồ quest; dữ liệu/proof được trực quan hoá.", 54, yy, 350)
    yy = p.bullet("Không dùng", "Mascot mặt cười, đồ chơi khối, lớp học trẻ em hoặc khen kiểu 'bé ngoan' trong mọi bề mặt 18+.", 54, yy, 350, CORAL)
    p.para("File legacy chỉ còn trong exploration và assets-illustration/legacy-v1-children để truy vết PR #6. Minh họa AI là style draft; bản thương mại cần kiểm tra/vẽ lại rõ quyền.", 54, yy + 4, 340, size=9.3, leading=13.5)
    p.rect(480, 104, 200, 300, fill=white, stroke=LINE, r=18)
    p.img(PNG / "gon-app-icon-green@512.png", 505, 130, w=150)
    p.txt("G Orbit — app icon v2", 580, 352, "BeVN-B", 9, BODY, "middle")
    p.rect(696, 104, 200, 300, fill=white, stroke=LINE, r=18)
    p.img(PNG / "gon-badge-achievement@512.png", 721, 130, w=150)
    p.txt("Hero Proof Badge", 796, 352, "BeVN-B", 9, BODY, "middle")
    p.newpage()
def p19_pattern(c):
    p = page(c, 19); p.kicker("05 · HỌA TIẾT, BIỂU TƯỢNG, HÌNH KHỐI")
    y = p.title(["NGÔN NGỮ", "ORBIT · SPARK · PROOF"], size=26)
    p.para("Hệ hình v2 gồm vòng orbit, node tri thức, đường hành trình, tia Spark và khiên/badge Proof. Bo góc 12–22px giữ sự hiện đại mà không mềm kiểu sản phẩm trẻ em.", 54, y, 350, size=10.5, leading=15.5)
    yy = y + 100
    for h, b in [("Icon", "Lưới 24px, nét 2px bo tròn, luôn có nhãn cho trạng thái quan trọng; không truyền đạt chỉ bằng màu."),
                 ("Họa tiết node", "Node/liên kết thưa trên Midnight hoặc Paper cho bìa sau, sự kiện và trạng thái tải. Không đặt chữ nhỏ lên họa tiết."),
                 ("Ảnh/UI", "Bo góc ảnh 20px; bóng đổ mềm duy nhất: 0 8px 24px Ink 10%.")]:
        yy = p.bullet(h, b, 54, yy, 350)
    tx, ty = 470, 110
    for r in range(2):
        for cc2 in range(2):
            p.img(TPL / "gon-pattern-seeds-tile-288.png", tx + cc2 * 190, ty + r * 190, w=190)
    p.rect(tx, ty, 380, 380, fill=None, stroke=LINE, r=16)
    p.txt("Pattern chuyển tiếp từ v1 — dùng thưa, không làm nền chữ", tx + 190, ty + 392, "BeVN-B", 9, BODY, "middle")
    p.newpage()

def p20_imagery(c):
    p = page(c, 20); p.kicker("05 · HÌNH ẢNH CON NGƯỜI")
    y = p.title(["NGƯỜI LỚN THẬT,", "HÀNH TRÌNH THẬT"], size=27)
    rules = [("Chỉ người trưởng thành", "Người trẻ, người đi làm, tình nguyện viên và creator xuất hiện bình đẳng, có năng lực; không trẻ hoá người lớn."),
             ("Quyền & riêng tư", "Có đồng ý với người trong ảnh; dữ liệu hiến máu/sức khỏe nhạy cảm không công khai mặc định."),
             ("Khoảnh khắc", "Bắt cảnh tìm nguồn, làm quest, trao proof, cùng cộng đồng hành động — không chỉ ngồi nhìn màn hình."),
             ("Không", "Không ảnh trước/sau y khoa gây hiểu nhầm, không khoe chứng chỉ của người khác, không dùng nỗi xấu hổ để thúc đẩy.")]
    yy = y
    for h, b in rules: yy = p.bullet(h, b, 54, yy, 350)
    p.img(ILL / "gon-heroes-18plus.jpg", 460, 118, w=436)
    p.rect(460, 118, 436, 269, fill=None, stroke=LINE, r=16)
    p.txt("Định hướng: Hero trưởng thành, quest map, nguồn và proof", 678, 398, "BeVN-B", 9, BODY, "middle")
    p.newpage()

def p21_voice(c):
    p = page(c, 21); p.kicker("06 · GIỌNG NÓI & TÊN GỌI")
    y = p.title(["NÓI NHƯ", "AI COACH & ĐỒNG ĐỘI"], size=26)
    p.para("Tên viết \"GON\" (luôn hoa). Lần đầu xuất hiện luôn viết đủ GON — Game Of Nurture. Người dùng là Hero/người học; tuyệt đối không gọi người trưởng thành là bé và không dùng giọng lớp mẫu giáo.", 54, y, 350, size=10.5, leading=15.5)
    p.txt("TAGLINE", 54, y + 104, "BeVN-XB", 10, G700)
    p.txt("Become the Hero Within.", 54, y + 124, "BalooXB", 19, INK)
    p.txt("Ingest. Learn. Prove. Become.", 54, y + 156, "BalooB", 14, G700)
    rows = [("NÊN NÓI", "\"Chưa có module đủ sát — Brew chủ đề này?\"", G700, G50),
            ("NÊN NÓI", "\"Ảnh đã được gắn nguồn. Issuer-verified cần đối chiếu thêm.\"", G700, G50),
            ("KHÔNG NÓI", "\"AI đã kiểm chứng mọi thứ\" khi chưa có citation/grounding", RED, HexColor("#FDECEC")),
            ("KHÔNG NÓI", "\"Bạn đã đủ điều kiện hiến máu\" — quyết định thuộc cơ quan y tế", RED, HexColor("#FDECEC"))]
    x, t = 470, 104
    for h, b, col, bg in rows:
        p.rect(x, t, 420, 70, fill=bg, stroke=LINE, r=14)
        p.txt(h, x + 16, t + 9, "BeVN-XB", 9, col); p.para(b, x + 16, t + 28, 390, "BeVN-SB", 10.5, INK, 15); t += 82
    p.pill("Ngân hàng câu chữ: 06-Content/CONTENT-VI-EN.md", x, t + 2, fill=G100, color=G800)
    p.newpage()

def p22_content(c):
    p = page(c, 22); p.kicker("06 · TÍNH NĂNG KỂ THÀNH NỘI DUNG")
    y = p.title(["SÁU CỘT TRỤ", "CỦA GON.ORG"], size=28)
    p.para("Mọi trang web và màn hình của GON xoay quanh sáu cột trụ gắn với ZOFO nhưng viết cho sản phẩm học tập AI: cộng đồng, sức khỏe, AI Coach, gamification, proof và hành trình dài hạn.", 54, y, 340, size=10.5, leading=15.5)
    promises = ["Hiến máu & hành động nhân văn", "Sức khỏe toàn diện bằng thói quen", "AI Coach cá nhân hoá",
                "Lifelong Level: Lv.N · Era · Quest · Guild", "Brew Your Topic không ngõ cụt", "Proof of Learning truy vết được"]
    x, t = 450, 100
    for i, s in enumerate(promises):
        p.rect(x, t, 448, 42, fill=white, stroke=LINE, r=12)
        p.circle(x + 24, t + 21, 12, fill=[G500, SKY, SUN500, CORAL, BERRY, G700][i])
        p.txt(str(i + 1), x + 24, t + 16, "BalooB", 10, white, "middle"); p.txt(s, x + 50, t + 13, "BalooB", 12.5, INK); t += 52
    yy = y + 96
    p.txt("THANG TUYÊN BỐ (CLAIM LADDER)", 54, yy, "BeVN-XB", 10, G700); yy += 22
    for h, b, col in [("Được nói ngay", "Search 768D · Brew · Quest · lưu proof (ghi Demo khi là prototype)", G500),
                      ("Cần dữ liệu của GON", "\"Cải thiện X%\" — phải có nghiên cứu lưu hồ sơ", SUN500),
                      ("Không bao giờ", "Chẩn đoán/chữa trị · verified khi chưa đối chiếu · hứa hẹn tài chính", RED)]:
        yy = p.bullet(h, b, 54, yy, 340, col)
    p.para("GON hỗ trợ học và ghi hành trình — không phải thiết bị hay dịch vụ y tế.", 54, yy + 2, 340, "BeVN-B", 10, RED, 14)
    p.newpage()

def p23_cobrand(c):
    p = page(c, 23); p.kicker("07 · ĐỒNG THƯƠNG HIỆU (CO-BRANDING)")
    y = p.title(["ĐI CÙNG ĐỐI TÁC,", "VẪN LÀ GON"])
    rules = ["Dùng logo mặc định trên nền trắng/Paper khi có thể.",
             "Hai logo ngang hàng về kích thước thị giác; GON đứng trái để được đọc trước.",
             "Chia cách bằng dấu × hoặc vạch đứng, khoảng cách ≥ bề rộng icon G.",
             "Không lồng logo đối tác vào chữ G, Hero Spark hoặc proof badge.",
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
    y = p.title(["POWERED BY GON,", "HERO PROOF"])
    p.para("Đối tác tích hợp module/AI/game của GON dùng dấu Powered by/Made with theo quy tắc logo. Dấu nhận diện không tự biến một thành tích thành đã xác minh; cấp proof phải luôn đi kèm issuer và provenance.", 54, y, 350, size=10.5, leading=15.5)
    p.img(PNG / "gon-powered-by@512.png", 54, y + 104, w=230)
    p.img(PNG / "gon-made-with@512.png", 54, y + 252, w=230)
    x = 460
    p.txt("CẤP XÁC MINH PROOF", x, 108, "BeVN-XB", 10.5, G700)
    p.img(PNG / "gon-badge-achievement@512.png", x + 10, 132, w=120)
    lv = [("Source-linked", "File/link + hash, chưa đối chiếu", SKY), ("System-recorded", "Quest/quiz do GON ghi", G700),
          ("Issuer-verified", "Tổ chức hoặc chữ ký đã kiểm tra", SUN500), ("Anchored", "POAP/SBT + provenance", CORAL)]
    t = 132
    for h, b, col in lv:
        p.circle(x + 166, t + 14, 11, fill=col); p.txt(h, x + 190, t, "BalooB", 12, INK); p.txt(b, x + 190, t + 19, "BeVN", 9.3, BODY); t += 42
    p.para("Ảnh chứng chỉ chỉ là Source-linked cho tới khi issuer được đối chiếu. Không đổi XP thành hứa hẹn tiền, không xếp hạng bằng dữ liệu sức khỏe nhạy cảm và luôn có đường thu hồi bằng chứng sai.", x, 318, 420, size=10, leading=15)
    p.newpage()

def p25_applications(c):
    p = page(c, 25); p.kicker("08 · ỨNG DỤNG TRUYỀN THÔNG & IN ẤN")
    y = p.title(["GON NGOÀI", "ĐỜI THẬT"])
    p.para("Bốn mẫu khóa cứng (locked templates) trong 04-Templates đủ cho 90% nhu cầu: bìa mạng xã hội, bài vuông, trang bìa thuyết trình và giấy khen. Chỉ thay chữ trong vùng cho phép — không dời logo, không đổi màu nền.", 54, y, 330, size=10.5, leading=15.5)
    yy = y + 110
    for h, b in [("Avatar", "gon-app-icon-green hoặc icon trên Paper, không kèm chữ."), ("Ảnh bìa sự kiện", "Tagline + Hero Proof Badge; không mascot trẻ em."), ("Hero Proof", "Tên, module, Boss, cấp và issuer cụ thể; không khen chung chung.")]:
        yy = p.bullet(h, b, 54, yy, 330)
    p.img(TPL / "gon-social-cover-1640x924.png", 438, 92, w=452)
    p.img(TPL / "gon-certificate-a4-landscape.png", 438, 356, w=200)
    p.img(TPL / "gon-social-post-1080.png", 662, 356, w=132)
    p.newpage()

def p26_product(c):
    p = page(c, 26); p.kicker("08 · GON.ORG & GDEVELOP")
    y = p.title(["TỪ INPUT", "THÀNH GAME"])
    rules = [("Arena hai lộ trình", "AI Coach Path giải thích/roadmap; Quest Path biến kiến thức thành hành động. Người học có thể hợp nhất."),
             ("Module có hợp đồng", "Mỗi module có outcome, concepts, 5 quest, flashcards, reorder, quiz và Boss Proof."),
             ("Server là trọng tài", "Lifetime XP/Lv.N/badge chính thức do XP Ledger ở backend quyết định với idempotency; game chỉ hiển thị, không tự phong cấp."),
             ("Xuất GDevelop", "Prototype xuất blueprint scene/events/variables; converter tự động là việc production riêng.")]
    yy = y
    for h, b in rules: yy = p.bullet(h, b, 54, yy, 340)
    x, t, w, h = 520, 92, 300, 400
    p.rect(x, t, w, h, fill=INK, r=30); p.rect(x + 10, t + 10, w - 20, h - 20, fill=PAPER, r=24)
    p.img(PNG / "gon-app-icon-green@512.png", x + 24, t + 24, w=40)
    p.txt("Lv.9 · Guardian Era", x + 74, t + 30, "BalooB", 13, INK)
    p.rect(x + 24, t + 84, w - 48, 96, fill=white, stroke=LINE, r=16)
    p.txt("Sắp xếp quy trình chuẩn bị", x + w / 2, t + 98, "BalooB", 13, INK, "middle")
    for i, col in enumerate([G500, SUN, SKY, CORAL]):
        p.circle(x + 66 + i * 56, t + 148, 17, fill=col); p.txt(str(i + 1), x + 66 + i * 56, t + 143, "BeVN-B", 9, INK if i == 1 else white, "middle")
    p.rect(x + 24, t + 202, w - 48, 52, fill=G700, r=16); p.txt("Vào Quest", x + w / 2, t + 218, "BalooB", 14, white, "middle")
    p.rect(x + 24, t + 266, w - 48, 52, fill=SUN, r=16); p.txt("Nộp Boss Proof", x + w / 2, t + 282, "BalooB", 14, INK, "middle")
    p.img(PNG / "gon-badge-achievement@512.png", x + w / 2 - 37, t + 324, w=74)
    p.newpage()

def p31_ai_system(c):
    p = page(c, 31); p.kicker("08 · KIẾN TRÚC AI — GEMINI · ADK · 768D")
    y = p.title(["SEARCH HOẶC BREW,", "KHÔNG CÓ NGÕ CỤT"], size=26)
    bullets = [("Prototype ≠ production", "Demo chạy embedding deterministic 768D trong trình duyệt. Production gọi Gemini qua server/worker, không để API key ở client."),
               ("Hybrid search", "Full-text + cosine vector + độ phủ từ khóa đặc thù. Ngưỡng phải hiệu chuẩn bằng tập truy vấn gán nhãn."),
               ("Brew có cổng chất lượng", "Topic-checker trước pipeline; schema, citation grounding, safety và ghi một lần ở cuối."),
               ("Không trùng khi retry", "Mỗi request có idempotency key, trạng thái bền vững, chi phí và lỗi cuối.")]
    yy = y
    for h, b in bullets: yy = p.bullet(h, b, 54, yy, 350)
    p.pill("apps/gon-web/ARCHITECTURE.md", 54, yy + 4, fill=G100, color=G800)
    steps = [("⌁", "Ingest", "Text · file · ảnh · video · link"), ("◎", "Understand", "OCR/transcript · keyword · intent"),
             ("⬡", "Embed", "Gemini vector 768D + provenance"), ("⌕", "Search", "Found · related · missing"),
             ("✦", "Brew", "Google ADK 11 bước"), ("♛", "Prove", "Quest · Lifetime XP · Lv.N vô hạn · Proof Vault")]
    x0, t0 = 470, 100
    for i, (icon, h, b) in enumerate(steps):
        x = x0 + (i % 2) * 216; t = t0 + (i // 2) * 112
        p.rect(x, t, 202, 96, fill=INK if i in (2, 4) else white, stroke=LINE, r=16)
        tc = white if i in (2, 4) else INK; mc = G300 if i in (2, 4) else BODY
        p.txt(icon, x + 16, t + 10, "DejaVu", 18, SUN if i in (2, 4) else G700)
        p.txt(h, x + 48, t + 12, "BeVN-XB", 13, tc); p.para(b, x + 16, t + 46, 170, "BeVN", 9, mc, 13)
    p.newpage()

def p32_proof(c):
    p = page(c, 32); p.kicker("08 · PROOF OF LEARNING & PROOF OF HUMANITY")
    y = p.title(["BẰNG CHỨNG PHẢI", "NÓI ĐÚNG MỨC"], size=27)
    p.para("GON lưu hành trình từ chính input và hoạt động học, đồng thời cho gắn POAP/SBT, Facebook, YouTube, ảnh chứng chỉ, chứng chỉ/chứng nhận và link tổ chức.", 54, y, 350, size=10.5, leading=15.5)
    yy = y + 92
    yy = p.bullet("Hash không phải xác minh", "SHA-256 chỉ chứng minh file không đổi sau thời điểm ghi; nó không xác minh người sở hữu hay issuer.", 54, yy, 350, SKY)
    yy = p.bullet("Riêng tư mặc định", "Proof công khai cần opt-in; dữ liệu sức khỏe/hiến máu có consent và đường xoá/thu hồi riêng.", 54, yy, 350, CORAL)
    yy = p.bullet("Audit được", "Mỗi lần nâng cấp proof phải ghi ai/hệ thống nào đối chiếu, bằng chứng nào và khi nào.", 54, yy, 350, SUN500)
    levels = [("0 · Self-declared", "Người dùng tự khai"), ("1 · Source-linked", "File/link + hash"),
              ("2 · System-recorded", "GON ghi quest/quiz/module"), ("3 · Issuer-verified", "Issuer/chữ ký đã đối chiếu"),
              ("4 · Anchored", "POAP/SBT/sổ cái + provenance")]
    x, t = 470, 100
    for i, (h, b) in enumerate(levels):
        p.rect(x, t, 420, 58, fill=white, stroke=LINE, r=14)
        p.rect(x, t, 12, 58, fill=[HexColor("#94A3B8"), SKY, G700, SUN500, CORAL][i], r=6)
        p.txt(h, x + 28, t + 9, "BeVN-XB", 12, INK); p.txt(b, x + 28, t + 31, "BeVN", 9.5, BODY); t += 70
    p.newpage()

def p27_safety(c):
    p = page(c, 27); p.kicker("08 · TIẾP CẬN, DỮ LIỆU & AN TOÀN AI")
    y = p.title(["TIN CẬY LÀ", "TÍNH NĂNG SỐ 1"])
    p.para("Một nền tảng lưu input cá nhân, proof và hành trình sức khỏe chỉ đáng tin khi an toàn có mặt từ kiến trúc. Trang này là cam kết thiết kế, không thay thế tư vấn pháp lý/y tế.", 54, y, 350, size=10.5, leading=15.5)
    items = [("Tiếp cận (WCAG 2.2 AA)", "Tương phản · bàn phím · trình đọc màn hình · tôn trọng giảm chuyển động · không chớp sáng nguy hiểm."),
             ("Riêng tư 18+", "Thu thập tối thiểu, consent theo mục đích, export/xoá dữ liệu; rà soát quy định dữ liệu ở thị trường phát hành."),
             ("An toàn input/AI", "Chống SSRF/malware, tôn trọng bản quyền khi ingest, ghi trạng thái chưa kiểm chứng, xác thực mọi API ghi/queue."),
             ("Không thao túng", "Không loot-box, không ép streak bằng sợ hãi, không leaderboard trên dữ liệu sức khỏe nhạy cảm.")]
    yy = y + 100
    for h, b in items: yy = p.bullet(h, b, 54, yy, 420)
    p.rect(540, 120, 350, 300, fill=INK, r=18)
    p.txt("CAM KẾT GON", 566, 142, "BeVN-XB", 11, SUN)
    for i, s in enumerate(["18+ rõ ràng", "Dữ liệu có consent", "Nguồn truy vết", "Proof đúng mức", "Người dùng kiểm soát"]):
        p.circle(578, 190 + i * 44, 9, fill=G500)
        p.txt("✓".encode("utf-8").decode("utf-8"), 578, 183 + i * 44, "DejaVu", 10, white, "middle")
        p.txt(s, 598, 182 + i * 44, "BeVN-SB", 12, white)
    p.newpage()

def p28_motion(c):
    p = page(c, 28); p.kicker("08 · CHUYỂN ĐỘNG, ÂM THANH, SỰ KIỆN")
    y = p.title(["CHUYỂN ĐỘNG", "CÓ NHỊP HERO"])
    rows = [("Chuyển động", "200–350ms, quyết đoán; Hero Spark và đường orbit dẫn mắt khi Brew/search đổi trạng thái. Tôn trọng giảm chuyển động."),
            ("Âm thanh", "Nhạc/hiệu ứng tắt độc lập; âm xác nhận ngắn, không tiếng máy đánh bạc hay còi gây giật mình."),
            ("Sự kiện", "Backdrop Midnight, quest map và Proof wall chỉ hiển thị bằng chứng đã được đồng ý công khai."),
            ("Vật phẩm", "Ưu tiên vật liệu bền/tái chế; badge vật lý phải nối tới record số và không tự nhận issuer-verified.")]
    yy = y
    for h, b in rows: yy = p.bullet(h, b, 54, yy, 430)
    x, t = 540, 120
    p.rect(x, t, 350, 132, fill=white, stroke=LINE, r=16)
    for i, lb in enumerate(["Ingest", "Search", "Quest", "Proof"]):
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
    y = p.title(["GIỮ HỆ", "LUÔN GỌN GÀNG"])
    left = [("Nguồn duy nhất", "Mọi file lấy từ branding/GON-GameOfNurture trong repo; thay đổi qua pull request kèm ảnh so sánh trước/sau."),
            ("Đặt tên file", "gon-{loại}-{biến thể}@{kích thước}.png · SVG là bản gốc, PNG chỉ là bản xuất."),
            ("Phê duyệt", "Logo đối tác, tuyên bố hiệu quả/y tế, ảnh người thật và nâng cấp proof: cần duyệt thương hiệu + pháp lý/chuyên môn."),
            ("Phiên bản", "Brandbook v2.2 · 22/10/2026. Mô hình level theo GON White Paper 1.0/gon-level-v1; V1 chỉ còn giá trị lịch sử.")]
    yy = y
    for h, b in left: yy = p.bullet(h, b, 54, yy, 400)
    x = 520
    p.rect(x, 110, 376, 310, fill=HexColor("#FDECEC"), stroke=RED, r=16, sw=1.2)
    p.txt("LƯU Ý TRƯỚC KHI RA MẮT", x + 20, 128, "BeVN-XB", 11, RED)
    notes = ["Tra cứu & đăng ký nhãn hiệu GON / Game Of Nurture; kiểm tra quyền dùng thông điệp/tài sản ZOFO nếu không cùng chủ thể.",
             "Không dùng logo, số liệu hay câu chữ của ZOFO/POAP/Nurture như của GON.",
             "OAuth/Gemini/ADK/POAP/token trong prototype là mô phỏng hoặc chưa phát hành; không tiếp thị như đã tích hợp thật, không cho mua level bằng token.",
             "Be Vietnam Pro theo OFL 1.1. Minh họa AI cần kiểm tra/vẽ lại rõ quyền trước thương mại hoá.",
             "Rà soát tuổi 18+, dữ liệu cá nhân, bản quyền ingest và nội dung sức khỏe theo thị trường."]
    t = 154
    for n in notes:
        p.circle(x + 26, t + 7, 4.5, fill=RED); t = p.para(n, x + 40, t, 338, size=9.6, leading=13.5) + 9
    p.newpage()

def p30_back(c):
    p = page(c, 30, bg=INK)
    p.img(PNG / "gon-app-icon-green@512.png", W / 2 - 55, 96, w=110)
    p.txt("GON", W / 2, 216, "BalooXB", 44, white, "middle")
    p.txt("GAME OF NURTURE", W / 2, 264, "BeVN-XB", 13, G300, "middle")
    p.txt("Become the Hero Within. — Ingest. Learn. Prove. Become.", W / 2, 300, "BalooB", 15, SUN, "middle")
    p.para("GON BRANDBOOK 2026 — Heroes 18+ v2.2\nLv.35 mở Forever Era — học tập suốt đời, không có level cuối.\nThiết kế tại Việt Nam, cho Hero trưởng thành ở khắp nơi.\nHệ nhận diện: branding/GON-GameOfNurture · Prototype: apps/gon-web",
           W / 2 - 260, 350, 520, "BeVN", 10, G100, 15, "middle")
    p.txt("© 2026 GON — Game Of Nurture. Kiểm tra nhãn hiệu trước khi sử dụng thương mại.", W / 2, H - 56, "BeVN", 8.5, G300, "middle")
    p.footer()


PAGES = [p01_cover, p02_index, p03_what, p04_mission, p05_audience, p06_personality, p07_logo, p08_construction,
         p09_clearspace, p10_minimum, p11_variants, p12_donts, p13_typography, p14_typeuse,
         p15_color_primary, p16_color_secondary, p17_color_a11y,
         p18_mascot, p19_pattern, p20_imagery, p21_voice, p22_content, p23_cobrand, p24_integrators,
         p25_applications, p26_product, p31_ai_system, p32_proof, p27_safety, p28_motion, p29_governance, p30_back]

def main():
    from reportlab.pdfgen import canvas
    c = canvas.Canvas(str(OUT), pagesize=(W, H))
    c.setTitle("GON — Game Of Nurture for Heroes 18+ · Brandbook 2026 v2.2 · Lifelong Levels")
    c.setAuthor("GON Branding — Game Of Nurture 18+")
    c.setSubject("Logo, brand system and AI product blueprint for GON.org — adult learning games 18+, Gemini 768D search, Brew, Proof and unbounded lifelong numeric levels (Forever Era from Lv.35)")
    for fn in PAGES: fn(c)
    c.save(); print(f"Wrote {OUT} ({len(PAGES)} pages)")

if __name__ == "__main__":
    main()
