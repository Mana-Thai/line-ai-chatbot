# -*- coding: utf-8 -*-
"""ギフト動画サンプル用のシーンイラスト(SVG 1920x1080)を9枚生成する。

    python artwork/works/gift-video-samples/generate_scenes.py

母の日(m1-m3)・誕生日(b1-b3)・記念日(a1-a3)の3テーマ×3シーン。
文字は入れない(テキストは gift-video/scripts/assemble.py が重ねる)。
"""
import random
from pathlib import Path

OUT = Path(__file__).parent
W, H = 1920, 1080
rng = random.Random(42)


def head(defs: str) -> str:
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}">'
            f'<defs>{defs}</defs>')


def lingrad(gid: str, stops: list[tuple[str, str]], x2="0", y2="1") -> str:
    s = "".join(f'<stop offset="{o}" stop-color="{c}"/>' for o, c in stops)
    return f'<linearGradient id="{gid}" x1="0" y1="0" x2="{x2}" y2="{y2}">{s}</linearGradient>'


def radgrad(gid: str, stops: list[tuple[str, str, str]]) -> str:
    s = "".join(f'<stop offset="{o}" stop-color="{c}" stop-opacity="{op}"/>' for o, c, op in stops)
    return f'<radialGradient id="{gid}">{s}</radialGradient>'


def stars(n, y_max, rmin=1.5, rmax=4, color="#FFF6D8"):
    out = []
    for _ in range(n):
        x, y = rng.uniform(0, W), rng.uniform(0, y_max)
        r = rng.uniform(rmin, rmax)
        op = rng.uniform(0.35, 0.95)
        out.append(f'<circle cx="{x:.0f}" cy="{y:.0f}" r="{r:.1f}" fill="{color}" opacity="{op:.2f}"/>')
    return "".join(out)


def jasmine(x, y, s, op=1.0):
    petals = "".join(
        f'<ellipse cx="0" cy="{-s*0.62:.1f}" rx="{s*0.30:.1f}" ry="{s*0.55:.1f}" '
        f'fill="#FFFDF6" transform="rotate({a})"/>' for a in range(0, 360, 72))
    return (f'<g transform="translate({x},{y})" opacity="{op}">{petals}'
            f'<circle r="{s*0.22:.1f}" fill="#F5C542"/></g>')


def heart(x, y, s, color, op=1.0):
    return (f'<path transform="translate({x},{y}) scale({s})" opacity="{op}" fill="{color}" '
            f'd="M0,0.35 C-0.5,-0.15 -1,0.1 -1,0.45 C-1,0.8 -0.5,1.05 0,1.45 '
            f'C0.5,1.05 1,0.8 1,0.45 C1,0.1 0.5,-0.15 0,0.35 Z"/>')


def person(x, y, h, color, skirt=False):
    """シンプルな人物シルエット。h=身長"""
    head_r = h * 0.16
    body_w = h * (0.42 if skirt else 0.30)
    body = (f'<path d="M{-body_w/2:.0f},0 Q0,{-h*0.78:.0f} {body_w/2:.0f},0 Z"' if skirt
            else f'<rect x="{-body_w/2:.0f}" y="{-h*0.68:.0f}" width="{body_w:.0f}" '
                 f'height="{h*0.68:.0f}" rx="{body_w/2:.0f}"/>')
    return (f'<g transform="translate({x},{y})" fill="{color}">{body}'
            f'<circle cx="0" cy="{-h*0.84:.0f}" r="{head_r:.0f}"/></g>')


def birds(pts, color="#5A3A50"):
    return "".join(
        f'<path d="M{x-22},{y} Q{x-11},{y-14} {x},{y} Q{x+11},{y-14} {x+22},{y}" '
        f'stroke="{color}" stroke-width="5" fill="none" stroke-linecap="round"/>'
        for x, y in pts)


svgs = {}

