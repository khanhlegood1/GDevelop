#!/usr/bin/env python3
"""Build the GON White Paper PDF from its Markdown source of truth.

Run from branding/GON-GameOfNurture:
    /tmp/venv-branding/bin/python tools/build_whitepaper.py

The Markdown file remains canonical; this script only renders a polished,
print/share-friendly PDF companion with the GON 18+ identity.
"""
from __future__ import annotations

import html
import pathlib
import re

from reportlab.lib import colors
from reportlab.lib.colors import HexColor
from reportlab.lib.enums import TA_CENTER, TA_JUSTIFY, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    HRFlowable,
    Image,
    KeepTogether,
    ListFlowable,
    ListItem,
    PageBreak,
    Paragraph,
    Preformatted,
    XPreformatted,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

ROOT = pathlib.Path(__file__).resolve().parent.parent
SOURCE = ROOT / "07-Product-AI" / "GON-WHITEPAPER.md"
OUT = ROOT / "07-Product-AI" / "GON-WHITEPAPER.pdf"
FONTS = ROOT / "tools" / "fonts-ttf"
LOGO = ROOT / "01-Logo" / "png" / "gon-app-icon-green@512.png"

MIDNIGHT = HexColor("#07111F")
MIDNIGHT_2 = HexColor("#0E2237")
INK = HexColor("#13283D")
BODY = HexColor("#3E556E")
MUTED = HexColor("#68809B")
EMERALD = HexColor("#12B981")
GREEN_700 = HexColor("#047857")
GREEN_800 = HexColor("#063F2A")
GOLD = HexColor("#FFB703")
CRIMSON = HexColor("#BD2038")
CYAN = HexColor("#0EA5C6")
PAPER = HexColor("#F5F8FC")
LINE = HexColor("#D7E3F0")
CODE_BG = HexColor("#0B1C2F")
TABLE_HEAD = HexColor("#0A2B22")

# Be Vietnam Pro does not carry every mathematical glyph used in the source.
# Keep the brand face for prose and use DejaVu only for those glyphs/code.
SPECIALS = {
    "→": "[[GLYPH_ARROW]]",
    "∞": "[[GLYPH_INFINITY]]",
    "≤": "[[GLYPH_LE]]",
    "≥": "[[GLYPH_GE]]",
    "↔": "[[GLYPH_BIDIR]]",
    "✓": "[[GLYPH_CHECK]]",
    "⬡": "[[GLYPH_HEX]]",
    "✦": "[[GLYPH_STAR]]",
    "○": "[[GLYPH_CIRCLE]]",
    "◐": "[[GLYPH_HALF]]",
    "◆": "[[GLYPH_DIAMOND]]",
    "♛": "[[GLYPH_CROWN]]",
}
GLYPH_HTML = {
    "[[GLYPH_ARROW]]": '<font name="DejaVu">→</font>',
    "[[GLYPH_INFINITY]]": '<font name="DejaVu">∞</font>',
    "[[GLYPH_LE]]": '<font name="DejaVu">≤</font>',
    "[[GLYPH_GE]]": '<font name="DejaVu">≥</font>',
    "[[GLYPH_BIDIR]]": '<font name="DejaVu">↔</font>',
    "[[GLYPH_CHECK]]": '<font name="DejaVu">✓</font>',
    "[[GLYPH_HEX]]": '<font name="DejaVu">⬡</font>',
    "[[GLYPH_STAR]]": '<font name="DejaVu">✦</font>',
    "[[GLYPH_CIRCLE]]": '<font name="DejaVu">○</font>',
    "[[GLYPH_HALF]]": '<font name="DejaVu">◐</font>',
    "[[GLYPH_DIAMOND]]": '<font name="DejaVu">◆</font>',
    "[[GLYPH_CROWN]]": '<font name="DejaVu">♛</font>',
}


