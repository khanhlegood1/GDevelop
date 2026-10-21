#!/usr/bin/env python3
"""
GON — Game Of Nurture for Heroes 18+ | Logo generator v2 (vector masters)
Original geometric construction. Wordmark text is converted to outlines
(SVG paths) from Be Vietnam Pro (OFL) so logo files have no font dependency.
V2 evolves the sprout into an ascent/flame mark for adult heroes.

Run with the branding venv:
  /tmp/venv-branding/bin/python tools/generate_logos.py
Requires: fonttools (TTFs in tools/fonts-ttf/), cairosvg for PNG export.
"""
import math, pathlib
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen

ROOT = pathlib.Path(__file__).resolve().parent.parent
SVG_DIR = ROOT / "01-Logo" / "svg"
EXPL_DIR = ROOT / "01-Logo" / "exploration" / "svg"
TPL_DIR = ROOT / "04-Templates" / "svg"
FONTS = ROOT / "tools" / "fonts-ttf"

# ---------- GON palette (source of truth: 03-Color-Typography/tokens) ----------
INK      = "#07111F"  # Midnight Hero
FOREST   = "#063F2A"  # Deep Guardian Green
GREEN700 = "#047857"
GREEN600 = "#059669"
GREEN    = "#12B981"  # Ascent Emerald — growth, secondary in v2
GREEN400 = "#34D399"
GREEN300 = "#6EE7B7"
GREEN100 = "#D1FAE5"
GREEN50  = "#ECFDF5"
SUN      = "#FFB703"  # Hero Gold
SUN500   = "#F59E0B"
SKY      = "#0EA5C6"  # Proof Cyan
SKY700   = "#0369A1"
CORAL    = "#F04452"  # Humanity Crimson
BERRY    = "#7C6BE0"
PAPER    = "#F5F8FC"  # Signal Paper
WHITE    = "#FFFFFF"
BLACK    = "#000000"

# ---------- text -> outlines ----------
_font_cache = {}
def _font(name):
    if name not in _font_cache:
        _font_cache[name] = TTFont(FONTS / name)
    return _font_cache[name]

def text_path(text, fontfile, size, x, y, fill, tracking=0.0, anchor="start", extra=""):
    """Return <path> with outlined text. (x,y) = baseline left (or anchor point)."""
    font = _font(fontfile)
    upem = font["head"].unitsPerEm
    scale = size / upem
    cmap = font.getBestCmap()
    hmtx = font["hmtx"]
    gs = font.getGlyphSet()
    # measure
    widths = []
    total = 0.0
    for ch in text:
        gname = cmap[ord(ch)]
        adv = hmtx[gname][0] * scale
        widths.append(adv); total += adv + tracking
    total -= tracking if text else 0
    if anchor == "middle": x -= total / 2
    elif anchor == "end": x -= total
    parts, cx = [], x
    for ch, adv in zip(text, widths):
        if ch == " ":
            cx += adv + tracking; continue
        pen = SVGPathPen(gs)
        gs[cmap[ord(ch)]].draw(pen)
        d = pen.getCommands()
        if d:
            parts.append(f'<path transform="translate({cx:.2f},{y:.2f}) scale({scale:.5f},{-scale:.5f})" d="{d}"/>')
        cx += adv + tracking
    return f'<g fill="{fill}" {extra}>' + "".join(parts) + "</g>", total

def text_width(text, fontfile, size, tracking=0.0):
    font = _font(fontfile); scale = size / font["head"].unitsPerEm
    cmap = font.getBestCmap(); hmtx = font["hmtx"]
    return sum(hmtx[cmap[ord(c)]][0] * scale for c in text) + tracking * max(0, len(text) - 1)

# ---------- geometry helpers ----------
def pt(cx, cy, r, deg):
    a = math.radians(deg)
    return (cx + r * math.cos(a), cy + r * math.sin(a))