# ============ 母の日 ============
svgs["m1"] = head(
    lingrad("sky", [("0", "#FFE9C7"), ("0.55", "#FFC89B"), ("1", "#FFA98C")])
    + radgrad("sun", [("0", "#FFF7E0", "1"), ("0.4", "#FFE9B8", "0.9"), ("1", "#FFD98E", "0")])
) + (
    f'<rect width="{W}" height="{H}" fill="url(#sky)"/>'
    f'<circle cx="960" cy="430" r="430" fill="url(#sun)"/>'
    f'<circle cx="960" cy="430" r="130" fill="#FFF9E8"/>'
    + birds([(560, 260), (700, 210), (1290, 290)], "#C77B52")
    + f'<path d="M0,760 Q480,640 960,740 T1920,700 V1080 H0 Z" fill="#9CBF7C"/>'
    f'<path d="M0,860 Q560,760 1100,870 T1920,830 V1080 H0 Z" fill="#7BA85F"/>'
    f'<path d="M0,960 Q660,880 1920,950 V1080 H0 Z" fill="#5E8F49"/>'
    + "".join(jasmine(rng.uniform(60, 1860), rng.uniform(900, 1060),
                      rng.uniform(26, 54), rng.uniform(0.8, 1)) for _ in range(26))
    + "".join(f'<circle cx="{rng.uniform(0,W):.0f}" cy="{rng.uniform(200,760):.0f}" '
              f'r="{rng.uniform(3,7):.1f}" fill="#FFFFFF" opacity="{rng.uniform(0.2,0.5):.2f}"/>'
              for _ in range(28))
    + "</svg>"
)

svgs["m2"] = head(
    lingrad("sky2", [("0", "#FFD9A8"), ("0.5", "#FF9E7E"), ("1", "#D96A85")])
    + radgrad("glow2", [("0", "#FFF3D6", "0.95"), ("1", "#FFE0A8", "0")])
) + (
    f'<rect width="{W}" height="{H}" fill="url(#sky2)"/>'
    f'<circle cx="640" cy="560" r="360" fill="url(#glow2)"/>'
    f'<circle cx="640" cy="560" r="110" fill="#FFF6DF"/>'
    + birds([(1180, 260), (1330, 210), (1460, 300)])
    + f'<path d="M0,880 Q960,800 1920,880 V1080 H0 Z" fill="#6B4258"/>'
    # 大きな木(右)
    f'<g fill="#4A2C40">'
    f'<rect x="1490" y="500" width="46" height="400" rx="20"/>'
    f'<path d="M1513,520 Q1420,470 1380,380" stroke="#4A2C40" stroke-width="30" fill="none" stroke-linecap="round"/>'
    f'<path d="M1513,540 Q1620,480 1680,400" stroke="#4A2C40" stroke-width="30" fill="none" stroke-linecap="round"/>'
    f'<circle cx="1360" cy="330" r="140"/><circle cx="1530" cy="270" r="170"/>'
    f'<circle cx="1700" cy="360" r="130"/><circle cx="1560" cy="420" r="120"/></g>'
    # 母と子(手つなぎ)
    + f'<g fill="#4A2C40">'
    f'<circle cx="870" cy="648" r="46"/>'  # 母の頭
    f'<path d="M806,900 Q816,750 850,704 Q870,688 890,704 Q924,750 934,900 Z"/>'  # ワンピース
    f'<path d="M896,724 Q952,762 1002,806" stroke="#4A2C40" stroke-width="22" fill="none" stroke-linecap="round"/>'  # 母の腕
    f'</g>'
    + person(1030, 900, 190, "#4A2C40")
    + f'<path d="M1002,806 Q1012,812 1022,822" stroke="#4A2C40" stroke-width="18" fill="none" stroke-linecap="round"/>'
    + "".join(heart(rng.uniform(700, 1250), rng.uniform(380, 640),
                    rng.uniform(14, 30), "#FFE3EC", rng.uniform(0.5, 0.9)) for _ in range(7))
    + "</svg>"
)

svgs["m3"] = head(
    lingrad("cream", [("0", "#F2F9FF"), ("1", "#D8EBFB")])
) + (
    f'<rect width="{W}" height="{H}" fill="url(#cream)"/>'
    f'<circle cx="960" cy="540" r="430" fill="#FFFFFF"/>'
    f'<circle cx="960" cy="540" r="430" fill="none" stroke="#BFDFF8" stroke-width="4"/>'
    # ジャスミンのリース
    + "".join(jasmine(960 + 430 * __import__("math").cos(t * 3.14159 / 12),
                      540 + 430 * __import__("math").sin(t * 3.14159 / 12),
                      44 if t % 2 else 60) for t in range(24))
    + "".join(f'<circle cx="{960 + 355 * __import__("math").cos((t+0.5) * 3.14159 / 12):.0f}" '
              f'cy="{540 + 355 * __import__("math").sin((t+0.5) * 3.14159 / 12):.0f}" '
              f'r="10" fill="#9CBF7C"/>' for t in range(24))
    + heart(960, 430, 120, "#F08BA6")
    + heart(830, 560, 55, "#F6B6C8") + heart(1090, 560, 55, "#F6B6C8")
    + "".join(f'<ellipse cx="{rng.uniform(0,W):.0f}" cy="{rng.uniform(0,H):.0f}" rx="9" ry="16" '
              f'fill="#FFFDF6" opacity="{rng.uniform(0.5,0.9):.2f}" '
              f'transform="rotate({rng.uniform(0,360):.0f} {rng.uniform(0,W):.0f} {rng.uniform(0,H):.0f})"/>'
              for _ in range(22))
    + "</svg>"
)

