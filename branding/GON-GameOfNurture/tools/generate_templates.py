#!/usr/bin/env python3
"""GON 18+ Hero application templates (SVG masters with outlined text)."""
import sys, pathlib
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import generate_logos as gl

R = gl.ROOT; OUT = R / "04-Templates" / "svg"
INK, PAPER, WHITE = gl.INK, gl.PAPER, gl.WHITE
GREEN, GREEN700, GREEN100, SUN, SKY, CORAL, BERRY = gl.GREEN, gl.GREEN700, gl.GREEN100, gl.SUN, gl.SKY, gl.CORAL, gl.BERRY

def dots(seed_pts):
    return "".join(f'<circle cx="{x}" cy="{y}" r="{r}" fill="{c}"/>' for x, y, r, c in seed_pts)

def cover():
    W, H = 1640, 924
    mark = f'<g transform="translate(90,120) scale(1.15)">{gl.mark_A()}</g>'
    gon, _ = gl.text_path("GON", gl.BALOO_XB, 150, 400, 262, INK)
    sub, _ = gl.text_path("GAME OF NURTURE", gl.BEVN_SB, 38, 404, 318, GREEN700, tracking=4)
    tag, tw = gl.text_path("Become the Hero Within.", gl.BALOO_XB, 62, 110, 560, INK)
    tag2, _ = gl.text_path("Học tập dạng game cho Hero 18+", gl.BEVN_SB, 40, 110, 630, "#44586E")
    pill_t, pw = gl.text_path("AI Search · Brew Your Topic · Proof", gl.BEVN_B, 34, 150, 752, INK)
    pill = f'<rect x="110" y="700" width="{pw+80:.0f}" height="74" rx="37" fill="{SUN}"/>' + pill_t
    masc = f'<g transform="translate(1120,210) scale(2.0)">{gl.badge_B()}</g>'
    deco = dots([(1020,140,26,SUN),(1210,90,16,SKY),(1470,150,22,CORAL),(980,720,20,gl.GREEN300),(1560,620,16,BERRY),(700,150,14,SUN)])
    wave = f'<path d="M0 884 Q 205 824 410 884 T 820 884 T 1230 884 T 1640 884 L1640 924 L0 924 Z" fill="{GREEN}"/>'
    gl.save(OUT / "gon-social-cover-1640x924.svg", gl.svg_doc(W, H, deco + wave + mark + gon + sub + tag + tag2 + pill + masc, bg=PAPER))

def square_post():
    W = H = 1080
    masc = f'<g transform="translate(300,60) scale(2.0)">{gl.badge_B()}</g>'
    l1, _ = gl.text_path("Ingest. Learn.", gl.BALOO_XB, 96, W/2, 660, WHITE, anchor="middle")
    l2, _ = gl.text_path("Prove. Become.", gl.BALOO_XB, 96, W/2, 772, SUN, anchor="middle")
    sub, _ = gl.text_path("Quest · XP · Proof of Learning", gl.BEVN_SB, 40, W/2, 860, GREEN100, anchor="middle")
    foot, fw = gl.text_path("GON — Game Of Nurture", gl.BEVN_B, 34, W/2, 990, WHITE, anchor="middle")
    deco = dots([(120,140,22,SUN),(950,180,18,gl.SKY),(160,520,14,WHITE),(930,560,22,CORAL)])
    gl.save(OUT / "gon-social-post-1080.svg", gl.svg_doc(W, H, deco + masc + l1 + l2 + sub + foot, bg=GREEN700))

def slide_title():
    W, H = 1920, 1080
    mark = f'<g transform="translate(110,90) scale(0.62)">{gl.mark_A(g_color=gl.GREEN400, leaf_l=gl.GREEN300, leaf_r=SUN, stem_color=gl.GREEN300)}</g>'
    gon, _ = gl.text_path("GON", gl.BALOO_XB, 72, 280, 168, WHITE)
    kick, kw = gl.text_path("GAME OF NURTURE", gl.BEVN_B, 30, 140, 470, INK, tracking=3)
    pill = f'<rect x="110" y="416" width="{kw+60:.0f}" height="66" rx="33" fill="{SUN}"/>' + kick
    t1, _ = gl.text_path("Tên bài thuyết trình", gl.BALOO_XB, 118, 110, 630, WHITE)
    t2, _ = gl.text_path("Ghi chú ngắn hoặc tên người trình bày · 2026", gl.BEVN_SB, 42, 110, 716, GREEN100)
    deco = dots([(1680,180,44,SUN),(1800,360,24,SKY),(1560,860,30,CORAL),(1740,760,20,gl.GREEN400)])
    badge = f'<g transform="translate(1420,520) scale(1.7)">{gl.badge_B()}</g>'
    gl.save(OUT / "gon-slide-title-1920x1080.svg", gl.svg_doc(W, H, deco + badge + mark + gon + pill + t1 + t2, bg=INK))

def certificate():
    W, H = 1754, 1240
    frame = (f'<rect x="36" y="36" width="{W-72}" height="{H-72}" rx="36" fill="none" stroke="{GREEN700}" stroke-width="10"/>'
             f'<rect x="64" y="64" width="{W-128}" height="{H-128}" rx="26" fill="none" stroke="{SUN}" stroke-width="4"/>')
    badge = f'<g transform="translate({W/2-120},92)">{gl.badge_B()}</g>'
    title, _ = gl.text_path("HERO PROOF", gl.BALOO_XB, 108, W/2, 470, INK, anchor="middle", tracking=2)
    line1, _ = gl.text_path("Ghi nhận hành trình của Hero", gl.BEVN_SB, 44, W/2, 548, "#44586E", anchor="middle")
    name, _ = gl.text_path("Nguyễn Văn A", gl.BALOO_XB, 84, W/2, 668, GREEN700, anchor="middle")
    nline = f'<line x1="{W/2-380}" y1="696" x2="{W/2+380}" y2="696" stroke="{INK}" stroke-width="3" stroke-dasharray="2 10" stroke-linecap="round"/>'
    line2, _ = gl.text_path("đã hoàn thành module và Boss Proof — cấp Guardian", gl.BEVN_SB, 42, W/2, 786, INK, anchor="middle")
    line3, _ = gl.text_path("GON — Game Of Nurture · Become the Hero Within.", gl.BEVN_SB, 38, W/2, 850, "#44586E", anchor="middle")
    sig1, _ = gl.text_path("Ngày ... tháng ... năm ......", gl.BEVN_SB, 34, 300, 1010, INK)
    sig2, _ = gl.text_path("Issuer / Người xác minh", gl.BEVN_SB, 34, W-560, 1010, INK)
    sigl = f'<line x1="{W-560}" y1="1086" x2="{W-220}" y2="1086" stroke="{INK}" stroke-width="3" stroke-dasharray="2 10" stroke-linecap="round"/>'
    gl.save(OUT / "gon-certificate-a4-landscape.svg", gl.svg_doc(W, H, frame + badge + title + line1 + name + nline + line2 + line3 + sig1 + sig2 + sigl, bg=WHITE))

if __name__ == "__main__":
    cover(); square_post(); slide_title(); certificate(); print("OK")