def arc_path(cx, cy, r, start_deg, end_deg, sweep_long=True):
    """SVG arc from start to end going counter-clockwise in math coords
    but screen coords y-down: we just emit arc with flags for the long way."""
    x1, y1 = pt(cx, cy, r, start_deg)
    x2, y2 = pt(cx, cy, r, end_deg)
    # long way around the left side: large-arc=1, sweep=0 (counter-clockwise on screen)
    return f"M {x1:.2f} {y1:.2f} A {r} {r} 0 1 0 {x2:.2f} {y2:.2f}"

def leaf(x, y, length, width, angle_deg, fill):
    """A pointed leaf from base (x,y) pointing 'up' before rotation."""
    # leaf outline: two quadratic curves meeting at tip (0,-length)
    d = (f"M 0 0 C {-width:.1f} {-length*0.35:.1f} {-width*0.72:.1f} {-length*0.78:.1f} 0 {-length:.1f} "
         f"C {width*0.72:.1f} {-length*0.78:.1f} {width:.1f} {-length*0.35:.1f} 0 0 Z")
    vein = f"M 0 -4 C -2 {-length*0.4:.1f} -1 {-length*0.7:.1f} 0 {-length+7:.1f}"
    return (f'<g transform="translate({x:.1f},{y:.1f}) rotate({angle_deg})">'
            f'<path d="{d}" fill="{fill}"/>'
            f'<path d="{vein}" fill="none" stroke="{WHITE}" stroke-opacity="0.55" stroke-width="3.2" stroke-linecap="round"/></g>')

# ================================================================
# PRIMARY MARK — Concept A "Mam Choi / Sprout Play G"  (240x240 grid)
# G ring  = growth cycle / Game;  bar = soil line; sprout grows from it;
# right leaf tip doubles as a soft Play pointer. Seed sun-dot at base.
# ================================================================
def hero_spark(cx=198, cy=40, r=16, fill=SUN):
    """Four-point ascent spark placed at the opening of the G orbit."""
    return (f'<path d="M {cx} {cy-r} Q {cx+r*.16} {cy-r*.16} {cx+r} {cy} '
            f'Q {cx+r*.16} {cy+r*.16} {cx} {cy+r} Q {cx-r*.16} {cy+r*.16} {cx-r} {cy} '
            f'Q {cx-r*.16} {cy-r*.16} {cx} {cy-r} Z" fill="{fill}"/>')

def mark_A(g_color=INK, bar_color=None, leaf_l=GREEN400, leaf_r=CORAL,
           stem_color=GREEN, seed_color=SUN, mono=None, small=False):
    """V2 Hero mark: one-piece midnight G orbit + ascent sprout/flame.
    The mature evolution keeps the G silhouette but replaces the childlike
    sun leaf with a crimson flame/Play pointer and a gold hero spark."""
    if bar_color is None:
        bar_color = g_color
    if mono:
        g_color = bar_color = leaf_l = leaf_r = stem_color = seed_color = mono
    cx, cy, R, W = 120, 122, 82, 30
    g = arc_path(cx, cy, R, -52, 0)  # ends due-east: ring meets the bar = letter G
    stem_x, stem_top = 110, 92
    stem = f"M {stem_x} {cy+4} C {stem_x-1} 112 {stem_x} 102 {stem_x+1} {stem_top+8}"
    parts = [
        f'<path d="{g}" fill="none" stroke="{g_color}" stroke-width="{W}" stroke-linecap="round"/>',
        # G-bar = soil line the sprout grows from
        f'<path d="M {stem_x-6} {cy+2} L 190 {cy+2}" stroke="{bar_color}" stroke-width="{W}" stroke-linecap="round"/>',
    ]
    if small:
        # simplified: single bold leaf only (legible < 24px) — cf. POAP small-size rule
        parts.append(f'<path d="M {stem_x} {cy} C {stem_x} 108 {stem_x+1} 100 {stem_x+2} 94" fill="none" stroke="{stem_color}" stroke-width="11" stroke-linecap="round"/>')
        parts.append(leaf(stem_x + 2, 96, 46, 19, 42, leaf_r))
    else:
        parts += [
            f'<path d="{stem}" fill="none" stroke="{stem_color}" stroke-width="10" stroke-linecap="round"/>',
            leaf(stem_x, stem_top + 6, 46, 18, -46, leaf_l),    # growth leaf
            leaf(stem_x + 3, stem_top + 2, 52, 20, 48, leaf_r),  # crimson flame / Play pointer
            f'<circle cx="{stem_x}" cy="{cy+2}" r="9" fill="{seed_color}"/>',
            hero_spark(),
        ]
    return "".join(parts)