# ============ 誕生日 ============
BALLOON_COLORS = ["#FF8FA3", "#FFD166", "#7BD1C9", "#B79CED", "#6FB6FF", "#FFA76B"]
svgs["b1"] = head(
    lingrad("night1", [("0", "#1B2A5E"), ("0.6", "#3F3D7A"), ("1", "#7A4E8C")])
    + radgrad("moong", [("0", "#FFF6D8", "0.9"), ("1", "#FFF6D8", "0")])
) + (
    f'<rect width="{W}" height="{H}" fill="url(#night1)"/>'
    + stars(70, 900)
    + f'<circle cx="1560" cy="240" r="200" fill="url(#moong)"/>'
    f'<path d="M1620,140 A130,130 0 1,0 1620,360 A105,105 0 1,1 1620,140 Z" fill="#FFF3C4"/>'
    + "".join(
        (lambda x, y, s, c: f'<g transform="translate({x},{y})">'
         f'<path d="M0,{s*0.9:.0f} Q{s*0.25:.0f},{s*1.8:.0f} 0,{s*2.6:.0f}" stroke="#E8E4F0" '
         f'stroke-width="4" fill="none" opacity="0.7"/>'
         f'<ellipse rx="{s:.0f}" ry="{s*1.15:.0f}" fill="{c}"/>'
         f'<ellipse cx="{-s*0.3:.0f}" cy="{-s*0.35:.0f}" rx="{s*0.22:.0f}" ry="{s*0.32:.0f}" fill="#FFFFFF" opacity="0.45"/>'
         f'<path d="M{-s*0.16:.0f},{s*1.12:.0f} L0,{s*0.86:.0f} L{s*0.16:.0f},{s*1.12:.0f} Z" fill="{c}"/></g>')
        (rng.uniform(150, 1350), rng.uniform(180, 820), rng.uniform(52, 110),
         BALLOON_COLORS[i % len(BALLOON_COLORS)])
        for i in range(11))
    + f'<path d="M0,1010 Q480,960 960,1000 T1920,990 V1080 H0 Z" fill="#141B3F"/>'
    + "</svg>"
)

svgs["b2"] = head(
    lingrad("night2", [("0", "#2E1E3F"), ("1", "#4A2C55")])
    + radgrad("candleg", [("0", "#FFEDB0", "0.95"), ("1", "#FFB against", "0")]).replace("#FFB against", "#FFBD6B")
) + (
    f'<rect width="{W}" height="{H}" fill="url(#night2)"/>'
    + "".join(f'<circle cx="{rng.uniform(0,W):.0f}" cy="{rng.uniform(80,560):.0f}" '
              f'r="{rng.uniform(14,46):.0f}" fill="#FFD98E" opacity="{rng.uniform(0.08,0.22):.2f}"/>'
              for _ in range(18))
    + f'<circle cx="960" cy="430" r="330" fill="url(#candleg)"/>'
    f'<rect x="0" y="880" width="{W}" height="200" fill="#3A2547"/>'
    f'<ellipse cx="960" cy="884" rx="620" ry="34" fill="#57356B"/>'
    # 3段ケーキ
    f'<g>'
    f'<rect x="660" y="740" width="600" height="150" rx="24" fill="#F7D9E3"/>'
    f'<path d="M660,772 q30,36 60,0 t60,0 t60,0 t60,0 t60,0 t60,0 t60,0 t60,0 t60,0 t60,0" fill="#FFF5F8"/>'
    f'<rect x="740" y="620" width="440" height="130" rx="22" fill="#EFB7CB"/>'
    f'<path d="M740,650 q27,32 55,0 t55,0 t55,0 t55,0 t55,0 t55,0 t55,0 t55,0" fill="#FFF0F5"/>'
    f'<rect x="820" y="510" width="280" height="120" rx="20" fill="#F7D9E3"/>'
    f'</g>'
    # ろうそく×5
    + "".join(
        f'<g transform="translate({x},0)">'
        f'<rect x="-9" y="430" width="18" height="84" rx="8" fill="{c}"/>'
        f'<ellipse cx="0" cy="416" rx="13" ry="20" fill="#FFE9A8"/>'
        f'<ellipse cx="0" cy="420" rx="6" ry="10" fill="#FFB45C"/></g>'
        for x, c in [(870, "#8ED0C8"), (915, "#FFD166"), (960, "#FF8FA3"),
                     (1005, "#B79CED"), (1050, "#6FB6FF")])
    + "".join(f'<rect x="{rng.uniform(0,W):.0f}" y="{rng.uniform(120,860):.0f}" width="12" height="20" '
              f'rx="3" fill="{BALLOON_COLORS[i % 6]}" opacity="0.8" '
              f'transform="rotate({rng.uniform(-40,40):.0f} 960 540)"/>' for i in range(20))
    + "</svg>"
)