def register_fonts() -> None:
    fonts = [
        ("BeVN", "BeVietnamPro-Regular.ttf"),
        ("BeVN-M", "BeVietnamPro-Medium.ttf"),
        ("BeVN-SB", "BeVietnamPro-SemiBold.ttf"),
        ("BeVN-B", "BeVietnamPro-Bold.ttf"),
        ("BeVN-XB", "BeVietnamPro-ExtraBold.ttf"),
    ]
    for name, filename in fonts:
        pdfmetrics.registerFont(TTFont(name, str(FONTS / filename)))
    pdfmetrics.registerFont(TTFont("DejaVu", "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"))
    pdfmetrics.registerFont(TTFont("DejaVu-B", "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"))
    pdfmetrics.registerFont(TTFont("DejaVuMono", "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf"))
    pdfmetrics.registerFontFamily(
        "BeVN", normal="BeVN", bold="BeVN-B", italic="BeVN", boldItalic="BeVN-B"
    )
    pdfmetrics.registerFontFamily(
        "DejaVu", normal="DejaVu", bold="DejaVu-B", italic="DejaVu", boldItalic="DejaVu-B"
    )


def protect_specials(text: str) -> str:
    for char, token in SPECIALS.items():
        text = text.replace(char, token)
    return text


def restore_specials(text: str) -> str:
    for token, markup in GLYPH_HTML.items():
        text = text.replace(token, markup)
    return text


def inline_markup(text: str) -> str:
    """Convert the small Markdown subset used by GON-WHITEPAPER.md."""
    text = protect_specials(text.strip())

    code_chunks: list[str] = []

    def stash_code(match: re.Match[str]) -> str:
        code_chunks.append(html.escape(match.group(1)))
        return f"[[CODE_{len(code_chunks) - 1}]]"

    text = re.sub(r"`([^`]+)`", stash_code, text)
    text = html.escape(text, quote=False)

    # Links: in the PDF, show the readable label. The .md remains clickable.
    text = re.sub(
        r"\[([^\]]+)\]\([^\)]+\)",
        r'<font color="#047857"><b>\1</b></font>',
        text,
    )
    text = re.sub(r"\*\*([^*]+)\*\*", r"<b>\1</b>", text)
    text = re.sub(r"(?<!\*)\*([^*]+)\*(?!\*)", r"<i>\1</i>", text)

    for idx, code in enumerate(code_chunks):
        replacement = f'<font name="BeVN-SB" color="#063F2A">{code}</font>'
        text = text.replace(f"[[CODE_{idx}]]", replacement)
    return restore_specials(text)


def split_table_row(line: str) -> list[str]:
    line = line.strip()
    if line.startswith("|"):
        line = line[1:]
    if line.endswith("|"):
        line = line[:-1]
    return [cell.strip() for cell in line.split("|")]


def is_table_separator(line: str) -> bool:
    cells = split_table_row(line)
    return bool(cells) and all(re.fullmatch(r":?-{3,}:?", cell) for cell in cells)