def svg_doc(w, h, body, bg=None, title="GON — Game Of Nurture"):
    bgrect = f'<rect width="{w}" height="{h}" fill="{bg}"/>' if bg else ""
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" width="{w}" height="{h}" role="img" aria-labelledby="t">'
            f'<title id="t">{title}</title>{bgrect}{body}</svg>\n')

def save(path, content):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")
    print("wrote", path.relative_to(ROOT))

# ---------- lockups ----------
BALOO_XB = "BeVietnamPro-ExtraBold.ttf"  # v2 mature display (name kept for template compatibility)
BEVN_SB  = "BeVietnamPro-SemiBold.ttf"
BEVN_B   = "BeVietnamPro-Bold.ttf"

def horizontal_lockup(word=INK, sub=GREEN700, mono=None, bg=None, mark_kwargs=None, fname="gon-logo-horizontal.svg"):
    mark_kwargs = mark_kwargs or ({"mono": mono} if mono else {})
    if mono: word = sub = mono
    mark = f'<g transform="scale(0.92)">{mark_A(**mark_kwargs)}</g>'  # 240*.92=220.8
    gon, _ = text_path("GON", BALOO_XB, 118, 252, 138, word)
    sub_t, _ = text_path("GAME OF NURTURE", BEVN_SB, 30.5, 256, 182, sub, tracking=3.2)
    w = 256 + max(text_width("GON", BALOO_XB, 118), text_width("GAME OF NURTURE", BEVN_SB, 30.5, 3.2)) + 8
    save(SVG_DIR / fname, svg_doc(round(w), 221, mark + gon + sub_t, bg=bg))

def stacked_lockup(word=INK, sub=GREEN700, mono=None, bg=None, fname="gon-logo-stacked.svg"):
    kw = {"mono": mono} if mono else {}
    if mono: word = sub = mono
    W = 420
    mark = f'<g transform="translate({(W-240)/2},0)">{mark_A(**kw)}</g>'
    gon, _ = text_path("GON", BALOO_XB, 110, W/2, 330, word, anchor="middle")
    sub_t, _ = text_path("GAME OF NURTURE", BEVN_SB, 27, W/2, 372, sub, tracking=3.4, anchor="middle")
    save(SVG_DIR / fname, svg_doc(W, 396, mark + gon + sub_t, bg=bg))

# ================================================================
# Concept B — "Seed Sun Badge" (achievement / proof-of-learning)
# Distinct from POAP rosette: 12 rounded sun/seed rays, no ribbons.
# ================================================================
def badge_B(center_fill=WHITE, ray=SUN, ring=GREEN, mono=None, inner_mark=True):
    if mono: center_fill, ray, ring = mono, mono, mono
    cx = cy = 120
    rays = []
    for i in range(12):
        rays.append(f'<ellipse cx="{cx}" cy="{cy-96}" rx="14" ry="27" fill="{ray}" transform="rotate({i*30} {cx} {cy})"/>')
    inner = ""
    if inner_mark:
        inner = f'<g transform="translate(48,48) scale(0.6)">{mark_A(mono=mono) if mono else mark_A()}</g>'
    return ("".join(rays)
            + f'<circle cx="{cx}" cy="{cy}" r="82" fill="{center_fill}" stroke="{ring}" stroke-width="9"/>'
            + inner)