svgs["b3"] = head(
    lingrad("night3", [("0", "#0E1A3A"), ("1", "#243B6B")])
) + (
    f'<rect width="{W}" height="{H}" fill="url(#night3)"/>'
    + stars(60, 700)
    + "".join(
        (lambda cx, cy, r, c: "".join(
            f'<line x1="{cx}" y1="{cy}" '
            f'x2="{cx + r * __import__("math").cos(k * 3.14159 / 9):.0f}" '
            f'y2="{cy + r * __import__("math").sin(k * 3.14159 / 9):.0f}" '
            f'stroke="{c}" stroke-width="6" stroke-linecap="round" opacity="0.9"/>' for k in range(18))
            + f'<circle cx="{cx}" cy="{cy}" r="{r*0.12:.0f}" fill="#FFFDF0"/>'
            + "".join(f'<circle cx="{cx + r*1.18*__import__("math").cos((k+0.5)*3.14159/9):.0f}" '
                      f'cy="{cy + r*1.18*__import__("math").sin((k+0.5)*3.14159/9):.0f}" r="7" '
                      f'fill="{c}" opacity="0.8"/>' for k in range(18)))
        (cx, cy, r, c)
        for cx, cy, r, c in [(520, 320, 190, "#FFD166"), (1250, 240, 230, "#FF8FA3"),
                             (1650, 480, 150, "#7BD1C9"), (860, 520, 120, "#B79CED")])
    # 街のシルエット
    + "".join(f'<rect x="{x}" y="{1080-h}" width="{w}" height="{h}" fill="#0A1228"/>'
              for x, w, h in [(0, 190, 240), (200, 150, 330), (360, 220, 200), (590, 170, 380),
                              (770, 210, 260), (990, 160, 420), (1160, 230, 230), (1400, 180, 350),
                              (1590, 160, 260), (1760, 160, 310)])
    + "".join(f'<rect x="{rng.uniform(10,1880):.0f}" y="{rng.uniform(760,1050):.0f}" '
              f'width="12" height="16" fill="#FFE9A8" opacity="{rng.uniform(0.5,0.95):.2f}"/>'
              for _ in range(40))
    + "</svg>"
)

# ============ 記念日 ============
svgs["a1"] = head(
    lingrad("aut", [("0", "#FFE3B3"), ("0.6", "#FFC489"), ("1", "#F0A868")])
) + (
    f'<rect width="{W}" height="{H}" fill="url(#aut)"/>'
    f'<circle cx="480" cy="330" r="120" fill="#FFF4DC"/>'
    f'<path d="M0,900 Q960,830 1920,900 V1080 H0 Z" fill="#B0763F"/>'
    # 紅葉の木
    f'<g><rect x="1330" y="480" width="42" height="430" rx="18" fill="#6B4226"/>'
    f'<circle cx="1250" cy="360" r="150" fill="#E5733F"/>'
    f'<circle cx="1420" cy="290" r="180" fill="#F08C42"/>'
    f'<circle cx="1580" cy="400" r="140" fill="#D9603B"/>'
    f'<circle cx="1440" cy="450" r="120" fill="#E5733F"/></g>'
    # ベンチと2人
    f'<g fill="#54331F">'
    f'<rect x="700" y="800" width="440" height="26" rx="12"/>'
    f'<rect x="700" y="740" width="440" height="20" rx="10"/>'
    f'<rect x="720" y="820" width="24" height="90"/><rect x="1096" y="820" width="24" height="90"/></g>'
    + person(860, 806, 230, "#5A3A28")
    + person(985, 806, 250, "#5A3A28")
    + "".join(f'<ellipse cx="{rng.uniform(0,W):.0f}" cy="{rng.uniform(100,1040):.0f}" rx="14" ry="8" '
              f'fill="{rng.choice(["#E5733F", "#F0A94C", "#D9603B"])}" '
              f'opacity="{rng.uniform(0.6,0.95):.2f}" '
              f'transform="rotate({rng.uniform(0,360):.0f} 960 540)"/>' for _ in range(30))
    + "</svg>"
)