class WhitepaperRenderer:
    def __init__(self, markdown: str):
        self.markdown = markdown
        self.styles = self.build_styles()
        self.story = []
        self.toc: list[tuple[int, str]] = []

    def build_styles(self):
        ss = getSampleStyleSheet()
        styles = {
            "cover_kicker": ParagraphStyle(
                "CoverKicker", parent=ss["Normal"], fontName="BeVN-B", fontSize=9,
                leading=12, textColor=GOLD, alignment=TA_CENTER, spaceAfter=10,
            ),
            "cover_title": ParagraphStyle(
                "CoverTitle", parent=ss["Title"], fontName="BeVN-XB", fontSize=35,
                leading=39, textColor=colors.white, alignment=TA_CENTER, spaceAfter=12,
            ),
            "cover_subtitle": ParagraphStyle(
                "CoverSubtitle", parent=ss["Normal"], fontName="BeVN-SB", fontSize=16,
                leading=23, textColor=HexColor("#B9F4D5"), alignment=TA_CENTER,
                spaceAfter=18,
            ),
            "cover_meta": ParagraphStyle(
                "CoverMeta", parent=ss["Normal"], fontName="BeVN", fontSize=9.5,
                leading=15, textColor=HexColor("#C7D6E8"), alignment=TA_CENTER,
            ),
            "toc_title": ParagraphStyle(
                "TOCTitle", parent=ss["Heading1"], fontName="BeVN-XB", fontSize=24,
                leading=28, textColor=MIDNIGHT, spaceAfter=8,
            ),
            "toc_h2": ParagraphStyle(
                "TOCH2", parent=ss["Normal"], fontName="BeVN-B", fontSize=9.6,
                leading=13.2, textColor=INK, leftIndent=0, spaceAfter=0,
            ),
            "toc_h3": ParagraphStyle(
                "TOCH3", parent=ss["Normal"], fontName="BeVN", fontSize=8.2,
                leading=10.6, textColor=BODY, leftIndent=13, spaceAfter=0,
            ),
            "h2": ParagraphStyle(
                "H2", parent=ss["Heading1"], fontName="BeVN-XB", fontSize=19,
                leading=23, textColor=MIDNIGHT, spaceBefore=18, spaceAfter=8,
                keepWithNext=True, borderPadding=(0, 0, 5, 0),
            ),
            "h3": ParagraphStyle(
                "H3", parent=ss["Heading2"], fontName="BeVN-B", fontSize=13,
                leading=17, textColor=GREEN_800, spaceBefore=13, spaceAfter=5,
                keepWithNext=True,
            ),
            "body": ParagraphStyle(
                "Body", parent=ss["BodyText"], fontName="BeVN", fontSize=9.7,
                leading=15.4, textColor=BODY, alignment=TA_JUSTIFY,
                spaceAfter=6,
            ),
            "body_small": ParagraphStyle(
                "BodySmall", parent=ss["BodyText"], fontName="BeVN", fontSize=8.7,
                leading=13.2, textColor=BODY, alignment=TA_LEFT, spaceAfter=4,
            ),
            "quote": ParagraphStyle(
                "Quote", parent=ss["BodyText"], fontName="BeVN-SB", fontSize=11,
                leading=17, textColor=GREEN_800, alignment=TA_LEFT,
            ),
            "code": ParagraphStyle(
                "Code", parent=ss["Code"], fontName="DejaVu", fontSize=7.7,
                leading=10.5, textColor=HexColor("#D9FBEA"),
                leftIndent=7, rightIndent=7, spaceBefore=5, spaceAfter=5,
            ),
            "table_cell": ParagraphStyle(
                "TableCell", parent=ss["BodyText"], fontName="BeVN", fontSize=7.3,
                leading=10.0, textColor=BODY, alignment=TA_LEFT,
            ),
            "table_head": ParagraphStyle(
                "TableHead", parent=ss["BodyText"], fontName="BeVN-B", fontSize=7.3,
                leading=10.0, textColor=colors.white, alignment=TA_LEFT,
            ),
            "formula": ParagraphStyle(
                "Formula", parent=ss["Normal"], fontName="DejaVuMono", fontSize=12,
                leading=16, textColor=MIDNIGHT, alignment=TA_CENTER,
            ),
            "formula_note": ParagraphStyle(
                "FormulaNote", parent=ss["Normal"], fontName="BeVN-B", fontSize=9,
                leading=13, textColor=GREEN_800, alignment=TA_CENTER,
            ),
        }
        return styles

    def add_cover(self) -> None:
        s = self.styles
        self.story.append(Spacer(1, 30 * mm))
        if LOGO.exists():
            logo = Image(str(LOGO), width=28 * mm, height=28 * mm)
            logo.hAlign = "CENTER"
            self.story.append(logo)
            self.story.append(Spacer(1, 8 * mm))
        self.story.append(Paragraph("GON.ORG · GAME OF NURTURE · HEROES 18+", s["cover_kicker"]))
        self.story.append(Paragraph("GON<br/>WHITE PAPER", s["cover_title"]))
        self.story.append(
            Paragraph(
                "Lifelong Learning, Infinite Numeric Levels,<br/>XP &amp; Learning Token Accounting",
                s["cover_subtitle"],
            )
        )
        formula = Table(
            [
                [Paragraph("Numeric Level = floor(Lifetime XP / 100)", s["formula"])],
                [Paragraph("Forever Era mở ở Lv.35+ — học tập suốt đời, không có level cuối", s["formula_note"])],
            ],
            colWidths=[128 * mm],
        )
        formula.setStyle(
            TableStyle(
                [
                    ("BACKGROUND", (0, 0), (-1, -1), GOLD),
                    ("ROUNDEDCORNERS", [5, 5, 5, 5]),
                    ("TOPPADDING", (0, 0), (-1, 0), 9),
                    ("BOTTOMPADDING", (0, 0), (-1, 0), 2),
                    ("TOPPADDING", (0, 1), (-1, 1), 1),
                    ("BOTTOMPADDING", (0, 1), (-1, 1), 9),
                    ("LEFTPADDING", (0, 0), (-1, -1), 10),
                    ("RIGHTPADDING", (0, 0), (-1, -1), 10),
                ]
            )
        )
        formula.hAlign = "CENTER"
        self.story.append(formula)
        self.story.append(Spacer(1, 16 * mm))
        self.story.append(
            Paragraph(
                "Phiên bản 1.0 · 22/10/2026<br/>"
                "Công thức chuẩn: gon-level-v1<br/>"
                "Nguồn Markdown: 07-Product-AI/GON-WHITEPAPER.md<br/><br/>"
                "Tài liệu thiết kế sản phẩm và quản trị tiến trình học tập.<br/>"
                "Không phải lời mời đầu tư hay tư vấn tài chính, pháp lý, y tế.",
                s["cover_meta"],
            )
        )
        self.story.append(PageBreak())

    def collect_toc(self, lines: list[str]) -> None:
        in_code = False
        for line in lines:
            if line.strip().startswith("```"):
                in_code = not in_code
                continue
            if in_code:
                continue
            if line.startswith("## "):
                self.toc.append((2, line[3:].strip()))
            elif line.startswith("### "):
                self.toc.append((3, line[4:].strip()))

    def add_toc(self) -> None:
        s = self.styles
        self.story.append(Paragraph("Mục lục", s["toc_title"]))
        self.story.append(
            Paragraph(
                "White Paper này chốt một quyết định xuyên suốt: level của GON là một trục số vô hạn ngay từ đầu; "
                "Forever là kỷ nguyên mở từ Lv.35+, không phải điểm kết thúc của việc học.",
                s["body_small"],
            )
        )
        self.story.append(Spacer(1, 2 * mm))
        for level, heading in self.toc:
            style = s["toc_h2"] if level == 2 else s["toc_h3"]
            prefix = "" if level == 2 else "· "
            self.story.append(Paragraph(prefix + inline_markup(heading), style))
        self.story.append(Spacer(1, 4 * mm))
        note = Table(
            [[Paragraph(
                "<b>Nguyên tắc đọc nhanh:</b> XP ghi lại việc học đã được xác thực. Numeric Level biến Lifetime XP "
                "thành tiến bộ không trần. Era kể câu chuyện trưởng thành. Proof mới chứng minh năng lực thật theo chủ đề.",
                s["body_small"],
            )]],
            colWidths=[170 * mm],
        )
        note.setStyle(
            TableStyle(
                [
                    ("BACKGROUND", (0, 0), (-1, -1), HexColor("#ECFDF5")),
                    ("BOX", (0, 0), (-1, -1), 0.7, EMERALD),
                    ("LEFTPADDING", (0, 0), (-1, -1), 12),
                    ("RIGHTPADDING", (0, 0), (-1, -1), 12),
                    ("TOPPADDING", (0, 0), (-1, -1), 10),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
                    ("ROUNDEDCORNERS", [5, 5, 5, 5]),
                ]
            )
        )
        self.story.append(note)
        self.story.append(PageBreak())

    def paragraph(self, text: str, style: str = "body") -> Paragraph:
        return Paragraph(inline_markup(text), self.styles[style])

    def add_quote(self, text: str) -> None:
        table = Table([[self.paragraph(text, "quote")]], colWidths=[170 * mm])
        table.setStyle(
            TableStyle(
                [
                    ("BACKGROUND", (0, 0), (-1, -1), HexColor("#ECFDF5")),
                    ("LINEBEFORE", (0, 0), (0, -1), 3, EMERALD),
                    ("LEFTPADDING", (0, 0), (-1, -1), 12),
                    ("RIGHTPADDING", (0, 0), (-1, -1), 10),
                    ("TOPPADDING", (0, 0), (-1, -1), 8),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
                ]
            )
        )
        self.story.append(table)
        self.story.append(Spacer(1, 3 * mm))

    def add_code(self, lines: list[str]) -> None:
        code = "\n".join(lines).rstrip()
        # XPreformatted resolves XML entities (&lt;, &quot;) instead of printing them.
        pre = XPreformatted(html.escape(code, quote=False), self.styles["code"])
        table = Table([[pre]], colWidths=[170 * mm])
        table.setStyle(
            TableStyle(
                [
                    ("BACKGROUND", (0, 0), (-1, -1), CODE_BG),
                    ("ROUNDEDCORNERS", [4, 4, 4, 4]),
                    ("LEFTPADDING", (0, 0), (-1, -1), 7),
                    ("RIGHTPADDING", (0, 0), (-1, -1), 7),
                    ("TOPPADDING", (0, 0), (-1, -1), 5),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
                ]
            )
        )
        self.story.append(KeepTogether(table))
        self.story.append(Spacer(1, 3 * mm))

    def add_table(self, rows: list[list[str]]) -> None:
        if not rows:
            return
        col_count = max(len(row) for row in rows)
        normalized = [row + [""] * (col_count - len(row)) for row in rows]
        weights = []
        min_widths = []
        for col in range(col_count):
            cells = [row[col] for row in normalized]
            weights.append(max(8, max(len(cell) for cell in cells)))
            longest_token = 0
            for cell in cells:
                plain = re.sub(r"\[([^\]]+)\]\([^\)]+\)", r"\1", cell)
                plain = plain.replace("`", "").replace("*", "")
                tokens = re.findall(r"[A-Za-z0-9_.-]+", plain)
                if tokens:
                    longest_token = max(longest_token, max(len(token) for token in tokens))
            # Reserve enough room for identifiers such as LifetimeEarnedToken
            # so ReportLab does not break them in the middle.
            min_widths.append(min(54 * mm, max(19 * mm, longest_token * 1.78 * mm + 5 * mm)))

        available = 170 * mm
        if sum(min_widths) >= available:
            scale = available / sum(min_widths)
            widths = [width * scale for width in min_widths]
        else:
            widths = [available * weight / sum(weights) for weight in weights]
            fixed: set[int] = set()
            for _ in range(col_count):
                changed = False
                for idx, minimum in enumerate(min_widths):
                    if idx not in fixed and widths[idx] < minimum:
                        widths[idx] = minimum
                        fixed.add(idx)
                        changed = True
                if not changed or len(fixed) == col_count:
                    break
                remaining = available - sum(widths[idx] for idx in fixed)
                denom = sum(weights[idx] for idx in range(col_count) if idx not in fixed)
                for idx in range(col_count):
                    if idx not in fixed:
                        widths[idx] = remaining * weights[idx] / denom
            # Normalize any tiny floating-point drift.
            widths = [width * available / sum(widths) for width in widths]

        data = []
        for r_idx, row in enumerate(normalized):
            style_name = "table_head" if r_idx == 0 else "table_cell"
            data.append([Paragraph(inline_markup(cell), self.styles[style_name]) for cell in row])
        table = Table(data, colWidths=widths, repeatRows=1, hAlign="CENTER")
        style = [
            ("BACKGROUND", (0, 0), (-1, 0), TABLE_HEAD),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("GRID", (0, 0), (-1, -1), 0.45, LINE),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("LEFTPADDING", (0, 0), (-1, -1), 5),
            ("RIGHTPADDING", (0, 0), (-1, -1), 5),
            ("TOPPADDING", (0, 0), (-1, -1), 4),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ]
        for r_idx in range(1, len(data)):
            if r_idx % 2 == 0:
                style.append(("BACKGROUND", (0, r_idx), (-1, r_idx), HexColor("#F1F7FD")))
        table.setStyle(TableStyle(style))
        self.story.append(table)
        self.story.append(Spacer(1, 3.5 * mm))

    def add_list(self, items: list[str], ordered: bool) -> None:
        flow_items = [
            ListItem(self.paragraph(item, "body_small"), leftIndent=10, firstLineIndent=0)
            for item in items
        ]
        listing = ListFlowable(
            flow_items,
            bulletType="1" if ordered else "bullet",
            start="1" if ordered else "•",
            bulletFontName="BeVN-B",
            bulletFontSize=8.5,
            bulletColor=GREEN_700,
            leftIndent=12,
            bulletOffsetY=1,
        )
        self.story.append(listing)
        self.story.append(Spacer(1, 2 * mm))

    def render_markdown(self) -> None:
        text = self.markdown.replace("\r\n", "\n")
        start = text.find("## Tóm tắt điều hành")
        if start < 0:
            raise ValueError("Cannot find White Paper executive summary heading")
        lines = text[start:].splitlines()
        self.collect_toc(lines)
        self.add_cover()
        self.add_toc()

        idx = 0
        paragraph_buffer: list[str] = []

        def flush_paragraph() -> None:
            nonlocal paragraph_buffer
            if paragraph_buffer:
                joined = " ".join(part.strip() for part in paragraph_buffer).strip()
                if joined:
                    self.story.append(self.paragraph(joined))
                paragraph_buffer = []

        while idx < len(lines):
            raw = lines[idx]
            line = raw.rstrip()
            stripped = line.strip()

            if stripped.startswith("```"):
                flush_paragraph()
                idx += 1
                code_lines = []
                while idx < len(lines) and not lines[idx].strip().startswith("```"):
                    code_lines.append(lines[idx])
                    idx += 1
                idx += 1
                self.add_code(code_lines)
                continue

            if not stripped:
                flush_paragraph()
                idx += 1
                continue

            if stripped == "---":
                flush_paragraph()
                self.story.append(HRFlowable(width="100%", thickness=0.6, color=LINE, spaceBefore=4, spaceAfter=8))
                idx += 1
                continue

            if line.startswith("## "):
                flush_paragraph()
                self.story.append(self.paragraph(line[3:].strip(), "h2"))
                idx += 1
                continue
            if line.startswith("### "):
                flush_paragraph()
                self.story.append(self.paragraph(line[4:].strip(), "h3"))
                idx += 1
                continue

            if stripped.startswith(">"):
                flush_paragraph()
                quote_lines = []
                while idx < len(lines) and lines[idx].strip().startswith(">"):
                    quote_lines.append(lines[idx].strip().lstrip(">").strip())
                    idx += 1
                self.add_quote(" ".join(quote_lines))
                continue

            if stripped.startswith("|") and idx + 1 < len(lines) and is_table_separator(lines[idx + 1]):
                flush_paragraph()
                rows = [split_table_row(line)]
                idx += 2
                while idx < len(lines) and lines[idx].strip().startswith("|"):
                    rows.append(split_table_row(lines[idx]))
                    idx += 1
                self.add_table(rows)
                continue

            unordered = re.match(r"^\s*[-*]\s+(.+)$", line)
            ordered = re.match(r"^\s*\d+[.)]\s+(.+)$", line)
            if unordered or ordered:
                flush_paragraph()
                is_ordered = bool(ordered)
                items: list[str] = []
                while idx < len(lines):
                    current = lines[idx]
                    match = re.match(r"^\s*\d+[.)]\s+(.+)$" if is_ordered else r"^\s*[-*]\s+(.+)$", current)
                    if match:
                        items.append(match.group(1).strip())
                        idx += 1
                    elif current.strip() and (current.startswith("  ") or current.startswith("\t")) and items:
                        items[-1] += " " + current.strip()
                        idx += 1
                    else:
                        break
                self.add_list(items, is_ordered)
                continue

            paragraph_buffer.append(stripped)
            idx += 1

        flush_paragraph()