# ================================================================
# Concept C — "GON Blocks" (kids wordmark exploration)
# ================================================================
def blocks_C():
    tiles = []
    cols = [GREEN, SUN, SKY]
    letters = ["G", "O", "N"]
    fills = [WHITE, INK, WHITE]
    rots = [-5, 3, 5]
    for i, (ch, c, f, r) in enumerate(zip(letters, cols, fills, rots)):
        x = 18 + i * 138
        t, _ = text_path(ch, BALOO_XB, 92, x + 64, 132, f, anchor="middle")
        tiles.append(f'<g transform="rotate({r} {x+64} 98)"><rect x="{x}" y="36" width="128" height="128" rx="30" fill="{c}"/>{t}</g>')
    sprout = leaf(210, 42, 34, 13, -30, GREEN400) + leaf(214, 40, 40, 14, 34, GREEN)
    return "".join(tiles) + sprout

# ================================================================
# Legacy mascot — "Gon Mam" (retired from the 18+ master brand; archive only)
# ================================================================
def mascot(body="#FFE9B8"):
    return (
        # leaves hair
        leaf(120, 66, 54, 20, -36, GREEN400) + leaf(122, 62, 62, 22, 30, GREEN)
        + f'<path d="M120 70 C120 58 121 50 122 44" stroke="{GREEN700}" stroke-width="8" fill="none" stroke-linecap="round"/>'
        # seed body
        + f'<path d="M120 58 C 168 58 196 100 196 142 C 196 192 162 216 120 216 C 78 216 44 192 44 142 C 44 100 72 58 120 58 Z" fill="{body}"/>'
        # face
        + f'<circle cx="92" cy="140" r="9" fill="{INK}"/><circle cx="148" cy="140" r="9" fill="{INK}"/>'
        + f'<circle cx="95" cy="136" r="3" fill="{WHITE}"/><circle cx="151" cy="136" r="3" fill="{WHITE}"/>'
        + f'<path d="M104 166 C 112 176 128 176 136 166" fill="none" stroke="{INK}" stroke-width="7" stroke-linecap="round"/>'
        + f'<ellipse cx="74" cy="162" rx="12" ry="8" fill="{CORAL}" opacity="0.55"/><ellipse cx="166" cy="162" rx="12" ry="8" fill="{CORAL}" opacity="0.55"/>'
        + f'<ellipse cx="94" cy="215" rx="17" ry="8" fill="{GREEN}"/><ellipse cx="146" cy="215" rx="17" ry="8" fill="{GREEN}"/>'
    )
GON_BODY = "#FFE9B8"