svgs["a2"] = head(
    lingrad("sea_sky", [("0", "#FFC489"), ("0.5", "#FF8F7C"), ("1", "#C96A8C")])
    + lingrad("sea", [("0", "#D9738F"), ("1", "#7A4E8C")])
    + radgrad("sung", [("0", "#FFF6D8", "1"), ("1", "#FFDB9E", "0")])
) + (
    f'<rect width="{W}" height="700" fill="url(#sea_sky)"/>'
    f'<circle cx="960" cy="620" r="300" fill="url(#sung)"/>'
    f'<circle cx="960" cy="640" r="110" fill="#FFF3D0"/>'
    f'<rect y="700" width="{W}" height="380" fill="url(#sea)"/>'
    + "".join(f'<rect x="{960 - w/2 + rng.uniform(-60,60):.0f}" y="{y}" width="{w}" height="7" rx="3.5" '
              f'fill="#FFE9B8" opacity="{op}"/>'
              for y, w, op in [(724, 300, 0.9), (760, 420, 0.7), (800, 260, 0.6),
                               (845, 480, 0.5), (900, 340, 0.4), (960, 520, 0.3)])
    + birds([(510, 240), (640, 190), (1350, 260)], "#8C4A5E")
    + f'<path d="M0,1010 Q660,960 1920,1020 V1080 H0 Z" fill="#5E3B52"/>'
    + person(880, 1020, 260, "#3F2438")
    + person(1000, 1020, 285, "#3F2438")
    + f'<path d="M935,905 Q960,880 985,908" stroke="#3F2438" stroke-width="20" fill="none" stroke-linecap="round"/>'
    + "</svg>"
)

svgs["a3"] = head(
    lingrad("night4", [("0", "#1C2951"), ("1", "#40356E")])
    + radgrad("lant", [("0", "#FFE9A8", "0.95"), ("1", "#FFB45C", "0")])
) + (
    f'<rect width="{W}" height="{H}" fill="url(#night4)"/>'
    + stars(80, 860)
    + "".join(
        (lambda x, y, s: f'<g transform="translate({x},{y})">'
         f'<circle r="{s*1.9:.0f}" fill="url(#lant)"/>'
         f'<path d="M{-s*0.55:.0f},{-s*0.7:.0f} h{s*1.1:.0f} l{-s*0.16:.0f},{s*1.5:.0f} '
         f'h{-s*0.78:.0f} Z" fill="#FFC978"/>'
         f'<rect x="{-s*0.3:.0f}" y="{-s*0.86:.0f}" width="{s*0.6:.0f}" height="{s*0.18:.0f}" fill="#B0763F"/></g>')
        (rng.uniform(120, 1800), rng.uniform(120, 660), rng.uniform(24, 56))
        for _ in range(12))
    + f'<path d="M0,940 Q700,830 1920,930 V1080 H0 Z" fill="#171432"/>'
    + person(900, 972, 250, "#0E0C22")
    + person(1010, 972, 275, "#0E0C22")
    + f'<path d="M952,862 Q980,838 1005,864" stroke="#0E0C22" stroke-width="18" fill="none" stroke-linecap="round"/>'
    + "</svg>"
)

THEMES = {"m": "mothersday", "b": "birthday", "a": "anniversary"}
for key, svg in svgs.items():
    theme_dir = OUT / THEMES[key[0]]
    theme_dir.mkdir(parents=True, exist_ok=True)
    path = theme_dir / f"scene{key[1]}.svg"
    path.write_text(svg, encoding="utf-8")
    print(f"wrote {path}")