def cover_page(canvas, doc) -> None:
    canvas.saveState()
    width, height = A4
    canvas.setFillColor(MIDNIGHT)
    canvas.rect(0, 0, width, height, stroke=0, fill=1)
    # Orbit-like accents, built from simple print-safe shapes.
    canvas.setStrokeColor(EMERALD)
    canvas.setLineWidth(1.0)
    for radius in (88, 126, 164):
        canvas.circle(width / 2, height - 132, radius, stroke=1, fill=0)
    canvas.setFillColor(GOLD)
    canvas.circle(width / 2 + 112, height - 103, 5, stroke=0, fill=1)
    canvas.setFillColor(EMERALD)
    canvas.circle(width / 2 - 126, height - 174, 4, stroke=0, fill=1)
    canvas.setFillColor(CRIMSON)
    canvas.circle(width / 2 + 78, height - 241, 3.5, stroke=0, fill=1)
    canvas.setFont("BeVN-B", 7.5)
    canvas.setFillColor(HexColor("#A8BDD2"))
    canvas.drawCentredString(width / 2, 17 * mm, "GON — GAME OF NURTURE · BECOME THE HERO WITHIN · INGEST. LEARN. PROVE. BECOME.")
    canvas.restoreState()


def later_page(canvas, doc) -> None:
    canvas.saveState()
    width, height = A4
    canvas.setStrokeColor(LINE)
    canvas.setLineWidth(0.6)
    canvas.line(20 * mm, height - 15 * mm, width - 20 * mm, height - 15 * mm)
    canvas.setFont("BeVN-B", 7)
    canvas.setFillColor(MUTED)
    canvas.drawString(20 * mm, height - 11.5 * mm, "GON WHITE PAPER 1.0 · LIFELONG NUMERIC LEVELS")
    canvas.drawRightString(width - 20 * mm, height - 11.5 * mm, "FOREVER ERA · LV.35+")
    canvas.setFont("BeVN", 7)
    canvas.drawString(20 * mm, 12 * mm, "GON — Game Of Nurture · gon-level-v1")
    canvas.drawRightString(width - 20 * mm, 12 * mm, f"{doc.page}")
    canvas.restoreState()


def main() -> None:
    register_fonts()
    markdown = SOURCE.read_text(encoding="utf-8")
    renderer = WhitepaperRenderer(markdown)
    renderer.render_markdown()

    doc = SimpleDocTemplate(
        str(OUT),
        pagesize=A4,
        leftMargin=20 * mm,
        rightMargin=20 * mm,
        topMargin=20 * mm,
        bottomMargin=17 * mm,
        title="GON White Paper 1.0 — Lifelong Learning, Infinite Numeric Levels, XP & Learning Token Accounting",
        author="GON — Game Of Nurture",
        subject="Unbounded lifelong numeric levels: Lv = floor(Lifetime XP/100); Forever Era begins at Lv.35.",
        keywords="GON, Game Of Nurture, lifelong learning, XP, numeric level, Forever Era, Learning Token, Proof of Learning",
        creator="GON White Paper builder",
    )
    doc.build(renderer.story, onFirstPage=cover_page, onLaterPages=later_page)
    print(f"Wrote {OUT}")


if __name__ == "__main__":
    main()