# ================================================================
def main():
    # --- masters ---
    save(SVG_DIR / "gon-icon.svg", svg_doc(240, 240, mark_A()))
    save(SVG_DIR / "gon-icon-small.svg", svg_doc(240, 240, mark_A(small=True)))
    save(SVG_DIR / "gon-icon-mono-black.svg", svg_doc(240, 240, mark_A(mono=BLACK)))
    save(SVG_DIR / "gon-icon-mono-white.svg", svg_doc(240, 240, mark_A(mono=WHITE), bg=INK))
    save(SVG_DIR / "gon-icon-mono-green.svg", svg_doc(240, 240, mark_A(mono=GREEN700)))
    save(SVG_DIR / "gon-favicon.svg", svg_doc(240, 240, mark_A(small=True)))
    horizontal_lockup()
    horizontal_lockup(mono=BLACK, fname="gon-logo-horizontal-mono-black.svg")
    horizontal_lockup(word=WHITE, sub=GREEN100, fname="gon-logo-horizontal-reverse.svg", bg=INK,
                      mark_kwargs={"g_color": GREEN400, "leaf_l": GREEN300, "leaf_r": SUN, "stem_color": GREEN300})
    stacked_lockup()
    stacked_lockup(mono=BLACK, fname="gon-logo-stacked-mono-black.svg")
    # app icon (rounded square, ink-green field, paper mark space)
    app = (f'<rect width="240" height="240" rx="54" fill="{PAPER}"/>'
           f'<g transform="translate(24,24) scale(0.8)">{mark_A()}</g>')
    save(SVG_DIR / "gon-app-icon.svg", svg_doc(240, 240, app))
    app2 = (f'<rect width="240" height="240" rx="54" fill="{GREEN}"/>'
            f'<g transform="translate(24,24) scale(0.8)">{mark_A(g_color=WHITE, leaf_l=WHITE, leaf_r=SUN, stem_color=WHITE, seed_color=SUN)}</g>')
    save(SVG_DIR / "gon-app-icon-green.svg", svg_doc(240, 240, app2))
    # badges
    save(SVG_DIR / "gon-badge-achievement.svg", svg_doc(240, 240, badge_B()))
    save(SVG_DIR / "gon-mascot-gon-mam.svg", svg_doc(240, 240, mascot()))
    # powered-by (POAP 'Integrators' analogue)
    pb_text, _ = text_path("Powered by", BEVN_SB, 21, 156, 86, INK)
    pb_gon, _ = text_path("GON", BALOO_XB, 46, 156, 132, INK)
    powered = (f'<rect x="3" y="3" width="306" height="174" rx="26" fill="{WHITE}" stroke="{INK}" stroke-width="5"/>'
               f'<g transform="translate(14,26) scale(0.53)">{mark_A()}</g>' + pb_text + pb_gon)
    save(SVG_DIR / "gon-powered-by.svg", svg_doc(312, 180, powered))
    pb_text_w, _ = text_path("Powered by", BEVN_SB, 21, 156, 86, WHITE)
    pb_gon_w, _ = text_path("GON", BALOO_XB, 46, 156, 132, WHITE)
    powered_d = (f'<rect x="3" y="3" width="306" height="174" rx="26" fill="{INK}"/>'
                 f'<g transform="translate(14,26) scale(0.53)">{mark_A(g_color=GREEN400, leaf_l=GREEN300, leaf_r=CORAL, stem_color=GREEN300)}</g>' + pb_text_w + pb_gon_w)
    save(SVG_DIR / "gon-powered-by-dark.svg", svg_doc(312, 180, powered_d))
    # "Made with GON" pill for GDevelop games
    mg_w = 84 + text_width("Made with GON", BEVN_B, 26) + 30
    mg_text, _ = text_path("Made with GON", BEVN_B, 26, 84, 52, WHITE)
    made = (f'<rect width="{mg_w:.0f}" height="72" rx="36" fill="{GREEN700}"/>'
            f'<g transform="translate(12,4) scale(0.267)">{mark_A(g_color=WHITE, leaf_l=WHITE, leaf_r=SUN, stem_color=WHITE, seed_color=SUN)}</g>' + mg_text)
    save(SVG_DIR / "gon-made-with.svg", svg_doc(round(mg_w), 72, made))
    # --- exploration concepts ---
    save(EXPL_DIR / "concept-A-sprout-play-G.svg", svg_doc(240, 240, mark_A()))
    save(EXPL_DIR / "concept-B-seed-sun-badge.svg", svg_doc(240, 240, badge_B()))
    save(EXPL_DIR / "concept-C-gon-blocks.svg", svg_doc(450, 180, blocks_C()))
    # --- seamless seed pattern tile ---
    dots = []
    for (x, y, r, c) in [(40,40,10,SUN),(150,30,7,SKY),(230,70,9,CORAL),(90,120,8,GREEN300),(200,150,11,BERRY),
                         (30,200,7,SKY),(130,220,9,SUN),(240,230,7,GREEN300),(70,260,10,CORAL),(190,270,8,SKY)]:
        dots.append(f'<circle cx="{x}" cy="{y}" r="{r}" fill="{c}"/>')
    pat = "".join(dots) + leaf(160, 120, 40, 15, 28, GREEN400) + leaf(60, 180, 36, 13, -30, GREEN)
    save(TPL_DIR / "gon-pattern-seeds-tile-288.svg", svg_doc(288, 288, pat, bg=PAPER))
    print("OK")

if __name__ == "__main__":
    main()
